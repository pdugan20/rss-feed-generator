import puppeteer, { Browser } from 'puppeteer';
import * as cheerio from 'cheerio';
import { getExtractor } from './extract';
import type { Article } from './types';

interface ScrapeResult {
  articles: Article[];
  pageTitle: string;
}

class Scraper {
  private browser: Browser | null = null;

  async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      let executablePath: string | undefined = process.env.PUPPETEER_EXECUTABLE_PATH;

      // If env var is set but doesn't work, try undefined (let Puppeteer find it)
      if (executablePath === '/usr/bin/chromium') {
        executablePath = undefined;
      }

      this.browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      });
    }
    return this.browser;
  }

  async scrapeArticles(url: string): Promise<ScrapeResult> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const html = await page.content();
      const $ = cheerio.load(html);

      const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'RSS Feed';

      const extractor = getExtractor(url);
      const articles = extractor.extract($, url);

      // Default null pubDates to now
      for (const article of articles) {
        if (!article.pubDate) {
          article.pubDate = new Date();
        }
      }

      return { articles, pageTitle };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export = new Scraper();
