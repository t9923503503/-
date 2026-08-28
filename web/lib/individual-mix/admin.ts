export const INDIVIDUAL_MIX_FORMAT = 'Individual Mix';
export const INDIVIDUAL_MIX_FORMAT_LABEL = 'Личный микст';
export const INDIVIDUAL_MIX_SERIES_LABEL = 'Бездельники';
export const INDIVIDUAL_MIX_VARIANT_STANDARD = 'standard';
export const INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID = 'six_pair_hybrid';

export type IndividualMixAdminVariant =
  | typeof INDIVIDUAL_MIX_VARIANT_STANDARD
  | typeof INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID;

type IndividualMixAdminParticipant = {
  playerId: string;
  position: number;
  isWaitlist: boolean;
  gender: string;
};

type IndividualMixTournamentSetup = {
  format: string;
  division: string;
  capacity: number;
  settings: Record<string, unknown>;
  participants: IndividualMixAdminParticipant[];
};

export function isIndividualMixFormat(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === INDIVIDUAL_MIX_FORMAT.toLowerCase();
}

export function normalizeIndividualMixAdminVariant(value: unknown): IndividualMixAdminVariant {
  return String(value ?? '').trim().toLowerCase() === INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID
    ? INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID
    : INDIVIDUAL_MIX_VARIANT_STANDARD;
}

export function isSixPairIndividualMixVariant(value: unknown): boolean {
  return normalizeIndividualMixAdminVariant(value) === INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID;
}

export function validateIndividualMixTournamentSetup(
  input: IndividualMixTournamentSetup,
): string | null {
  if (!isIndividualMixFormat(input.format)) return null;

  const variant = normalizeIndividualMixAdminVariant(input.settings.individualMixVariant);
  if (variant === INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID) {
    const courts = Number(input.settings.courts ?? 2);
    if (courts !== 2) {
      return 'Для схемы «6 пар» нужны ровно 2 корта.';
    }

    const pointLimit = Number(input.settings.individualMixPointLimit ?? 11);
    if (pointLimit !== 11) {
      return 'В схеме «6 пар» все игры проводятся до 11 очков.';
    }

    const pairGender = String(input.settings.individualMixPairGender ?? 'W').toUpperCase() === 'M' ? 'M' : 'W';
    const expectedDivision = pairGender === 'W' ? 'Женский' : 'Мужской';
    if (input.division !== expectedDivision) {
      return `Для пар ${pairGender}/${pairGender} дивизион должен быть «${expectedDivision}».`;
    }

    if (input.capacity !== 12) {
      return 'Для схемы «6 пар» вместимость должна быть 12 игроков.';
    }

    const activeParticipants = input.participants
      .filter((participant) => !participant.isWaitlist)
      .sort((left, right) => left.position - right.position);
    if (activeParticipants.length !== 12) {
      return 'Для публикации схемы «6 пар» нужно распределить ровно 12 игроков.';
    }

    for (let index = 0; index < activeParticipants.length; index += 1) {
      if (activeParticipants[index]?.position !== index + 1) {
        return 'Места основного состава должны идти подряд без пропусков.';
      }
    }

    if (activeParticipants.some((participant) => participant.gender !== pairGender)) {
      return `Все 12 участников должны быть пола ${pairGender}.`;
    }

    return null;
  }

  const courts = Number(input.settings.courts ?? 2);
  if (!Number.isInteger(courts) || courts < 1 || courts > 4) {
    return 'Личный микст поддерживает от 1 до 4 кортов.';
  }

  const poolSize = Number(input.settings.individualMixPoolSize ?? 5);
  if (!Number.isInteger(poolSize) || ![4, 5, 6].includes(poolSize)) {
    return 'На каждом корте личного микста должно быть 4+4, 5+5 или 6+6 игроков.';
  }

  const pointLimit = Number(input.settings.individualMixPointLimit ?? 15);
  if (!Number.isInteger(pointLimit) || pointLimit < 5 || pointLimit > 30) {
    return 'Лимит очков личного микста должен быть от 5 до 30.';
  }

  if (input.division !== 'Микст') {
    return 'Для формата «Личный микст» дивизион должен быть «Микст».';
  }

  const playersPerCourt = poolSize * 2;
  const expectedCapacity = courts * playersPerCourt;
  if (input.capacity !== expectedCapacity) {
    return `Вместимость личного микста должна быть ${expectedCapacity} игроков.`;
  }

  const activeParticipants = input.participants
    .filter((participant) => !participant.isWaitlist)
    .sort((left, right) => left.position - right.position);
  if (activeParticipants.length !== expectedCapacity) {
    return `Для публикации личного микста нужно распределить ${expectedCapacity} игроков.`;
  }

  for (let index = 0; index < activeParticipants.length; index += 1) {
    if (activeParticipants[index]?.position !== index + 1) {
      return 'Места основного состава личного микста должны идти подряд без пропусков.';
    }
  }

  for (let court = 0; court < courts; court += 1) {
    const courtRoster = activeParticipants.slice(court * playersPerCourt, (court + 1) * playersPerCourt);
    const men = courtRoster.filter((participant) => participant.gender === 'M').length;
    const women = courtRoster.filter((participant) => participant.gender === 'W').length;
    if (men !== poolSize || women !== poolSize) {
      return `На корте ${court + 1} должно быть ${poolSize} мужчин и ${poolSize} женщин.`;
    }
  }

  return null;
}
