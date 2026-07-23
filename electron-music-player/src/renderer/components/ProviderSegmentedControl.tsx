import type { RemoteProviderId } from '../../shared/musicTypes';

interface ProviderSegmentedControlProps {
  value: RemoteProviderId;
  ariaLabel: string;
  onChange?: (providerId: RemoteProviderId) => void;
}

const providers = [
  { id: 'qq', label: 'QQ 音乐' },
  { id: 'netease', label: '网易云音乐' }
] as const satisfies readonly { id: RemoteProviderId; label: string }[];

export function ProviderSegmentedControl({ value, ariaLabel, onChange }: ProviderSegmentedControlProps) {
  return (
    <div className="provider-segmented-control" data-provider={value} role="group" aria-label={ariaLabel}>
      {providers.map((provider) => (
        <button
          className={provider.id === value ? 'provider-segmented-option provider-segmented-option-active' : 'provider-segmented-option'}
          type="button"
          data-provider-option={provider.id}
          aria-pressed={provider.id === value}
          key={provider.id}
          onClick={() => {
            if (provider.id !== value) {
              onChange?.(provider.id);
            }
          }}
        >
          {provider.label}
        </button>
      ))}
    </div>
  );
}
