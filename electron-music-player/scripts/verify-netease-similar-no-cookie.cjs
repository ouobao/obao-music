const path = require('node:path');
const electron = require('electron');

const { app, session } = electron;

const USER_DATA_DIRECTORY = 'electron-music-player';
const NETEASE_LOGIN_PARTITION = 'persist:musicplayer-netease-login';
const NETEASE_WEAPI_URL = 'https://music.163.com/weapi/v1/discovery/simiSong';
const REQUEST_TIMEOUT_MS = 12_000;
const PUBLIC_SEED_SONG = {
  id: 'netease:42',
  providerId: 'netease',
  platformSongId: '42',
  title: 'Public verification seed',
  artist: 'Public verification artist',
  album: 'Public verification album',
  durationMs: 0,
  coverTone: '#000000'
};

app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIRECTORY));

async function main() {
  if (!process.argv.includes('--run-once')) {
    printReport({ outcome: 'confirmation_flag_missing' });
    return;
  }

  await app.whenReady();

  const loginSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  const verification = {
    cookieHeaderPresent: false,
    httpStatus: null,
    requestCanceled: false,
    requestCount: 0,
    secondRequestBlocked: false
  };

  loginSession.webRequest.onBeforeSendHeaders({ urls: [`${NETEASE_WEAPI_URL}*`] }, (details, callback) => {
    verification.requestCount += 1;
    const hasCookieHeader = Object.entries(details.requestHeaders).some(([name]) => name.toLocaleLowerCase() === 'cookie');
    verification.cookieHeaderPresent ||= hasCookieHeader;

    if (hasCookieHeader || verification.requestCount > 1) {
      verification.requestCanceled = true;
      verification.secondRequestBlocked ||= verification.requestCount > 1;
      callback({ cancel: true });
      return;
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  loginSession.webRequest.onCompleted({ urls: [`${NETEASE_WEAPI_URL}*`] }, (details) => {
    verification.httpStatus = details.statusCode;
  });

  const timeout = setTimeout(() => app.quit(), REQUEST_TIMEOUT_MS + 1_000);

  try {
    const { createNeteaseProvider } = require('../dist-electron/providers/neteaseProvider.cjs');
    const capability = createNeteaseProvider().capabilities?.similarSongs;
    if (!capability) {
      printReport({ outcome: 'capability_missing' });
      process.exitCode = 1;
      return;
    }

    const songs = await capability.getSimilarSongs(PUBLIC_SEED_SONG);
    await waitForCompletedRequest();

    const outcome = verification.requestCount !== 1
      ? 'request_count_mismatch'
      : verification.cookieHeaderPresent
        ? 'cookie_header_blocked'
        : verification.requestCanceled
          ? 'request_canceled'
          : verification.httpStatus !== 200
            ? 'http_failure'
            : 'success';

    printReport({
      outcome,
      requestCount: verification.requestCount,
      cookieHeaderPresent: verification.cookieHeaderPresent,
      requestCanceled: verification.requestCanceled,
      httpStatus: verification.httpStatus,
      songCount: Array.isArray(songs) ? songs.length : 0
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
      httpStatus: verification.httpStatus
    });
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForCompletedRequest() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main()
  .catch(() => {
    printReport({ outcome: 'audit_failure' });
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
