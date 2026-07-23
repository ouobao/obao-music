import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path = require('node:path');

export interface AudioOutputPreference {
  exclusiveModeEnabled: boolean;
}

export interface AudioOutputSettings {
  supported: boolean;
  exclusiveModeEnabled: boolean;
  activeExclusiveMode: boolean;
  restartRequired: boolean;
}

const DEFAULT_AUDIO_OUTPUT_PREFERENCE: AudioOutputPreference = {
  exclusiveModeEnabled: false
};

export function readAudioOutputPreference(filePath: string): AudioOutputPreference {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    if (!isRecord(value) || typeof value.exclusiveModeEnabled !== 'boolean') {
      return { ...DEFAULT_AUDIO_OUTPUT_PREFERENCE };
    }

    return {
      exclusiveModeEnabled: value.exclusiveModeEnabled
    };
  } catch {
    return { ...DEFAULT_AUDIO_OUTPUT_PREFERENCE };
  }
}

export function writeAudioOutputPreference(filePath: string, preference: AudioOutputPreference): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(preference, null, 2), 'utf8');
}

export function createAudioOutputSettings(
  platform: NodeJS.Platform,
  exclusiveModeEnabled: boolean,
  activeExclusiveMode: boolean
): AudioOutputSettings {
  const supported = platform === 'win32';
  const normalizedActiveExclusiveMode = supported && activeExclusiveMode;

  return {
    supported,
    exclusiveModeEnabled,
    activeExclusiveMode: normalizedActiveExclusiveMode,
    restartRequired: supported && exclusiveModeEnabled !== normalizedActiveExclusiveMode
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
