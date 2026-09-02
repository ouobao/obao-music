export function createProviderRequestError(providerLabel: string, status?: number): Error {
  const statusText = typeof status === 'number' ? `（HTTP ${status}）` : '';
  const error = new Error(`${providerLabel}请求失败，请稍后重试${statusText}`);
  error.name = 'ProviderRequestError';
  return error;
}

export function createProviderTimeoutError(providerLabel: string): Error {
  const error = new Error(`${providerLabel}请求超时，请稍后重试`);
  error.name = 'ProviderTimeoutError';
  return error;
}

/**
 * 响应体读取错误（Electron session.fetch 的 Response 偶发 body 克隆失败，
 * 原生报 "An object could not be cloned"）：转成明确的 ProviderRequestError，
 * 避免把无法理解的英文噪音透传给 UI。
 */
export function createProviderBodyReadError(providerLabel: string, cause: unknown): Error {
  const error = new Error(`${providerLabel}响应读取失败，请刷新重试`);
  error.name = 'ProviderRequestError';
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

export function normalizeProviderError(error: unknown, fallbackMessage: string): Error {
  if (isAbortError(error)) {
    return new Error(fallbackMessage);
  }

  if (error instanceof Error && error.message.trim()) {
    // 底层异常（node:crypto/session.fetch/IPC 等）的英文原文不透传给 UI，
    // 换成中文兜底文案，原始信息保留在 cause 里便于日志排查
    if (!/[\u4e00-\u9fff]/.test(error.message)) {
      const localized = new Error(fallbackMessage);
      (localized as Error & { cause?: unknown }).cause = error;
      return localized;
    }
    return error;
  }

  return new Error(fallbackMessage);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
