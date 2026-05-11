import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/anthropic-news';
import type { Article } from '../../../lib/types';

const BASE_URL = 'https://www.anthropic.com/news';

// Mirrors the real Anthropic news page: content lives inside the <a>,
// with featured items wrapped in a parent that also holds an <img>,
// and list items rendered as <a> with text-only spans inside.
const SAMPLE_HTML = `
<html><body>
  <div class="FeaturedGrid-module-scss-module__W1FydW__featuredItem">
    <figure class="FeaturedGrid-module-scss-module__W1FydW__mediaWrapper">
      <img alt="Hero" src="/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2Fhero.png&w=1920&q=75" />
    </figure>
    <a href="/news/claude-opus-4-7" class="FeaturedGrid-module-scss-module__W1FydW__content">
      <h2 class="FeaturedGrid-module-scss-module__W1FydW__featuredTitle">Introducing Claude Opus 4.7</h2>
      <div class="FeaturedGrid-module-scss-module__W1FydW__meta">
        <span class="caption bold">Product</span>
        <time class="FeaturedGrid-module-scss-module__W1FydW__date">Apr 16, 2026</time>
      </div>
      <p class="body-3 FeaturedGrid-module-scss-module__W1FydW__body">Our latest Opus model brings stronger performance.</p>
    </a>
  </div>
  <a href="/news/claude-design-anthropic-labs" class="FeaturedGrid-module-scss-module__W1FydW__sideLink">
    <div class="FeaturedGrid-module-scss-module__W1FydW__meta">
      <span class="caption bold">Product</span>
      <time class="FeaturedGrid-module-scss-module__W1FydW__date">Apr 17, 2026</time>
    </div>
    <h4 class="FeaturedGrid-module-scss-module__W1FydW__title">Introducing Claude Design by Anthropic Labs</h4>
    <p class="FeaturedGrid-module-scss-module__W1FydW__body">Collaborate with Claude on visual work.</p>
  </a>
  <ul>
    <li>
      <a href="/news/higher-limits-spacex" class="PublicationList-module-scss-module__KxYrHG__listItem">
        <div class="PublicationList-module-scss-module__KxYrHG__meta">
          <time class="PublicationList-module-scss-module__KxYrHG__date body-3" datetime="2026-05-06">May 6, 2026</time>
          <span class="PublicationList-module-scss-module__KxYrHG__subject body-3">Announcements</span>
        </div>
        <span class="PublicationList-module-scss-module__KxYrHG__title body-3">Higher usage limits for Claude and a compute deal with SpaceX</span>
      </a>
    </li>
  </ul>
  <footer>
    <a href="/news/announcing-our-updated-responsible-scaling-policy" class="SiteFooter-module-scss-module__JdOqwq__listItem">Responsible Scaling Policy</a>
  </footer>
  <nav>
    <a href="/news">All News</a>
    <a href="/">Home</a>
  </nav>
  <script>self.__next_f.push([1,"6:[\\"$\\",\\"$L13\\",null,{\\"posts\\":[{\\"_type\\":\\"post\\",\\"illustration\\":{\\"backgroundColor\\":\\"fig\\",\\"illustration\\":{\\"_type\\":\\"illustration\\",\\"image\\":{\\"_type\\":\\"image\\",\\"url\\":\\"https://cdn.sanity.io/images/4zrzovbb/website/5f455d24ea80569b34eb4347f06152d8a5508722-1000x1000.svg\\",\\"width\\":1000,\\"height\\":1000},\\"type\\":\\"hero\\"}},\\"slug\\":{\\"_type\\":\\"slug\\",\\"current\\":\\"higher-limits-spacex\\"},\\"title\\":\\"Higher usage limits for Claude and a compute deal with SpaceX\\"}]}]\\n"])</script>
</body></html>
`;

describe('anthropic-news extractor', () => {
  test('extracts articles from news page', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(3);
  });

  test('extracts featured hero title from h2', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].title).toBe('Introducing Claude Opus 4.7');
  });

  test('extracts side link title from h4', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[1].title).toBe('Introducing Claude Design by Anthropic Labs');
  });

  test('extracts list item title from [class*="title"] span', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].title).toBe('Higher usage limits for Claude and a compute deal with SpaceX');
  });

  test('resolves relative links to absolute URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].link).toBe('https://www.anthropic.com/news/claude-opus-4-7');
  });

  test('extracts description from p element inside link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].description).toContain('stronger performance');
    expect(articles[1].description).toContain('visual work');
  });

  test('list items without p have empty description', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].description).toBe('');
  });

  test('parses date from text content of time element', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
    expect(articles[0].pubDate!.getFullYear()).toBe(2026);
  });

  test('parses datetime attribute when present', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].pubDate).toBeInstanceOf(Date);
  });

  test('extracts category from meta block span', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].categories).toEqual(['Product']);
    expect(articles[2].categories).toEqual(['Announcements']);
  });

  test('extracts hero image from sibling figure and unwraps Next.js image URL', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toBe('https://www-cdn.anthropic.com/images/hero.png');
  });

  test('side link without image has null imageUrl', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[1].imageUrl).toBeNull();
  });

  test('list item image is resolved from RSC SSR payload by slug', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[2].imageUrl).toBe(
      'https://cdn.sanity.io/images/4zrzovbb/website/5f455d24ea80569b34eb4347f06152d8a5508722-1000x1000.svg'
    );
  });

  test('list item has null imageUrl when SSR payload is missing the slug', () => {
    const htmlNoSsr = `
      <html><body>
        <ul><li>
          <a href="/news/no-ssr-article" class="PublicationList-module-scss-module__KxYrHG__listItem">
            <span class="PublicationList-module-scss-module__KxYrHG__title body-3">Article With No SSR Image Data</span>
          </a>
        </li></ul>
      </body></html>
    `;
    const $ = cheerio.load(htmlNoSsr);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toBeNull();
  });

  test('skips footer policy link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    const links = articles.map((a: Article) => a.link);
    expect(links).not.toContain(
      'https://www.anthropic.com/news/announcing-our-updated-responsible-scaling-policy'
    );
  });

  test('skips nav link to /news index', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    const links = articles.map((a: Article) => a.link);
    expect(links).not.toContain('https://www.anthropic.com/news');
  });

  test('deduplicates by URL when the same article appears twice', () => {
    const dupeHtml = `
      <html><body>
        <a href="/news/same-article" class="content">
          <h3>Same News Article Title</h3>
        </a>
        <a href="/news/same-article" class="listItem">
          <span class="title body-3">Same News Article Title</span>
        </a>
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
        <a href="/news/article-${i}" class="content">
          <h3>News Article Number ${i} Title</h3>
        </a>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(20);
  });

  test('returns empty array for page with no /news/ links', () => {
    const $ = cheerio.load('<html><body><p>No articles</p></body></html>');
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });

  test('sets guid equal to link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].guid).toBe(articles[0].link);
  });
});

describe('anthropic-news enrichArticle', () => {
  test('extracts description from meta description', () => {
    const html = `
      <html><head>
        <meta name="description" content="A news announcement about Claude.">
      </head><body><article><p>Article body text here.</p></article></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/news/some-post');
    expect(result.description).toBe('A news announcement about Claude.');
  });

  test('extracts description from og:description', () => {
    const html = `
      <html><head>
        <meta property="og:description" content="OG description for sharing.">
      </head><body><article><p>Body text.</p></article></body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/news/some-post');
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
    const result = enrichArticle($, 'https://www.anthropic.com/news/some-post');
    expect(result.readingTime).toBe(2);
  });

  test('returns minimum 1 minute reading time for short articles', () => {
    const html = `
      <html><head></head><body>
        <article><p>Short article.</p></article>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/news/some-post');
    expect(result.readingTime).toBe(1);
  });

  test('returns undefined reading time for empty body', () => {
    const html = '<html><head></head><body></body></html>';
    const $ = cheerio.load(html);
    const result = enrichArticle($, 'https://www.anthropic.com/news/some-post');
    expect(result.readingTime).toBeUndefined();
  });
});
