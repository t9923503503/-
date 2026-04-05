import Link from 'next/link';

export default function ThaiSpectatorNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Табло недоступно</h1>
      <p className="mt-3 text-sm text-[#aeb6c8]">
        Такой страницы нет, или турнир не в формате Thai Next, или live-состояние ещё не запущено (R1).
      </p>
      <Link href="/" className="mt-6 inline-block text-sm font-semibold text-sky-300 underline hover:text-sky-200">
        На главную
      </Link>
    </div>
  );
}
