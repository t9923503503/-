export default function TournamentsLoading() {
  return (
    <div className="space-y-5" aria-label="Загрузка турниров" aria-busy="true">
      <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-12 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-80 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
