const cache = require('./cache');
const scraper = require('./scraper');

class Scheduler {
  constructor() {
    this.feeds = [
      'https://www.seattletimes.com/sports/washington-huskies-football/',
      'https://www.seattletimes.com/sports/mariners/',
    ];
  }

  // This method is called by Railway Cron or manual refresh

  async refreshFeeds() {
    for (const feedUrl of this.feeds) {
      try {
        console.log(`Refreshing feed: ${feedUrl}`);

        // Clear the cache for this feed
        const cacheKey = `feed:${feedUrl}`;
        cache.del(cacheKey);

        // Pre-fetch the feed to warm the cache
        const { articles, pageTitle } = await scraper.scrapeArticles(feedUrl);

        if (articles && articles.length > 0) {
          // Generate and cache the RSS feed
          const rssGenerator = require('./rss-generator');
          const rssFeed = rssGenerator.generateFeed(feedUrl, articles, pageTitle);
          cache.set(cacheKey, rssFeed);

          console.log(`Successfully refreshed feed: ${feedUrl} (${articles.length} articles)`);
        } else {
          console.log(`No articles found for: ${feedUrl}`);
        }
      } catch (error) {
        console.error(`Error refreshing feed ${feedUrl}:`, error.message);
      }
    }

    console.log('Feed refresh completed');
  }

  // Method to manually add/remove feeds
  addFeed(url) {
    if (!this.feeds.includes(url)) {
      this.feeds.push(url);
      console.log(`Added feed: ${url}`);
    }
  }

  removeFeed(url) {
    const index = this.feeds.indexOf(url);
    if (index > -1) {
      this.feeds.splice(index, 1);
      console.log(`Removed feed: ${url}`);
    }
  }

  getFeeds() {
    return this.feeds;
  }
}

module.exports = new Scheduler();
