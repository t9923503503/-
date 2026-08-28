'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayActionCard, PlayInviteView, PlayPostView } from '@/lib/play-service';
import { groupProfilePlayEntries, isActivePlayEntry } from '@/lib/profile-play-entries';
import { PLAY_STATUS_LABELS, formatPlayDate, formatPlayPrice, formatPlayTime } from '@/lib/play-ui';
import GameRatingCard from '@/components/profile/GameRatingCard';

type Notice = { postId: string; text: string } | null;

interface PlayDashboardResponse {
  mine: PlayPostView[];
  actionCards: PlayActionCard[];
  forYou: PlayPostView[];
  myGames: PlayPostView[];
  invites: PlayInviteView[];
}

const EMPTY_DASHBOARD: PlayDashboardResponse = {
  mine: [],
  actionCards: [],
  forYou: [],
  myGames: [],
  invites: [],
};

const GROUP_LABELS = {
  upcoming: 'Предстоящие',
  reserve: 'Резерв',
  completed: 'Прошедшие',
  cancelled: 'Отменённые и отклонённые',
} as const;

const ACTION_PRIORITY: Record<PlayActionCard['kind'], number> = {
  fix_result: 0,
  approve_result: 1,
  confirm_attendance: 2,
  pending_requests: 3,
  enter_result: 4,
};

function dedupePosts(posts: PlayPostView[]): PlayPostView[] {
  const byId = new Map<string, PlayPostView>();
  for (const post of posts) byId.set(post.id, post);
  return [...byId.values()];
}

function actionCopy(action: PlayActionCard): { label: string; detail: string; href: string } {
  if (action.kind === 'confirm_attendance') {
    return { label: 'Подтвердить присутствие', detail: 'Игра уже скоро — сообщите организатору', href: `/partner/${action.postId}#attendance` };
  }
  if (action.kind === 'enter_result') {
    return { label: 'Внести счёт', detail: 'Игра завершилась, счёт ещё не внесён', href: `/partner/${action.postId}/live` };
  }
  if (action.kind === 'approve_result') {
    return { label: 'Утвердить счёт', detail: 'Участник предложил результат — проверьте его', href: `/partner/${action.postId}#result` };
  }
  if (action.kind === 'fix_result') {
    return { label: 'Исправить', detail: action.count > 1 ? `Запросов на исправление: ${action.count}` : 'Результат требует исправления', href: `/partner/${action.postId}#result` };
  }
  return {
    label: 'Управлять составом',
    detail: `${action.count} ${action.count === 1 ? 'новая заявка' : 'новых заявок'}`,
    href: `/partner/manage?post=${encodeURIComponent(action.postId)}`,
  };
}

function actionLabel(action: PlayActionCard): string {
  if (action.kind === 'confirm_attendance') return 'Скоро игра';
  if (action.kind === 'enter_result') return 'Без счёта';
  if (action.kind === 'approve_result') return 'Проверка счёта';
  if (action.kind === 'fix_result') return 'Нужно исправить';
  return 'Новые заявки';
}

function ratingLabel(post: PlayPostView): string {
  const mode = (post as PlayPostView & { ratingMode?: string }).ratingMode;
  return mode === 'friendly' ? 'Обычная' : 'На рейтинг';
}

function QuickGameLauncher() {
  return (
    <section aria-labelledby="quick-game-title" className="rounded-2xl border border-brand/25 bg-brand/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Быстрый сбор</p>
          <h3 id="quick-game-title" className="mt-1 text-lg font-semibold text-text-primary">Собрать игру за минуту</h3>
          <p className="mt-1 text-sm text-text-secondary">Формат настроится сразу — останется проверить время и площадку.</p>
        </div>
        <Link href="/partner/manage?recipe=classic" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white sm:w-auto">
          Собрать 2×2
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <Link href="/partner/manage?recipe=thai-evening" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-text-primary hover:border-brand/50">Тайский · 8</Link>
        <Link href="/partner/manage?recipe=king-company" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-text-primary hover:border-brand/50">KING</Link>
        <Link href="/partner/manage" className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-text-secondary hover:text-text-primary">Другой формат</Link>
        <Link href="/partner" className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-text-secondary hover:text-text-primary">Найти готовую игру</Link>
      </div>
    </section>
  );
}

export default function PlayEntries({ mode = 'full' }: { mode?: 'full' | 'summary' }) {
  const [dashboard, setDashboard] = useState<PlayDashboardResponse>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [inviteSubmittingId, setInviteSubmittingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadDashboard = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch('/api/me/play-dashboard', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setDashboard({
        mine: Array.isArray(data.mine) ? data.mine : [],
        actionCards: Array.isArray(data.actionCards) ? data.actionCards : [],
        forYou: Array.isArray(data.forYou) ? data.forYou : [],
        myGames: Array.isArray(data.myGames) ? data.myGames : [],
        invites: Array.isArray(data.invites) ? data.invites : [],
      });
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadDashboard();
    };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadDashboard]);

  const pendingInvites = useMemo(
    () => dashboard.invites.filter((invite) => invite.status === 'sent'),
    [dashboard.invites]
  );
  const posts = useMemo(
    () => dedupePosts([...dashboard.mine, ...dashboard.myGames]),
    [dashboard.mine, dashboard.myGames]
  );
  const postsById = useMemo(
    () => new Map(posts.map((post) => [post.id, post])),
    [posts]
  );
  const groups = useMemo(() => groupProfilePlayEntries(posts), [posts]);
  const summary = useMemo(
    () => [...groups.upcoming, ...groups.reserve]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      .slice(0, 3),
    [groups]
  );

  async function respondToInvite(invite: PlayInviteView, action: 'accept' | 'decline') {
    if (inviteSubmittingId) return;
    setInviteSubmittingId(invite.id);
    try {
      const response = await fetch(`/api/play-invites/${invite.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) return;
      await loadDashboard();
    } finally {
      setInviteSubmittingId(null);
    }
  }

  async function cancel(post: PlayPostView) {
    if (submittingId) return;
    setSubmittingId(post.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/play-posts/${post.id}/join`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ postId: post.id, text: data.error || 'Не удалось отменить участие' });
        return;
      }
      setDashboard((current) => ({
        ...current,
        mine: current.mine.map((item) => item.id === post.id ? { ...item, viewerStatus: 'cancelled' } : item),
        myGames: current.myGames.map((item) => item.id === post.id ? { ...item, viewerStatus: 'cancelled' } : item),
      }));
      setConfirmId(null);
      setNotice({ postId: post.id, text: 'Участие отменено.' });
    } catch {
      setNotice({ postId: post.id, text: 'Ошибка сети. Повторите попытку.' });
    } finally {
      setSubmittingId(null);
    }
  }

  function ActionItem({ action }: { action: PlayActionCard }) {
    const copy = actionCopy(action);
    const post = postsById.get(action.postId);
    return (
      <article className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface-light/30 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-orange-200">{actionLabel(action)}</span>
            <p className="truncate font-semibold text-text-primary">{action.title}</p>
          </div>
          <p className="mt-1 text-xs text-text-secondary">{copy.detail}</p>
          {post ? (
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {formatPlayDate(post.startsAt, { day: 'numeric', month: 'short' })} · {formatPlayTime(post.startsAt)} · {post.venue.name} · состав {post.confirmedCount}/{post.capacity}
            </p>
          ) : null}
        </div>
        <Link href={copy.href} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-brand px-3.5 text-xs font-semibold text-white sm:w-auto">
          {copy.label}
        </Link>
      </article>
    );
  }

  function AttentionSection({ compact = false }: { compact?: boolean }) {
    const orderedActions = [...dashboard.actionCards].sort((left, right) => ACTION_PRIORITY[left.kind] - ACTION_PRIORITY[right.kind]);
    const actions = orderedActions.slice(0, 2);
    const deferredActions = compact ? [] : orderedActions.slice(2);
    const invites = compact ? pendingInvites.slice(0, 2) : pendingInvites;
    if (!orderedActions.length && !invites.length) return null;

    return (
      <section aria-labelledby="play-attention-title">
        <div className="mb-3 flex items-center gap-2">
          <h3 id="play-attention-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Требует внимания</h3>
          <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-semibold text-orange-200">{orderedActions.length + pendingInvites.length}</span>
        </div>
        <div className="grid gap-2.5">
          {invites.map((invite) => (
            <article key={invite.id} className="rounded-xl border border-orange-300/30 bg-orange-300/10 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">Приглашение</p>
              <Link href={`/partner/${invite.postId}`} className="mt-1 block font-semibold text-text-primary hover:underline">{invite.postTitle}</Link>
              <p className="mt-1 text-xs text-text-secondary">
                {formatPlayDate(invite.startsAt, { day: 'numeric', month: 'long' })} · {formatPlayTime(invite.startsAt)} · приглашает {invite.fromUserName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(inviteSubmittingId)}
                  onClick={() => void respondToInvite(invite, 'accept')}
                  className="rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {inviteSubmittingId === invite.id ? 'Сохраняем…' : 'Принять'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(inviteSubmittingId)}
                  onClick={() => void respondToInvite(invite, 'decline')}
                  className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-semibold text-text-primary disabled:opacity-60"
                >
                  Не смогу
                </button>
              </div>
            </article>
          ))}
          {actions.map((action) => <ActionItem key={`${action.kind}-${action.postId}`} action={action} />)}
        </div>
        {deferredActions.length ? (
          <details className="mt-2.5 rounded-xl border border-white/10 bg-surface-light/15">
            <summary className="cursor-pointer px-3.5 py-3 text-sm font-semibold text-text-secondary hover:text-text-primary">
              {deferredActions.every((action) => action.kind === 'enter_result')
                ? `Ещё игр без счёта: ${deferredActions.length}`
                : `Ещё действий: ${deferredActions.length}`}
            </summary>
            <div className="grid gap-2.5 border-t border-white/10 p-2.5">
              {deferredActions.map((action) => <ActionItem key={`${action.kind}-${action.postId}`} action={action} />)}
            </div>
          </details>
        ) : compact && orderedActions.length > actions.length ? (
          <Link href="/cabinet?tab=games" className="mt-2.5 inline-flex text-sm font-semibold text-brand hover:underline">
            Ещё действий: {orderedActions.length - actions.length} →
          </Link>
        ) : null}
      </section>
    );
  }

  function EntryCard({ post }: { post: PlayPostView }) {
    const canCancel = isActivePlayEntry(post) && ['pending', 'confirmed', 'reserve'].includes(String(post.viewerStatus));
    const confirming = confirmId === post.id;
    const entryNotice = notice?.postId === post.id ? notice.text : '';
    const active = isActivePlayEntry(post);
    const statusLabel = post.viewerStatus
      ? PLAY_STATUS_LABELS[post.viewerStatus]
      : post.status === 'cancelled'
        ? 'Отменена'
        : active
          ? post.status === 'draft' ? 'Черновик' : 'Организую'
          : 'Прошедшая';

    return (
      <article className="rounded-xl border border-white/10 bg-surface-light/30 px-3.5 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/partner/${post.id}`} className="font-semibold text-text-primary hover:text-brand hover:underline">
                {post.title}
              </Link>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{ratingLabel(post)}</span>
              <span className="text-xs font-semibold text-orange-300">{formatPlayPrice(post)}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-text-secondary">
              {formatPlayDate(post.startsAt, { day: 'numeric', month: 'short' })} · {formatPlayTime(post.startsAt)} · {post.venue.name} · {post.confirmedCount}/{post.capacity}
            </div>
          </div>
          <span className="w-fit shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-text-secondary">{statusLabel}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/partner/${post.id}`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand/50">
            Открыть игру
          </Link>
          {canCancel ? (
            <button
              type="button"
              aria-expanded={confirming}
              aria-controls={`cancel-entry-${post.id}`}
              onClick={() => {
                setConfirmId(confirming ? null : post.id);
                setNotice(null);
              }}
              className="rounded-lg border border-red-300/25 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-300/10"
            >
              Отменить участие
            </button>
          ) : null}
        </div>

        {confirming ? (
          <div id={`cancel-entry-${post.id}`} className="mt-3 rounded-xl border border-red-300/25 bg-red-300/10 p-3" role="alert">
            <p className="text-sm font-semibold text-red-100">Отменить участие в «{post.title}»?</p>
            <p className="mt-1 text-xs text-red-100/75">
              {formatPlayDate(post.startsAt, { day: 'numeric', month: 'long', year: 'numeric' })}, {formatPlayTime(post.startsAt)}. Место может перейти игроку из резерва.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submittingId === post.id}
                onClick={() => void cancel(post)}
                className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {submittingId === post.id ? 'Отменяем…' : 'Да, отменить'}
              </button>
              <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-text-primary">
                Оставить участие
              </button>
            </div>
          </div>
        ) : null}
        {entryNotice ? <p className={`mt-2 text-xs ${entryNotice === 'Участие отменено.' ? 'text-emerald-200' : 'text-red-200'}`} role="status">{entryNotice}</p> : null}
      </article>
    );
  }

  if (loading) return <p className="text-sm text-text-secondary" role="status">Загрузка игр…</p>;

  if (mode === 'summary') {
    return (
      <div className="grid gap-5">
        <AttentionSection compact />
        {summary.length ? (
          <div className="grid gap-2.5">
            {summary.map((post) => <EntryCard key={post.id} post={post} />)}
            <Link href="/cabinet?tab=games" className="mt-1 inline-flex w-fit font-semibold text-brand hover:underline">Все мои игры →</Link>
          </div>
        ) : (!dashboard.actionCards.length && !pendingInvites.length ? (
          <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-text-secondary">
            <p>Активных игр и приглашений сейчас нет.</p>
            <Link href="/partner" className="mt-3 inline-flex font-semibold text-orange-300 hover:text-orange-200">Найти игру →</Link>
          </div>
        ) : null)}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <QuickGameLauncher />
      <AttentionSection />
      <GameRatingCard />
      {posts.length ? (Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>).map((key) => (
        groups[key].length ? (
          <section key={key}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">{GROUP_LABELS[key]}</h3>
            <div className="grid gap-2.5">{groups[key].map((post) => <EntryCard key={post.id} post={post} />)}</div>
          </section>
        ) : null
      )) : (
        <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-text-secondary">
          У вас пока нет созданных игр или участий.
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/partner" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Найти игру</Link>
        <Link href="/partner/manage" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-primary">Все сценарии создания</Link>
      </div>
    </div>
  );
}
