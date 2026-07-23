const path = require('node:path');

const USER_DATA_DIRECTORY = 'electron-music-player';
const NETEASE_LOGIN_PARTITION = 'persist:musicplayer-netease-login';
const NETEASE_LOGIN_URL = 'https://music.163.com/';
const NETEASE_RECENT_API_URL = 'https://music.163.com/api/discovery/recommend/songs/history/recent';
const NETEASE_RECENT_WEAPI_URL = 'https://music.163.com/weapi/discovery/recommend/songs/history/recent';
const NETEASE_DETAIL_API_URL = 'https://music.163.com/api/discovery/recommend/songs/history/detail';
const NETEASE_DETAIL_WEAPI_URL = 'https://music.163.com/weapi/discovery/recommend/songs/history/detail';
const NETEASE_WEAPI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_REQUESTS = 2;

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
    .finally(() => {
      app.quit();
    });
}

async function main({ app, session }) {
  await app.whenReady();

  const loginSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  const verification = {
    cookieHeaderPresent: false,
    requestCanceled: false,
    requestCount: 0,
    requestLimitBlocked: false
  };

  loginSession.webRequest.onBeforeSendHeaders({
    urls: [`${NETEASE_RECENT_WEAPI_URL}*`, `${NETEASE_DETAIL_WEAPI_URL}*`]
  }, (details, callback) => {
    verification.requestCount += 1;
    verification.cookieHeaderPresent ||= Object.keys(details.requestHeaders)
      .some((name) => name.toLocaleLowerCase() === 'cookie');

    if (verification.requestCount > MAX_REQUESTS) {
      verification.requestCanceled = true;
      verification.requestLimitBlocked = true;
      callback({ cancel: true });
      return;
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  try {
    const recent = await requestWeapi(loginSession, NETEASE_RECENT_API_URL, {});
    const recentSummary = summarizePayload(recent.payload);
    const date = readFirstDate(recent.payload);
    if (!recent.response.ok || readFiniteNumber(recent.payload?.code) !== 200 || !date) {
      printReport({
        outcome: !recent.response.ok ? 'http_failure' : 'recent_schema_failure',
        requestCount: verification.requestCount,
        cookieHeaderPresent: verification.cookieHeaderPresent,
        requestCanceled: verification.requestCanceled,
        requestLimitBlocked: verification.requestLimitBlocked,
        recentHttpStatus: recent.response.status,
        recentSummary
      });
      process.exitCode = 1;
      return;
    }

    const detail = await requestWeapi(loginSession, NETEASE_DETAIL_API_URL, { date });
    const detailSummary = summarizePayload(detail.payload);
    const outcome = !detail.response.ok
      ? 'http_failure'
      : verification.requestCount !== MAX_REQUESTS
        ? 'request_count_mismatch'
        : verification.requestCanceled
          ? 'request_canceled'
          : readFiniteNumber(detail.payload?.code) !== 200
            ? 'detail_business_failure'
            : 'success';

    printReport({
      outcome,
      requestCount: verification.requestCount,
      cookieHeaderPresent: verification.cookieHeaderPresent,
      requestCanceled: verification.requestCanceled,
      requestLimitBlocked: verification.requestLimitBlocked,
      recentHttpStatus: recent.response.status,
      detailHttpStatus: detail.response.status,
      recentSummary,
      detailSummary
    });

    if (outcome !== 'success') {
      process.exitCode = 1;
    }
  } catch {
    printReport({
      outcome: 'request_failure',
      requestCount: verification.requestCount,
      cookieHeaderPresent: verification.cookieHeaderPresent,
      requestCanceled: verification.requestCanceled,
      requestLimitBlocked: verification.requestLimitBlocked
    });
    process.exitCode = 1;
  }
}

async function requestWeapi(loginSession, apiUrl, data) {
  const { createNeteaseWeapiRequest } = require('../dist-electron/providers/neteaseWeapi.cjs');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const request = createNeteaseWeapiRequest(apiUrl, {
      ...data,
      e_r: false,
      csrf_token: ''
    });
    const response = await loginSession.fetch(request.url, {
      method: 'POST',
      body: new URLSearchParams(request.form).toString(),
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Referer: NETEASE_LOGIN_URL,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': NETEASE_WEAPI_USER_AGENT
      },
      redirect: 'error',
      signal: controller.signal
    });
    return {
      response,
      payload: await response.json()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readFirstDate(payload) {
  const dates = isRecord(payload?.data) && Array.isArray(payload.data.dates)
    ? payload.data.dates
    : null;
  const first = dates?.[0];
  if (typeof first === 'string' && first.trim()) {
    return first.trim();
  }
  if (isRecord(first) && typeof first.date === 'string' && first.date.trim()) {
    return first.date.trim();
  }
  return null;
}

function summarizePayload(payload) {
  return {
    businessCode: readFiniteNumber(payload?.code),
    shape: describeShape(payload)
  };
}

function describeShape(value, pathName = '$', depth = 0, output = []) {
  if (depth > 5 || output.length >= 120) {
    return output;
  }
  if (Array.isArray(value)) {
    output.push(`${pathName}:array(${value.length})`);
    if (value.length > 0) {
      describeShape(value[0], `${pathName}[]`, depth + 1, output);
    }
    return output;
  }
  if (isRecord(value)) {
    output.push(`${pathName}:object`);
    for (const key of Object.keys(value).sort()) {
      describeShape(value[key], `${pathName}.${key}`, depth + 1, output);
    }
    return output;
  }
  output.push(`${pathName}:${value === null ? 'null' : typeof value}`);
  return output;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
