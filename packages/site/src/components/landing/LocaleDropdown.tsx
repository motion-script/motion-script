import React, { useEffect, useRef, useState } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { useAlternatePageUtils } from '@docusaurus/theme-common/internal';
import { useLocation } from '@docusaurus/router';

// Modern "Google Translate"-style locale switcher for the landing-page Navbar.
// Renders a globe + label pill; the menu lists every configured i18n locale and
// links to the equivalent path in that locale (Docusaurus serves /<locale>/...
// for non-default locales, falling back to English until a locale is
// translated). Kept visually in sync with the docs navbar `localeDropdown`
// (styled via `.navbar__locale-dropdown` in custom.css).
export default function LocaleDropdown({ className = '' }: { className?: string }) {
  const {
    i18n: { currentLocale, locales, localeConfigs },
  } = useDocusaurusContext();
  const alternatePageUtils = useAlternatePageUtils();
  const { search, hash } = useLocation();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Single locale configured → nothing to switch to, hide the control.
  if (locales.length <= 1) return null;

  const currentLabel = localeConfigs[currentLocale]?.label ?? currentLocale;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
      >
        <GlobeIcon className="h-4 w-4" />
        <span>{currentLabel}</span>
        <ChevronIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 min-w-44 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-xl p-1.5 shadow-lg z-50"
        >
          {locales.map((locale) => {
            const label = localeConfigs[locale]?.label ?? locale;
            const active = locale === currentLocale;
            // Equivalent path in the target locale, preserving query + hash.
            const to = alternatePageUtils.createUrl({ locale, fullyQualified: false }) + search + hash;
            return (
              <a
                key={locale}
                href={to}
                role="option"
                aria-selected={active}
                lang={locale}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm no-underline hover:no-underline transition-colors ${
                  active
                    ? 'text-[var(--foreground)] bg-[var(--foreground)]/10'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
                }`}
              >
                <span>{label}</span>
                {active && <CheckIcon className="h-4 w-4 shrink-0" />}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" />
    </svg>
  );
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
