/**
 * The application's own navigation — distinct from the test strip above it.
 */

import Link from 'next/link';
import { logoutAction } from '@/server/actions/auth';

export interface NavItem {
  href: string;
  label: string;
  count?: number;
  alert?: boolean;
}

export function AppNav({
  title,
  subtitle,
  items,
  actor,
}: {
  title: string;
  subtitle: string;
  items: NavItem[];
  actor: string;
}) {
  return (
    <header className="kh-no-print border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <div>
          <div className="text-[15px] font-bold tracking-tight">{title}</div>
          <div className="text-[12px] text-[var(--color-muted)]">{subtitle}</div>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 font-semibold hover:bg-[var(--color-surface-alt)]"
              style={{ color: item.alert ? 'var(--color-danger)' : undefined }}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="ml-1.5 text-[var(--color-muted)] tabular-nums">{item.count}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-[var(--color-muted)]">
          <span>{actor}</span>
          <form action={logoutAction}>
            <button type="submit" className="kh-btn text-xs" data-testid="sign-out">
              Logi välja
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
