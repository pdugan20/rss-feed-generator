import type { ApiFetcher } from '../types';

const apiFetchers: Record<string, ApiFetcher> = {
  'ap-photos': require('./ap-photos'),
};

function getApiFetcher(name: string): ApiFetcher | null {
  return apiFetchers[name] || null;
}

export { getApiFetcher, apiFetchers };
