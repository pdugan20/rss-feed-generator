import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate } from '../extract';
import type { Article } from '../types';

function extract($: CheerioAPI, url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();

  // Primary strategy: .results-story elements
  $('.results-story').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $story = $(element);

    const $titleElem = $story.find('.results-story-title a');
    const title = $titleElem.text().trim();
    const href = $titleElem.attr('href');

    if (!title || !href) return;

    const fullUrl = resolveUrl(href, url);
    if (!fullUrl || seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const description = $story.find('.results-story-excerpt').text().trim() || '';

    const $timeElem = $story.find('.results-story-date time');
    let pubDate: Date | null = null;

    if ($timeElem.length > 0) {
      const datetime = $timeElem.attr('datetime');
      if (datetime) {
        pubDate = parseDate(datetime);
      }
    }

    if (!pubDate) {
      const dateText = $story.find('.results-story-date').text().trim();
      pubDate = parseDate(dateText);
    }

    const imageUrl = resolveUrl(
      $story.find('.results-story-image img').attr('src') ||
        $story.find('.results-story-image img').attr('data-src'),
      url
    );

    articles.push({
      title: title.substring(0, 200),
      link: fullUrl,
      description: description.substring(0, 500),
      pubDate,
      imageUrl,
      guid: fullUrl,
    });
  });

  // Fallback strategy: alternative selectors
  if (articles.length === 0) {
    $('[class*="results-story"], [class*="story-list"] article, article[class*="story"]').each(
      (_index, element) => {
        if (articles.length >= 20) return false;

        const $story = $(element);
        const currentYear = new Date().getFullYear();
        const years = [currentYear, currentYear - 1, currentYear - 2];
        const selector = years.map((y) => `a[href*="/${y}/"]`).join(', ');
        const $link = $story.find(selector).first();

        if (!$link.length) return;

        const href = $link.attr('href');
        const fullUrl = resolveUrl(href, url);

        if (!fullUrl || seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        const title =
          $story.find('h2, h3, [class*="title"], [class*="headline"]').first().text().trim() ||
          $link.text().trim();

        if (!title || title.length < 10) return;

        const description =
          $story.find('[class*="excerpt"], [class*="summary"], p').first().text().trim() || '';

        const $timeElem = $story.find('time, [class*="date"]').first();
        let pubDate: Date | null = null;

        if ($timeElem.length > 0 && $timeElem.attr('datetime')) {
          pubDate = parseDate($timeElem.attr('datetime'));
        }

        if (!pubDate) {
          const dateText = $timeElem.text().trim();
          pubDate = parseDate(dateText);
        }

        articles.push({
          title: title.substring(0, 200),
          link: fullUrl,
          description: description.substring(0, 500),
          pubDate,
          imageUrl: null,
          guid: fullUrl,
        });
      }
    );
  }

  return articles;
}

export { extract };
