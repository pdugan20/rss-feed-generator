#!/usr/bin/env node

import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL;
  const apiKey = process.env.API_KEY;

  if (!baseUrl || !apiKey) {
    console.error('BASE_URL and API_KEY environment variables are required');
    process.exit(1);
  }

  const refreshUrl = `${baseUrl}/refresh`;

  console.log(`[${new Date().toISOString()}] Railway Cron: Triggering refresh at ${refreshUrl}`);

  try {
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: apiKey,
      },
      body: '{}',
    });

    const body = await response.json();

    if (!response.ok) {
      console.error(
        `[${new Date().toISOString()}] Railway Cron: Refresh failed (${response.status}):`,
        body
      );
      process.exit(1);
    }

    console.log(`[${new Date().toISOString()}] Railway Cron: Refresh completed successfully`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Railway Cron: Fatal error:`, error);
    process.exit(1);
  }
}

main();
