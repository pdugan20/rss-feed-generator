const feeds = [
  {
    url: 'https://www.seattletimes.com/sports/washington-huskies-football/',
    extractor: 'seattle-times',
    label: 'huskies',
  },
  {
    url: 'https://www.seattletimes.com/sports/mariners/',
    extractor: 'seattle-times',
    label: 'mariners',
  },
];

const feedUrls = feeds.map((f) => f.url);

function getExtractorName(url) {
  const entry = feeds.find((f) => f.url === url);
  return entry ? entry.extractor : null;
}

module.exports = { feeds, feedUrls, getExtractorName };
