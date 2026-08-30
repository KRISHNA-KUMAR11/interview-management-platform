interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Builds a compact page list such as [1, '…', 4, 5, 6, '…', 20]. */
function buildPages(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | '…'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);

  if (start > 2) pages.push('…');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('…');

  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        {firstItem}–{lastItem} of {total}
      </span>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-page"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          &lsaquo;
        </button>

        {buildPages(page, totalPages).map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="pagination-info">
              &hellip;
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`pagination-page${entry === page ? ' active' : ''}`}
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          className="pagination-page"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          &rsaquo;
        </button>
      </div>
    </nav>
  );
}
