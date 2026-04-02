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

    articles.push({
      title: source.headline || source.title || 'AP Photo',
      link: `https://newsroom.ap.org/editorial-photos-videos/detail?itemid=${source.itemid}&mediatype=photo`,
      description,
      pubDate: source.firstcreated ? new Date(source.firstcreated) : null,
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
