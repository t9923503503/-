"use client";

import Link from "next/link";
import { useState } from "react";
import HeaderAccountEntry from "./HeaderAccountEntry";

type NavLink = { href: string; label: string };

export default function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-text-primary/90 transition-colors hover:text-brand"
        aria-expanded={open}
        aria-label={
          open
            ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e"
            : "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e"
        }
      >
        <svg
          className="h-6 w-6"
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
          className="absolute left-0 right-0 top-16 z-50 border-b border-white/10 bg-surface"
          aria-label="\u041c\u043e\u0431\u0438\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f"
        >
          <ul className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="block py-2 font-body text-text-primary/90 transition-colors hover:text-brand"
                >
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <div onClick={() => setOpen(false)}>
                <HeaderAccountEntry mobile />
              </div>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
