'use client';

import { useState, useEffect } from 'react';
import type { LeaderboardEntry, RatingType } from '@/lib/types';
import GenderTabs from '@/components/rankings/GenderTabs';
import RankingsTable from '@/components/rankings/RankingsTable';

interface RankingsClientProps {
  initialEntries: LeaderboardEntry[];
  initialType: RatingType;
}

export default function RankingsClient({
  initialEntries,
  initialType,
}: RankingsClientProps) {
  const [type, setType] = useState<RatingType>(initialType);
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (type === initialType) return;

    setLoading(true);
    fetch(`/api/leaderboard?type=${type}&limit=50`)
      .then((r) => r.json())
      .then((data: LeaderboardEntry[]) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [type, initialType]);

  return (
    <>
      <GenderTabs value={type} onChange={setType} />
      <div className={loading ? 'opacity-50 transition-opacity' : ''}>
        <RankingsTable entries={entries} />
      </div>
    </>
  );
}
