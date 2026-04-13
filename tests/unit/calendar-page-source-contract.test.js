import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('calendar tournament page source contract', () => {
  it('keeps public Russian labels readable on the tournament page', () => {
    const source = read('web/app/calendar/[id]/page.tsx');

    expect(source).toContain("return { title: 'Tournament | LPVOLLEY.RU' };");
    expect(source).toContain('function encodeHtmlEntities');
    expect(source).toContain('function EntityText');
    expect(source).toContain('Открыта запись');
    expect(source).toContain('Основной состав заполнен');
    expect(source).toContain('Турнир завершен');
    expect(source).toContain('Турнир отменен');
    expect(source).toContain('Дата уточняется');
    expect(source).toContain('Подать заявку в waitlist');
    expect(source).toContain('Подать заявку');
    expect(source).toContain('Статус');
    expect(source).toContain('Участники');
    expect(source).toContain('Свободные места');
    expect(source).toContain('Лист ожидания');
    expect(source).toContain('Ищут пару');
    expect(source).toContain('Формат');
    expect(source).toContain('Дивизион');
    expect(source).toContain('Уровень');
    expect(source).toContain('Для участника');
    expect(source).toContain('Регистрация закрыта');
    expect(source).toContain('Добавить в календарь');
    expect(source).toContain('Открыть карту');
    expect(source).toContain('Найти пару');
    expect(source).toContain('Афиша турнира');
    expect(source).toContain('Состав участников');
    expect(source).toContain('Похожие турниры');
  });

  it('does not regress back to mojibake strings seen on the live page', () => {
    const source = read('web/app/calendar/[id]/page.tsx');

    expect(source).not.toContain('Р›СЋС‚С‹Рµ РџР»СЏР¶РЅРёРєРё');
    expect(source).not.toContain('РћСЃРЅРѕРІРЅРѕР№ СЃРѕСЃС‚Р°РІ Р·Р°РїРѕР»РЅРµРЅ');
    expect(source).not.toContain('РЎС‚Р°С‚СѓСЃ');
    expect(source).not.toContain('РџРѕРґР°С‚СЊ Р·Р°СЏРІРєСѓ');
    expect(source).not.toContain('Р›РёСЃС‚ РѕР¶РёРґР°РЅРёСЏ');
    expect(source).not.toContain('в†ђ РљР°Р»РµРЅРґР°СЂСЊ');
  });
});
