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
        aria-label={
          open
            ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e"
            : "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e"
        }
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
          aria-label="\u041c\u043e\u0431\u0438\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f"
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
              <div className="mt-2 flex gap-2">
                <Link
                  href="/court"
                  onClick={() => setOpen(false)}
                  className="inline-block px-4 py-2 rounded-lg bg-brand text-surface font-body font-semibold text-sm hover:bg-brand/90 transition-colors"
                >
                  {"\u0421\u0443\u0434\u044c\u044f\u043c"}
                </Link>
                <Link
                  href="/admin/login"
                  onClick={() => setOpen(false)}
                  className="inline-block px-4 py-2 rounded-lg border border-brand/40 text-brand font-body font-semibold text-sm hover:bg-brand/10 transition-colors"
                >
                  {"\u0410\u0434\u043c\u0438\u043d"}
                </Link>
              </div>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
