const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

class Scraper {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      // Try multiple possible Chromium paths
      const possiblePaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
      ];
      
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      // If env var is set but doesn't work, try undefined (let Puppeteer find it)
      if (executablePath === '/usr/bin/chromium') {
        executablePath = undefined;
      }
      
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }
    return this.browser;
  }

  async scrapeArticles(url) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const html = await page.content();
      const $ = cheerio.load(html);
      
      // Extract the page title
      const pageTitle = $('title').text().trim() || 
                       $('h1').first().text().trim() || 
                       'RSS Feed';
      
      const articles = [];
      const domain = new URL(url).hostname;
      
      if (domain.includes('seattletimes.com')) {
        const seenUrls = new Set();
        
        // Target the specific Seattle Times structure
        $('.results-story').each((index, element) => {
          if (articles.length >= 20) return false;
          
          const $story = $(element);
          
          // Extract title
          const $titleElem = $story.find('.results-story-title a');
          const title = $titleElem.text().trim();
          const href = $titleElem.attr('href');
          
          if (!title || !href) return;
          
          const fullUrl = this.resolveUrl(href, url);
          if (!fullUrl || seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);
          
          // Extract description
          const description = $story.find('.results-story-excerpt').text().trim() || '';
          
          // Extract date from time element's datetime attribute
          const $timeElem = $story.find('.results-story-date time');
          let pubDate = null;
          
          if ($timeElem.length > 0) {
            const datetime = $timeElem.attr('datetime');
            if (datetime) {
              pubDate = this.parseDate(datetime);
            }
          }
          
          // Fallback to text content if no datetime attribute
          if (!pubDate) {
            const dateText = $story.find('.results-story-date').text().trim();
            pubDate = this.parseDate(dateText);
          }
          
          // Only use current date as last resort
          if (!pubDate) {
            pubDate = new Date();
          }
          
          // Extract image
          const imageUrl = this.resolveUrl(
            $story.find('.results-story-image img').attr('src') || 
            $story.find('.results-story-image img').attr('data-src'),
            url
          );
          
          articles.push({
            title: title.substring(0, 200),
            link: fullUrl,
            description: description.substring(0, 500),
            pubDate,
            imageUrl,
            guid: fullUrl
          });
        });
        
        // If no results-story elements found, try alternative selectors
        if (articles.length === 0) {
          $('[class*="results-story"], [class*="story-list"] article, article[class*="story"]').each((index, element) => {
            if (articles.length >= 20) return false;
            
            const $story = $(element);
            const $link = $story.find('a[href*="/2024/"], a[href*="/2025/"]').first();
            
            if (!$link.length) return;
            
            const href = $link.attr('href');
            const fullUrl = this.resolveUrl(href, url);
            
            if (!fullUrl || seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);
            
            const title = $story.find('h2, h3, [class*="title"], [class*="headline"]').first().text().trim() ||
                         $link.text().trim();
            
            if (!title || title.length < 10) return;
            
            const description = $story.find('[class*="excerpt"], [class*="summary"], p').first().text().trim() || '';
            
            // Try to get date from datetime attribute first, then text
            const $timeElem = $story.find('time, [class*="date"]').first();
            let pubDate = null;
            
            if ($timeElem.length > 0 && $timeElem.attr('datetime')) {
              pubDate = this.parseDate($timeElem.attr('datetime'));
            }
            
            if (!pubDate) {
              const dateText = $timeElem.text().trim();
              pubDate = this.parseDate(dateText);
            }
            
            if (!pubDate) {
              pubDate = new Date();
            }
            
            articles.push({
              title: title.substring(0, 200),
              link: fullUrl,
              description: description.substring(0, 500),
              pubDate,
              imageUrl: null,
              guid: fullUrl
            });
          });
        }
      } else {
        const selectors = this.getSelectorsForDomain(domain);
        
        $(selectors.article).each((index, element) => {
          if (index >= 20) return false;
          
          const $article = $(element);
          
          const title = $article.find(selectors.title).first().text().trim() ||
                       $article.find('h1, h2, h3, h4').first().text().trim();
          
          const link = this.resolveUrl(
            $article.find(selectors.link).attr('href') ||
            $article.find('a').first().attr('href'),
            url
          );
          
          const description = $article.find(selectors.description).text().trim() ||
                            $article.find('p').first().text().trim() ||
                            '';
          
          // Try to get date from datetime attribute first, then text
          const $dateElem = $article.find(selectors.date).first();
          let pubDate = null;
          
          if ($dateElem.length > 0 && $dateElem.attr('datetime')) {
            pubDate = this.parseDate($dateElem.attr('datetime'));
          }
          
          if (!pubDate) {
            const dateText = $dateElem.text().trim();
            pubDate = this.parseDate(dateText);
          }
          
          if (!pubDate) {
            pubDate = new Date();
          }
          
          const imageUrl = this.resolveUrl(
            $article.find(selectors.image).attr('src') ||
            $article.find('img').first().attr('src'),
            url
          );
          
          if (title && link) {
            articles.push({
              title: title.substring(0, 200),
              link,
              description: description.substring(0, 500),
              pubDate,
              imageUrl,
              guid: link
            });
          }
        });
      }
      
      if (articles.length === 0) {
        const genericArticles = this.tryGenericScraping($, url);
        articles.push(...genericArticles);
      }
      
      return { articles, pageTitle };
      
    } finally {
      await page.close();
    }
  }

  getSelectorsForDomain(domain) {
    const selectorMap = {
      'seattletimes.com': {
        article: '[data-testid="story-list"] article, main article, .story-list article, [class*="StoryCard"], [class*="story-card"], .package-item',
        title: 'h2, h3, [class*="headline"], .headline, a[href*="/2024/"] h2, a[href*="/2025/"] h2',
        link: 'a[href*="/2024/"], a[href*="/2025/"], a[href*="/sports/"], a[href*="/seattle/"]',
        description: '[class*="summary"], .summary, .excerpt, p',
        date: 'time, [class*="timestamp"], .date',
        image: 'img[src*="seattle"], img[data-src], picture img'
      },
      'www.seattletimes.com': {
        article: '[data-testid="story-list"] article, main article, .story-list article, [class*="StoryCard"], [class*="story-card"], .package-item',
        title: 'h2, h3, [class*="headline"], .headline, a[href*="/2024/"] h2, a[href*="/2025/"] h2',
        link: 'a[href*="/2024/"], a[href*="/2025/"], a[href*="/sports/"], a[href*="/seattle/"]',
        description: '[class*="summary"], .summary, .excerpt, p',
        date: 'time, [class*="timestamp"], .date',
        image: 'img[src*="seattle"], img[data-src], picture img'
      },
      default: {
        article: 'article, .post, .entry, .item, .story, .article-item, [class*="article"], [class*="post"]',
        title: 'h1, h2, h3, .title, .headline, [class*="title"], [class*="headline"]',
        link: 'a[href]',
        description: 'p, .summary, .excerpt, .description, [class*="summary"], [class*="excerpt"]',
        date: 'time, .date, .published, [class*="date"], [class*="time"]',
        image: 'img'
      }
    };
    
    return selectorMap[domain] || selectorMap.default;
  }

  tryGenericScraping($, url) {
    const articles = [];
    
    $('a[href]').each((index, element) => {
      if (index >= 20) return false;
      
      const $link = $(element);
      const href = $link.attr('href');
      
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }
      
      const title = $link.text().trim() || 
                   $link.attr('title') || 
                   $link.find('h1, h2, h3, h4').text().trim();
      
      if (title && title.length > 10 && title.length < 200) {
        const link = this.resolveUrl(href, url);
        
        const $parent = $link.parent();
        const description = $parent.find('p').first().text().trim() ||
                          $parent.text().replace(title, '').trim().substring(0, 200);
        
        articles.push({
          title,
          link,
          description: description || title,
          pubDate: new Date(),
          guid: link
        });
      }
    });
    
    return articles.slice(0, 20);
  }

  resolveUrl(relativeUrl, baseUrl) {
    if (!relativeUrl) return null;
    
    try {
      if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
        return relativeUrl;
      }
      
      const base = new URL(baseUrl);
      return new URL(relativeUrl, base).href;
    } catch (e) {
      return null;
    }
  }

  parseDate(dateText) {
    if (!dateText) return null;
    
    try {
      const date = new Date(dateText);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new Scraper();