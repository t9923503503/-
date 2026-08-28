import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'web/app/privacy/page.tsx'), 'utf8');
const layoutSource = fs.readFileSync(path.join(process.cwd(), 'web/app/layout.tsx'), 'utf8');
const footerSource = fs.readFileSync(path.join(process.cwd(), 'web/components/layout/Footer.tsx'), 'utf8');
const sitemapSource = fs.readFileSync(path.join(process.cwd(), 'web/app/sitemap.ts'), 'utf8');

describe('/privacy policy source contract', () => {
  it('publishes the real operator contact and revision without invented business details', () => {
    expect(source).toContain("canonical: 'https://lpvolley.ru/privacy'");
    expect(source).toContain('Лебедев Александр Валентинович, физическое лицо');
    expect(source).toContain("const CONTACT_EMAIL = 'sv-ugra@mail.ru'");
    expect(source).toContain('dateTime="2026-08-05"');
    expect(source).toContain('05.08.2026');
    expect(source).not.toMatch(/ОГРНИП|ИНН|домашн(?:ий|его) адрес/i);
  });

  it('covers the data actually used by the application', () => {
    for (const marker of [
      'legacy email и хеш пароля',
      'Telegram user ID',
      'карточках игроков',
      'Фотография профиля',
      'пол, город, игровой уровень',
      'Матчи, счёт, результаты, рейтинг',
      'Cookies, идентификаторы сессии',
      'технические журналы',
      'Яндекс Метрика',
      'Google Fonts и Яндекс Карты',
    ]) {
      expect(source).toContain(marker);
    }
  });

  it('describes voluntary Telegram use and the active minimal-data VK ID flow', () => {
    expect(source).toContain('Telegram можно выбрать добровольно на период тестирования');
    expect(source).toContain('При добровольном входе через Telegram');
    expect(source).toContain('Непроверенные сведения о конкретной географии серверов');
    expect(source).toContain('Для входа через VK ID сайт получает постоянный идентификатор пользователя VK');
    expect(source).toContain('Токен доступа используется');
    expect(source).toContain('только для завершения входа и не сохраняется');
  });

  it('states retention, deletion, rights and separate public-data consent', () => {
    expect(source).toContain('Обычные технические журналы:');
    expect(source).toContain('с периодическим пересмотром и очисткой');
    expect(source).toContain('обычно до 30 дней');
    expect(source).toContain('Ответ предоставляется в срок до 10 рабочих дней');
    expect(source).toContain('согласие на распространение');
    expect(source).toContain('Одна только ссылка на эту политику такое согласие не заменяет');
  });

  it('keeps optional analytics disabled until it is explicitly enabled', () => {
    expect(layoutSource).toContain("process.env.YANDEX_METRIKA_ENABLED === 'true'");
    expect(source).toContain('До появления отдельного механизма согласия Метрика отключена');
  });

  it('publishes the policy from persistent site navigation and the sitemap', () => {
    expect(footerSource).toContain('href="/privacy"');
    expect(sitemapSource).toContain("path: '/privacy'");
  });
});
