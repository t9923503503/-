export default function TournamentGallerySkeleton() {
  return (
    <section className="px-4 py-6 md:px-6 md:py-8" aria-label="Загрузка фотографий" aria-busy="true">
      <div className="mx-auto max-w-7xl animate-pulse motion-reduce:animate-none">
        <div className="h-3 w-52 rounded-full bg-white/10" />
        <div className="mt-3 h-9 w-72 max-w-full rounded-xl bg-white/10" />
        <div className="mt-5 h-12 w-full rounded-2xl bg-white/10 md:w-[34rem]" />
        <div className="mt-4 grid h-[214px] grid-cols-12 grid-rows-2 gap-2.5 md:h-[330px]">
          <div className="col-span-8 row-span-2 rounded-2xl bg-white/10 md:col-span-6" />
          <div className="col-span-4 rounded-2xl bg-white/10 md:col-span-3" />
          <div className="col-span-4 rounded-2xl bg-white/10 md:col-span-3" />
        </div>
      </div>
    </section>
  );
}
