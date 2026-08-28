export default function CoachSessionsLoading() {
  return <div className="space-y-5" aria-label="Загрузка тренировок"><div className="h-12 w-64 animate-pulse rounded-2xl bg-white/5" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-white/5" />)}</div></div>;
}
