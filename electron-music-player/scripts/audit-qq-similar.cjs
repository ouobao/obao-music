const path = require('node:path');
const electron = require('electron');

const { app, session } = electron;

const USER_DATA_DIRECTORY = 'electron-music-player';
const QQ_LOGIN_PARTITION = 'persist:musicplayer-qq-login';
const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_PLAYER_REFERER = 'https://y.qq.com/portal/player.html';
const PUBLIC_SEED_MID = '0039MnYb0qxYhV';
const REQUEST_TIMEOUT_MS = 12_000;
const FIXTURE_TRACK_LIMIT = 3;

app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIRECTORY));

async function main() {
  await app.whenReady();

  const loginSession = session.fromPartition(QQ_LOGIN_PARTITION);
  normalizeUserAgent(loginSession);

  const cookieMap = await readCookieMap(loginSession);
  const loginUin = resolveLoginUin(cookieMap);
  const hasMusicSession = hasAnyCookie(cookieMap, ['qqmusic_key', 'qm_keyst', 'p_skey', 'skey']);
  const hasPlaybackAuthorization = hasAnyCookie(cookieMap, ['qqmusic_key', 'qm_keyst']);
  const sessionReady = Boolean(loginUin && hasMusicSession);

  if (!sessionReady) {
    printReport({
      outcome: 'session_not_ready',
      session: {
        accountIdentityPresent: Boolean(loginUin),
        musicSessionPresent: hasMusicSession,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      }
    });
    return;
  }

  const commonParams = {
    g_tk: 1124214810,
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
  const requestBody = {
    comm: {
      ...commonParams,
      ct: 24,
      cv: 0
    },
    similarSong: {
      method: 'get_similar_song_info',
      module: 'music.web_srf_svr',
      param: {
        songid: 0,
        songmid: PUBLIC_SEED_MID,
        num: 20
      }
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let rawResponse;

  try {
    response = await loginSession.fetch(requestUrl.toString(), {
      method: 'POST',
      referrer: QQ_PLAYER_REFERER,
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    rawResponse = JSON.parse(await response.text());
  } catch (error) {
    printReport({
      outcome: error && error.name === 'AbortError' ? 'transport_timeout' : 'transport_failure',
      session: {
        accountIdentityPresent: true,
        musicSessionPresent: true,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      }
    });
    return;
  } finally {
    clearTimeout(timeout);
  }

  const topLevelCode = readBusinessCode(rawResponse && rawResponse.code);
  const similarModule = isRecord(rawResponse && rawResponse.similarSong)
    ? rawResponse.similarSong
    : null;
  const moduleCode = readBusinessCode(similarModule && similarModule.code);
  const safeSummary = {
    httpStatus: response.status,
    topLevelCode,
    moduleCode,
    dataKeys: getSafeKeys(similarModule && similarModule.data)
  };

  if (!response.ok || topLevelCode !== 0 || moduleCode !== 0) {
    printReport({
      outcome: 'business_failure',
      session: {
        accountIdentityPresent: true,
        musicSessionPresent: true,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      },
      response: safeSummary
    });
    return;
  }

  const candidates = findTrackArrays(similarModule && similarModule.data, ['similarSong', 'data']);
  const selectedCandidate = selectTrackArray(candidates);
  if (!selectedCandidate) {
    printReport({
      outcome: 'song_array_not_found',
      session: {
        accountIdentityPresent: true,
        musicSessionPresent: true,
        playbackAuthorizationPresent: hasPlaybackAuthorization
      },
      response: {
        ...safeSummary,
        candidateArrayPaths: candidates.map((candidate) => candidate.path.join('.'))
      }
    });
    return;
  }

  const fixtureTracks = selectedCandidate.items
    .filter(isTrackLike)
    .slice(0, FIXTURE_TRACK_LIMIT)
    .map((track, index) => sanitizeTrack(track, index));
  const fixture = {
    code: 0,
    similarSong: {
      code: 0,
      data: {}
    }
  };
  setFixtureArray(fixture, selectedCandidate.path, fixtureTracks);

  const playback = await verifyFirstTrackPlayback(selectedCandidate.items.find(isTrackLike));
  printReport({
    outcome: 'success',
    session: {
      accountIdentityPresent: true,
      musicSessionPresent: true,
      playbackAuthorizationPresent: hasPlaybackAuthorization
    },
    response: {
      ...safeSummary,
      songArrayPath: selectedCandidate.path.join('.'),
      songCount: selectedCandidate.items.length
    },
    playback,
    fixture
  });
}

function normalizeUserAgent(loginSession) {
  const currentUserAgent = loginSession.getUserAgent();
  const browserParts = currentUserAgent.match(
    /^(Mozilla\/5\.0 \([^)]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)).*?(Chrome\/[\d.]+).*?(Safari\/[\d.]+)$/i
  );
  const compatibleUserAgent = browserParts
    ? `${browserParts[1]} ${browserParts[2]} ${browserParts[3]}`
    : currentUserAgent.replace(/\sElectron\/[\d.]+/gi, '').replace(/\s{2,}/g, ' ').trim();

  if (compatibleUserAgent !== currentUserAgent) {
    loginSession.setUserAgent(compatibleUserAgent, 'zh-CN,zh;q=0.9,en;q=0.8');
  }
}

async function readCookieMap(loginSession) {
  const cookieGroups = await Promise.all([
    loginSession.cookies.get({ url: 'https://y.qq.com/' }),
    loginSession.cookies.get({ url: QQ_MUSICU_URL }),
    loginSession.cookies.get({ url: 'https://ptlogin2.qq.com/' })
  ]);
  const cookieMap = new Map();
  cookieGroups.flat().forEach((cookie) => {
    if (!cookieMap.has(cookie.name) || cookie.value) {
      cookieMap.set(cookie.name, cookie.value);
    }
  });
  return cookieMap;
}

function resolveLoginUin(cookieMap) {
  const rawValue = firstText(
    cookieMap.get('uin'),
    cookieMap.get('p_uin'),
    cookieMap.get('qqmusic_uin'),
    cookieMap.get('wxuin')
  );
  const normalized = rawValue.replace(/^o0*/i, '').replace(/^0+/, '');
  return /^\d+$/.test(normalized) ? normalized : '';
}

function hasAnyCookie(cookieMap, names) {
  return names.some((name) => firstText(cookieMap.get(name)).length > 0);
}

function findTrackArrays(value, pathParts, depth = 0) {
  if (depth > 6) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.some(isTrackLike) ? [{ path: pathParts, items: value }] : [];
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    if (!isSafeKey(key)) {
      return [];
    }
    return findTrackArrays(nestedValue, [...pathParts, key], depth + 1);
  });
}

function selectTrackArray(candidates) {
  return [...candidates].sort((left, right) => {
    const leftPreferred = /songInfoList$/i.test(left.path.at(-1) || '') ? 1 : 0;
    const rightPreferred = /songInfoList$/i.test(right.path.at(-1) || '') ? 1 : 0;
    return rightPreferred - leftPreferred || right.items.length - left.items.length;
  })[0] || null;
}

function isTrackLike(value) {
  const track = unwrapTrack(value);
  if (!track) {
    return false;
  }
  const songMid = firstText(track.mid, track.songmid, value && value.mid, value && value.songmid);
  const title = firstText(track.name, track.songname, track.title, value && value.name, value && value.songname, value && value.title);
  return Boolean(songMid && title);
}

function unwrapTrack(value) {
  if (!isRecord(value)) {
    return null;
  }
  return [value.track_info, value.songInfo, value.songinfo, value.song].find(isRecord) || value;
}

function sanitizeTrack(rawValue, index) {
  const wrapperKey = ['track_info', 'songInfo', 'songinfo', 'song']
    .find((key) => isRecord(rawValue && rawValue[key]));
  const rawTrack = wrapperKey ? rawValue[wrapperKey] : rawValue;
  const syntheticTrack = {};
  const ordinal = String(index + 1).padStart(2, '0');

  copySyntheticField(rawTrack, syntheticTrack, ['mid', 'songmid'], `SIMILAR_SONG_MID_${ordinal}`);
  copySyntheticField(rawTrack, syntheticTrack, ['id', 'songid'], 100_000 + index + 1);
  copySyntheticField(rawTrack, syntheticTrack, ['name', 'songname', 'title'], `Fixture Similar Song ${ordinal}`);
  copySyntheticField(rawTrack, syntheticTrack, ['interval'], 180 + index);

  const rawArtists = Array.isArray(rawTrack.singer)
    ? rawTrack.singer
    : Array.isArray(rawTrack.singers)
      ? rawTrack.singers
      : [];
  const artistKey = Array.isArray(rawTrack.singer) ? 'singer' : Array.isArray(rawTrack.singers) ? 'singers' : null;
  if (artistKey) {
    syntheticTrack[artistKey] = rawArtists.slice(0, 2).map((rawArtist, artistIndex) => {
      const syntheticArtist = {};
      const artistOrdinal = `${ordinal}_${artistIndex + 1}`;
      copySyntheticField(rawArtist, syntheticArtist, ['mid', 'singerMid', 'singer_mid', 'singermid'], `SIMILAR_ARTIST_MID_${artistOrdinal}`);
      copySyntheticField(rawArtist, syntheticArtist, ['id'], 200_000 + index * 10 + artistIndex + 1);
      copySyntheticField(rawArtist, syntheticArtist, ['name', 'title', 'singer'], `Fixture Artist ${artistOrdinal}`);
      return syntheticArtist;
    });
  }

  if (isRecord(rawTrack.album)) {
    syntheticTrack.album = {};
    copySyntheticField(rawTrack.album, syntheticTrack.album, ['mid', 'pmid', 'albumMid', 'album_mid'], `SIMILAR_ALBUM_MID_${ordinal}`);
    copySyntheticField(rawTrack.album, syntheticTrack.album, ['id'], 300_000 + index + 1);
    copySyntheticField(rawTrack.album, syntheticTrack.album, ['name', 'title'], `Fixture Album ${ordinal}`);
  }

  if (isRecord(rawTrack.file)) {
    syntheticTrack.file = {};
    copySyntheticField(rawTrack.file, syntheticTrack.file, ['media_mid', 'mediaMid', 'strMediaMid'], `SIMILAR_MEDIA_MID_${ordinal}`);
  }

  return wrapperKey ? { [wrapperKey]: syntheticTrack } : syntheticTrack;
}

function copySyntheticField(source, target, candidates, value) {
  if (!isRecord(source)) {
    return;
  }
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(source, candidate));
  if (!key) {
    return;
  }
  target[key] = typeof source[key] === 'number' && typeof value !== 'number'
    ? Number(String(value).replace(/\D/g, '').slice(-6)) || 1
    : value;
}

function setFixtureArray(fixture, absolutePath, tracks) {
  const relativePath = absolutePath.slice(2);
  let target = fixture.similarSong.data;
  relativePath.forEach((key, index) => {
    if (index === relativePath.length - 1) {
      target[key] = tracks;
      return;
    }
    target[key] = {};
    target = target[key];
  });
}

async function verifyFirstTrackPlayback(rawValue) {
  const track = unwrapTrack(rawValue);
  const platformSongId = firstText(track && track.mid, track && track.songmid, rawValue && rawValue.mid, rawValue && rawValue.songmid);
  const file = isRecord(track && track.file) ? track.file : {};
  const platformMediaId = firstText(file.media_mid, file.mediaMid, file.strMediaMid);
  if (!/^[A-Za-z0-9]+$/.test(platformSongId)) {
    return { attempted: false, playable: false, reason: 'song_mid_unavailable' };
  }

  try {
    const { createQQProvider } = require('../dist-electron/providers/qqProvider.cjs');
    const provider = createQQProvider();
    const result = await provider.getSongUrl({
      id: `qq:${platformSongId}`,
      providerId: 'qq',
      platformSongId,
      ...(platformMediaId ? { platformMediaId } : {}),
      title: 'Fixture playback probe',
      artist: 'Fixture artist',
      album: 'Fixture album',
      durationMs: 0,
      coverTone: '#000000'
    }, 'standard');
    return {
      attempted: true,
      playable: Boolean(result && result.ok && result.url),
      reason: result && result.reason && typeof result.reason.category === 'string'
        ? result.reason.category
        : null
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

function readBusinessCode(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch(() => {
    printReport({ outcome: 'audit_failure' });
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
