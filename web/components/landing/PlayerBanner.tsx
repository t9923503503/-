import Link from 'next/link';
import type { HomeStats } from '@/lib/queries';

export default function PlayerBanner({ stats }: { stats: HomeStats }) {
  return (
    <section className="py-6">
      <div className="max-w-6xl mx-auto px-4">
        <Link href="/rankings" className="glass-panel p-4 flex items-center gap-4 hover:border-brand/30 transition-colors block">
          <div className="flex -space-x-2 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-brand/20 border-2 border-surface flex items-center justify-center text-xs font-heading text-brand">M</div>
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 border-2 border-surface flex items-center justify-center text-xs font-heading text-cyan-400">W</div>
            <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-surface flex items-center justify-center text-xs text-text-secondary">+{stats.playerCount}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading text-text-primary text-sm uppercase">Рейтинг Лютости</div>
            <div className="text-text-secondary text-xs">Муж: {stats.menCount} · Жен: {stats.womenCount} · Всего: {stats.playerCount}</div>
          </div>
          <span className="text-brand text-xl flex-shrink-0">→</span>
        </Link>
      </div>
    </section>
  );
}
