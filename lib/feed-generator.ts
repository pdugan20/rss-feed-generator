import type { Article, FeedFormat, GeneratedFeeds } from './types';

class FeedGenerator {
  async generateFeeds(
    sourceUrl: string,
    articles: Article[],
    pageTitle: string
  ): Promise<GeneratedFeeds> {
    const { Feed } = await import('feed');

    const siteUrl = new URL(sourceUrl);
    const siteName = this.extractSiteName(siteUrl);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const feedUrlBase = `${baseUrl}/feed?url=${encodeURIComponent(sourceUrl)}`;

    const feed = new Feed({
      title: pageTitle || siteName,
      description: `Auto-generated feed from ${siteUrl.hostname}`,
      id: sourceUrl,
      link: sourceUrl,
      language: 'en',
      image: this.findFavicon(articles),
      copyright: `${new Date().getFullYear()} ${siteName}`,
      updated: new Date(),
      generator: 'RSS Feed Generator Service',
      feedLinks: {
        rss: feedUrlBase,
        atom: `${feedUrlBase}&format=atom`,
        json: `${feedUrlBase}&format=json`,
      },
    });

    let hasReadingTime = false;

    articles.forEach((article) => {
      const item: Parameters<typeof feed.addItem>[0] = {
        title: article.title,
        id: article.guid || article.link,
        link: article.link,
        description: article.description || article.title,
        date: article.pubDate || new Date(),
      };

      if (article.imageUrl) {
        item.image = article.imageUrl;
      }

      if (article.categories?.length) {
        item.category = article.categories.map((name) => ({ name }));
      }

      if (article.readingTime) {
        hasReadingTime = true;
        item.extensions = [
          { name: 'cn:readingTime', objects: { _text: String(article.readingTime) } },
        ];
      }

      feed.addItem(item);
    });

    let rss = feed.rss2();
    if (hasReadingTime) {
      rss = rss.replace(
        'version="2.0"',
        'version="2.0" xmlns:cn="https://claudenotes.co/rss-extensions"'
      );
    }

    let json = feed.json1();
    if (hasReadingTime) {
      const parsed = JSON.parse(json);
      for (const item of parsed.items) {
        if (item['cn:readingTime']) {
          if (!item._cn) item._cn = {};
          item._cn.readingTime = Number(item['cn:readingTime']._text);
          delete item['cn:readingTime'];
        }
      }
      json = JSON.stringify(parsed, null, 4);
    }

    return {
      rss,
      atom: feed.atom1(),
      json,
    };
  }

  extractSiteName(url: URL): string {
    const hostname = url.hostname;

    const parts = hostname.split('.');
    if (parts.length > 2) {
      parts.shift();
    }

    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  findFavicon(articles: Article[]): string | undefined {
    for (const article of articles) {
      if (article.imageUrl) {
        return article.imageUrl;
      }
    }
    return undefined;
  }

  extractCategories(url: string): string[] {
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

  getContentType(format: FeedFormat): string {
    switch (format) {
      case 'atom':
        return 'application/atom+xml; charset=utf-8';
      case 'json':
        return 'application/feed+json; charset=utf-8';
      default:
        return 'application/rss+xml; charset=utf-8';
    }
  }
}

export = new FeedGenerator();
