import type { Article, ApiFetcher } from '../types';

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search';
const HN_ITEM_URL = 'https://news.ycombinator.com/item';
const HITS_PER_PAGE = 100;
const TOP_N = 5;

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  story_text?: string | null;
  created_at?: string;
  created_at_i?: number;
  _tags?: string[];
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

// Returns [startSeconds, endSeconds) for the UTC day prior to `now`.
function previousUtcDayBounds(now: Date): { start: number; end: number } {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const start = end - 86400;
  return { start, end };
}

function hnDiscussionUrl(objectID: string): string {
  return `${HN_ITEM_URL}?id=${objectID}`;
}

function buildDescription(hit: AlgoliaHit, includeDiscussionUrl: boolean): string {
  const points = hit.points ?? 0;
  const comments = hit.num_comments ?? 0;
  const author = hit.author ?? 'unknown';
  const stats = `${points} points, ${comments} comments by ${author}.`;
  if (!includeDiscussionUrl) return stats;
  return `${stats} Discussion: ${hnDiscussionUrl(hit.objectID)}`;
}

async function fetchTopStories(now: Date = new Date()): Promise<Article[]> {
  const { start, end } = previousUtcDayBounds(now);
  const params = new URLSearchParams({
    tags: 'story',
    numericFilters: `created_at_i>=${start},created_at_i<${end}`,
    hitsPerPage: String(HITS_PER_PAGE),
  });

  const response = await fetch(`${ALGOLIA_SEARCH_URL}?${params.toString()}`);

  if (!response.ok) {
    console.error(`HN Algolia API returned ${response.status}: ${response.statusText}`);
    return [];
  }

  const json = (await response.json()) as AlgoliaResponse;
  const hits = json?.hits ?? [];

  const ranked = hits
    .filter((h) => typeof h.title === 'string' && h.title.length > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, TOP_N);

  const articles: Article[] = [];
  for (const hit of ranked) {
    const title = hit.title as string;
    const pubDate = hit.created_at ? new Date(hit.created_at) : null;
    const discussionUrl = hnDiscussionUrl(hit.objectID);

    // For Ask HN / Show HN posts, the HN thread IS the article — link directly
    // to it and skip the redundant "Discussion: <url>" line. For external
    // stories, link to the article and surface the HN URL as plain text so
    // readers like Readwise auto-linkify it without stripping the anchor.
    const hasExternalUrl = Boolean(hit.url);
    articles.push({
      title,
      link: hasExternalUrl ? (hit.url as string) : discussionUrl,
      description: buildDescription(hit, hasExternalUrl),
      pubDate,
      imageUrl: null,
      guid: `hn-${hit.objectID}`,
    });
  }
  return articles;
}

const hackernewsTopFetcher: ApiFetcher = {
  fetch: fetchTopStories,
  pageTitle: 'Hacker News — Top Stories of Yesterday',
};

export = hackernewsTopFetcher;
