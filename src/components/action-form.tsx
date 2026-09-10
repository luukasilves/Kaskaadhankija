'use client';

/**
 * Form wrappers for server actions.
 *
 * Every mutation in the app reports an `ActionOutcome`, and these render it in
 * place — a confirmation, or the reason it was refused. That matters here more
 * than in most apps: the engine deliberately *refuses* things (a late
 * confirmation, an adjustment without a justification, a training already in a
 * round), and the person needs to read why rather than meet a blank page.
 */

import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionOutcome } from '@/server/actions/helpers';

type ServerAction<T> = (form: FormData) => Promise<ActionOutcome<T>>;

export function OutcomeMessage({ outcome }: { outcome: ActionOutcome<unknown> | null }) {
  if (!outcome) return null;
  const good = outcome.ok;
  return (
    <p
      role="status"
      data-testid={good ? 'action-ok' : 'action-error'}
      className="mt-2 rounded-md border px-3 py-2 text-[13px] font-semibold"
      style={{
        borderColor: good ? 'var(--color-success)' : 'var(--color-danger)',
        background: good ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
        color: good ? 'var(--color-success)' : 'var(--color-danger)',
      }}
    >
      {outcome.message}
    </p>
  );
}

/**
 * A form whose submit calls a server action and shows the result.
 *
 * `confirm` puts a browser confirmation in front of irreversible steps —
 * publishing a round to every partner, and confirming an allocation, both of
 * which cannot be undone.
 */
export function ActionForm<T>({
  action,
  children,
  submitLabel,
  variant = 'default',
  confirm,
  disabled,
  className,
  hidden,
  onDone,
  testId,
  submitTitle,
}: {
  action: ServerAction<T>;
  children?: React.ReactNode;
  submitLabel: string;
  variant?: 'default' | 'primary' | 'success' | 'danger';
  confirm?: string;
  disabled?: boolean;
  className?: string;
  /** fixed values submitted with the form */
  hidden?: Record<string, string | number | undefined>;
  onDone?: (outcome: ActionOutcome<T>) => void;
  testId?: string;
  /** tooltip for a button whose label is an arrow or an icon */
  submitTitle?: string;
}) {
  const [outcome, formAction, pending] = useActionState<ActionOutcome<T> | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );
  const notified = useRef<ActionOutcome<T> | null>(null);

  useEffect(() => {
    if (outcome && onDone && notified.current !== outcome) {
      notified.current = outcome;
      onDone(outcome);
    }
  }, [outcome, onDone]);

  const variantClass =
    variant === 'primary'
      ? 'kh-btn kh-btn-primary'
      : variant === 'success'
        ? 'kh-btn kh-btn-success'
        : variant === 'danger'
          ? 'kh-btn kh-btn-danger'
          : 'kh-btn';

  return (
    <form
      action={formAction}
      className={className}
      data-testid={testId}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value === undefined ? null : (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ),
      )}
      {children}
      <button
        type="submit"
        className={variantClass}
        disabled={pending || disabled}
        title={submitTitle}
      >
        {pending ? 'Töötleb…' : submitLabel}
      </button>
      <OutcomeMessage outcome={outcome} />
    </form>
  );
}

/**
 * A single-button action with an optional required justification.
 *
 * The engine refuses a skip or a cap without one, so the field is part of the
 * control rather than something a page might forget [T-02].
 */
export function ActionButton<T>({
  action,
  label,
  hidden,
  variant = 'default',
  confirm,
  reasonLabel,
  reasonRequired = false,
  reasonName = 'reason',
  reasonPlaceholder,
  extraFields,
  disabled,
  testId,
  title,
}: {
  action: ServerAction<T>;
  label: string;
  hidden?: Record<string, string | number | undefined>;
  variant?: 'default' | 'primary' | 'success' | 'danger';
  confirm?: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  reasonName?: string;
  reasonPlaceholder?: string;
  extraFields?: React.ReactNode;
  disabled?: boolean;
  testId?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(!reasonLabel);

  if (reasonLabel && !open) {
    return (
      <button
        type="button"
        className="kh-btn"
        onClick={() => setOpen(true)}
        data-testid={testId}
        title={title}
      >
        {label}
      </button>
    );
  }

  return (
    <ActionForm
      action={action}
      submitLabel={label}
      variant={variant}
      confirm={confirm}
      hidden={hidden}
      disabled={disabled}
      testId={testId}
      submitTitle={title}
      className="space-y-2"
    >
      {extraFields}
      {reasonLabel && (
        <label className="block">
          <span className="text-[12.5px] font-semibold">{reasonLabel}</span>
          <textarea
            name={reasonName}
            required={reasonRequired}
            rows={2}
            maxLength={400}
            placeholder={reasonPlaceholder ?? 'Põhjendus jääb hanke auditijälge'}
            className="kh-input mt-1"
          />
        </label>
      )}
    </ActionForm>
  );
}

/** A details/summary disclosure, for actions that should not be one click away. */
export function Disclosure({
  summary,
  children,
  tone = 'default',
}: {
  summary: string;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <details className="kh-card p-3">
      <summary
        className="cursor-pointer font-semibold"
        style={{ color: tone === 'danger' ? 'var(--color-danger)' : undefined }}
      >
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
