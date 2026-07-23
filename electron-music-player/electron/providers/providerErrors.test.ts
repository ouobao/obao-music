import { describe, expect, it } from 'vitest';
import {
  createProviderRequestError,
  createProviderTimeoutError,
  normalizeProviderError
} from './providerErrors.cts';

describe('provider error helpers', () => {
  it('maps HTTP status failures to a stable provider request message', () => {
    const error = createProviderRequestError('网易云音乐', 500);

    expect(error.message).toBe('网易云音乐请求失败，请稍后重试（HTTP 500）');
  });

  it('maps AbortError to a timeout message', () => {
    const abortError = new Error('operation aborted');
    abortError.name = 'AbortError';

    const error = normalizeProviderError(abortError, createProviderTimeoutError('QQ 音乐').message);

    expect(error.message).toBe('QQ 音乐请求超时，请稍后重试');
  });

  it('maps unknown thrown values to the fallback message', () => {
    const error = normalizeProviderError('raw failure', 'Provider 调用失败');

    expect(error.message).toBe('Provider 调用失败');
  });
});
