'use strict';

// window.APP_CONFIG может быть задан в config.js (не попадает в репозиторий).
// Если файл отсутствует — используются значения ниже.
const _cfg = window.APP_CONFIG || {};

const DEFAULT_SB_CONFIG = Object.freeze({
  url:        _cfg.supabaseUrl     || '',
  anonKey:    _cfg.supabaseAnonKey || '',
  roomCode:   '',
  roomSecret: '',
});

const DEFAULT_GSH_CONFIG = Object.freeze({
  clientId:      _cfg.googleClientId || '',
  spreadsheetId: '',
});
