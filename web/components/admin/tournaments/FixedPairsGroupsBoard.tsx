type DraftPlayerLike = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
} | undefined;

type Props = {
  groupCount: number;
  formulaHard: number;
  formulaMedium: number;
  formulaLite: number;
  fixedPairsHardSlots: number;
  fixedPairsMedSlots: number;
  draftPlayers: DraftPlayerLike[];
  selectedDraftIndex: number | null;
  confirmClearGroupIndex: number | null;
  onRequestClearGroup: (groupIndex: number, indexesToClear: number[]) => void;
  onSwap: (fromIndex: number, toIndex?: number) => void;
  onRemove: (index: number) => void;
};

export function FixedPairsGroupsBoard({
  groupCount,
  formulaHard,
  formulaMedium,
  formulaLite,
  fixedPairsHardSlots,
  fixedPairsMedSlots,
  draftPlayers,
  selectedDraftIndex,
  confirmClearGroupIndex,
  onRequestClearGroup,
  onSwap,
  onRemove,
}: Props) {
  return (
    <div className="grid xl:grid-cols-2 gap-3">
      {Array.from({ length: groupCount }, (_, groupIdx) => {
        const catConfig = [
          { key: 'hard', label: 'HARD', color: 'text-red-400', pairs: formulaHard, base: groupIdx * formulaHard * 2 },
          {
            key: 'medium',
            label: 'MEDIUM',
            color: 'text-amber-400',
            pairs: formulaMedium,
            base: fixedPairsHardSlots + groupIdx * formulaMedium * 2,
          },
          {
            key: 'lite',
            label: 'LITE',
            color: 'text-emerald-400',
            pairs: formulaLite,
            base: fixedPairsHardSlots + fixedPairsMedSlots + groupIdx * formulaLite * 2,
          },
        ];
        const indexesToClear = catConfig.flatMap(({ pairs, base }) =>
          Array.from({ length: pairs * 2 }, (_, i) => base + i),
        );
        return (
          <div key={groupIdx} className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-text-primary">Группа {String.fromCharCode(65 + groupIdx)}</h4>
              <button
                type="button"
                onClick={() => onRequestClearGroup(groupIdx, indexesToClear)}
                className={`text-[10px] uppercase font-semibold px-2 py-1 rounded transition-colors ${
                  confirmClearGroupIndex === groupIdx
                    ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                    : 'text-red-400 hover:text-red-300'
                }`}
              >
                {confirmClearGroupIndex === groupIdx ? 'Точно?' : 'Очистить'}
              </button>
            </div>
            <div className="space-y-3">
              {catConfig.map(({ key, label, color, pairs, base }) =>
                pairs > 0 ? (
                  <div key={key}>
                    <div className={`text-[10px] uppercase font-semibold ${color} mb-1`}>{label}</div>
                    {Array.from({ length: pairs }, (_, pairInGroup) => {
                      const slot0 = base + pairInGroup * 2;
                      const slot1 = slot0 + 1;
                      return (
                        <div key={pairInGroup} className="rounded-lg border border-white/10 bg-white/5 mb-1.5">
                          <div className="text-[10px] px-2 pt-1.5 text-text-secondary uppercase tracking-wider">
                            Пара {pairInGroup + 1}
                          </div>
                          {[slot0, slot1].map((draftIndex) => {
                            const player = draftPlayers[draftIndex];
                            const selected =
                              selectedDraftIndex != null &&
                              selectedDraftIndex - (selectedDraftIndex % 2) ===
                                draftIndex - (draftIndex % 2);
                            return (
                              <div
                                key={draftIndex}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', draftIndex.toString());
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                  if (!Number.isNaN(fromIndex) && fromIndex !== draftIndex) {
                                    onSwap(fromIndex, draftIndex);
                                  }
                                }}
                                className={`border-t border-white/5 transition-colors cursor-grab active:cursor-grabbing ${
                                  selected ? 'bg-brand/10' : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="flex items-stretch gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onSwap(draftIndex)}
                                    disabled={!player}
                                    className="flex-1 px-3 py-1.5 text-left disabled:cursor-default disabled:opacity-60"
                                  >
                                    <div className="text-[10px] text-text-secondary">Игрок {(draftIndex % 2) + 1}</div>
                                    <div className="font-medium text-xs mt-0.5">
                                      {player ? player.playerName : 'Пусто'}
                                    </div>
                                    {player ? (
                                      <div className="text-[10px] text-text-secondary">{player.gender}</div>
                                    ) : null}
                                  </button>
                                  {player ? (
                                    <button
                                      type="button"
                                      onClick={() => onRemove(draftIndex)}
                                      className="px-2 text-[10px] text-red-300 border-l border-white/10"
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
