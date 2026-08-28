'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CoachIdentityCandidate, CoachTrainingSession } from '@/lib/coach/session-types';
import { COACH_ATTENDANCE_STATUS_LABELS, COACH_TELEGRAM_STATUS_LABELS, COACH_YCLIENTS_STATUS_LABELS } from '@/lib/coach/session-ui';

export default function SessionWorkspace({ initialSession, candidates }: { initialSession: CoachTrainingSession; candidates: CoachIdentityCandidate[] }) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function setAttendance(participantId: string, actualAttendance: string) {
    setBusy(participantId);
    setError('');
    const response = await fetch(`/api/coach/sessions/${session.id}/participants/${participantId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actualAttendance }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) return setError(String(data.error || 'Не удалось сохранить посещение'));
    setSession(data.session);
  }

  async function resolveIdentity(identityId: string, playerId: string) {
    if (!playerId) return;
    setBusy(identityId);
    setError('');
    const response = await fetch(`/api/coach/external-identities/${identityId}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) return setError(String(data.error || 'Не удалось сопоставить ученика'));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
      {session.participants.length ? session.participants.map((participant) => {
        const unresolved = participant.identities.find((identity) => identity.resolutionStatus === 'unresolved');
        return (
          <article key={participant.id} className={`rounded-3xl border p-5 ${participant.statusConflict ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-white/10 bg-white/[0.035]'}`}>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-white">{participant.playerName || participant.displayName || 'Неизвестный участник'}</h2>{participant.statusConflict ? <span className="rounded-lg bg-amber-400/15 px-2 py-1 text-xs font-black text-amber-200">⚠ Конфликт статусов</span> : null}{!participant.playerId ? <span className="rounded-lg bg-rose-400/10 px-2 py-1 text-xs font-black text-rose-200">Не найден ученик</span> : null}</div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <p className="rounded-xl bg-sky-400/10 px-3 py-2 text-sky-200"><span className="block text-[10px] font-black uppercase tracking-wide text-sky-400">Telegram</span>{COACH_TELEGRAM_STATUS_LABELS[participant.telegramStatus]}</p>
                  <p className="rounded-xl bg-violet-400/10 px-3 py-2 text-violet-200"><span className="block text-[10px] font-black uppercase tracking-wide text-violet-400">YCLIENTS</span>{COACH_YCLIENTS_STATUS_LABELS[participant.yclientsStatus]}</p>
                  <p className="rounded-xl bg-emerald-400/10 px-3 py-2 text-emerald-200"><span className="block text-[10px] font-black uppercase tracking-wide text-emerald-400">Факт</span>{COACH_ATTENDANCE_STATUS_LABELS[participant.actualAttendance]}</p>
                </div>
                {participant.identities.length ? <p className="mt-3 text-xs text-slate-500">{participant.identities.map((identity) => `${identity.provider}${identity.username ? ` @${identity.username}` : ''}`).join(' · ')}</p> : null}
              </div>
              <label className="text-xs font-bold text-slate-400">Фактическое посещение
                <select value={participant.actualAttendance} disabled={busy === participant.id} onChange={(event) => setAttendance(participant.id, event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white lg:w-48">
                  {Object.entries(COACH_ATTENDANCE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            {unresolved ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-black/15 p-4">
                <p className="text-sm font-bold text-rose-100">Сопоставить «{unresolved.displayName || participant.displayName}» с карточкой LPVOLLEY</p>
                <select disabled={busy === unresolved.id} defaultValue="" onChange={(event) => resolveIdentity(unresolved.id, event.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">
                  <option value="" disabled>Выберите игрока</option>
                  {candidates.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.name}{candidate.isCoachAthlete ? ' · уже ученик' : ''}</option>)}
                </select>
              </div>
            ) : null}
          </article>
        );
      }) : <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="font-heading text-3xl text-slate-200">Состав пока пуст</p><p className="mt-2 text-sm text-slate-500">Котяра добавит участников после первых ответов в Telegram.</p></section>}
    </div>
  );
}
