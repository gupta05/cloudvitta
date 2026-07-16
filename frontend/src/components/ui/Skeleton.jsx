/** Shimmer placeholder block. Pass width/height via className (e.g. "h-4 w-24"). */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/**
 * Skeleton rows for .data-table bodies while a list loads.
 * Usage: <tbody><TableSkeleton rows={5} cols={4} /></tbody>
 */
export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <Skeleton className={`h-4 ${c === 0 ? 'w-40 max-w-full' : 'w-20'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
