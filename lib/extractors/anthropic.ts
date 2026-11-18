import type { CheerioAPI } from 'cheerio';
import { estimateReadingTime, extractListingRows } from '../extract';
import type { Article } from '../types';

// Engineering posts moved from /engineering/<slug> to /research/<slug> and the
// index now uses the shared Anthropic listing rows.
function extract($: CheerioAPI, _url: string): Article[] {
  return extractListingRows($, 'https://www.anthropic.com');
}

function enrichArticle(
  $: CheerioAPI,
  _url: string
): { description?: string; readingTime?: number } {
  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('article p, .post-content p, main p').first().text().trim() ||
    '';

  // Extract article body text for word count - use paragraph selectors
  // to avoid counting nav, footer, and sidebar text
  const bodyText = $('article p, .post-content p, main#main-content p')
    .map((_i, el) => $(el).text())
    .get()
    .join(' ')
    .trim();
  const readingTime = bodyText.length > 0 ? estimateReadingTime(bodyText) : undefined;

  return {
    description: desc.substring(0, 500) || undefined,
    readingTime,
  };
}

export { extract, enrichArticle };
