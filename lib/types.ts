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
  /** Explicit canonical page origins for known cross-origin source redirects. */
  pageOrigins?: string[];
  /**
   * How to load a scraped page. 'browser' (default) renders it in Chromium;
   * 'html' parses the server-rendered document without running JavaScript, for
   * sources whose article list is in the HTML and whose scripts are ad traffic.
   */
  render?: 'browser' | 'html';
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
