import { describe, expect, it } from 'vitest';
import { AUDIO_SOURCE_SCHEME, createAudioSourceRegistry } from './audioSourceRegistry.cjs';

describe('audio source registry', () => {
  it('returns an opaque app audio URL without exposing the provider URL', () => {
    const registry = createAudioSourceRegistry({ createId: () => 'source-1' });
    const providerUrl = 'https://dl.stream.qqmusic.qq.com/C400song.m4a?vkey=secret-token';

    const sourceUrl = registry.register({
      providerId: 'qq',
      url: providerUrl
    });

    expect(sourceUrl).toBe(`${AUDIO_SOURCE_SCHEME}://source/source-1`);
    expect(sourceUrl).not.toContain('qqmusic');
    expect(sourceUrl).not.toContain('secret-token');
    expect(registry.resolve(sourceUrl)).toEqual({
      providerId: 'qq',
      url: providerUrl
    });
  });

  it('expires old source mappings before resolving them', () => {
    let now = 1_000;
    const registry = createAudioSourceRegistry({
      createId: () => 'source-1',
      now: () => now,
      ttlMs: 5_000
    });

    const sourceUrl = registry.register({
      providerId: 'netease',
      url: 'https://music.163.com/song.mp3'
    });

    now += 5_001;

    expect(registry.resolve(sourceUrl)).toBeNull();
  });
});
