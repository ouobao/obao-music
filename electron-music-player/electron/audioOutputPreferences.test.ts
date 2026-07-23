import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAudioOutputSettings,
  readAudioOutputPreference,
  writeAudioOutputPreference
} from './audioOutputPreferences.cts';

describe('audio output preferences', () => {
  it('defaults to shared mode when the preference file is missing', () => {
    expect(readAudioOutputPreference(createPreferenceFilePath('missing'))).toEqual({
      exclusiveModeEnabled: false
    });
  });

  it('defaults to shared mode when the preference file contains corrupt JSON', () => {
    const filePath = createPreferenceFilePath('corrupt');
    writeFileSync(filePath, '{broken-json', 'utf8');

    expect(readAudioOutputPreference(filePath)).toEqual({
      exclusiveModeEnabled: false
    });
  });

  it.each([
    null,
    [],
    {},
    { exclusiveModeEnabled: 'true' },
    { exclusiveModeEnabled: 1 }
  ])('defaults to shared mode for an invalid preference: %j', (preference) => {
    const filePath = createPreferenceFilePath('invalid');
    writeFileSync(filePath, JSON.stringify(preference), 'utf8');

    expect(readAudioOutputPreference(filePath)).toEqual({
      exclusiveModeEnabled: false
    });
  });

  it('persists the exclusive mode preference for the next process start', () => {
    const filePath = join(createRuntimeDirectory(), 'nested', `audio-output-${createUniqueSuffix()}.json`);

    writeAudioOutputPreference(filePath, { exclusiveModeEnabled: true });

    expect(readAudioOutputPreference(filePath)).toEqual({ exclusiveModeEnabled: true });
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ exclusiveModeEnabled: true });
  });

  it('reports Windows support and requires a restart when the desired mode differs from the active mode', () => {
    expect(createAudioOutputSettings('win32', true, false)).toEqual({
      supported: true,
      exclusiveModeEnabled: true,
      activeExclusiveMode: false,
      restartRequired: true
    });
    expect(createAudioOutputSettings('win32', true, true)).toEqual({
      supported: true,
      exclusiveModeEnabled: true,
      activeExclusiveMode: true,
      restartRequired: false
    });
  });

  it('does not report an active exclusive mode or restart requirement on unsupported platforms', () => {
    expect(createAudioOutputSettings('darwin', true, true)).toEqual({
      supported: false,
      exclusiveModeEnabled: true,
      activeExclusiveMode: false,
      restartRequired: false
    });
  });
});

function createPreferenceFilePath(name: string): string {
  return join(createRuntimeDirectory(), `audio-output-${name}-${createUniqueSuffix()}.json`);
}

function createRuntimeDirectory(): string {
  const runtimeDirectory = join(process.cwd(), '.runtime');
  mkdirSync(runtimeDirectory, { recursive: true });
  return runtimeDirectory;
}

function createUniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
