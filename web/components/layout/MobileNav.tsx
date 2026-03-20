"use client";

import Link from "next/link";
import { useState } from "react";

type NavLink = { href: string; label: string };

export default function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-text-primary/90 hover:text-brand transition-colors"
        aria-expanded={open}
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {open ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {open && (
        <nav
          className="absolute left-0 right-0 top-16 bg-surface border-b border-white/10 z-50"
          aria-label="Мобильная навигация"
        >
          <ul className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-2">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-text-primary/90 hover:text-brand transition-colors font-body"
                >
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/sudyam"
                onClick={() => setOpen(false)}
                className="inline-block mt-2 px-4 py-2 rounded-lg bg-brand text-surface font-body font-semibold text-sm hover:bg-brand/90 transition-colors"
              >
                Судьям
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

