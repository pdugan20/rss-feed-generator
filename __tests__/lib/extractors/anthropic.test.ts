import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/anthropic';

const BASE_URL = 'https://www.anthropic.com/engineering';

function row(slug: string, title: string, date: string, image = true): string {
  return `<div class="qB_UoW_card"><article class="nUeDbq_article" data-listing-row="article-${slug}">
    <header class="nUeDbq_header"><button aria-label="Related to ${title}" type="button"></button><time>${date}</time></header>
    ${image ? `<figure><img alt="" src="https://assets.claude.com/${slug}.jpg?w=1080&amp;q=75"></figure>` : ''}
    <div class="nUeDbq_meta"><h3 class="nUeDbq_metaTitle"><a class="nUeDbq_metaTitleLink" href="/research/${slug}">${title}</a></h3></div>
  </article></div>`;
}

// Trimmed from the live page: a featured hero repeats a listed post, team links
// share the /research/ prefix, and the list itself is newest first.
const SAMPLE_HTML = `
<html><body>
  <nav><a href="/engineering">Engineering</a><a href="/research/team/alignment">Alignment</a></nav>
  <section class="featured">
    <a href="/research/components-of-agent-memory"><h2>The components of agent memory</h2></a>
    <a href="/research/components-of-agent-memory">Read more</a>
  </section>
  ${row('building-strong-safety-evaluations', 'Building strong safety evaluations', 'Nov 13, 2026')}
  ${row('components-of-agent-memory', 'The components of agent memory', 'Nov 6, 2026')}
  ${row('redesigning-source-control', 'Redesigning source control at Anthropic', 'Oct 13, 2026', false)}
  <footer><a href="/research/team/economics">Economics</a></footer>
</body></html>
`;

describe('anthropic extractor', () => {
  test('extracts listing rows newest first', () => {
    const articles = extract(cheerio.load(SAMPLE_HTML), BASE_URL);
    expect(articles.map((a) => a.title)).toEqual([
      'Building strong safety evaluations',
      'The components of agent memory',
      'Redesigning source control at Anthropic',
    ]);
  });

  test('maps link, guid, date and image', () => {
    const [first] = extract(cheerio.load(SAMPLE_HTML), BASE_URL);
    expect(first.link).toBe(
      'https://www.anthropic.com/research/building-strong-safety-evaluations'
    );
    expect(first.guid).toBe(first.link);
    expect(first.pubDate).toEqual(new Date('Nov 13, 2026'));
    expect(first.imageUrl).toBe(
      'https://assets.claude.com/building-strong-safety-evaluations.jpg?w=1080&q=75'
    );
  });

  test('leaves imageUrl null when a row has no image', () => {
    const articles = extract(cheerio.load(SAMPLE_HTML), BASE_URL);
    expect(articles[2].imageUrl).toBeNull();
  });

  test('ignores featured cards, navigation and team links outside listing rows', () => {
    const links = extract(cheerio.load(SAMPLE_HTML), BASE_URL).map((a) => a.link);
    expect(links).toHaveLength(3);
    expect(links.some((link) => link.includes('/research/team/'))).toBe(false);
  });

  test('deduplicates repeated rows', () => {
    const html = row('a-post', 'A repeated post', 'Nov 1, 2026').repeat(2);
    expect(extract(cheerio.load(html), BASE_URL)).toHaveLength(1);
  });

  test('caps at 20 articles', () => {
    const html = Array.from({ length: 25 }, (_, i) =>
      row(`post-${i}`, `Post ${i}`, 'Nov 1, 2026')
    ).join('');
    expect(extract(cheerio.load(html), BASE_URL)).toHaveLength(20);
  });

  test('returns no articles when the page has no listing rows', () => {
    const html = '<a href="/engineering/old-post"><h3>An old-style engineering card</h3></a>';
    expect(extract(cheerio.load(html), BASE_URL)).toEqual([]);
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
