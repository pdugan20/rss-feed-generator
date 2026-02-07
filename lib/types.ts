import type { CheerioAPI } from 'cheerio';

export interface Article {
  title: string;
  link: string;
  description: string;
  pubDate: Date | null;
  imageUrl: string | null;
  guid: string;
}

export interface FeedConfig {
  url: string;
  extractor: string;
  label: string;
}

export interface Extractor {
  extract: ($: CheerioAPI, url: string) => Article[];
  enrichArticle?: ($: CheerioAPI, url: string) => { description?: string };
}

export type FeedFormat = 'rss' | 'atom' | 'json';

export interface GeneratedFeeds {
  rss: string;
  atom: string;
  json: string;
}
