type WorkspaceKey = 'categories' | 'groups' | 'courts' | 'thai-r1';

type Option = { key: WorkspaceKey; label: string };

type RosterWorkspaceSwitchProps = {
  unifiedMode: boolean;
  isFixedPairsSeeding: boolean;
  workspaceOptions: Option[];
  workspaceValue: WorkspaceKey;
  fixedPairsValue: 'categories' | 'groups';
  showThaiR1Hint: boolean;
  onWorkspaceChange: (next: WorkspaceKey) => void;
  onFixedPairsChange: (next: 'categories' | 'groups') => void;
};

function MiniSeg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((option) => (
        <button
          key={String(option.key)}
          type="button"
          onClick={() => onChange(option.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            value === option.key
              ? 'bg-brand/20 text-brand border-brand/50'
              : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RosterWorkspaceSwitch({
  unifiedMode,
  isFixedPairsSeeding,
  workspaceOptions,
  workspaceValue,
  fixedPairsValue,
  showThaiR1Hint,
  onWorkspaceChange,
  onFixedPairsChange,
}: RosterWorkspaceSwitchProps) {
  return (
    <>
      {unifiedMode ? (
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-text-secondary whitespace-nowrap">Вид:</span>
          <MiniSeg
            options={workspaceOptions}
            value={workspaceValue}
            onChange={onWorkspaceChange}
          />
        </div>
      ) : isFixedPairsSeeding ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Вид:</span>
          <MiniSeg
            options={[
              { key: 'categories', label: 'По категориям' },
              { key: 'groups', label: 'По группам' },
            ]}
            value={fixedPairsValue}
            onChange={onFixedPairsChange}
          />
        </div>
      ) : null}

      {showThaiR1Hint ? (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          R1-режим: используйте текущую расстановку слотов как исходный порядок для первого раунда.
        </div>
      ) : null}
    </>
  );
}
