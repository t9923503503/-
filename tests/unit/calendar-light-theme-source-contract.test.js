import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('calendar light-theme source contract', () => {
  it('pairs the light calendar typography with a light event-card surface', () => {
    const card = read('web/components/calendar/EventCard.tsx');
    const styles = read('web/app/globals.css');

    expect(card).toContain('calendar-event-card');
    expect(styles).toContain('html[data-theme="light"] .calendar-event-card');
    expect(styles).toMatch(
      /html\[data-theme="light"\] \.calendar-event-card\s*\{[^}]*background-color:\s*#fff;/s,
    );
    expect(styles).toMatch(
      /html\[data-theme="light"\] \.calendar-event-card\s*\{[^}]*border-color:\s*#cbd5e1;/s,
    );
    expect(styles).toMatch(
      /\.calendar-event-card \[class~="text-white\/45"\][^{]*\{[^}]*color:\s*#64748b;/s,
    );
  });
});
