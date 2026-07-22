"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, CustomSelect } from "@/components/ui/primitives";

type PaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading?: boolean;
  disabled?: boolean;
};

function buildPageItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-left", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis-right",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis-left", page - 1, page, page + 1, "ellipsis-right", totalPages];
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onPageSizeChange,
  loading = false,
  disabled = false,
}: PaginationProps) {
  const isDisabled = disabled || loading || totalItems === 0;
  const shouldRender = totalItems > 25 && totalPages > 1;

  if (!shouldRender) {
    return null;
  }

  const pageItems = buildPageItems(page, totalPages);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-3 text-sm text-slate-300 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-slate-400">
        <span>
          Showing{" "}
          <span className="text-slate-200">
            {(page - 1) * pageSize + 1}
          </span>
          {" "}to{" "}
          <span className="text-slate-200">
            {Math.min(page * pageSize, totalItems)}
          </span>
          {" "}of{" "}
          <span className="text-slate-200">{totalItems.toLocaleString()}</span>
          {" "}results
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <CustomSelect
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          disabled={disabled || loading}
          searchable={false}
          options={[10, 25, 50, 100].map((size) => ({
            value: String(size),
            label: `${size} / page`,
          }))}
        />
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <Button
            type="button"
            variant="secondary"
            disabled={isDisabled || !hasPreviousPage}
            onClick={() => onPageChange(page - 1)}
            className="rounded-none border-0 bg-transparent px-3 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </Button>
          {pageItems.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                disabled={isDisabled}
                onClick={() => onPageChange(item)}
                className={`min-w-12 border-l border-slate-800 px-4 py-2 text-sm font-medium transition ${
                  item === page
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800"
                } disabled:opacity-50`}
              >
                {item}
              </button>
            ) : (
              <span
                key={item}
                className="min-w-12 border-l border-slate-800 px-4 py-2 text-center text-slate-500"
              >
                ...
              </span>
            ),
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={isDisabled || !hasNextPage}
            onClick={() => onPageChange(page + 1)}
            className="rounded-none border-l border-0 border-slate-800 bg-transparent px-3 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
