export default function About() {
  return (
    <section className="px-4 py-16 bg-surface-light/40">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-heading text-5xl md:text-6xl text-text-primary tracking-wide">
          О формате
        </h2>

        <div className="mt-10 max-w-3xl space-y-5 text-text-primary/85 font-body text-base sm:text-lg leading-relaxed">
          <p>
            <strong className="text-text-primary">King of the Court</strong>{' '}
            — формат пляжного волейбола, где команды сражаются за удержание
            корта. Побеждает пара, первой набравшая заданное количество очков.
          </p>
          <p>
            В «Лютых пляжниках» ты можешь смотреть рейтинги по категориям М/Ж/Микст,
            выбирать турнир в календаре и видеть результаты после завершения.
          </p>
        </div>
      </div>
    </section>
  );
}

