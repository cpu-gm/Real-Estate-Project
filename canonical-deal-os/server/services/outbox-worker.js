/**
 * Outbox Worker Service
 *
 * Implements the Outbox Pattern for reliable side effects.
 * Events are written to the OutboxEvent table within the same transaction
 * as the main operation, then processed asynchronously by this worker.
 *
 * Benefits:
 * - Guaranteed delivery (at-least-once semantics)
 * - Transactional consistency (if main operation rolls back, events are not sent)
 * - Retry with exponential backoff
 * - Dead letter handling for failed events
 *
 * @module services/outbox-worker
 */

import { getPrisma } from '../db.js';
import { sendEmail } from './email-service.js';

/**
 * Event handlers by event type
 */
const HANDLERS = {
  /**
   * Generic email sending
   */
  SEND_EMAIL: async (payload) => {
    await sendEmail(payload);
  },

  /**
   * LP invitation email
   */
  SEND_LP_INVITATION: async (payload) => {
    await sendEmail({
      to: payload.lpEmail,
      subject: `Investment Opportunity: ${payload.dealName}`,
      template: 'lp-invitation',
      data: payload
    });
  },

  /**
   * Capital call notice to LP
   */
  SEND_CAPITAL_CALL_NOTICE: async (payload) => {
    await sendEmail({
      to: payload.lpEmail,
      subject: `Capital Call Notice: ${payload.dealName}`,
      template: 'capital-call-notice',
      data: payload
    });
  },

  /**
   * Distribution notice to LP
   */
  SEND_DISTRIBUTION_NOTICE: async (payload) => {
    await sendEmail({
      to: payload.lpEmail,
      subject: `Distribution Notice: ${payload.dealName}`,
      template: 'distribution-notice',
      data: payload
    });
  },

  /**
   * Trigger n8n webhook
   */
  TRIGGER_WEBHOOK: async (payload) => {
    const response = await fetch(payload.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.headers || {})
      },
      body: JSON.stringify(payload.data)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  },

  /**
   * Send SMS notification
   */
  SEND_SMS: async (payload) => {
    // Import SMS service dynamically to avoid circular dependencies
    const { sendSms } = await import('./sms-service.js');
    await sendSms(payload.to, payload.message);
  }
};

/**
 * Process pending outbox events
 * Run this on a schedule (e.g., every 10 seconds)
 *
 * @param {Object} [options] - Processing options
 * @param {number} [options.batchSize=10] - Max events to process per batch
 * @returns {Promise<Object>} Processing results
 *
 * @example
 * const results = await processOutbox({ batchSize: 20 });
 * console.log(`Processed: ${results.succeeded}, Failed: ${results.failed}`);
 */
export async function processOutbox(options = {}) {
  const prisma = getPrisma();
  const batchSize = options.batchSize || 10;
  const now = new Date();

  // Get pending events ready to process
  const events = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      scheduledFor: { lte: now },
      attempts: { lt: 3 }  // Default max attempts
    },
    orderBy: { scheduledFor: 'asc' },
    take: batchSize
  });

  const results = { processed: 0, succeeded: 0, failed: 0, events: [] };

  for (const event of events) {
    results.processed++;

    // Mark as processing
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', attempts: event.attempts + 1 }
    });

    try {
      const handler = HANDLERS[event.eventType];
      if (!handler) {
        throw new Error(`Unknown event type: ${event.eventType}`);
      }

      const payload = JSON.parse(event.payload);
      await handler(payload);

      // Mark as completed
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', processedAt: new Date() }
      });

      results.succeeded++;
      results.events.push({ id: event.id, status: 'COMPLETED' });
      console.log(`[OUTBOX] Processed ${event.eventType} (${event.id})`);

    } catch (error) {
      // Mark as failed with error
      const isMaxAttempts = event.attempts + 1 >= event.maxAttempts;

      // Exponential backoff for retry
      const backoffMs = Math.pow(2, event.attempts) * 60000;  // 1min, 2min, 4min...
      const nextRetry = new Date(now.getTime() + backoffMs);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: isMaxAttempts ? 'FAILED' : 'PENDING',
          lastError: error.message,
          scheduledFor: isMaxAttempts ? event.scheduledFor : nextRetry
        }
      });

      results.failed++;
      results.events.push({ id: event.id, status: 'FAILED', error: error.message });
      console.error(`[OUTBOX] Failed ${event.eventType} (${event.id}):`, error.message);
    }
  }

  return results;
}

/**
 * Add event to outbox (call within transaction)
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} eventType - Event type (e.g., 'SEND_EMAIL')
 * @param {Object} payload - Event payload
 * @param {Object} [options] - Options
 * @param {number} [options.maxAttempts=3] - Max retry attempts
 * @param {Date} [options.scheduledFor] - When to process (default: now)
 * @returns {Promise<Object>} Created outbox event
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   // Main operation
 *   const capitalCall = await tx.capitalCall.create({ ... });
 *
 *   // Queue notification (transactionally)
 *   await addToOutbox(tx, 'SEND_CAPITAL_CALL_NOTICE', {
 *     lpEmail: 'lp@example.com',
 *     dealName: 'Test Deal',
 *     callAmount: 50000
 *   });
 * });
 */
export async function addToOutbox(tx, eventType, payload, options = {}) {
  return tx.outboxEvent.create({
    data: {
      eventType,
      payload: JSON.stringify(payload),
      status: 'PENDING',
      maxAttempts: options.maxAttempts || 3,
      scheduledFor: options.scheduledFor || new Date()
    }
  });
}

/**
 * Start outbox worker (call on server startup)
 *
 * @param {number} [intervalMs=10000] - Polling interval in milliseconds
 * @returns {Function} Stop function to clear the interval
 *
 * @example
 * const stopWorker = startOutboxWorker(5000);  // Poll every 5 seconds
 * // Later...
 * stopWorker();  // Stop the worker
 */
export function startOutboxWorker(intervalMs = 10000) {
  console.log(`[OUTBOX] Starting worker with ${intervalMs}ms interval`);

  const interval = setInterval(async () => {
    try {
      const results = await processOutbox();
      if (results.processed > 0) {
        console.log(`[OUTBOX] Batch: ${results.succeeded} succeeded, ${results.failed} failed`);
      }
    } catch (error) {
      console.error('[OUTBOX] Worker error:', error);
    }
  }, intervalMs);

  return () => {
    console.log('[OUTBOX] Stopping worker');
    clearInterval(interval);
  };
}

/**
 * Get outbox statistics for monitoring
 *
 * @returns {Promise<Object>} Outbox statistics
 */
export async function getOutboxStats() {
  const prisma = getPrisma();

  const [pending, processing, completed, failed] = await Promise.all([
    prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
    prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
    prisma.outboxEvent.count({ where: { status: 'COMPLETED' } }),
    prisma.outboxEvent.count({ where: { status: 'FAILED' } })
  ]);

  // Get oldest pending event
  const oldestPending = await prisma.outboxEvent.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  });

  return {
    pending,
    processing,
    completed,
    failed,
    total: pending + processing + completed + failed,
    oldestPendingAge: oldestPending
      ? Date.now() - oldestPending.createdAt.getTime()
      : null
  };
}

/**
 * Retry failed events (manual recovery)
 *
 * @param {number} [maxEvents=100] - Max events to retry
 * @returns {Promise<number>} Number of events queued for retry
 */
export async function retryFailedEvents(maxEvents = 100) {
  const prisma = getPrisma();

  const result = await prisma.outboxEvent.updateMany({
    where: { status: 'FAILED' },
    data: {
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      scheduledFor: new Date()
    }
  });

  console.log(`[OUTBOX] Queued ${result.count} failed events for retry`);
  return result.count;
}

/**
 * Purge old completed events (cleanup job)
 *
 * @param {number} [olderThanDays=30] - Delete events older than this
 * @returns {Promise<number>} Number of events deleted
 */
export async function purgeCompletedEvents(olderThanDays = 30) {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.outboxEvent.deleteMany({
    where: {
      status: 'COMPLETED',
      processedAt: { lt: cutoff }
    }
  });

  console.log(`[OUTBOX] Purged ${result.count} completed events older than ${olderThanDays} days`);
  return result.count;
}
