const features = [
  {
    title: 'Рейтинги',
    description:
      'Публичные таблицы по категориям М, Ж и Микст: место, очки и победы.',
    icon: '📊',
  },
  {
    title: 'Партнёр',
    description: 'Напарники меняются — рейтинг считается индивидуально.',
    icon: '🤝',
  },
  {
    title: 'Live',
    description: 'Результаты турниров обновляются сразу после завершения.',
    icon: '⚡',
  },
  {
    title: 'Календарь',
    description:
      'Все ближайшие события: дата, локация, формат и статус записи.',
    icon: '📅',
  },
];

export default function Features() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-heading text-5xl md:text-6xl text-text-primary tracking-wide text-center">
          Возможности
        </h2>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-surface-light/30 border border-white/10 rounded-xl p-6 hover:border-brand/50 transition-colors"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-heading text-2xl text-text-primary">
                {f.title}
              </h3>
              <p className="mt-3 text-text-primary/70 font-body text-sm leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

