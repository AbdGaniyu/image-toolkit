import type { ReactNode } from "react";

/** Plain-language error under the stage: never a modal. */
export default function InlineError({
  message,
  onDismiss,
  action,
}: {
  message: string;
  onDismiss?: () => void;
  /** An extra button, e.g. "Try again". */
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-100)] p-3 text-[13px] leading-[1.45] text-[var(--color-accent-800)]"
    >
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" className="mt-px flex-none">
        <path d="M12 8v5" />
        <path d="M12 16.5v.5" />
        <path d="M12 3l9 18H3z" />
      </svg>
      <div className="flex-1">{message}</div>
      {action}
      {onDismiss && (
        <button type="button" className="btn btn-ghost px-1 py-0 text-[var(--color-accent-800)]" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
