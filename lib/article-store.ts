import fs from 'fs';
import path from 'path';

interface StoredArticle {
  description: string;
  readingTime?: number;
  fetchedAt: string;
}

type StoreData = Record<string, StoredArticle>;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'articles.json');
const STORE_TMP = path.join(DATA_DIR, 'articles.tmp.json');

class ArticleStore {
  private data: StoreData | null = null;

  private ensureLoaded(): StoreData {
    if (this.data !== null) return this.data;

    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        this.data = JSON.parse(raw) as StoreData;
      } else {
        this.data = {};
      }
    } catch {
      console.log('Article store: could not read file, starting fresh');
      this.data = {};
    }

    return this.data;
  }

  getDescription(url: string): string | undefined {
    const data = this.ensureLoaded();
    return data[url]?.description;
  }

  hasDescription(url: string): boolean {
    const data = this.ensureLoaded();
    return url in data && data[url].description.length > 0;
  }

  getReadingTime(url: string): number | undefined {
    const data = this.ensureLoaded();
    return data[url]?.readingTime;
  }

  setDescription(url: string, description: string): void {
    const data = this.ensureLoaded();
    data[url] = {
      ...data[url],
      description,
      fetchedAt: new Date().toISOString(),
    };
  }

  setArticleData(url: string, articleData: { description: string; readingTime?: number }): void {
    const data = this.ensureLoaded();
    data[url] = {
      description: articleData.description,
      readingTime: articleData.readingTime,
      fetchedAt: new Date().toISOString(),
    };
  }

  save(): void {
    const data = this.ensureLoaded();

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Atomic write: write to temp file, then rename
    fs.writeFileSync(STORE_TMP, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(STORE_TMP, STORE_FILE);
  }

  /** Clear readingTime from all entries to force re-enrichment */
  clearReadingTimes(): number {
    const data = this.ensureLoaded();
    let cleared = 0;
    for (const url of Object.keys(data)) {
      if (data[url].readingTime !== undefined) {
        delete data[url].readingTime;
        cleared++;
      }
    }
    return cleared;
  }

  /** Reset in-memory state (for testing) */
  reset(): void {
    this.data = null;
  }
}

export = new ArticleStore();
