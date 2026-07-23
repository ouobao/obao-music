import { RefreshCw } from 'lucide-react';
import type { RemoteProviderId } from '../../../shared/musicTypes';
import { ProviderSegmentedControl } from '../ProviderSegmentedControl';

export interface DiscoveryHomeHeaderProps {
  providerId: RemoteProviderId;
  isRefreshing: boolean;
  onProviderChange?: (providerId: RemoteProviderId) => void;
  onRefresh?: () => void;
}

export function DiscoveryHomeHeader({
  providerId,
  isRefreshing,
  onProviderChange,
  onRefresh
}: DiscoveryHomeHeaderProps) {
  return (
    <header className="discovery-home-header" data-provider={providerId} aria-busy={isRefreshing || undefined}>
      <h1>发现音乐</h1>
      <div className="discovery-home-toolbar">
        <ProviderSegmentedControl
          value={providerId}
          ariaLabel="发现音乐来源"
          onChange={onProviderChange}
        />
        <button
          className="discovery-home-refresh"
          type="button"
          title={onRefresh ? '刷新当前来源' : '当前来源暂无可刷新内容'}
          aria-label={isRefreshing
            ? '正在刷新发现音乐'
            : onRefresh
              ? '刷新发现音乐'
              : '当前来源暂无可刷新内容'}
          disabled={isRefreshing || !onRefresh}
          onClick={onRefresh}
        >
          <RefreshCw
            className={isRefreshing ? 'discovery-home-refresh-icon discovery-home-refresh-icon-active' : 'discovery-home-refresh-icon'}
            aria-hidden="true"
            size={17}
          />
        </button>
      </div>
    </header>
  );
}
