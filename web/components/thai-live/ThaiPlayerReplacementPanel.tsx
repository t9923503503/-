'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import { ThaiInlineActionConfirm } from '@/components/thai-live/ThaiInlineActionConfirm';

type AdminPlayerOption = {
  id: string;
  name: string;
  gender: 'M' | 'W';
};

function formatGenderLabel(gender: 'M' | 'W'): string {
  return gender === 'W' ? 'Ж' : 'М';
}

export function ThaiPlayerReplacementPanel({
  tournamentId,
  participants,
  disabled = false,
  onChanged,
}: {
  tournamentId: string;
  participants: SudyamBootstrapPayload['bootstrapState']['participants'];
  disabled?: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const activeParticipants = useMemo(
    () =>
      participants
        .filter((participant) => !participant.isWaitlist)
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0)),
    [participants],
  );
  const participantIds = useMemo(
    () => new Set(activeParticipants.map((participant) => participant.playerId)),
    [activeParticipants],
  );

  const [oldPlayerId, setOldPlayerId] = useState<string>(activeParticipants[0]?.playerId ?? '');
  const selectedOldPlayer = activeParticipants.find((participant) => participant.playerId === oldPlayerId) ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AdminPlayerOption[]>([]);
  const [selectedNewPlayer, setSelectedNewPlayer] = useState<AdminPlayerOption | null>(null);
  const [reason, setReason] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOldPlayer && activeParticipants[0]) {
      setOldPlayerId(activeParticipants[0].playerId);
    }
  }, [activeParticipants, selectedOldPlayer]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(`/api/admin/players?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error('Не удалось загрузить игроков');
        }
        const normalized = payload
          .map(
            (player): AdminPlayerOption => ({
              id: String(player.id || '').trim(),
              name: String(player.name || '').trim(),
              gender: String(player.gender || '').trim().toUpperCase() === 'W' ? 'W' : 'M',
            }),
          )
          .filter((player) => player.id && player.name)
          .filter((player) => !participantIds.has(player.id))
          .filter((player) => (selectedOldPlayer ? player.gender === selectedOldPlayer.gender : true))
          .slice(0, 10);
        setSearchResults(normalized);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setMessage(error instanceof Error ? error.message : 'Не удалось загрузить игроков');
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [participantIds, searchQuery, selectedOldPlayer]);

  async function submitReplacement() {
    if (!oldPlayerId || !selectedOldPlayer) {
      setMessage('Выберите игрока турнира, которого нужно заменить.');
      return;
    }
    if (!selectedNewPlayer) {
      setMessage('Выберите нового игрока из результатов поиска.');
      return;
    }
    if (reason.trim().length < 4) {
      setMessage('Укажите причину замены не короче 4 символов.');
      return;
    }
    setSubmitLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/thai-replace-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPlayerId,
          newPlayerId: selectedNewPlayer.id,
          reason: reason.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        replacement?: { oldPlayerName?: string; newPlayerName?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось заменить игрока');
      }
      setMessage(
        `Замена сохранена: ${payload.replacement?.oldPlayerName ?? selectedOldPlayer.playerName} → ${payload.replacement?.newPlayerName ?? selectedNewPlayer.name}.`,
      );
      setSearchQuery('');
      setSearchResults([]);
      setSelectedNewPlayer(null);
      setReason('');
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось заменить игрока');
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fuchsia-100">Замена игрока</h2>
          <p className="mt-1 max-w-2xl text-xs text-text-secondary">
            Меняет игрока в составе турнира и во всех материалах Thai Next. Новый игрок должен быть того же пола и не
            должен уже участвовать в этом турнире.
          </p>
        </div>
        <div className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-fuchsia-100/90">
          Thai Live
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs text-text-secondary">
          Игрок турнира
          <select
            value={oldPlayerId}
            onChange={(event) => {
              setOldPlayerId(event.target.value);
              setSelectedNewPlayer(null);
              setSearchQuery('');
              setSearchResults([]);
              setMessage(null);
            }}
            disabled={disabled || submitLoading}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-fuchsia-400/60"
          >
            {activeParticipants.map((participant) => (
              <option key={participant.playerId} value={participant.playerId}>
                {participant.playerName} · {formatGenderLabel(participant.gender)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-xs text-text-secondary">
          Найти замену
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setMessage(null);
            }}
            disabled={disabled || submitLoading}
            placeholder={selectedOldPlayer ? `Поиск ${formatGenderLabel(selectedOldPlayer.gender)}-игрока` : 'Введите имя'}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.2em] text-text-secondary/70">Кандидаты</div>
          {searchLoading ? <div className="text-[11px] text-text-secondary/80">Поиск…</div> : null}
        </div>
        {selectedNewPlayer ? (
          <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Выбрано: {selectedNewPlayer.name} · {formatGenderLabel(selectedNewPlayer.gender)}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {searchResults.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => {
                setSelectedNewPlayer(player);
                setMessage(null);
              }}
              disabled={disabled || submitLoading}
              className={`rounded-full border px-3 py-2 text-sm transition ${
                selectedNewPlayer?.id === player.id
                  ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-50'
                  : 'border-white/10 bg-white/5 text-white hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10'
              }`}
            >
              {player.name} · {formatGenderLabel(player.gender)}
            </button>
          ))}
          {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
            <div className="text-sm text-text-secondary">Ничего не найдено.</div>
          ) : null}
          {searchQuery.trim().length < 2 ? (
            <div className="text-sm text-text-secondary">Введите минимум 2 символа для поиска по базе игроков.</div>
          ) : null}
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-2 text-xs text-text-secondary">
        Причина замены
        <input
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setMessage(null);
          }}
          disabled={disabled || submitLoading}
          placeholder="Например: травма, опоздание, замена перед стартом R2"
          className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-fuchsia-400/60"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ThaiInlineActionConfirm
          label="Заменить игрока"
          armedLabel="Подтвердить замену"
          description={
            selectedOldPlayer && selectedNewPlayer
              ? `Заменить ${selectedOldPlayer.playerName} на ${selectedNewPlayer.name}. Новый игрок будет подставлен в материалы Thai Next и результаты турнира.`
              : 'Сначала выберите игрока турнира и нового кандидата на замену.'
          }
          onConfirm={() => void submitReplacement()}
          disabled={disabled || submitLoading || !selectedOldPlayer || !selectedNewPlayer || reason.trim().length < 4}
          busy={submitLoading}
          tone="warn"
        />
        {message ? (
          <p className={`text-xs ${message.includes('Замена сохранена') ? 'text-emerald-200' : 'text-red-200'}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
