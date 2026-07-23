import { create } from 'zustand';
import type { AudioOutputSettings } from '../../shared/global';

export type { AudioOutputSettings } from '../../shared/global';

interface AudioOutputState {
  settings: AudioOutputSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  isRestarting: boolean;
  errorMessage: string | null;
  loadSettings: () => Promise<void>;
  setExclusiveMode: (enabled: boolean) => Promise<void>;
  restart: () => Promise<void>;
  resetForTest: () => void;
}

const unsupportedSettings: AudioOutputSettings = {
  supported: false,
  exclusiveModeEnabled: false,
  activeExclusiveMode: false,
  restartRequired: false
};

const initialState = {
  settings: null,
  isLoading: false,
  isSaving: false,
  isRestarting: false,
  errorMessage: null
};

export const useAudioOutputStore = create<AudioOutputState>((set, get) => ({
  ...initialState,

  loadSettings: async () => {
    if (get().settings || get().isLoading) {
      return;
    }

    const audioApi = window.musicPlayer?.audio;
    if (!audioApi) {
      set({ settings: unsupportedSettings, errorMessage: null });
      return;
    }

    set({ isLoading: true, errorMessage: null });

    try {
      const settings = await audioApi.getOutputSettings();
      set({ settings, isLoading: false, errorMessage: null });
    } catch (error) {
      set({
        isLoading: false,
        errorMessage: getErrorMessage(error, '音频输出设置加载失败')
      });
    }
  },

  setExclusiveMode: async (enabled) => {
    const { settings, isSaving } = get();
    if (!settings?.supported || isSaving) {
      return;
    }

    const audioApi = window.musicPlayer?.audio;
    if (!audioApi) {
      set({ errorMessage: '当前环境不支持音频输出设置' });
      return;
    }

    set({ isSaving: true, errorMessage: null });

    try {
      const nextSettings = await audioApi.setExclusiveMode(enabled);
      set({ settings: nextSettings, isSaving: false, errorMessage: null });
    } catch (error) {
      set({
        isSaving: false,
        errorMessage: getErrorMessage(error, '独占模式设置失败')
      });
    }
  },

  restart: async () => {
    if (get().isRestarting) {
      return;
    }

    const audioApi = window.musicPlayer?.audio;
    if (!audioApi) {
      set({ errorMessage: '当前环境无法重启应用' });
      return;
    }

    set({ isRestarting: true, errorMessage: null });

    try {
      await audioApi.restart();
    } catch (error) {
      set({
        isRestarting: false,
        errorMessage: getErrorMessage(error, '应用重启失败')
      });
    }
  },

  resetForTest: () => set(initialState)
}));

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
