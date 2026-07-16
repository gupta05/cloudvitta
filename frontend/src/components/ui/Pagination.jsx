import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Shared pagination: Prev / "Page X of Y" / Next.
 * Renders nothing when there's only one page.
 */
export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 mt-6" aria-label="Pagination">
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="text-sm text-cv-text-secondary">
        Page {page} of {totalPages}
      </span>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next <ChevronRight size={14} />
      </button>
    </nav>
  );
}
