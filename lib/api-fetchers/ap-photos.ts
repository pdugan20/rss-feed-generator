import type { Article, ApiFetcher } from '../types';

const AP_SEARCH_URL = 'https://api.newsroom.ap.org/v1/search';

const SEARCH_BODY = {
  Query: 'Lindsey Wasson',
  MediaTypes: ['photo'],
  PageNumber: 1,
  MixedMediaPageNumber: 1,
  PageSize: 100,
  SearchType: 'keyword',
  Sort: ['firstcreated:desc'],
  RegionId: '20',
  Date: 'Anytime',
  DateLabel: 'Anytime',
  Skip: 0,
  BoolOrTerms: {},
  Categories: [],
  CustomFilters: {},
  DisplayName: '',
  DurationMs: null,
  Fields: [],
  FootageType: [],
  Function: '',
  GraphicsType: [],
  IgnoreSpellCheck: false,
  IsSavedSearch: false,
  IsSharedSearch: false,
  MixedMediaRequestType: '',
  MyPlanSearch: false,
  PartnerFilters: [],
  Partners: [],
  QueryId: '',
  QueryType: '',
  SavedSearchId: '',
  SavedSearchName: '',
  SavedSearchQuery: '',
  ShareToken: '',
  TagId: null,
  TopicQuery: '',
  UseTopicQuery: false,
  categoriesFilter: [],
  hpSectionId: null,
  isZeroSpellCheckSearch: false,
  persons: [],
  photoOrientTypes: [],
  showResults: false,
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function isMarinersPhoto(caption: string): boolean {
  return stripHtml(caption).startsWith('Seattle Mariners');
}

// AP game headlines follow "{Away} {Home} {Sport}" — e.g. "Yankees Mariners Baseball"
// Extract the opponent team name when the headline matches this pattern.
const SPORTS = /\b(?:Baseball|Basketball|Football|Hockey|Soccer|Softball)\s*$/;

function parseOpponent(headline: string): string | null {
  if (!SPORTS.test(headline)) return null;
  const noSport = headline.replace(SPORTS, '').trim();
  const match = noSport.match(/^(.+?)\s+Mariners$/);
  if (match) return match[1];
  const match2 = noSport.match(/^Mariners\s+(.+?)$/);
  if (match2) return match2[1];
  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildTitle(
  headline: string,
  persons: Array<{ name?: string }>,
  pubDate: Date | null
): string {
  const datePrefix = pubDate ? formatDate(pubDate) : null;
  const opponent = parseOpponent(headline);
  const featuredPerson = persons.length > 0 ? persons[0].name : null;

  if (datePrefix && opponent && featuredPerson) {
    return `${datePrefix} vs ${opponent} — ${featuredPerson}`;
  }
  if (datePrefix && opponent) {
    return `${datePrefix} vs ${opponent}`;
  }
  if (datePrefix) {
    return `${datePrefix}: ${headline}`;
  }
  return headline;
}

interface ApRendition {
  rel?: string;
  width?: number;
  height?: number;
  mimetype?: string;
}

interface ApHit {
  _source: {
    itemid: string;
    headline?: string;
    title?: string;
    caption?: { nitf?: string };
    firstcreated?: string;
    photographer?: { name?: string };
    subjects?: Array<{ name?: string }>;
    persons?: Array<{ name?: string }>;
    renditions?: ApRendition[];
  };
}

interface ApSearchResponse {
  Items?: ApHit[];
}

async function fetchPhotos(): Promise<Article[]> {
  const response = await fetch(AP_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://newsroom.ap.org',
      Referer: 'https://newsroom.ap.org/',
    },
    body: JSON.stringify(SEARCH_BODY),
  });

  if (!response.ok) {
    console.error(`AP Photos API returned ${response.status}: ${response.statusText}`);
    return [];
  }

  const json = (await response.json()) as ApSearchResponse;
  const hits = json?.Items ?? [];
  const articles: Article[] = [];

  const MAX_ITEMS = 30;

  for (const hit of hits) {
    if (articles.length >= MAX_ITEMS) break;

    const source = hit._source;
    const captionNitf = source.caption?.nitf ?? '';

    if (!isMarinersPhoto(captionNitf)) continue;

    const description = stripHtml(captionNitf).substring(0, 500);
    const categories = (source.subjects ?? []).map((s) => s.name).filter((n): n is string => !!n);

    // Get preview rendition dimensions (512px wide previews)
    const preview = (source.renditions ?? []).find((r) => r.rel === 'Preview');

    const headline = source.headline || source.title || 'AP Photo';
    const pubDate = source.firstcreated ? new Date(source.firstcreated) : null;
    const persons = source.persons ?? [];

    articles.push({
      title: buildTitle(headline, persons, pubDate),
      link: `https://newsroom.ap.org/editorial-photos-videos/detail?itemid=${source.itemid}&mediatype=photo`,
      description,
      pubDate,
      imageUrl: `https://mapi.associatedpress.com/v2/items/${source.itemid}/preview/AP.jpg`,
      guid: `ap-photo-${source.itemid}`,
      categories,
      imageWidth: preview?.width,
      imageHeight: preview?.height,
      imageMimeType: preview?.mimetype ?? 'image/jpeg',
    });
  }

  return articles;
}

const apPhotosFetcher: ApiFetcher = {
  fetch: fetchPhotos,
  pageTitle: 'AP Photos - Lindsey Wasson - Seattle Mariners',
};

export = apPhotosFetcher;
