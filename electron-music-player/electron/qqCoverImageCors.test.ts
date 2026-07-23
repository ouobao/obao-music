import { describe, expect, it, vi } from 'vitest';
import {
  QQ_COVER_IMAGE_URL_PATTERNS,
  createQqCoverImageCorsHeaders,
  registerQqCoverImageCorsPolicy
} from './qqCoverImageCors.cts';

type CoverDetails = Parameters<typeof createQqCoverImageCorsHeaders>[0];

function createDetails(overrides: Partial<CoverDetails> = {}): CoverDetails {
  return {
    url: 'https://y.gtimg.cn/music/photo_new/T003R300x300M00000423yoi0HGZfe.jpg',
    resourceType: 'image',
    responseHeaders: {
      'Content-Type': ['image/jpeg'],
      'access-control-allow-origin': ['https://y.qq.com']
    },
    ...overrides
  };
}

describe('QQ cover image CORS policy', () => {
  it.each([
    'https://y.gtimg.cn/music/photo_new/chart.jpg',
    'https://y.qq.com/music/photo_new/album.jpg',
    'https://qpic.y.qq.com/music_cover/playlist.jpg',
    'https://p.qpic.cn/music_cover/playlist.jpg'
  ])('replaces the CORS origin for trusted QQ cover images: %s', (url) => {
    expect(createQqCoverImageCorsHeaders(createDetails({ url }))).toEqual({
      'Content-Type': ['image/jpeg'],
      'Access-Control-Allow-Origin': ['*']
    });
  });

  it('leaves non-image and untrusted responses untouched', () => {
    expect(createQqCoverImageCorsHeaders(createDetails({ resourceType: 'xhr' }))).toBeNull();
    expect(createQqCoverImageCorsHeaders(createDetails({ url: 'https://example.test/cover.jpg' }))).toBeNull();
    expect(createQqCoverImageCorsHeaders(createDetails({ url: 'file:///cover.jpg' }))).toBeNull();
  });

  it('registers one filtered response listener and passes unmatched resources through', () => {
    const onHeadersReceived = vi.fn();
    const targetSession = { webRequest: { onHeadersReceived } } as unknown as Parameters<
      typeof registerQqCoverImageCorsPolicy
    >[0];

    registerQqCoverImageCorsPolicy(targetSession);

    expect(onHeadersReceived).toHaveBeenCalledWith(
      { urls: QQ_COVER_IMAGE_URL_PATTERNS },
      expect.any(Function)
    );

    const listener = onHeadersReceived.mock.calls[0]?.[1] as (
      details: CoverDetails,
      callback: (response: { responseHeaders?: Record<string, string[]> }) => void
    ) => void;
    const callback = vi.fn();
    listener(createDetails({ resourceType: 'script' }), callback);

    expect(callback).toHaveBeenCalledWith({});
  });
});
