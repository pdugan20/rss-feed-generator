const { resolveUrl, parseDate } = require('../extract');

function extract($, url) {
  const articles = [];

  // Try structured extraction with generic selectors
  $(
    'article, .post, .entry, .item, .story, .article-item, [class*="article"], [class*="post"]'
  ).each((_index, element) => {
    if (articles.length >= 20) return false;

    const $article = $(element);

    const title =
      $article
        .find('h1, h2, h3, .title, .headline, [class*="title"], [class*="headline"]')
        .first()
        .text()
        .trim() || $article.find('h1, h2, h3, h4').first().text().trim();

    const link = resolveUrl(
      $article.find('a[href]').attr('href') || $article.find('a').first().attr('href'),
      url
    );

    const description =
      $article
        .find('p, .summary, .excerpt, .description, [class*="summary"], [class*="excerpt"]')
        .text()
        .trim() ||
      $article.find('p').first().text().trim() ||
      '';

    const $dateElem = $article
      .find('time, .date, .published, [class*="date"], [class*="time"]')
      .first();
    let pubDate = null;

    if ($dateElem.length > 0 && $dateElem.attr('datetime')) {
      pubDate = parseDate($dateElem.attr('datetime'));
    }
    if (!pubDate && $dateElem.length > 0) {
      pubDate = parseDate($dateElem.text().trim());
    }

    const imageUrl = resolveUrl(
      $article.find('img').attr('src') || $article.find('img').first().attr('src'),
      url
    );

    if (title && link) {
      articles.push({
        title: title.substring(0, 200),
        link,
        description: description.substring(0, 500),
        pubDate,
        imageUrl,
        guid: link,
      });
    }
  });

  // Last resort: scan all links
  if (articles.length === 0) {
    $('a[href]').each((_index, element) => {
      if (articles.length >= 20) return false;

      const $link = $(element);
      const href = $link.attr('href');

      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      const title =
        $link.text().trim() || $link.attr('title') || $link.find('h1, h2, h3, h4').text().trim();

      if (title && title.length > 10 && title.length < 200) {
        const link = resolveUrl(href, url);
        const $parent = $link.parent();
        const description =
          $parent.find('p').first().text().trim() ||
          $parent.text().replace(title, '').trim().substring(0, 200);

        articles.push({
          title,
          link,
          description: description || title,
          pubDate: null,
          guid: link,
        });
      }
    });

    return articles.slice(0, 20);
  }

  return articles;
}

module.exports = { extract };
