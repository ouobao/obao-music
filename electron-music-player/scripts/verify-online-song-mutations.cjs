const { resolve } = require('node:path');
const { _electron: electron } = require('playwright');

const CONFIRMATION_FLAG = '--confirmed-online-mutations';
const PROJECT_ROOT = resolve(__dirname, '..');

if (!process.argv.includes(CONFIRMATION_FLAG)) {
  console.error(`Refusing to write online playlists without ${CONFIRMATION_FLAG}.`);
  process.exit(2);
}

main().catch((error) => {
  console.error(JSON.stringify({ outcome: 'runner_failed', message: safeMessage(error) }));
  process.exitCode = 1;
});

async function main() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;

  const electronApp = await electron.launch({
    executablePath: require('electron'),
    args: [PROJECT_ROOT],
    cwd: PROJECT_ROOT,
    env
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForFunction(() => Boolean(window.musicPlayer?.music), undefined, { timeout: 30_000 });
    const providerArgument = process.argv.find((argument) => argument.startsWith('--provider='));
    const requestedProvider = providerArgument?.slice('--provider='.length);
    const providerIds = requestedProvider === 'qq' || requestedProvider === 'netease'
      ? [requestedProvider]
      : ['qq', 'netease'];
    const operationArgument = process.argv.find((argument) => argument.startsWith('--operation='));
    const requestedOperation = operationArgument?.slice('--operation='.length);
    const operation = requestedOperation === 'like' || requestedOperation === 'playlist'
      ? requestedOperation
      : 'all';
    const report = await page.evaluate(runOnlineMutationAudit, { providerIds, operation });
    console.log(JSON.stringify(report));

    if (report.outcome !== 'passed') {
      process.exitCode = 1;
    }
  } finally {
    await electronApp.close();
  }
}

async function runOnlineMutationAudit({ providerIds, operation }) {
  const api = window.musicPlayer.music;
  const providers = [];

  for (const providerId of providerIds) {
    providers.push(await auditProvider(providerId));
  }

  return {
    outcome: providers.every((provider) => (
      (operation === 'playlist' || provider.like === 'passed')
      && (operation === 'like' || provider.playlist === 'passed')
      && provider.cleanup === 'passed'
    )) ? 'passed' : 'incomplete',
    operation,
    providers
  };

  async function auditProvider(providerId) {
    const result = {
      providerId,
      login: 'unchecked',
      like: 'not_run',
      playlist: 'not_run',
      cleanup: 'not_run',
      message: null,
      diagnostics: {
        likedTracks: 0,
        targetTracks: 0,
        searchResults: 0,
        eligibleSearchResults: 0
      }
    };
    let likedPlaylist = null;
    let targetPlaylist = null;
    let candidate = null;

    try {
      const loginStatus = unwrap(await api.getLoginStatus(providerId));
      if (!loginStatus.loggedIn) {
        result.login = 'not_logged_in';
        result.message = 'Provider is not logged in.';
        return result;
      }
      result.login = 'passed';

      const playlists = unwrap(await api.getUserPlaylists(providerId, { forceRefresh: true }));
      likedPlaylist = playlists.find((playlist) => playlist.isLiked) ?? null;
      targetPlaylist = playlists.find((playlist) => playlist.ownership === 'created' && !playlist.isLiked) ?? null;
      if (!likedPlaylist) {
        result.message = 'Online liked playlist was not found.';
        return result;
      }

      const likedTracks = unwrap(await api.getPlaylistTracks(providerId, likedPlaylist.id, { forceRefresh: true }));
      const targetTracks = targetPlaylist
        ? unwrap(await api.getPlaylistTracks(providerId, targetPlaylist.id, { forceRefresh: true }))
        : [];
      result.diagnostics.likedTracks = likedTracks.length;
      result.diagnostics.targetTracks = targetTracks.length;
      const occupiedSongIds = new Set([...likedTracks, ...targetTracks].map((song) => song.id));
      candidate = await findCandidate(providerId, occupiedSongIds, result.diagnostics);
      if (!candidate) {
        result.message = 'No reversible candidate song was found.';
        return result;
      }

      if (operation !== 'like' && targetPlaylist) {
        try {
          unwrap(await api.addSongToPlaylist(providerId, candidate, targetPlaylist.id));
          assert(await waitForMembership(providerId, targetPlaylist.id, candidate.id, true), 'Add was not visible online.');
          unwrap(await api.removeSongFromPlaylist(providerId, candidate, targetPlaylist.id));
          assert(await waitForMembership(providerId, targetPlaylist.id, candidate.id, false), 'Remove was not visible online.');
          result.playlist = 'passed';
        } catch (error) {
          result.playlist = 'failed';
          result.message = safeMessageInPage(error);
        }
      } else if (operation !== 'like') {
        result.playlist = 'skipped_no_created_playlist';
      } else {
        result.playlist = 'skipped_by_filter';
      }

      if (operation !== 'playlist') {
        try {
          unwrap(await api.setSongLiked(providerId, candidate, true));
          assert(await waitForMembership(providerId, likedPlaylist.id, candidate.id, true), 'Like was not visible online.');
          unwrap(await api.setSongLiked(providerId, candidate, false));
          assert(await waitForMembership(providerId, likedPlaylist.id, candidate.id, false), 'Unlike was not visible online.');
          result.like = 'passed';
        } catch (error) {
          result.like = 'failed';
          result.message = result.message ?? safeMessageInPage(error);
        }
      } else {
        result.like = 'skipped_by_filter';
      }
    } catch (error) {
      result.message = safeMessageInPage(error);
    } finally {
      if (candidate && likedPlaylist) {
        const likedRestored = await restoreAbsent(
          providerId,
          likedPlaylist.id,
          candidate,
          () => api.setSongLiked(providerId, candidate, false)
        );
        const playlistRestored = !targetPlaylist || await restoreAbsent(
          providerId,
          targetPlaylist.id,
          candidate,
          () => api.removeSongFromPlaylist(providerId, candidate, targetPlaylist.id)
        );
        result.cleanup = likedRestored && playlistRestored ? 'passed' : 'failed';
      } else {
        result.cleanup = 'not_needed';
      }
    }

    return result;
  }

  async function findCandidate(providerId, occupiedSongIds, diagnostics) {
    const keywords = [
      '\u6674\u5929',
      '\u591c\u66f2',
      '\u7a3b\u9999',
      '\u6d77\u9614\u5929\u7a7a',
      '\u5de6\u8f6c\u706f 1000 Times +1',
      'mac ova seas',
      '\u6d3e\u4f1f\u4fca \u5de6\u8f6c\u706f',
      '\u58f0\u751f\u4e0d\u606f \u7b2c4\u671f'
    ];

    for (const keyword of keywords) {
      const searchResult = unwrap(await api.searchEntities(providerId, keyword, {
        entityTypes: ['song'],
        limit: 30,
        offset: 0
      }));
      const songs = searchResult.sections.songs.items;
      diagnostics.searchResults += songs.length;
      diagnostics.eligibleSearchResults += songs.filter((song) => (
        song.providerId === providerId && !occupiedSongIds.has(song.id)
      )).length;
      const candidate = songs.find((song) => (
        song.providerId === providerId && !occupiedSongIds.has(song.id)
      ));
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  async function waitForMembership(providerId, playlistId, songId, expected) {
    for (const delayMs of [0, 400, 900, 1500]) {
      if (delayMs > 0) {
        await delay(delayMs);
      }
      const result = await api.getPlaylistTracks(providerId, playlistId, { forceRefresh: true });
      if (!result.ok) {
        continue;
      }
      const present = result.data.some((song) => song.id === songId);
      if (present === expected) {
        return true;
      }
    }
    return false;
  }

  async function restoreAbsent(providerId, playlistId, song, remove) {
    if (await waitForMembership(providerId, playlistId, song.id, false)) {
      return true;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await remove();
      } catch {
        // The authoritative read below decides whether cleanup succeeded.
      }
      if (await waitForMembership(providerId, playlistId, song.id, false)) {
        return true;
      }
    }

    return false;
  }

  function unwrap(result) {
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.data;
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function delay(delayMs) {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  function safeMessageInPage(error) {
    return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
  }
}

function safeMessage(error) {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}
