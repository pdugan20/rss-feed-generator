import cache from './cache';
import scraper from './scraper';
import rssGenerator from './rss-generator';
import { feedUrls } from './feeds';
import { enrichArticles } from './enricher';

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
        const cacheKey = `feed:${feedUrl}`;
        cache.del(cacheKey);

        // Pre-fetch the feed to warm the cache
        const { articles, pageTitle } = await scraper.scrapeArticles(feedUrl);

        if (articles && articles.length > 0) {
          await enrichArticles(feedUrl, articles);
          const rssFeed = rssGenerator.generateFeed(feedUrl, articles, pageTitle);
          cache.set(cacheKey, rssFeed);

          console.log(`Successfully refreshed feed: ${feedUrl} (${articles.length} articles)`);
        } else {
          console.log(`No articles found for: ${feedUrl}`);
        }
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
