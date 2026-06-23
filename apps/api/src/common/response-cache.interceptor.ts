import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { firstValueFrom, from, Observable } from 'rxjs';
import { ResponseCacheService } from './response-cache.service';

type RequestWithUser = {
  method?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: { sub?: string };
};

@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: ResponseCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.sub;
    const method = request.method?.toUpperCase();
    const url = request.originalUrl ?? '';

    // Auth and health routes must always reflect the live request state.
    if (!userId || url.includes('/auth/') || url.includes('/health')) return next.handle();

    const cachePrefix = `api:${userId}:`;
    if (method !== 'GET') {
      this.cache.clear();
      return next.handle();
    }

    if (this.isLiveEndpoint(url)) return next.handle();

    const workspaceHeader = request.headers['x-workspace-id'];
    const workspaceId = Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader ?? '';
    const key = `${cachePrefix}${workspaceId}:${url}`;
    return from(this.cache.getOrSet(key, this.ttl(url), () => firstValueFrom(next.handle())));
  }

  private ttl(url: string) {
    if (url.includes('/dashboard/')) return 15_000;
    if (url.includes('/global-search')) return 5_000;
    return 10_000;
  }

  private isLiveEndpoint(url: string) {
    return /\/(sync|export|check|last-run|runs)(?:\?|\/|$)/.test(url);
  }
}
