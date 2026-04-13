import type { ReactNode } from 'react';

export default function ProfileAccordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-xl border border-white/10 bg-surface-light/20"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5 md:p-4">
        <div>
          <h2 className="font-heading text-xl text-text-primary tracking-wide md:text-2xl">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-body text-text-secondary md:text-sm">{subtitle}</p>
          ) : null}
        </div>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-text-secondary transition-transform group-open:rotate-180 md:h-8 md:w-8">
          <svg
            className="h-3.5 w-3.5 md:h-4 md:w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>

      <div className="border-t border-white/10 p-3.5 md:p-4">{children}</div>
    </details>
  );
}
