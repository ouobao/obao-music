const path = require('node:path');

const USER_DATA_DIRECTORY = 'electron-music-player';
const QQ_LOGIN_PARTITION = 'persist:musicplayer-qq-login';
const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_PLAYER_REFERER = 'https://y.qq.com/portal/player.html';
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
  const loginSession = session.fromPartition(QQ_LOGIN_PARTITION);
  normalizeUserAgent(loginSession);
  const cookieMap = await readCookieMap(loginSession);
  const loginUin = resolveLoginUin(cookieMap);
  const hasMusicSession = hasAnyCookie(cookieMap, ['qqmusic_key', 'qm_keyst', 'p_skey', 'skey']);
  const hasPlaybackAuthorization = hasAnyCookie(cookieMap, ['qqmusic_key', 'qm_keyst']);
  if (!loginUin || !hasMusicSession) {
    printReport({
      outcome: 'session_not_ready',
      session: {
        accountIdentityPresent: Boolean(loginUin),
        musicSessionPresent: hasMusicSession,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      }
    });
    process.exitCode = 1;
    return;
  }

  const commonParams = {
    g_tk: calculateGtk(firstText(cookieMap.get('p_skey'), cookieMap.get('skey'))),
    loginUin,
    hostUin: 0,
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0
  };
  const requestUrl = new URL(QQ_MUSICU_URL);
  Object.entries(commonParams).forEach(([key, value]) => requestUrl.searchParams.set(key, String(value)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await loginSession.fetch(requestUrl.toString(), {
      method: 'POST',
      referrer: QQ_PLAYER_REFERER,
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        comm: { ...commonParams, ct: 24, cv: 0 },
        fm: {
          module: 'music.web_fm_svr',
          method: 'GetPrivateFmPlaylist',
          param: { enc: 'utf8', moter: 0, uin: 0, login: 0 }
        }
      }),
      signal: controller.signal
    });
    const payload = JSON.parse(await response.text());
    const fmModule = isRecord(payload?.fm) ? payload.fm : null;
    const candidates = findTrackArrays(fmModule?.data, ['fm', 'data']);
    const selected = selectCandidate(candidates);
    const summary = {
      httpStatus: response.status,
      topLevelCode: readFiniteNumber(payload?.code),
      moduleCode: readFiniteNumber(fmModule?.code),
      dataKeys: getSafeKeys(fmModule?.data),
      candidateArrayPaths: candidates.map((candidate) => candidate.path.join('.')),
      songArrayPath: selected?.path.join('.') ?? null,
      songCount: selected?.items.length ?? 0,
      validTrackCount: selected?.items.filter(isTrackLike).length ?? 0
    };
    if (!response.ok || summary.topLevelCode !== 0 || summary.moduleCode !== 0) {
      printReport({ outcome: 'business_failure', session: safeSessionSummary(), response: summary });
      process.exitCode = 1;
      return;
    }
    if (!selected || summary.validTrackCount === 0) {
      printReport({ outcome: 'song_array_not_found', session: safeSessionSummary(), response: summary });
      process.exitCode = 1;
      return;
    }

    const firstTrack = selected.items.find(isTrackLike);
    const playback = await verifyFirstTrackPlayback(firstTrack);
    const fixture = createFixture(selected.path, selected.items.filter(isTrackLike).slice(0, 3));
    const outcome = playback.playable ? 'success' : 'playback_unavailable';
    printReport({ outcome, session: safeSessionSummary(), response: summary, playback, fixture });
    if (outcome !== 'success') {
      process.exitCode = 1;
    }

    function safeSessionSummary() {
      return {
        accountIdentityPresent: true,
        musicSessionPresent: true,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      };
    }
  } catch (error) {
    printReport({ outcome: error?.name === 'AbortError' ? 'transport_timeout' : 'transport_failure' });
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUserAgent(loginSession) {
  const current = loginSession.getUserAgent();
  const compatible = current.replace(/\sElectron\/[\d.]+/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (compatible !== current) {
    loginSession.setUserAgent(compatible, 'zh-CN,zh;q=0.9,en;q=0.8');
  }
}

async function readCookieMap(loginSession) {
  const groups = await Promise.all([
    loginSession.cookies.get({ url: 'https://y.qq.com/' }),
    loginSession.cookies.get({ url: QQ_MUSICU_URL }),
    loginSession.cookies.get({ url: 'https://ptlogin2.qq.com/' })
  ]);
  const cookieMap = new Map();
  groups.flat().forEach((cookie) => {
    if (!cookieMap.has(cookie.name) || cookie.value) cookieMap.set(cookie.name, cookie.value);
  });
  return cookieMap;
}

function resolveLoginUin(cookieMap) {
  const normalized = firstText(
    cookieMap.get('uin'),
    cookieMap.get('p_uin'),
    cookieMap.get('qqmusic_uin'),
    cookieMap.get('wxuin')
  ).replace(/^o0*/i, '').replace(/^0+/, '');
  return /^\d+$/.test(normalized) ? normalized : '';
}

function calculateGtk(skey) {
  let hash = 5381;
  for (const character of skey) hash += (hash << 5) + character.charCodeAt(0);
  return hash & 0x7fffffff;
}

function hasAnyCookie(cookieMap, names) {
  return names.some((name) => Boolean(firstText(cookieMap.get(name))));
}

function findTrackArrays(value, pathParts, depth = 0) {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.some(isTrackLike) ? [{ path: pathParts, items: value }] : [];
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => (
    isSafeKey(key) ? findTrackArrays(nested, [...pathParts, key], depth + 1) : []
  ));
}

function selectCandidate(candidates) {
  return [...candidates].sort((left, right) => right.items.length - left.items.length)[0] ?? null;
}

function isTrackLike(value) {
  const track = unwrapTrack(value);
  return Boolean(track && firstText(track.mid, track.songmid, track.id, track.songid) && firstText(track.name, track.songname, track.title));
}

function unwrapTrack(value) {
  if (!isRecord(value)) return null;
  return [value.track_info, value.songInfo, value.songinfo, value.song].find(isRecord) ?? value;
}

function createFixture(pathParts, tracks) {
  const fixture = { code: 0, fm: { code: 0, data: {} } };
  const relativePath = pathParts.slice(2);
  let target = fixture.fm.data;
  relativePath.forEach((key, index) => {
    if (index === relativePath.length - 1) {
      target[key] = tracks.map((track, trackIndex) => sanitizeTrack(track, trackIndex));
    } else {
      target[key] = {};
      target = target[key];
    }
  });
  return fixture;
}

function sanitizeTrack(value, index) {
  const track = unwrapTrack(value);
  const ordinal = String(index + 1).padStart(2, '0');
  return {
    mid: `PRIVATE_FM_SONG_${ordinal}`,
    name: `Fixture Private FM Song ${ordinal}`,
    interval: 180 + index,
    singer: [{ mid: `PRIVATE_FM_ARTIST_${ordinal}`, name: `Fixture Artist ${ordinal}` }],
    album: { mid: `PRIVATE_FM_ALBUM_${ordinal}`, name: `Fixture Album ${ordinal}` },
    ...(isRecord(track?.file) ? { file: { media_mid: `PRIVATE_FM_MEDIA_${ordinal}` } } : {})
  };
}

async function verifyFirstTrackPlayback(value) {
  const track = unwrapTrack(value);
  const platformSongId = firstText(track?.mid, track?.songmid);
  const file = isRecord(track?.file) ? track.file : {};
  const platformMediaId = firstText(file.media_mid, file.mediaMid, file.strMediaMid);
  if (!/^[A-Za-z0-9]+$/.test(platformSongId)) {
    return { attempted: false, playable: false, reason: 'song_mid_unavailable' };
  }

  try {
    const { createQQProvider } = require('../dist-electron/providers/qqProvider.cjs');
    const result = await createQQProvider().getSongUrl({
      id: `qq:${platformSongId}`,
      providerId: 'qq',
      platformSongId,
      ...(platformMediaId ? { platformMediaId } : {}),
      title: 'Private FM playback probe',
      artist: 'Private FM artist',
      album: 'Private FM album',
      durationMs: 0,
      coverTone: '#000000'
    }, 'standard');
    return {
      attempted: true,
      playable: Boolean(result?.ok && result.url),
      reason: result?.reason?.category ?? null
    };
  } catch {
    return { attempted: true, playable: false, reason: 'playback_check_failed' };
  }
}

function getSafeKeys(value) {
  return isRecord(value) ? Object.keys(value).filter(isSafeKey).sort() : [];
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
