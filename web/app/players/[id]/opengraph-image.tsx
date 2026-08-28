import { ImageResponse } from 'next/og';
import { fetchPlayer, fetchPlayerExtendedStats } from '@/lib/queries';

export const runtime = 'nodejs';
export const alt = 'Карточка игрока LPVOLLEY.RU';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface ImageProps {
  params: Promise<{ id: string }>;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function movementLabel(delta: number | null) {
  if (delta == null) return 'NEW В РЕЙТИНГЕ';
  if (delta > 0) return `▲ ${delta} ПОЗ.`;
  if (delta < 0) return `▼ ${Math.abs(delta)} ПОЗ.`;
  return '• БЕЗ ИЗМЕНЕНИЙ';
}

export default async function PlayerOpenGraphImage({ params }: ImageProps) {
  const { id } = await params;
  const [player, stats] = await Promise.all([
    fetchPlayer(id),
    fetchPlayerExtendedStats(id),
  ]);

  const name = player?.name || 'Игрок LPVOLLEY';
  const baseRanking = player?.gender === 'W'
    ? { label: 'Ж', rating: Number(player?.ratingW || 0), tournaments: Number(player?.tournamentsW || 0), rank: stats.rankW, delta: stats.rankDeltaW }
    : { label: 'М', rating: Number(player?.ratingM || 0), tournaments: Number(player?.tournamentsM || 0), rank: stats.rankM, delta: stats.rankDeltaM };
  const mixRanking = {
    label: 'MIX',
    rating: Number(player?.ratingMix || 0),
    tournaments: Number(player?.tournamentsMix || 0),
    rank: stats.rankMix,
    delta: stats.rankDeltaMix,
  };
  const ranking = mixRanking.tournaments > baseRanking.tournaments ? mixRanking : baseRanking;
  const photoUrl = player?.photoUrl
    ? new URL(player.photoUrl, 'https://lpvolley.ru').toString()
    : null;
  const deltaTone = ranking.delta == null || ranking.delta > 0 ? '#7cf293' : ranking.delta < 0 ? '#ffb27d' : '#b8b8b8';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(125deg, #080808 0%, #17100b 58%, #0b1720 100%)',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: 999, background: 'rgba(255,106,0,0.18)', filter: 'blur(70px)', top: -210, left: -130 }} />
        <div style={{ position: 'absolute', width: 460, height: 460, borderRadius: 999, background: 'rgba(38,198,255,0.14)', filter: 'blur(80px)', right: -160, bottom: -230 }} />

        <div style={{ display: 'flex', width: '100%', padding: '58px 66px', alignItems: 'center', gap: 54 }}>
          <div style={{ display: 'flex', width: 330, height: 420, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.12)', borderRadius: 42, background: 'rgba(255,255,255,0.04)', transform: 'rotate(-3deg)' }} />
            <div style={{ display: 'flex', width: 264, height: 264, borderRadius: 999, overflow: 'hidden', border: '8px solid #ff6a00', background: '#202020', alignItems: 'center', justifyContent: 'center', boxShadow: '0 28px 60px rgba(0,0,0,0.45)' }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires a directly renderable image element.
                <img src={photoUrl} alt="" width="264" height="264" style={{ width: 264, height: 264, objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', fontSize: 82, fontWeight: 900, letterSpacing: -5 }}>{initials(name)}</div>
              )}
            </div>
            <div style={{ display: 'flex', position: 'absolute', bottom: 18, padding: '12px 20px', borderRadius: 999, background: '#ff6a00', fontSize: 21, fontWeight: 900, letterSpacing: 2 }}>
              ИГРОК LPVOLLEY
            </div>
          </div>

          <div style={{ display: 'flex', flex: 1, height: 420, flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 22, fontWeight: 900, letterSpacing: 5, color: '#ff8d3a' }}>ЛЮТЫЕ ПЛЯЖНИКИ</div>
              <div style={{ display: 'flex', marginTop: 18, maxWidth: 690, fontSize: name.length > 22 ? 58 : 72, lineHeight: 0.94, fontWeight: 900, letterSpacing: -3, textTransform: 'uppercase' }}>{name}</div>
              <div style={{ display: 'flex', marginTop: 20, alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', padding: '9px 15px', borderRadius: 999, border: `2px solid ${deltaTone}`, color: deltaTone, fontSize: 18, fontWeight: 900, letterSpacing: 1.5 }}>{movementLabel(ranking.delta)}</div>
                {player?.city ? <div style={{ display: 'flex', fontSize: 20, color: '#a8a8a8' }}>{player.city}</div> : null}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18 }}>
              <div style={{ display: 'flex', minWidth: 180, flexDirection: 'column', padding: '18px 22px', borderRadius: 24, border: '2px solid rgba(255,212,0,0.28)', background: 'rgba(255,212,0,0.08)' }}>
                <div style={{ display: 'flex', fontSize: 60, lineHeight: 1, fontWeight: 900, color: '#ffd400' }}>{ranking.rank ? `#${ranking.rank}` : '—'}</div>
                <div style={{ display: 'flex', marginTop: 7, fontSize: 16, fontWeight: 800, letterSpacing: 2, color: '#d8c871' }}>МЕСТО {ranking.label}</div>
              </div>
              <div style={{ display: 'flex', minWidth: 210, flexDirection: 'column', padding: '18px 22px', borderRadius: 24, border: '2px solid rgba(255,106,0,0.28)', background: 'rgba(255,106,0,0.08)' }}>
                <div style={{ display: 'flex', fontSize: 60, lineHeight: 1, fontWeight: 900, color: '#ff6a00' }}>{ranking.rating}</div>
                <div style={{ display: 'flex', marginTop: 7, fontSize: 16, fontWeight: 800, letterSpacing: 2, color: '#d8a17b' }}>ОЧКОВ · {ranking.tournaments} ТУР.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', position: 'absolute', right: 42, bottom: 28, fontSize: 18, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.42)' }}>LPVOLLEY.RU</div>
      </div>
    ),
    size,
  );
}
