const RSS = require('rss');

class RSSGenerator {
  generateFeed(sourceUrl, articles, pageTitle) {
    const siteUrl = new URL(sourceUrl);
    const siteName = this.extractSiteName(siteUrl);

    const feed = new RSS({
      title: pageTitle || siteName,
      description: `Auto-generated RSS feed from ${siteUrl.hostname}`,
      feed_url: `${process.env.BASE_URL || 'http://localhost:3000'}/feed?url=${encodeURIComponent(sourceUrl)}`,
      site_url: sourceUrl,
      image_url: this.findFavicon(articles),
      docs: 'https://validator.w3.org/feed/docs/rss2.html',
      managingEditor: 'RSS Feed Generator',
      webMaster: 'RSS Feed Generator',
      copyright: `${new Date().getFullYear()} ${siteName}`,
      language: 'en',
      categories: this.extractCategories(sourceUrl),
      pubDate: new Date(),
      ttl: '1440', // 24 hours in minutes
      generator: 'RSS Feed Generator Service',
    });

    articles.forEach((article) => {
      const item = {
        title: article.title,
        description: article.description || article.title,
        url: article.link,
        guid: article.guid || article.link,
        date: article.pubDate || new Date(),
      };

      if (article.imageUrl) {
        item.enclosure = {
          url: article.imageUrl,
          type: 'image/jpeg',
        };

        item.custom_elements = [
          {
            'media:content': {
              _attr: {
                url: article.imageUrl,
                medium: 'image',
              },
            },
          },
        ];
      }

      if (article.author) {
        item.author = article.author;
      }

      if (article.categories && article.categories.length > 0) {
        item.categories = article.categories;
      }

      feed.item(item);
    });

    return feed.xml({ indent: true });
  }

  extractSiteName(url) {
    const hostname = url.hostname;

    const parts = hostname.split('.');
    if (parts.length > 2) {
      parts.shift();
    }

    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  findFavicon(articles) {
    for (const article of articles) {
      if (article.imageUrl) {
        return article.imageUrl;
      }
    }
    return null;
  }

  extractCategories(url) {
    const path = new URL(url).pathname;
    const segments = path.split('/').filter((s) => s.length > 0);

    return segments.map((segment) => {
      return segment
        .replace(/-/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    });
  }
}

module.exports = new RSSGenerator();
