import * as cheerio from 'cheerio';
import { extract, enrichArticle } from '../../../lib/extractors/red-team';

// red.anthropic.com redirects here; posts are listing rows under /research/.
const SAMPLE_HTML = `
<html><body>
  <div class="carousel"><a href="/research/provable-inference">Progress on provable inference</a></div>
  <article data-listing-row="article-coordinated-vulnerability-disclosure-timelines">
    <header><time>Nov 16, 2026</time></header>
    <figure><img alt="" src="https://assets.claude.com/cvd.jpg"></figure>
    <h3><a href="/research/coordinated-vulnerability-disclosure-timelines">Updating our coordinated vulnerability disclosure policy timelines</a></h3>
  </article>
  <article data-listing-row="article-project-eve-claude-plays-mmorpgs">
    <header><time>Nov 6, 2026</time></header>
    <h3><a href="/research/project-eve-claude-plays-mmorpgs">Project EVE: Claude plays MMORPGs</a></h3>
  </article>
  <a href="/research/team/frontier-red-team">Frontier Red Team</a>
</body></html>
`;

describe('red-team extractor', () => {
  test('extracts listing rows with dates', () => {
    const articles = extract(cheerio.load(SAMPLE_HTML), 'https://red.anthropic.com');
    expect(articles.map((a) => [a.title, a.pubDate])).toEqual([
      [
        'Updating our coordinated vulnerability disclosure policy timelines',
        new Date('Nov 16, 2026'),
      ],
      ['Project EVE: Claude plays MMORPGs', new Date('Nov 6, 2026')],
    ]);
  });

  test('resolves post links on www.anthropic.com after the redirect', () => {
    const [first] = extract(cheerio.load(SAMPLE_HTML), 'https://red.anthropic.com');
    expect(first.link).toBe(
      'https://www.anthropic.com/research/coordinated-vulnerability-disclosure-timelines'
    );
    expect(first.guid).toBe(first.link);
    expect(first.imageUrl).toBe('https://assets.claude.com/cvd.jpg');
  });

  test('returns no articles for the retired note layout', () => {
    const html =
      '<div class="date">April 2026</div><a class="note" href="2026/x/"><h3>Old note</h3></a>';
    expect(extract(cheerio.load(html), 'https://red.anthropic.com')).toEqual([]);
  });

  test('enriches posts with their meta description', () => {
    const $ = cheerio.load('<meta name="description" content="A red team post summary.">');
    expect(enrichArticle($, 'https://www.anthropic.com/research/x').description).toBe(
      'A red team post summary.'
    );
  });
});
