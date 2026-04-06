'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Player, TournamentResult, RatingHistoryEntry } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import type { PlayerExtendedStats } from '@/lib/queries';

/* ── Helpers ─────────────────────────────────────── */

function placeEmoji(place: number) {
  if (place === 1) return '\u{1F947}';
  if (place === 2) return '\u{1F948}';
  if (place === 3) return '\u{1F949}';
  return `#${place}`;
}

function placeBorderClass(place: number) {
  if (place === 1) return 'border-gold/60 bg-gold/10';
  if (place === 2) return 'border-silver/60 bg-silver/10';
  if (place === 3) return 'border-bronze/60 bg-bronze/10';
  return 'border-white/10 bg-white/5';
}

function formatDate(d: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function rankBadge(rank: number | null, label: string, color: string) {
  if (!rank) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2 border"
      style={{ borderColor: `${color}55`, background: `${color}15` }}
    >
      <span className="font-heading text-2xl" style={{ color }}>#{rank}</span>
      <span className="text-xs font-condensed uppercase tracking-wider text-text-secondary">{label}</span>
    </div>
  );
}

/* ── Stat Ring (circular progress) ─────────────── */

function StatRing({ value, max, label, unit, color }: {
  value: number; max: number; label: string; unit?: string; color: string;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-lg">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="44" y="40" textAnchor="middle" className="font-heading text-xl" fill="white"
          style={{ fontSize: '20px', fontFamily: 'Bebas Neue' }}>
          {value}{unit}
        </text>
        <text x="44" y="56" textAnchor="middle" fill="rgba(255,255,255,0.5)"
          style={{ fontSize: '9px', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </text>
      </svg>
    </div>
  );
}

/* ── Medal Counter ──────────────────────────────── */

function MedalCounter({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <div className="flex items-center gap-4">
      {[
        { count: gold, emoji: '\u{1F947}', label: 'Gold', glow: 'shadow-[0_0_12px_rgba(255,215,0,0.5)]' },
        { count: silver, emoji: '\u{1F948}', label: 'Silver', glow: 'shadow-[0_0_12px_rgba(192,192,192,0.4)]' },
        { count: bronze, emoji: '\u{1F949}', label: 'Bronze', glow: 'shadow-[0_0_12px_rgba(205,127,50,0.4)]' },
      ].map(m => (
        <div key={m.label} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 bg-white/5 border border-white/10 ${m.count > 0 ? m.glow : ''}`}>
          <span className="text-xl">{m.emoji}</span>
          <span className="font-heading text-2xl text-text-primary">{m.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Form Guide (last 5 results) ─────────────── */

function FormGuide({ placements }: { placements: number[] }) {
  if (!placements.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-condensed uppercase tracking-widest text-text-secondary mr-1">Форма:</span>
      {placements.map((p, i) => {
        const bg = p === 1 ? 'bg-gold text-black' : p === 2 ? 'bg-silver text-black' : p === 3 ? 'bg-bronze text-white' : p <= 5 ? 'bg-brand/80 text-white' : 'bg-white/10 text-text-secondary';
        return (
          <span key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${bg}`}>
            {p}
          </span>
        );
      })}
    </div>
  );
}

/* ── Main Component ─────────────────────────────── */

interface EpicProfileProps {
  player: Player;
  stats: PlayerExtendedStats;
  matches: TournamentResult[];
  ratingHistory: RatingHistoryEntry[];
  backLink?: { href: string; label: string };
}

const FORMAT_LABELS: Record<string, string> = {
  KOTC: 'King of the Court',
  Thai: 'Thai Next',
  IPT: 'IPT',
};

export default function EpicProfile({ player, stats, matches, ratingHistory, backLink }: EpicProfileProps) {
  const mainRating = player.gender === 'M' ? player.ratingM : player.ratingW;
  const mainRank = player.gender === 'M' ? stats.rankM : stats.rankW;

  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const availableFormats = useMemo(() => {
    const seen = new Set<string>();
    matches.forEach(m => { if (m.format) seen.add(m.format); });
    return [...seen];
  }, [matches]);

  const availableLevels = useMemo(() => {
    const order = ['hard', 'advanced', 'medium', 'light'];
    const seen = new Set<string>();
    matches.forEach(m => { if (m.level) seen.add(m.level.toLowerCase()); });
    return order.filter(l => seen.has(l));
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      const fmtOk = filterFormat === 'all' || (m.format ?? '') === filterFormat;
      const lvlNorm = m.level ? m.level.toLowerCase() : '';
      const lvlOk = filterLevel === 'all' || lvlNorm === filterLevel;
      return fmtOk && lvlOk;
    });
  }, [matches, filterFormat, filterLevel]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {backLink && (
        <Link href={backLink.href}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-brand transition-colors text-sm font-condensed">
          {backLink.label}
        </Link>
      )}

      {/* ═══ HERO CARD ═══ */}
      <section className="relative overflow-hidden rounded-3xl border border-brand/30"
        style={{
          background: 'radial-gradient(ellipse 120% 80% at 20% 30%, rgba(0,209,255,0.12), transparent 60%), radial-gradient(ellipse 100% 60% at 80% 70%, rgba(255,90,0,0.15), transparent 50%), var(--bg-panel)',
        }}>
        {/* Decorative dots */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        <div className="relative p-6 md:p-10">
          {/* Top row: name + rank */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                {player.photoUrl ? (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg shrink-0">
                    <PlayerPhoto
                      photoUrl={player.photoUrl}
                      alt={player.name}
                      width={80}
                      height={80}
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand to-[#FFD700] flex items-center justify-center text-3xl font-heading text-white shadow-lg shrink-0">
                    {player.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h1 className="font-heading text-4xl md:text-5xl text-text-primary uppercase tracking-wider">
                    {player.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${player.gender === 'M' ? 'bg-[#00D1FF]/20 text-[#00D1FF]' : 'bg-[#FF69B4]/20 text-[#FF69B4]'}`}>
                      {player.gender === 'M' ? 'M' : 'W'}
                    </span>
                    {player.status === 'temporary' && (
                      <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-text-secondary">Temp</span>
                    )}
                    {stats.currentStreak.count >= 3 && (
                      <span className="px-2 py-0.5 rounded text-xs bg-brand/20 text-brand font-bold animate-pulse">
                        TOP-3 x{stats.currentStreak.count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main rank badge */}
            {mainRank && (
              <div className="flex flex-col items-center px-6 py-4 rounded-2xl border border-brand/40 bg-brand/10"
                style={{ boxShadow: '0 0 30px rgba(255,90,0,0.2)' }}>
                <span className="text-xs font-condensed uppercase tracking-widest text-brand/80">
                  {player.gender === 'M' ? 'M' : 'W'} Ranking
                </span>
                <span className="font-heading text-5xl text-brand">#{mainRank}</span>
                <span className="text-xs text-text-secondary mt-1">{mainRating} pts</span>
              </div>
            )}
          </div>

          {/* Medals + Form */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
            <MedalCounter gold={stats.gold} silver={stats.silver} bronze={stats.bronze} />
            <FormGuide placements={stats.formLast5} />
          </div>

          {/* Rating ranks row */}
          <div className="mt-6 flex flex-wrap gap-3">
            {rankBadge(stats.rankM, 'M Rating', '#00D1FF')}
            {rankBadge(stats.rankW, 'W Rating', '#FF69B4')}
            {rankBadge(stats.rankMix, 'Mix Rating', '#FFD700')}
          </div>
        </div>
      </section>

      {/* ═══ STAT RINGS ═══ */}
      <section className="glass-panel rounded-2xl p-6 md:p-8 border border-white/10">
        <h2 className="text-xs font-condensed uppercase tracking-widest text-text-secondary mb-6">
          Ключевые показатели
        </h2>
        <div className="flex flex-wrap justify-center gap-6 md:gap-10">
          <StatRing value={stats.totalTournaments} max={Math.max(stats.totalTournaments, 20)} label="Турниров" color="#00D1FF" />
          <StatRing value={stats.topThreeRate} max={100} label="Top-3 %" unit="%" color="#FFD700" />
          <StatRing value={stats.winRate} max={100} label="Win %" unit="%" color="#FF5A00" />
          <StatRing value={stats.avgPlace} max={20} label="Avg Place" color="#6ABF69" />
          <StatRing value={stats.totalRatingPts} max={Math.max(stats.totalRatingPts, 500)} label="Rating Pts" color="#f5a623" />
        </div>
      </section>

      {/* ═══ RATINGS GRID ═══ */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'M Rating', val: player.ratingM, t: player.tournamentsM, c: '#00D1FF', active: player.gender === 'M' },
          { label: 'W Rating', val: player.ratingW, t: player.tournamentsW, c: '#FF69B4', active: player.gender === 'W' },
          { label: 'Mix Rating', val: player.ratingMix, t: player.tournamentsMix, c: '#FFD700', active: false },
        ].map(r => (
          <div key={r.label} className={`glass-panel rounded-2xl p-5 border transition-all ${r.active ? 'border-brand/50 neon-fire' : 'border-white/10 hover:border-white/20'}`}>
            <div className="text-xs font-condensed uppercase tracking-widest text-text-secondary">{r.label}</div>
            <div className="font-heading text-4xl mt-2" style={{ color: r.c }}>{r.val}</div>
            <div className="text-xs text-text-secondary mt-1">{r.t} {r.t === 1 ? 'турнир' : 'турниров'}</div>
          </div>
        ))}
      </section>

      {/* ═══ DETAILED STATS ═══ */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '\u{1F3C6}', label: 'Побед', val: stats.gold },
          { icon: '\u{1F4AA}', label: 'Лучшее место', val: stats.bestPlace || '-' },
          { icon: '\u{1F525}', label: 'Сыграно партий', val: stats.totalWins },
          { icon: '\u{26A1}', label: 'Средний рейтинг', val: stats.avgRatingPts },
          { icon: '\u{1F3D0}', label: 'Очков (balls)', val: stats.totalBalls },
          { icon: '\u{1F4CA}', label: 'Avg balls', val: stats.avgBalls },
          { icon: '\u{1F3AF}', label: 'Avg place', val: stats.avgPlace },
          { icon: '\u{1F31F}', label: 'Rating pts', val: stats.totalRatingPts },
        ].map(s => (
          <div key={s.label} className="glass-panel rounded-xl p-4 border border-white/10 hover:border-brand/30 transition-colors">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="font-heading text-2xl text-text-primary">{s.val}</div>
            <div className="text-xs font-condensed uppercase tracking-wider text-text-secondary">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ═══ BEST TOURNAMENT ═══ */}
      {stats.bestTournament && (() => {
        const bt = stats.bestTournament!;
        const inner = (
          <div className="flex items-center gap-3">
            <span className="text-3xl">{'\u{1F31F}'}</span>
            <div>
              <div className="text-xs font-condensed uppercase tracking-widest text-gold">Best Performance</div>
              <div className="font-heading text-2xl text-text-primary mt-1">{bt.name}</div>
              <div className="text-sm text-text-secondary mt-1">
                {formatDate(bt.date)} {' \u{2022} '} Место: {placeEmoji(bt.place)} {' \u{2022} '} +{bt.pts} pts
              </div>
            </div>
          </div>
        );
        return bt.id ? (
          <Link href={`/calendar/${bt.id}`}>
            <section className="glass-panel rounded-2xl p-6 border border-gold/30 neon-fire hover:scale-[1.01] transition-transform cursor-pointer">
              {inner}
            </section>
          </Link>
        ) : (
          <section className="glass-panel rounded-2xl p-6 border border-gold/30 neon-fire">
            {inner}
          </section>
        );
      })()}

      {/* ═══ PRIZES BY LEVEL ═══ */}
      {(() => {
        const lp = stats.levelPrizes;
        const hasAny = lp.hard.total + lp.advanced.total + lp.medium.total + lp.light.total > 0;
        if (!hasAny) return null;
        const levels: Array<{ key: keyof typeof lp; label: string; color: string }> = [
          { key: 'hard',     label: 'HARD',     color: '#FF5A00' },
          { key: 'advanced', label: 'ADVANCED',  color: '#00D1FF' },
          { key: 'medium',   label: 'MEDIUM',   color: '#FFD700' },
          { key: 'light',    label: 'LIGHT',    color: '#6ABF69' },
        ];
        return (
          <section>
            <h2 className="font-heading text-3xl text-text-primary uppercase mb-5 tracking-wide flex items-center gap-3">
              <span className="w-2 h-8 rounded-full bg-brand" />
              Призы по уровням
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {levels.filter(l => lp[l.key].total > 0).map(l => {
                const b = lp[l.key];
                return (
                  <div key={l.key} className="glass-panel rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                    <div className="text-xs font-condensed uppercase tracking-widest mb-3" style={{ color: l.color }}>
                      {l.label}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {b.gold   > 0 && <span className="flex items-center gap-1 text-sm font-bold"><span className="text-base">🥇</span>{b.gold}</span>}
                      {b.silver > 0 && <span className="flex items-center gap-1 text-sm font-bold"><span className="text-base">🥈</span>{b.silver}</span>}
                      {b.bronze > 0 && <span className="flex items-center gap-1 text-sm font-bold"><span className="text-base">🥉</span>{b.bronze}</span>}
                    </div>
                    <div className="text-xs text-text-secondary">{b.total} {b.total === 1 ? 'турнир' : 'турниров'}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ═══ FORMAT RATINGS (KOTC / Double Trouble / Thai) ═══ */}
      {(() => {
        const fs = stats.formatStats;
        const fmts: Array<{ key: keyof typeof fs; label: string; emoji: string; color: string }> = [
          { key: 'kotc',   label: 'King of the Court', emoji: '👑', color: '#00D1FF' },
          { key: 'double', label: 'Double Trouble',    emoji: '⚡', color: '#FF5A00' },
          { key: 'thai',   label: 'Thai Next',         emoji: '🏖️', color: '#FFD700' },
        ];
        const active = fmts.filter(f => fs[f.key].total > 0);
        if (active.length === 0) return null;
        return (
          <section>
            <h2 className="font-heading text-3xl text-text-primary uppercase mb-5 tracking-wide flex items-center gap-3">
              <span className="w-2 h-8 rounded-full bg-[#00D1FF]" />
              Рейтинг по форматам
            </h2>
            <div className={`grid gap-4 ${active.length === 1 ? 'grid-cols-1 max-w-xs' : active.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
              {active.map(f => {
                const b = fs[f.key];
                return (
                  <div key={f.key} className="glass-panel rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all"
                    style={{ borderColor: `${f.color}30` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{f.emoji}</span>
                      <span className="text-xs font-condensed uppercase tracking-widest text-text-secondary">{f.label}</span>
                    </div>
                    <div className="font-heading text-4xl" style={{ color: f.color }}>{b.rating}</div>
                    <div className="text-xs text-text-secondary mt-1">очков рейтинга</div>
                    <div className="flex items-center gap-3 mt-3 text-sm text-text-secondary">
                      <span>{b.total} {b.total === 1 ? 'турнир' : 'турниров'}</span>
                      {b.gold > 0 && <span className="text-[#FFD700] font-bold">🥇 ×{b.gold}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ═══ TOURNAMENT HISTORY (with placements) ═══ */}
      <section>
        <h2 className="font-heading text-3xl text-text-primary uppercase mb-4 tracking-wide flex items-center gap-3">
          <span className="w-2 h-8 rounded-full bg-brand" />
          История турниров
        </h2>

        {/* Filters */}
        {(availableFormats.length > 1 || availableLevels.length > 1) && (
          <div className="flex flex-wrap gap-2 mb-5">
            {availableFormats.length > 1 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs font-condensed uppercase text-text-secondary mr-1">Формат:</span>
                {['all', ...availableFormats].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterFormat(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filterFormat === f ? 'bg-brand text-white border-brand' : 'border-white/20 text-text-secondary hover:border-white/40'}`}
                  >
                    {f === 'all' ? 'Все' : (FORMAT_LABELS[f] ?? f)}
                  </button>
                ))}
              </div>
            )}
            {availableLevels.length > 1 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs font-condensed uppercase text-text-secondary mr-1">Уровень:</span>
                {['all', ...availableLevels].map(l => {
                  const levelColorMap: Record<string, string> = { hard: '#FF5A00', advanced: '#00D1FF', medium: '#FFD700', light: '#6ABF69' };
                  const active = filterLevel === l;
                  return (
                    <button
                      key={l}
                      onClick={() => setFilterLevel(l)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border transition-colors ${active ? 'text-black border-transparent' : 'border-white/20 text-text-secondary hover:border-white/40'}`}
                      style={active && l !== 'all' ? { background: levelColorMap[l], borderColor: levelColorMap[l] } : active ? { background: '#FF5A00', borderColor: '#FF5A00', color: '#fff' } : {}}
                    >
                      {l === 'all' ? 'Все' : l.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {filteredMatches.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
            <div className="text-4xl mb-3">{'\u{1F3D0}'}</div>
            <div className="text-text-secondary font-body">Нет турниров по выбранным фильтрам</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMatches.map((r, i) => {
              const place = Number(r.place);
              const levelNorm: Record<string, string> = {
                advance: 'ADVANCED', advanced: 'ADVANCED',
                hard: 'HARD', medium: 'MEDIUM', light: 'LIGHT',
              };
              const levelLabel = r.level ? (levelNorm[r.level.toLowerCase()] ?? r.level.toUpperCase()) : null;
              const levelColor: Record<string, string> = {
                HARD: '#FF5A00', ADVANCED: '#00D1FF', MEDIUM: '#FFD700', LIGHT: '#6ABF69',
              };
              const cardContent = (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${place <= 3 ? 'bg-white/10' : 'bg-white/5'}`}>
                        {placeEmoji(place)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-heading text-lg text-text-primary truncate">
                          {r.tournamentName}
                        </div>
                        <div className="text-xs text-text-secondary font-condensed flex items-center gap-1.5 flex-wrap">
                          {r.tournamentDate ? formatDate(String(r.tournamentDate)) : ''}
                          {' \u{2022} '}
                          {r.ratingType ?? ''}
                          {levelLabel && (
                            <>
                              {' \u{2022} '}
                              <span className="font-bold uppercase" style={{ color: levelColor[levelLabel] ?? '#aaa' }}>
                                {levelLabel}
                              </span>
                            </>
                          )}
                        </div>
                        {r.thaiSpectatorBoardUrl ? (
                          <span
                            className="mt-1 inline-flex text-xs font-medium text-sky-300/95 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                            onClick={e => e.stopPropagation()}
                          >
                            <Link href={r.thaiSpectatorBoardUrl}>Табло турнира (Thai)</Link>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.ratingPts > 0 && (
                        <span className="text-brand font-bold text-sm">+{r.ratingPts}</span>
                      )}
                      <div className="flex flex-col items-end">
                        <span className="font-heading text-xl text-text-primary">#{place}</span>
                        {typeof r.wins === 'number' && r.wins > 0 && (
                          <span className="text-xs text-text-secondary">{r.wins}W</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Stats bar */}
                  <div className="mt-3 flex gap-4 text-xs text-text-secondary">
                    {r.gamePts > 0 && <span>Game: <span className="text-text-primary">{r.gamePts}</span></span>}
                    {typeof r.balls === 'number' && r.balls > 0 && <span>Balls: <span className="text-text-primary">{r.balls}</span></span>}
                    {typeof r.diff === 'number' && r.diff !== 0 && (
                      <span>Diff: <span className={r.diff > 0 ? 'text-brand' : 'text-text-secondary'}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span></span>
                    )}
                  </div>
                </>
              );
              return r.tournamentId ? (
                <Link key={`${r.tournamentId ?? i}`} href={`/calendar/${r.tournamentId}`}>
                  <article className={`glass-panel rounded-2xl p-4 md:p-5 border transition-all hover:scale-[1.01] cursor-pointer ${placeBorderClass(place)}`}>
                    {cardContent}
                  </article>
                </Link>
              ) : (
                <article key={`${r.tournamentId ?? i}-no`}
                  className={`glass-panel rounded-2xl p-4 md:p-5 border transition-all hover:scale-[1.01] ${placeBorderClass(place)}`}>
                  {cardContent}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ RATING HISTORY ═══ */}
      {ratingHistory.length > 0 && (
        <section>
          <h2 className="font-heading text-3xl text-text-primary uppercase mb-5 tracking-wide flex items-center gap-3">
            <span className="w-2 h-8 rounded-full bg-[#00D1FF]" />
            История рейтинга
          </h2>
          <div className="space-y-2">
            {ratingHistory.map(e => {
              const positive = e.pointsChanged > 0;
              return (
                <div key={e.id} className="glass-panel rounded-xl p-4 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                  <div className="min-w-0">
                    <div className="font-body text-sm text-text-primary truncate">{e.tournamentName || 'Tournament'}</div>
                    <div className="text-xs text-text-secondary">
                      {e.formatCode} {' \u{2022} '} {e.createdAt ? String(e.createdAt).slice(0, 10) : ''}
                      {e.place != null && <> {' \u{2022} '} #{e.place}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-bold text-sm ${positive ? 'text-brand' : e.pointsChanged < 0 ? 'text-text-secondary' : 'text-text-secondary'}`}>
                      {positive ? '+' : ''}{e.pointsChanged}
                    </span>
                    <span className="text-xs text-text-secondary bg-white/5 rounded-lg px-2 py-1">
                      {e.newTotalRating}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
