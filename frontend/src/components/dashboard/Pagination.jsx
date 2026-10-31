import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageRange } from "../../utils/dashboardState";

/** Previous / Next controls with a "Page 2 of 5 · Showing 21–40 of 93" readout. */
export default function Pagination({ page, pageSize, total, hasMore, onPageChange }) {
  const { totalPages, first, last } = pageRange(total, page, pageSize);

  return (
    <nav className="pagination" aria-label="Article pagination">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft className="icon icon--sm" />
        <span className="pagination__btn-label">Previous</span>
      </button>

      <span className="pagination__status">
        Page {page} of {totalPages}
        <span className="pagination__range">
          Showing {first}–{last} of {total}
        </span>
      </span>

      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasMore}
      >
        <span className="pagination__btn-label">Next</span>
        <ChevronRight className="icon icon--sm" />
      </button>
    </nav>
  );
}
