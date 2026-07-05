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
    const workspaceId = this.workspaceId(request);

    if (
      !userId ||
      !method ||
      url.includes('/health') ||
      this.isAuthMutation(url)
    )
      return next.handle();

    if (method !== 'GET') {
      this.invalidateScope(userId, workspaceId);
      return next.handle();
    }

    if (!this.isCacheableGet(url)) return next.handle();

    const key = `${this.scopePrefix(userId, workspaceId)}:${method}:${url}`;
    return from(
      this.cache.getOrSet(key, this.ttl(url), () =>
        firstValueFrom(next.handle()),
      ),
    );
  }

  private ttl(url: string) {
    if (url.includes('/global-search')) return 7_000;
    if (url.includes('/dashboard/')) return 45_000;
    if (url === '/auth/me' || url.startsWith('/auth/me?')) return 5 * 60_000;
    if (url === '/account/me' || url.startsWith('/account/me?'))
      return 5 * 60_000;
    if (url.startsWith('/workspaces')) return 5 * 60_000;
    if (url.startsWith('/icons')) return 10 * 60_000;
    if (url.startsWith('/telegram-channels/post-groups')) return 90_000;
    if (/^\/telegram-channels\/[^/]+\/managed-posts(?:\?|$)/.test(url))
      return 90_000;
    if (url.startsWith('/telegram-channels')) return 90_000;
    if (
      url.startsWith('/workspace-members') ||
      url.startsWith('/currencies') ||
      url.startsWith('/finance/categories')
    ) {
      return 5 * 60_000;
    }
    return 60_000;
  }

  private workspaceId(request: RequestWithUser) {
    const workspaceHeader = request.headers['x-workspace-id'];
    return Array.isArray(workspaceHeader)
      ? (workspaceHeader[0] ?? '')
      : (workspaceHeader ?? '');
  }

  private scopePrefix(userId: string, workspaceId: string) {
    return `api:${userId}:${workspaceId || 'no-workspace'}`;
  }

  private invalidateScope(userId: string, workspaceId: string) {
    if (workspaceId)
      this.cache.clearByPrefix(this.scopePrefix(userId, workspaceId));
    this.cache.clearByPrefix(this.scopePrefix(userId, ''));
  }

  private isCacheableGet(url: string) {
    if (this.isNeverCached(url)) return false;
    if (url.startsWith('/auth/') && !url.startsWith('/auth/me')) return false;
    return true;
  }

  private isNeverCached(url: string) {
    if (url.includes('/health')) return true;
    if (this.isAuthMutation(url)) return true;
    if (/\/(sync|export|check|last-run|runs|stream)(?:\?|\/|$)/.test(url))
      return true;
    if (/\/sync(?:[/-]|\?|$)/.test(url)) return true;
    if (/(?:^|[-/])stream(?:\?|\/|$)/.test(url)) return true;
    return false;
  }

  private isAuthMutation(url: string) {
    return /\/(login|register|logout)(?:\?|\/|$)/.test(url);
  }
}
