import { buildTournamentEventJsonLd, jsonLdScriptProps } from '@/lib/seo';
import type { Tournament } from '@/lib/types';

interface TournamentStructuredDataProps {
  tournament: Tournament;
  image?: string | null;
}

export default function TournamentStructuredData({
  tournament,
  image,
}: TournamentStructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={jsonLdScriptProps(buildTournamentEventJsonLd(tournament, { image }))}
    />
  );
}
