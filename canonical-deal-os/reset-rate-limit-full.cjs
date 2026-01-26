#!/usr/bin/env node
/**
 * One-time script to fully clear rate limiter (for testing only)
 */

const Redis = require('ioredis');

async function main() {
  console.log('🔧 Clearing ALL rate limits from Redis...\n');

  const redis = new Redis('redis://localhost:6379');

  try {
    // Find all rate limit keys
    const keys = await redis.keys('ratelimit:*');

    if (keys.length === 0) {
      console.log('No rate limit keys found.');
    } else {
      console.log(`Found ${keys.length} rate limit keys. Deleting...`);
      for (const key of keys) {
        await redis.del(key);
        console.log(`  ✅ Deleted ${key}`);
      }
    }

    console.log('\n✅ All rate limits cleared! You can now test login.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Redis is not running. Rate limits are stored in memory.');
      console.log('   Try restarting the BFF server to clear in-memory rate limits.');
    }
  } finally {
    await redis.quit();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
