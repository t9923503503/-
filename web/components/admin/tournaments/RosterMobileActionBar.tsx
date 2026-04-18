type RosterMobileActionBarProps = {
  visible: boolean;
  viewLabel: string;
  filled: number;
  total: number;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  hasHistory: boolean;
  saveDisabled: boolean;
  viewSwitchDisabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onViewSwitch: () => void;
};

export function RosterMobileActionBar({
  visible,
  viewLabel,
  filled,
  total,
  canUndo,
  canRedo,
  busy,
  hasHistory,
  saveDisabled,
  viewSwitchDisabled,
  onUndo,
  onRedo,
  onClear,
  onViewSwitch,
}: RosterMobileActionBarProps) {
  if (!visible) return null;
  return (
    <div className="md:hidden sticky bottom-2 z-20 rounded-xl border border-white/15 bg-surface/95 backdrop-blur p-2 flex items-center gap-2">
      <span className="text-[10px] text-text-secondary whitespace-nowrap">
        {viewLabel} · {filled}/{total}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo || busy}
        className="px-3 py-2 rounded-lg border border-white/20 text-xs disabled:opacity-50"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo || busy}
        className="px-3 py-2 rounded-lg border border-white/20 text-xs disabled:opacity-50"
      >
        Redo
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy || !hasHistory}
        className="px-3 py-2 rounded-lg border border-white/20 text-xs disabled:opacity-50"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onViewSwitch}
        disabled={viewSwitchDisabled}
        className="px-3 py-2 rounded-lg border border-white/20 text-xs disabled:opacity-50"
      >
        View: {viewLabel}
      </button>
      <button
        type="submit"
        disabled={saveDisabled}
        className="ml-auto px-3 py-2 rounded-lg bg-brand text-surface text-xs font-semibold disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
