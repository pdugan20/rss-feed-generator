import { getExtractorName } from './feeds';
import type { Extractor } from './types';

const extractors: Record<string, Extractor> = {
  'seattle-times': require('./extractors/seattle-times'),
  anthropic: require('./extractors/anthropic'),
  'claude-blog': require('./extractors/claude-blog'),
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

export { getExtractor, resolveUrl, parseDate, estimateReadingTime };
