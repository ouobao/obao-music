import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioOutputStore, type AudioOutputSettings } from './audioOutputStore';

const sharedSettings: AudioOutputSettings = {
  supported: true,
  exclusiveModeEnabled: false,
  activeExclusiveMode: false,
  restartRequired: false
};

describe('audio output store', () => {
  beforeEach(() => {
    useAudioOutputStore.getState().resetForTest();
    installAudioApi();
  });

  it('loads output settings and exposes the pending state', async () => {
    let resolveSettings: (settings: AudioOutputSettings) => void = () => undefined;
    const getOutputSettings = vi.fn(() => new Promise<AudioOutputSettings>((resolve) => {
      resolveSettings = resolve;
    }));
    installAudioApi({ getOutputSettings });

    const loading = useAudioOutputStore.getState().loadSettings();

    expect(useAudioOutputStore.getState()).toMatchObject({
      settings: null,
      isLoading: true,
      errorMessage: null
    });

    resolveSettings(sharedSettings);
    await loading;

    expect(getOutputSettings).toHaveBeenCalledTimes(1);
    expect(useAudioOutputStore.getState()).toMatchObject({
      settings: sharedSettings,
      isLoading: false,
      errorMessage: null
    });
  });

  it('saves exclusive mode and adopts the settings returned by the main process', async () => {
    const nextSettings: AudioOutputSettings = {
      ...sharedSettings,
      exclusiveModeEnabled: true,
      restartRequired: true
    };
    const setExclusiveMode = vi.fn(async () => nextSettings);
    installAudioApi({ setExclusiveMode });
    useAudioOutputStore.setState({ settings: sharedSettings });

    const saving = useAudioOutputStore.getState().setExclusiveMode(true);

    expect(useAudioOutputStore.getState().isSaving).toBe(true);
    await saving;

    expect(setExclusiveMode).toHaveBeenCalledWith(true);
    expect(useAudioOutputStore.getState()).toMatchObject({
      settings: nextSettings,
      isSaving: false,
      errorMessage: null
    });
  });

  it('preserves the last known settings when saving fails', async () => {
    installAudioApi({
      setExclusiveMode: vi.fn(async () => {
        throw new Error('无法写入音频配置');
      })
    });
    useAudioOutputStore.setState({ settings: sharedSettings });

    await useAudioOutputStore.getState().setExclusiveMode(true);

    expect(useAudioOutputStore.getState()).toMatchObject({
      settings: sharedSettings,
      isSaving: false,
      errorMessage: '无法写入音频配置'
    });
  });

  it('reports a load failure without inventing settings', async () => {
    installAudioApi({
      getOutputSettings: vi.fn(async () => {
        throw new Error('音频服务不可用');
      })
    });

    await useAudioOutputStore.getState().loadSettings();

    expect(useAudioOutputStore.getState()).toMatchObject({
      settings: null,
      isLoading: false,
      errorMessage: '音频服务不可用'
    });
  });

  it('requests an application restart and exposes its pending state', async () => {
    let resolveRestart: () => void = () => undefined;
    const restart = vi.fn(() => new Promise<void>((resolve) => {
      resolveRestart = resolve;
    }));
    installAudioApi({ restart });

    const restarting = useAudioOutputStore.getState().restart();

    expect(useAudioOutputStore.getState().isRestarting).toBe(true);
    expect(restart).toHaveBeenCalledTimes(1);

    resolveRestart();
    await restarting;

    expect(useAudioOutputStore.getState()).toMatchObject({
      isRestarting: true,
      errorMessage: null
    });
  });
});

function installAudioApi(overrides: Partial<NonNullable<Window['musicPlayer']['audio']>> = {}) {
  window.musicPlayer = {
    audio: {
      getOutputSettings: vi.fn(async () => sharedSettings),
      setExclusiveMode: vi.fn(async (enabled) => ({
        ...sharedSettings,
        exclusiveModeEnabled: enabled,
        restartRequired: enabled
      })),
      restart: vi.fn(async () => undefined),
      ...overrides
    }
  } as Window['musicPlayer'];
}
