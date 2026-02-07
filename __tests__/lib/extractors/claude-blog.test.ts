import * as cheerio from 'cheerio';
import { extract } from '../../../lib/extractors/claude-blog';

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
