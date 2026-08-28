import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Политика обработки персональных данных | LPVOLLEY.RU',
  description:
    'Политика LPVOLLEY.RU: какие персональные данные обрабатываются, для чего, как долго хранятся и как обратиться к оператору.',
  alternates: { canonical: 'https://lpvolley.ru/privacy' },
  openGraph: {
    title: 'Политика обработки персональных данных | LPVOLLEY.RU',
    description: 'Условия обработки персональных данных пользователей и игроков LPVOLLEY.RU.',
    url: 'https://lpvolley.ru/privacy',
    type: 'website',
    locale: 'ru_RU',
  },
};

const CONTACT_EMAIL = 'sv-ugra@mail.ru';

const CONTENTS = [
  ['general', 'Общие положения'],
  ['operator', 'Оператор и область действия'],
  ['data', 'Какие данные обрабатываются'],
  ['purposes', 'Цели и основания'],
  ['public-data', 'Публичные данные игроков'],
  ['services', 'Cookies и внешние сервисы'],
  ['retention', 'Сроки хранения и удаление'],
  ['rights', 'Права пользователя'],
  ['security', 'Защита данных'],
  ['changes', 'Изменение политики'],
] as const;

function PolicySection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-white/10 pt-8">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-400/10 font-heading text-sm text-cyan-300"
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="font-heading text-2xl uppercase tracking-wide text-text-primary sm:text-3xl">
            {title}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-7 text-text-secondary sm:text-base">{children}</div>
        </div>
      </div>
    </section>
  );
}

function DataCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <h3 className="font-heading text-lg uppercase tracking-wide text-text-primary">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.15),transparent_34%),radial-gradient(circle_at_top_right,rgba(255,90,0,0.16),transparent_32%),linear-gradient(180deg,rgba(10,13,20,0.98),rgba(7,11,20,0.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-8 lg:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-300/80">LPVOLLEY.RU · Legal</p>
        <h1 className="mt-4 max-w-4xl font-heading text-4xl uppercase leading-[0.95] tracking-wide text-white sm:text-6xl">
          Политика обработки персональных данных
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/72 sm:text-base">
          Простым языком о том, какие данные нужны волейбольному сервису, зачем они используются и как ими управлять.
          Сайт носит некоммерческий характер на дату этой редакции, но это не отменяет обязанность бережно обращаться с
          персональными данными.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/78">
          <span className="rounded-full border border-white/12 bg-white/5 px-4 py-2">
            Редакция: <time dateTime="2026-08-05">05.08.2026</time>
          </span>
          <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-orange-100">
            Telegram — вход и уведомления
          </span>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-3xl border border-white/10 bg-card p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] lg:sticky lg:top-24">
          <p className="font-heading text-lg uppercase tracking-wide text-text-primary">Содержание</p>
          <nav aria-label="Содержание политики" className="mt-4">
            <ol className="space-y-1">
              {CONTENTS.map(([id, label], index) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm text-text-secondary transition hover:bg-white/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <span className="w-5 shrink-0 font-heading text-xs text-cyan-400">{String(index + 1).padStart(2, '0')}</span>
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="rounded-3xl border border-white/10 bg-card p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-8 lg:p-10">
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-5 text-sm leading-7 text-text-secondary sm:text-base">
            <p className="font-semibold text-text-primary">Коротко</p>
            <p className="mt-2">
              Мы не продаём персональные данные. Email остаётся только для старых аккаунтов и восстановления доступа.
              Telegram можно выбрать добровольно на период тестирования. Для публичного входа через VK ID мы получаем
              только идентификатор пользователя и имя — без email и телефона; токен VK после входа не сохраняется.
              Удаление или исправление данных можно запросить по адресу{' '}
              <a className="font-semibold text-brand underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>

          <div className="mt-8 space-y-8">
            <PolicySection id="general" number="01" title="Общие положения">
              <p>
                Настоящая политика описывает обработку персональных данных на сайте{' '}
                <a className="text-brand underline underline-offset-4" href="https://lpvolley.ru">
                  lpvolley.ru
                </a>{' '}
                и в связанных с ним функциях: личном кабинете, карточках игроков, турнирах, рейтингах, поиске партнёра,
                уведомлениях и технической поддержке.
              </p>
              <p>
                Политика подготовлена с учётом Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных». Она
                информирует об обработке, но сама по себе не заменяет отдельное согласие там, где закон требует получить
                его отдельно — например, согласие на распространение персональных данных.
              </p>
              <p>
                Обработка включает сбор, запись, систематизацию, хранение, уточнение, извлечение, использование, передачу
                в предусмотренных этой политикой случаях, обезличивание, блокирование, удаление и уничтожение данных с
                применением средств автоматизации или без них.
              </p>
            </PolicySection>

            <PolicySection id="operator" number="02" title="Оператор и область действия">
              <div className="rounded-2xl border border-orange-400/25 bg-orange-400/[0.06] p-5">
                <p className="font-semibold text-text-primary">Оператор персональных данных</p>
                <p className="mt-1">Лебедев Александр Валентинович, физическое лицо.</p>
                <p>
                  Контакт для вопросов и обращений:{' '}
                  <a className="font-semibold text-brand underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </div>
              <p>
                Политика относится к посетителям сайта, владельцам аккаунтов, игрокам, участникам и заявителям турниров,
                пользователям поиска партнёра, а также судьям, организаторам и администраторам в части их работы с
                сервисом. Карточка игрока может быть создана организатором по данным турнира и до появления у игрока
                собственного аккаунта.
              </p>
              <p>
                Сервис не запрашивает специальные категории данных о здоровье, политических или религиозных взглядах и
                интимной жизни. Фотография используется как изображение профиля, а не для биометрической идентификации:
                распознавание лиц и установление личности по изображению не выполняются.
              </p>
              <p>
                Если данные предоставляет несовершеннолетний, согласие законного представителя запрашивается в случаях,
                когда оно требуется законом. Законный представитель может обратиться к оператору для проверки, исправления
                или удаления таких данных.
              </p>
            </PolicySection>

            <PolicySection id="data" number="03" title="Какие данные обрабатываются">
              <div className="grid gap-4 md:grid-cols-2">
                <DataCard
                  title="Аккаунт и вход"
                  items={[
                    'Имя и фамилия, внутренний идентификатор аккаунта и дата регистрации.',
                    'Email и хеш пароля — только для ранее созданных аккаунтов и восстановления доступа; пароль в открытом виде не хранится.',
                    'При добровольном входе через Telegram: Telegram user ID, username, имя и фамилия из профиля, идентификатор личного чата, статус привязки и время подтверждения.',
                    'Идентификаторы сессий, одноразовых входов, время входа и сведения о действиях безопасности.',
                  ]}
                />
                <DataCard
                  title="Игрок и соревнования"
                  items={[
                    'Имя, фамилия, пол, город, игровой уровень и уровень микст.',
                    'Фотография профиля и связь аккаунта с карточкой игрока.',
                    'Заявки на турниры и игры, составы, партнёры и соперники, статусы участия.',
                    'Матчи, счёт, результаты, рейтинг, статистика и история выступлений.',
                    'Сообщения и отклики в функциях поиска игры или партнёра.',
                  ]}
                />
                <DataCard
                  title="Обращения и уведомления"
                  items={[
                    'Текст обращения, выбранный канал связи, история решения вопроса.',
                    'Состояние доставки сервисных писем и добровольных Telegram-уведомлений.',
                    'Данные, которые пользователь сам сообщает оператору или модератору.',
                  ]}
                />
                <DataCard
                  title="Технические данные"
                  items={[
                    'IP-адрес, дата и время запроса, адрес страницы, источник перехода, код ответа.',
                    'Тип устройства, браузера и операционной системы, user-agent.',
                    'Cookies, идентификаторы сессии, события ошибок и журналы безопасности.',
                    'Обезличенные или агрегированные показатели использования сайта.',
                  ]}
                />
              </div>
              <p>
                Источники данных: сам пользователь, Telegram API при добровольном запуске входа, организаторы и судьи
                по итогам соревнований, а также автоматические технические журналы сайта. Email, пароль, Telegram ID и
                технические журналы не предназначены для публичного показа.
              </p>
            </PolicySection>

            <PolicySection id="purposes" number="04" title="Цели и правовые основания">
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                  <thead className="bg-white/[0.045] text-text-primary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Цель</th>
                      <th className="px-4 py-3 font-semibold">Основные данные</th>
                      <th className="px-4 py-3 font-semibold">Основание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    <tr className="align-top">
                      <td className="px-4 py-4 text-text-primary">Аккаунт, вход и восстановление доступа</td>
                      <td className="px-4 py-4">Идентификаторы, legacy email и хеш пароля, Telegram-данные, сессии</td>
                      <td className="px-4 py-4">Согласие и действия пользователя для получения выбранной функции</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 text-text-primary">Профиль, турниры, игры и рейтинг</td>
                      <td className="px-4 py-4">Карточка игрока, заявки, составы, результаты, статистика</td>
                      <td className="px-4 py-4">Согласие, участие по инициативе пользователя и правила соревнования</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 text-text-primary">Уведомления и поддержка</td>
                      <td className="px-4 py-4">Email или Telegram, содержание запроса, статус доставки</td>
                      <td className="px-4 py-4">Согласие либо необходимость ответить на обращение</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 text-text-primary">Безопасность и стабильность</td>
                      <td className="px-4 py-4">IP, user-agent, cookies, ошибки и журналы событий</td>
                      <td className="px-4 py-4">Законный интерес в защите сервиса и пользователей при соблюдении их прав</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 text-text-primary">Аналитика и улучшение интерфейса</td>
                      <td className="px-4 py-4">События посещения и агрегированные показатели</td>
                      <td className="px-4 py-4">Согласие на необязательную аналитику, когда оно требуется</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Дополнительными основаниями могут быть исполнение обязанности, установленной законом, защита прав в споре
                и законный интерес оператора, если такая обработка не нарушает права и свободы пользователя. Сервис не
                принимает на основе профиля полностью автоматизированных решений, порождающих юридические последствия.
                Спортивный рейтинг рассчитывается автоматически по результатам, но не влияет на юридические права.
              </p>
            </PolicySection>

            <PolicySection id="public-data" number="05" title="Публичные данные игроков">
              <p>
                Для работы рейтинга, календаря и истории соревнований публично могут отображаться имя и фамилия игрока,
                фотография, пол, город, уровень, участие в турнирах, составы, результаты, статистика, рейтинг и история
                игр. В поиске партнёра публикуются только сведения, выбранные для такого объявления.
              </p>
              <div className="rounded-2xl border border-orange-400/25 bg-orange-400/[0.06] p-5">
                <p className="font-semibold text-text-primary">Важно о распространении</p>
                <p className="mt-2">
                  Публичное размещение персональных данных выполняется при наличии отдельного применимого основания. Когда
                  требуется согласие на распространение, оно оформляется отдельно от согласия на обычную обработку и может
                  содержать ограничения. Одна только ссылка на эту политику такое согласие не заменяет.
                </p>
              </div>
              <p>
                Пользователь вправе попросить прекратить публичное размещение или установить ограничения. Оператор удаляет,
                скрывает либо обезличивает сведения в установленные законом сроки, если нет иного законного основания для
                сохранения конкретной записи. Удаление аккаунта не всегда требует уничтожить сам факт и итог уже проведённого
                турнира: при отсутствии основания для дальнейшей публикации запись может быть обезличена.
              </p>
            </PolicySection>

            <PolicySection id="services" number="06" title="Cookies, Telegram и внешние сервисы">
              <h3 className="font-heading text-lg uppercase tracking-wide text-text-primary">Обязательные cookies</h3>
              <ul className="space-y-2">
                <li>
                  <strong className="text-text-primary">Сессия аккаунта</strong> — поддерживает вход до 7 дней либо до выхода
                  из аккаунта.
                </li>
                <li>
                  <strong className="text-text-primary">Подтверждение недавнего входа</strong> — действует до 10 минут для
                  чувствительных действий.
                </li>
                <li>
                  <strong className="text-text-primary">Telegram login intent</strong> — связывает исходный браузер с
                  одноразовым подтверждением, действует до 10 минут.
                </li>
              </ul>
              <p>
                Эти cookies нужны для безопасности и авторизации. Они используют доступные браузеру ограничения Secure,
                HttpOnly и SameSite. Выбор светлой или тёмной темы может храниться локально в браузере. Удаление cookies
                завершит сессию или потребует войти заново.
              </p>

              <h3 className="pt-2 font-heading text-lg uppercase tracking-wide text-text-primary">Telegram: вход и уведомления</h3>
              <p>
                Telegram не обязателен. На период разработки входа через VK пользователь может добровольно открыть бота,
                получить одноразовый код, привязать Telegram к аккаунту и включить сервисные уведомления. Аккаунт без email
                создаётся только после явного подтверждения в исходном браузере. Привязку и уведомления можно отключить.
              </p>
              <p>
                При использовании бота Telegram получает и обрабатывает данные по собственным правилам, а сервис получает
                доступные через Telegram API сведения профиля и чата. Инфраструктура Telegram контролируется третьим лицом;
                эта политика не утверждает непроверенное местонахождение его серверов. Использование внешнего сервиса может
                повлечь трансграничную передачу, которая допускается только при выполнении применимых требований закона.
                Пользователь может заранее ознакомиться с{' '}
                <a
                  className="text-brand underline underline-offset-4"
                  href="https://telegram.org/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  политикой конфиденциальности Telegram
                </a>
                . Не следует отправлять боту документы, медицинские сведения и другую чувствительную информацию.
              </p>

              <h3 className="pt-2 font-heading text-lg uppercase tracking-wide text-text-primary">VK</h3>
              <p>
                Для входа через VK ID сайт получает постоянный идентификатор пользователя VK и отображаемые имя и
                фамилию. Email, номер телефона, список друзей и сообщения не запрашиваются. Токен доступа используется
                только для завершения входа и не сохраняется. VK ID можно подключить к существующему аккаунту после
                повторного подтверждения входа по email и паролю.
              </p>

              <h3 className="pt-2 font-heading text-lg uppercase tracking-wide text-text-primary">Яндекс Метрика</h3>
              <p>
                Яндекс Метрика может использоваться для статистики посещений и улучшения интерфейса только после включения
                необязательной аналитики. До появления отдельного механизма согласия Метрика отключена. После включения сервис может получать
                сведения о странице и переходе, устройстве, браузере, IP-адресе и собственные cookies согласно настройкам и{' '}
                <a
                  className="text-brand underline underline-offset-4"
                  href="https://yandex.ru/legal/confidential/"
                  target="_blank"
                  rel="noreferrer"
                >
                  политике конфиденциальности Яндекса
                </a>
                . Необязательные cookies можно ограничить в настройках браузера; это не должно препятствовать базовому
                просмотру сайта, но может повлиять на точность статистики.
              </p>

              <h3 className="pt-2 font-heading text-lg uppercase tracking-wide text-text-primary">Google Fonts и Яндекс Карты</h3>
              <p>
                Для оформления страниц браузер может загружать шрифты Google Fonts с серверов Google. На страницах игр с
                указанной площадкой может загружаться виджет Яндекс Карт. При таком запросе соответствующий внешний сервис
                технически получает IP-адрес, user-agent, адрес запрошенной страницы и иные стандартные сетевые сведения и
                обрабатывает их по собственным правилам. Карта не используется для определения текущей геопозиции пользователя.
                Подробнее:{' '}
                <a className="text-brand underline underline-offset-4" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                  политика Google
                </a>{' '}
                и{' '}
                <a className="text-brand underline underline-offset-4" href="https://yandex.ru/legal/confidential/" target="_blank" rel="noreferrer">
                  политика Яндекса
                </a>
                .
              </p>

              <h3 className="pt-2 font-heading text-lg uppercase tracking-wide text-text-primary">Кому ещё могут быть доступны данные</h3>
              <p>
                В необходимом объёме данные могут обрабатывать поставщики хостинга, базы данных, резервного копирования,
                почтовой доставки и технической поддержки; организаторы и модераторы соревнований; а также государственные
                органы, если передача обязательна по закону. Публичные сведения доступны посетителям интернета. Обработчикам
                передаются только данные, необходимые для их задачи, на условиях конфиденциальности и защиты данных.
              </p>
              <p>
                Оператор не продаёт персональные данные. Непроверенные сведения о конкретной географии серверов оператора или
                внешних поставщиков в политике не публикуются; при выборе и использовании инфраструктуры оператор обязан
                учитывать требования к локализации и трансграничной передаче.
              </p>
            </PolicySection>

            <PolicySection id="retention" number="07" title="Сроки хранения и удаление">
              <ul className="space-y-3">
                <li>
                  <strong className="text-text-primary">Аккаунт и карточка игрока:</strong> пока существует аккаунт или пока
                  данные нужны для выбранных функций; после подтверждённого запроса на удаление — в сроки, установленные
                  законом, если нет иного основания для хранения.
                </li>
                <li>
                  <strong className="text-text-primary">Одноразовый Telegram-вход:</strong> код и browser intent действуют не
                  более 10 минут. Код хранится только в виде криптографического значения; просроченные записи удаляются при
                  регламентной очистке.
                </li>
                <li>
                  <strong className="text-text-primary">Турнирные заявки и переписка:</strong> до завершения соответствующей
                  игры или рассмотрения обращения; затем записи периодически пересматриваются и удаляются, если они больше
                  не нужны для спортивного архива, разрешения спора или исполнения закона.
                </li>
                <li>
                  <strong className="text-text-primary">Результаты и рейтинг:</strong> пока поддерживается спортивный архив и
                  сохраняется общественно значимая история соревнований; при прекращении применимого основания данные
                  удаляются либо обезличиваются.
                </li>
                <li>
                  <strong className="text-text-primary">Обычные технические журналы:</strong> в течение срока, необходимого
                  для диагностики и защиты сервиса, с периодическим пересмотром и очисткой. Записи, связанные с инцидентом
                  безопасности, спором или обязанностью по закону, могут храниться дольше до закрытия соответствующей цели.
                </li>
                <li>
                  <strong className="text-text-primary">Резервные копии:</strong> до перезаписи по циклу резервного
                  копирования. Они изолированы от обычного использования; при восстановлении запрос на удаление применяется
                  повторно.
                </li>
              </ul>
              <p>
                По достижении цели либо при утрате основания данные удаляются, уничтожаются или обезличиваются. При отзыве
                согласия уничтожение выполняется не позднее установленного законом срока — обычно до 30 дней, если обработка
                не может быть продолжена на другом законном основании.
              </p>
            </PolicySection>

            <PolicySection id="rights" number="08" title="Права пользователя и отзыв согласия">
              <p>Пользователь или его законный представитель вправе:</p>
              <ul className="space-y-2">
                {[
                  'узнать, обрабатываются ли его данные, для каких целей, откуда они получены и кому доступны;',
                  'получить копию своих данных в объёме, допускаемом законом;',
                  'потребовать уточнить, заблокировать или удалить неполные, устаревшие, неточные либо неправомерно полученные данные;',
                  'отозвать согласие и потребовать прекратить обработку, если нет другого законного основания;',
                  'потребовать прекратить публичное распространение данных;',
                  'обжаловать действия оператора в Роскомнадзоре или суде.',
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-5">
                <p className="font-semibold text-text-primary">Как обратиться</p>
                <p className="mt-2">
                  Напишите на{' '}
                  <a className="font-semibold text-brand underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>{' '}
                  с темой «Персональные данные». Укажите имя, связанный с аккаунтом email или Telegram username и суть
                  требования. Не присылайте пароль или одноразовый код. Для защиты от чужого запроса оператор может попросить
                  безопасно подтвердить связь с аккаунтом.
                </p>
              </div>
              <p>
                Ответ предоставляется в срок до 10 рабочих дней; при допустимом законом продлении пользователь получает
                мотивированное уведомление. Требование о прекращении обработки исполняется в предусмотренный законом срок,
                если отсутствует основание продолжать её без согласия. Отзыв согласия не делает незаконной обработку,
                выполненную до отзыва, и может сделать недоступными аккаунт, уведомления или участие в отдельных функциях.
              </p>
            </PolicySection>

            <PolicySection id="security" number="09" title="Меры защиты и действия при инциденте">
              <p>
                С учётом характера данных и доступных технологий применяются организационные и технические меры: разграничение
                прав доступа, защищённое соединение, хеширование паролей, короткоживущие одноразовые коды, защищённые cookies,
                проверка входных данных, ограничение частоты запросов, резервное копирование, журналирование событий
                безопасности, обновление компонентов и ограничение доступа администраторов.
              </p>
              <p>
                Ни один интернет-сервис не может гарантировать абсолютную безопасность. При подтверждённом инциденте оператор
                ограничивает доступ, выясняет объём затронутых данных, устраняет причину и выполняет предусмотренные законом
                уведомления. О подозрительном входе или раскрытии данных следует сразу сообщить на{' '}
                <a className="text-brand underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </PolicySection>

            <PolicySection id="changes" number="10" title="Изменение политики">
              <p>
                Политика может меняться при запуске новых функций, смене поставщиков или требований закона. Актуальная версия
                всегда размещается по адресу{' '}
                <a className="text-brand underline underline-offset-4" href="https://lpvolley.ru/privacy">
                  https://lpvolley.ru/privacy
                </a>
                . Для существенных изменений указывается новая дата редакции и, когда это необходимо, запрашивается новое
                согласие. Продолжение использования сайта само по себе не заменяет согласие, которое закон требует оформить
                отдельно.
              </p>
              <p>
                Текущая редакция действует с <time dateTime="2026-08-05">5 августа 2026 года</time>.
              </p>
            </PolicySection>
          </div>
        </article>
      </div>
    </main>
  );
}
