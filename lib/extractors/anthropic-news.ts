import type { CheerioAPI } from 'cheerio';
import { resolveUrl, parseDate, estimateReadingTime } from '../extract';
import type { Article } from '../types';

// Build a slug -> hero image URL map from the Next.js RSC payload streamed
// into <script>self.__next_f.push(...)</script> blocks. The PublicationList
// rows render text-only in the DOM, so this is the only source of images
// for non-featured articles.
function buildSlugImageMap($: CheerioAPI): Map<string, string> {
  const map = new Map<string, string>();
  const slugRegex = /\\"current\\":\\"([a-z0-9-]+)\\"/g;
  const urlRegex = /\\"url\\":\\"(https:\/\/cdn\.sanity\.io\/images\/[^\\"]+)\\"/g;

  $('script').each((_i, el) => {
    const content = $(el).text();
    if (!content.includes('__next_f.push') || !content.includes('illustration')) return;

    const urls: Array<{ pos: number; url: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = urlRegex.exec(content)) !== null) {
      urls.push({ pos: m.index, url: m[1] });
    }
    if (urls.length === 0) return;

    while ((m = slugRegex.exec(content)) !== null) {
      const slug = m[1];
      if (map.has(slug)) continue;
      const slugPos = m.index;
      // Most recent image URL before this slug — posts serialize image first,
      // slug second within the same object.
      let bestUrl: string | null = null;
      for (const { pos, url } of urls) {
        if (pos < slugPos) bestUrl = url;
        else break;
      }
      if (bestUrl) map.set(slug, bestUrl);
    }
  });

  return map;
}

function slugFromHref(href: string): string | null {
  const match = href.match(/\/news\/([a-z0-9-]+)\/?$/);
  return match ? match[1] : null;
}

function extract($: CheerioAPI, _url: string): Article[] {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = 'https://www.anthropic.com';
  const slugImageMap = buildSlugImageMap($);

  $('a[href*="/news/"]').each((_index, element) => {
    if (articles.length >= 20) return false;

    const $link = $(element);
    const href = $link.attr('href');

    if (!href || href === '/news' || href === '/news/') return;
    if (href.startsWith('#') || href.startsWith('javascript:')) return;

    // Skip links inside the page footer (e.g. policy links that share /news/ paths)
    if ($link.closest('footer').length > 0) return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || seenUrls.has(fullUrl)) return;

    // Title: prefer headings, then any [class*="title"], then link text fallback.
    // The Anthropic news layout puts content inside the <a> itself, so we scope
    // selectors to $link rather than walking up to a card container.
    let title =
      $link.find('h1, h2, h3, h4').first().text().trim() ||
      $link.find('[class*="title"], [class*="headline"]').first().text().trim() ||
      '';

    if (!title) {
      // Fallback: link text minus the meta prefix (date + category)
      const $meta = $link.find('[class*="meta"]').first();
      const metaText = $meta.text().trim();
      const linkText = $link.text().trim();
      title =
        metaText && linkText.startsWith(metaText)
          ? linkText.slice(metaText.length).trim()
          : linkText;
    }

    if (!title || title.length < 5) return;

    seenUrls.add(fullUrl);

    // Description: first <p> inside the link. Avoid [class*="body"] because
    // typography classes like "body-3" are also applied to <time> elements.
    const description = $link.find('p').first().text().trim();

    // Date: <time datetime=...> or <time>text</time>
    let pubDate: Date | null = null;
    const $time = $link.find('time').first();
    if ($time.length > 0) {
      pubDate = parseDate($time.attr('datetime')) || parseDate($time.text().trim());
    }

    // Category: the single non-time <span> inside the meta block. Both the
    // featured and list-item layouts put the category there.
    const categories: string[] = [];
    const $catSpan = $link.find('[class*="meta"] span').first();
    if ($catSpan.length > 0) {
      const cat = $catSpan.text().trim();
      if (cat) categories.push(cat);
    }

    // Image: featured cards put the <img> in a <figure> sibling of the link
    // rather than inside it. Search the link first, then a tight parent
    // wrapper — only if that parent contains exactly one <a>, so we don't
    // grab images from sibling cards.
    let $img = $link.find('img').first();
    if ($img.length === 0) {
      const $parent = $link.parent();
      if ($parent.find('a').length === 1) {
        $img = $parent.find('img').first();
      }
    }
    const imgSrc = $img.attr('src') || $img.attr('data-src');
    let imageUrl = resolveUrl(imgSrc, baseUrl);
    // Next.js image-optimizer URLs (/_next/image?url=...) wrap the real CDN URL
    if (imageUrl && imageUrl.includes('/_next/image?')) {
      try {
        const wrapped = new URL(imageUrl).searchParams.get('url');
        if (wrapped) imageUrl = wrapped;
      } catch {
        // keep imageUrl as-is
      }
    }

    // Fall back to the RSC slug map for PublicationList rows that render
    // text-only — without this, anything below the FeaturedGrid has no image.
    if (!imageUrl) {
      const slug = slugFromHref(href);
      if (slug) {
        const fromMap = slugImageMap.get(slug);
        if (fromMap) imageUrl = fromMap;
      }
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

  return articles;
}

function enrichArticle(
  $: CheerioAPI,
  _url: string
): { description?: string; readingTime?: number } {
  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('article p, .post-content p, main p').first().text().trim() ||
    '';

  const bodyText = $('article p, .post-content p, main#main-content p')
    .map((_i, el) => $(el).text())
    .get()
    .join(' ')
    .trim();
  const readingTime = bodyText.length > 0 ? estimateReadingTime(bodyText) : undefined;

  return {
    description: desc.substring(0, 500) || undefined,
    readingTime,
  };
}

export { extract, enrichArticle };
