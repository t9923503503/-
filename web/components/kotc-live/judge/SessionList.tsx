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
    <section className="mt-5 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-3xl text-text-primary tracking-wide">Select Session</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-body text-text-primary hover:border-brand/40 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <p className="text-sm text-text-secondary">Loading active sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface-light/30 p-4 text-sm text-text-secondary">
          No active KOTC live sessions found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              onClick={() => onSelect(session.sessionId)}
              className="rounded-xl border border-white/10 bg-surface-light/30 p-6 text-left hover:border-brand/50 transition-colors"
            >
              <div className="font-body text-lg font-semibold text-text-primary">
                {session.title || session.sessionId}
              </div>
              <div className="mt-2 text-sm text-text-secondary font-body">
                ID: {session.sessionId} • Courts: {session.nc}
              </div>
              <div className="mt-1 text-sm text-text-secondary flex gap-2">
                <span className="bg-surface/50 px-2 py-0.5 rounded border border-white/5">
                  status: {session.status || "-"}
                </span>
                <span className="bg-surface/50 px-2 py-0.5 rounded border border-white/5">
                  phase: {session.phase || "-"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
