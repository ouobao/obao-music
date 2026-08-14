import type { CSSProperties } from 'react';
import type { Playlist, ProviderId } from '../../shared/musicTypes';
import { formatProviderLabel } from '../utils/providerDisplay';

interface PlaylistSectionProps {
  playlists: Playlist[];
  onSelectPlaylist?: (providerId: ProviderId, playlistId: string) => void;
}

export function PlaylistSection({ playlists, onSelectPlaylist }: PlaylistSectionProps) {
  return (
    <section className="panel-section qq-supply-section" aria-label="账号歌单">
      <div className="section-heading">
        <div>
          <h1>账号歌单</h1>
        </div>
      </div>

      {playlists.length > 0 ? (
        <div className="playlist-grid qq-supply-grid">
          {playlists.map((playlist) => (
            <article className="playlist-card qq-supply-card" key={playlist.id}>
              <button
                className="playlist-card-open"
                type="button"
                aria-label={`打开歌单：${playlist.title}`}
                onClick={() => onSelectPlaylist?.(playlist.providerId, playlist.id)}
              >
                <span
                  className="playlist-cover"
                  style={
                    {
                      '--cover-tone': playlist.coverTone,
                      '--playlist-cover-image': createCoverImage(playlist.coverUrl)
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                <span className="source-pill">{formatProviderLabel(playlist.providerId, playlist.sourceLabel)}</span>
                <span className="playlist-card-title">{playlist.title}</span>
                <span className="playlist-card-description">{playlist.description}</span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="playlist-detail-message">暂无歌单</p>
      )}
    </section>
  );
}

function createCoverImage(coverUrl?: string): string {
  return coverUrl ? `url("${coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))';
}
