"use client";

import type { KotcSessionSummary } from "../types";

interface SessionListProps {
  sessions: KotcSessionSummary[];
  loading: boolean;
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
}

export function SessionList({ sessions, loading, onSelect, onRefresh }: SessionListProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.15),transparent_24%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-[0_24px_100px_rgba(0,0,0,0.32)] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">Live Sessions</div>
            <h2 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary sm:text-4xl">
              Выберите турнир
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Сначала вход в активную сессию, потом выбор корта. Лишние экраны убраны, чтобы судья с телефона доходил
              до работы за пару тапов.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {loading ? "Обновление" : "Обновить"}
          </button>
        </div>

        {loading && sessions.length === 0 ? (
          <div className="py-8 text-sm text-text-secondary">Ищем активные KOTC-сессии...</div>
        ) : sessions.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-text-secondary">
            Активных KOTC-сессий сейчас нет.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => onSelect(session.sessionId)}
                className="group overflow-hidden rounded-[22px] border border-white/10 bg-black/20 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/45 hover:bg-black/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-text-secondary">Сессия</div>
                    <div className="mt-2 font-heading text-xl uppercase tracking-[0.06em] text-text-primary sm:text-2xl">
                      {session.title || session.sessionId}
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                    {session.phase || "setup"}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">Session Id</div>
                    <div className="mt-2 truncate text-sm text-text-primary">{session.sessionId}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">Корты</div>
                    <div className="mt-2 text-2xl font-heading text-text-primary">{session.nc}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">Статус</div>
                    <div className="mt-2 text-sm uppercase tracking-[0.18em] text-text-primary">{session.status || "-"}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-xs uppercase tracking-[0.22em] text-text-secondary">Открыть судейство</span>
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-light transition group-hover:bg-brand/20">
                    Войти
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
