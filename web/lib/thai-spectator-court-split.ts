/** Две четвёрки на корту для табло зрителей: MN — Монстры/Лютые, MF — М/Ж. */
export function splitCourtPlayersForSpectator(
  variant: string,
  names: string[],
): { columns: Array<{ title: string; names: string[] }> } {
  const v = String(variant || '').trim().toUpperCase();
  if ((v === 'MN' || v === 'MF') && names.length >= 8) {
    return {
      columns: [
        {
          title: v === 'MN' ? 'Монстры' : 'Мужчины',
          names: names.slice(0, 4),
        },
        {
          title: v === 'MN' ? 'Лютые' : 'Женщины',
          names: names.slice(4, 8),
        },
      ],
    };
  }
  const half = Math.max(1, Math.ceil(names.length / 2));
  return {
    columns: [
      { title: '', names: names.slice(0, half) },
      { title: '', names: names.slice(half) },
    ],
  };
}
