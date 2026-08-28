'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AdminPlayer, AdminTournament, RosterParticipant } from '@/lib/admin-queries';
import { formatTournamentDate, getTournamentStatusLabel } from '@/lib/admin-tournaments-ui';

type RosterAction = 'add' | 'remove' | 'promote';

type Props = {
  tournament: AdminTournament;
  initialPlayers: AdminPlayer[];
  initialParticipants: RosterParticipant[];
};

function GenderLabel({ gender }: { gender: 'M' | 'W' }) {
  return <span className="text-xs text-text-secondary">{gender === 'W' ? 'Женщина' : 'Мужчина'}</span>;
}

export function TournamentRosterManager({ tournament, initialPlayers, initialParticipants }: Props) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [search, setSearch] = useState('');
  const [busyPlayerId, setBusyPlayerId] = useState('');
  const [message, setMessage] = useState('');

  const main = useMemo(
    () => participants.filter((participant) => !participant.isWaitlist),
    [participants],
  );
  const waitlist = useMemo(
    () => participants.filter((participant) => participant.isWaitlist),
    [participants],
  );
  const registeredIds = useMemo(
    () => new Set(participants.map((participant) => participant.playerId)),
    [participants],
  );
  const availablePlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru');
    return initialPlayers
      .filter((player) => !registeredIds.has(player.id))
      .filter((player) => !normalizedSearch || player.name.toLocaleLowerCase('ru').includes(normalizedSearch))
      .slice(0, 50);
  }, [initialPlayers, registeredIds, search]);
  const mainIsFull = main.length >= tournament.capacity;

  async function reloadParticipants() {
    const response = await fetch(
      `/api/admin/roster?tournamentId=${encodeURIComponent(tournament.id)}`,
      { cache: 'no-store' },
    );
    const payload = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(payload)) {
      throw new Error('Не удалось обновить состав');
    }
    setParticipants(payload as RosterParticipant[]);
  }

  async function rosterAction(
    action: RosterAction,
    playerId: string,
    playerName: string,
    isWaitlist = false,
  ) {
    if (action === 'remove') {
      const promotionNote = !isWaitlist && waitlist.length
        ? ' Первый игрок из резерва будет автоматически переведён в основной состав.'
        : '';
      if (!window.confirm(`Убрать игрока «${playerName}» из турнира?${promotionNote}`)) return;
    }

    setBusyPlayerId(playerId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          tournamentId: tournament.id,
          playerId,
          reason: `Управление составом турнира «${tournament.name}»`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || 'Не удалось изменить состав'));
      await reloadParticipants();

      if (action === 'add') {
        setMessage(payload.waitlist ? `${playerName} добавлен в резерв.` : `${playerName} добавлен в основной состав.`);
      } else if (action === 'promote') {
        setMessage(`${playerName} переведён в основной состав. Игроку отправлено уведомление.`);
      } else {
        setMessage(payload.promotedPlayerId
          ? `${playerName} удалён. Первый игрок из резерва автоматически переведён в состав и уведомлён.`
          : `${playerName} удалён из турнира.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось изменить состав');
    } finally {
      setBusyPlayerId('');
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/admin/tournaments" className="text-sm font-semibold text-brand hover:underline">
            ← К турнирам
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Состав турнира</p>
          <h1 className="mt-1 break-words font-heading text-4xl leading-none text-text-primary">{tournament.name}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {formatTournamentDate(tournament.date)} · {getTournamentStatusLabel(tournament.status)}
          </p>
        </div>
        <Link
          href={`/admin/tournaments/${encodeURIComponent(tournament.id)}/edit`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:border-brand"
        >
          Настройки турнира
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-text-secondary">Основной состав</p>
          <p className="mt-1 font-heading text-3xl leading-none">{main.length} / {tournament.capacity}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-text-secondary">Резерв</p>
          <p className="mt-1 font-heading text-3xl leading-none">{waitlist.length}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-text-secondary">Свободно мест</p>
          <p className="mt-1 font-heading text-3xl leading-none">{Math.max(0, tournament.capacity - main.length)}</p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">{message}</p>
      {message ? (
        <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-text-primary">{message}</div>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl leading-none">Основной состав</h2>
                <p className="mt-2 text-xs text-text-secondary">При удалении игрока первое место автоматически занимает резервист.</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-mono">{main.length} / {tournament.capacity}</span>
            </div>
            <ol className="mt-4 space-y-2">
              {main.map((participant, index) => (
                <li key={participant.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <span className="w-6 shrink-0 text-center font-mono text-xs text-text-secondary">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{participant.playerName}</p>
                    <GenderLabel gender={participant.gender} />
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busyPlayerId)}
                    onClick={() => void rosterAction('remove', participant.playerId, participant.playerName)}
                    className="min-h-11 shrink-0 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-40"
                  >
                    Убрать
                  </button>
                </li>
              ))}
              {!main.length ? (
                <li className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-text-secondary">
                  Основной состав пока пуст. Добавьте игроков справа.
                </li>
              ) : null}
            </ol>
          </section>

          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl leading-none">Резерв</h2>
                <p className="mt-2 text-xs text-text-secondary">Очередь сохраняется по порядку регистрации.</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-mono">{waitlist.length}</span>
            </div>
            <ol className="mt-4 space-y-2">
              {waitlist.map((participant, index) => (
                <li key={participant.id} className="flex min-h-14 flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 sm:flex-nowrap">
                  <span className="w-6 shrink-0 text-center font-mono text-xs text-text-secondary">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{participant.playerName}</p>
                    <GenderLabel gender={participant.gender} />
                  </div>
                  <div className="ml-9 flex w-full gap-2 sm:ml-0 sm:w-auto">
                    <button
                      type="button"
                      disabled={Boolean(busyPlayerId) || mainIsFull}
                      title={mainIsFull ? 'Сначала освободите место в основном составе' : undefined}
                      onClick={() => void rosterAction('promote', participant.playerId, participant.playerName, true)}
                      className="min-h-11 flex-1 rounded-lg border border-brand/50 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40 sm:flex-none"
                    >
                      В состав
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyPlayerId)}
                      onClick={() => void rosterAction('remove', participant.playerId, participant.playerName, true)}
                      className="min-h-11 flex-1 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-40 sm:flex-none"
                    >
                      Убрать
                    </button>
                  </div>
                </li>
              ))}
              {!waitlist.length ? (
                <li className="rounded-xl border border-dashed border-white/15 px-4 py-7 text-center text-sm text-text-secondary">
                  Резерв пуст.
                </li>
              ) : null}
            </ol>
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5 lg:sticky lg:top-4">
          <h2 className="font-heading text-2xl leading-none">Добавить игрока</h2>
          <p className="mt-2 text-xs text-text-secondary">
            {mainIsFull ? 'Основной состав заполнен — новые игроки попадут в резерв.' : 'Игрок займёт свободное место в основном составе.'}
          </p>
          <label className="mt-4 block text-xs text-text-secondary">
            Поиск по имени
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Начните вводить имя"
              className="mt-1 min-h-11 w-full rounded-xl border border-white/20 bg-surface px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            />
          </label>
          <div className="mt-3 max-h-[32rem] space-y-1 overflow-y-auto pr-1">
            {availablePlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                disabled={Boolean(busyPlayerId)}
                onClick={() => void rosterAction('add', player.id, player.name)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-left transition-colors hover:border-brand disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{player.name}</span>
                  <GenderLabel gender={player.gender} />
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand">{mainIsFull ? 'В резерв' : 'Добавить'}</span>
              </button>
            ))}
            {!availablePlayers.length ? (
              <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-text-secondary">
                {search.trim() ? 'Игроки не найдены.' : 'Все игроки уже добавлены в турнир.'}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
