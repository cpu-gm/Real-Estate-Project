#!/usr/bin/env node
/**
 * P1 Security Sprint - Deployment Script
 *
 * This script invalidates all existing user sessions as part of the security
 * deployment. This forces all users to re-authenticate with the new security
 * measures in place.
 *
 * IMPORTANT: Run this script AFTER deploying the new code but BEFORE
 * announcing the deployment is complete.
 *
 * Usage:
 *   node scripts/deploy-security-sprint.cjs
 *
 * Environment:
 *   BFF_DB_URL - SQLite database URL (defaults to file:./server/.data/llm-airlock.db)
 */

const { PrismaClient } = require('@prisma/client');

async function invalidateAllSessions() {
  console.log('[DEPLOY] ============================================');
  console.log('[DEPLOY] P1 Security Sprint - Session Invalidation');
  console.log('[DEPLOY] ============================================');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // Step 1: Count active sessions
    const activeSessionCount = await prisma.authSession.count({
      where: { revokedAt: null }
    });

    console.log(`[DEPLOY] Found ${activeSessionCount} active sessions to invalidate`);

    if (activeSessionCount === 0) {
      console.log('[DEPLOY] No active sessions to invalidate. Skipping.');
    } else {
      // Step 2: Invalidate all active sessions
      console.log('[DEPLOY] Invalidating all sessions...');

      const result = await prisma.authSession.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() }
      });

      console.log(`[DEPLOY] Successfully invalidated ${result.count} sessions`);
    }

    // Step 3: Log the security event
    console.log('[DEPLOY] Logging security event...');

    await prisma.securityEvent.create({
      data: {
        type: 'DEPLOY_SESSION_INVALIDATION',
        identifier: 'SYSTEM',
        endpoint: 'deploy-script',
        allowed: true,
        metadata: JSON.stringify({
          reason: 'P1 Security Sprint deployment',
          sessionsInvalidated: activeSessionCount,
          deployedAt: new Date().toISOString(),
          securityFixes: [
            'T1.1 - JWT Secret Validation (64+ byte requirement)',
            'T1.2 - Magic Link Authorization (cross-org isolation)',
            'T1.3 - IDOR Prevention (authUser from JWT only)',
            'T1.4 - Rate Limiting (5 attempts / 15 min)'
          ]
        })
      }
    });

    console.log('[DEPLOY] Security event logged');

    // Step 4: Print summary
    console.log('');
    console.log('[DEPLOY] ============================================');
    console.log('[DEPLOY] Deployment Complete!');
    console.log('[DEPLOY] ============================================');
    console.log('');
    console.log('[DEPLOY] Security fixes deployed:');
    console.log('[DEPLOY]   - T1.1: JWT Secret Validation');
    console.log('[DEPLOY]   - T1.2: Magic Link Authorization');
    console.log('[DEPLOY]   - T1.3: IDOR Prevention');
    console.log('[DEPLOY]   - T1.4: Rate Limiting');
    console.log('');
    console.log(`[DEPLOY] Sessions invalidated: ${activeSessionCount}`);
    console.log('[DEPLOY] All users will need to re-authenticate.');
    console.log('');

  } catch (error) {
    console.error('[DEPLOY] ERROR:', error.message);
    console.error('[DEPLOY] Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  invalidateAllSessions().catch(err => {
    console.error('[DEPLOY] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { invalidateAllSessions };
