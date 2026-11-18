import cache from './cache';
import { feedUrls } from './feeds';
import { refreshFeed } from './feed-refresh';

class Scheduler {
  feeds: string[];

  constructor() {
    this.feeds = [...feedUrls];
  }

  // This method is called by Railway Cron or manual refresh

  async refreshFeeds(): Promise<void> {
    for (const feedUrl of this.feeds) {
      try {
        console.log(`Refreshing feed: ${feedUrl}`);

        // Clear the cache for this feed
        cache.del(`feed:${feedUrl}`);

        const { articleCount } = await refreshFeed(feedUrl);
        console.log(`Successfully refreshed feed: ${feedUrl} (${articleCount} articles)`);
      } catch (error) {
        console.error(`Error refreshing feed ${feedUrl}:`, (error as Error).message);
      }
    }

    console.log('Feed refresh completed');
  }

  // Method to manually add/remove feeds
  addFeed(url: string): void {
    if (!this.feeds.includes(url)) {
      this.feeds.push(url);
      console.log(`Added feed: ${url}`);
    }
  }

  removeFeed(url: string): void {
    const index = this.feeds.indexOf(url);
    if (index > -1) {
      this.feeds.splice(index, 1);
      console.log(`Removed feed: ${url}`);
    }
  }

  getFeeds(): string[] {
    return this.feeds;
  }
}

export = new Scheduler();
