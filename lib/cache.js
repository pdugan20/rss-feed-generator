const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 86400, // 24 hours in seconds
  checkperiod: 3600, // Check for expired keys every hour
  useClones: false,
  maxKeys: 100
});

cache.on('expired', (key, value) => {
  console.log(`Cache expired for key: ${key}`);
});

module.exports = cache;