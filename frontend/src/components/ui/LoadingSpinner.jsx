/**
 * Reusable centred loading spinner.
 * size: 'sm' (w-6, py-10 container) | 'md' (w-8, h-64 container — default).
 */
export default function LoadingSpinner({ size = 'md' }) {
  const spinner = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const container = size === 'sm' ? 'py-10' : 'h-64';
  return (
    <div className={`flex items-center justify-center ${container}`} role="status" aria-label="Loading">
      <div className={`${spinner} border-2 border-cv-primary border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}
