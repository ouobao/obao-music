const path = require('node:path');

const USER_DATA_DIRECTORY = 'electron-music-player';
const NETEASE_LOGIN_PARTITION = 'persist:musicplayer-netease-login';
const NETEASE_API_URL = 'https://music.163.com/api/homepage/block/page';
const NETEASE_WEAPI_URL = 'https://music.163.com/weapi/homepage/block/page';
const NETEASE_LOGIN_URL = 'https://music.163.com/';
const NETEASE_WEAPI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BLOCKS_TO_INSPECT = 100;
const MAX_CREATIVES_TO_INSPECT = 100;
const MAX_RESOURCES_TO_INSPECT = 100;

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
    secondRequestBlocked: false
  };

  loginSession.webRequest.onBeforeSendHeaders({ urls: [`${NETEASE_WEAPI_URL}*`] }, (details, callback) => {
    verification.requestCount += 1;
    const hasCookieHeader = Object.keys(details.requestHeaders).some((name) => name.toLocaleLowerCase() === 'cookie');
    verification.cookieHeaderPresent ||= hasCookieHeader;

    if (hasCookieHeader || verification.requestCount > 1) {
      verification.requestCanceled = true;
      verification.secondRequestBlocked ||= verification.requestCount > 1;
      callback({ cancel: true });
      return;
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { createNeteaseWeapiRequest } = require('../dist-electron/providers/neteaseWeapi.cjs');
    const weapiRequest = createNeteaseWeapiRequest(NETEASE_API_URL, {
      refresh: false,
      e_r: false,
      csrf_token: ''
    });
    const response = await loginSession.fetch(weapiRequest.url, {
      method: 'POST',
      body: new URLSearchParams(weapiRequest.form).toString(),
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Referer: NETEASE_LOGIN_URL,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': NETEASE_WEAPI_USER_AGENT
      },
      redirect: 'error',
      signal: controller.signal
    });
    const payload = await response.json();
    const summary = summarizePayload(payload);
    const outcome = !response.ok
      ? 'http_failure'
      : verification.requestCount !== 1
        ? 'request_count_mismatch'
        : verification.cookieHeaderPresent
          ? 'cookie_header_blocked'
          : verification.requestCanceled
            ? 'request_canceled'
            : !summary.valid
              ? summary.reason
              : 'success';

    printReport({
      outcome,
      requestCount: verification.requestCount,
      cookieHeaderPresent: verification.cookieHeaderPresent,
      requestCanceled: verification.requestCanceled,
      secondRequestBlocked: verification.secondRequestBlocked,
      httpStatus: response.status,
      summary: summary.value
    });

    if (outcome !== 'success') {
      process.exitCode = 1;
    }
  } catch {
    printReport({
      outcome: verification.cookieHeaderPresent ? 'cookie_header_blocked' : 'request_failure',
      requestCount: verification.requestCount,
      cookieHeaderPresent: verification.cookieHeaderPresent,
      requestCanceled: verification.requestCanceled,
      secondRequestBlocked: verification.secondRequestBlocked
    });
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

function summarizePayload(payload) {
  const businessCode = readFiniteNumber(payload?.code);
  const blocks = isRecord(payload?.data) && Array.isArray(payload.data.blocks)
    ? payload.data.blocks
    : null;
  if (businessCode !== 200 || !blocks) {
    return {
      valid: false,
      reason: 'schema_failure',
      value: {
        businessCode,
        blocksPresent: Boolean(blocks)
      }
    };
  }

  const resourceCounts = {
    chart: 0,
    playlist: 0,
    song: 0,
    topic: 0,
    unknown: 0
  };
  const songFieldCoverage = {
    album: 0,
    artists: 0,
    duration: 0,
    id: 0,
    name: 0
  };
  let creativeCount = 0;
  let resourceCount = 0;
  let verifiedSongResourceCount = 0;

  for (const block of blocks.slice(0, MAX_BLOCKS_TO_INSPECT)) {
    if (!isRecord(block) || !Array.isArray(block.creatives)) {
      continue;
    }

    for (const creative of block.creatives.slice(0, MAX_CREATIVES_TO_INSPECT)) {
      if (!isRecord(creative) || !Array.isArray(creative.resources)) {
        continue;
      }
      creativeCount += 1;

      for (const resource of creative.resources.slice(0, MAX_RESOURCES_TO_INSPECT)) {
        resourceCount += 1;
        const kind = classifyResource(resource);
        resourceCounts[kind] += 1;

        if (kind === 'song') {
          const fieldPresence = readSongFieldPresence(readSongData(resource));
          for (const [field, isPresent] of Object.entries(fieldPresence)) {
            if (isPresent) {
              songFieldCoverage[field] += 1;
            }
          }
          if (Object.values(fieldPresence).every(Boolean)) {
            verifiedSongResourceCount += 1;
          }
        }
      }
    }
  }

  const acceptedResourceCount = resourceCounts.song + resourceCounts.topic;
  return {
    valid: acceptedResourceCount > 0,
    reason: acceptedResourceCount > 0 ? null : 'no_accepted_resources',
    value: {
      businessCode,
      blockCount: blocks.length,
      creativeCount,
      resourceCount,
      resourceCounts,
      songFieldCoverage,
      verifiedSongResourceCount
    }
  };
}

function classifyResource(value) {
  if (!isRecord(value) || typeof value.resourceType !== 'string') {
    return 'unknown';
  }

  switch (value.resourceType.trim().toLocaleLowerCase()) {
    case 'song':
      return 'song';
    case 'topic':
      return 'topic';
    case 'playlist':
      return 'playlist';
    case 'chart':
      return 'chart';
    default:
      return 'unknown';
  }
}

function readSongData(resource) {
  if (!isRecord(resource) || !isRecord(resource.resourceExtInfo)) {
    return null;
  }
  return resource.resourceExtInfo.songData;
}

function readSongFieldPresence(value) {
  if (!isRecord(value)) {
    return {
      album: false,
      artists: false,
      duration: false,
      id: false,
      name: false
    };
  }

  return {
    album: isRecord(value.album),
    artists: Array.isArray(value.artists) && value.artists.length > 0,
    duration: typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0,
    id: typeof value.id === 'number' && Number.isFinite(value.id),
    name: typeof value.name === 'string' && Boolean(value.name.trim())
  };
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
