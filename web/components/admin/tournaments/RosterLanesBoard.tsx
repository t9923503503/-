type DraftPlayer = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  playerLevel?: 'hard' | 'medium' | 'easy';
};

type DraftPlayerSlot = DraftPlayer | undefined;

type Props = {
  showLaneGrid: boolean;
  rosterLaneCount: number;
  playersPerCourt: number;
  isGoFormat: boolean;
  isThaiFormat: boolean;
  division: string;
  thaiCourtHint: string;
  selectedDraftIndex: number | null;
  confirmClearLaneIndex: number | null;
  draftPlayers: DraftPlayerSlot[];
  reservePlayers: DraftPlayerSlot[];
  seatCount: number;
  rosterOverflow: boolean;
  rosterError: string;
  thaiRosterError: string;
  goRosterError: string;
  getExpectedSlotHint: (slotIndex: number) => string | null;
  onSwap: (index1: number, index2?: number) => void;
  onRemove: (index: number) => void;
  onClearLane: (laneIndex: number) => void;
  onSetGenderFilter: (value: 'M' | 'W') => void;
};

export function RosterLanesBoard({
  showLaneGrid,
  rosterLaneCount,
  playersPerCourt,
  isGoFormat,
  isThaiFormat,
  division,
  thaiCourtHint,
  selectedDraftIndex,
  confirmClearLaneIndex,
  draftPlayers,
  reservePlayers,
  seatCount,
  rosterOverflow,
  rosterError,
  thaiRosterError,
  goRosterError,
  getExpectedSlotHint,
  onSwap,
  onRemove,
  onClearLane,
  onSetGenderFilter,
}: Props) {
  const filledCount = draftPlayers.filter(Boolean).length;

  return (
    <>
      {showLaneGrid ? (
        <div className="grid xl:grid-cols-2 gap-3">
          {Array.from({ length: rosterLaneCount }, (_, laneIndex) => (
            <div key={laneIndex} className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-text-primary">
                  {isGoFormat ? `Группа ${laneIndex + 1}` : `Корт ${laneIndex + 1}`}
                </h4>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary">
                    {isThaiFormat
                      ? thaiCourtHint
                      : isGoFormat
                        ? `${playersPerCourt} мест · ${Math.max(1, Math.floor(playersPerCourt / 2))} пар`
                        : division === 'Микст'
                          ? `${playersPerCourt} мест · ${Math.floor(playersPerCourt / 2)}M / ${Math.ceil(playersPerCourt / 2)}Ж`
                          : `${playersPerCourt} мест`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onClearLane(laneIndex)}
                    className={`text-[10px] uppercase font-semibold px-2 py-1 rounded transition-colors ${
                      confirmClearLaneIndex === laneIndex
                        ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                        : 'text-red-400 hover:text-red-300'
                    }`}
                  >
                    {confirmClearLaneIndex === laneIndex ? 'Точно?' : 'Очистить'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: playersPerCourt }, (_, slotIndex) => {
                  const draftIndex = laneIndex * playersPerCourt + slotIndex;
                  const player = draftPlayers[draftIndex];
                  const selected = isGoFormat
                    ? selectedDraftIndex != null &&
                      selectedDraftIndex - (selectedDraftIndex % 2) === draftIndex - (draftIndex % 2)
                    : selectedDraftIndex === draftIndex;
                  let expectedGender = isThaiFormat ? getExpectedSlotHint(slotIndex) : null;
                  if (!expectedGender && division === 'Микст') {
                    expectedGender = slotIndex < playersPerCourt / 2 ? 'M' : 'Ж';
                  }
                  const pairNumber = Math.floor(draftIndex / 2) + 1;
                  const pairSlotLabel = draftIndex % 2 === 0 ? 'Игрок 1' : 'Игрок 2';
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
                        if (!isNaN(fromIndex) && fromIndex !== draftIndex) {
                          onSwap(fromIndex, draftIndex);
                        }
                      }}
                      className={`rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                        selected ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSwap(draftIndex);
                            const exp =
                              getExpectedSlotHint(slotIndex) ??
                              (division === 'Микст' ? (slotIndex < playersPerCourt / 2 ? 'M' : 'Ж') : null);
                            if (exp === 'M' || exp === 'Мужчина') onSetGenderFilter('M');
                            else if (exp === 'Ж' || exp === 'W' || exp === 'Женщина') onSetGenderFilter('W');
                          }}
                          disabled={!player}
                          className="flex-1 px-3 py-2 text-left disabled:cursor-default disabled:opacity-60"
                        >
                          <div className="text-[11px] uppercase tracking-wider text-text-secondary">
                            {isGoFormat ? `Пара ${pairNumber} · ${pairSlotLabel}` : `Слот ${slotIndex + 1}`}
                            {expectedGender ? ` · ${expectedGender}` : ''}
                          </div>
                          <div className="font-medium text-sm mt-1">{player ? player.playerName : 'Пусто'}</div>
                          <div className="text-xs text-text-secondary mt-1">
                            {player
                              ? `${isGoFormat ? `Пара ${pairNumber}` : `Игрок ${draftIndex + 1}`} · ${player.gender}`
                              : expectedGender
                                ? `Ожидается ${expectedGender}`
                                : 'Свободное место'}
                          </div>
                        </button>
                        {player ? (
                          <button
                            type="button"
                            onClick={() => onRemove(draftIndex)}
                            className="px-3 text-xs text-red-300 border-l border-white/10"
                          >
                            Убрать
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {reservePlayers.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-text-primary">Резерв</h4>
            <span className="text-xs text-text-secondary">{reservePlayers.length} игроков</span>
          </div>
          <div className="space-y-2">
            {reservePlayers.map((player, reserveIndex) => {
              const draftIndex = seatCount + reserveIndex;
              const selected = selectedDraftIndex === draftIndex;
              return (
                <div
                  key={player ? `${player.playerId}-${draftIndex}` : `empty-${draftIndex}`}
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
                    if (!isNaN(fromIndex) && fromIndex !== draftIndex) {
                      onSwap(fromIndex, draftIndex);
                    }
                  }}
                  className={`rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                    selected ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-stretch gap-2">
                    <button type="button" onClick={() => onSwap(draftIndex)} className="flex-1 px-3 py-2 text-left">
                      <div className="text-[11px] uppercase tracking-wider text-text-secondary">Позиция {draftIndex + 1}</div>
                      <div className="font-medium text-sm mt-1">{player ? player.playerName : 'Пусто'}</div>
                      <div className="text-xs text-text-secondary mt-1">{player ? player.gender : 'Ожидается резерв'}</div>
                    </button>
                    {player ? (
                      <button
                        type="button"
                        onClick={() => onRemove(draftIndex)}
                        className="px-3 text-xs text-red-300 border-l border-white/10"
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedDraftIndex != null && draftPlayers[selectedDraftIndex] ? (
        <div className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">
          Выбран игрок: {draftPlayers[selectedDraftIndex]?.playerName}. Нажмите на другого игрока, чтобы поменять местами.
        </div>
      ) : null}

      {filledCount > 0 && filledCount < seatCount ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Внимание: не хватает {seatCount - filledCount} игроков для заполнения всех ожидаемых мест на кортах.
        </div>
      ) : null}

      {rosterOverflow ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Игроков больше, чем вместимость. Увеличьте capacity или уберите лишних игроков.
        </div>
      ) : null}

      {rosterError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{rosterError}</div>
      ) : null}

      {thaiRosterError ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {thaiRosterError}
        </div>
      ) : null}
      {goRosterError ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {goRosterError}
        </div>
      ) : null}
    </>
  );
}
