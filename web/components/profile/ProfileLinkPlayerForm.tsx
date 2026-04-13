"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type PlayerSummary = {
  id: string;
  name: string;
  gender: "M" | "W";
  photoUrl: string;
};

type LinkState = {
  full_name: string | null;
  linked_player: PlayerSummary | null;
  resolved_player: PlayerSummary | null;
  search_results: PlayerSummary[];
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-surface px-4 py-3 font-body text-text-primary outline-none transition-colors focus:border-brand";
const ghostButtonClass =
  "inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 font-body text-sm text-text-primary transition hover:border-brand/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 font-body text-sm font-semibold text-black transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60";

function playerHref(playerId: string): string {
  return `/players/${playerId}`;
}

function samePlayer(a: PlayerSummary | null, b?: { id?: string | null } | null): boolean {
  return Boolean(a?.id && b?.id && a.id === b.id);
}

export default function ProfileLinkPlayerForm({
  targetPlayerId,
  targetPlayerName,
  loginHref = "/login?returnTo=%2Fprofile",
  className = "",
  embedded = false,
}: {
  targetPlayerId?: string;
  targetPlayerName?: string;
  loginHref?: string;
  className?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<LinkState | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const autoSearchedRef = useRef(false);

  const loadState = useCallback(async (searchQuery = "") => {
    const url = searchQuery
      ? `/api/auth/player-link?q=${encodeURIComponent(searchQuery)}`
      : "/api/auth/player-link";
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      setNeedsAuth(true);
      setState(null);
      return null;
    }

    if (!res.ok) {
      throw new Error(data?.error || "Не удалось получить состояние привязки");
    }

    setNeedsAuth(false);
    setState(data as LinkState);
    return data as LinkState;
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const data = await loadState();
        if (!mounted || !data) return;
        if (!autoSearchedRef.current && !data.linked_player && data.full_name) {
          autoSearchedRef.current = true;
          setQuery(data.full_name);
          setSearching(true);
          try {
            await loadState(data.full_name);
          } finally {
            if (mounted) setSearching(false);
          }
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadState]);

  const handleSearch = useCallback(
    async (nextQuery?: string) => {
      const finalQuery = String(nextQuery ?? query).trim();
      if (finalQuery.length < 2) {
        setError("Введите минимум 2 символа для поиска.");
        return;
      }

      try {
        setSearching(true);
        setError("");
        const data = await loadState(finalQuery);
        if (data) {
          setQuery(finalQuery);
          if (data.search_results.length === 0) {
            setInfo("По этому запросу карточки игрока не найдены.");
          } else {
            setInfo("");
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка поиска");
      } finally {
        setSearching(false);
      }
    },
    [loadState, query]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleSearch();
    },
    [handleSearch]
  );

  const bindPlayer = useCallback(
    async (playerId: string) => {
      try {
        setSaving(true);
        setError("");
        setInfo("");

        const res = await fetch("/api/auth/player-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Не удалось привязать карточку");
        }

        setState(data as LinkState);
        setInfo(data?.message || "Карточка игрока привязана.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка привязки");
      } finally {
        setSaving(false);
      }
    },
    [router]
  );

  const unlinkPlayer = useCallback(async () => {
    try {
      setSaving(true);
      setError("");
      setInfo("");

      const res = await fetch("/api/auth/player-link", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Не удалось снять привязку");
      }

      setState(data as LinkState);
      setInfo(data?.message || "Привязка снята.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка снятия привязки");
    } finally {
      setSaving(false);
    }
  }, [router]);

  const currentPlayer = state?.linked_player ?? null;
  const resolvedPlayer = state?.resolved_player ?? null;
  const targetPlayer = useMemo(
    () =>
      targetPlayerId
        ? {
            id: targetPlayerId,
            name: targetPlayerName || "Эта карточка игрока",
          }
        : null,
    [targetPlayerId, targetPlayerName]
  );

  const rootClass = embedded
    ? ["space-y-4", className].join(" ").trim()
    : ["rounded-xl border border-white/10 bg-surface-light/20 p-4 space-y-4", className]
        .join(" ")
        .trim();

  if (loading) {
    return (
      <section className={rootClass}>
        <p className="font-body text-sm text-text-secondary">Загрузка блока привязки...</p>
      </section>
    );
  }

  if (needsAuth) {
    return (
      <section className={rootClass}>
        {!embedded ? (
          <div>
            <h3 className="font-heading text-2xl text-text-primary tracking-wide">
              Привязка к карточке игрока
            </h3>
            <p className="mt-2 font-body text-sm text-text-secondary">
              Чтобы привязать эту карточку к своему аккаунту, сначала войдите в личный кабинет.
            </p>
          </div>
        ) : (
          <p className="font-body text-sm text-text-secondary">
            Чтобы привязать карточку к своему аккаунту, сначала войдите в личный кабинет.
          </p>
        )}
        <Link href={loginHref} className="btn-action-outline inline-flex">
          Войти и привязать
        </Link>
      </section>
    );
  }

  return (
    <section className={rootClass}>
      {!embedded ? (
        <div>
          <h3 className="font-heading text-2xl text-text-primary tracking-wide">
            Привязка к карточке игрока
          </h3>
          <p className="mt-1 font-body text-sm text-text-secondary">
            Закрепите свой аккаунт за карточкой игрока, чтобы профиль, статистика и фото
            открывались автоматически.
          </p>
        </div>
      ) : (
        <p className="font-body text-sm text-text-secondary">
          Закрепите свой аккаунт за карточкой игрока, чтобы профиль, статистика и фото
          открывались автоматически.
        </p>
      )}

      {error ? (
        <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-3 font-body text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-3 font-body text-sm text-emerald-100">
          {info}
        </div>
      ) : null}

      {currentPlayer ? (
        <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4">
          <p className="font-body text-xs uppercase tracking-[0.2em] text-emerald-200/90">
            Активная привязка
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-heading text-xl text-text-primary">{currentPlayer.name}</p>
              <p className="font-body text-sm text-emerald-100/85">
                {currentPlayer.gender === "W" ? "Женский профиль" : "Мужской профиль"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={playerHref(currentPlayer.id)} className={ghostButtonClass}>
                Открыть карточку
              </Link>
              <button type="button" className={ghostButtonClass} onClick={unlinkPlayer} disabled={saving}>
                Снять привязку
              </button>
            </div>
          </div>
        </div>
      ) : resolvedPlayer ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="font-body text-xs uppercase tracking-[0.2em] text-amber-100/90">
            Автоматически найдено
          </p>
          <p className="mt-2 font-body text-sm text-amber-50">
            Сейчас кабинет находит вашу статистику через старую автосвязку:{' '}
            <Link href={playerHref(resolvedPlayer.id)} className="underline underline-offset-2">
              {resolvedPlayer.name}
            </Link>
            . Лучше закрепить её явно кнопкой ниже.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/10 p-4 font-body text-sm text-text-secondary">
          Явная привязка пока не настроена.
        </div>
      )}

      {targetPlayer ? (
        <div className="rounded-xl border border-brand/35 bg-brand/10 p-4">
          <p className="font-body text-xs uppercase tracking-[0.2em] text-brand-light/90">
            Быстрая привязка
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-heading text-xl text-text-primary">{targetPlayer.name}</p>
              <p className="font-body text-sm text-text-secondary">
                Эта карточка открыта сейчас на странице игрока.
              </p>
            </div>
            {samePlayer(currentPlayer, targetPlayer) ? (
              <span className="rounded-full border border-emerald-400/35 px-3 py-1 font-body text-sm text-emerald-100">
                Уже привязано
              </span>
            ) : (
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => bindPlayer(targetPlayer.id)}
                disabled={saving}
              >
                Привязать эту карточку
              </button>
            )}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="font-body text-xs uppercase tracking-[0.2em] text-text-secondary">
            Найти по имени
          </label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например: Лебедев Александр"
            className={`mt-2 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClass} disabled={searching || saving}>
            {searching ? "Ищу..." : "Найти карточку"}
          </button>
          {state?.full_name ? (
            <button
              type="button"
              className={ghostButtonClass}
              disabled={searching || saving}
              onClick={() => handleSearch(state.full_name || "")}
            >
              Найти по имени аккаунта
            </button>
          ) : null}
        </div>
      </form>

      {state?.search_results?.length ? (
        <div className="space-y-2">
          {state.search_results.map((player) => (
            <div
              key={player.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3"
            >
              <div>
                <Link
                  href={playerHref(player.id)}
                  className="font-body text-base text-text-primary hover:text-brand-light"
                >
                  {player.name}
                </Link>
                <p className="font-body text-sm text-text-secondary">
                  {player.gender === "W" ? "Женский профиль" : "Мужской профиль"}
                </p>
              </div>
              {samePlayer(currentPlayer, player) ? (
                <span className="rounded-full border border-emerald-400/35 px-3 py-1 font-body text-sm text-emerald-100">
                  Уже привязано
                </span>
              ) : (
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={saving}
                  onClick={() => bindPlayer(player.id)}
                >
                  Привязать
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
