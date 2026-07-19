export type RequestContextState = {
  correlationId: string;
  requestId: string;
  userId?: string | null;
  workspaceId?: string | null;
  method?: string | null;
  route?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  startedAt?: number;
};
