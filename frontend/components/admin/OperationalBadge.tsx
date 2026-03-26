"use client";

import type { ReactNode } from "react";

import type { AdminBadgeMeta } from "@/lib/admin-order-display";

type OperationalBadgeProps = {
  meta: AdminBadgeMeta;
  prefix?: ReactNode;
  emphasized?: boolean;
};

export default function OperationalBadge({
  meta,
  prefix,
  emphasized = false,
}: OperationalBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
        emphasized ? "shadow-sm" : ""
      } ${meta.className}`}
    >
      {prefix ? <span className="opacity-80">{prefix}</span> : null}
      <span>{meta.label}</span>
    </span>
  );
}
