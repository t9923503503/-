"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ResetNotice =
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | null;

export default function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<ResetNotice>(null);

  const tokenValue = String(token || "").trim();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);

    if (!tokenValue) {
      setNotice({ type: "error", text: "Ссылка восстановления недействительна." });
      return;
    }
    if (password.trim().length < 6) {
      setNotice({ type: "error", text: "Пароль должен быть не короче 6 символов." });
      return;
    }
    if (password !== confirmPassword) {
      setNotice({ type: "error", text: "Пароли не совпадают." });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenValue,
          password: password.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({
          type: "error",
          text: data?.error || "Не удалось изменить пароль.",
        });
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setNotice({
        type: "success",
        text:
          data?.message ||
          "Пароль успешно изменён. Сейчас откроем личный кабинет.",
      });

      window.setTimeout(() => {
        router.push(typeof data?.redirectTo === "string" && data.redirectTo ? data.redirectTo : "/profile");
        router.refresh();
      }, 1200);
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "mt-2 h-12 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-brand/70 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,90,0,0.22),0_0_18px_rgba(255,90,0,0.14)]";

  return (
    <section className="glass-panel relative overflow-hidden rounded-[28px] border border-cyan-400/22 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,90,0,0.14),transparent_36%),rgba(11,17,24,0.92)] p-6 text-text-primary shadow-[0_22px_60px_rgba(0,0,0,0.38)] md:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-condensed text-xs uppercase tracking-[0.28em] text-cyan-300/80">
              Password Recovery
            </div>
            <h1 className="mt-2 font-heading text-4xl leading-none tracking-[0.04em] text-text-primary md:text-5xl">
              Новый Пароль
            </h1>
          </div>
          <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-brand/35 bg-brand/10 text-brand shadow-[0_0_24px_rgba(255,90,0,0.18)] md:flex">
            <span className="font-heading text-3xl">LP</span>
          </div>
        </div>

        <p className="mt-3 max-w-xl text-sm text-text-secondary">
          Установите новый пароль для аккаунта LPVOLLEY.RU. После успешной смены мы автоматически откроем личный кабинет.
        </p>

        {!tokenValue ? (
          <div className="mt-8 rounded-2xl border border-amber-400/35 bg-amber-400/10 p-4 text-sm text-amber-100">
            В ссылке отсутствует токен восстановления. Запросите письмо ещё раз со страницы профиля.
          </div>
        ) : null}

        <form className="mt-8 grid gap-4" onSubmit={submit}>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Новый пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">
              Повторите пароль
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
              className={fieldClass}
            />
          </label>

          {notice ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                notice.type === "success"
                  ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/35 bg-rose-400/10 text-rose-100"
              }`}
            >
              {notice.text}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !tokenValue}
            className="mt-2 h-12 rounded-2xl border border-brand/70 bg-brand px-4 text-sm font-semibold uppercase tracking-[0.08em] text-white transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,90,0,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Сохраняем..." : "Сохранить новый пароль"}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link href="/login" className="text-text-secondary underline-offset-2 transition-colors hover:text-brand hover:underline">
            Войти в кабинет
          </Link>
          <Link href="/profile" className="text-text-secondary underline-offset-2 transition-colors hover:text-brand hover:underline">
            Вернуться в профиль
          </Link>
        </div>
      </div>
    </section>
  );
}
