"use client";

import { useEffect, useMemo, useState } from "react";

type AuthMode = "login" | "register";

type AuthNotice =
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | null;

type TelegramCandidate = {
  displayName: string;
  existingAccount: boolean;
};

type AvatarSource = "vk" | "telegram" | "upload" | "later" | "";

function AvatarSourceQuestion({
  value,
  onChange,
  telegramEnabled,
  vkEnabled,
}: {
  value: AvatarSource;
  onChange: (value: AvatarSource) => void;
  telegramEnabled: boolean;
  vkEnabled: boolean;
}) {
  const options = [
    ...(vkEnabled ? [{ id: "vk" as const, icon: "VK", label: "Взять из ВК", hint: "Подтянем после подключения VK ID" }] : []),
    ...(telegramEnabled ? [{ id: "telegram" as const, icon: "✈", label: "Взять из Telegram", hint: "Подтянем после привязки бота" }] : []),
    { id: "upload" as const, icon: "＋", label: "Загрузить фото", hint: "Кадрирование после регистрации" },
    { id: "later" as const, icon: "○", label: "Добавить позже", hint: "Покажем цветные инициалы" },
  ];
  return (
    <fieldset className="rounded-2xl border border-white/12 bg-white/[0.035] p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Откуда взять аватар?</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-16 rounded-xl border px-3 py-2 text-left transition ${value === option.id ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_20px_rgba(0,209,255,0.12)]" : "border-white/10 bg-surface/30 hover:border-white/25"}`}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-text-primary"><span className="grid h-7 min-w-7 place-items-center rounded-full bg-white/10 px-1 text-[11px] text-cyan-200">{option.icon}</span>{option.label}</span>
            <span className="mt-1 block pl-9 text-[11px] leading-4 text-text-secondary">{option.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function PlayerAuthPanel({
  initialMode = "login",
  redirectTo = "/profile",
  initialNotice = null,
  telegramAuthEnabled = false,
  vkIdEnabled = false,
  appearance = "default",
}: {
  initialMode?: AuthMode;
  redirectTo?: string;
  initialNotice?: Exclude<AuthNotice, null> | null;
  telegramAuthEnabled?: boolean;
  vkIdEnabled?: boolean;
  appearance?: "default" | "compact";
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [legacyOpen, setLegacyOpen] = useState(
    initialMode === "register" || (!telegramAuthEnabled && !vkIdEnabled)
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(initialNotice);
  const [telegramWaiting, setTelegramWaiting] = useState(false);
  const [telegramCandidate, setTelegramCandidate] = useState<TelegramCandidate | null>(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramOpened, setTelegramOpened] = useState(false);
  const [telegramSwitchRequired, setTelegramSwitchRequired] = useState(false);
  const [telegramConsent, setTelegramConsent] = useState(false);
  const [linkExistingFlow, setLinkExistingFlow] = useState(false);
  const [vkConsent, setVkConsent] = useState(false);
  const [vkLoading, setVkLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
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
  const [avatarSource, setAvatarSource] = useState<AvatarSource>("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!telegramAuthEnabled) return;
    let cancelled = false;

    async function restoreTelegramIntent() {
      try {
        const response = await fetch("/api/auth/telegram-login", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.status === "confirmed") {
          setTelegramCandidate({
            displayName: String(data.displayName || "Игрок Telegram"),
            existingAccount: Boolean(data.existingAccount),
          });
          setTelegramWaiting(false);
        } else if (data?.status === "pending") {
          setTelegramOpened(Boolean(data.telegramOpened));
          setTelegramWaiting(true);
        }
      } catch {
        // No active intent is a normal first-visit state.
      }
    }

    void restoreTelegramIntent();
    return () => {
      cancelled = true;
    };
  }, [telegramAuthEnabled]);

  useEffect(() => {
    if (!telegramAuthEnabled || !telegramWaiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollTelegramIntent() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(pollTelegramIntent, 2500);
        return;
      }
      try {
        const response = await fetch("/api/auth/telegram-login", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.status === "confirmed") {
          setTelegramCandidate({
            displayName: String(data.displayName || "Игрок Telegram"),
            existingAccount: Boolean(data.existingAccount),
          });
          setTelegramWaiting(false);
          setTelegramCode("");
          return;
        }
        if (["expired", "invalid"].includes(String(data?.status || ""))) {
          setTelegramWaiting(false);
          setTelegramCode("");
          setNotice({
            type: "error",
            text: data?.status === "invalid"
              ? "Привязка Telegram изменилась. Начните вход заново."
              : "Попытка входа истекла или была отклонена. Начните заново.",
          });
          return;
        }
        if (data?.status === "pending") {
          setTelegramOpened(Boolean(data.telegramOpened));
        }
      } catch {
        // A transient polling failure is retried while the intent is active.
      }
      timer = setTimeout(pollTelegramIntent, 2500);
    }

    void pollTelegramIntent();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [telegramAuthEnabled, telegramWaiting]);

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
      Boolean(avatarSource) &&
      consent &&
      !loading
    );
  }, [firstName, lastName, regEmail, regPassword, regPasswordConfirm, gender, level, mixLevel, avatarSource, consent, loading]);

  async function continueAfterRegistration() {
    if (avatarSource === "vk" && vkIdEnabled) {
      const response = await fetch("/api/auth/vk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "link", privacyConsent: true, returnTo: redirectTo }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && typeof data.authorizationUrl === "string") {
        window.location.assign(data.authorizationUrl);
        return;
      }
    }
    if (avatarSource === "telegram" && telegramAuthEnabled) {
      window.location.assign(`/cabinet?tab=settings&avatarSetup=telegram&returnTo=${encodeURIComponent(redirectTo)}#profile-connections`);
      return;
    }
    if (avatarSource === "upload") {
      window.location.assign(`/cabinet?tab=settings&avatarSetup=upload&returnTo=${encodeURIComponent(redirectTo)}#profile-photo`);
      return;
    }
    window.location.assign(redirectTo);
  }

  async function consumeTelegramIntent(
    action: "continue" | "link_current" = "continue",
    switchAccount = false
  ): Promise<boolean> {
    const response = await fetch("/api/auth/telegram-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        switchAccount,
        privacyConsent: telegramConsent,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) {
      window.location.assign(String(data.returnTo || redirectTo));
      return true;
    }
    const code = String(data?.code || "");
    if (code === "account_switch") {
      setTelegramSwitchRequired(true);
    }
    if (code === "link_current_available") {
      setLinkExistingFlow(true);
      setLegacyOpen(true);
      setMode("login");
    }
    setNotice({
      type: "error",
      text: data?.error || "Не удалось завершить вход через Telegram",
    });
    return false;
  }

  async function confirmTelegramIntent(switchAccount = false) {
    setNotice(null);
    setLoading(true);
    try {
      await consumeTelegramIntent("continue", switchAccount);
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

  async function cancelTelegramIntent() {
    setLoading(true);
    try {
      await fetch("/api/auth/telegram-login", { method: "DELETE" });
      setTelegramWaiting(false);
      setTelegramCandidate(null);
      setTelegramCode("");
      setTelegramOpened(false);
      setTelegramSwitchRequired(false);
      setTelegramConsent(false);
      setLinkExistingFlow(false);
      setNotice(null);
    } finally {
      setLoading(false);
    }
  }

  async function verifyTelegramCode() {
    const code = telegramCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      setNotice({ type: "error", text: "Введите шестизначный код из сообщения бота." });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/telegram-login", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.status !== "confirmed") {
        setNotice({
          type: "error",
          text: data?.error || "Не удалось проверить код",
        });
        if (["locked", "expired"].includes(String(data?.code || ""))) {
          setTelegramWaiting(false);
          setTelegramOpened(false);
          setTelegramCode("");
        }
        return;
      }
      setTelegramCandidate({
        displayName: String(data.displayName || "Игрок Telegram"),
        existingAccount: Boolean(data.existingAccount),
      });
      setTelegramWaiting(false);
      setTelegramCode("");
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setLoading(false);
    }
  }

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

      if (linkExistingFlow && telegramCandidate && !telegramCandidate.existingAccount) {
        const linked = await consumeTelegramIntent("link_current");
        if (linked) return;
        return;
      }

      await continueAfterRegistration();
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

      await continueAfterRegistration();
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

  async function startVkLogin() {
    if (!vkConsent || vkLoading) return;
    setNotice(null);
    setVkLoading(true);
    try {
      const response = await fetch("/api/auth/vk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: redirectTo, privacyConsent: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data?.authorizationUrl !== "string") {
        setNotice({ type: "error", text: data?.error || "Не удалось начать вход через VK ID" });
        return;
      }
      window.location.assign(data.authorizationUrl);
    } catch {
      setNotice({ type: "error", text: "Ошибка сети. Повторите попытку." });
    } finally {
      setVkLoading(false);
    }
  }

  const vkLoginButtonBlock = vkIdEnabled ? (
    <div className="mt-6 rounded-2xl border border-[#2787f5]/35 bg-[#2787f5]/10 p-4">
      <button
        type="button"
        disabled={!vkConsent || vkLoading}
        onClick={() => void startVkLogin()}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#2787F5] px-5 py-3 text-sm font-semibold uppercase tracking-[0.06em] text-white transition hover:bg-[#1f79df] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <VkIcon className="h-6 w-6" />
        {vkLoading ? "Открываем VK ID..." : "Продолжить с VK ID"}
      </button>
      <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
        <input
          type="checkbox"
          checked={vkConsent}
          onChange={(event) => setVkConsent(event.target.checked)}
          className="mt-0.5 accent-[#2787F5]"
        />
        <span>
          Согласен с <LinkToPolicy />. При первом входе аккаунт создастся автоматически.
        </span>
      </label>
    </div>
  ) : null;

  const compactVkLoginButtonBlock = vkIdEnabled ? (
    <div className="cabinet-auth-vk-method">
      <label id="cabinet-vk-consent" className="cabinet-auth-vk-consent">
        <input
          type="checkbox"
          checked={vkConsent}
          onChange={(event) => setVkConsent(event.target.checked)}
        />
        <span>
          <strong>Согласие для входа через VK ID</strong>
          <span>Согласен с <LinkToPolicy />. При первом входе аккаунт создастся автоматически.</span>
        </span>
      </label>
      <button
        type="button"
        disabled={!vkConsent || vkLoading}
        aria-describedby="cabinet-vk-consent"
        onClick={() => void startVkLogin()}
        className="cabinet-auth-method cabinet-auth-method--vk"
      >
        <VkIcon className="h-5 w-5" />
        {vkLoading ? "Открываем VK ID..." : "Продолжить с VK ID"}
      </button>
    </div>
  ) : null;

  const vkGuideBlock = vkIdEnabled ? (
    <section aria-labelledby="vk-registration-guide" className="mt-4 space-y-3">
      <h3 id="vk-registration-guide" className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
        Как войти правильно
      </h3>
      <div className="rounded-2xl border border-white/12 bg-white/[0.035] p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#2787F5]/45 bg-[#2787F5]/12 text-[#71b7ff]">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.5 20c.5-3.7 2.65-5.55 6.5-5.55 1.05 0 1.98.14 2.78.43M18.25 13.5v6M15.25 16.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-text-primary">Впервые на сайте?</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">Войдите через VK — аккаунт создастся автоматически. Затем в настройках профиля привяжите только свою карточку игрока.</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/12 bg-white/[0.035] p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand/40 bg-brand/10 text-brand">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.5 20c.5-3.7 2.65-5.55 6.5-5.55s6 1.85 6.5 5.55" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-text-primary">Уже есть аккаунт?</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">Сначала войдите по email и паролю, затем откройте «Профиль → Настройки → Подключить VK ID». Карточка, игры и статистика сохранятся.</p>
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100">
        <span aria-hidden="true" className="mt-px text-amber-300">⚠</span>
        <span>Не привязывайте чужую карточку. Если произошла ошибка, администратор снимет неверную привязку без удаления рейтинга и истории.</span>
      </p>
    </section>
  ) : null;
  const telegramStartUrl = `/api/auth/telegram-start?returnTo=${encodeURIComponent(redirectTo)}`;

  if (appearance === "compact") {
    const compactNotice = notice ? (
      <div
        className={`cabinet-auth-notice cabinet-auth-notice--${notice.type}`}
        role={notice.type === "error" ? "alert" : "status"}
      >
        {notice.text}
      </div>
    ) : null;

    if (mode === "register") {
      return (
        <section className="cabinet-player-auth" aria-labelledby="cabinet-register-title">
          <div className="cabinet-auth-kicker">Новый игрок</div>
          <h1 id="cabinet-register-title" className="cabinet-auth-title">Регистрация</h1>
          <p className="cabinet-auth-lead">
            Создайте аккаунт, чтобы участвовать в турнирах и следить за своей статистикой.
          </p>

          {compactNotice}

          <form className="cabinet-auth-form" onSubmit={submitRegister}>
            <div className="cabinet-auth-field-grid">
              <label className="cabinet-auth-label">
                <span>Имя</span>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                  placeholder="Иван"
                  className="cabinet-auth-input"
                />
              </label>
              <label className="cabinet-auth-label">
                <span>Фамилия</span>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                  placeholder="Петров"
                  className="cabinet-auth-input"
                />
              </label>
            </div>

            <label className="cabinet-auth-label">
              <span>Email</span>
              <input
                type="email"
                value={regEmail}
                onChange={(event) => setRegEmail(event.target.value)}
                autoComplete="email"
                required
                placeholder="name@example.ru"
                className="cabinet-auth-input"
              />
            </label>

            <label className="cabinet-auth-label">
              <span>Пароль</span>
              <input
                type="password"
                value={regPassword}
                onChange={(event) => setRegPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                className="cabinet-auth-input"
              />
            </label>

            <label className="cabinet-auth-label">
              <span>Подтверждение пароля</span>
              <input
                type="password"
                value={regPasswordConfirm}
                onChange={(event) => setRegPasswordConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                className="cabinet-auth-input"
              />
            </label>

            <fieldset className="cabinet-auth-fieldset">
              <legend>Пол</legend>
              <div className="cabinet-auth-segmented">
                <button
                  type="button"
                  aria-pressed={gender === "M"}
                  onClick={() => setGender("M")}
                  className={gender === "M" ? "is-active" : ""}
                >
                  Мужской
                </button>
                <button
                  type="button"
                  aria-pressed={gender === "W"}
                  onClick={() => setGender("W")}
                  className={gender === "W" ? "is-active" : ""}
                >
                  Женский
                </button>
              </div>
            </fieldset>

            <label className="cabinet-auth-label">
              <span>Уровень</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)} required className="cabinet-auth-input">
                <option value="">Выберите уровень</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="advanced">Advanced</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="cabinet-auth-label">
              <span>Уровень микст</span>
              <select value={mixLevel} onChange={(event) => setMixLevel(event.target.value)} required className="cabinet-auth-input">
                <option value="">Выберите уровень</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="advanced">Advanced</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <AvatarSourceQuestion value={avatarSource} onChange={setAvatarSource} telegramEnabled={telegramAuthEnabled} vkEnabled={vkIdEnabled} />

            <label className="cabinet-auth-check cabinet-auth-check--consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              <span>Я согласен с <LinkToPolicy /></span>
            </label>

            <button type="submit" disabled={!canRegister} className="cabinet-auth-submit">
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
            </button>
          </form>

          <p className="cabinet-auth-switch">
            Уже есть аккаунт?{" "}
            <button type="button" onClick={() => { setMode("login"); setNotice(null); }}>
              Войти
            </button>
          </p>
        </section>
      );
    }

    return (
      <section className="cabinet-player-auth" aria-labelledby="cabinet-login-title">
        <div className="cabinet-auth-kicker">Личный кабинет игрока</div>
        <h1 id="cabinet-login-title" className="cabinet-auth-title">Войти в личный кабинет</h1>
        <p className="cabinet-auth-lead">
          Управляйте профилем, статистикой и участием в турнирах.
        </p>

        <div className="cabinet-auth-methods" role="group" aria-label="Способы входа игрока">
          <div className="cabinet-auth-methods-label">Выберите способ входа</div>

          {compactVkLoginButtonBlock}

          {telegramAuthEnabled ? (
            <a
              href={`/login?returnTo=${encodeURIComponent(redirectTo)}`}
              className="cabinet-auth-method cabinet-auth-method--telegram"
            >
              <TelegramIcon className="h-5 w-5" />
              Продолжить через Telegram
            </a>
          ) : null}

          <details
            className="cabinet-auth-details cabinet-auth-details--method"
            open={legacyOpen}
            onToggle={(event) => setLegacyOpen(event.currentTarget.open)}
          >
            <summary>
              <span className="cabinet-auth-method-main">
                <MailIcon />
                <span>
                  <strong>Email и пароль</strong>
                  <small>Для существующего аккаунта</small>
                </span>
              </span>
            </summary>
          <div className="cabinet-auth-details-content">
            <form
              className="cabinet-auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canLogin) return;
                void submitLogin(rememberLogin);
              }}
            >
          <label className="cabinet-auth-label">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="name@example.ru"
              className="cabinet-auth-input"
            />
          </label>

          <label className="cabinet-auth-label">
            <span>Пароль</span>
            <span className="cabinet-auth-password">
              <input
                type={showLoginPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                minLength={6}
                required
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Введите пароль"
                className="cabinet-auth-input"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((value) => !value)}
                aria-label={showLoginPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-pressed={showLoginPassword}
                className="cabinet-auth-password-toggle"
              >
                {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
          </label>

          <div className="cabinet-auth-options">
            <label className="cabinet-auth-check">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(event) => setRememberLogin(event.target.checked)}
              />
              <span>Запомнить меня</span>
            </label>
            <button
              type="button"
              className="cabinet-auth-link"
              onClick={() => {
                setResetEmail(loginEmail);
                setShowReset((value) => !value);
              }}
            >
              Забыли пароль?
            </button>
          </div>

          {showReset ? (
            <div className="cabinet-auth-reset">
              <label className="cabinet-auth-label">
                <span>Email для восстановления</span>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="name@example.ru"
                  className="cabinet-auth-input"
                />
              </label>
              <button type="button" disabled={loading} onClick={() => void submitResetPassword()}>
                Отправить ссылку
              </button>
            </div>
          ) : null}

              <button type="submit" disabled={!canLogin} className="cabinet-auth-submit">
                {loading ? "Входим..." : "Войти"}
              </button>
            </form>

            <p className="cabinet-auth-switch">
              Нет аккаунта по email?{" "}
              <button type="button" onClick={() => { setMode("register"); setNotice(null); }}>
                Зарегистрироваться
              </button>
            </p>
          </div>
          </details>
        </div>

        {compactNotice}

        {vkGuideBlock ? (
          <details className="cabinet-auth-help">
            <summary>Как работает вход?</summary>
            {vkGuideBlock}
          </details>
        ) : null}
      </section>
    );
  }

  const fieldClass =
    "mt-2 h-12 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-brand/70 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,90,0,0.22),0_0_18px_rgba(255,90,0,0.14)]";
  const selectClass =
    "mt-2 h-12 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 text-sm text-text-primary outline-none transition-all focus:border-brand/70 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,90,0,0.22),0_0_18px_rgba(255,90,0,0.14)]";
  const primaryButtonClass =
    "h-12 rounded-2xl border border-brand/70 bg-brand px-4 text-sm font-semibold uppercase tracking-[0.08em] text-white transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,90,0,0.34)] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="glass-panel relative overflow-hidden rounded-[28px] border border-cyan-400/22 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,90,0,0.14),transparent_36%),rgba(11,17,24,0.92)] p-6 md:p-8 text-text-primary shadow-[0_22px_60px_rgba(0,0,0,0.38)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="relative">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-condensed text-xs uppercase tracking-[0.28em] text-cyan-300/80">
            Player Access
          </div>
          <h2 className="mt-2 font-heading text-3xl leading-none tracking-[0.04em] text-text-primary sm:text-5xl">
            Вход в LPVOLLEY
          </h2>
        </div>
        {telegramAuthEnabled ? (
          <div
            aria-hidden="true"
            className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-[#2AABEE]/40 bg-[#2AABEE]/10 text-[#54bdf3] shadow-[0_0_24px_rgba(42,171,238,0.18)] md:flex"
          >
            <TelegramIcon className="h-7 w-7" />
          </div>
        ) : null}
      </div>
      <p className="mt-3 max-w-xl text-sm text-text-secondary">
        {vkIdEnabled
          ? 'Быстрый публичный вход через VK ID — без email и пароля.'
          : 'Входите через Telegram или по email и паролю.'}
      </p>

      {vkLoginButtonBlock}

      {telegramAuthEnabled ? (
        <>
          <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
            Откройте личный чат с ботом — он выдаст одноразовый код для безопасного входа.
          </p>
      {telegramCandidate ? (
        <div className="mt-7 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Telegram подтверждён
          </p>
          <p className="mt-2 text-base font-semibold text-text-primary">
            Войти как {telegramCandidate.displayName}?
          </p>
          {!telegramCandidate.existingAccount ? (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Telegram ещё не связан с аккаунтом LPVOLLEY. Можно создать новый аккаунт без email либо войти в старый аккаунт по email и подключить Telegram к нему.
            </p>
          ) : null}
          <div className="mt-4 grid gap-2">
            <label className="mb-2 inline-flex items-start gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={telegramConsent}
                onChange={(event) => setTelegramConsent(event.target.checked)}
                className="mt-0.5 accent-[#2AABEE]"
              />
              <span>
                Согласен с{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-text-primary">
                  Политикой обработки персональных данных
                </a>
              </span>
            </label>
            <button
              type="button"
              disabled={loading || !telegramConsent}
              onClick={() => void confirmTelegramIntent(false)}
              className="min-h-12 rounded-2xl bg-[#2AABEE] px-5 py-3 text-sm font-semibold uppercase tracking-[0.06em] text-white transition hover:bg-[#229ED9] disabled:opacity-60"
            >
              {loading
                ? "Завершаем вход..."
                : telegramCandidate.existingAccount
                  ? `Войти как ${telegramCandidate.displayName}`
                  : "Создать аккаунт и войти"}
            </button>
            {!telegramCandidate.existingAccount ? (
              <button
                type="button"
                disabled={loading || !telegramConsent}
                onClick={() => {
                  setLinkExistingFlow(true);
                  setLegacyOpen(true);
                  setMode("login");
                  setNotice(null);
                }}
                className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-cyan-300/50"
              >
                У меня уже есть аккаунт — войти по email
              </button>
            ) : null}
            {telegramSwitchRequired ? (
              <button
                type="button"
                disabled={loading || !telegramConsent}
                onClick={() => void confirmTelegramIntent(true)}
                className="min-h-11 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100"
              >
                Сменить открытый аккаунт и войти
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading}
              onClick={() => void cancelTelegramIntent()}
              className="min-h-10 text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              Отменить
            </button>
          </div>
        </div>
      ) : telegramWaiting ? (
        <div className="mt-7 rounded-2xl border border-[#5bc8ff]/35 bg-[#2AABEE]/10 p-4" aria-live="polite">
          <p className="text-sm font-semibold text-text-primary">
            {telegramOpened
              ? "Введите код из личного сообщения бота"
              : "Ожидаем открытия @Lpvolley_bot…"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            Код вводится только здесь, в исходной вкладке LPVOLLEY. Не сообщайте его другим людям.
          </p>
          {telegramOpened ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Шестизначный код из Telegram"
                value={telegramCode}
                onChange={(event) => setTelegramCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="h-12 flex-1 rounded-2xl border border-white/15 bg-black/15 px-4 text-center font-mono text-xl tracking-[0.28em] text-text-primary outline-none focus:border-[#5bc8ff]"
              />
              <button
                type="button"
                disabled={loading || telegramCode.length !== 6}
                onClick={() => void verifyTelegramCode()}
                className="h-12 rounded-2xl bg-[#2AABEE] px-5 text-sm font-semibold text-white transition hover:bg-[#229ED9] disabled:opacity-50"
              >
                Проверить код
              </button>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
            <a
              href={telegramStartUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setTelegramWaiting(true);
                setTelegramOpened(false);
                setTelegramCode("");
                setNotice(null);
              }}
              className="font-semibold text-[#70ceff] underline underline-offset-4"
            >
              Открыть Telegram ещё раз
            </a>
            <button
              type="button"
              disabled={loading}
              onClick={() => void cancelTelegramIntent()}
              className="text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              Отменить
            </button>
          </div>
        </div>
      ) : (
        <>
          <a
            href={telegramStartUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setTelegramCandidate(null);
              setTelegramWaiting(true);
              setTelegramOpened(false);
              setTelegramCode("");
              setTelegramSwitchRequired(false);
              setTelegramConsent(false);
              setLinkExistingFlow(false);
              setNotice(null);
            }}
            className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-[#5bc8ff]/50 bg-[#2AABEE] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-[0_12px_30px_rgba(42,171,238,0.22)] transition-all hover:bg-[#229ED9] hover:shadow-[0_14px_34px_rgba(42,171,238,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bd8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1118]"
          >
            <TelegramIcon className="h-5 w-5" />
            Продолжить в Telegram
          </a>
          <p className="mt-3 text-center text-xs leading-relaxed text-text-secondary">
            Откроется @{process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Lpvolley_bot"} в новой вкладке. Получите код в личном чате и введите его здесь.
          </p>
          <button
            type="button"
            onClick={() => {
              setLegacyOpen(true);
              setMode("login");
            }}
            className="mx-auto mt-3 block text-xs font-semibold text-amber-100/90 underline underline-offset-4"
          >
            Уже был аккаунт по email? Войдите в него, чтобы не создавать дубль.
          </button>
        </>
      )}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-text-secondary/80">
        Нажимая «Продолжить в Telegram», вы соглашаетесь с{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-text-primary">
          Политикой обработки персональных данных
        </a>.
      </p>
        </>
      ) : null}

      {vkGuideBlock}

      {notice ? (
        <div
          className={[
            "mt-5 rounded-2xl border px-4 py-3 text-sm shadow-[0_0_22px_rgba(0,0,0,0.12)]",
            notice.type === "success"
              ? "border-emerald-400/35 bg-emerald-400/12 text-emerald-200"
              : "border-red-400/35 bg-red-400/12 text-red-200",
          ].join(" ")}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.text}
        </div>
      ) : null}

      <details
        className="group mt-6 border-t border-white/10 pt-4"
        open={legacyOpen}
        onToggle={(event) => setLegacyOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none text-center text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            {telegramAuthEnabled ? 'Раньше входили по email?' : 'Вход по email'}
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
      {linkExistingFlow ? (
        <p className="mb-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
          Войдите в старый аккаунт. После успешного пароля подтверждённый Telegram подключится к нему вместо создания дубля.
        </p>
      ) : null}
      {mode === "login" ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-condensed text-xs uppercase tracking-[0.28em] text-cyan-300/80">
                Player Access
              </div>
              <h3 className="mt-2 font-heading text-3xl leading-none tracking-[0.04em] text-text-primary sm:text-4xl">
                Вход по email
              </h3>
            </div>
            <div aria-hidden="true" className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-brand/35 bg-brand/10 text-brand shadow-[0_0_24px_rgba(255,90,0,0.18)] md:flex">
              <span className="font-heading text-3xl">LP</span>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm text-text-secondary">
            Войдите в аккаунт, чтобы открыть личный кабинет игрока, фото, статистику и историю игр.
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
                name="email"
                autoComplete="email"
                required
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
                name="password"
                autoComplete="current-password"
                minLength={6}
                required
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
              type="submit"
              disabled={!canLogin}
              className={`mt-2 ${primaryButtonClass}`}
            >
              {loading ? "Входим..." : "Войти по email"}
            </button>

            <div className="my-2 h-px bg-white/10" />

            <p className="text-center text-sm text-text-secondary">
              {telegramAuthEnabled
                ? 'Новый аккаунт создаётся через Telegram — без email и пароля.'
                : 'Публичная регистрация без email появится вместе с VK ID.'}
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
              <h3 className="mt-2 font-heading text-3xl leading-none tracking-[0.04em] text-text-primary sm:text-4xl">
                Регистрация
              </h3>
            </div>
            <div aria-hidden="true" className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(0,209,255,0.16)] md:flex">
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

            <AvatarSourceQuestion value={avatarSource} onChange={setAvatarSource} telegramEnabled={telegramAuthEnabled} vkEnabled={vkIdEnabled} />

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
        </div>
      </details>
      </div>
    </section>
  );
}

function TelegramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.7 3.5 18.6 19c-.2 1.1-.9 1.4-1.8.9l-4.7-3.5-2.3 2.2c-.2.3-.5.5-1 .5l.4-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.6 13 2 11.5c-1-.3-1-1 .2-1.5L20 3.1c.8-.3 1.9.2 1.7.4Z" />
    </svg>
  );
}

function VkIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.7 17.2c-5.5 0-8.7-3.8-8.9-10.2h2.8c.1 4.7 2.1 6.7 3.7 7.1V7h2.6v4.1c1.6-.2 3.3-2.1 3.9-4.1h2.6a7.9 7.9 0 0 1-3.6 5.1 8.2 8.2 0 0 1 4.2 5.1h-2.9c-.6-1.9-2.2-3.4-4.2-3.6v3.6h-.2Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 4 16 16M10.3 6.2A8.9 8.9 0 0 1 12 6c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.6 3.3M14.2 14.2A3 3 0 0 1 9.8 9.8M6.1 7.4A16.1 16.1 0 0 0 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5 7 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkToPolicy() {
  return (
    <a
      href="/privacy"
      className="text-brand underline underline-offset-2 transition-colors hover:text-brand-light"
      target="_blank"
      rel="noreferrer"
    >
      Политикой обработки персональных данных
    </a>
  );
}
