type RosterHistoryControlsProps = {
  visible: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  hasHistory: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
};

export function RosterHistoryControls({
  visible,
  canUndo,
  canRedo,
  busy,
  hasHistory,
  onUndo,
  onRedo,
  onClear,
}: RosterHistoryControlsProps) {
  if (!visible) return null;
  return (
    <div className="mb-2 flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo || busy}
        className="px-2 py-1 rounded border border-white/20 text-[10px] uppercase tracking-wide disabled:opacity-50"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo || busy}
        className="px-2 py-1 rounded border border-white/20 text-[10px] uppercase tracking-wide disabled:opacity-50"
      >
        Redo
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy || !hasHistory}
        className="px-2 py-1 rounded border border-white/20 text-[10px] uppercase tracking-wide disabled:opacity-50"
      >
        Clear
      </button>
    </div>
  );
}
