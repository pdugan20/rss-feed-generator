import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate } from '../extract';
import type { Article } from '../types';

function extract($: CheerioAPI, _url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = 'https://www.anthropic.com';

  // Strategy 1: Find links to /engineering/ articles
  $('a[href*="/engineering/"]').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $link = $(element);
    const href = $link.attr('href');

    // Skip the main /engineering page link and anchor links
    if (!href || href === '/engineering' || href === '/engineering/') return;
    if (href.startsWith('#') || href.startsWith('javascript:')) return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || seenUrls.has(fullUrl)) return;

    // Find the closest card/container element
    const $card =
      $link.closest('article').length > 0
        ? $link.closest('article')
        : $link.closest('[class*="card"], [class*="article"], [class*="post"], div').first();

    // Extract title - try heading inside card, then link text
    let title = '';
    if ($card.length > 0) {
      title =
        $card.find('h2, h3, h4, [class*="title"], [class*="heading"]').first().text().trim() ||
        $link.text().trim();
    } else {
      title = $link.text().trim();
    }

    if (!title || title.length < 10) return;

    seenUrls.add(fullUrl);

    // Extract description/summary
    let description = '';
    if ($card.length > 0) {
      description =
        $card
          .find('[class*="summary"], [class*="description"], [class*="excerpt"], p')
          .first()
          .text()
          .trim() || '';
    }

    // Extract date
    let pubDate: Date | null = null;
    if ($card.length > 0) {
      const $time = $card.find('time');
      if ($time.length > 0) {
        pubDate = parseDate($time.attr('datetime')) || parseDate($time.text().trim());
      }
      if (!pubDate) {
        const dateText = $card
          .find('[class*="date"], [class*="meta"], [class*="published"]')
          .first()
          .text()
          .trim();
        pubDate = parseDate(dateText);
      }
    }

    // Extract image
    let imageUrl: string | null = null;
    if ($card.length > 0) {
      const imgSrc =
        $card.find('img').first().attr('src') || $card.find('img').first().attr('data-src');
      imageUrl = resolveUrl(imgSrc, baseUrl);
    }

    articles.push({
      title: title.substring(0, 200),
      link: fullUrl,
      description: description.substring(0, 500),
      pubDate,
      imageUrl,
      guid: fullUrl,
    });
  });

  return articles;
}

export { extract };
