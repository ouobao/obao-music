import { ChevronRight, Play, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export type DiscoverySectionActionIcon = 'more' | 'play' | 'refresh';

export interface DiscoverySectionAction {
  label: string;
  icon: DiscoverySectionActionIcon;
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export interface DiscoverySectionHeaderProps {
  headingId: string;
  title: string;
  description?: string;
  control?: ReactNode;
  actions?: readonly DiscoverySectionAction[];
}

export function DiscoverySectionHeader({
  headingId,
  title,
  description,
  control,
  actions = []
}: DiscoverySectionHeaderProps) {
  return (
    <header className="discovery-section-header">
      <div className="discovery-section-heading">
        <h2 id={headingId}>{title}</h2>
        {description ? <p className="discovery-section-description">{description}</p> : null}
      </div>
      {control || actions.length > 0 ? (
        <div className="discovery-section-actions">
          {control}
          {actions.map((action) => (
            <button
              className="discovery-section-action"
              type="button"
              title={action.label}
              aria-label={action.label}
              disabled={action.disabled || !action.onClick}
              key={`${action.icon}:${action.label}`}
              onClick={action.onClick}
            >
              <DiscoverySectionActionIcon icon={action.icon} isLoading={action.isLoading} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function DiscoverySectionActionIcon({ icon, isLoading = false }: { icon: DiscoverySectionActionIcon; isLoading?: boolean }) {
  if (icon === 'play') {
    return <Play aria-hidden="true" size={14} fill="currentColor" />;
  }
  if (icon === 'refresh') {
    return <RefreshCw className={isLoading ? 'discovery-section-action-icon-loading' : ''} aria-hidden="true" size={14} />;
  }
  return <ChevronRight aria-hidden="true" size={15} />;
}
