import type { ReactNode } from 'react';

interface StatusPillProps {
  /** Raw status such as `IN_PROGRESS`; lower-cased into the matching CSS class. */
  status?: string;
  className?: string;
  children: ReactNode;
}

export function StatusPill({ status, className, children }: StatusPillProps) {
  const classes = ['status-pill', status?.toLowerCase(), className]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
