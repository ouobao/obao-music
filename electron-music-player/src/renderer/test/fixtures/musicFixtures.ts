import type { Playlist, Song } from '../../../shared/musicTypes';

export const qqSearchSongs: Song[] = [
  {
    id: 'qq:visual-song-1',
    providerId: 'qq',
    platformSongId: 'visual-song-1',
    title: '夏日通勤',
    artist: '绿洲合唱团',
    album: '城市微光',
    durationMs: 213000,
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
    coverUrl: 'https://example.test/covers/summer.jpg',
    sourceContext: {
      type: 'search',
      providerId: 'qq',
      searchKeyword: '夏日'
    }
  },
  {
    id: 'qq:visual-song-2',
    providerId: 'qq',
    platformSongId: 'visual-song-2',
    title: '夜航片刻',
    artist: '城市漫游者',
    album: '晚风频率',
    durationMs: 248000,
    coverTone: 'linear-gradient(135deg, #7bb8f3, #31c27c)',
    coverUrl: 'https://example.test/covers/night.jpg',
    sourceContext: {
      type: 'search',
      providerId: 'qq',
      searchKeyword: '夏日'
    }
  }
];

export const neteaseFixtureSong: Song = {
  id: 'netease:fixture-song-1',
  providerId: 'netease',
  platformSongId: 'fixture-song-1',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  durationMs: 269000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://p1.music.126.net/song.jpg',
  sourceContext: {
    type: 'playlist',
    providerId: 'netease',
    playlistId: 'netease:fixture-playlist',
    playlistTitle: '网易云精选'
  }
};

export const qqHomePlaylists: Playlist[] = [
  {
    id: 'qq:daily-drive',
    providerId: 'qq',
    title: '夏日通勤',
    description: '适合今天路上的轻快节奏',
    songIds: ['qq:visual-song-1'],
    coverTone: 'linear-gradient(135deg, #bfe5ff, #7bb8f3)',
    coverUrl: 'https://example.test/covers/daily.jpg',
    sourceLabel: 'QQ 音乐'
  },
  {
    id: 'qq:city-pop',
    providerId: 'qq',
    title: '城市微光',
    description: '流行、电子与轻摇滚',
    songIds: ['qq:visual-song-2'],
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
    coverUrl: 'https://example.test/covers/city.jpg',
    sourceLabel: 'QQ 音乐'
  },
  {
    id: 'qq:night-walk',
    providerId: 'qq',
    title: '夜间散步',
    description: '适合低速循环的夜色歌单',
    songIds: ['qq:visual-song-1'],
    coverTone: 'linear-gradient(135deg, #485563, #29323c)',
    coverUrl: 'https://example.test/covers/walk.jpg',
    sourceLabel: 'QQ 音乐'
  },
  {
    id: 'qq:acoustic',
    providerId: 'qq',
    title: '木吉他房间',
    description: '安静、温暖、少一点噪声',
    songIds: ['qq:visual-song-2'],
    coverTone: 'linear-gradient(135deg, #f0c27b, #4b1248)',
    coverUrl: 'https://example.test/covers/acoustic.jpg',
    sourceLabel: 'QQ 音乐'
  },
  {
    id: 'qq:focus',
    providerId: 'qq',
    title: '专注工作',
    description: '不抢注意力的背景音乐',
    songIds: ['qq:visual-song-1'],
    coverTone: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
    coverUrl: 'https://example.test/covers/focus.jpg',
    sourceLabel: 'QQ 音乐'
  },
  {
    id: 'qq:liked',
    providerId: 'qq',
    title: '最近喜欢',
    description: '最近循环最多的歌曲',
    songIds: ['qq:visual-song-2'],
    coverTone: 'linear-gradient(135deg, #ff9a9e, #fad0c4)',
    coverUrl: 'https://example.test/covers/liked.jpg',
    sourceLabel: 'QQ 音乐'
  }
];
