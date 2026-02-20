import * as cheerio from 'cheerio';
import scraper from './scraper';
import articleStore from './article-store';
import { getExtractor } from './extract';
import type { Article } from './types';

const ENRICHMENT_DELAY_MS = 1500;

async function enrichArticles(feedUrl: string, articles: Article[]): Promise<void> {
  const extractor = getExtractor(feedUrl);

  if (!extractor.enrichArticle) return;

  let enrichedCount = 0;

  for (const article of articles) {
    // Apply cached data if available
    const cached = articleStore.getDescription(article.link);
    if (cached) {
      if (!article.description) {
        article.description = cached;
      }
      const cachedReadingTime = articleStore.getReadingTime(article.link);
      if (cachedReadingTime && !article.readingTime) {
        article.readingTime = cachedReadingTime;
      }
      continue;
    }

    // Scrape individual article page for enrichment
    try {
      const browser = await scraper.initBrowser();
      const page = await browser.newPage();

      try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(article.link, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const html = await page.content();
        const $ = cheerio.load(html);

        const result = extractor.enrichArticle($, article.link);

        if (result.description || result.readingTime) {
          if (result.description) {
            articleStore.setArticleData(article.link, {
              description: result.description,
              readingTime: result.readingTime,
            });
            if (!article.description) {
              article.description = result.description;
            }
          }
          if (result.readingTime && !article.readingTime) {
            article.readingTime = result.readingTime;
          }
          enrichedCount++;
        }
      } finally {
        await page.close();
      }

      // Rate limit between page loads
      if (enrichedCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_DELAY_MS));
      }
    } catch (error) {
      console.log(`Enrichment failed for ${article.link}: ${(error as Error).message}`);
    }
  }

  if (enrichedCount > 0) {
    articleStore.save();
    console.log(`Enriched ${enrichedCount} articles for ${feedUrl}`);
  }
}

export { enrichArticles };
