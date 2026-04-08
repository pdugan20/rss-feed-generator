import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate } from '../extract';
import type { Article } from '../types';

function extract($: CheerioAPI, _url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = 'https://red.anthropic.com';

  // Track the current date group for assigning dates to articles
  let currentDate: Date | null = null;

  // Iterate through children of the container to pair .date headers with a.note links
  $('div.date, a.note').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $el = $(element);

    // If this is a date header, update the current date context
    if ($el.hasClass('date')) {
      currentDate = parseDate($el.text().trim());
      return;
    }

    // Otherwise it's an a.note article link
    const href = $el.attr('href');
    if (!href) return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || seenUrls.has(fullUrl)) return;

    const title = $el.find('h3').first().text().trim();
    if (!title || title.length < 5) return;

    seenUrls.add(fullUrl);

    const description = $el.find('.description').first().text().trim() || '';

    articles.push({
      title: title.substring(0, 200),
      link: fullUrl,
      description: description.substring(0, 500),
      pubDate: currentDate,
      imageUrl: null,
      guid: fullUrl,
    });
  });

  return articles;
}

export { extract };
