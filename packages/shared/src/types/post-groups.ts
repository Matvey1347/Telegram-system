export type BulkActionResultItem = {
  postId: string;
  title?: string;
  index: number;
  total: number;
  previousStatus?: string;
  newStatus?: string;
  scheduledAt?: string | null;
  action:
    | "PUBLISHED"
    | "SCHEDULED"
    | "MOVED"
    | "CONVERTED_TO_DRAFT"
    | "SKIPPED"
    | "FAILED";
  success: boolean;
  skipped?: boolean;
  message?: string;
  error?: string;
};

export type BulkActionResult = {
  groupId?: string;
  postId?: string;
  action:
    | "PUBLISH_ALL"
    | "SCHEDULE_SEQUENCE"
    | "MOVE_GROUP_CHANNEL"
    | "MOVE_POST_CHANNEL";
  total: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  results: BulkActionResultItem[];
};
