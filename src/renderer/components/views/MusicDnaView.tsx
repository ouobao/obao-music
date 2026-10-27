import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ProviderId, Song } from '../../../shared/musicTypes';
import { useListeningHistoryStore, type ListeningHistoryEntry } from '../../state/listeningHistoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { useUiStore } from '../../state/uiStore';
import { CoverImage } from '../CoverImage';
import { EmptyState } from '../MediaCards';
import { PlayIcon } from '../icons';
import { formatDuration } from '../../utils/format';
import { providerLabel } from '../../utils/providerDisplay';

interface DnaSong {
  song: Song;
  plays: number;
  lastPlayedAt: number;
}

interface DnaArtist {
  name: string;
  plays: number;
  songs: number;
  coverUrl?: string;
  coverTone?: string;
}

interface DnaProvider {
  providerId: ProviderId;
  label: string;
  plays: number;
  ratio: number;
}

interface DnaPersona {
  name: string;
  description: string;
}

interface DnaSummary {
  songs: DnaSong[];
  topSongs: DnaSong[];
  topArtists: DnaArtist[];
  providers: DnaProvider[];
  totalPlays: number;
  uniqueSongs: number;
  uniqueArtists: number;
  providerCount: number;
  totalMinutes: number;
  avgDurationMs: number;
  repeatRatio: number;
  nightRatio: number;
  topArtistShare: number;
  hourWeights: number[];
  peakHour: number;
  peakPlays: number;
  persona: DnaPersona;
  reading: string[];
}

const PROVIDER_ORDER: ProviderId[] = ['netease', 'qq', 'local'];

export function MusicDnaView() {
  const entries = useListeningHistoryStore((s) => s.entries);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const navigateToView = useUiStore((s) => s.navigateToView);

  const summary = useMemo(() => collectDna(entries), [entries]);

  if (!summary) {
    return (
      <div className="music-dna-view" data-reveal data-reveal-order={0}>
        <div className="page-header">
          <div className="page-header-main">
            <span className="page-kicker">Listening Genome</span>
            <h1 className="detail-title">音乐 DNA</h1>
            <span className="page-subtitle">把听歌习惯，写成一段只属于你的序列</span>
          </div>
        </div>
        <EmptyState
          title="你的音乐 DNA 还在等待样本"
          desc="播放歌曲超过 30 秒后，这里会生成你的听歌人格、生物钟和口味构成。"
          actionLabel="去发现音乐"
          onAction={() => navigateToView('home')}
        />
      </div>
    );
  }

  const { persona, topSongs, topArtists, providers, hourWeights } = summary;
  const allSongs = summary.songs.map((entry) => entry.song);
  const topListSongs = topSongs.map((entry) => entry.song);
  const maxHourWeight = Math.max(...hourWeights, 1);

  const playAll = () => {
    if (allSongs.length === 0) return;
    playSongsFromList(allSongs, 0, { type: 'history', providerId: allSongs[0].providerId });
  };

  const playTopSongs = () => {
    if (topListSongs.length === 0) return;
    playSongsFromList(topListSongs, 0, { type: 'history', providerId: topListSongs[0].providerId });
  };

  const playOrbitSong = (song: Song, orbitIndex: number) => {
    const index = topListSongs.findIndex((candidate) => candidate.id === song.id && candidate.providerId === song.providerId);
    playSongsFromList(topListSongs, index >= 0 ? index : Math.min(orbitIndex, topListSongs.length - 1), {
      type: 'history',
      providerId: song.providerId
    });
  };

  return (
    <div className="music-dna-view" data-reveal data-reveal-order={0}>
      <div className="page-header">
        <div className="page-header-main">
          <span className="page-kicker">Listening Genome</span>
          <h1 className="detail-title">音乐 DNA</h1>
          <span className="page-subtitle">
            从 {summary.totalPlays} 次有效播放、{summary.uniqueSongs} 首歌里，读出你的听歌倾向
          </span>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" type="button" onClick={playAll}>
            <PlayIcon size={14} filled />
            播放我的 DNA
          </button>
        </div>
      </div>

      <section className="dna-hero">
        <div className="dna-hero-copy">
          <span className="dna-eyebrow">你的听歌人格 · Persona</span>
          <h2 className="dna-persona-name">{persona.name}</h2>
          <p className="dna-persona-desc">{persona.description}</p>

          <div className="dna-traits">
            <span className="dna-trait">
              <strong>{Math.round(summary.nightRatio * 100)}%</strong>
              夜间浓度
            </span>
            <span className="dna-trait">
              <strong>{summary.repeatRatio.toFixed(1)}×</strong>
              循环指数
            </span>
            <span className="dna-trait">
              <strong>{summary.uniqueArtists}</strong>
              位歌手
            </span>
            <span className="dna-trait">
              <strong>{formatDuration(summary.avgDurationMs)}</strong>
              平均曲长
            </span>
          </div>

          <div className="dna-reading">
            {summary.reading.map((line) => (
              <p className="dna-reading-line" key={line}>{line}</p>
            ))}
          </div>
        </div>

        <div className="dna-hero-visual">
          <DnaOrbit songs={topSongs} totalPlays={summary.totalPlays} onPlay={playOrbitSong} />
          <span className="dna-orbit-caption">悬停暂停 · 点击封面播放</span>
        </div>
      </section>

      <div className="dna-grid">
        <section className="dna-card">
          <div className="dna-card-header">
            <div className="dna-card-heading">
              <h3 className="dna-card-title">听歌生物钟</h3>
              <span className="dna-card-sub">按最近一次播放时间估算</span>
            </div>
            <span className="dna-card-note">
              高峰 {formatClockHour(summary.peakHour)} · {summary.peakPlays} 次
            </span>
          </div>

          <div
            className="dna-clock-plot"
            role="img"
            aria-label={`24 小时播放分布，高峰在 ${formatClockHour(summary.peakHour)}`}
          >
            {hourWeights.map((weight, hour) => (
              <span
                className={`dna-clock-col${hour === summary.peakHour ? ' is-peak' : ''}`}
                key={hour}
                title={`${formatClockHour(hour)} · ${weight} 次`}
              >
                <span
                  className="dna-clock-bar"
                  style={{ height: `${Math.max(3, (weight / maxHourWeight) * 100)}%` }}
                />
              </span>
            ))}
          </div>
          <div className="dna-clock-axis" aria-hidden="true">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>

          <div className="dna-clock-foot">
            <span className="dna-clock-foot-label">累计聆听</span>
            <strong className="dna-clock-foot-value">约 {summary.totalMinutes} 分钟</strong>
            <span className="dna-clock-foot-sep">/</span>
            <span className="dna-clock-foot-note">{summary.providerCount} 个平台 · {summary.uniqueArtists} 位歌手</span>
          </div>
        </section>

        <section className="dna-card">
          <div className="dna-card-header">
            <div className="dna-card-heading">
              <h3 className="dna-card-title">口味成分</h3>
              <span className="dna-card-sub">最常出现的歌手与平台</span>
            </div>
          </div>

          <div className="dna-artist-list">
            {topArtists.slice(0, 4).map((artist, index) => (
              <div className="dna-artist-row" key={artist.name}>
                <span className="dna-artist-name" title={artist.name}>
                  <span className="dna-artist-index">{String(index + 1).padStart(2, '0')}</span>
                  {artist.name}
                </span>
                <span className="dna-artist-plays">{artist.plays} 次</span>
                <span className="dna-artist-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, (artist.plays / topArtists[0].plays) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>

          <div className="dna-platform">
            <div className="dna-platform-head">
              <span className="dna-card-sub">平台足迹</span>
              <span className="dna-platform-count">{summary.providerCount} 个平台</span>
            </div>
            <div className="dna-platform-bar" role="img" aria-label="各平台播放占比">
              {providers.map((provider) => (
                <span
                  key={provider.providerId}
                  className={`dna-platform-segment is-${provider.providerId}`}
                  style={{ width: `${provider.ratio * 100}%` }}
                  title={`${provider.label} ${Math.round(provider.ratio * 100)}%`}
                />
              ))}
            </div>
            <div className="dna-platform-legend">
              {providers.map((provider) => (
                <span className="dna-legend-item" key={provider.providerId}>
                  <span className={`dna-legend-dot is-${provider.providerId}`} aria-hidden="true" />
                  {provider.label} {Math.round(provider.ratio * 100)}%
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="dna-card dna-songs-card">
        <div className="dna-card-header">
          <div className="dna-card-heading">
            <h3 className="dna-card-title">常听曲目</h3>
            <span className="dna-card-sub">按有效播放次数排序</span>
          </div>
          <button className="btn-secondary dna-play-all" type="button" onClick={playTopSongs}>
            <PlayIcon size={12} filled />
            全部播放
          </button>
        </div>

        <div className="dna-song-list">
          {topSongs.map((entry, index) => {
            const isCurrent =
              currentSong?.id === entry.song.id && currentSong?.providerId === entry.song.providerId;
            return (
              <button
                className={`dna-song-row${isCurrent ? ' is-current' : ''}`}
                key={`${entry.song.providerId}:${entry.song.id}`}
                type="button"
                onClick={() => playOrbitSong(entry.song, index)}
                title={`播放 ${entry.song.title}`}
              >
                <span className="dna-song-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="dna-song-cover">
                  <CoverImage
                    className="dna-song-img"
                    src={entry.song.coverUrl}
                    tone={entry.song.coverTone}
                    alt=""
                    size={96}
                    fallbackIconSize={14}
                  />
                </span>
                <span className="dna-song-main">
                  <span className="dna-song-title">{entry.song.title}</span>
                  <span className="dna-song-artist">{entry.song.artist}</span>
                </span>
                <span className="dna-song-plays">{entry.plays} 次</span>
                <span className="dna-song-duration">{formatDuration(entry.song.durationMs)}</span>
                <span className="dna-song-play-icon" aria-hidden="true">
                  <PlayIcon size={13} filled />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DnaOrbit({
  songs,
  totalPlays,
  onPlay
}: {
  songs: DnaSong[];
  totalPlays: number;
  onPlay: (song: Song, index: number) => void;
}) {
  const inner = songs.slice(0, 3);
  const outer = songs.slice(3, 7);

  return (
    <div className="dna-orbit">
      <span className="dna-orbit-ring dna-orbit-ring-inner" aria-hidden="true" />
      <span className="dna-orbit-ring dna-orbit-ring-outer" aria-hidden="true" />
      <span className="dna-orbit-dot dna-orbit-dot-a" aria-hidden="true" />
      <span className="dna-orbit-dot dna-orbit-dot-b" aria-hidden="true" />

      <div className="dna-orbit-core">
        <span className="dna-core-label">DNA</span>
        <span className="dna-core-value">{totalPlays} 次播放</span>
      </div>

      <div className="dna-orbit-layer dna-orbit-layer-inner">
        {inner.map((entry, index) => (
          <OrbitCover
            key={`inner-${entry.song.providerId}:${entry.song.id}`}
            entry={entry}
            index={index}
            angle={index * 120 - 90}
            radius={76}
            size={46}
            onPlay={onPlay}
          />
        ))}
      </div>

      <div className="dna-orbit-layer dna-orbit-layer-outer">
        {outer.map((entry, index) => (
          <OrbitCover
            key={`outer-${entry.song.providerId}:${entry.song.id}`}
            entry={entry}
            index={index + inner.length}
            angle={index * 90 + 45}
            radius={126}
            size={54}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}

function OrbitCover({
  entry,
  index,
  angle,
  radius,
  size,
  onPlay
}: {
  entry: DnaSong;
  index: number;
  angle: number;
  radius: number;
  size: number;
  onPlay: (song: Song, index: number) => void;
}) {
  return (
    <span
      className="dna-orbit-slot"
      style={{
        '--angle': `${angle}deg`,
        '--radius': `${radius}px`,
        '--cover-size': `${size}px`
      } as CSSProperties}
    >
      <button
        className="dna-orbit-cover"
        type="button"
        title={`${entry.song.title} · ${entry.song.artist}`}
        aria-label={`播放 ${entry.song.title}`}
        onClick={() => onPlay(entry.song, index)}
      >
        <CoverImage
          className="dna-orbit-img"
          src={entry.song.coverUrl}
          tone={entry.song.coverTone}
          alt=""
          size={120}
          fallbackIconSize={13}
        />
      </button>
    </span>
  );
}

function collectDna(entries: ListeningHistoryEntry[]): DnaSummary | null {
  const songs = entries
    .map((entry) => ({
      song: entry.song,
      plays: Math.max(0, Math.round(Number(entry.qualifiedPlayCount) || 0)),
      lastPlayedAt: Number(entry.lastPlayedAt) || 0
    }))
    .filter((entry) => entry.plays > 0);
  if (songs.length === 0) return null;

  const totalPlays = songs.reduce((sum, entry) => sum + entry.plays, 0);
  if (totalPlays <= 0) return null;

  const sortedSongs = [...songs].sort((a, b) => b.plays - a.plays || b.lastPlayedAt - a.lastPlayedAt);

  const artistMap = new Map<string, DnaArtist>();
  for (const entry of songs) {
    for (const name of splitArtists(entry.song.artist)) {
      const existing = artistMap.get(name);
      if (existing) {
        existing.plays += entry.plays;
        existing.songs += 1;
      } else {
        artistMap.set(name, {
          name,
          plays: entry.plays,
          songs: 1,
          coverUrl: entry.song.coverUrl,
          coverTone: entry.song.coverTone
        });
      }
    }
  }
  const topArtists = [...artistMap.values()].sort((a, b) => b.plays - a.plays || b.songs - a.songs || a.name.localeCompare(b.name));
  const artistPlayTotal = topArtists.reduce((sum, artist) => sum + artist.plays, 0);

  const providerMap = new Map<ProviderId, number>();
  for (const entry of songs) {
    providerMap.set(entry.song.providerId, (providerMap.get(entry.song.providerId) ?? 0) + entry.plays);
  }
  const providers = PROVIDER_ORDER.filter((providerId) => providerMap.has(providerId)).map((providerId) => {
    const plays = providerMap.get(providerId) ?? 0;
    return {
      providerId,
      label: providerLabel(providerId),
      plays,
      ratio: totalPlays > 0 ? plays / totalPlays : 0
    };
  });

  const hourWeights = Array.from({ length: 24 }, () => 0);
  let nightPlays = 0;
  let weightedDurationMs = 0;
  for (const entry of songs) {
    const hour = new Date(entry.lastPlayedAt).getHours();
    hourWeights[hour] += entry.plays;
    if (hour >= 22 || hour < 6) {
      nightPlays += entry.plays;
    }
    weightedDurationMs += (entry.song.durationMs ?? 0) * entry.plays;
  }

  let peakHour = 0;
  let peakPlays = 0;
  hourWeights.forEach((weight, hour) => {
    if (weight > peakPlays) {
      peakPlays = weight;
      peakHour = hour;
    }
  });

  const uniqueSongs = songs.length;
  const uniqueArtists = topArtists.length;
  const avgDurationMs = totalPlays > 0 ? weightedDurationMs / totalPlays : 0;
  const repeatRatio = totalPlays / uniqueSongs;
  const nightRatio = nightPlays / totalPlays;
  const topArtistShare = artistPlayTotal > 0 ? topArtists[0].plays / artistPlayTotal : 0;
  const topArtist = topArtists[0];

  const persona = resolvePersona({
    nightRatio,
    repeatRatio,
    topArtistShare,
    uniqueSongs,
    uniqueArtists,
    providerCount: providers.length,
    avgDurationMs,
    topArtist
  });

  const reading = [
    `${topArtist.name} 占了你 ${Math.round(topArtistShare * 100)}% 的歌手播放，是这套基因里最稳定的片段。`,
    `你最常在${timeOfDayLabel(peakHour)} ${formatClockHour(peakHour)} 打开音乐，有 ${peakPlays} 次有效播放落在这个时段。`,
    `${providers.length} 个平台 · ${uniqueArtists} 位歌手 · ${uniqueSongs} 首歌，构成了你的听觉半径。`
  ];

  return {
    songs: sortedSongs,
    topSongs: sortedSongs.slice(0, 7),
    topArtists,
    providers,
    totalPlays,
    uniqueSongs,
    uniqueArtists,
    providerCount: providers.length,
    totalMinutes: Math.round(weightedDurationMs / 60000),
    avgDurationMs,
    repeatRatio,
    nightRatio,
    topArtistShare,
    hourWeights,
    peakHour,
    peakPlays,
    persona,
    reading
  };
}

function resolvePersona({
  nightRatio,
  repeatRatio,
  topArtistShare,
  uniqueSongs,
  uniqueArtists,
  providerCount,
  avgDurationMs,
  topArtist
}: {
  nightRatio: number;
  repeatRatio: number;
  topArtistShare: number;
  uniqueSongs: number;
  uniqueArtists: number;
  providerCount: number;
  avgDurationMs: number;
  topArtist: DnaArtist;
}): DnaPersona {
  if (nightRatio >= 0.4) {
    return {
      name: '夜航诗人',
      description: '夜色是你的前奏。别人关灯睡觉的时候，你刚把音量拧到刚好，让旋律替白天收尾。'
    };
  }

  if (repeatRatio >= 1.75) {
    return {
      name: '单曲信徒',
      description: `平均每首歌被你听了 ${repeatRatio.toFixed(1)} 遍。遇到对的声音，你会把它听成背景心跳，而不是匆匆路过的背景音。`
    };
  }

  if (topArtistShare >= 0.5 && topArtist.plays >= 3) {
    return {
      name: '专情收藏家',
      description: `${topArtist.name} 占了你 ${Math.round(topArtistShare * 100)}% 的歌手播放。你不是在听歌，是在反复确认一种偏爱。`
    };
  }

  if (uniqueSongs >= 8 && uniqueArtists / uniqueSongs >= 0.7) {
    return {
      name: '杂食探险家',
      description: '歌单没有边界，下一首永远是新的坐标。你用好奇心把不同的声音收进同一个播放列表。'
    };
  }

  if (providerCount >= 2) {
    return {
      name: '双平台候鸟',
      description: '网易云和 QQ 音乐都是你的栖息地，哪里有好歌就飞去哪里，从不为平台停下脚步。'
    };
  }

  if (avgDurationMs > 0 && avgDurationMs <= 150000) {
    return {
      name: '短曲狙击手',
      description: '三分钟以内，情绪必须到位。你偏爱短促有力的作品，不浪费任何一秒钟的前奏。'
    };
  }

  return {
    name: '日光漫游者',
    description: '不疾不徐，在熟悉的旋律里散步。你的听歌方式像午后的光，稳定、松弛，不追赶什么。'
  };
}

function splitArtists(artist: string): string[] {
  const names = artist
    .split(/\s*\/\s*|、/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : ['未知歌手'];
}

function formatClockHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function timeOfDayLabel(hour: number): string {
  if (hour < 5) return '凌晨';
  if (hour < 8) return '清晨';
  if (hour < 11) return '上午';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  if (hour < 22) return '傍晚';
  return '深夜';
}
