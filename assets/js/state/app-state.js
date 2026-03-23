'use strict';
// ════════════════════════════════════════════════════════════
// 1. STATE
// ════════════════════════════════════════════════════════════
// ppc  = players per court (fixed to 4 for ThaiVolley32)
// nc   = number of active courts (fixed to 4 for ThaiVolley32)
let ppc = 4;
let nc  = 4;
// ThaiVolley32 needs rotating partners per round; fixedPairs must stay off.
let fixedPairs = false;  // режим фиксированных пар — напарник не меняется
const courtRound = [0, 0, 0, 0]; // текущий отображаемый раунд для каждого корта
const divRoundState = { hard:0, advance:0, medium:0, lite:0 }; // текущий раунд дивизиона
// Индекс таймера для каждого дивизиона (slots 4-7)
const DIV_TIMER_IDX = { hard:4, advance:5, medium:6, lite:7 };

// ── Tournament meta ─────────────────────────────────────────
let tournamentMeta    = { name: '', date: '' };
let tournamentHistory = [];   // Лента событий (макс. 450 записей)
let historyFilter = 'all';    // 'all' | 'k0'..'k3' | 'hard'|'advance'|'medium'|'lite'
let svodGenderFilter  = 'all'; // 'all' | 'M' | 'W'

// pending values while user fiddles with seg buttons (not yet applied)
let _ppc = ppc;
let _nc  = nc;

const COURT_META = [
  { name:'👑 КОРТ 1', color:'#FFD700' },
  { name:'🔵 КОРТ 2', color:'#4DA8DA' },
  { name:'🟢 КОРТ 3', color:'#6ABF69' },
  { name:'🟣 КОРТ 4', color:'#C77DFF' },
];

// ALL_COURTS[ci] = {men:[...], women:[...]}  always length 5
const ALL_COURTS = [
  { men:['Яковлев','Жидков','Алик','Куанбеков','Юшманов'],
    women:['Лебедева','Чемерис В','Настя НМ','Сайдуллина','Маргарита'] },
  { men:['Обухов','Соболев','Иванов','Грузин','Шперлинг'],
    women:['Шперлинг','Шерметова','Сабанцева','Микишева','Базутова'] },
  { men:['Сайдуллин','Лебедев','Камалов','Привет','Анашкин'],
    women:['Носкова','Арефьева','Кузьмина','Яковлева','Маша Привет'] },
  { men:['Игрок М1','Игрок М2','Игрок М3','Игрок М4','Игрок М5'],
    women:['Игрок Ж1','Игрок Ж2','Игрок Ж3','Игрок Ж4','Игрок Ж5'] },
];

// scores[ci][mi][ri] — allocated dynamically based on nc × ppc
let scores = makeBlankScores();
// Timestamps for smart merge (race condition prevention)
let scoreTs = {}; // { 'c0': ms, 'c1': ms, 'hard': ms, ... }
function makeBlankScores() {
  return Array.from({length:4}, () =>
    Array.from({length:ppc}, () => Array(ppc).fill(null))
  );
}

// Division state
const DIV_KEYS = ['hard','advance','medium','lite'];

// Активные дивизионы зависят от числа кортов
// nc=1→[hard], nc=2→[hard,lite], nc=3→[hard,medium,lite], nc=4→все
function activeDivKeys() {
  if (nc <= 1) return ['hard'];
  if (nc === 2) return ['hard','lite'];
  if (nc === 3) return ['hard','medium','lite'];
  return ['hard','advance','medium','lite'];
}

let divScores = makeBlankDivScores();
let divRoster = makeBlankDivRoster();
function makeBlankDivScores(){
  const o={};
  DIV_KEYS.forEach(k=>{ o[k]=Array.from({length:5},()=>Array(5).fill(null)); });
  return o;
}
function makeBlankDivRoster(){
  const o={};
  DIV_KEYS.forEach(k=>{ o[k]={men:[],women:[]}; });
  return o;
}

let activeTabId = 'home';  // current tab id (number = court index, or string)

// ── HOME DASHBOARD STATE ────────────────────────────────────
let homeActiveTab = 'schedule';   // 'schedule' | 'calendar' | 'archive'
let homeArchiveFormOpen = false;
let homeArchiveFormPlayers = [];   // [{name, pts, gender}]
let homeArchiveFormGender  = 'M';  // default gender for next player

// ── ARCHIVE FILTERS STATE ─────────────────────────────────
let archiveSearch = '';
let archiveSort   = 'date_desc'; // 'date_desc' | 'date_asc' | 'players' | 'pts'
let _serverArchive = null; // cached server archive [{id,name,date,format,division,photoUrl,results}]
let _serverArchiveFetched = false;

// ── PLAYER DATABASE STATE ───────────────────────────────────
let playersGender = 'M';
let playersSearch = '';
let playersSort   = 'pts'; // 'pts' | 'avg' | 'trn'

// ── RATING SYSTEM — Professional Points ─────────────────────
const POINTS_TABLE = [
  100,90,82,76,70,65,60,56,52,48,  // 1-10  (HARD зона)
  44,42,40,38,36,34,32,30,28,26,   // 11-20 (MEDIUM зона)
  24,22,20,18,16,14,12,10,8,7,     // 21-30
  6,5,4,3,2,2,1,1,1,1              // 31-40 (LITE зона)
];
function calculateRanking(place) {
  if (place < 1 || place > POINTS_TABLE.length) return 1;
  return POINTS_TABLE[place - 1];
}
function getPlayerZone(rank) {
  if (rank <= 10) return 'hard';
  if (rank <= 20) return 'medium';
  return 'lite';
}
function divisionToType(division) {
  if (!division) return 'M';
  const d = division.toLowerCase();
  if (d.includes('женск')) return 'W';
  if (d.includes('микст') || d.includes('смешан')) return 'Mix';
  return 'M';
}

// ── GUARD-ФУНКЦИИ (A1.2) ──────────────────────────────────
/**
 * Безопасное чтение scores[ci][mi][ri] с bounds check.
 * Возвращает null если индексы вне диапазона.
 */
function getScore(ci, mi, ri) {
  if (!scores[ci] || !scores[ci][mi]) return null;
  const v = scores[ci][mi][ri];
  return v === undefined ? null : v;
}

/**
 * Безопасная запись scores[ci][mi][ri] с bounds check.
 * Возвращает false если индексы вне диапазона.
 */
function setScore(ci, mi, ri, value) {
  if (!scores[ci] || !scores[ci][mi]) return false;
  if (ri < 0 || ri >= scores[ci][mi].length) return false;
  const n = Number(value);
  scores[ci][mi][ri] = (value === null || value === undefined) ? null : (Number.isFinite(n) ? n : null);
  return true;
}

/**
 * Добавляет запись в tournamentHistory с enforced лимитом 450.
 */
function pushHistory(entry) {
  if (!Array.isArray(tournamentHistory)) tournamentHistory = [];
  tournamentHistory.push(entry);
  if (tournamentHistory.length > 450) tournamentHistory = tournamentHistory.slice(-450);
}

/**
 * Sanitize объекта игрока из API — возвращает только безопасные поля.
 */
function sanitizePlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:        typeof raw.id === 'string' ? raw.id.slice(0, 64) : String(raw.id ?? '').slice(0, 64),
    name:      typeof raw.name === 'string' ? raw.name.slice(0, 100) : '',
    gender:    raw.gender === 'W' ? 'W' : 'M',
    ratingM:   Number.isFinite(Number(raw.ratingM))   ? Number(raw.ratingM)   : 0,
    ratingW:   Number.isFinite(Number(raw.ratingW))   ? Number(raw.ratingW)   : 0,
    ratingMix: Number.isFinite(Number(raw.ratingMix)) ? Number(raw.ratingMix) : 0,
    tournaments: Number.isInteger(raw.tournaments) && raw.tournaments >= 0 ? raw.tournaments : 0,
    status:    typeof raw.status === 'string' ? raw.status.slice(0, 32) : 'active',
  };
}

// ── AppState ОБЪЕКТ — адаптер (A1.5) ──────────────────────
// Обёртка над глобальными переменными с геттерами/сеттерами.
// Старый код продолжает работать напрямую; новый код использует AppState.
const AppState = {
  // Корты
  get scores() { return scores; },
  get nc() { return nc; },
  set nc(v) { nc = v; },
  get ppc() { return ppc; },
  set ppc(v) { ppc = v; },
  get courtRound() { return courtRound; },
  get scoreTs() { return scoreTs; },

  // Турнир
  get tournamentMeta() { return tournamentMeta; },
  set tournamentMeta(v) { tournamentMeta = v; },
  get tournamentHistory() { return tournamentHistory; },
  set tournamentHistory(v) { tournamentHistory = v; },
  get historyFilter() { return historyFilter; },
  set historyFilter(v) { historyFilter = v; },

  // Дивизионы
  get divScores() { return divScores; },
  get divRoster() { return divRoster; },
  get divRoundState() { return divRoundState; },

  // UI
  get activeTabId() { return activeTabId; },
  set activeTabId(v) { activeTabId = v; },
  get svodGenderFilter() { return svodGenderFilter; },
  set svodGenderFilter(v) { svodGenderFilter = v; },

  // Игроки
  get playersGender() { return playersGender; },
  set playersGender(v) { playersGender = v; },
  get playersSearch() { return playersSearch; },
  set playersSearch(v) { playersSearch = v; },
  get playersSort() { return playersSort; },
  set playersSort(v) { playersSort = v; },

  // Архив
  get archiveSearch() { return archiveSearch; },
  set archiveSearch(v) { archiveSearch = v; },
  get archiveSort() { return archiveSort; },
  set archiveSort(v) { archiveSort = v; },

  // Вспомогательные функции
  getScore,
  setScore,
  pushHistory,
  sanitizePlayer,
  makeBlankScores,
  activeDivKeys,
  calculateRanking,
  getPlayerZone,
  divisionToType,
};

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.AppState = AppState;
  }
} catch (_) {}
