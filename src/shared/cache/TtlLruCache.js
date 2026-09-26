const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * A `Map` used as an insertion-ordered LRU with a size cap and a per-entry TTL.
 *
 * Both bounds are needed: the cap stops a per-guild cache growing forever, and the TTL covers
 * writes made outside this process (other bot instances and the website share one cluster).
 * Callers choose `maxSize`/`ttlMs`, because the right TTL depends on who else writes the data.
 */
export default class TtlLruCache {
  constructor({ maxSize = DEFAULT_MAX_SIZE, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  /** A hit refreshes recency but not the TTL, so a hot value is still re-read eventually. */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Delete-then-set moves the entry to the end of the Map's insertion order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /** Resets the TTL. A new key at `maxSize` evicts the least-recently-used entry first. */
  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }

    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}
