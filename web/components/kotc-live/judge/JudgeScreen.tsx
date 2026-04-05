"use client";

import type { ReactNode } from "react";
import type { KotcCourtState } from "../types";
import {
  formatMs,
  getCourtPairs,
  getRemainingMs,
  getRoundCount,
  getCourtServeState,
  getStageLabel,
  KOTC_CARD_TONES,
} from "./utils";

interface JudgeScreenProps {
  courtIdx: number;
  court: KotcCourtState | undefined;
  clockOffsetMs: number;
  phase?: string;
  nc: number;
  ppc: number;
  onScore: (slotIdx: number, nextScore: number | null) => void;
  onServerTap: (slotIdx: number, playerIdx: number) => void;
  onTimer: (action: "start" | "pause" | "reset" | "plus15" | "minus15") => void;
  onRoundChange: (roundIdx: number) => void;
  onLeave: () => void;
  readOnly?: boolean;
}

function TimerButton({
  children,
  tone,
  onClick,
}: {
  children: ReactNode;
  tone: "primary" | "neutral";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "primary"
          ? "rounded-2xl border border-emerald-400/35 bg-emerald-500/18 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100 transition active:scale-[0.98]"
          : "rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/90 transition active:scale-[0.98]"
      }
    >
      {children}
    </button>
  );
}

function ServeBallIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-[#ffd52d]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M7 7c2 1.5 3.4 4 4 8" />
      <path d="M17 7c-2 1.5-3.4 4-4 8" />
      <path d="M6.5 14.5c2.2-.2 4.8.2 7 1.5" />
    </svg>
  );
}

function ServerPlayerButton({
  label,
  name,
  active,
  disabled,
  onClick,
}: {
  label: string;
  name: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const content = (
    <>
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/60">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        {active ? <ServeBallIcon /> : <span className="h-4 w-4 rounded-full border border-white/10 bg-white/5" />}
        <span className={active ? "text-xl font-semibold text-white sm:text-2xl" : "text-xl text-white/80 sm:text-2xl"}>
          {name}
        </span>
      </div>
    </>
  );

  if (disabled) {
    return (
      <div
        className={`rounded-2xl border px-3 py-3 ${
          active ? "border-[#ffd52d]/35 bg-[#ffd52d]/10" : "border-white/10 bg-white/5"
        }`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
        active ? "border-[#ffd52d]/45 bg-[#ffd52d]/12" : "border-white/10 bg-white/5 hover:bg-white/8"
      }`}
    >
      {content}
    </button>
  );
}

export function JudgeScreen({
  courtIdx,
  court,
  clockOffsetMs,
  phase,
  nc,
  ppc,
  onScore,
  onServerTap,
  onTimer,
  onRoundChange,
  onLeave,
  readOnly = false,
}: JudgeScreenProps) {
  const roundCount = getRoundCount(ppc);
  const activeRound = Math.max(0, Math.min(roundCount - 1, Number(court?.roundIdx ?? 0)));
  const pairs = getCourtPairs(court, roundCount, activeRound);
  const serveState = getCourtServeState(court, ppc);
  const waitingPair = serveState.waitingSlotIdx == null
    ? null
    : pairs.find((pair) => pair.slotIdx === serveState.waitingSlotIdx) ?? null;
  const remaining = getRemainingMs(court, clockOffsetMs);
  const stageLabel = getStageLabel(phase);
  const timerPrimary = court?.timerStatus === "running" ? "pause" : "start";

  return (
    <section className="mx-auto w-full max-w-5xl px-2 pb-8 pt-3 sm:px-4 sm:pt-5">
      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,26,40,0.98),rgba(10,14,24,0.98))] shadow-[0_26px_100px_rgba(0,0,0,0.42)]">
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.34em] text-text-secondary">
                {readOnly ? "просмотр корта" : "управление кортом"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-3xl uppercase tracking-[0.06em] text-text-primary sm:text-4xl">
                  Корт {courtIdx}
                </h2>
                <span className="rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-light">
                  {stageLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-secondary">
                  {readOnly ? "просмотр" : "судья"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onLeave}
              className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-primary transition hover:bg-white/10"
            >
              {readOnly ? "Назад" : "Сменить"}
            </button>
          </div>

          {nc > 1 ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {Array.from({ length: nc }, (_, index) => {
                const idx = index + 1;
                const active = idx === courtIdx;
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] ${
                      active
                        ? "border-brand/50 bg-brand/15 text-brand-light"
                        : "border-white/10 bg-white/5 text-text-secondary"
                    }`}
                  >
                    К{idx}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-[22px] border border-white/10 bg-black/20 px-3 py-3 sm:px-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Таймер</div>
                  <div className="mt-2 font-heading text-5xl leading-none tracking-[0.08em] text-[#ffd52d] sm:text-6xl">
                    {formatMs(remaining)}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-secondary">
                  {court?.timerStatus || "idle"}
                </div>
              </div>

              {!readOnly ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <TimerButton tone="primary" onClick={() => onTimer(timerPrimary)}>
                    {timerPrimary === "pause" ? "Пауза" : "Старт"}
                  </TimerButton>
                  <TimerButton tone="neutral" onClick={() => onTimer("reset")}>
                    Сброс
                  </TimerButton>
                  <TimerButton tone="neutral" onClick={() => onTimer("minus15")}>
                    -15с
                  </TimerButton>
                  <TimerButton tone="neutral" onClick={() => onTimer("plus15")}>
                    +15с
                  </TimerButton>
                </div>
              ) : null}
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/20 px-3 py-3 sm:px-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Раунды корта</div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: roundCount }, (_, roundIdx) => {
                  const active = roundIdx === activeRound;
                  return (
                    <button
                      key={roundIdx}
                      type="button"
                      onClick={() => {
                        if (readOnly) return;
                        onRoundChange(roundIdx);
                      }}
                      disabled={readOnly}
                      className={`rounded-2xl border px-2 py-3 text-center transition ${
                        active
                          ? "border-[#ffd52d]/55 bg-[#ffd52d]/15 text-[#ffe47c]"
                          : "border-white/10 bg-white/5 text-text-secondary"
                      } ${readOnly ? "cursor-default opacity-80" : "active:scale-[0.98]"}`}
                    >
                      <div className="text-lg font-semibold leading-none">{roundIdx + 1}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em]">раунд</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-text-secondary">
                Пары ротируются как в старом KOTC. Активный раунд меняет напарников на корте.
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 py-3 sm:px-5 sm:py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.28em] text-text-secondary">
              Раунд {activeRound + 1} из {roundCount}
            </div>
            <div className="text-xs text-text-secondary">
              {readOnly ? "Только просмотр" : "Нажимайте +/- прямо на карточке пары"}
            </div>
          </div>

          <div className="grid gap-3">
            {pairs.map((pair) => {
              const tone = KOTC_CARD_TONES[pair.slotIdx % KOTC_CARD_TONES.length];
              const score = Number.isFinite(pair.score) ? Number(pair.score) : 0;
              const scoreDisplay = pair.score == null ? "—" : String(score);
              const canDecrement = !readOnly && pair.score != null && score > 0;
              const canIncrement = !readOnly;
              const isActiveServePair = pair.slotIdx === serveState.activeSlotIdx;
              const waitingVisible =
                isActiveServePair &&
                waitingPair != null &&
                (waitingPair.manName !== "—" || waitingPair.womanName !== "—");

              return (
                <article
                  key={pair.slotIdx}
                  className={`overflow-hidden rounded-[22px] border ${
                    isActiveServePair ? "border-[#ffd52d]/65 shadow-[0_0_0_1px_rgba(255,213,45,0.18)]" : tone.border
                  } bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.02))]`}
                >
                  <div className={`bg-gradient-to-r ${tone.glow} px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-white/75`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>Пара {pair.slotIdx + 1}</span>
                      {isActiveServePair ? (
                        <span className="rounded-full border border-[#ffd52d]/40 bg-[#ffd52d]/12 px-2 py-1 text-[10px] text-[#ffe47c]">
                          Активная
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_112px] sm:p-4">
                    <div className="grid gap-2">
                      <ServerPlayerButton
                        label="Мужчины"
                        name={pair.manName}
                        active={isActiveServePair && serveState.activeServerPlayerIdx === 0}
                        disabled={readOnly || !isActiveServePair}
                        onClick={() => onServerTap(pair.slotIdx, 0)}
                      />
                      <ServerPlayerButton
                        label="Женщины"
                        name={pair.womanName}
                        active={isActiveServePair && serveState.activeServerPlayerIdx === 1}
                        disabled={readOnly || !isActiveServePair}
                        onClick={() => onServerTap(pair.slotIdx, 1)}
                      />
                    </div>

                    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 sm:grid-cols-1 sm:grid-rows-[68px_minmax(0,1fr)]">
                      <button
                        type="button"
                        disabled={!canDecrement}
                        onClick={() => onScore(pair.slotIdx, pair.score == null ? 0 : Math.max(0, score - 1))}
                        className={`rounded-[18px] border ${tone.button} text-3xl font-semibold transition active:scale-[0.98] disabled:opacity-35`}
                      >
                        −
                      </button>

                      <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2 sm:grid-cols-1 sm:grid-rows-[minmax(0,1fr)_84px]">
                        <div className="flex min-h-[68px] items-center justify-center rounded-[18px] border border-white/10 bg-black/20 px-3">
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-text-secondary">Очки</div>
                            <div className="mt-1 font-heading text-4xl leading-none text-white">{scoreDisplay}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canIncrement}
                          onClick={() => onScore(pair.slotIdx, score + 1)}
                          className={`rounded-[18px] border ${tone.primary} text-5xl font-semibold leading-none transition active:scale-[0.98] disabled:opacity-35`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  {waitingVisible ? (
                    <div className="border-t border-white/10 px-3 py-3 sm:px-4">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-[#ffe47c]">Следующие</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ServerPlayerButton
                          label="Мужчины"
                          name={waitingPair!.manName}
                          active={serveState.waitingServerPlayerIdx === 0}
                          disabled={readOnly}
                          onClick={() => onServerTap(waitingPair!.slotIdx, 0)}
                        />
                        <ServerPlayerButton
                          label="Женщины"
                          name={waitingPair!.womanName}
                          active={serveState.waitingServerPlayerIdx === 1}
                          disabled={readOnly}
                          onClick={() => onServerTap(waitingPair!.slotIdx, 1)}
                        />
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
