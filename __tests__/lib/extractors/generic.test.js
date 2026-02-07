const cheerio = require('cheerio');
const { extract } = require('../../../lib/extractors/generic');

describe('generic extractor', () => {
  test('extracts from article elements', () => {
    const html = `
      <html><body>
        <article>
          <h2>Test Title</h2>
          <a href="https://example.com/article">Link</a>
          <p>Some description text here.</p>
          <time datetime="2025-06-15T10:00:00Z">June 15</time>
        </article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0].title).toBe('Test Title');
  });

  test('extracts link from article', () => {
    const html = `
      <article>
        <h2>Article Title</h2>
        <a href="/posts/test-article">Read more</a>
        <p>Description</p>
      </article>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles[0].link).toBe('https://example.com/posts/test-article');
  });

  test('parses datetime from time element', () => {
    const html = `
      <article>
        <h2>Dated Article</h2>
        <a href="https://example.com/dated">Link</a>
        <time datetime="2025-06-15T10:00:00Z">June 15</time>
      </article>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles[0].pubDate).toBeInstanceOf(Date);
  });

  test('falls back to link scanning when no article elements', () => {
    const html = `
      <html><body>
        <div>
          <a href="https://example.com/long-article-title-that-is-clearly-not-nav">
            This Is A Long Enough Title For An Article
          </a>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles.length).toBeGreaterThan(0);
  });

  test('skips javascript: and hash links in fallback', () => {
    const html = `
      <html><body>
        <div>
          <a href="javascript:void(0)">Click me please now</a>
          <a href="#">Top of page navigation link</a>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles).toHaveLength(0);
  });

  test('skips links with very short titles', () => {
    const html = `
      <html><body>
        <a href="https://example.com/page">Short</a>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles).toHaveLength(0);
  });

  test('caps at 20 articles', () => {
    let html = '<html><body>';
    for (let i = 0; i < 25; i++) {
      html += `
        <article>
          <h2>Article Number ${i} Title</h2>
          <a href="https://example.com/article-${i}">Link</a>
        </article>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, 'https://example.com/');
    expect(articles).toHaveLength(20);
  });

  test('returns empty array for empty page', () => {
    const $ = cheerio.load('<html><body></body></html>');
    const articles = extract($, 'https://example.com/');
    expect(articles).toHaveLength(0);
  });
});
