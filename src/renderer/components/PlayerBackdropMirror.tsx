import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { Song } from '../../shared/musicTypes';

type PlayerBackdropMirrorMode = 'search' | 'playlist' | 'home';

interface PlayerBackdropMirrorProps {
  mode: PlayerBackdropMirrorMode;
  songs: Song[];
}

const maxMirrorRows = 6;

const listSelectorByMode: Record<PlayerBackdropMirrorMode, string> = {
  search: '.qq-search-song-list',
  playlist: '.playlist-detail-song-list',
  home: '.main-content'
};

const rowSelectorByMode: Record<PlayerBackdropMirrorMode, string> = {
  search: '.search-result-row',
  playlist: '.playlist-detail-song-row',
  home: '.qq-rail-card, .qq-daily-card'
};

export function PlayerBackdropMirror({ mode, songs }: PlayerBackdropMirrorProps) {
  const [visibleSongIds, setVisibleSongIds] = useState<string[]>([]);
  const songById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const fallbackSongs = useMemo(() => songs.slice(-maxMirrorRows), [songs]);
  const visibleSongs = visibleSongIds.map((songId) => songById.get(songId)).filter((song): song is Song => Boolean(song));
  const mirroredSongs = visibleSongs.length > 0 ? visibleSongs : fallbackSongs;

  useEffect(() => {
    if (mode === 'home' || songs.length === 0) {
      setVisibleSongIds([]);
      return undefined;
    }

    const list = document.querySelector<HTMLElement>(listSelectorByMode[mode]);
    if (!list) {
      setVisibleSongIds([]);
      return undefined;
    }

    let frameId = 0;
    const updateVisibleSongs = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const listRect = list.getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll<HTMLElement>(rowSelectorByMode[mode]));
        const visibleRows = rows.filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        });
        const nextSongIds = visibleRows.slice(-maxMirrorRows).map((row) => row.dataset.songId).filter((songId): songId is string => Boolean(songId));

        setVisibleSongIds((currentSongIds) => (
          areStringArraysEqual(currentSongIds, nextSongIds) ? currentSongIds : nextSongIds
        ));
      });
    };

    updateVisibleSongs();
    list.addEventListener('scroll', updateVisibleSongs, { passive: true });
    window.addEventListener('resize', updateVisibleSongs);

    return () => {
      window.cancelAnimationFrame(frameId);
      list.removeEventListener('scroll', updateVisibleSongs);
      window.removeEventListener('resize', updateVisibleSongs);
    };
  }, [mode, songs.length]);

  if (mirroredSongs.length === 0) {
    return null;
  }

  return (
    <div className="player-backdrop-live" data-player-backdrop-live="true" data-player-backdrop-mode={mode} aria-hidden="true">
      <div className="player-backdrop-live-list">
        {mirroredSongs.map((song) => (
          <div className="player-backdrop-live-row" data-song-id={song.id} key={song.id}>
            <span
              className="player-backdrop-live-cover"
              style={
                {
                  '--cover-tone': song.coverTone,
                  '--song-cover-image': song.coverUrl ? `url("${song.coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                } as CSSProperties
              }
            />
            <span className="player-backdrop-live-main">
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
            </span>
            <span className="player-backdrop-live-album">{song.album}</span>
            <span className="player-backdrop-live-duration">{formatDuration(song.durationMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
