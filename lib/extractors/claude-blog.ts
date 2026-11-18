import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate, estimateReadingTime } from '../extract';
import type { Article } from '../types';

// claude.com/blog redirects to claude.com/resources/articles, which renders each
// post as a CSS-module ResourceCard link (hashed class names, stable suffixes).
// Featured cards repeat listed posts; some cards link out to claude.dev/blog.
function extract($: CheerioAPI, _url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = 'https://claude.com';

  const field = ($card: ReturnType<CheerioAPI>, name: string) =>
    $card.find(`[class*="ResourceCard"][class*="__${name}"]`).first();

  $('a[class*="ResourceCard"][href]').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $card = $(element);
    const classes = ($card.attr('class') ?? '').split(/\s+/);
    if (!classes.some((name) => name.endsWith('__card'))) return;

    const link = resolveUrl($card.attr('href'), baseUrl);
    const title = field($card, 'title').text().trim();
    if (!link || !title || seenUrls.has(link)) return;
    seenUrls.add(link);

    const categories = $card
      .find('[class*="ResourceCard"][class*="__productTag"]')
      .map((_i, el) => $(el).text().trim())
      .get()
      .filter((cat, i, all) => cat && all.indexOf(cat) === i);
    const $img = $card.find('img').first();

    articles.push({
      title: title.substring(0, 200),
      link,
      description: field($card, 'excerpt').text().trim().substring(0, 500),
      pubDate: parseDate(field($card, 'meta').text().trim()),
      imageUrl: resolveUrl($img.attr('src') || $img.attr('data-src'), baseUrl),
      guid: link,
      categories: categories.length > 0 ? categories : undefined,
    });
  });

  return articles;
}

function enrichArticle(
  $: CheerioAPI,
  _url: string
): { description?: string; readingTime?: number } {
  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('article p, .blog-content p, main p').first().text().trim() ||
    '';

  // Extract article body text for word count - use specific content selectors
  // to avoid counting nav, footer, and sidebar text
  const $content = $('.u-rich-text-blog').first();
  const bodyText =
    $content.length > 0
      ? $content.text().trim()
      : $('article p, .blog-content p, main p')
          .map((_i, el) => $(el).text())
          .get()
          .join(' ')
          .trim();
  const readingTime = bodyText.length > 0 ? estimateReadingTime(bodyText) : undefined;

  return { description: desc.substring(0, 500) || undefined, readingTime };
}

export { extract, enrichArticle };
