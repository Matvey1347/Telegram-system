import type { BulkActionResultItem } from "./post-groups";

export type OperationStatus = "success" | "partial" | "failed" | "skipped";

export type TelegramChannelAccessMode =
  | "PUBLIC"
  | "PRIVATE"
  | "PRIVATE_INVITE"
  | "PRIVATE_JOIN_REQUEST"
  | "UNKNOWN";

export type SyncStepResult = {
  step: string;
  status: Exclude<OperationStatus, "partial">;
  errorCode: string | null;
  message: string;
  durationMs: number;
  metadata: Record<string, unknown>;
};

export type SyncOperationResult = {
  status: Exclude<OperationStatus, "skipped">;
  source: string;
  steps: SyncStepResult[];
};

export type StructuredApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

export type BulkProgressEvent<TItem = BulkActionResultItem> = {
  type: "progress";
  item: TItem;
  current: number;
  total: number;
};

export type StreamCompleteEvent<TResult> = {
  type: "complete";
  result: TResult;
};

export type StreamErrorEvent = {
  type: "error";
  message: string;
};

export type StreamEvent<TResult, TItem = BulkActionResultItem> =
  | BulkProgressEvent<TItem>
  | StreamCompleteEvent<TResult>
  | StreamErrorEvent;
