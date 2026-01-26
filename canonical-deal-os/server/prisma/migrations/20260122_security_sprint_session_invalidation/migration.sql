-- P1 Security Sprint - Session Invalidation Migration
--
-- This migration invalidates all existing sessions for security deployment.
-- This forces all users to re-authenticate with the new security measures.
--
-- Security fixes deployed:
-- - T1.1: JWT Secret Validation (64+ byte requirement)
-- - T1.2: Magic Link Authorization (cross-org isolation)
-- - T1.3: IDOR Prevention (authUser from JWT only)
-- - T1.4: Rate Limiting (5 attempts / 15 min)
--
-- Run date: 2026-01-22

-- Step 1: Invalidate all existing sessions
-- Sets revokedAt to current timestamp for all active sessions
UPDATE AuthSession
SET revokedAt = datetime('now')
WHERE revokedAt IS NULL;

-- Step 2: Log the invalidation event in SecurityEvent table
INSERT INTO SecurityEvent (
  id,
  type,
  identifier,
  endpoint,
  allowed,
  metadata,
  timestamp
) VALUES (
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))),2) || '-' ||
  substr('89ab',abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))),2) || '-' ||
  lower(hex(randomblob(6))),
  'DEPLOY_SESSION_INVALIDATION',
  'SYSTEM',
  'migration',
  1,
  json_object(
    'reason', 'P1 Security Sprint deployment',
    'migration', '20260122_security_sprint_session_invalidation',
    'securityFixes', json_array(
      'T1.1 - JWT Secret Validation',
      'T1.2 - Magic Link Authorization',
      'T1.3 - IDOR Prevention',
      'T1.4 - Rate Limiting'
    )
  ),
  datetime('now')
);
