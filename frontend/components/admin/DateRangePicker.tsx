"use client";

import { useState, useMemo } from "react";

export interface DateRange {
  start: Date;
  end: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

type PresetKey = "today" | "last7days" | "last30days" | "thisMonth" | "custom";

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const presets: Record<PresetKey, DateRange | null> = {
  today: null, // computed dynamically
  last7days: null,
  last30days: null,
  thisMonth: null,
  custom: null,
};

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const today = useMemo(() => new Date(), []);

  const getPresetRange = (preset: PresetKey): DateRange => {
    switch (preset) {
      case "today":
        return { start: today, end: today };
      case "last7days":
        return { start: subDays(today, 7), end: today };
      case "last30days":
        return { start: subDays(today, 30), end: today };
      case "thisMonth":
        return { start: startOfMonth(today), end: today };
      default:
        return { start: subDays(today, 7), end: today };
    }
  };

  const getCurrentPreset = (): PresetKey => {
    const sevenDaysAgo = subDays(today, 7);
    const thirtyDaysAgo = subDays(today, 30);
    const monthStart = startOfMonth(today);

    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(value.start, today) && isSameDay(value.end, today)) {
      return "today";
    }
    if (isSameDay(value.start, sevenDaysAgo) && isSameDay(value.end, today)) {
      return "last7days";
    }
    if (isSameDay(value.start, thirtyDaysAgo) && isSameDay(value.end, today)) {
      return "last30days";
    }
    if (isSameDay(value.start, monthStart) && isSameDay(value.end, today)) {
      return "thisMonth";
    }
    return "custom";
  };

  const [preset, setPreset] = useState<PresetKey>(getCurrentPreset);

  const handlePresetChange = (newPreset: PresetKey) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      onChange(getPresetRange(newPreset));
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = parseInputDate(e.target.value);
    onChange({ start: newStart, end: value.end });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = parseInputDate(e.target.value);
    onChange({ start: value.start, end: newEnd });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={preset}
        onChange={(e) => handlePresetChange(e.target.value as PresetKey)}
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
      >
        <option value="today">Hoje</option>
        <option value="last7days">Últimos 7 dias</option>
        <option value="last30days">Últimos 30 dias</option>
        <option value="thisMonth">Este mês</option>
        <option value="custom">Personalizado</option>
      </select>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={formatDateForInput(value.start)}
            onChange={handleStartDateChange}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-muted)]">até</span>
          <input
            type="date"
            value={formatDateForInput(value.end)}
            onChange={handleEndDateChange}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
      )}
    </div>
  );
}
