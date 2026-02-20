import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/anthropic';
import type { Article } from '../../../lib/types';

const BASE_URL = 'https://www.anthropic.com/engineering';

const SAMPLE_HTML = `
<html><body>
  <div class="card">
    <a href="/engineering/infrastructure-noise">
      <h3 class="title">Quantifying Infrastructure Noise in Agentic Coding Evals</h3>
    </a>
    <p class="summary">Infrastructure configuration can swing agentic coding benchmarks by several percentage points.</p>
    <span class="date">Feb 05, 2026</span>
    <img src="https://www-cdn.anthropic.com/images/infra-noise.svg" />
  </div>
  <div class="card">
    <a href="/engineering/building-c-compiler">
      <h3 class="title">Building a C Compiler with a Team of Parallel Claudes</h3>
    </a>
    <p class="summary">We tasked Opus 4.6 to build a C Compiler.</p>
    <span class="date">Jan 28, 2026</span>
  </div>
  <div class="card">
    <a href="/engineering/ai-resistant-evals">
      <h3 class="title">Designing AI-Resistant Technical Evaluations</h3>
    </a>
    <p class="summary">What we learned from three iterations of a performance engineering take-home.</p>
    <time datetime="2026-01-21">Jan 21, 2026</time>
  </div>
  <nav>
    <a href="/engineering">All Posts</a>
    <a href="/">Home</a>
  </nav>
</body></html>
`;

describe('anthropic extractor', () => {
  test('extracts articles from engineering page', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(3);
  });

  test('extracts title correctly', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].title).toBe('Quantifying Infrastructure Noise in Agentic Coding Evals');
  });

  test('resolves relative links to absolute URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].link).toBe('https://www.anthropic.com/engineering/infrastructure-noise');
  });

  test('extracts summary as description', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].description).toContain('Infrastructure configuration');
  });

  test('parses date text for pubDate', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
  });

  test('parses datetime attribute from time element', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].pubDate).toBeInstanceOf(Date);
    expect(articles[2].pubDate!.getFullYear()).toBe(2026);
  });

  test('extracts image URL', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toContain('anthropic.com');
  });

  test('article without image has null imageUrl', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[1].imageUrl).toBeNull();
  });

  test('skips nav links and short text links', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    const links = articles.map((a: Article) => a.link);
    expect(links).not.toContain('https://www.anthropic.com/engineering');
  });

  test('deduplicates by URL', () => {
    const dupeHtml = `
      <html><body>
        <div class="card">
          <a href="/engineering/same-article">
            <h3>Same Article Title Here</h3>
          </a>
        </div>
        <div class="card">
          <a href="/engineering/same-article">
            <h3>Same Article Title Here</h3>
          </a>
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
        <div class="card">
          <a href="/engineering/article-${i}">
            <h3>Engineering Article Number ${i}</h3>
          </a>
        </div>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(20);
  });

  test('returns empty array for page with no engineering links', () => {
    const $ = cheerio.load('<html><body><p>No articles</p></body></html>');
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });

  test('sets guid equal to link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].guid).toBe(articles[0].link);
  });

  test('extracts categories from card metadata', () => {
    const html = `
      <html><body>
        <div class="card">
          <a href="/engineering/some-article">
            <h3>Some Engineering Article Title</h3>
          </a>
          <span class="category">Research</span>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toEqual(['Research']);
  });

  test('articles without category elements have no categories', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toBeUndefined();
  });
});

describe('anthropic enrichArticle', () => {
  test('extracts description from meta description', () => {
    const html = `
      <html><head>
        <meta name="description" content="An engineering blog post about infrastructure.">
      </head><body><article><p>Article body text here.</p></article></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/engineering/some-post');
    expect(result.description).toBe('An engineering blog post about infrastructure.');
  });

  test('extracts description from og:description', () => {
    const html = `
      <html><head>
        <meta property="og:description" content="OG description for sharing.">
      </head><body><article><p>Body text.</p></article></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/engineering/some-post');
    expect(result.description).toBe('OG description for sharing.');
  });

  test('estimates reading time from article body', () => {
    const words = Array(500).fill('word').join(' ');
    const html = `
      <html><head></head><body>
        <article><p>${words}</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/engineering/some-post');
    expect(result.readingTime).toBe(2); // 500 / 238 = ~2.1 -> rounds to 2
  });

  test('returns minimum 1 minute reading time for short articles', () => {
    const html = `
      <html><head></head><body>
        <article><p>Short article.</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/engineering/some-post');
    expect(result.readingTime).toBe(1);
  });

  test('returns undefined reading time for empty body', () => {
    const html = '<html><head></head><body></body></html>';
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/engineering/some-post');
    expect(result.readingTime).toBeUndefined();
  });
});
