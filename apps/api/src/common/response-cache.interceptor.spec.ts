import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { ResponseCacheInterceptor } from './response-cache.interceptor';
import { ResponseCacheService } from './response-cache.service';

describe('ResponseCacheInterceptor', () => {
  const httpContext = (request: {
    method: string;
    originalUrl: string;
    headers: Record<string, string | undefined>;
    user?: { sub?: string };
  }): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  it('caches GET telegram channel responses', async () => {
    const cache = {
      getOrSet: jest.fn(async (_key, _ttl, load) => load()),
      clearByPrefix: jest.fn(),
    } as unknown as ResponseCacheService;
    const interceptor = new ResponseCacheInterceptor(cache);

    const result = await lastValueFrom(
      interceptor.intercept(
        httpContext({
          method: 'GET',
          originalUrl: '/telegram-channels/cm123',
          headers: { 'x-workspace-id': 'ws-1' },
          user: { sub: 'user-1' },
        }),
        { handle: () => of({ ok: true }) } as CallHandler,
      ),
    );

    expect(result).toEqual({ ok: true });
    expect(cache.getOrSet).toHaveBeenCalledTimes(1);
    expect((cache.getOrSet as jest.Mock).mock.calls[0][0]).toBe(
      'api:user-1:ws-1:GET:/telegram-channels/cm123',
    );
  });

  it('invalidates cache only after a successful mutation response', async () => {
    const cache = {
      getOrSet: jest.fn(),
      clearByPrefix: jest.fn(),
    } as unknown as ResponseCacheService;
    const interceptor = new ResponseCacheInterceptor(cache);

    const response$ = interceptor.intercept(
      httpContext({
        method: 'POST',
        originalUrl: '/telegram-channels/cm123/sync-now',
        headers: { 'x-workspace-id': 'ws-1' },
        user: { sub: 'user-1' },
      }),
      { handle: () => of({ status: 'success' }) } as CallHandler,
    );

    expect(cache.clearByPrefix).not.toHaveBeenCalled();

    const result = await lastValueFrom(response$);

    expect(result).toEqual({ status: 'success' });
    expect(cache.clearByPrefix).toHaveBeenNthCalledWith(1, 'api:user-1:ws-1');
    expect(cache.clearByPrefix).toHaveBeenNthCalledWith(
      2,
      'api:user-1:no-workspace',
    );
  });
});
