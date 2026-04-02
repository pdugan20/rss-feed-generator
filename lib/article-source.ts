import scraper from './scraper';
import articleStore from './article-store';
import { getFeedConfig } from './feeds';
import { getApiFetcher } from './api-fetchers';
import type { Article } from './types';

interface FetchResult {
  articles: Article[];
  pageTitle: string;
}

async function fetchArticles(url: string): Promise<FetchResult> {
  const config = getFeedConfig(url);

  if (config?.type === 'api') {
    const fetcher = getApiFetcher(config.extractor);
    if (!fetcher) {
      throw new Error(`No API fetcher registered for extractor: ${config.extractor}`);
    }

    const articles = await fetcher.fetch();

    // Persist pubDates to article store (mirrors scraper behavior)
    let needsSave = false;
    for (const article of articles) {
      if (article.pubDate) {
        const existing = articleStore.getPubDate(article.link);
        if (!existing || existing.getTime() !== article.pubDate.getTime()) {
          articleStore.setArticleData(article.link, {
            description: articleStore.getDescription(article.link) || '',
            readingTime: articleStore.getReadingTime(article.link),
            pubDate: article.pubDate,
          });
          needsSave = true;
        }
      }
    }
    if (needsSave) {
      articleStore.save();
    }

    return { articles, pageTitle: fetcher.pageTitle };
  }

  return scraper.scrapeArticles(url);
}

export { fetchArticles };
