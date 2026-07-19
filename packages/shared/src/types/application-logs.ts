export type ApplicationLogLevel = "debug" | "info" | "warn" | "error";

export type ApplicationLogKind =
  | "http"
  | "application"
  | "integration"
  | "cron"
  | "client"
  | "audit";

export type ApplicationLogUserOption = {
  id: string;
  name: string;
  email: string;
};

export type ApplicationLog = {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  level: ApplicationLogLevel;
  kind: ApplicationLogKind;
  environment: string;
  service: string;
  source: string | null;
  event: string;
  message: string;
  correlationId: string | null;
  requestId: string | null;
  method: string | null;
  endpoint: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  errorName: string | null;
  errorCode: string | null;
  stack: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string | null;
  user?: ApplicationLogUserOption | null;
};

export type ApplicationLogsQuery = {
  cursor?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  levels?: ApplicationLogLevel[];
  kinds?: ApplicationLogKind[];
  sources?: string[];
  events?: string[];
  methods?: string[];
  endpoint?: string;
  statusCode?: number;
  statusCodeFrom?: number;
  statusCodeTo?: number;
  correlationId?: string;
  userId?: string;
  search?: string;
};

export type ApplicationLogsListResult = {
  items: ApplicationLog[];
  nextCursor: string | null;
  hasMore: boolean;
  filters: ApplicationLogsQuery;
};

export type ApplicationLogsFilterOptions = {
  levels: ApplicationLogLevel[];
  kinds: ApplicationLogKind[];
  sources: string[];
  events: string[];
  endpoints: string[];
  users: ApplicationLogUserOption[];
};

export type ApplicationLogsDeleteResult = {
  success: true;
  deletedCount: number;
};

export type ClientApplicationLogPayload = {
  message: string;
  stack?: string | null;
  route?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
};
