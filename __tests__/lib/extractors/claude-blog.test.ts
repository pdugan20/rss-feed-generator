import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/claude-blog';

const BASE_URL = 'https://claude.com/blog';
const C = 'ResourceCard-module-scss-module__q33Tuq';

function card(href: string, date: string, title: string, excerpt?: string, tags: string[] = []) {
  return `<a href="${href}" class="${C}__card">
    <div class="${C}__header text-caption"><span class="${C}__type"><svg></svg>Article</span><span class="${C}__meta">${date}</span></div>
    <div class="${C}__content"><div class="${C}__body">
      <h3 class="${C}__title text-headline-6-serif">${title}</h3>
      ${excerpt ? `<p class="${C}__excerpt text-body-3">${excerpt}</p>` : ''}
      <div class="${C}__products">${tags.map((t) => `<span class="${C}__productTag"><span class="${C}__markupIcon"></span>${t}</span>`).join('')}</div>
    </div></div>
  </a>`;
}

// Trimmed from claude.com/resources/articles: a featured card repeats a listed
// post, one card links out to claude.dev, and filter tabs share the prefix.
const SAMPLE_HTML = `
<html><body>
  <nav><a href="/resources/articles">Articles</a><a href="/resources/guides">Guides</a></nav>
  <div class="${C}__cardWrapper">${card('/resources/articles/claude-meetings', 'Nov 12, 2026', 'Introducing Claude Meetings', 'Add Claude to your video call.', ['Claude'])}</div>
  ${card('https://claude.dev/blog/chaos-loop-claude-docs-launch/', 'Nov 17, 2026', 'Using a "chaos loop" to harden the Claude Docs launch', 'How Claude spent two weeks load testing.', ['Claude Code', 'Claude Code'])}
  ${card('/resources/articles/building-always-on-agents', 'Nov 13, 2026', 'Building always-on agents', 'Always-on agents run indefinitely.', ['Claude Platform'])}
  ${card('/resources/articles/claude-meetings', 'Nov 12, 2026', 'Introducing Claude Meetings', 'Add Claude to your video call.', ['Claude'])}
  ${card('/resources/articles/linked-billing-on-claude-platform', 'Nov 17, 2026', 'Linked billing on the Claude Platform')}
</body></html>
`;

describe('claude-blog extractor', () => {
  test('extracts each resource card once', () => {
    const articles = extract(cheerio.load(SAMPLE_HTML), BASE_URL);
    expect(articles.map((a) => a.link)).toEqual([
      'https://claude.com/resources/articles/claude-meetings',
      'https://claude.dev/blog/chaos-loop-claude-docs-launch/',
      'https://claude.com/resources/articles/building-always-on-agents',
      'https://claude.com/resources/articles/linked-billing-on-claude-platform',
    ]);
  });

  test('maps title, excerpt, date and product tags', () => {
    const articles = extract(cheerio.load(SAMPLE_HTML), BASE_URL);
    expect(articles[1]).toMatchObject({
      title: 'Using a "chaos loop" to harden the Claude Docs launch',
      description: 'How Claude spent two weeks load testing.',
      pubDate: new Date('Nov 17, 2026'),
      guid: 'https://claude.dev/blog/chaos-loop-claude-docs-launch/',
      categories: ['Claude Code'],
    });
  });

  test('allows cards without an excerpt, tags or image', () => {
    const article = extract(cheerio.load(SAMPLE_HTML), BASE_URL)[3];
    expect(article).toMatchObject({ description: '', imageUrl: null, categories: undefined });
  });

  test('ignores wrappers and navigation links', () => {
    const links = extract(cheerio.load(SAMPLE_HTML), BASE_URL).map((a) => a.link);
    expect(links).not.toContain('https://claude.com/resources/guides');
  });

  test('caps at 20 articles', () => {
    const html = Array.from({ length: 25 }, (_, i) =>
      card(`/resources/articles/post-${i}`, 'Nov 1, 2026', `Post ${i}`)
    ).join('');
    expect(extract(cheerio.load(html), BASE_URL)).toHaveLength(20);
  });

  test('returns no articles for the retired Webflow blog layout', () => {
    const html =
      '<div class="blog_cms_item"><a href="/blog/old-post"><h3 class="card_blog_title">An old blog post</h3></a></div>';
    expect(extract(cheerio.load(html), BASE_URL)).toEqual([]);
  });
});

describe('claude-blog enrichArticle', () => {
  test('extracts description from meta name tag', () => {
    const html = `
      <html><head>
        <meta name="description" content="A meta description about the blog post.">
      </head><body><p>Body text</p></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description).toBe('A meta description about the blog post.');
  });

  test('extracts description from og:description tag', () => {
    const html = `
      <html><head>
        <meta property="og:description" content="An OG description for sharing.">
      </head><body><p>Body text</p></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description).toBe('An OG description for sharing.');
  });

  test('prefers meta name over og:description', () => {
    const html = `
      <html><head>
        <meta name="description" content="Meta desc">
        <meta property="og:description" content="OG desc">
      </head><body></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description).toBe('Meta desc');
  });

  test('falls back to first paragraph', () => {
    const html = `
      <html><head></head><body>
        <article><p>This is the first paragraph of the article.</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description).toBe('This is the first paragraph of the article.');
  });

  test('returns undefined description for empty page', () => {
    const html = '<html><head></head><body></body></html>';
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description).toBeUndefined();
  });

  test('truncates long descriptions to 500 characters', () => {
    const longDesc = 'A'.repeat(600);
    const html = `
      <html><head>
        <meta name="description" content="${longDesc}">
      </head><body></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.description!.length).toBe(500);
  });

  test('estimates reading time from article body', () => {
    const words = Array(1000).fill('word').join(' ');
    const html = `
      <html><head>
        <meta name="description" content="A description.">
      </head><body>
        <article><p>${words}</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.readingTime).toBe(4); // 1000 / 238 = ~4.2 -> rounds to 4
  });

  test('returns minimum 1 minute reading time for short articles', () => {
    const html = `
      <html><head></head><body>
        <article><p>Short post.</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.readingTime).toBe(1);
  });

  test('returns undefined reading time for empty body', () => {
    const html = '<html><head></head><body></body></html>';
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://claude.com/blog/some-post');
    expect(result.readingTime).toBeUndefined();
  });
});
