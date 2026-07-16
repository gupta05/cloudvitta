import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Canonical page header: h1 title (+ optional subtitle) with an actions slot.
 * backTo renders the back-arrow variant used on detail pages.
 * titleIcon: optional lucide icon rendered inline before the title.
 */
export default function PageHeader({ title, subtitle, backTo, titleIcon: TitleIcon, actions }) {
  const heading = (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {TitleIcon && <TitleIcon size={20} className="text-cv-primary shrink-0" />}
        <h1 className="text-2xl font-bold text-cv-text truncate">{title}</h1>
      </div>
      {subtitle && <p className="text-cv-text-secondary text-sm mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      {backTo ? (
        <div className="flex items-center gap-3 min-w-0">
          <Link to={backTo} className="icon-btn shrink-0" aria-label="Go back">
            <ArrowLeft size={20} />
          </Link>
          {heading}
        </div>
      ) : (
        heading
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
