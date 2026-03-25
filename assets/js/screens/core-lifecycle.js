'use strict';

// ════════════════════════════════════════════════════════════
// CORE-LIFECYCLE: Persistence, bootstrap, rebuild
// Split from core.js (A3.2)
// ════════════════════════════════════════════════════════════

// ── Persistence ───────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('kotc_version',     '1.1');
    localStorage.setItem('kotc3_cfg',        JSON.stringify({ ppc, nc, fixedPairs }));
    localStorage.setItem('kotc3_scores',     JSON.stringify(scores));
    localStorage.setItem('kotc3_roster',     JSON.stringify(ALL_COURTS.map(c=>({men:[...c.men],women:[...c.women]}))));
    localStorage.setItem('kotc3_divscores',  JSON.stringify(divScores));
    localStorage.setItem('kotc3_divroster',  JSON.stringify(divRoster));
    localStorage.setItem('kotc3_meta',       JSON.stringify(tournamentMeta));
    localStorage.setItem('kotc3_eventlog',   JSON.stringify(tournamentHistory));
  } catch(e){ console.error('[saveState] Failed to persist state:', e); }
  sbPush();
}

function loadState() {
  try {
    const ver = localStorage.getItem('kotc_version');
    const verNum = ver ? ver.split('.').map(Number).reduce((a, v, i) => a + v * Math.pow(100, 2 - i), 0) : 0;
    if (verNum < 101) {
      ['kotc3_scores','kotc3_divscores','kotc3_divroster'].forEach(k=>localStorage.removeItem(k));
      localStorage.setItem('kotc_version','1.1');
    }
    const cfg = localStorage.getItem('kotc3_cfg');
    if (cfg) {
      // ThaiVolley32 math requires ppc=4.
      // Allow nc to vary so roster "Кортов" controls actually work.
      let parsed = null;
      try { parsed = JSON.parse(cfg); } catch (_) {}
      ppc = 4;
      if (parsed && Number.isFinite(parsed.nc)) {
        nc = Math.max(1, Math.min(4, Number(parsed.nc)));
      }
      _ppc = ppc;
      _nc = nc;
      fixedPairs = false;
    }
    const r = localStorage.getItem('kotc3_roster');
    if (r) {
      const pr = JSON.parse(r);
      if (Array.isArray(pr)) pr.forEach((ct,ci) => {
        if (ci < 4) {
          if (Array.isArray(ct.men))   ALL_COURTS[ci].men   = ct.men.slice(0,5);
          if (Array.isArray(ct.women)) ALL_COURTS[ci].women = ct.women.slice(0,5);
        }
      });
    }
    const sc = localStorage.getItem('kotc3_scores');
    if (sc) {
      const ps = JSON.parse(sc);
      if (Array.isArray(ps)) ps.forEach((court,ci) => {
        if (ci >= 4 || !Array.isArray(court)) return;
        court.forEach((row,mi) => {
          if (mi >= 5 || !Array.isArray(row)) return;
          row.forEach((val,ri) => {
            if (ri < ppc && scores[ci]?.[mi]) scores[ci][mi][ri] = (val === null || val === undefined) ? null : Number(val);
          });
        });
      });
    }
    const ds = localStorage.getItem('kotc3_divscores');
    if (ds) { const pd=JSON.parse(ds); if(pd) DIV_KEYS.forEach(k=>{if(pd[k]) divScores[k]=pd[k];}); }
    const dr = localStorage.getItem('kotc3_divroster');
    const mt = localStorage.getItem('kotc3_meta');
    if (mt) { try { tournamentMeta = JSON.parse(mt); } catch(e){} }
    if (dr) { const pd=JSON.parse(dr); if(pd) DIV_KEYS.forEach(k=>{if(pd[k]) divRoster[k]=pd[k];}); }
    const hs = localStorage.getItem('kotc3_eventlog');
    if (hs) { try { tournamentHistory = JSON.parse(hs) || []; } catch(e){ console.error('[loadState] eventlog parse error:', e); } }
  } catch(e){ console.error('[loadState] Failed to restore state:', e); }
}

// ── Division lock check ───────────────────────────────────
function hasRound5Score() {
  const lastRi = ppc - 1;
  for (let ci = 0; ci < nc; ci++) {
    for (let mi = 0; mi < ppc; mi++) {
      if ((scores[ci]?.[mi]?.[lastRi] ?? null) > 0) return true;
    }
  }
  return false;
}

function syncDivLock() {
  const _iptTrnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptTrn   = _iptTrnId ? getTournaments().find(t => t.id === _iptTrnId) : null;
  const _iptGroups = _iptTrn?.ipt?.groups;
  const _rosterIsIPT = typeof _rosterFmt !== 'undefined' && _rosterFmt === 'ipt';

  if (_iptGroups || _rosterIsIPT) {
    const allDone = _iptGroups ? _iptGroups.every(g => g.status === 'finished') : false;
    document.querySelectorAll('.pill-div-btn').forEach(p => {
      p.classList.toggle('pill-div-locked', !allDone);
      p.title = allDone ? '' : 'Завершите все группы чтобы открыть финалы';
    });
    return;
  }

  const unlocked = hasRound5Score();
  const tip = `Добавьте очки в раунде ${ppc} на кортах 1–${nc}, чтобы открыть`;
  document.querySelectorAll('.pill-div-btn').forEach(p => {
    p.classList.toggle('pill-div-locked', !unlocked);
    p.title = unlocked ? '' : tip;
  });
}

// ── Screen construction ───────────────────────────────────
function buildScreens() {
  const sc = document.getElementById('screens');
  sc.innerHTML = '';
  for (let ci = 0; ci < 4; ci++) {
    const s = document.createElement('div');
    s.className = 'screen'; s.id = `screen-${ci}`;
    s.innerHTML = ci < nc ? renderCourt(ci) : '';
    sc.appendChild(s);
  }
  const named = ['home','players','svod','hard','advance','medium','lite','stats','rating','roster','ipt'];
  named.forEach(id => {
    const s = document.createElement('div');
    s.className = 'screen'; s.id = `screen-${id}`;
    sc.appendChild(s);
  });
}

function buildAll() {
  buildNav();
  buildScreens();
  updateDivisions();
  attachListeners();
  attachSwipe();
  if (!document.getElementById('roster-fab')) {
    const fab = document.createElement('button');
    fab.id = 'roster-fab';
    fab.className = 'roster-fab';
    fab.title = 'Ростер';
    fab.textContent = '⚙️';
    fab.addEventListener('click', () => switchTab('roster'));
    document.body.appendChild(fab);
  }
}

// ── Debounced rebuild ─────────────────────────────────────
let _safeRenderRaf = null;
function safeRender() {
  if (_safeRenderRaf) return;
  _safeRenderRaf = requestAnimationFrame(() => {
    _safeRenderRaf = null;
    const _scrollPos = window.scrollY;
    const _focusId   = document.activeElement?.id;
    const _focusSel  = [document.activeElement?.selectionStart, document.activeElement?.selectionEnd];
    buildAll();
    switchTab((activeTabId != null && activeTabId !== 'home') ? activeTabId : 'roster');
    window.scrollTo(0, _scrollPos);
    if (_focusId) {
      const el = document.getElementById(_focusId);
      if (el) { el.focus(); try { el.setSelectionRange(_focusSel[0], _focusSel[1]); } catch(e){} }
    }
  });
}
