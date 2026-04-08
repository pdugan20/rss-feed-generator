import { FeedConfig } from './types';

const feeds: FeedConfig[] = [
  {
    url: 'https://www.seattletimes.com/sports/washington-huskies-football/',
    extractor: 'seattle-times',
    label: 'huskies',
  },
  {
    url: 'https://www.seattletimes.com/sports/mariners/',
    extractor: 'seattle-times',
    label: 'mariners',
  },
  {
    url: 'https://www.anthropic.com/engineering',
    extractor: 'anthropic',
    label: 'anthropic-engineering',
  },
  {
    url: 'https://claude.com/blog',
    extractor: 'claude-blog',
    label: 'claude-blog',
  },
  {
    url: 'https://newsroom.ap.org/editorial-photos-videos/search?query=Lindsey+Wasson&mediaType=photo&st=keyword',
    extractor: 'ap-photos',
    label: 'ap-mariners-photos',
    type: 'api',
    cacheTtlMs: 2 * 60 * 60 * 1000, // 2 hours
    maxItems: 30,
  },
  {
    url: 'https://red.anthropic.com',
    extractor: 'red-team',
    label: 'anthropic-red-team',
  },
];

const feedUrls: string[] = feeds.map((f) => f.url);

function getExtractorName(url: string): string | null {
  const entry = feeds.find((f) => f.url === url);
  return entry ? entry.extractor : null;
}

function getLabel(url: string): string | null {
  const entry = feeds.find((f) => f.url === url);
  return entry ? entry.label : null;
}

function getFeedConfig(url: string): FeedConfig | null {
  const entry = feeds.find((f) => f.url === url);
  return entry || null;
}

export { feeds, feedUrls, getExtractorName, getLabel, getFeedConfig };
