"use client";

import { useMemo, useState } from "react";

type AuthMode = "login" | "register";

type AuthNotice =
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | null;

export default function PlayerAuthPanel({
  initialMode = "login",
  redirectTo = "/profile",
}: {
  initialMode?: AuthMode;
  redirectTo?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [resetEmail, setResetEmail] = useState("");
  const [showReset, setShowReset] = useState(false);

  // Register fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [gender, setGender] = useState<"M" | "W" | "">("");
  const [level, setLevel] = useState("");
  const [mixLevel, setMixLevel] = useState("");
  const [consent, setConsent] = useState(false);

  const canLogin = useMemo(() => {
    return loginEmail.trim().includes("@") && loginPassword.trim().length >= 6 && !loading;
  }, [loginEmail, loginPassword, loading]);

  const canRegister = useMemo(() => {
    const validEmail = regEmail.trim().includes("@");
    const validPwd = regPassword.trim().length >= 6;
    const samePwd = regPassword.trim() === regPasswordConfirm.trim();
    return (
      firstName.trim().length >= 2 &&
      lastName.trim().length >= 2 &&
      validEmail &&
      validPwd &&
      samePwd &&
      Boolean(gender) &&
      Boolean(level) &&
      Boolean(mixLevel) &&
      consent &&
      !loading
    );
  }, [firstName, lastName, regEmail, regPassword, regPasswordConfirm, gender, level, mixLevel, consent, loading]);

  async function submitLogin(remember: boolean) {
    setNotice(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.toLowerCase().trim(),
          password: loginPassword,
          remember,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({
          type: "error",
          text: data?.error || "Не удалось войти в аккаунт",
        });
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!canRegister) return;

    setLoading(true);
    try {
      const safeEmail = regEmail.toLowerCase().trim();
      const safePassword = regPassword.trim();
      const safeFirstName = firstName.trim();
      const safeLastName = lastName.trim();
      const fullName = `${safeFirstName} ${safeLastName}`.trim();

      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: safeEmail,
          password: safePassword,
          full_name: fullName,
          first_name: safeFirstName,
          last_name: safeLastName,
          gender,
          level,
          mix_level: mixLevel,
          consent,
        }),
      });
      const registerData = await registerResponse.json().catch(() => ({}));

      if (!registerResponse.ok) {
        setNotice({
          type: "error",
          text: registerData?.error || "Не удалось создать аккаунт",
        });
        return;
      }

      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: safeEmail,
          password: safePassword,
          remember: true,
        }),
      });

      if (!loginResponse.ok) {
        setNotice({
          type: "success",
          text: "Аккаунт создан. Выполните вход по email и паролю.",
        });
        setMode("login");
        setLoginEmail(safeEmail);
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

  async function submitResetPassword() {
    setNotice(null);

    const email = resetEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setNotice({ type: "error", text: "Введите корректный email" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({
          type: "error",
          text: data?.error || "Не удалось отправить письмо",
        });
        return;
      }

      setNotice({
        type: "success",
        text: data?.message || "Если аккаунт существует, письмо отправлено",
      });
      setShowReset(false);
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "mt-2 h-12 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-brand/70 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,90,0,0.22),0_0_18px_rgba(255,90,0,0.14)]";
  const selectClass =
    "mt-2 h-12 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all focus:border-brand/70 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,90,0,0.22),0_0_18px_rgba(255,90,0,0.14)]";
  const ghostButtonClass =
    "h-12 rounded-2xl border border-cyan-400/35 bg-cyan-400/[0.03] px-4 text-sm font-semibold uppercase tracking-[0.08em] text-text-primary transition-all hover:border-cyan-300/70 hover:bg-cyan-400/[0.08] hover:shadow-[0_0_20px_rgba(0,209,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60";
  const primaryButtonClass =
    "h-12 rounded-2xl border border-brand/70 bg-brand px-4 text-sm font-semibold uppercase tracking-[0.08em] text-white transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,90,0,0.34)] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="glass-panel relative overflow-hidden rounded-[28px] border border-cyan-400/22 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,90,0,0.14),transparent_36%),rgba(11,17,24,0.92)] p-6 md:p-8 text-text-primary shadow-[0_22px_60px_rgba(0,0,0,0.38)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="relative">
      {mode === "login" ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-condensed text-xs uppercase tracking-[0.28em] text-cyan-300/80">
                Player Access
              </div>
              <h2 className="mt-2 font-heading text-5xl leading-none tracking-[0.04em] text-text-primary">
                Вход В Кабинет
              </h2>
            </div>
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-brand/35 bg-brand/10 text-brand shadow-[0_0_24px_rgba(255,90,0,0.18)] md:flex">
              <span className="font-heading text-3xl">LP</span>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm text-text-secondary">
            Войдите в аккаунт, чтобы открыть личный кабинет игрока, фото, статистику и поиск пары.
          </p>

          <form
            className="mt-8 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canLogin) return;
              void submitLogin(rememberLogin);
            }}
          >
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="your@email.com"
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Пароль</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className={fieldClass}
              />
            </label>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-sm">
              <label className="inline-flex items-center gap-2 text-text-secondary">
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => setRememberLogin(e.target.checked)}
                  className="accent-brand"
                />
                Запомнить меня
              </label>
              <button
                type="button"
                className="text-text-secondary underline-offset-2 transition-colors hover:text-brand hover:underline"
                onClick={() => {
                  setResetEmail(loginEmail);
                  setShowReset((v) => !v);
                }}
              >
                Забыли пароль?
              </button>
            </div>

            {showReset ? (
              <div className="rounded-2xl border border-brand/25 bg-brand/[0.06] p-4 shadow-[inset_0_0_24px_rgba(255,90,0,0.06)]">
                <div className="grid gap-3">
                  <label className="block">
                    <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">
                      Email для восстановления
                    </span>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="mt-2 h-11 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-brand/70"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void submitResetPassword()}
                    className={primaryButtonClass}
                  >
                    Отправить ссылку
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canLogin}
              onClick={() => void submitLogin(true)}
              className={`mt-2 ${primaryButtonClass}`}
            >
              {loading ? "Входим..." : "Войти и запомнить"}
            </button>

            <button
              type="button"
              disabled={!canLogin}
              onClick={() => void submitLogin(false)}
              className={ghostButtonClass}
            >
              Войти (только сейчас)
            </button>

            <div className="my-2 h-px bg-white/10" />

            <p className="text-center text-sm text-text-secondary">
              Нет аккаунта?{" "}
              <button
                type="button"
                className="font-semibold text-brand transition-colors hover:text-brand-light"
                onClick={() => {
                  setMode("register");
                  setNotice(null);
                }}
              >
                Зарегистрироваться
              </button>
            </p>
          </form>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-condensed text-xs uppercase tracking-[0.28em] text-brand/80">
                New Player
              </div>
              <h2 className="mt-2 font-heading text-5xl leading-none tracking-[0.04em] text-text-primary">
                Регистрация
              </h2>
            </div>
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(0,209,255,0.16)] md:flex">
              <span className="font-heading text-3xl">+</span>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm text-text-secondary">
            Создайте аккаунт и начните соревноваться. После входа откроется ваш личный кабинет игрока.
          </p>

          <form className="mt-7 grid gap-3" onSubmit={submitRegister}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Имя</span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Иван"
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Фамилия</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Петров"
                  className={fieldClass}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Email</span>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="your@email.com"
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Пароль</span>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Подтверждение пароля</span>
              <input
                type="password"
                value={regPasswordConfirm}
                onChange={(e) => setRegPasswordConfirm(e.target.value)}
                className={fieldClass}
              />
            </label>

            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Пол</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGender("M")}
                  className={`h-11 rounded-xl border text-sm font-medium ${
                    gender === "M"
                      ? "border-brand/70 bg-brand/15 text-text-primary shadow-[0_0_18px_rgba(255,90,0,0.15)]"
                      : "border-white/12 bg-white/[0.04] text-text-secondary hover:border-white/22 hover:text-text-primary"
                  }`}
                >
                  Мужской
                </button>
                <button
                  type="button"
                  onClick={() => setGender("W")}
                  className={`h-11 rounded-xl border text-sm font-medium ${
                    gender === "W"
                      ? "border-brand/70 bg-brand/15 text-text-primary shadow-[0_0_18px_rgba(255,90,0,0.15)]"
                      : "border-white/12 bg-white/[0.04] text-text-secondary hover:border-white/22 hover:text-text-primary"
                  }`}
                >
                  Женский
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Уровень</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className={selectClass}
              >
                <option value="">Выберите уровень</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="advanced">Advanced</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-text-secondary">Уровень микст</span>
              <select
                value={mixLevel}
                onChange={(e) => setMixLevel(e.target.value)}
                className={selectClass}
              >
                <option value="">Выберите уровень</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="advanced">Advanced</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="mt-2 inline-flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <span>
                Я даю согласие на обработку персональных данных в соответствии с{" "}
                <LinkToPolicy />
              </span>
            </label>

            <button
              type="submit"
              disabled={!canRegister}
              className={`mt-3 ${primaryButtonClass}`}
            >
              {loading ? "Создаём аккаунт..." : "Создать аккаунт"}
            </button>

            <div className="my-2 h-px bg-white/10" />

            <p className="text-center text-sm text-text-secondary">
              Уже есть аккаунт?{" "}
              <button
                type="button"
                className="font-semibold text-brand transition-colors hover:text-brand-light"
                onClick={() => {
                  setMode("login");
                  setNotice(null);
                }}
              >
                Войти
              </button>
            </p>
          </form>
        </>
      )}

      {notice ? (
        <div
          className={[
            "mt-5 rounded-2xl border px-4 py-3 text-sm shadow-[0_0_22px_rgba(0,0,0,0.12)]",
            notice.type === "success"
              ? "border-emerald-400/35 bg-emerald-400/12 text-emerald-200"
              : "border-red-400/35 bg-red-400/12 text-red-200",
          ].join(" ")}
          role="status"
        >
          {notice.text}
        </div>
      ) : null}
      </div>
    </section>
  );
}

function LinkToPolicy() {
  return (
    <a
      href="/pravila"
      className="text-brand underline underline-offset-2 transition-colors hover:text-brand-light"
      target="_blank"
      rel="noreferrer"
    >
      Политикой обработки персональных данных
    </a>
  );
}
