const cron = require('node-cron');
const cache = require('./cache');
const scraper = require('./scraper');

class Scheduler {
  constructor() {
    this.feeds = [
      'https://www.seattletimes.com/sports/washington-huskies-football/',
      'https://www.seattletimes.com/sports/mariners/'
    ];
  }

  start() {
    // Schedule refresh at 6 AM PST every day
    // PST is UTC-8, so 6 AM PST = 2 PM UTC (14:00)
    // PDT is UTC-7, so 6 AM PDT = 1 PM UTC (13:00)
    // Using 14:00 UTC for PST (adjust for daylight saving if needed)
    cron.schedule('0 14 * * *', async () => {
      console.log('Starting scheduled feed refresh at 6 AM PST...');
      await this.refreshFeeds();
    }, {
      timezone: "America/Los_Angeles" // Automatically handles PST/PDT
    });

    console.log('Scheduler started - feeds will refresh daily at 6 AM PST');
    
    // Optional: Refresh feeds on startup
    this.refreshFeeds();
  }

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