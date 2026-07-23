export const qqVisualRuntimeData = {
  songs: [
    {
      id: 'qq:visual-runtime-1',
      providerId: 'qq',
      platformSongId: 'visual-runtime-1',
      title: 'Visual Runtime Song 1',
      artist: 'Visual Runtime Artist',
      album: 'Visual Runtime Album',
      durationMs: 210000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceContext: {
        type: 'search',
        providerId: 'qq',
        searchKeyword: 'visual runtime'
      }
    },
    {
      id: 'qq:visual-runtime-2',
      providerId: 'qq',
      platformSongId: 'visual-runtime-2',
      title: 'Visual Runtime Song 2',
      artist: 'Visual Runtime Artist',
      album: 'Visual Runtime Album',
      durationMs: 222000,
      coverTone: 'linear-gradient(135deg, #7bb8f3, #31c27c)',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: 'qq:visual-runtime-playlist-1',
        playlistTitle: 'Visual Runtime Playlist 1'
      }
    },
    {
      id: 'qq:visual-runtime-3',
      providerId: 'qq',
      platformSongId: 'visual-runtime-3',
      title: 'Visual Runtime Song 3',
      artist: 'Second Runtime Artist',
      album: 'Runtime Late Night',
      durationMs: 234000,
      coverTone: 'linear-gradient(135deg, #485563, #29323c)',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: 'qq:visual-runtime-playlist-1',
        playlistTitle: 'Visual Runtime Playlist 1'
      }
    }
  ],
  playlists: [
    {
      id: 'qq:visual-runtime-playlist-1',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 1',
      description: 'QQ minimum deliverable playlist',
      songIds: ['qq:visual-runtime-1', 'qq:visual-runtime-2', 'qq:visual-runtime-3'],
      coverTone: 'linear-gradient(135deg, #bfe5ff, #7bb8f3)',
      sourceLabel: 'QQ 音乐'
    },
    {
      id: 'qq:visual-runtime-playlist-2',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 2',
      description: 'Second visible playlist card',
      songIds: ['qq:visual-runtime-2'],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: 'QQ 音乐'
    },
    {
      id: 'qq:visual-runtime-playlist-3',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 3',
      description: 'Third visible playlist card',
      songIds: ['qq:visual-runtime-3'],
      coverTone: 'linear-gradient(135deg, #f0c27b, #4b1248)',
      sourceLabel: 'QQ 音乐'
    },
    {
      id: 'qq:visual-runtime-playlist-4',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 4',
      description: 'Fourth visible playlist card',
      songIds: ['qq:visual-runtime-1'],
      coverTone: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
      sourceLabel: 'QQ 音乐'
    },
    {
      id: 'qq:visual-runtime-playlist-5',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 5',
      description: 'Fifth visible playlist card',
      songIds: ['qq:visual-runtime-2'],
      coverTone: 'linear-gradient(135deg, #ff9a9e, #fad0c4)',
      sourceLabel: 'QQ 音乐'
    },
    {
      id: 'qq:visual-runtime-playlist-6',
      providerId: 'qq',
      title: 'Visual Runtime Playlist 6',
      description: 'Sixth visible playlist card',
      songIds: ['qq:visual-runtime-3'],
      coverTone: 'linear-gradient(135deg, #485563, #29323c)',
      sourceLabel: 'QQ 音乐'
    }
  ],
  lyrics: '[00:01.00]Visual Runtime Song 1 lyric\n[00:12.00]Visible QQ lyric line'
} as const;
