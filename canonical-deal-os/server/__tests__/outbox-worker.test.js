/**
 * P1 Data Integrity Sprint - Outbox Worker Tests
 *
 * Tests for Task 9: Outbox Pattern for Reliable Side Effects
 * - addToOutbox() transactional event creation
 * - processOutbox() with retry and backoff
 * - Event handlers
 */

import { jest } from '@jest/globals';

// Mock email service
const mockSendEmail = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('../services/email-service.js', () => ({
  sendEmail: mockSendEmail
}));

// Mock prisma
const mockOutboxEvents = [];
const mockPrisma = {
  outboxEvent: {
    findMany: jest.fn().mockImplementation(({ where, take }) => {
      return mockOutboxEvents.filter(e => {
        if (where.status?.in && !where.status.in.includes(e.status)) return false;
        if (where.scheduledFor?.lte && e.scheduledFor > where.scheduledFor.lte) return false;
        if (where.attempts?.lt && e.attempts >= where.attempts.lt) return false;
        return true;
      }).slice(0, take || 10);
    }),
    create: jest.fn().mockImplementation(({ data }) => {
      const event = {
        id: `event-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockOutboxEvents.push(event);
      return event;
    }),
    update: jest.fn().mockImplementation(({ where, data }) => {
      const event = mockOutboxEvents.find(e => e.id === where.id);
      if (event) {
        Object.assign(event, data, { updatedAt: new Date() });
      }
      return event;
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null)
  }
};

jest.unstable_mockModule('../db.js', () => ({
  getPrisma: () => mockPrisma
}));

// Import after mocking
const {
  processOutbox,
  addToOutbox,
  getOutboxStats,
  retryFailedEvents
} = await import('../services/outbox-worker.js');

describe('Task 9: Outbox Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutboxEvents.length = 0;
    mockSendEmail.mockResolvedValue({ success: true });
  });

  describe('addToOutbox', () => {
    it('creates pending outbox event', async () => {
      // Simulate transaction
      const tx = mockPrisma;

      const event = await addToOutbox(tx, 'SEND_EMAIL', {
        to: 'test@example.com',
        subject: 'Test'
      });

      expect(event).toBeDefined();
      expect(event.eventType).toBe('SEND_EMAIL');
      expect(event.status).toBe('PENDING');
      expect(JSON.parse(event.payload)).toEqual({
        to: 'test@example.com',
        subject: 'Test'
      });
    });

    it('accepts custom maxAttempts', async () => {
      const tx = mockPrisma;

      const event = await addToOutbox(tx, 'SEND_EMAIL', { to: 'test@example.com' }, {
        maxAttempts: 5
      });

      expect(event.maxAttempts).toBe(5);
    });

    it('accepts scheduled time', async () => {
      const tx = mockPrisma;
      const futureDate = new Date(Date.now() + 60000);

      const event = await addToOutbox(tx, 'SEND_EMAIL', { to: 'test@example.com' }, {
        scheduledFor: futureDate
      });

      expect(event.scheduledFor).toEqual(futureDate);
    });
  });

  describe('processOutbox', () => {
    it('processes pending events', async () => {
      // Add a pending event
      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_EMAIL',
        payload: JSON.stringify({ to: 'test@example.com', subject: 'Test' }),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),  // Past
        createdAt: new Date()
      });

      const results = await processOutbox();

      expect(results.processed).toBe(1);
      expect(results.succeeded).toBe(1);
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test'
      });

      // Event should be marked completed
      const event = mockOutboxEvents[0];
      expect(event.status).toBe('COMPLETED');
    });

    it('retries failed events with exponential backoff', async () => {
      mockSendEmail.mockRejectedValue(new Error('SMTP error'));

      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_EMAIL',
        payload: JSON.stringify({ to: 'test@example.com' }),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),
        createdAt: new Date()
      });

      await processOutbox();

      const event = mockOutboxEvents[0];
      expect(event.status).toBe('PENDING');  // Still pending for retry
      expect(event.attempts).toBe(1);
      expect(event.lastError).toContain('SMTP error');
      expect(event.scheduledFor.getTime()).toBeGreaterThan(Date.now());  // Backed off
    });

    it('marks as FAILED after max attempts', async () => {
      mockSendEmail.mockRejectedValue(new Error('Permanent failure'));

      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_EMAIL',
        payload: JSON.stringify({ to: 'test@example.com' }),
        status: 'PENDING',
        attempts: 2,  // Already tried twice
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),
        createdAt: new Date()
      });

      await processOutbox();

      const event = mockOutboxEvents[0];
      expect(event.status).toBe('FAILED');
      expect(event.attempts).toBe(3);
    });

    it('respects scheduledFor date', async () => {
      // Event scheduled for future
      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_EMAIL',
        payload: JSON.stringify({ to: 'test@example.com' }),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() + 60000),  // 1 minute in future
        createdAt: new Date()
      });

      const results = await processOutbox();

      expect(results.processed).toBe(0);  // Not processed yet
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('processes multiple events in batch', async () => {
      for (let i = 0; i < 5; i++) {
        mockOutboxEvents.push({
          id: `event-${i}`,
          eventType: 'SEND_EMAIL',
          payload: JSON.stringify({ to: `test${i}@example.com` }),
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 3,
          scheduledFor: new Date(Date.now() - 1000),
          createdAt: new Date()
        });
      }

      const results = await processOutbox({ batchSize: 10 });

      expect(results.processed).toBe(5);
      expect(results.succeeded).toBe(5);
    });

    it('handles unknown event type', async () => {
      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'UNKNOWN_TYPE',
        payload: JSON.stringify({}),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),
        createdAt: new Date()
      });

      await processOutbox();

      const event = mockOutboxEvents[0];
      expect(event.lastError).toContain('Unknown event type');
    });
  });

  describe('event handlers', () => {
    it('SEND_CAPITAL_CALL_NOTICE sends email with correct template', async () => {
      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_CAPITAL_CALL_NOTICE',
        payload: JSON.stringify({
          lpEmail: 'lp@example.com',
          dealName: 'Test Deal',
          callAmount: 50000
        }),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),
        createdAt: new Date()
      });

      await processOutbox();

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'lp@example.com',
        subject: 'Capital Call Notice: Test Deal',
        template: 'capital-call-notice',
        data: {
          lpEmail: 'lp@example.com',
          dealName: 'Test Deal',
          callAmount: 50000
        }
      });
    });

    it('SEND_DISTRIBUTION_NOTICE sends email with correct template', async () => {
      mockOutboxEvents.push({
        id: 'event-1',
        eventType: 'SEND_DISTRIBUTION_NOTICE',
        payload: JSON.stringify({
          lpEmail: 'lp@example.com',
          dealName: 'Test Deal',
          amount: 10000
        }),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() - 1000),
        createdAt: new Date()
      });

      await processOutbox();

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'lp@example.com',
        subject: 'Distribution Notice: Test Deal',
        template: 'distribution-notice',
        data: {
          lpEmail: 'lp@example.com',
          dealName: 'Test Deal',
          amount: 10000
        }
      });
    });
  });

  describe('getOutboxStats', () => {
    it('returns correct statistics', async () => {
      mockPrisma.outboxEvent.count
        .mockResolvedValueOnce(5)   // pending
        .mockResolvedValueOnce(1)   // processing
        .mockResolvedValueOnce(100) // completed
        .mockResolvedValueOnce(2);  // failed

      const stats = await getOutboxStats();

      expect(stats.pending).toBe(5);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(100);
      expect(stats.failed).toBe(2);
      expect(stats.total).toBe(108);
    });
  });

  describe('retryFailedEvents', () => {
    it('resets failed events to pending', async () => {
      mockPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 3 });

      const count = await retryFailedEvents();

      expect(count).toBe(3);
      expect(mockPrisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { status: 'FAILED' },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          scheduledFor: expect.any(Date)
        }
      });
    });
  });
});
