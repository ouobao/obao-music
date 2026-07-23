import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productionFiles = [
  'src/shared/musicTypes.ts',
  'src/shared/providerTypes.ts',
  'src/renderer/components/HomeView.tsx',
  'src/renderer/components/discovery/DiscoveryHomeHeader.tsx',
  'src/renderer/components/discovery/DiscoverySectionHeader.tsx',
  'src/renderer/components/discovery/DiscoverySectionState.tsx',
  'src/renderer/components/discovery/NeteaseDiscoveryHome.tsx',
  'src/renderer/components/discovery/QQDiscoveryHome.tsx',
  'src/renderer/components/discovery/discoverySelection.ts',
  'src/renderer/components/LoginDialog.tsx',
  'src/renderer/components/LyricsPanel.tsx',
  'src/renderer/components/QueuePanel.tsx',
  'src/renderer/components/Sidebar.tsx',
  'src/renderer/components/TopBar.tsx',
  'src/renderer/state/lyricsStore.ts',
  'src/renderer/state/playerStore.ts',
  'src/renderer/state/radioSessionStore.ts',
  'src/renderer/state/discoveryHomeStore.ts',
  'src/renderer/state/providerSessionStore.ts',
  'src/renderer/utils/providerDisplay.ts',
  'electron/main.cts',
  'electron/providers/types.cts',
  'electron/storage/schema.cts'
];

describe('production mock removal contract', () => {
  it('does not ship the offline mock data or mock provider modules', () => {
    expect(existsSync(resolve(process.cwd(), 'src/renderer/data/mockLibrary.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'electron/providers/mockProvider.cts'))).toBe(false);
  });

  it('keeps production provider code free of mock provider references', () => {
    for (const relativePath of productionFiles) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');

      expect(source, relativePath).not.toMatch(/\bmock\b|Mock Provider|mockLibrary|mockProvider/);
    }
  });
});
