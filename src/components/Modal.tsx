import { useCallback, useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class for the panel. Defaults to a comfortable form width. */
  widthClass?: string;
  /** Extra header content (e.g. a subtitle) rendered next to the title. */
  headerExtra?: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Accessible modal dialog: role="dialog" + aria-modal, labelled by its title,
 * dismissable via Escape or backdrop click, with focus moved inside on open,
 * a Tab focus-trap, and focus restored to the trigger on close.
 */
export function Modal({
  title,
  titleId,
  onClose,
  children,
  widthClass = 'max-w-xl',
  headerExtra
}: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first focusable control, falling back to the panel itself.
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables && focusables.length > 0 ? focusables[0] : panel)?.focus();

    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`surface popover w-full ${widthClass} max-h-[88vh] overflow-y-auto rounded-2xl p-5 outline-none`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold">
              {title}
            </h3>
            {headerExtra}
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="icon-btn shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
