import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextState } from './request-context.types';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run<T>(state: RequestContextState, callback: () => T) {
    return this.storage.run(state, callback);
  }

  get() {
    return this.storage.getStore() ?? null;
  }

  getOrFallback() {
    return (
      this.storage.getStore() ?? {
        correlationId: '',
        requestId: '',
      }
    );
  }

  set(values: Partial<RequestContextState>) {
    const current = this.storage.getStore();
    if (!current) return;
    Object.assign(current, values);
  }
}
