import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppNotificationValue } from '../../hooks/useAppNotificationValue';

export interface DiscoverySectionStatus {
  isLoading: boolean;
  errorMessage: string | null;
}

export interface DiscoverySectionStateProps extends DiscoverySectionStatus {
  isEmpty: boolean;
  loadingLabel: string;
  loadingPlaceholder?: ReactNode;
  emptyMessage: string;
  children: ReactNode;
}

export function DiscoverySectionState({
  isLoading,
  errorMessage,
  isEmpty,
  loadingLabel,
  loadingPlaceholder,
  emptyMessage,
  children
}: DiscoverySectionStateProps) {
  const isInitialLoading = isLoading && isEmpty;
  useAppNotificationValue({
    key: `discovery-section:${loadingLabel}`,
    message: errorMessage
  });

  return (
    <div className="discovery-section-state" aria-busy={isLoading || undefined}>
      {isInitialLoading && loadingPlaceholder ? (
        <>
          <div className="discovery-section-loading-placeholder" aria-hidden="true">
            {loadingPlaceholder}
          </div>
          <p className="visually-hidden" role="status">{loadingLabel}</p>
        </>
      ) : null}
      {isInitialLoading && !loadingPlaceholder ? (
        <p className="discovery-section-message discovery-section-message-loading" role="status">
          <LoaderCircle className="discovery-section-loader" aria-hidden="true" size={17} />
          <span>{loadingLabel}</span>
        </p>
      ) : null}
      {isLoading && !isEmpty ? (
        <p className="visually-hidden" role="status">正在刷新，当前内容仍可使用</p>
      ) : null}
      {!isLoading && !errorMessage && isEmpty && emptyMessage ? (
        <p className="discovery-section-message discovery-section-message-empty">{emptyMessage}</p>
      ) : null}
      {!isEmpty ? children : null}
    </div>
  );
}
