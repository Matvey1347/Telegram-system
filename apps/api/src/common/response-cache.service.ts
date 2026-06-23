import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

/** Small per-instance cache for expensive read models. Never stores mutations or secrets. */
@Injectable()
export class ResponseCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async getOrSet<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const inFlight = this.pending.get(key) as Promise<T> | undefined;
    if (inFlight) return inFlight;

    const request = load()
      .then((value) => {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
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

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
