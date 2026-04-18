from pathlib import Path
import re

path = Path('/var/www/ipt/web/lib/kotc-next/service.ts')
text = path.read_text(encoding='utf-8')

anchor = "const ZONE_ORDER: KotcNextZoneKey[] = ['kin', 'advance', 'medium', 'lite'];\n\n"
insert = """interface PairSourcePlayer {
  primaryPlayerId: string | null;
  primaryPlayerName: string;
  secondaryPlayerId: string | null;
  secondaryPlayerName: string;
  primaryGender: 'M' | 'W' | null;
  secondaryGender: 'M' | 'W' | null;
}

interface R1PairSource {
  courtNo: number;
  pairs: PairSourcePlayer[];
}

"""

if 'interface PairSourcePlayer {' not in text:
    if anchor not in text:
        raise SystemExit('anchor not found')
    text = text.replace(anchor, anchor + insert, 1)

pattern = re.compile(r"function buildR1Pairs\([\s\S]*?\n}\n\nfunction normalizeSeedDraftInput", re.M)
replacement = """function toPairSource(primary: RosterPlayer, secondary: RosterPlayer): PairSourcePlayer {
  return {
    primaryPlayerId: primary.playerId,
    primaryPlayerName: primary.playerName,
    secondaryPlayerId: secondary.playerId,
    secondaryPlayerName: secondary.playerName,
    primaryGender: primary.gender,
    secondaryGender: secondary.gender,
  };
}

function buildSequentialR1PairSources(
  roster: RosterPlayer[],
  params: Pick<KotcNextJudgeParams, 'courts' | 'ppc'>,
): R1PairSource[] {
  const playersPerCourt = params.ppc * 2;
  return Array.from({ length: params.courts }, (_, courtIdx) => {
    const courtPlayers = roster.slice(courtIdx * playersPerCourt, courtIdx * playersPerCourt + playersPerCourt);
    const pairs = Array.from({ length: params.ppc }, (_, pairIdx) => {
      const primary = courtPlayers[pairIdx * 2];
      const secondary = courtPlayers[pairIdx * 2 + 1];
      if (!primary || !secondary) {
        throw new KotcNextError(422, 'Roster does not match KOTC Next pair capacity');
      }
      return toPairSource(primary, secondary);
    });
    return { courtNo: courtIdx + 1, pairs };
  });
}

function buildMixedR1PairSources(
  roster: RosterPlayer[],
  params: Pick<KotcNextJudgeParams, 'courts' | 'ppc'>,
): R1PairSource[] {
  const men = roster.filter((player) => player.gender === 'M');
  const women = roster.filter((player) => player.gender === 'W');
  const expectedPerGender = params.courts * params.ppc;

  if (men.length !== expectedPerGender || women.length !== expectedPerGender) {
    throw new KotcNextError(
      422,
      `Mixed KOTC requires ${expectedPerGender} men and ${expectedPerGender} women, received ${men.length} men and ${women.length} women`,
    );
  }

  return Array.from({ length: params.courts }, (_, courtIdx) => {
    const pairs = Array.from({ length: params.ppc }, (_, pairIdx) => {
      const rosterIdx = courtIdx * params.ppc + pairIdx;
      const primary = men[rosterIdx];
      const secondary = women[rosterIdx];
      if (!primary || !secondary) {
        throw new KotcNextError(422, 'Roster does not match KOTC Next pair capacity');
      }
      return toPairSource(primary, secondary);
    });
    return { courtNo: courtIdx + 1, pairs };
  });
}

export function buildKotcNextR1PairSources(
  roster: RosterPlayer[],
  options: Pick<KotcNextJudgeParams, 'courts' | 'ppc' | 'variant'>,
): R1PairSource[] {
  if (options.variant === 'MF') {
    return buildMixedR1PairSources(roster, options);
  }
  return buildSequentialR1PairSources(roster, options);
}

function buildR1Pairs(roster: RosterPlayer[], tournament: TournamentRow): R1PairSource[] {
  return buildKotcNextR1PairSources(roster, tournament.params);
}

function normalizeSeedDraftInput"""

new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'function block replacement count={count}')

backup = path.with_suffix(path.suffix + '.bak-mixed-r1')
backup.write_text(text, encoding='utf-8')
path.write_text(new_text, encoding='utf-8')
print('PATCHED', path)
