"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MePayload = {
  id: number;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  auth_method: "telegram" | "email" | "vk" | "combined";
  auth_methods?: Array<"telegram" | "email" | "vk">;
  telegram_linked: boolean;
  vk_linked: boolean;
  vk_id_available: boolean;
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
  const [vkNotice, setVkNotice] = useState("");
  const [vkLoading, setVkLoading] = useState(false);

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

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("vkLink");
    if (status === "success") setVkNotice("VK ID успешно подключён к аккаунту.");
    if (status === "conflict") setVkNotice("Этот VK ID уже подключён к другому аккаунту. Обратитесь к администратору.");
    if (status === "failed") setVkNotice("Не удалось подключить VK ID. Попробуйте ещё раз.");
  }, []);

  async function linkVkId() {
    if (vkLoading) return;
    setVkLoading(true);
    setVkNotice("");
    try {
      const response = await fetch("/api/auth/vk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "link",
          privacyConsent: true,
          returnTo: "/profile?tab=settings",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.authorizationUrl) {
        setVkNotice(data?.error || "Не удалось начать подключение VK ID.");
        return;
      }
      window.location.assign(data.authorizationUrl);
    } catch {
      setVkNotice("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setVkLoading(false);
    }
  }

  const rootClass = embedded
    ? className
    : ["rounded-xl border border-white/10 bg-surface-light/20 p-3.5 md:p-4", className]
        .join(" ")
        .trim();

  const authMethodLabel = me?.auth_methods?.length
    ? me.auth_methods
        .map((method) => method === "vk" ? "VK ID" : method === "telegram" ? "Telegram" : "Email и пароль")
        .join(" + ")
    : me?.auth_method === "vk"
      ? "VK ID"
      : me?.auth_method === "telegram"
        ? "Telegram"
        : me?.auth_method === "combined"
          ? "Несколько способов"
          : "Email и пароль";

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
          {me.email ? (
            <div>
              <dt className="text-text-secondary">Email</dt>
              <dd className="text-text-primary">{me.email}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-text-secondary">Ник</dt>
            <dd className="text-text-primary">{me.nickname || "—"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Способ входа</dt>
            <dd className="text-text-primary">
              {authMethodLabel}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">VK ID</dt>
            <dd className="text-text-primary">{me.vk_linked ? "Подключён" : "Не подключён"}</dd>
            {!me.vk_linked && me.vk_id_available ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => void linkVkId()}
                  disabled={vkLoading}
                  className="rounded-lg border border-sky-400/50 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-60"
                >
                  {vkLoading ? "Открываем VK..." : "Подключить VK ID"}
                </button>
                <p className="mt-1.5 max-w-md text-xs text-text-secondary">
                  Потребуется недавний вход по паролю. Продолжая, вы соглашаетесь с{' '}
                  <Link href="/privacy" className="text-brand hover:underline">политикой обработки данных</Link>.
                </p>
              </div>
            ) : null}
          </div>
          <div>
            <dt className="text-text-secondary">Telegram</dt>
            <dd className="text-text-primary">{me.telegram_linked ? "Подключён" : "Не подключён"}</dd>
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
      {vkNotice ? (
        <p className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-text-primary">
          {vkNotice}
        </p>
      ) : null}
    </section>
  );
}
