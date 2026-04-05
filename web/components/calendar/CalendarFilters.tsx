"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatTournamentMonthLabel,
  hasActiveCalendarFilters,
  type CalendarFilterOptions,
  type CalendarFilterState,
} from "@/lib/calendar";

const levelLabels: Record<string, string> = {
  hard: "Hard",
  advance: "Advance",
  medium: "Medium",
  easy: "Lite",
};

const statusLabels: Record<string, string> = {
  all: "Все",
  open: "Открыта запись",
  full: "Лист ожидания",
  finished: "Завершённые",
  cancelled: "Отменённые",
};

export default function CalendarFilters({
  filters,
  options,
  totalCount,
  visibleCount,
}: {
  filters: CalendarFilterState;
  options: CalendarFilterOptions;
  totalCount: number;
  visibleCount: number;
}) {
  const [open, setOpen] = useState(false);
  const hasActiveFilters = hasActiveCalendarFilters(filters);

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-surface-light/20 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-heading text-2xl text-text-primary tracking-wide uppercase">
            Фильтры
          </h2>
          <p className="mt-1 font-body text-sm text-text-secondary">
            Показано {visibleCount} из {totalCount} турниров.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveFilters && (
            <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-body uppercase tracking-wide text-brand-light">
              Активные фильтры
            </span>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="calendar-filters-panel"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-body font-semibold text-white transition-colors hover:bg-brand-light"
          >
            <span>{open ? "Скрыть фильтры" : "Показать фильтры"}</span>
            <svg
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <Link
            href="/calendar"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-body text-text-primary/80 transition-colors hover:border-brand hover:text-text-primary"
          >
            Сбросить
          </Link>
        </div>
      </div>

      {open && (
        <form
          id="calendar-filters-panel"
          method="GET"
          className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <label className="block xl:col-span-2">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Поиск
            </span>
            <input
              type="text"
              name="q"
              defaultValue={filters.query}
              placeholder="Турнир, клуб или формат"
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Месяц
            </span>
            <select
              name="month"
              defaultValue={filters.month}
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            >
              <option value="">Все месяцы</option>
              {options.months.map((month) => (
                <option key={month} value={month}>
                  {formatTournamentMonthLabel(month)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Статус
            </span>
            <select
              name="status"
              defaultValue={filters.status}
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Формат
            </span>
            <select
              name="format"
              defaultValue={filters.format}
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            >
              <option value="">Все форматы</option>
              {options.formats.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Дивизион
            </span>
            <select
              name="division"
              defaultValue={filters.division}
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            >
              <option value="">Все дивизионы</option>
              {options.divisions.map((division) => (
                <option key={division} value={division}>
                  {division}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
              Уровень
            </span>
            <select
              name="level"
              defaultValue={filters.level}
              className="mt-2 w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
            >
              <option value="">Все уровни</option>
              {options.levels.map((level) => (
                <option key={level} value={level}>
                  {levelLabels[level] || level}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-body text-text-primary">
            <input
              type="checkbox"
              name="available"
              value="1"
              defaultChecked={filters.available}
              className="accent-brand"
            />
            Только с доступными местами
          </label>

          <div className="flex items-center">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-body font-semibold text-white transition-colors hover:bg-brand-light"
            >
              Применить
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
