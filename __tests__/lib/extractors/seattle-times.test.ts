import * as cheerio from 'cheerio';
import { extract } from '../../../lib/extractors/seattle-times';

const BASE_URL = 'https://www.seattletimes.com/sports/mariners/';

const SAMPLE_HTML = `
<html><body>
  <div class="results-story">
    <div class="results-story-title">
      <a href="/sports/mariners/mariners-win-big-game/">Mariners Win Big Game</a>
    </div>
    <div class="results-story-excerpt">The Mariners won today in dramatic fashion.</div>
    <div class="results-story-date">
      <time datetime="2025-06-15T10:00:00-07:00">June 15, 2025</time>
    </div>
    <div class="results-story-image">
      <img src="/wp-content/uploads/mariners.jpg" />
    </div>
  </div>
  <div class="results-story">
    <div class="results-story-title">
      <a href="/sports/mariners/trade-deadline/">Trade Deadline Approaches</a>
    </div>
    <div class="results-story-excerpt">The deadline is near.</div>
    <div class="results-story-date">
      <time datetime="2025-06-14T08:00:00-07:00">June 14, 2025</time>
    </div>
  </div>
</body></html>
`;

describe('seattle-times extractor', () => {
  test('extracts articles from results-story elements', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(2);
  });

  test('extracts title correctly', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].title).toBe('Mariners Win Big Game');
  });

  test('resolves relative links to absolute URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].link).toBe(
      'https://www.seattletimes.com/sports/mariners/mariners-win-big-game/'
    );
  });

  test('extracts description from excerpt', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].description).toContain('Mariners won today');
  });

  test('parses datetime attribute for pubDate', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeInstanceOf(Date);
    expect(articles[0].pubDate!.getFullYear()).toBe(2025);
  });

  test('returns null pubDate when no date found', () => {
    const htmlNoDate = `
      <html><body>
        <div class="results-story">
          <div class="results-story-title">
            <a href="/sports/mariners/test/">Test Article</a>
          </div>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(htmlNoDate);
    const articles = extract($, BASE_URL);
    expect(articles[0].pubDate).toBeNull();
  });

  test('resolves image URLs', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].imageUrl).toContain('https://www.seattletimes.com');
    expect(articles[0].imageUrl).toContain('mariners.jpg');
  });

  test('second article without image has null imageUrl', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[1].imageUrl).toBeNull();
  });

  test('deduplicates articles by URL', () => {
    const dupeHtml = `
      <html><body>
        <div class="results-story">
          <div class="results-story-title">
            <a href="/sports/mariners/same-article/">Same Article</a>
          </div>
        </div>
        <div class="results-story">
          <div class="results-story-title">
            <a href="/sports/mariners/same-article/">Same Article</a>
          </div>
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
        <div class="results-story">
          <div class="results-story-title">
            <a href="/sports/mariners/article-${i}/">Article ${i}</a>
          </div>
        </div>`;
    }
    html += '</body></html>';
    const $ = cheerio.load(html);
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(20);
  });

  test('sets guid equal to link', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const articles = extract($, BASE_URL);
    expect(articles[0].guid).toBe(articles[0].link);
  });

  test('returns empty array when no matching elements', () => {
    const $ = cheerio.load('<html><body><p>No articles here</p></body></html>');
    const articles = extract($, BASE_URL);
    expect(articles).toHaveLength(0);
  });
});
