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

export { feeds, feedUrls, getExtractorName, getLabel };
