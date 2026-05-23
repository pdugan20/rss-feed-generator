import type { Article } from '../types';

// API feeds bypass DOM extraction; see lib/api-fetchers/hackernews-top.ts
function extract(): Article[] {
  return [];
}

export { extract };
