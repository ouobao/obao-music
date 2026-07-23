import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const visibleTextFiles = [
  'src/renderer/App.tsx',
  'src/renderer/components/HomeView.tsx',
  'src/renderer/components/discovery/DiscoveryHomeHeader.tsx',
  'src/renderer/components/discovery/DiscoverySectionHeader.tsx',
  'src/renderer/components/discovery/DiscoverySectionState.tsx',
  'src/renderer/components/discovery/NeteaseDiscoveryHome.tsx',
  'src/renderer/components/discovery/QQDiscoveryHome.tsx',
  'src/renderer/components/Sidebar.tsx',
  'src/renderer/components/TopBar.tsx',
  'src/renderer/components/PlayerBar.tsx',
  'src/renderer/components/SearchResultsView.tsx',
  'src/renderer/components/PlaylistDetailView.tsx',
  'src/renderer/components/QueuePanel.tsx',
  'src/renderer/components/LyricsPanel.tsx'
];

const mojibakeTokens = [
  '绐楀彛',
  '鏈€',
  '鍏抽棴',
  '鎼滅储',
  '姝屽崟',
  '闊充箰',
  '鐧诲綍',
  '鎾斁'
];

describe('visible text encoding contract', () => {
  it('keeps renderer-visible Chinese labels readable UTF-8', () => {
    const matches = visibleTextFiles.flatMap((relativePath) => {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');

      return mojibakeTokens
        .filter((token) => source.includes(token))
        .map((token) => `${relativePath}: ${token}`);
    });

    expect(matches).toEqual([]);
  });
});
