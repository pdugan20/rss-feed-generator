import * as cheerio from 'cheerio';
import { extract } from '../../../lib/extractors/red-team';

const BASE_URL = 'https://red.anthropic.com';

const SAMPLE_HTML = `
<html><body>
  <div class="container">
    <div class="date">April 2026</div>
    <a href="2026/mythos-preview/" class="note">
      <h3>Assessing Claude Mythos Preview's cybersecurity capabilities</h3>
      <div class="description">
        Claude Mythos Preview is a new general-purpose language model with improved capabilities.
      </div>
    </a>
    <div class="date">December 2025</div>
    <a href="2025/expanded-bio-evals/" class="note">
      <h3>Expanded bio evaluations for frontier AI</h3>
      <div class="description">
        We describe an expanded set of evaluations to assess risks from frontier AI.
      </div>
    </a>
    <a href="2025/sabotage-evals/" class="note">
      <h3>Sabotage evaluations for frontier models</h3>
      <div class="description">
        We present evaluations to measure sabotage capabilities in frontier models.
      </div>
    </a>
  </div>
</body></html>
`;

describe('red-team extractor', () => {
  test('extracts articles from page', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(3);
  });

  test('extracts title correctly', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].title).toBe("Assessing Claude Mythos Preview's cybersecurity capabilities");
  });

  test('resolves relative links to absolute URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].link).toBe('https://red.anthropic.com/2026/mythos-preview/');
  });

  test('extracts description', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].description).toContain('general-purpose language model');
  });

  test('parses date from date header', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
  });

  test('assigns same date group to consecutive articles', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    // Both articles under "December 2025" should have the same date
    expect(articles[1].pubDate).toBeInstanceOf(Date);
    expect(articles[2].pubDate).toBeInstanceOf(Date);
    expect(articles[1].pubDate!.getTime()).toBe(articles[2].pubDate!.getTime());
  });

  test('has null imageUrl since site has no thumbnails', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toBeNull();
  });

  test('deduplicates by URL', () => {
    const dupeHtml = `
      <html><body>
        <a href="2026/same-article/" class="note">
          <h3>Same Article Title Here</h3>
          <div class="description">Description one.</div>
        </a>
        <a href="2026/same-article/" class="note">
          <h3>Same Article Title Here</h3>
          <div class="description">Description two.</div>
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
        <a href="2026/article-${i}/" class="note">
          <h3>Red Team Article Number ${i}</h3>
          <div class="description">Description for article ${i}.</div>
        </a>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(20);
  });

  test('returns empty array for page with no note links', () => {
    const $ = cheerio.load('<html><body><p>No articles</p></body></html>');
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });

  test('sets guid equal to link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].guid).toBe(articles[0].link);
  });

  test('skips links without titles', () => {
    const html = `
      <html><body>
        <a href="2026/no-title/" class="note">
          <div class="description">No heading here.</div>
        </a>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });
});
