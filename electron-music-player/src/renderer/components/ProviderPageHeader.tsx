import { RefreshCw } from 'lucide-react';
import type { RemoteProviderId } from '../../shared/musicTypes';
import { ProviderSegmentedControl } from './ProviderSegmentedControl';

interface ProviderPageHeaderProps {
  title: string;
  providerId: RemoteProviderId;
  sourceAriaLabel: string;
  isRefreshing: boolean;
  className?: string;
  onProviderChange?: (providerId: RemoteProviderId) => void;
  onRefresh?: () => void;
}

export function ProviderPageHeader({
  title,
  providerId,
  sourceAriaLabel,
  isRefreshing,
  className,
  onProviderChange,
  onRefresh
}: ProviderPageHeaderProps) {
  return (
    <header
      className={['provider-page-header', className].filter(Boolean).join(' ')}
      data-provider={providerId}
      aria-busy={isRefreshing || undefined}
    >
      <h1>{title}</h1>
      <div className="provider-page-toolbar">
        <ProviderSegmentedControl
          value={providerId}
          ariaLabel={sourceAriaLabel}
          onChange={onProviderChange}
        />
        <button
          className="provider-page-refresh"
          type="button"
          title={onRefresh ? `刷新${title}` : '当前来源暂无可刷新内容'}
          aria-label={isRefreshing
            ? `正在刷新${title}`
            : onRefresh
              ? `刷新${title}`
              : '当前来源暂无可刷新内容'}
          disabled={isRefreshing || !onRefresh}
          onClick={onRefresh}
        >
          <RefreshCw
            className={isRefreshing ? 'provider-page-refresh-icon provider-page-refresh-icon-active' : 'provider-page-refresh-icon'}
            aria-hidden="true"
            size={17}
          />
        </button>
      </div>
    </header>
  );
}
