const { getExtractorName } = require('./feeds');

const extractors = {
  'seattle-times': require('./extractors/seattle-times'),
  anthropic: require('./extractors/anthropic'),
  'claude-blog': require('./extractors/claude-blog'),
  generic: require('./extractors/generic'),
};

function getExtractor(url) {
  const name = getExtractorName(url);
  return extractors[name] || extractors.generic;
}

function resolveUrl(relativeUrl, baseUrl) {
  if (!relativeUrl) return null;

  try {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    const base = new URL(baseUrl);
    return new URL(relativeUrl, base).href;
  } catch {
    return null;
  }
}

function parseDate(dateText) {
  if (!dateText) return null;

  try {
    const date = new Date(dateText);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

module.exports = { getExtractor, resolveUrl, parseDate };
