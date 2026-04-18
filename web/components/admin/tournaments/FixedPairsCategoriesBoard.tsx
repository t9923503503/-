type DraftPlayerLike = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
} | undefined;

type Props = {
  draftPlayers: DraftPlayerLike[];
  selectedDraftIndex: number | null;
  hardSlots: number;
  mediumSlots: number;
  liteSlots: number;
  onSwap: (fromIndex: number, toIndex?: number) => void;
  onRemove: (index: number) => void;
  onMessage: (message: string) => void;
};

export function FixedPairsCategoriesBoard({
  draftPlayers,
  selectedDraftIndex,
  hardSlots,
  mediumSlots,
  liteSlots,
  onSwap,
  onRemove,
  onMessage,
}: Props) {
  const columns = [
    {
      cat: 'hard' as const,
      label: 'HARD',
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      headColor: 'text-red-300',
      totalSlots: hardSlots,
      offset: 0,
    },
    {
      cat: 'medium' as const,
      label: 'MEDIUM',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
      headColor: 'text-amber-300',
      totalSlots: mediumSlots,
      offset: hardSlots,
    },
    {
      cat: 'easy' as const,
      label: 'LITE',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
      headColor: 'text-emerald-300',
      totalSlots: liteSlots,
      offset: hardSlots + mediumSlots,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {columns.map(({ cat, label, border, bg, headColor, totalSlots, offset }) => {
        const totalPairs = totalSlots / 2;
        const filledCount = Array.from({ length: totalSlots }, (_, i) => draftPlayers[offset + i]).filter(Boolean)
          .length;
        return (
          <div key={cat} className={`rounded-xl border ${border} ${bg} p-3 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <h4 className={`text-sm font-semibold uppercase tracking-wide ${headColor}`}>{label}</h4>
              <span className="text-xs text-text-secondary">
                {Math.floor(filledCount / 2)}/{totalPairs} пар
              </span>
            </div>
            <div className="space-y-2">
              {Array.from({ length: totalPairs }, (_, pairIdx) => {
                const slot0 = offset + pairIdx * 2;
                const slot1 = slot0 + 1;
                return (
                  <div key={pairIdx} className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1.5">
                      Пара {pairIdx + 1}
                    </div>
                    {[slot0, slot1].map((draftIndex) => {
                      const player = draftPlayers[draftIndex];
                      const selected =
                        selectedDraftIndex != null &&
                        selectedDraftIndex - (selectedDraftIndex % 2) === draftIndex - (draftIndex % 2);
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
                          className={`rounded border transition-colors cursor-grab active:cursor-grabbing mt-1 ${
                            selected
                              ? 'border-brand bg-brand/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-stretch gap-1">
                            <button
                              type="button"
                              onClick={() => onSwap(draftIndex)}
                              disabled={!player}
                              className="flex-1 px-2 py-1.5 text-left disabled:cursor-default disabled:opacity-60"
                            >
                              <div className="text-[10px] text-text-secondary">Игрок {(draftIndex % 2) + 1}</div>
                              <div className="font-medium text-xs mt-0.5">
                                {player ? player.playerName : 'Пусто'}
                              </div>
                              {player ? <div className="text-[10px] text-text-secondary">{player.gender}</div> : null}
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
            <button
              type="button"
              onClick={() => {
                const firstFree = Array.from({ length: totalSlots }, (_, i) => i).find(
                  (i) => !draftPlayers[offset + i],
                );
                if (firstFree === undefined) {
                  onMessage(`Все слоты ${label} заняты`);
                  return;
                }
                onMessage(`Добавьте игрока уровня ${label} через поиск выше`);
              }}
              className={`mt-1 text-xs text-center py-1.5 rounded-lg border ${border} ${headColor} hover:opacity-70 transition-opacity`}
            >
              + Добавить в {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
