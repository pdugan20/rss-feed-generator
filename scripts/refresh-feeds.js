#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const scheduler = require('../lib/scheduler');
const scraper = require('../lib/scraper');

async function main() {
  console.log(`[${new Date().toISOString()}] Railway Cron: Starting scheduled feed refresh...`);

  try {
    // Use the existing scheduler's refresh method
    await scheduler.refreshFeeds();

    // Close the scraper browser
    await scraper.close();

    console.log(`[${new Date().toISOString()}] Railway Cron: Feed refresh completed successfully`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Railway Cron: Fatal error during refresh:`, error);
    process.exit(1);
  }
}

main();
