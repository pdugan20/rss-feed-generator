import type { CheerioAPI } from 'cheerio';
import { extractListingRows } from '../extract';
import type { Article } from '../types';
import { enrichArticle } from './anthropic';

// red.anthropic.com redirects to the Frontier Red Team page on anthropic.com,
// whose posts live under www.anthropic.com/research/<slug>.
function extract($: CheerioAPI, _url: string): Article[] {
  return extractListingRows($, 'https://www.anthropic.com');
}

export { extract, enrichArticle };
