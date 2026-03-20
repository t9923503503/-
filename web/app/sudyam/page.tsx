import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Судьям | Лютые Пляжники',
  description: 'Приложение судьи King of the Court — управление кортами, таблицами и таймерами.',
};

// Middleware уже проверил PIN — если мы здесь, доступ разрешён
export default function SudyamPage() {
  const kotcUrl = process.env.NEXT_PUBLIC_KOTC_URL ?? 'http://localhost:8000';

  return (
    <iframe
      src={kotcUrl}
      className="w-full h-[calc(100vh-4rem)] border-0"
      title="King of the Court — приложение судьи"
      allow="clipboard-write"
    />
  );
}
