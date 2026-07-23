import type { OnHeadersReceivedListenerDetails, Session } from 'electron';

export const QQ_COVER_IMAGE_URL_PATTERNS = [
  '*://y.gtimg.cn/*',
  '*://y.qq.com/*',
  '*://qpic.y.qq.com/*',
  '*://qpic.cn/*',
  '*://*.qpic.cn/*'
];

const exactQqCoverHosts = new Set([
  'y.gtimg.cn',
  'y.qq.com',
  'qpic.y.qq.com',
  'qpic.cn'
]);

type CoverImageResponseDetails = Pick<
  OnHeadersReceivedListenerDetails,
  'url' | 'resourceType' | 'responseHeaders'
>;

export function createQqCoverImageCorsHeaders(
  details: CoverImageResponseDetails
): Record<string, string[]> | null {
  if (!isTrustedQqCoverImage(details)) {
    return null;
  }

  const responseHeaders = Object.fromEntries(
    Object.entries(details.responseHeaders ?? {}).filter(
      ([name]) => name.toLocaleLowerCase() !== 'access-control-allow-origin'
    )
  );
  responseHeaders['Access-Control-Allow-Origin'] = ['*'];
  return responseHeaders;
}

export function registerQqCoverImageCorsPolicy(
  targetSession: Pick<Session, 'webRequest'>
): void {
  targetSession.webRequest.onHeadersReceived(
    { urls: QQ_COVER_IMAGE_URL_PATTERNS },
    (details, callback) => {
      const responseHeaders = createQqCoverImageCorsHeaders(details);
      callback(responseHeaders ? { responseHeaders } : {});
    }
  );
}

function isTrustedQqCoverImage(details: CoverImageResponseDetails): boolean {
  if (details.resourceType !== 'image') {
    return false;
  }

  try {
    const url = new URL(details.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLocaleLowerCase();
    return exactQqCoverHosts.has(hostname) || hostname.endsWith('.qpic.cn');
  } catch {
    return false;
  }
}
