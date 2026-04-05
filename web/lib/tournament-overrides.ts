import type { Tournament } from './types';

const DOUBLE_TROUBLE_ID = '15fd75c8-3f0c-4973-9c9e-d9134aa6a60d';

const doubleTroubleLineup = [
  '1. Президент 🤑',
  '2. Жорик 🤑',
  '3. Смирнов 🤑',
  '4. Терехов 🤑',
  '5. Жидков',
  '6. Шперлинг 🤑',
  '7. Когалымский 🤑',
  '8. Наумчук 📞',
  '9. Привет 🤑',
  '10. Камалов',
  '11. Соболев',
  '12. Лебедев 🤑',
  '13. Майлыбаев',
  '14. Никифоров 🤑',
  '15. Володя 🤑',
  '16. Артиков',
  '17. Степанян 🤑',
  '18. Рогожкин А',
  '19. Пекшев',
  '20. Салим',
  '21. Грузин 🤑',
  '22. Андрей / до 30.03 жду',
  '23. Салмин М',
  '24. Шерметов',
  '25. Фатин Павел',
  '26. Гадаборшев',
  '27. Паничкин',
  '28. Шелгачев А',
  '29. Пивин',
  '30. Надымов Н',
  '31. Александр',
  '32. Килатов!!',
].join('\n');

const doubleTroubleDescription = [
  '⚡️ Формат «Double Trouble» ⚡️',
  '📍 Место: 4 корта — игра нон-стоп',
  '',
  '🔹 32 мужчины',
  '🔹 8 туров — быстрая смена партнёров и соперников!',
  '🏐 Тайский партии:',
  '• 1-й круг — до 12 очков',
  '• 2-й тур — до 15 очков',
  '',
  '🏆 Победитель будет только один в категориях Hard, Advance, Medium, Lite',
  '',
  '🔥 Не пропустите шанс побороться за победу с самыми крутыми!',
  '🎁 Призы и подарки',
  '📸 Фотограф на турнире',
  '',
  '📅 4 апреля | МАЛИБУ',
  '🕗 Время: 20:00–22:00',
  '💰 Участие: 1300',
  '',
  '⚡️ Каждый сам за себя!',
  '• Два тура, в каждом — разные напарники',
  '• Всего до 8 разных партнёров',
  '💪 Проверка скилла, адаптации и характера',
  '🤝 Никаких постоянных связок — только ты и твоя игра',
  '🔥 Максимальный драйв и борьба за каждое очко',
  'Собираем сильнейших — будет жарко! 🔥',
].join('\n');

const tournamentOverrides: Record<string, Partial<Tournament>> = {
  [DOUBLE_TROUBLE_ID]: {
    name: 'Double Trouble | МАЛИБУ',
    date: '2026-04-04',
    time: '20:00–22:00',
    location: 'МАЛИБУ',
    format: 'Double Trouble',
    division: 'Мужской',
    level: 'hard',
    capacity: 32,
    participantCount: 32,
    status: 'full',
    description: doubleTroubleDescription,
    participantListText: doubleTroubleLineup,
  },
};

export function getTournamentOverride(id: string): Partial<Tournament> | null {
  return tournamentOverrides[id] ?? null;
}

export function applyTournamentOverride<T extends Tournament | null>(tournament: T): T {
  if (!tournament) return tournament;
  const patch = tournamentOverrides[tournament.id];
  if (!patch) return tournament;
  return { ...tournament, ...patch } as T;
}

export function applyTournamentOverrides(tournaments: Tournament[]): Tournament[] {
  return tournaments.map((tournament) => applyTournamentOverride(tournament)).filter(Boolean) as Tournament[];
}
