interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, display: 'block' }}
      aria-hidden="true"
    />
  );
}

/** Placeholder cards shown while a list is loading. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-card">
          <Skeleton height="14px" width="45%" />
          <Skeleton height="12px" width="70%" />
          <Skeleton height="12px" width="30%" />
        </div>
      ))}
    </div>
  );
}
