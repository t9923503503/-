'use strict';

// ════════════════════════════════════════════════════════════
// CORE-RENDER: Math, scoring, rankings, tournament archive
// Split from core.js (A3.2)
// ════════════════════════════════════════════════════════════

// ── Partner rotation ──────────────────────────────────────
function partnerW(mi, ri){ return fixedPairs ? mi : (mi + ri) % ppc; }
function partnerM(wi, ri){ return fixedPairs ? wi : ((wi - ri) % ppc + ppc) % ppc; }

function manRounds(ci, mi) {
  return Array.from({length:ppc}, (_,ri) => scores[ci]?.[mi]?.[ri] ?? null);
}
function womanRounds(ci, wi) {
  return Array.from({length:ppc}, (_,ri) => scores[ci]?.[partnerM(wi,ri)]?.[ri] ?? null);
}

// ── ThaiVolley32 R1 helpers ───────────────────────────────
function thaiDiffToPts(diff){
  if (diff >= 7) return 3;
  if (diff >= 3) return 2;
  if (diff >= 1) return 1;
  return 0;
}

function iptMatchupsR1(ri){
  if (ppc !== 4) return [];
  if (ri === 0) return [[0,1],[2,3]];
  if (ri === 1) return [[0,2],[1,3]];
  if (ri === 2) return [[0,3],[1,2]];
  return [[0,3],[1,2]];
}

function iptOppIdxR1(mi, ri){
  const pairs = iptMatchupsR1(ri);
  for (const [a, b] of pairs) {
    if (a === mi) return b;
    if (b === mi) return a;
  }
  return null;
}

function thaiCalcK(diffSum){
  const denom = 60 - diffSum;
  if (Math.abs(denom) < 1e-9) return 999.99;
  return (60 + diffSum) / denom;
}

// ── Single court ranking ──────────────────────────────────
function getRanked(ci, gender) {
  const arr = [];
  for (let i = 0; i < ppc; i++) {
    let wins = 0, diff = 0, pts = 0, balls = 0, bestRound = 0, rPlayed = 0;
    for (let ri = 0; ri < ppc; ri++) {
      let own = null, opp = null;
      if (gender === 'M') {
        own = scores[ci]?.[i]?.[ri] ?? null;
        const oppMi = iptOppIdxR1(i, ri);
        opp = oppMi == null ? null : (scores[ci]?.[oppMi]?.[ri] ?? null);
      } else {
        const manIdx = partnerM(i, ri);
        own = scores[ci]?.[manIdx]?.[ri] ?? null;
        const oppMan = iptOppIdxR1(manIdx, ri);
        opp = oppMan == null ? null : (scores[ci]?.[oppMan]?.[ri] ?? null);
      }
      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own; diff += d; pts += thaiDiffToPts(d);
      if (d > 0) wins++; rPlayed++;
    }
    const K = thaiCalcK(diff);
    arr.push({ idx:i, pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort((a,b) => {
    if (b.wins  !== a.wins)  return b.wins  - a.wins;
    if (b.diff  !== a.diff)  return b.diff  - a.diff;
    if (b.pts   !== a.pts)   return b.pts   - a.pts;
    if (b.K     !== a.K)     return b.K     - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.idx - b.idx;
  });

  const EPS = 1e-9;
  arr.forEach((x, i, s) => {
    const prev = s[i - 1];
    const tied = !!prev &&
      prev.wins === x.wins && prev.diff === x.diff && prev.pts === x.pts &&
      Math.abs(prev.K - x.K) < EPS && prev.balls === x.balls;
    x.place = tied ? prev.place : i + 1;
    x.tied = tied;
  });
  return arr;
}

// ── Global ranking across all courts ──────────────────────
function getAllRanked() {
  const out = { M:[], W:[] };
  for (const gender of ['M','W']) {
    const all = [];
    for (let ci = 0; ci < nc; ci++) {
      const ct = ALL_COURTS[ci], meta = COURT_META[ci];
      getRanked(ci, gender).forEach(r => {
        all.push({
          pts: r.pts, diff: r.diff, wins: r.wins, K: r.K,
          balls: r.balls, bestRound: r.bestRound, rPlayed: r.rPlayed,
          courtPlace: r.place, tied: r.tied,
          name: gender==='M' ? ct.men[r.idx] : ct.women[r.idx],
          courtName: meta.name, courtColor: meta.color,
          gender, genderIcon: gender==='M' ? '🏋️' : '👩',
          originalCourtIndex: ci * ppc + r.idx,
        });
      });
    }
    all.sort((a,b) => {
      if (b.wins  !== a.wins)  return b.wins  - a.wins;
      if (b.diff  !== a.diff)  return b.diff  - a.diff;
      if (b.pts   !== a.pts)   return b.pts   - a.pts;
      if (b.K     !== a.K)     return b.K     - a.K;
      if (b.balls !== a.balls) return b.balls - a.balls;
      return a.originalCourtIndex - b.originalCourtIndex;
    });
    all.forEach((p,i,arr) => {
      const prev = arr[i - 1];
      const EPS = 1e-9;
      const tied = !!prev &&
        prev.wins === p.wins && prev.diff === p.diff && prev.pts === p.pts &&
        Math.abs(prev.K - p.K) < EPS && prev.balls === p.balls;
      p.globalRank = tied ? prev.globalRank : i + 1;
      p.globalTied = tied;
    });
    out[gender] = all;
  }
  return out;
}

// ── R2 seeding ────────────────────────────────────────────
function seedR2FromR1(gender){
  if (ppc !== 4 || nc !== 4) {
    const ranked = getAllRanked();
    const keys = activeDivKeys();
    const result = {};
    keys.forEach((key, i) => {
      const start = i * ppc, end = start + ppc;
      result[key] = ranked[gender].slice(start, end);
    });
    return result;
  }

  const courts = [0,1,2,3];
  const rankedByCourt = courts.map(ci => getRanked(ci, gender));

  const toPlayer = (ci, r) => {
    const ct = ALL_COURTS[ci], meta = COURT_META[ci];
    return {
      idx: r.idx,
      name: gender === 'M' ? ct.men[r.idx] : ct.women[r.idx],
      pts: r.pts, diff: r.diff, wins: r.wins, K: r.K,
      balls: r.balls, bestRound: r.bestRound, rPlayed: r.rPlayed,
      courtPlace: r.place, tied: r.tied, gender,
      genderIcon: gender === 'M' ? '🏋️' : '👩',
      courtName: meta.name, courtColor: meta.color,
      originalCourtIndex: ci * ppc + r.idx,
    };
  };

  const secondCandidates = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][1]));
  const thirdCandidates  = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][2]));
  const fourthCandidates = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][3]));

  const keySort = (a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const kA = Math.round(a.K * 1e6), kB = Math.round(b.K * 1e6);
    if (kB !== kA) return kB - kA;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.originalCourtIndex - b.originalCourtIndex;
  };

  const bestSecond = [...secondCandidates].sort(keySort)[0];
  const remainingSeconds = secondCandidates.filter(p => p.originalCourtIndex !== bestSecond.originalCourtIndex);
  const sortedThird = [...thirdCandidates].sort(keySort);
  const bestTwoThird = sortedThird.slice(0,2);
  const remainingThird = sortedThird[2];

  const hard = [
    toPlayer(0, rankedByCourt[0][0]),
    toPlayer(1, rankedByCourt[1][0]),
    toPlayer(2, rankedByCourt[2][0]),
    bestSecond,
  ];
  const advance = toPlayer(3, rankedByCourt[3][0]) && [
    ...rankedByCourt[3].slice(0,4).map((r) => toPlayer(3, r)),
  ];
  const medium = [
    ...remainingSeconds.sort((a,b)=>a.originalCourtIndex-b.originalCourtIndex),
    ...bestTwoThird,
  ];
  const lite = [
    remainingThird,
    ...fourthCandidates.sort((a,b)=>a.originalCourtIndex-b.originalCourtIndex),
  ];

  return { hard, advance, medium, lite };
}

function getSvod() {
  const result = { hard:{M:[],W:[]}, advance:{M:[],W:[]}, medium:{M:[],W:[]}, lite:{M:[],W:[]} };
  const seededM = seedR2FromR1('M'), seededW = seedR2FromR1('W');
  DIV_KEYS.forEach(k => {
    if (!activeDivKeys().includes(k)) return;
    result[k].M = seededM[k] || [];
    result[k].W = seededW[k] || [];
  });
  return result;
}

// ── Division court helpers ────────────────────────────────
function divPartnerW(mi, ri, Nd){ return (mi + ri) % Nd; }
function divPartnerM(wi, ri, Nd){ return ((wi - ri) % Nd + Nd) % Nd; }

function divManRounds(key, mi) {
  const Nd = divRoster[key].men.length;
  return Array.from({length:Nd}, (_,ri) => (divScores[key][mi]??[])[ri] ?? null);
}
function divWomanRounds(key, wi) {
  const Nd = divRoster[key].men.length;
  return Array.from({length:Nd}, (_,ri) => {
    const mi = divPartnerM(wi, ri, Nd);
    return (divScores[key][mi]??[])[ri] ?? null;
  });
}

function divGetRanked(key, gender) {
  const names = gender==='M' ? divRoster[key].men : divRoster[key].women;
  const Nd = names.length;
  if (!Nd) return [];
  const arr = [];
  for (let i = 0; i < Nd; i++) {
    let wins = 0, diff = 0, pts = 0, balls = 0, bestRound = 0, rPlayed = 0;
    for (let ri = 0; ri < Nd; ri++) {
      let own = null, opp = null;
      if (gender === 'M') {
        own = (divScores[key]?.[i] ?? [])[ri] ?? null;
        const oppMi = iptOppIdxR1(i, ri);
        opp = oppMi == null ? null : ((divScores[key]?.[oppMi] ?? [])[ri] ?? null);
      } else {
        const manIdx = divPartnerM(i, ri, Nd);
        own = (divScores[key]?.[manIdx] ?? [])[ri] ?? null;
        const oppMan = iptOppIdxR1(manIdx, ri);
        opp = oppMan == null ? null : ((divScores[key]?.[oppMan] ?? [])[ri] ?? null);
      }
      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own; diff += d; pts += thaiDiffToPts(d);
      if (d > 0) wins++; rPlayed++;
    }
    const K = thaiCalcK(diff);
    arr.push({ idx:i, name: names[i], pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort((a,b) => {
    if (b.wins  !== a.wins)  return b.wins  - a.wins;
    if (b.diff  !== a.diff)  return b.diff  - a.diff;
    if (b.pts   !== a.pts)   return b.pts   - a.pts;
    if (b.K     !== a.K)     return b.K     - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.idx - b.idx;
  });
  const EPS = 1e-9;
  arr.forEach((x, i, s) => {
    const prev = s[i - 1];
    const tied = !!prev &&
      prev.wins === x.wins && prev.diff === x.diff && prev.pts === x.pts &&
      Math.abs(prev.K - x.K) < EPS && prev.balls === x.balls;
    x.place = tied ? prev.place : i + 1;
    x.tied = tied;
  });
  return arr;
}

// ── Combined stats helper ─────────────────────────────────
function getAllRoundsForPlayer(p) {
  const allRounds = [];
  for (let ci = 0; ci < nc; ci++) {
    const arr = p.gender === 'M' ? ALL_COURTS[ci].men : ALL_COURTS[ci].women;
    const idx = arr.findIndex((n, i) => n === p.name &&
      (p.gender === 'M' ? manRounds(ci, i) : womanRounds(ci, i)).some(r => r !== null));
    if (idx >= 0) {
      const rds = (p.gender === 'M' ? manRounds(ci, idx) : womanRounds(ci, idx)).filter(r => r !== null);
      allRounds.push(...rds);
      break;
    }
  }
  for (const key of activeDivKeys()) {
    const arr = p.gender === 'M' ? divRoster[key].men : divRoster[key].women;
    const idx = arr.indexOf(p.name);
    if (idx >= 0) {
      const rds = (p.gender === 'M' ? divManRounds(key, idx) : divWomanRounds(key, idx)).filter(r => r !== null);
      allRounds.push(...rds);
      break;
    }
  }
  return allRounds;
}

// ── Finish & archive tournament ───────────────────────────
function validateThai32BeforeFinish() {
  const highlight = (el) => {
    if (!el) return;
    el.style.outline = '2px solid #e94560';
    el.style.outlineOffset = '-2px';
    el.style.borderRadius = '8px';
  };
  const invalid = [];
  for (let ci = 0; ci < nc; ci++) {
    for (let ri = 0; ri < ppc; ri++) {
      for (let mi = 0; mi < ppc; mi++) {
        const v = scores[ci]?.[mi]?.[ri];
        if (v === null || v === undefined) invalid.push({ kind:'r1', ci, mi, ri });
      }
    }
  }
  activeDivKeys().forEach(key => {
    const hasAny = (divScores[key] || []).some((row, mi) =>
      (row || []).some((v, ri) => mi < ppc && ri < ppc && v !== null && v !== undefined));
    if (!hasAny) return;
    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const v = (divScores[key]?.[mi] ?? [])[ri];
        if (v === null || v === undefined) invalid.push({ kind:'r2', key, mi, ri });
      }
    }
  });
  if (!invalid.length) return true;
  invalid.slice(0, 64).forEach(it => {
    if (it.kind === 'r1') highlight(document.getElementById(`card-${it.ci}-${it.mi}-${it.ri}`));
    else highlight(document.getElementById(`dcard-${it.key}-${it.mi}-${it.ri}`));
  });
  showToast('❌ Нельзя завершить: есть неполные/некорректные данные (подсвечены карточки).', 'error');
  return false;
}

async function finishTournament() {
  const name = tournamentMeta.name.trim() || 'Без названия';
  const date = tournamentMeta.date || new Date().toISOString().split('T')[0];
  const tempCount = (loadPlayerDB() || []).filter(p => p.status === 'temporary').length;
  const tempWarn  = tempCount > 0
    ? `\n\n⚠️ В базе ${tempCount} временных игрок(а). Перейдите в Ростер → Администрирование, чтобы слить их с реальными профилями.`
    : '';
  if (!validateThai32BeforeFinish()) return;
  const confirmed = await showConfirm(
    `Завершить турнир «${name}»?\n\nРезультаты сохранятся в архиве.\nТекущие очки и ростер останутся.${tempWarn}`
  );
  if (!confirmed) return;

  const stage1 = getAllRanked();
  const metrics = new Map();
  const mkKey = (gender, name) => `${gender}|${name}`;
  const ensure = (gender, name, courtName) => {
    const k = mkKey(gender, name);
    if (!metrics.has(k)) {
      metrics.set(k, {
        name, gender, courtName: courtName || '',
        wins1: 0, diff1: 0, pts1: 0, balls1: 0, matches1: 0,
        wins2: 0, diff2: 0, pts2: 0, balls2: 0, matches2: 0,
      });
    }
    const m = metrics.get(k);
    if (courtName && !m.courtName) m.courtName = courtName;
    return m;
  };
  [...stage1.M, ...stage1.W].forEach(p => {
    const m = ensure(p.gender, p.name, p.courtName);
    m.wins1 = p.wins; m.diff1 = p.diff; m.pts1 = p.pts; m.balls1 = p.balls; m.matches1 = p.rPlayed;
  });
  activeDivKeys().forEach(key => {
    const men = divGetRanked(key, 'M'), women = divGetRanked(key, 'W');
    men.forEach(p => { const m = ensure('M', p.name); m.wins2 = p.wins; m.diff2 = p.diff; m.pts2 = p.pts; m.balls2 = p.balls; m.matches2 = p.rPlayed; });
    women.forEach(p => { const m = ensure('W', p.name); m.wins2 = p.wins; m.diff2 = p.diff; m.pts2 = p.pts; m.balls2 = p.balls; m.matches2 = p.rPlayed; });
  });

  const players = Array.from(metrics.values()).map(m => {
    const wins = m.wins1 + m.wins2, diff = m.diff1 + m.diff2, pts = m.pts1 + m.pts2;
    const balls = m.balls1 + m.balls2, matches = m.matches1 + m.matches2;
    const K = thaiCalcK(diff);
    return { name: m.name, gender: m.gender, courtName: m.courtName, totalPts: pts, wins, diff, pts, balls, K, matchesTotal: matches };
  }).sort((a,b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
    if (b.K !== a.K) return b.K - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.name.localeCompare(b.name, 'ru');
  });

  const totalScore = players.reduce((s,p)=>s+p.totalPts,0);
  const rPlayed = players.length ? (players.reduce((s,p)=>s+(p.matchesTotal||0),0) / players.length) : 0;

  let bestRound = null;
  for (let ci = 0; ci < nc; ci++) {
    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const sc = scores[ci]?.[mi]?.[ri];
        if (sc != null && (!bestRound || sc > bestRound.score))
          bestRound = { name: ALL_COURTS[ci].men[mi], gender: 'M', score: sc, round: ri };
      }
    }
    for (let wi = 0; wi < ppc; wi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const mi = partnerM(wi, ri);
        const sc = scores[ci]?.[mi]?.[ri];
        if (sc != null && (!bestRound || sc > bestRound.score))
          bestRound = { name: ALL_COURTS[ci].women[wi], gender: 'W', score: sc, round: ri };
      }
    }
  }

  const pairMap = {};
  for (let ci = 0; ci < nc; ci++) {
    const ct = ALL_COURTS[ci];
    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const sc = scores[ci]?.[mi]?.[ri];
        if (!sc) continue;
        const man = ct.men[mi], woman = ct.women[partnerW(mi, ri)];
        if (!man || !woman) continue;
        const k = `${man}\x00${woman}`;
        pairMap[k] = (pairMap[k] || 0) + sc;
      }
    }
  }
  DIV_KEYS.forEach(dkey => {
    const men = divRoster[dkey].men, women = divRoster[dkey].women, Nd = men.length;
    if (!Nd) return;
    for (let mi = 0; mi < Nd; mi++) {
      for (let ri = 0; ri < Nd; ri++) {
        const sc = (divScores[dkey][mi] ?? [])[ri] ?? null;
        if (!sc) continue;
        const man = men[mi], woman = women[divPartnerW(mi, ri, Nd)];
        if (!man || !woman) continue;
        const k = `${man}\x00${woman}`;
        pairMap[k] = (pairMap[k] || 0) + sc;
      }
    }
  });
  let bestPair = null;
  for (const [key, pts] of Object.entries(pairMap)) {
    if (!bestPair || pts > bestPair.totalPts) {
      const [man, woman] = key.split('\x00');
      bestPair = { man, woman, totalPts: pts };
    }
  }

  const courtStats = Array.from({length: nc}, (_, ci) => {
    const flat = scores[ci].flat().filter(x => x !== null);
    const total = flat.reduce((s, x) => s + x, 0);
    return {
      name: (COURT_META[ci] || {}).name || `Корт ${ci + 1}`,
      totalPts: total,
      avgPts: flat.length ? (total / flat.length).toFixed(1) : '0',
    };
  });

  const snapshot = {
    id: Date.now(), name, date, ppc, nc, players, totalScore, rPlayed,
    savedAt: new Date().toISOString(),
    mvpName: players[0]?.name || '',
    avgScore: players.length && rPlayed ? (totalScore / (players.length * rPlayed)).toFixed(1) : '0',
    bestRound, bestPair, courtStats,
  };

  const history = loadHistory();
  history.unshift(snapshot);
  saveHistory(history);
  showToast('🏆 Турнир сохранён в архиве!');
  recalcAllPlayerStats(true);
  syncPlayersFromTournament(players, date);
  if (sbEnsureClient()) sbPublishTournament(snapshot).catch(e => console.warn('sbPublishTournament:', e));
  if (gshIsConnected()) gshExportTournament(snapshot, null).catch(()=>{});
  const statsScreen = document.getElementById('screen-stats');
  if (statsScreen && statsScreen.classList.contains('active')) statsScreen.innerHTML = renderStats();
}

async function resetTournament() {
  if (!await showConfirm('Сбросить ВСЕ результаты?\n\nРостер сохранится, все очки обнулятся.')) return;
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  ['kotc3_scores','kotc3_divscores','kotc3_divroster'].forEach(k=>localStorage.removeItem(k));
  for (let i = 0; i < 8; i++) timerReset(i);
  buildAll();
  switchTab('roster');
  showToast('🗑 Турнир сброшен');
}
