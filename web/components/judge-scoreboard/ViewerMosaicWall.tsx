'use client';

const COURTS = ['1', '2', '3', '4'] as const;

function buildViewerUrl(courtId: string): string {
  return `/judge-scoreboard/${courtId}/viewer`;
}

export function ViewerMosaicWall() {
  return (
    <div className="min-h-[100dvh] bg-[#020611] text-white">
      <header
        className="sticky top-0 z-30 border-b border-white/10 bg-[#020611]/90 px-4 py-3 backdrop-blur"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
        }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">LPVOLLEY</div>
            <div className="text-2xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Viewer Mosaic 2x2
            </div>
          </div>
          <a
            href="/judge-scoreboard/viewer"
            className="rounded-lg border border-sky-400/35 bg-sky-500/15 px-3 py-2 text-xs font-black uppercase tracking-widest text-sky-100"
          >
            Вернуться к авто-viewer
          </a>
        </div>
      </header>

      <main
        className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-2 p-2 md:grid-cols-2"
        style={{
          minHeight: 'calc(100dvh - 72px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        }}
      >
        {COURTS.map((courtId) => (
          <section key={courtId} className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1120]">
            <div className="border-b border-white/10 bg-black/25 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/70">
              Корт {courtId}
            </div>
            <iframe
              title={`LPVOLLEY Viewer Court ${courtId}`}
              src={buildViewerUrl(courtId)}
              className="h-[46dvh] w-full border-0 md:h-[43dvh]"
              loading="lazy"
            />
          </section>
        ))}
      </main>
    </div>
  );
}
