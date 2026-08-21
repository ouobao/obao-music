import { create } from 'zustand';
import type { ProviderId, RemoteProviderId } from '../../shared/musicTypes';
import type { LoginStatus } from '../../shared/providerTypes';

export const REMOTE_PROVIDER_IDS: RemoteProviderId[] = ['netease', 'qq'];

const DEFAULT_PROVIDER_KEY = 'musicplayer.defaultProviderId';

export interface ProviderSessionState {
  statuses: Partial<Record<ProviderId, LoginStatus>>;
  defaultProviderId: ProviderId;
  activeProviderId: ProviderId;
  isHydrating: boolean;

  hydrateStatuses(): Promise<void>;
  refreshStatus(providerId: ProviderId): Promise<void>;
  setDefaultProvider(providerId: ProviderId): void;
  setActiveProvider(providerId: ProviderId): void;
  login(providerId: ProviderId): Promise<void>;
  logout(providerId: ProviderId): Promise<void>;
}

function loadDefaultProvider(): ProviderId {
  const stored = localStorage.getItem(DEFAULT_PROVIDER_KEY);
  return stored === 'qq' || stored === 'netease' || stored === 'local' ? stored : 'netease';
}

export const useProviderSessionStore = create<ProviderSessionState>((set, get) => ({
  statuses: {},
  defaultProviderId: loadDefaultProvider(),
  activeProviderId: loadDefaultProvider(),
  isHydrating: true,

  async hydrateStatuses() {
    const results = await Promise.allSettled(
      REMOTE_PROVIDER_IDS.map((providerId) => window.musicPlayer.music.getLoginStatus(providerId))
    );
    const statuses: Partial<Record<ProviderId, LoginStatus>> = {};
    REMOTE_PROVIDER_IDS.forEach((providerId, index) => {
      const result = results[index];
      if (result.status === 'fulfilled' && result.value.ok) {
        statuses[providerId] = result.value.data;
      }
    });
    set({ statuses, isHydrating: false });
  },

  async refreshStatus(providerId) {
    const result = await window.musicPlayer.music.getLoginStatus(providerId);
    if (result.ok) {
      set((state) => ({ statuses: { ...state.statuses, [providerId]: result.data } }));
    }
  },

  setDefaultProvider(providerId) {
    localStorage.setItem(DEFAULT_PROVIDER_KEY, providerId);
    set({ defaultProviderId: providerId });
  },

  setActiveProvider(providerId) {
    set({ activeProviderId: providerId });
  },

  async login(providerId) {
    const result = await window.musicPlayer.music.login(providerId);
    if (result.ok) {
      set((state) => ({ statuses: { ...state.statuses, [providerId]: result.data } }));
    }
  },

  async logout(providerId) {
    const result = await window.musicPlayer.music.logout(providerId);
    if (result.ok) {
      set((state) => {
        const statuses = { ...state.statuses };
        delete statuses[providerId];
        return { statuses };
      });
    }
  }
}));
