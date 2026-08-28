import type { Metadata } from 'next';
import Link from 'next/link';
import PlayManagementClient from '@/components/partner/PlayManagementClient';

export const metadata: Metadata = { title: 'Создать игру или тренировку | LPVolley' };

export default function PlayManagePage() {
  return (
    <main className="play-surface mx-auto max-w-[1100px] px-4 py-6 md:py-10">
      <Link href="/partner" className="text-sm font-semibold text-cyan-200 hover:text-white">← К играм</Link>
      <header className="mt-5 pb-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand">LPVolley · Сургут</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-4xl">Создать событие</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">Любой зарегистрированный игрок может собрать игру. Отдельный статус организатора не нужен.</p>
      </header>
      <div className="mt-8"><PlayManagementClient /></div>
    </main>
  );
}
