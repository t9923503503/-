'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { GoMatchView, GoOperatorState } from '@/lib/go-next/types';

export function GoSchedulePrintClient({ state, matches }: { state: GoOperatorState; matches: GoMatchView[] }) {
  const byCourt = state.courts.map((court) => ({ ...court, matches: matches.filter((match) => match.courtNo === court.courtNo) }));
  return <main className="min-h-screen bg-zinc-100 p-4 text-zinc-900 print:bg-white print:p-0">
    <div className="mx-auto max-w-5xl"><button type="button" onClick={() => window.print()} className="mb-4 rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white print:hidden">Печать / PDF</button>
      <h1 className="text-2xl font-bold">GO: расписание и сетка</h1><p className="mt-1 text-sm text-zinc-600">Сформировано для судей. QR ведёт на экран соответствующего корта.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{byCourt.map((court) => <section key={court.courtNo} className="break-inside-avoid rounded-xl border border-zinc-300 bg-white p-4 print:rounded-none print:border-black">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{court.label}</h2><p className="text-xs">PIN: {court.pinCode}</p></div><QRCodeSVG value={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lpvolley.ru'}/court/${court.pinCode}`} size={72} /></div>
        <ol className="mt-3 space-y-2 text-sm">{court.matches.map((match) => <li key={match.matchId} className="border-t border-zinc-200 pt-2"><b>Матч {match.matchNo}</b> · {match.groupLabel ?? match.bracketLevel ?? 'Плей-офф'}<br />{match.teamA?.label ?? 'TBD'} — {match.teamB?.label ?? 'TBD'}</li>)}</ol>
      </section>)}</div>
    </div>
  </main>;
}
