#!/usr/bin/env node

import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import scheduler from '../lib/scheduler';
import scraper from '../lib/scraper';

async function main(): Promise<void> {
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
