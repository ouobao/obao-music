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

export function normalizeProviderError(error: unknown, fallbackMessage: string): Error {
  if (isAbortError(error)) {
    return new Error(fallbackMessage);
  }

  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  return new Error(fallbackMessage);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
