'use strict';

/**
 * shared/timer.js — Lightweight timer helpers for format pages.
 * Provides createTimer / startTimer / formatTime for standalone use.
 * The main app's full timer engine (domain/timers.js) is NOT replaced by this;
 * this module is for new format pages (thai.html etc.) that load standalone.
 *
 * ARCH A0.1
 */

/**
 * Format seconds to "MM:SS" display string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/**
 * Create a new timer state object.
 * @param {{ preset?: number }} [opts]  preset = minutes (default 10)
 * @returns {TimerState}
 */
export function createTimer({ preset = 10 } = {}) {
  const total = preset * 60;
  return {
    preset,
    total,
    remaining: total,
    running: false,
    startedAt: null,
    startRemaining: total,
    _w60: false,
    _w20: false,
  };
}

/**
 * Get the current elapsed/remaining for a timer, accounting for wall-clock drift.
 * Call this on every animation frame (does not mutate the timer).
 * @param {TimerState} timer
 * @returns {{ remaining: number, done: boolean }}
 */
export function timerSnapshot(timer) {
  if (!timer.running || timer.startedAt == null) {
    return { remaining: timer.remaining, done: timer.remaining <= 0 };
  }
  const elapsed  = (Date.now() - timer.startedAt) / 1000;
  const remaining = Math.max(0, timer.startRemaining - elapsed);
  return { remaining, done: remaining <= 0 };
}

/**
 * Start (or resume) a timer. Returns mutated copy.
 * @param {TimerState} timer
 * @returns {TimerState}
 */
export function startTimer(timer) {
  if (timer.remaining <= 0) return timer;
  return {
    ...timer,
    running: true,
    startedAt: Date.now(),
    startRemaining: timer.remaining,
  };
}

/**
 * Pause a timer. Returns mutated copy.
 * @param {TimerState} timer
 * @returns {TimerState}
 */
export function pauseTimer(timer) {
  const { remaining } = timerSnapshot(timer);
  return { ...timer, running: false, remaining };
}

/**
 * Reset a timer to its preset. Returns mutated copy.
 * @param {TimerState} timer
 * @returns {TimerState}
 */
export function resetTimer(timer) {
  const total = timer.preset * 60;
  return { ...timer, running: false, remaining: total, total,
           startedAt: null, startRemaining: total, _w60: false, _w20: false };
}

/**
 * Set a new preset (minutes) and reset. Returns mutated copy.
 * @param {TimerState} timer
 * @param {number} minutes
 * @returns {TimerState}
 */
export function setTimerPreset(timer, minutes) {
  return resetTimer({ ...timer, preset: minutes });
}

const _api = { formatTime, createTimer, timerSnapshot, startTimer, pauseTimer, resetTimer, setTimerPreset };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedTimer = _api;
    if (typeof globalThis.formatTime === 'undefined') globalThis.formatTime = formatTime;
  }
} catch (_) {}

export default _api;
