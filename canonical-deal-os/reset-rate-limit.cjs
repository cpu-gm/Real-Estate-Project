#!/usr/bin/env node
/**
 * One-time script to reset rate limiter for testing
 */

const { resetRateLimit } = require('./server/services/rate-limiter.js');

async function main() {
  console.log('🔧 Resetting rate limits for testing...\n');

  // Reset for localhost (typical test IP)
  const identifiers = [
    '::1',           // IPv6 localhost
    '127.0.0.1',     // IPv4 localhost
    '::ffff:127.0.0.1' // IPv4-mapped IPv6
  ];

  for (const id of identifiers) {
    await resetRateLimit(id, 'auth:login');
    console.log(`✅ Reset rate limit for ${id}`);
  }

  console.log('\n✅ Rate limits reset! You can now test login.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to reset rate limits:', err);
  process.exit(1);
});
