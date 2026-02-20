import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate, estimateReadingTime } from '../extract';
import type { Article } from '../types';

function extract($: CheerioAPI, _url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = 'https://claude.com';

  // Strategy 1: Webflow CMS items
  $('.blog_cms_item').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $item = $(element);

    // Find the link to the blog post
    const $link = $item.find('a[href*="/blog/"]').first();
    if (!$link.length) return;

    const href = $link.attr('href');
    if (!href || href === '/blog' || href === '/blog/') return;
    if (href.includes('/blog/category/')) return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || seenUrls.has(fullUrl)) return;

    // Extract title
    const title =
      $item.find('.card_blog_title').first().text().trim() ||
      $item.find('h2, h3, h4, [class*="title"]').first().text().trim() ||
      $link.text().trim();

    if (!title || title.length < 5) return;

    seenUrls.add(fullUrl);

    // Extract date from metadata
    let pubDate: Date | null = null;
    const $meta = $item
      .find('.card_blog_list_meta, .u-text-style-caption, [class*="meta"], [class*="date"]')
      .first();
    if ($meta.length > 0) {
      const $time = $meta.find('time');
      if ($time.length > 0) {
        pubDate = parseDate($time.attr('datetime')) || parseDate($time.text().trim());
      }
      if (!pubDate) {
        pubDate = parseDate($meta.text().trim());
      }
    }

    // Extract description
    const description =
      $item
        .find('[class*="description"], [class*="excerpt"], [class*="summary"], p')
        .first()
        .text()
        .trim() || '';

    // Extract categories
    const categories: string[] = [];
    $item.find('[class*="category"], [class*="tag"], .card_blog_category').each((_i, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    // Extract image
    let imageUrl: string | null = null;
    const $img = $item.find('.card_blog_visual_wrap img, img').first();
    if ($img.length > 0) {
      const imgSrc = $img.attr('src') || $img.attr('data-src');
      imageUrl = resolveUrl(imgSrc, baseUrl);
    }

    articles.push({
      title: title.substring(0, 200),
      link: fullUrl,
      description: description.substring(0, 500),
      pubDate,
      imageUrl,
      guid: fullUrl,
      categories: categories.length > 0 ? categories : undefined,
    });
  });

  // Strategy 2: Fallback - scan for /blog/ links if no CMS items found
  if (articles.length === 0) {
    $('a[href*="/blog/"]').each((_index, element) => {
      if (articles.length >= 20) return false;

      const $link = $(element);
      const href = $link.attr('href');

      if (!href || href === '/blog' || href === '/blog/') return;
      if (href.includes('/blog/category/')) return;
      if (href.startsWith('#') || href.startsWith('javascript:')) return;

      const fullUrl = resolveUrl(href, baseUrl);
      if (!fullUrl || seenUrls.has(fullUrl)) return;

      const title = $link.text().trim();
      if (!title || title.length < 10) return;

      seenUrls.add(fullUrl);

      const $parent = $link.parent();
      const description =
        $parent.find('[class*="description"], [class*="excerpt"], p').first().text().trim() || '';

      articles.push({
        title: title.substring(0, 200),
        link: fullUrl,
        description: description.substring(0, 500),
        pubDate: null,
        imageUrl: null,
        guid: fullUrl,
      });
    });
  }

  return articles;
}

function enrichArticle(
  $: CheerioAPI,
  _url: string
): { description?: string; readingTime?: number } {
  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('article p, .blog-content p, main p').first().text().trim() ||
    '';

  // Extract article body text for word count - use specific content selectors
  // to avoid counting nav, footer, and sidebar text
  const $content = $('.u-rich-text-blog').first();
  const bodyText =
    $content.length > 0
      ? $content.text().trim()
      : $('article p, .blog-content p, main p')
          .map((_i, el) => $(el).text())
          .get()
          .join(' ')
          .trim();
  const readingTime = bodyText.length > 0 ? estimateReadingTime(bodyText) : undefined;

  return { description: desc.substring(0, 500) || undefined, readingTime };
}

export { extract, enrichArticle };
