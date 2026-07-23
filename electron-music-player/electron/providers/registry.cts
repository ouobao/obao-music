import type {
  MusicProvider,
  ProviderCapabilities,
  ProviderCapabilityId,
  ProviderIpcResult,
  ProviderId
} from './types.cjs';
import { createProviderNotReady, ProviderCapabilityUnsupportedError, toProviderIpcError } from './types.cjs';

type ProviderAction<T> = (provider: MusicProvider) => Promise<T>;
type ProviderCapabilityAction<K extends ProviderCapabilityId, T> = (
  capability: NonNullable<ProviderCapabilities[K]>
) => Promise<T>;

export interface ProviderRegistry {
  getProvider(providerId: ProviderId): MusicProvider;
  run<T>(providerId: ProviderId, action: ProviderAction<T>): Promise<ProviderIpcResult<T>>;
  runCapability<K extends ProviderCapabilityId, T>(
    providerId: ProviderId,
    capabilityId: K,
    action: ProviderCapabilityAction<K, T>
  ): Promise<ProviderIpcResult<T>>;
}

export function createProviderRegistry(providers: MusicProvider[]): ProviderRegistry {
  const providerMap = new Map<ProviderId, MusicProvider>(providers.map((provider) => [provider.id, provider]));

  return {
    getProvider(providerId) {
      return providerMap.get(providerId) ?? createProviderNotReady(providerId);
    },

    async run(providerId, action) {
      try {
        const data = await action(this.getProvider(providerId));
        return { ok: true, data };
      } catch (error) {
        return {
          ok: false,
          error: toProviderIpcError(providerId, error)
        };
      }
    },

    async runCapability(providerId, capabilityId, action) {
      return this.run(providerId, async (provider) => {
        const capability = provider.capabilities?.[capabilityId];
        if (!capability) {
          throw new ProviderCapabilityUnsupportedError(providerId, capabilityId);
        }

        return action(capability);
      });
    }
  };
}
