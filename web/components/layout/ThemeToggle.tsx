'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lpvolley-theme';
type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'light' ? '#f8fafc' : '#070b14'
  );
}

export default function ThemeToggle({ placement = 'floating' }: { placement?: 'floating' | 'menu' }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const initial = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const nextLabel = nextTheme === 'light' ? 'светлую' : 'тёмную';

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${placement}`}
      aria-label={`Включить ${nextLabel} тему`}
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
        try {
          window.localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
          // Theme still works when storage is unavailable.
        }
      }}
    >
      <span className="theme-toggle__icon" aria-hidden="true">{nextTheme === 'light' ? '☀️' : '🌙'}</span>
      <span className="theme-toggle__label">{nextTheme === 'light' ? 'Светлая' : 'Тёмная'}</span>
    </button>
  );
}
