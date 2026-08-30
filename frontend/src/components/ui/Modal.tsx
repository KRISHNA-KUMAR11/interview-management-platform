import { useEffect, useId } from 'react';
import type { FormEvent, ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Renders the panel as a form so submit buttons work naturally. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  wide?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  onSubmit,
  wide = false,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const panelClasses = ['live-create', 'modal-panel', wide ? 'modal-wide' : '']
    .filter(Boolean)
    .join(' ');

  const panelContent = (
    <>
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="ghost-btn sm"
          onClick={onClose}
          aria-label="Close dialog"
        >
          Close
        </button>
      </div>
      {children}
      {footer ? <div className="form-actions">{footer}</div> : null}
    </>
  );

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      {onSubmit ? (
        <form
          className={panelClasses}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
          onSubmit={onSubmit}
        >
          {panelContent}
        </form>
      ) : (
        <div
          className={panelClasses}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
        >
          {panelContent}
        </div>
      )}
    </div>
  );
}
