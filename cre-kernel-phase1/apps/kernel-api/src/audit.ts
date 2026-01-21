import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';

type PrismaClientType = PrismaClient;
type InputJsonValue = Prisma.InputJsonValue;

/**
 * Create an audited Event with SHA-256 hash chain for tamper detection.
 *
 * This function ensures:
 * 1. Monotonic sequence numbers for gap detection
 * 2. Hash chain linking each event to the previous (like blockchain)
 * 3. Consistent audit trail for all deal mutations
 *
 * @param prisma - Prisma client instance
 * @param dealId - UUID of the deal
 * @param type - Event type (e.g., 'DealCreated', 'ActorAdded', 'MaterialUpdated')
 * @param payload - Event-specific data
 * @param actorId - UUID of the actor performing the action (null for system actions)
 * @param authorityContext - Authority rules that permitted this action
 * @param evidenceRefs - Array of artifact IDs that support this event
 */
export async function createAuditEvent(
  prisma: PrismaClientType,
  dealId: string,
  type: string,
  payload: Record<string, unknown>,
  actorId: string | null,
  authorityContext: Record<string, unknown> = {},
  evidenceRefs: string[] = []
) {
  // Get previous event for hash chain continuity
  const previousEvent = await prisma.event.findFirst({
    where: { dealId },
    orderBy: [{ sequenceNumber: 'desc' }, { createdAt: 'desc' }],
    select: { sequenceNumber: true, eventHash: true }
  });

  const sequenceNumber = (previousEvent?.sequenceNumber ?? 0) + 1;
  const previousHash = previousEvent?.eventHash || null;

  // Calculate SHA-256 hash of this event
  // Including previousHash creates the chain
  const hashPayload = JSON.stringify({
    dealId,
    sequenceNumber,
    type,
    payload,
    previousHash,
    timestamp: new Date().toISOString()
  });
  const eventHash = createHash('sha256').update(hashPayload).digest('hex');

  return prisma.event.create({
    data: {
      dealId,
      type,
      payload: payload as InputJsonValue,
      actorId,
      authorityContext: authorityContext as InputJsonValue,
      evidenceRefs,
      sequenceNumber,
      previousEventHash: previousHash,
      eventHash
    }
  });
}

/**
 * Verify the hash chain integrity for a deal's events.
 *
 * This can be used during audits to detect:
 * 1. Modified events (hash won't match)
 * 2. Deleted events (sequence gaps)
 * 3. Inserted events (chain breaks)
 *
 * @param prisma - Prisma client instance
 * @param dealId - UUID of the deal to verify
 * @returns Verification result with any detected issues
 */
export async function verifyEventChain(
  prisma: PrismaClientType,
  dealId: string
): Promise<{
  valid: boolean;
  totalEvents: number;
  issues: Array<{
    eventId: string;
    sequenceNumber: number;
    issue: string;
  }>;
}> {
  const events = await prisma.event.findMany({
    where: { dealId },
    orderBy: { sequenceNumber: 'asc' },
    select: {
      id: true,
      sequenceNumber: true,
      type: true,
      payload: true,
      previousEventHash: true,
      eventHash: true,
      createdAt: true
    }
  });

  const issues: Array<{
    eventId: string;
    sequenceNumber: number;
    issue: string;
  }> = [];

  let expectedSequence = 1;
  let expectedPreviousHash: string | null = null;

  for (const event of events) {
    // Check sequence continuity
    if (event.sequenceNumber !== expectedSequence) {
      issues.push({
        eventId: event.id,
        sequenceNumber: event.sequenceNumber,
        issue: `Sequence gap: expected ${expectedSequence}, found ${event.sequenceNumber}`
      });
    }

    // Check previous hash linkage
    if (event.previousEventHash !== expectedPreviousHash) {
      issues.push({
        eventId: event.id,
        sequenceNumber: event.sequenceNumber,
        issue: `Chain break: previousEventHash doesn't match previous event's hash`
      });
    }

    // Move to next expected values
    expectedSequence = event.sequenceNumber + 1;
    expectedPreviousHash = event.eventHash;
  }

  return {
    valid: issues.length === 0,
    totalEvents: events.length,
    issues
  };
}
