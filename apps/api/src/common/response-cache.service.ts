import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  value: T;
};

/** Small per-instance cache for expensive read models. Never stores mutations or secrets. */
@Injectable()
export class ResponseCacheService {
  private readonly maxEntries = 2_000;
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      cached.lastAccessedAt = now;
      return cached.value;
    }
    if (cached) this.entries.delete(key);

    const inFlight = this.pending.get(key) as Promise<T> | undefined;
    if (inFlight) return inFlight;

    const request = load()
      .then((value) => {
        const createdAt = Date.now();
        this.entries.set(key, {
          value,
          createdAt,
          expiresAt: createdAt + ttlMs,
          lastAccessedAt: createdAt,
        });
        this.prune();
        return value;
      })
      .finally(() => this.pending.delete(key));

    this.pending.set(key, request);
    return request;
  }

  clear() {
    this.entries.clear();
  }

  clearByPrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
    for (const key of this.pending.keys()) {
      if (key.startsWith(prefix)) this.pending.delete(key);
    }
  }

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    if (this.entries.size <= this.maxEntries) return;

    const excess = this.entries.size - this.maxEntries;
    const oldestKeys = [...this.entries.entries()]
      .sort(([, left], [, right]) => {
        if (left.lastAccessedAt !== right.lastAccessedAt) {
          return left.lastAccessedAt - right.lastAccessedAt;
        }
        return left.createdAt - right.createdAt;
      })
      .slice(0, excess)
      .map(([key]) => key);
    for (const key of oldestKeys) this.entries.delete(key);
  }
}
