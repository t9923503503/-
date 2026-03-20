import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Войти | Лютые Пляжники',
  description: 'Войдите через Telegram или Email, чтобы записаться на турнир и найти пару.',
};

export default function LoginPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-20 flex flex-col items-center">
      <h1 className="font-heading text-4xl text-text-primary tracking-wide uppercase text-center">
        Войти
      </h1>
      <p className="mt-3 font-body text-text-secondary text-center text-sm">
        Нужен аккаунт, чтобы записаться на турнир и искать пару.
      </p>

      <div className="mt-10 w-full flex flex-col gap-4">
        {/* Telegram */}
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#229ED9]/20 border border-[#229ED9]/30 text-[#229ED9] font-body font-semibold py-4 opacity-60 cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Войти через Telegram
        </button>

        {/* Email */}
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-white/5 border border-white/10 text-text-secondary font-body font-semibold py-4 opacity-60 cursor-not-allowed"
        >
          Войти через Email
        </button>
      </div>

      <p className="mt-8 font-body text-xs text-text-secondary/50 text-center">
        Авторизация в разработке
      </p>
    </main>
  );
}
