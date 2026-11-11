/**
 * AssetCacheService – Phase 2 Product Integration.
 *
 * Manages a client-side LRU cache for jewellery try-on assets.
 * Preloads image overlays and 3-D model blobs so switching between
 * catalogue items happens without any network latency.
 */

type AssetEntry = {
  url:       string;
  blob:      Blob;
  objectUrl: string;
  loadedAt:  number;
  sizeBytes: number;
};

type PreloadResult = {
  url:       string;
  objectUrl: string;
  cached:    boolean;
};

const MAX_CACHE_BYTES = 80 * 1024 * 1024; // 80 MB cap
const MAX_ENTRIES     = 24;

class AssetCacheService {
  private cache   = new Map<string, AssetEntry>();
  private loading = new Map<string, Promise<PreloadResult>>();
  private totalBytes = 0;

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Preload an asset URL.  Returns a stable Object URL that can be passed
   * directly to ArEngine.  If the URL is already cached the Object URL is
   * returned immediately.
   */
  async preload(url: string): Promise<PreloadResult> {
    if (!url || url.startsWith('procedural://')) {
      return { url, objectUrl: url, cached: false };
    }

    // Cache hit
    const hit = this.cache.get(url);
    if (hit) {
      hit.loadedAt = Date.now(); // LRU touch
      return { url, objectUrl: hit.objectUrl, cached: true };
    }

    // In-flight dedup
    const inflight = this.loading.get(url);
    if (inflight) return inflight;

    const p = this._fetch(url);
    this.loading.set(url, p);

    try {
      const result = await p;
      this.loading.delete(url);
      return result;
    } catch (err) {
      this.loading.delete(url);
      throw err;
    }
  }

  /** Preload multiple URLs concurrently. Failures are swallowed. */
  async preloadMany(urls: string[]): Promise<PreloadResult[]> {
    const results = await Promise.allSettled(urls.map((u) => this.preload(u)));
    return results
      .filter((r): r is PromiseFulfilledResult<PreloadResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /** Resolve a URL through the cache, returning the Object URL if cached. */
  resolve(url: string): string {
    if (!url || url.startsWith('procedural://')) return url;
    return this.cache.get(url)?.objectUrl ?? url;
  }

  /** Purge the cache, revoking all Object URLs. */
  clear(): void {
    this.cache.forEach((e) => URL.revokeObjectURL(e.objectUrl));
    this.cache.clear();
    this.loading.clear();
    this.totalBytes = 0;
  }

  /** Revoke a single entry. */
  evict(url: string): void {
    const entry = this.cache.get(url);
    if (!entry) return;
    URL.revokeObjectURL(entry.objectUrl);
    this.totalBytes -= entry.sizeBytes;
    this.cache.delete(url);
  }

  getCacheStats() {
    return {
      entries:     this.cache.size,
      totalBytes:  this.totalBytes,
      maxBytes:    MAX_CACHE_BYTES,
      usagePct:    Math.round((this.totalBytes / MAX_CACHE_BYTES) * 100),
    };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async _fetch(url: string): Promise<PreloadResult> {
    const resp = await fetch(url, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`Asset fetch failed: ${resp.status} ${url}`);

    const blob      = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const entry: AssetEntry = {
      url,
      blob,
      objectUrl,
      loadedAt:  Date.now(),
      sizeBytes: blob.size,
    };

    this._evictIfNeeded(blob.size);
    this.cache.set(url, entry);
    this.totalBytes += blob.size;

    return { url, objectUrl, cached: false };
  }

  /** LRU eviction to stay within byte and entry caps. */
  private _evictIfNeeded(incoming: number): void {
    // Sort by LRU (oldest loadedAt first).
    const entries = [...this.cache.values()].sort((a, b) => a.loadedAt - b.loadedAt);

    while (
      entries.length > 0 &&
      (
        this.totalBytes + incoming > MAX_CACHE_BYTES ||
        this.cache.size >= MAX_ENTRIES
      )
    ) {
      const oldest = entries.shift()!;
      URL.revokeObjectURL(oldest.objectUrl);
      this.totalBytes -= oldest.sizeBytes;
      this.cache.delete(oldest.url);
    }
  }
}

// Singleton export for the web app.
export const assetCache = new AssetCacheService();
