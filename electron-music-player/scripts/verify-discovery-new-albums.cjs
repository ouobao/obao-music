const path = require('node:path');

const USER_DATA_DIRECTORY = 'electron-music-player';
const QQ_PARTITION = 'persist:musicplayer-qq-login';
const NETEASE_PARTITION = 'persist:musicplayer-netease-login';
const QQ_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const NETEASE_API_URL = 'https://music.163.com/api/album/new';
const NETEASE_WEAPI_URL = 'https://music.163.com/weapi/album/new';
const REQUEST_TIMEOUT_MS = 12_000;

if (!process.argv.includes('--run-once')) {
  printReport({ outcome: 'confirmation_flag_missing' });
} else {
  const electron = require('electron');
  const { app, session } = electron;
  app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIRECTORY));

  main({ app, session })
    .catch(() => {
      printReport({ outcome: 'audit_failure' });
      process.exitCode = 1;
    })
    .finally(() => app.quit());
}

async function main({ app, session }) {
  await app.whenReady();
  const qq = await verifyQQ(session.fromPartition(QQ_PARTITION));
  const providers = { qq };
  if (!process.argv.includes('--qq-only')) {
    providers.netease = await verifyNetease(session.fromPartition(NETEASE_PARTITION));
  }
  const outcome = Object.values(providers).every((provider) => provider.outcome === 'success')
    ? 'success'
    : 'verification_failed';
  printReport({ outcome, providers });
  if (outcome !== 'success') process.exitCode = 1;
}

async function verifyQQ(loginSession) {
  const verification = installCookieGuard(loginSession, `${QQ_URL}*`);
  try {
    const response = await fetchOnce(loginSession, QQ_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comm: { ct: 24, cv: 0 },
        new_album: {
          module: 'newalbum.NewAlbumServer',
          method: 'get_new_album_info',
          param: { area: 1, sin: 0, num: 12 }
        }
      })
    });
    const payload = JSON.parse(await response.text());
    const module = isRecord(payload?.new_album) ? payload.new_album : null;
    const candidates = findAlbumArrays(module?.data, ['new_album', 'data']);
    return summarize('qq', response, payload?.code, module?.code, candidates, verification);
  } catch (error) {
    return failureSummary(error, verification);
  }
}

async function verifyNetease(loginSession) {
  const verification = installCookieGuard(loginSession, `${NETEASE_WEAPI_URL}*`);
  try {
    const { createNeteaseWeapiRequest } = require('../dist-electron/providers/neteaseWeapi.cjs');
    const request = createNeteaseWeapiRequest(NETEASE_API_URL, {
      area: 'ALL',
      offset: 0,
      limit: 12,
      total: true,
      e_r: false,
      csrf_token: ''
    });
    const response = await fetchOnce(loginSession, request.url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(request.form).toString()
    });
    const payload = await response.json();
    const candidates = findAlbumArrays(payload, []);
    return summarize('netease', response, payload?.code, 200, candidates, verification);
  } catch (error) {
    return failureSummary(error, verification);
  }
}

function installCookieGuard(loginSession, urlPattern) {
  const verification = { requestCount: 0, cookieHeaderPresent: false, requestCanceled: false };
  loginSession.webRequest.onBeforeSendHeaders({ urls: [urlPattern] }, (details, callback) => {
    verification.requestCount += 1;
    const hasCookie = Object.keys(details.requestHeaders).some((name) => name.toLowerCase() === 'cookie');
    verification.cookieHeaderPresent ||= hasCookie;
    if (hasCookie || verification.requestCount > 1) {
      verification.requestCanceled = true;
      callback({ cancel: true });
      return;
    }
    callback({ requestHeaders: details.requestHeaders });
  });
  return verification;
}

async function fetchOnce(loginSession, url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await loginSession.fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(providerId, response, topCodeValue, moduleCodeValue, candidates, verification) {
  const selected = [...candidates].sort((left, right) => right.items.length - left.items.length)[0] ?? null;
  const topLevelCode = readFiniteNumber(topCodeValue);
  const moduleCode = readFiniteNumber(moduleCodeValue);
  const validItems = selected?.items.filter(isAlbumLike) ?? [];
  const successCode = providerId === 'netease' ? 200 : 0;
  const valid = response.ok
    && topLevelCode === successCode
    && moduleCode === successCode
    && validItems.length > 0
    && verification.requestCount === 1
    && !verification.cookieHeaderPresent
    && !verification.requestCanceled;
  return {
    outcome: valid ? 'success' : 'schema_failure',
    httpStatus: response.status,
    topLevelCode,
    moduleCode,
    requestCount: verification.requestCount,
    cookieHeaderPresent: verification.cookieHeaderPresent,
    requestCanceled: verification.requestCanceled,
    candidateArrayPaths: candidates.map((candidate) => candidate.path.join('.')),
    albumArrayPath: selected?.path.join('.') ?? null,
    albumCount: selected?.items.length ?? 0,
    validAlbumCount: validItems.length,
    albumFieldSignatures: summarizeFieldSignatures(validItems),
    fixture: validItems.slice(0, 3).map((album, index) => sanitizeAlbum(providerId, album, index))
  };
}

function summarizeFieldSignatures(items) {
  const signatures = new Map();
  for (const item of items.slice(0, 12)) {
    if (!isRecord(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!isSafeKey(key)) continue;
      const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      signatures.set(`${key}:${type}`, (signatures.get(`${key}:${type}`) ?? 0) + 1);
    }
  }
  return [...signatures.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, count]) => ({ field, count }));
}

function failureSummary(error, verification) {
  return {
    outcome: error?.name === 'AbortError' ? 'transport_timeout' : 'transport_failure',
    requestCount: verification.requestCount,
    cookieHeaderPresent: verification.cookieHeaderPresent,
    requestCanceled: verification.requestCanceled
  };
}

function findAlbumArrays(value, pathParts, depth = 0) {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.some(isAlbumLike) ? [{ path: pathParts, items: value }] : [];
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => (
    isSafeKey(key) ? findAlbumArrays(nested, [...pathParts, key], depth + 1) : []
  ));
}

function isAlbumLike(value) {
  if (!isRecord(value)) return false;
  return Boolean(
    firstText(value.albumMid, value.album_mid, value.mid, value.id)
    && firstText(value.albumName, value.name, value.title)
  );
}

function sanitizeAlbum(providerId, value, index) {
  const ordinal = String(index + 1).padStart(2, '0');
  return providerId === 'qq'
    ? {
        mid: `RELEASEALBUM${ordinal}`,
        name: `Fixture Release Album ${ordinal}`,
        release_time: `2026-07-${ordinal}`,
        type: 0,
        singers: [{ name: `Fixture Release Artist ${ordinal}` }]
      }
    : {
        id: 900_000 + index,
        name: `Fixture Release Album ${ordinal}`,
        picUrl: `https://example.test/release-${ordinal}.jpg`,
        publishTime: 1_752_710_400_000 + index,
        size: 10 + index,
        type: '专辑',
        artist: { id: 800_000 + index, name: `Fixture Release Artist ${ordinal}` }
      };
}

function isSafeKey(value) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);
}

function readFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
