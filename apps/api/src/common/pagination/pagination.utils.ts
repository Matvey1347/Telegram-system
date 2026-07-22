import type {
  PaginatedResponse,
  PaginationMeta,
} from '@telegram-system/shared';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type NormalizedPagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function normalizePagination(input?: {
  page?: number | null;
  pageSize?: number | null;
}): NormalizedPagination {
  const page = Math.max(DEFAULT_PAGE, Math.trunc(input?.page ?? DEFAULT_PAGE));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(DEFAULT_PAGE, Math.trunc(input?.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginationMeta(
  totalItems: number,
  pagination: Pick<NormalizedPagination, 'page' | 'pageSize'>,
): PaginationMeta {
  const normalizedTotalItems = Math.max(0, Math.trunc(totalItems));
  const totalPages =
    normalizedTotalItems === 0
      ? 0
      : Math.ceil(normalizedTotalItems / pagination.pageSize);

  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: normalizedTotalItems,
    totalPages,
    hasNextPage: totalPages > 0 && pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1 && totalPages > 0,
  };
}

export function createPaginatedResponse<T>(
  items: T[],
  totalItems: number,
  pagination: Pick<NormalizedPagination, 'page' | 'pageSize'>,
): PaginatedResponse<T> {
  return {
    items,
    pagination: buildPaginationMeta(totalItems, pagination),
  };
}
