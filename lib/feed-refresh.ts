import cache from './cache';
import feedGenerator from './feed-generator';
import feedStore from './feed-store';
import { enrichArticles } from './enricher';
import { fetchArticles } from './article-source';
import { feedHealth } from './feed-health';
import type { GeneratedFeeds } from './types';

export class NoArticlesError extends Error {
  constructor() {
    super('No articles found');
  }
}

/**
 * Fetch, enrich and generate a feed, then write both caches. Every outcome is
 * recorded in feed health so /status and the monitor can report failures.
 */
export async function refreshFeed(
  url: string
): Promise<{ feeds: GeneratedFeeds; articleCount: number }> {
  try {
    const { articles, pageTitle } = await fetchArticles(url);
    if (!articles || articles.length === 0) throw new NoArticlesError();

    await enrichArticles(url, articles);
    const feeds = await feedGenerator.generateFeeds(url, articles, pageTitle);
    cache.set(`feed:${url}`, feeds);
    feedStore.set(url, feeds, articles.length);
    feedHealth.recordSuccess(url);
    return { feeds, articleCount: articles.length };
  } catch (error) {
    feedHealth.recordFailure(url, (error as Error).message);
    throw error;
  }
}
