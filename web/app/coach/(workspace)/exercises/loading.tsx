export default function CoachExercisesLoading() {
  return <div className="space-y-4" aria-busy="true" aria-label="Загружаем упражнения"><div className="h-16 animate-pulse rounded-2xl bg-white/5" /><div className="h-32 animate-pulse rounded-3xl bg-white/5" /><div className="grid gap-4 md:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-white/5" />)}</div></div>;
}
