"use client";

import { useEffect, useState } from "react";

type UsePaginationOptions = {
  initialPage?: number;
  initialPageSize?: number;
  totalPages?: number;
};

export function usePagination(options: UsePaginationOptions = {}) {
  const [page, setPage] = useState(options.initialPage ?? 1);
  const [pageSize, setPageSize] = useState(options.initialPageSize ?? 25);

  useEffect(() => {
    if (!options.totalPages || options.totalPages < 1) {
      if (page !== 1) setPage(1);
      return;
    }
    if (page > options.totalPages) {
      setPage(options.totalPages);
    }
  }, [options.totalPages, page]);

  return {
    page,
    pageSize,
    setPage,
    setPageSize: (nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPage(1);
    },
    resetPage: () => setPage(1),
  };
}
