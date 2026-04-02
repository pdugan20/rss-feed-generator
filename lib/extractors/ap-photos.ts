import type { Article } from '../types';

// API feeds bypass DOM extraction; see lib/api-fetchers/ap-photos.ts
function extract(): Article[] {
  return [];
}

export { extract };
