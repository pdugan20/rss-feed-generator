import type { CheerioAPI } from 'cheerio';

export interface Article {
  title: string;
  link: string;
  description: string;
  pubDate: Date | null;
  imageUrl: string | null;
  guid: string;
  readingTime?: number;
  categories?: string[];
  imageWidth?: number;
  imageHeight?: number;
  imageMimeType?: string;
}

export interface FeedConfig {
  url: string;
  extractor: string;
  label: string;
  type?: 'scrape' | 'api';
  cacheTtlMs?: number;
  maxItems?: number;
}

export interface ApiFetcher {
  fetch(): Promise<Article[]>;
  pageTitle: string;
}

export interface Extractor {
  extract: ($: CheerioAPI, url: string) => Article[];
  enrichArticle?: ($: CheerioAPI, url: string) => { description?: string; readingTime?: number };
}

export type FeedFormat = 'rss' | 'atom' | 'json';

export interface GeneratedFeeds {
  rss: string;
  atom: string;
  json: string;
}
