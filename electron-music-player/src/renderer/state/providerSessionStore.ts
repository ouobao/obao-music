import { create } from 'zustand';
import type { ProviderId } from '../../shared/musicTypes';
import type { LoginStatus, ProviderIpcResult } from '../../shared/providerTypes';

export const sessionProviderIds = ['netease', 'qq'] as const;
export type SessionProviderId = (typeof sessionProviderIds)[number];

type ProviderSessionStatuses = Record<SessionProviderId, LoginStatus>;

const ACTIVE_PROVIDER_STORAGE_KEY = 'musicplayer.activeProviderId';
const DEFAULT_PROVIDER_STORAGE_KEY = 'musicplayer.defaultProviderId';

interface ProviderSessionState {
  statuses: ProviderSessionStatuses;
  defaultProviderId: SessionProviderId | null;
  activeProviderId: SessionProviderId | null;
  isHydrating: boolean;
  hydrateStatuses: () => Promise<void>;
  refreshStatus: (providerId: SessionProviderId) => Promise<ProviderIpcResult<LoginStatus>>;
  setDefaultProvider: (providerId: SessionProviderId) => void;
  login: (providerId: SessionProviderId) => Promise<ProviderIpcResult<LoginStatus>>;
  logout: (providerId: SessionProviderId) => Promise<ProviderIpcResult<void>>;
  resetForTest: () => void;
}

const initialState = {
  statuses: createInitialStatuses(),
  defaultProviderId: null,
  activeProviderId: null,
  isHydrating: false
};

export const useProviderSessionStore = create<ProviderSessionState>((set) => ({
  ...initialState,

  hydrateStatuses: async () => {
    set({ isHydrating: true });

    const hydratedStatuses = await Promise.all(
      sessionProviderIds.map(async (providerId) => {
        try {
          const result = await window.musicPlayer.music.getLoginStatus(providerId);
          return [
            providerId,
            result.ok ? normalizeStatus(result.data, providerId) : createStatusFromError(providerId, result.error.message)
          ] as const;
        } catch (error) {
          return [providerId, createStatusFromError(providerId, getErrorMessage(error))] as const;
        }
      })
    );

    set((state) => {
      const statuses: ProviderSessionStatuses = {
        ...state.statuses
      };

      for (const [providerId, status] of hydratedStatuses) {
        if (statuses[providerId].loggedIn && !status.loggedIn) {
          continue;
        }

        statuses[providerId] = status;
      }

      const defaultProviderId = chooseDefaultProvider(statuses, readStoredDefaultProviderId());
      writeStoredDefaultProviderId(defaultProviderId);

      return {
        statuses,
        defaultProviderId,
        activeProviderId: defaultProviderId,
        isHydrating: false
      };
    });
  },

  refreshStatus: async (providerId) => {
    const result = await window.musicPlayer.music.getLoginStatus(providerId);
    if (result.ok) {
      set((state) => ({
        statuses: {
          ...state.statuses,
          [providerId]: normalizeStatus(result.data, providerId)
        },
        ...syncDefaultProviderAfterStatusChange({
          ...state.statuses,
          [providerId]: normalizeStatus(result.data, providerId)
        }, state.defaultProviderId)
      }));
      return result;
    }

    set((state) => ({
      statuses: {
        ...state.statuses,
        [providerId]: createStatusFromError(providerId, result.error.message)
      }
    }));
    return result;
  },

  setDefaultProvider: (providerId) => {
    set((state) => {
      if (!state.statuses[providerId].loggedIn) {
        return state;
      }

      writeStoredDefaultProviderId(providerId);
      return {
        defaultProviderId: providerId,
        activeProviderId: providerId
      };
    });
  },

  login: async (providerId) => {
    const result = await window.musicPlayer.music.login(providerId);
    if (result.ok) {
      const status = normalizeStatus(result.data, providerId);
      if (status.loggedIn) {
        writeStoredDefaultProviderId(providerId);
      }

      set((state) => ({
        statuses: {
          ...state.statuses,
          [providerId]: status
        },
        defaultProviderId: status.loggedIn ? providerId : state.defaultProviderId,
        activeProviderId: status.loggedIn ? providerId : state.activeProviderId
      }));
      return result;
    }

    set((state) => ({
      statuses: {
        ...state.statuses,
        [providerId]: createStatusFromError(providerId, result.error.message)
      }
    }));
    return result;
  },

  logout: async (providerId) => {
    const result = await window.musicPlayer.music.logout(providerId);
    if (result.ok) {
      set((state) => {
        const statuses = {
          ...state.statuses,
          [providerId]: createLoggedOutStatus(providerId)
        };
        const preferredDefaultProviderId = state.defaultProviderId === providerId ? null : state.defaultProviderId;
        const defaultProviderId = chooseDefaultProvider(statuses, preferredDefaultProviderId);
        writeStoredDefaultProviderId(defaultProviderId);

        return {
          statuses,
          defaultProviderId,
          activeProviderId: defaultProviderId
        };
      });
      return result;
    }

    set((state) => ({
      statuses: {
        ...state.statuses,
        [providerId]: createStatusFromError(providerId, result.error.message)
      }
    }));
    return result;
  },

  resetForTest: () => {
    set({
      statuses: createInitialStatuses(),
      defaultProviderId: null,
      activeProviderId: null,
      isHydrating: false
    });
    writeStoredDefaultProviderId(null);
  }
}));

export function getLoggedInProviderIds(statuses: ProviderSessionStatuses): SessionProviderId[] {
  return sessionProviderIds.filter((providerId) => statuses[providerId].loggedIn);
}

function createInitialStatuses(): ProviderSessionStatuses {
  return {
    netease: createLoggedOutStatus('netease'),
    qq: createLoggedOutStatus('qq')
  };
}

function createLoggedOutStatus(providerId: SessionProviderId): LoginStatus {
  return {
    providerId,
    loggedIn: false,
    playbackReady: false
  };
}

function createStatusFromError(providerId: SessionProviderId, message: string): LoginStatus {
  return {
    ...createLoggedOutStatus(providerId),
    message
  };
}

function normalizeStatus(status: LoginStatus, fallbackProviderId: ProviderId): LoginStatus {
  return {
    ...status,
    providerId: status.providerId ?? fallbackProviderId,
    playbackReady: status.playbackReady ?? false
  };
}

function chooseDefaultProvider(
  statuses: ProviderSessionStatuses,
  preferredProviderId: SessionProviderId | null
): SessionProviderId | null {
  if (isRealSessionProviderId(preferredProviderId) && statuses[preferredProviderId].loggedIn) {
    return preferredProviderId;
  }

  return sessionProviderIds.find((providerId) => statuses[providerId].loggedIn) ?? null;
}

function syncDefaultProviderAfterStatusChange(
  statuses: ProviderSessionStatuses,
  currentDefaultProviderId: SessionProviderId | null
): Pick<ProviderSessionState, 'defaultProviderId' | 'activeProviderId'> {
  const defaultProviderId = chooseDefaultProvider(statuses, currentDefaultProviderId);
  writeStoredDefaultProviderId(defaultProviderId);
  return {
    defaultProviderId,
    activeProviderId: defaultProviderId
  };
}

function readStoredDefaultProviderId(): SessionProviderId | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(DEFAULT_PROVIDER_STORAGE_KEY) ?? localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY);
  return isSessionProviderId(value) ? value : null;
}

function writeStoredDefaultProviderId(providerId: SessionProviderId | null) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  if (isRealSessionProviderId(providerId)) {
    localStorage.setItem(DEFAULT_PROVIDER_STORAGE_KEY, providerId);
    localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, providerId);
    return;
  }

  localStorage.removeItem(DEFAULT_PROVIDER_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_PROVIDER_STORAGE_KEY);
}

function isSessionProviderId(value: string | null): value is SessionProviderId {
  return sessionProviderIds.includes(value as SessionProviderId);
}

function isRealSessionProviderId(providerId: SessionProviderId | null): providerId is SessionProviderId {
  return providerId !== null && sessionProviderIds.includes(providerId);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Provider status hydration failed';
}
