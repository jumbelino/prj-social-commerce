"use client";

import React from "react";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  page = 1,
  pageSize = 10,
  total,
  onPageChange,
  emptyMessage = "No data available",
  isLoading = false,
}: DataTableProps<T>) {
  const totalPages = total ? Math.ceil(total / pageSize) : 1;
  const showPagination = total !== undefined && total > pageSize;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
          <span className="ml-2 text-[var(--color-muted)]">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-bg-soft)]">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-[var(--color-muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={index}
                  className={`border-b border-[var(--color-line)] transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-[var(--color-bg-soft)]"
                      : ""
                  }`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className="px-4 py-3 text-sm text-[var(--color-text)]"
                    >
                      {column.render
                        ? column.render(item)
                        : (item[column.key as keyof T] as React.ReactNode) ?? "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between border-t border-[var(--color-line)] px-4 py-3">
          <div className="text-xs text-[var(--color-muted)]">
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, total)} of {total} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--color-muted)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
