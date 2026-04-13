"use client";

import { useEffect, useState } from "react";

type MePayload = {
  id: number;
  email: string;
  full_name: string | null;
  nickname: string | null;
  telegram_chat_id: string | null;
  created_at: string | null;
};

export default function MyAccountCard({
  className = "",
  embedded = false,
}: {
  className?: string;
  embedded?: boolean;
}) {
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (!res.ok) {
          setError(data?.error || "Не удалось получить данные аккаунта");
          setMe(null);
          return;
        }
        setMe(data as MePayload);
      } catch {
        if (!mounted) return;
        setError("Ошибка сети");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const rootClass = embedded
    ? className
    : ["rounded-xl border border-white/10 bg-surface-light/20 p-3.5 md:p-4", className]
        .join(" ")
        .trim();

  return (
    <section className={rootClass}>
      {!embedded ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
          Данные аккаунта
        </div>
      ) : null}
      {loading ? <p className="text-sm font-body text-text-secondary">Загрузка...</p> : null}
      {!loading && error ? <p className="text-sm font-body text-red-200">{error}</p> : null}
      {!loading && me ? (
        <dl className={`grid grid-cols-1 gap-2.5 text-sm font-body sm:grid-cols-2 sm:gap-3 ${embedded ? '' : 'mt-2.5'}`}>
          <div>
            <dt className="text-text-secondary">Имя</dt>
            <dd className="text-text-primary">{me.full_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Email</dt>
            <dd className="text-text-primary">{me.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Ник</dt>
            <dd className="text-text-primary">{me.nickname || "—"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Telegram chat_id</dt>
            <dd className="text-text-primary">{me.telegram_chat_id || "не привязан"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">ID аккаунта</dt>
            <dd className="text-text-primary">{me.id}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Дата регистрации</dt>
            <dd className="text-text-primary">
              {me.created_at ? new Date(me.created_at).toLocaleString("ru-RU") : "—"}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
