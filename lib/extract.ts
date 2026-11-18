import type { CheerioAPI } from 'cheerio';
import { getExtractorName } from './feeds';
import type { Article, Extractor } from './types';

const extractors: Record<string, Extractor> = {
  'seattle-times': require('./extractors/seattle-times'),
  anthropic: require('./extractors/anthropic'),
  'anthropic-news': require('./extractors/anthropic-news'),
  'claude-blog': require('./extractors/claude-blog'),
  'ap-photos': require('./extractors/ap-photos'),
  'hackernews-top': require('./extractors/hackernews-top'),
  'red-team': require('./extractors/red-team'),
  generic: require('./extractors/generic'),
};

function getExtractor(url: string): Extractor {
  const name = getExtractorName(url);
  return (name && extractors[name]) || extractors.generic;
}

function resolveUrl(relativeUrl: string | undefined | null, baseUrl: string): string | null {
  if (!relativeUrl) return null;

  try {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    const base = new URL(baseUrl);
    return new URL(relativeUrl, base).href;
  } catch {
    return null;
  }
}

function parseDate(dateText: string | undefined | null): Date | null {
  if (!dateText) return null;

  try {
    const date = new Date(dateText);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function estimateReadingTime(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return Math.max(1, Math.round(words / 238));
}

/**
 * Anthropic's research-style listing pages (Engineering, Frontier Red Team) render
 * each post as `<article data-listing-row>` with a `<time>`, a linked headline and
 * a figure image, newest first. Featured cards above the list repeat posts that
 * also appear in it, so the list alone is complete.
 */
function extractListingRows($: CheerioAPI, baseUrl: string, limit = 20): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();

  $('article[data-listing-row]').each((_index, element) => {
    if (articles.length >= limit) return false;

    const $row = $(element);
    const $heading = $row.find('h1, h2, h3, h4').first();
    const $link = $heading.find('a[href]').first().length
      ? $heading.find('a[href]').first()
      : $row.find('a[href]').first();

    const link = resolveUrl($link.attr('href'), baseUrl);
    const title = ($heading.text() || $link.text()).trim();
    if (!link || !title || seenUrls.has(link)) return;
    seenUrls.add(link);

    const $time = $row.find('time').first();
    const pubDate = parseDate($time.attr('datetime')) || parseDate($time.text().trim());
    const $img = $row.find('img').first();

    articles.push({
      title: title.substring(0, 200),
      link,
      description: $row.find('p').first().text().trim().substring(0, 500),
      pubDate,
      imageUrl: resolveUrl($img.attr('src') || $img.attr('data-src'), baseUrl),
      guid: link,
    });
  });

  return articles;
}

export { getExtractor, resolveUrl, parseDate, estimateReadingTime, extractListingRows };
