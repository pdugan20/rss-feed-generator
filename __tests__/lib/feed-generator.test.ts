import feedGenerator from '../../lib/feed-generator';
import type { Article } from '../../lib/types';

// Mock the ESM-only feed package
jest.mock('feed', () => {
  class MockFeed {
    options: Record<string, unknown>;
    items: Record<string, unknown>[];

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.items = [];
    }

    addItem(item: Record<string, unknown>) {
      this.items.push(item);
    }

    rss2() {
      const items = this.items
        .map((item) => {
          let xml =
            `<item><title><![CDATA[${item.title}]]></title>` +
            `<link>${item.link}</link>` +
            `<guid isPermaLink="false">${item.id}</guid>` +
            `<description><![CDATA[${item.description}]]></description>`;
          if (item.image) xml += `<enclosure url="${item.image}" length="0" type="image/jpg"/>`;
          if (Array.isArray(item.category)) {
            for (const cat of item.category as { name: string }[]) {
              xml += `<category>${cat.name}</category>`;
            }
          }
          if (Array.isArray(item.extensions)) {
            for (const ext of item.extensions as {
              name: string;
              objects: Record<string, unknown>;
            }[]) {
              xml += `<${ext.name}>${(ext.objects as { _text: string })._text}</${ext.name}>`;
            }
          }
          xml += `</item>`;
          return xml;
        })
        .join('\n');
      return (
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<rss version="2.0"><channel>` +
        `<title>${this.options.title}</title>` +
        `<link>${this.options.link}</link>` +
        `<language>${this.options.language}</language>` +
        items +
        `</channel></rss>`
      );
    }

    atom1() {
      const entries = this.items
        .map(
          (item) =>
            `<entry><title type="html"><![CDATA[${item.title}]]></title>` +
            `<id>${item.id}</id>` +
            `<link href="${item.link}"/>` +
            `<summary type="html"><![CDATA[${item.description}]]></summary>` +
            `</entry>`
        )
        .join('\n');
      const links = this.options.feedLinks as Record<string, string>;
      return (
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<feed xmlns="http://www.w3.org/2005/Atom">` +
        `<title>${this.options.title}</title>` +
        (links?.atom ? `<link rel="self" href="${links.atom}" type="application/atom+xml"/>` : '') +
        entries +
        `</feed>`
      );
    }

    json1() {
      const links = this.options.feedLinks as Record<string, string>;
      return JSON.stringify({
        version: 'https://jsonfeed.org/version/1',
        title: this.options.title,
        feed_url: links?.json,
        items: this.items.map((item) => {
          const jsonItem: Record<string, unknown> = {
            id: item.id,
            title: item.title,
            url: item.link,
            content_html: item.description,
            image: item.image || undefined,
          };
          if (Array.isArray(item.category)) {
            jsonItem.tags = (item.category as { name: string }[]).map((c) => c.name);
          }
          if (Array.isArray(item.extensions)) {
            for (const ext of item.extensions as {
              name: string;
              objects: Record<string, unknown>;
            }[]) {
              jsonItem[ext.name] = ext.objects;
            }
          }
          return jsonItem;
        }),
      });
    }
  }

  return { Feed: MockFeed };
});

const MARINERS_URL = 'https://www.seattletimes.com/sports/mariners/';

const mockArticles: Article[] = [
  {
    title: 'Mariners Win Big Game',
    link: 'https://www.seattletimes.com/sports/mariners/mariners-win-big/',
    description: 'The Seattle Mariners won a big game today.',
    pubDate: new Date('2025-06-15T10:00:00Z'),
    imageUrl: 'https://example.com/mariners.jpg',
    guid: 'https://www.seattletimes.com/sports/mariners/mariners-win-big/',
  },
  {
    title: 'Trade Deadline Approaches',
    link: 'https://www.seattletimes.com/sports/mariners/trade-deadline/',
    description: 'The trade deadline is fast approaching.',
    pubDate: new Date('2025-06-14T10:00:00Z'),
    imageUrl: null,
    guid: 'https://www.seattletimes.com/sports/mariners/trade-deadline/',
  },
];

describe('FeedGenerator', () => {
  describe('generateFeeds', () => {
    test('returns all three feed formats', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Mariners News');
      expect(result).toHaveProperty('rss');
      expect(result).toHaveProperty('atom');
      expect(result).toHaveProperty('json');
    });

    test('RSS output is valid XML with rss root element', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Mariners News');
      expect(result.rss).toContain('<?xml');
      expect(result.rss).toContain('<rss');
      expect(result.rss).toContain('</rss>');
    });

    test('RSS output uses pageTitle as feed title', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Mariners News');
      expect(result.rss).toContain('Mariners News');
    });

    test('RSS output contains all articles as items', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      const itemCount = (result.rss.match(/<item>/g) || []).length;
      expect(itemCount).toBe(2);
    });

    test('RSS output includes article titles', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      expect(result.rss).toContain('Mariners Win Big Game');
      expect(result.rss).toContain('Trade Deadline Approaches');
    });

    test('RSS output includes enclosure for articles with images', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      expect(result.rss).toContain('<enclosure');
      expect(result.rss).toContain('https://example.com/mariners.jpg');
    });

    test('RSS output has no enclosure for articles without images', async () => {
      const noImages: Article[] = [
        {
          title: 'No Image Article',
          link: 'https://example.com/no-image',
          description: 'No image here',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/no-image',
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, noImages, 'Test');
      expect(result.rss).not.toContain('<enclosure');
    });

    test('Atom output is valid XML with feed root element', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      expect(result.atom).toContain('<?xml');
      expect(result.atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
      expect(result.atom).toContain('</feed>');
    });

    test('Atom output contains entries', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      const entryCount = (result.atom.match(/<entry>/g) || []).length;
      expect(entryCount).toBe(2);
    });

    test('JSON Feed output is valid JSON', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      const parsed = JSON.parse(result.json);
      expect(parsed.version).toContain('jsonfeed.org');
      expect(parsed.title).toBe('Test Feed');
      expect(parsed.items).toHaveLength(2);
    });

    test('JSON Feed includes image for articles with images', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      const parsed = JSON.parse(result.json);
      expect(parsed.items[0].image).toBe('https://example.com/mariners.jpg');
    });

    test('all formats include feed links for format discovery', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test Feed');
      expect(result.atom).toContain('format=atom');
      const parsed = JSON.parse(result.json);
      expect(parsed.feed_url).toContain('format=json');
    });

    test('RSS output includes category elements for articles with categories', async () => {
      const articles: Article[] = [
        {
          title: 'Categorized Article',
          link: 'https://example.com/categorized',
          description: 'Has categories',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/categorized',
          categories: ['Research', 'Engineering'],
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      expect(result.rss).toContain('<category>Research</category>');
      expect(result.rss).toContain('<category>Engineering</category>');
    });

    test('RSS output includes cn:readingTime extension', async () => {
      const articles: Article[] = [
        {
          title: 'Article With Reading Time',
          link: 'https://example.com/reading-time',
          description: 'Has reading time',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/reading-time',
          readingTime: 5,
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      expect(result.rss).toContain('<cn:readingTime>5</cn:readingTime>');
    });

    test('RSS output includes xmlns:cn when articles have readingTime', async () => {
      const articles: Article[] = [
        {
          title: 'Article With Reading Time',
          link: 'https://example.com/reading-time',
          description: 'Has reading time',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/reading-time',
          readingTime: 5,
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      expect(result.rss).toContain('xmlns:cn="https://claudenotes.co/rss-extensions"');
    });

    test('RSS output omits xmlns:cn when no articles have readingTime', async () => {
      const result = await feedGenerator.generateFeeds(MARINERS_URL, mockArticles, 'Test');
      expect(result.rss).not.toContain('xmlns:cn');
    });

    test('JSON output uses _cn extension format for readingTime', async () => {
      const articles: Article[] = [
        {
          title: 'Article With Reading Time',
          link: 'https://example.com/reading-time',
          description: 'Has reading time',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/reading-time',
          readingTime: 5,
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      const parsed = JSON.parse(result.json);
      expect(parsed.items[0]._cn).toEqual({ readingTime: 5 });
      expect(parsed.items[0]['cn:readingTime']).toBeUndefined();
    });

    test('JSON output includes tags for articles with categories', async () => {
      const articles: Article[] = [
        {
          title: 'Categorized Article',
          link: 'https://example.com/categorized',
          description: 'Has categories',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/categorized',
          categories: ['Research'],
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      const parsed = JSON.parse(result.json);
      expect(parsed.items[0].tags).toEqual(['Research']);
    });

    test('uses description as fallback when description is empty', async () => {
      const articles: Article[] = [
        {
          title: 'Fallback Title',
          link: 'https://example.com/fallback',
          description: '',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/fallback',
        },
      ];
      const result = await feedGenerator.generateFeeds(MARINERS_URL, articles, 'Test');
      expect(result.rss).toContain('Fallback Title');
    });
  });

  describe('extractSiteName', () => {
    test('extracts name from www subdomain', () => {
      const url = new URL('https://www.seattletimes.com/sports/');
      expect(feedGenerator.extractSiteName(url)).toBe('Seattletimes');
    });

    test('extracts name from bare domain', () => {
      const url = new URL('https://example.com/path');
      expect(feedGenerator.extractSiteName(url)).toBe('Example');
    });
  });

  describe('extractCategories', () => {
    test('splits URL path into capitalized words', () => {
      const categories = feedGenerator.extractCategories(MARINERS_URL);
      expect(categories).toContain('Sports');
      expect(categories).toContain('Mariners');
    });

    test('handles hyphenated path segments', () => {
      const categories = feedGenerator.extractCategories(
        'https://www.seattletimes.com/sports/washington-huskies-football/'
      );
      expect(categories).toContain('Washington Huskies Football');
    });
  });

  describe('findFavicon', () => {
    test('returns first article image', () => {
      expect(feedGenerator.findFavicon(mockArticles)).toBe('https://example.com/mariners.jpg');
    });

    test('returns undefined when no articles have images', () => {
      const noImages: Partial<Article>[] = [{ title: 'Test', imageUrl: null }];
      expect(feedGenerator.findFavicon(noImages as Article[])).toBeUndefined();
    });

    test('returns undefined for empty array', () => {
      expect(feedGenerator.findFavicon([])).toBeUndefined();
    });
  });

  describe('getContentType', () => {
    test('returns RSS content type for rss format', () => {
      expect(feedGenerator.getContentType('rss')).toBe('application/rss+xml; charset=utf-8');
    });

    test('returns Atom content type for atom format', () => {
      expect(feedGenerator.getContentType('atom')).toBe('application/atom+xml; charset=utf-8');
    });

    test('returns JSON Feed content type for json format', () => {
      expect(feedGenerator.getContentType('json')).toBe('application/feed+json; charset=utf-8');
    });
  });
});
