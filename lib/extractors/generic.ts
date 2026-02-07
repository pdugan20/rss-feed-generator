import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate } from '../extract';
import type { Article } from '../types';

function extract($: CheerioAPI, url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();

  // Strategy 1: Structured extraction with generic article/post/entry selectors
  $('article, [class*="post"], [class*="entry"], [class*="article"]').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $item = $(element);
    const $link = $item.find('a[href]').first();
    if (!$link.length) return;

    const href = $link.attr('href');
    const fullUrl = resolveUrl(href, url);
    if (!fullUrl || seenUrls.has(fullUrl)) return;

    const title =
      $item.find('h2, h3, h4, [class*="title"], [class*="headline"]').first().text().trim() ||
      $link.text().trim();

    if (!title || title.length < 10) return;

    seenUrls.add(fullUrl);

    const description =
      $item
        .find('[class*="excerpt"], [class*="summary"], [class*="description"], p')
        .first()
        .text()
        .trim() || '';

    let pubDate: Date | null = null;
    const $time = $item.find('time').first();
    if ($time.length > 0) {
      pubDate = parseDate($time.attr('datetime')) || parseDate($time.text().trim());
    }

    articles.push({
      title: title.substring(0, 200),
      link: fullUrl,
      description: description.substring(0, 500),
      pubDate,
      imageUrl: null,
      guid: fullUrl,
    });
  });

  // Strategy 2: Last resort link-scanning fallback
  if (articles.length === 0) {
    $('a[href]').each((_index, element) => {
      if (articles.length >= 20) return false;

      const $link = $(element);
      const href = $link.attr('href');

      if (!href) return;
      if (href.startsWith('javascript:') || href === '#') return;

      const fullUrl = resolveUrl(href, url);
      if (!fullUrl || seenUrls.has(fullUrl)) return;

      const title = $link.text().trim();
      if (!title || title.length < 25) return;

      seenUrls.add(fullUrl);

      articles.push({
        title: title.substring(0, 200),
        link: fullUrl,
        description: '',
        pubDate: null,
        imageUrl: null,
        guid: fullUrl,
      });
    });
  }

  return articles;
}

export { extract };
