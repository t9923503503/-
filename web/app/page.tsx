import LandingDesktop from '@/components/landing/LandingDesktop';
import { OrganizationSchema, WebSiteSchema } from '@/components/seo/SchemaOrg';
import { cookies } from 'next/headers';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { fetchHomeOverview, fetchHomePersonalSnapshot } from '@/lib/home';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const store = await cookies();
  const token = store.get(PLAYER_COOKIE)?.value;
  const me = token ? verifyPlayerToken(token) : null;
  const [overview, personal] = await Promise.all([
    fetchHomeOverview(me?.id ?? null),
    me ? fetchHomePersonalSnapshot(me.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <OrganizationSchema />
      <WebSiteSchema />
      <LandingDesktop overview={overview} personal={personal} />
    </>
  );
}
