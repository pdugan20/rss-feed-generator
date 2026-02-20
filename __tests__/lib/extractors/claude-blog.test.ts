import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/claude-blog';

const BASE_URL = 'https://claude.com/blog';

const SAMPLE_HTML = `
<html><body>
  <div class="blog_cms_grid">
    <div class="blog_cms_item w-dyn-item">
      <div class="card_blog_wrap">
        <a href="/blog/cowork-research-preview" class="clickable_link">Read more</a>
        <div class="card_blog_list_content">
          <h3 class="card_blog_title">Cowork: Claude Code for the rest of your work</h3>
          <div class="card_blog_list_meta">January 12, 2026</div>
        </div>
        <div class="card_blog_visual_wrap">
          <img src="https://cdn.claude.com/images/cowork.jpg" />
        </div>
      </div>
    </div>
    <div class="blog_cms_item w-dyn-item">
      <div class="card_blog_wrap">
        <a href="/blog/enterprise-agents-2026" class="clickable_link">Read more</a>
        <div class="card_blog_list_content">
          <h3 class="card_blog_title">How enterprises are building AI agents in 2026</h3>
          <div class="card_blog_list_meta">December 9, 2025</div>
        </div>
      </div>
    </div>
    <div class="blog_cms_item w-dyn-item">
      <div class="card_blog_wrap">
        <a href="/blog/frontend-design-skills" class="clickable_link">Read more</a>
        <div class="card_blog_list_content">
          <h3 class="card_blog_title">Improving frontend design through Skills</h3>
          <div class="card_blog_list_meta">November 12, 2025</div>
          <p class="description">A deep dive into how Skills improve design workflows.</p>
        </div>
      </div>
    </div>
  </div>
  <nav>
    <a href="/blog">All Posts</a>
  </nav>
</body></html>
`;

describe('claude-blog extractor', () => {
  test('extracts articles from blog CMS items', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(3);
  });

  test('extracts title from card_blog_title', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].title).toBe('Cowork: Claude Code for the rest of your work');
  });

  test('resolves relative links to absolute URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].link).toBe('https://claude.com/blog/cowork-research-preview');
  });

  test('parses date from metadata', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
    expect(articles[0].pubDate!.getMonth()).toBe(0); // January
  });

  test('parses date from u-text-style-caption element (live site format)', () => {
    const html = `
      <html><body>
        <div class="blog_cms_item">
          <div class="card_blog_wrap">
            <a href="/blog/some-post" class="clickable_link">Read</a>
            <div class="card_blog_content">
              <div class="u-text-style-caption u-foreground-tertiary u-mb-1-5">Feb 5, 2026</div>
              <div class="card_blog_title u-text-style-h6">Some Blog Post Title Here</div>
            </div>
          </div>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(1);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
    expect(articles[0].pubDate!.getFullYear()).toBe(2026);
    expect(articles[0].pubDate!.getMonth()).toBe(1); // February
    expect(articles[0].pubDate!.getDate()).toBe(5);
  });

  test('extracts image URL', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toContain('cowork.jpg');
  });

  test('article without image has null imageUrl', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[1].imageUrl).toBeNull();
  });

  test('extracts description when available', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].description).toContain('Skills improve design');
  });

  test('falls back to link scanning when no CMS items', () => {
    const fallbackHtml = `
      <html><body>
        <div>
          <a href="/blog/some-long-article-post">
            Some Long Article Post Title Here
          </a>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(fallbackHtml);
    const articles = extract($, BASE_URL);
    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0].link).toBe('https://claude.com/blog/some-long-article-post');
  });

  test('skips category filter links', () => {
    const html = `
      <html><body>
        <div class="blog_cms_item">
          <a href="/blog/category/agents" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Agents</h3>
        </div>
        <div class="blog_cms_item">
          <a href="/blog/category/claude-code" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Claude Code</h3>
        </div>
        <div class="blog_cms_item">
          <a href="/blog/real-post-title" class="clickable_link">Read</a>
          <h3 class="card_blog_title">A Real Blog Post Title</h3>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('A Real Blog Post Title');
  });

  test('skips main /blog link in fallback', () => {
    const html = `
      <html><body>
        <a href="/blog">All Posts</a>
        <a href="/blog/real-article-title">A Real Blog Article Title</a>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(1);
    expect(articles[0].link).toContain('real-article-title');
  });

  test('deduplicates by URL', () => {
    const dupeHtml = `
      <html><body>
        <div class="blog_cms_item">
          <a href="/blog/same-post" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Same Post Title</h3>
        </div>
        <div class="blog_cms_item">
          <a href="/blog/same-post" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Same Post Title</h3>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(dupeHtml);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(1);
  });

  test('caps at 20 articles', () => {
    let html = '<html><body>';
    for (let i = 0; i < 25; i++) {
      html += `
        <div class="blog_cms_item">
          <a href="/blog/post-${i}" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Blog Post Number ${i} Title</h3>
        </div>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(20);
  });

  test('returns empty array for page with no blog links', () => {
    const $ = cheerio.load('<html><body><p>Nothing here</p></body></html>');
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });

  test('sets guid equal to link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].guid).toBe(articles[0].link);
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

describe('claude-blog category extraction', () => {
  test('extracts categories from card metadata', () => {
    const html = `
      <html><body>
        <div class="blog_cms_item">
          <a href="/blog/some-post" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Some Blog Post Title Here</h3>
          <span class="card_blog_category">Product announcements</span>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toEqual(['Product announcements']);
  });

  test('articles without category elements have no categories', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toBeUndefined();
  });

  test('deduplicates categories within a card', () => {
    const html = `
      <html><body>
        <div class="blog_cms_item">
          <a href="/blog/some-post" class="clickable_link">Read</a>
          <h3 class="card_blog_title">Some Blog Post Title Here</h3>
          <span class="category">Research</span>
          <span class="tag">Research</span>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toEqual(['Research']);
  });
});
