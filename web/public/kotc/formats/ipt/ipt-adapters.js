'use strict';

(function initIptAdapters() {
  function parseJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizePlayer(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: String(raw.id != null ? raw.id : ''),
      name: String(raw.name || '').trim(),
      gender: raw.gender === 'W' ? 'W' : 'M',
      level: raw.level || 'medium',
      totalPts: Number(raw.totalPts ?? raw.total_pts ?? 0) || 0,
      tournaments: Number(raw.tournaments ?? raw.tournaments_played ?? 0) || 0,
      wins: Number(raw.wins ?? 0) || 0,
      ratingM: Number(raw.ratingM ?? 0) || 0,
      ratingW: Number(raw.ratingW ?? 0) || 0,
      ratingMix: Number(raw.ratingMix ?? 0) || 0,
    };
  }

  function normalizeJudgeGender(tournament) {
    const format = String(tournament?.format || '').toLowerCase();
    const division = String(tournament?.division || '').toLowerCase();
    if (format.includes('ipt') && format.includes('mixed')) return 'mixed';
    if (division.includes('микс') || division.includes('mix')) return 'mixed';
    if (division.includes('жен') || division === 'w' || division === 'female') return 'female';
    if (division.includes('муж') || division === 'm' || division === 'male') return 'male';
    return 'mixed';
  }

  function normalizeFinishType(value) {
    const raw = String(value || '').toLowerCase();
    return raw.includes('balance') ? 'balance' : 'hard';
  }

  function upsertTournament(nextTournament) {
    const arr = parseJson('kotc3_tournaments', []);
    const next = Array.isArray(arr) ? arr.filter(item => item?.id !== nextTournament.id) : [];
    next.push(nextTournament);
    saveJson('kotc3_tournaments', next);
    return nextTournament;
  }

  function mergePlayersIntoDb(roster) {
    const db = parseJson('kotc3_playerdb', []);
    const map = new Map(Array.isArray(db) ? db.map((item) => [String(item?.id || ''), normalizePlayer(item)]) : []);

    roster.forEach((item) => {
      const id = String(item?.playerId || '');
      if (!id) return;
      const prev = map.get(id) || {};
      map.set(id, normalizePlayer({
        ...prev,
        id,
        name: item.playerName || prev.name || id,
        gender: item.gender === 'W' ? 'W' : 'M',
      }));
    });

    saveJson('kotc3_playerdb', Array.from(map.values()).filter(Boolean));
  }

  function buildStandaloneTournament(tournament, roster) {
    const previous = (parseJson('kotc3_tournaments', []) || []).find((item) => item?.id === tournament?.id) || null;
    const settings = tournament && typeof tournament.settings === 'object' && tournament.settings ? tournament.settings : {};
    const mainRoster = (Array.isArray(roster) ? roster : [])
      .filter((item) => !item?.isWaitlist)
      .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
    const gender = previous?.ipt?.gender || normalizeJudgeGender(tournament);
    const participantCount = mainRoster.length;
    const inferredCourts = Math.max(1, Math.min(4, Math.floor(toFiniteNumber(settings.courts, 0)) || Math.ceil(participantCount / 8) || 1));
    const pointLimit = Math.max(1, Math.floor(toFiniteNumber(settings.pointLimit ?? settings.limit, previous?.ipt?.pointLimit ?? 21)));

    return {
      id: String(tournament?.id || previous?.id || ''),
      name: String(tournament?.name || previous?.name || ''),
      format: String(tournament?.format || previous?.format || 'IPT Mixed'),
      status: String(previous?.status === 'finished' ? previous.status : (tournament?.status || previous?.status || 'open')),
      level: String(tournament?.level || previous?.level || 'medium'),
      gender,
      date: String(tournament?.date || previous?.date || ''),
      venue: String(tournament?.location || previous?.venue || ''),
      capacity: Math.max(participantCount, Math.floor(toFiniteNumber(tournament?.capacity, previous?.capacity ?? participantCount))),
      participants: mainRoster.map((item) => String(item.playerId)),
      ipt: {
        pointLimit,
        finishType: previous?.ipt?.finishType || normalizeFinishType(settings.finishType ?? settings.finish),
        courts: previous?.ipt?.courts || inferredCourts,
        gender,
        currentGroup: Number(previous?.ipt?.currentGroup ?? 0) || 0,
        groups: previous?.ipt?.groups || null,
        serverSyncStatus: previous?.ipt?.serverSyncStatus || 'none',
      },
    };
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(String(data?.error || `Request failed: ${res.status}`));
    }
    return data;
  }

  window.getTournaments = function getTournamentsAdapter() {
    return parseJson('kotc3_tournaments', []);
  };

  window.saveTournaments = function saveTournamentsAdapter(arr) {
    saveJson('kotc3_tournaments', Array.isArray(arr) ? arr : []);
  };

  window.loadPlayerDB = function loadPlayerDBAdapter() {
    const db = parseJson('kotc3_playerdb', []);
    return Array.isArray(db) ? db.map(normalizePlayer).filter(Boolean) : [];
  };

  window.savePlayerDB = function savePlayerDBAdapter(players) {
    saveJson('kotc3_playerdb', Array.isArray(players) ? players.map(normalizePlayer).filter(Boolean) : []);
  };

  window.getPlayerById = function getPlayerByIdAdapter(id) {
    return window.loadPlayerDB().find((player) => player.id === String(id)) || null;
  };

  window.bootstrapAdminIptTournament = async function bootstrapAdminIptTournament(trnId) {
    const id = String(trnId || '').trim();
    if (!id) return null;

    const [tournament, roster] = await Promise.all([
      fetchJson(`/api/admin/tournaments/${encodeURIComponent(id)}`),
      fetchJson(`/api/admin/roster?tournamentId=${encodeURIComponent(id)}`),
    ]);

    mergePlayersIntoDb(Array.isArray(roster) ? roster : []);
    const standaloneTournament = buildStandaloneTournament(tournament, roster);
    return upsertTournament(standaloneTournament);
  };

  window.showToast = function showToastAdapter(message, type) {
    const host = document.getElementById('ipt-toast-host');
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'ipt-toast ' + (type || 'info');
    node.textContent = String(message || '');
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 180);
    }, 2200);
  };

  window.showConfirm = function showConfirmAdapter(message) {
    return Promise.resolve(window.confirm(String(message || '')));
  };

  window.calculateRanking = function calculateRankingAdapter(place) {
    return [0, 10, 7, 5, 3, 2, 1][Number(place) || 0] || 1;
  };

  window.recalcAllPlayerStats = function recalcAllPlayerStatsAdapter() {};
  window.syncDivLock = function syncDivLockAdapter() {};
  window.playScoreSound = function playScoreSoundAdapter() {};
  window.switchTab = function switchTabAdapter() {};
  window.activeTabId = null;
  window._iptActiveTrnId = null;
  window.sharedApi = {
    async finalizeTournament(tournamentId, results) {
      const id = String(tournamentId || '').trim();
      if (!id) throw new Error('Missing tournament id');

      const saveResults = await fetchJson(`/api/admin/tournaments/${encodeURIComponent(id)}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: Array.isArray(results) ? results : [] }),
      });

      await fetchJson('/api/admin/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tournament_status',
          tournamentId: id,
          status: 'finished',
          reason: 'IPT standalone finalize',
        }),
      });

      return { ok: true, inserted: Number(saveResults?.inserted ?? 0) };
    },
  };
})();
