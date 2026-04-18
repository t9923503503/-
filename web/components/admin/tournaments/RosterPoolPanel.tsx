import type { ReactNode } from 'react';

export type RosterPoolPlayer = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  level?: string;
};

export type RosterPoolLevelOption = {
  key: string;
  label: string;
};

type RosterPoolPanelProps = {
  unifiedMode: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  genderFilterControl: ReactNode;
  players: RosterPoolPlayer[];
  isFixedPairsSeeding: boolean;
  onAddPlayer: (player: RosterPoolPlayer) => void;
  showQuickAdd: boolean;
  quickAddForm: { name: string; gender: 'M' | 'W'; level: string };
  quickAddLoading: boolean;
  levels: RosterPoolLevelOption[];
  onShowQuickAdd: (next: boolean) => void;
  onQuickAddFormChange: (patch: Partial<{ name: string; gender: 'M' | 'W'; level: string }>) => void;
  onQuickCreatePlayer: () => void;
};

export function RosterPoolPanel({
  unifiedMode,
  searchValue,
  onSearchChange,
  genderFilterControl,
  players,
  isFixedPairsSeeding,
  onAddPlayer,
  showQuickAdd,
  quickAddForm,
  quickAddLoading,
  levels,
  onShowQuickAdd,
  onQuickAddFormChange,
  onQuickCreatePlayer,
}: RosterPoolPanelProps) {
  return (
    <div className={unifiedMode ? 'rounded-xl border border-white/10 bg-black/10 p-3 flex flex-col gap-3 h-fit' : 'flex flex-col gap-3'}>
      <input
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Добавить игрока в турнир"
        className="px-3 py-2 rounded-lg bg-surface border border-white/20"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">Фильтр пола</span>
        {genderFilterControl}
      </div>

      <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onAddPlayer(player)}
            className="text-left px-3 py-2 rounded-lg border border-white/10 hover:border-brand transition-colors text-sm"
          >
            {player.name}
            <span className="text-text-secondary ml-2">{player.gender === 'W' ? 'W' : 'M'}</span>
            {isFixedPairsSeeding && player.level ? (
              <span
                className={`ml-2 text-[11px] uppercase font-semibold ${
                  player.level === 'hard'
                    ? 'text-red-400'
                    : player.level === 'medium'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {player.level === 'easy' ? 'LITE' : player.level.toUpperCase()}
              </span>
            ) : null}
          </button>
        ))}

        {players.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-secondary">Нет доступных игроков в базе</p>
            {!showQuickAdd ? (
              <button
                type="button"
                onClick={() => {
                  onShowQuickAdd(true);
                  onQuickAddFormChange({ name: searchValue });
                }}
                className="text-left px-3 py-2 rounded-lg border border-brand/40 hover:bg-brand/10 text-brand text-sm transition-colors uppercase tracking-wider font-semibold"
              >
                + Создать игрока
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg max-w-sm">
                <input
                  placeholder="Имя Фамилия"
                  value={quickAddForm.name}
                  onChange={(e) => onQuickAddFormChange({ name: e.target.value })}
                  className="px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={quickAddForm.gender}
                    onChange={(e) => onQuickAddFormChange({ gender: e.target.value as 'M' | 'W' })}
                    className="flex-1 px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                  >
                    <option value="M">М</option>
                    <option value="W">Ж</option>
                  </select>
                  <select
                    value={quickAddForm.level}
                    onChange={(e) => onQuickAddFormChange({ level: e.target.value })}
                    className="flex-1 px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                  >
                    {levels.map((level) => (
                      <option key={level.key} value={level.key}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={onQuickCreatePlayer}
                    disabled={quickAddLoading || !quickAddForm.name.trim()}
                    className="flex-1 bg-brand text-surface text-sm font-semibold rounded py-1.5 disabled:opacity-50"
                  >
                    {quickAddLoading ? '...' : 'Создать'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onShowQuickAdd(false)}
                    className="flex-1 border border-white/20 text-text-secondary text-sm rounded py-1.5 hover:bg-white/5"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
