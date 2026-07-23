import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/app.css'), 'utf8');
const globalCss = readFileSync(resolve(process.cwd(), 'src/renderer/styles/global.css'), 'utf8');
const wordmarkFontPath = resolve(
  process.cwd(),
  'assets/branding/fonts/SmileySans-Oblique.ttf.woff2'
);
const wordmarkLicensePath = resolve(process.cwd(), 'assets/branding/fonts/OFL-1.1.txt');

describe('QQ Music CSS contract', () => {
  it('uses the system Chinese UI font stack without bundled font declarations', () => {
    const fontOrder = [
      '"Microsoft YaHei UI"',
      '"Microsoft YaHei"',
      '"Segoe UI"',
      'Arial',
      'sans-serif'
    ].map((font) => globalCss.indexOf(font));

    expect(fontOrder.every((index) => index >= 0)).toBe(true);
    expect(fontOrder).toEqual([...fontOrder].sort((left, right) => left - right));
    expect(globalCss).toContain('font-synthesis: none');
    expect(globalCss).not.toContain('@font-face');
  });

  it('keeps the display font scoped to the Ou Bao wordmark', () => {
    const fontFaceBlock = extractCssBlock('@font-face');
    const brandNameBlock = extractCssBlock('.brand-name');

    expect(fontFaceBlock).toContain('font-family: "OuBao Wordmark"');
    expect(fontFaceBlock).toContain('SmileySans-Oblique.ttf.woff2');
    expect(fontFaceBlock).toContain('font-weight: 400');
    expect(fontFaceBlock).toContain('unicode-range: U+4E50, U+5305, U+6B27, U+97F3');
    expect(brandNameBlock).toContain('font-family: "OuBao Wordmark", "Microsoft YaHei UI", sans-serif');
    expect(brandNameBlock).toContain('font-size: 21px');
    expect(brandNameBlock).toContain('font-weight: 400');
    expect(brandNameBlock).toContain('letter-spacing: 0');
    expect(brandNameBlock).toContain('background-image: linear-gradient(');
    expect(existsSync(wordmarkFontPath)).toBe(true);
    expect(statSync(wordmarkFontPath).size).toBeGreaterThan(1_000_000);
    expect(readFileSync(wordmarkLicensePath, 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('defines QQ Music layout tokens instead of one-off color values', () => {
    const rootBlock = extractCssBlock(':root');

    expect(rootBlock).toContain('--oubao-mint: #d84848');
    expect(rootBlock).toContain('--oubao-sky: #2f6f90');
    expect(rootBlock).toContain('--oubao-coral: #efc06a');
    expect(rootBlock).toContain('--visual-accent: #cf3434');
    expect(rootBlock).toContain('--visual-surface: #ffffff');
    expect(rootBlock).toContain('--visual-deep-surface: #f7f4f4');
    expect(rootBlock).toContain('--visual-text: #202124');
    expect(rootBlock).toContain('--visual-muted: #74666c');
    expect(rootBlock).toContain('--qq-accent: var(--visual-accent)');
    expect(rootBlock).toContain('--qq-primary-action: var(--visual-accent)');
    expect(rootBlock).toContain('--qq-on-accent: #fff7f5');
    expect(css).toContain('--qq-sidebar-width: 230px');
    expect(css).toContain('--qq-topbar-height: 64px');
    expect(css).toContain('--qq-player-height: 90px');
    expect(css).toContain('--qq-window-bg: #f7f4f4');
    expect(css).toContain('--qq-content-bg: #ffffff');
    expect(css).toContain('--qq-sidebar-bg: #f7f4f4');
    expect(css).toContain('--qq-nav-hover: #f5dede');
    expect(css).toContain('--qq-nav-active: color-mix(in srgb, #f5dede 84%, #cf3434 16%)');
    for (const token of [
      '--qq-window-gradient',
      '--qq-sidebar-gradient',
      '--qq-content-gradient',
      '--qq-panel-gradient',
      '--qq-hover-gradient',
      '--qq-active-gradient',
      '--qq-song-hover-gradient',
      '--qq-accent-gradient',
      '--qq-primary-action-gradient',
      '--qq-primary-action-hover-gradient'
    ]) {
      expect(css).toContain(`${token}: linear-gradient(`);
    }
    expect(css).toContain('--app-backdrop-blur-radius: 24px');
    expect(css).toContain('--app-scrollbar-size: 10px');
    expect(css).toContain('--qq-glass-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.18)');
    expect(css).toContain('--qq-persistent-chrome-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.12)');
  });

  it('uses one shared radius for every backdrop blur declaration', () => {
    const backdropValues = Array.from(
      css.matchAll(/(?:^|\n)\s*(?:-webkit-)?backdrop-filter:\s*(?<value>[^;]+);/g),
      (match) => match.groups?.value.trim() ?? ''
    );
    const explicitBlurValues = backdropValues.filter((value) => value.includes('blur('));
    const unsupportedBlurValues = explicitBlurValues.filter((value) => (
      !value.includes('blur(var(--app-backdrop-blur-radius))') &&
      !value.includes('blur(var(--app-blur))')
    ));
    const panelFilterValues = Array.from(
      css.matchAll(/--blur-panel:\s*(?<value>[^;]+);/g),
      (match) => match.groups?.value.trim() ?? ''
    );

    expect(explicitBlurValues.length).toBeGreaterThan(0);
    expect(unsupportedBlurValues).toEqual([]);
    expect(panelFilterValues.length).toBeGreaterThan(0);
    panelFilterValues.forEach((value) => {
      expect(value).toContain('blur(var(--app-backdrop-blur-radius))');
    });
  });

  it('uses the original soft gradients on opaque QQ structure surfaces', () => {
    const windowGradientBlock = extractCssBlock(':is(.desktop-shell)');
    const sidebarGradientBlock = extractCssBlock(
      ':is(\n  .sidebar,\n  .nav-playlist-section .nav-title,\n  .sidebar-bottom-controls\n)'
    );
    const contentGradientBlock = extractCssBlock(
      ':is(\n  .content-frame,\n  .top-bar,\n  .main-content,\n  .main-content-transition-stage,\n  .main-content-transition-layer-active\n)'
    );
    const sidebarBlock = extractCssBlockContaining('.sidebar', 'background: var(--qq-sidebar-bg)');
    const contentFrameBlock = extractCssBlockContaining('.content-frame', 'background: var(--qq-content-bg)');
    const topBarBlock = extractCssBlockContaining('.top-bar', 'background: var(--qq-content-bg)');
    const mainContentBlock = extractCssBlockContaining('.main-content', 'background: var(--qq-content-bg)');
    const transitionStageBlock = extractCssBlockContaining(
      '.main-content-transition-stage',
      'background: var(--qq-content-bg)'
    );
    const searchViewBlock = extractCssBlockContaining('.qq-search-view', 'background: transparent');
    const brandMarkGradientResetBlock = extractCssBlock(':is(.brand-mark)');
    const brandMarkImageBlock = extractCssBlock('.brand-mark img');

    expect(windowGradientBlock).toContain('background-image: var(--qq-window-gradient)');
    expect(sidebarGradientBlock).toContain('background-image: var(--qq-sidebar-gradient)');
    expect(contentGradientBlock).toContain('background-image: var(--qq-content-gradient)');
    expect(sidebarBlock).toContain('background: var(--qq-sidebar-bg)');
    for (const block of [contentFrameBlock, topBarBlock, mainContentBlock, transitionStageBlock]) {
      expect(block).toContain('background: var(--qq-content-bg)');
    }
    expect(searchViewBlock).toContain('background: transparent');
    expect(css).toContain('background-image: var(--qq-panel-gradient)');
    expect(css).toContain('background-image: var(--qq-hover-gradient)');
    expect(css).toContain('background-image: var(--qq-active-gradient)');
    expect(css).toContain('background-image: var(--qq-accent-gradient)');
    expect(css).toContain('background-image: var(--qq-primary-action-gradient)');
    expect(brandMarkGradientResetBlock).toContain('background: transparent');
    expect(brandMarkGradientResetBlock).toContain('overflow: visible');
    expect(brandMarkImageBlock).toContain('display: block');
    expect(brandMarkImageBlock).toContain('width: 100%');
    expect(brandMarkImageBlock).toContain('height: 100%');
  });

  it('uses the QQ two-column app frame with the player blurred over content', () => {
    const shellBlock = extractCssBlockContaining(
      '.desktop-shell',
      'grid-template-columns: var(--qq-sidebar-width) minmax(0, 1fr)'
    );
    const mainContentBlock = extractCssBlock('.main-content');
    const playlistMainContentBlock = extractCssBlock('.main-content-playlist');
    const contentFrameBlock = extractCssBlockContaining('.content-frame', 'grid-column: 2');
    const searchMainBlock = extractCssBlock('.main-content-search');
    const searchSongListBlock = extractCssBlock('.qq-search-song-list');
    const playlistSongListBlock = extractCssBlock('.playlist-detail-song-list');
    const playerBarBlock = extractCssBlock('.player-bar');

    expect(shellBlock).toContain('grid-template-columns: var(--qq-sidebar-width) minmax(0, 1fr)');
    expect(shellBlock).toContain('grid-template-rows: minmax(0, 1fr) var(--qq-player-height)');
    expect(shellBlock).not.toContain('292px');
    expect(mainContentBlock).toContain('padding: 14px 40px calc(var(--qq-player-height) + 24px)');
    expect(playlistMainContentBlock).toContain('overflow-y: auto');
    expect(playlistMainContentBlock).toContain('padding: 24px 40px calc(var(--qq-player-height) + 24px)');
    expect(contentFrameBlock).toContain('grid-column: 2');
    expect(contentFrameBlock).toContain('grid-row: 1 / 3');
    expect(contentFrameBlock).toContain('position: relative');
    expect(contentFrameBlock).toContain('isolation: isolate');
    expect(css).not.toContain('player-backdrop-sampler');
    expect(css).not.toContain('player-backdrop-live');
    expect(css).not.toContain('.main-content-search::after');
    expect(css).not.toContain('.main-content-playlist::after');
    expect(searchMainBlock).toContain('overflow: hidden');
    expect(searchMainBlock).toContain('padding: 0');
    expect(searchSongListBlock).toContain('--song-list-tail-space: calc(var(--qq-player-height) + 1px)');
    expect(searchSongListBlock).toContain('padding-bottom: var(--song-list-tail-space)');
    expect(searchSongListBlock).toContain('scrollbar-width: none');
    expect(playlistSongListBlock).toContain('--song-list-tail-space: calc(var(--qq-player-height) + 1px)');
    expect(playlistSongListBlock).toContain('padding-bottom: var(--song-list-tail-space)');
    expect(playlistSongListBlock).toContain('scrollbar-width: none');
    expect(css).toContain(
      ".main-content-playlist:has(.playlist-detail-view[data-playlist-kind='artist']) > .main-content-transition-stage"
    );
    expect(css).not.toContain(
      '\n.main-content-playlist > .main-content-transition-stage,\n.main-content-playlist .main-content-transition-layer'
    );
    expect(css).toContain('.song-list-scroll-shell');
    expect(css).toContain('.song-list-visual-scrollbar');
    expect(playerBarBlock).toContain('position: absolute');
    expect(playerBarBlock).toContain('left: var(--qq-sidebar-width)');
    expect(playerBarBlock).toContain('bottom: 0');
    expect(playerBarBlock).toContain('background: var(--qq-persistent-chrome-bg)');
    expect(playerBarBlock).toContain('border-top: 1px solid var(--qq-persistent-chrome-border)');
    expect(playerBarBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(playerBarBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(playerBarBlock).toContain('box-shadow: 0 -10px 30px var(--qq-persistent-chrome-shadow-color)');
    expect(playerBarBlock).toContain('overflow: visible');
    expect(playerBarBlock).toContain('clip-path: none');
  });

  it('keeps catalog controls in normal flow while player and queue retain persistent chrome', () => {
    const categorySwitcherBlock = extractCssBlock('.playlist-discovery-category-switcher');
    const playerBarBlock = extractCssBlock('.player-bar');
    const queuePanelBlock = extractCssBlock('.desktop-shell .queue-panel');

    expect(css).toContain('.charts-header,\n.playlist-discovery-header {\n  min-height: 36px;');
    expect(categorySwitcherBlock).not.toContain('position: sticky');
    for (const surfaceBlock of [playerBarBlock, queuePanelBlock]) {
      expect(surfaceBlock).toContain('background: var(--qq-persistent-chrome-bg)');
      expect(surfaceBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
      expect(surfaceBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    }

    expect(css).not.toContain("[data-theme='defaultWhite'] .desktop-shell .queue-panel");
    expect(css).not.toContain("[data-theme='defaultWhite'] .desktop-shell > .player-bar");
  });

  it('keeps the sidebar flat, pale and prototype-dense', () => {
    const sidebarBlock = extractMergedCssBlock('.sidebar');
    const navItemBlock = extractCssBlock('.nav-item');
    const navItemStateBlock = extractCssBlock('.nav-item:hover,\n.nav-item-active');
    const navItemHoverBlock = extractCssBlock('.nav-item:hover');
    const navItemActiveBlock = extractCssBlock('.nav-item.nav-item-active,\n.nav-item.nav-playlist-item-active');
    const navOverlayBlock = extractCssBlock('.nav-item::before');
    const navOverlayStateBlock = extractCssBlock('.nav-item:hover::before,\n.nav-item-active::before');

    expect(sidebarBlock).toContain('padding: 24px 16px 18px');
    expect(sidebarBlock).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto');
    expect(sidebarBlock).not.toContain('backdrop-filter: blur');
    expect(sidebarBlock).not.toContain('-webkit-backdrop-filter: blur');
    expect(navItemBlock).toContain('height: 44px');
    expect(navItemBlock).toContain('border-radius: 10px');
    expect(navItemStateBlock).toContain('color: var(--qq-text)');
    expect(navItemHoverBlock).toContain('background: var(--qq-nav-hover)');
    expect(navItemActiveBlock).toContain('background: var(--qq-nav-active)');
    expect(navOverlayBlock).toContain('content: none');
    expect(navOverlayBlock).toContain('background: none');
    expect(navOverlayBlock).toContain('opacity: 0');
    expect(navOverlayBlock).toContain('transition: none');
    expect(navOverlayStateBlock).toContain('opacity: 0');
    expect(navOverlayStateBlock).toContain('transform: none');
  });

  it('collapses the sidebar by changing the shared QQ sidebar width token', () => {
    const rootBlock = extractCssBlock(':root');
    const shellBlock = extractCssBlockContaining(
      '.desktop-shell',
      'transition: grid-template-columns 320ms var(--ease-out-soft)'
    );
    const collapsedShellBlock = extractCssBlock('.desktop-shell.sidebar-collapsed');
    const collapsedSidebarBlock = extractCssBlock('.sidebar.sidebar-collapsed');
    const collapsedLabelBlock = extractCssBlock(
      '.sidebar.sidebar-collapsed .brand-name,\n.sidebar.sidebar-collapsed .nav-label,\n.sidebar.sidebar-collapsed .nav-title,\n.sidebar.sidebar-collapsed .nav-provider-name,\n.sidebar.sidebar-collapsed .nav-provider-count,\n.sidebar.sidebar-collapsed .nav-provider-category-title'
    );
    const collapseToggleBlock = extractCssBlock('.sidebar-collapse-toggle');
    const transitioningSidebarBlock = extractCssBlock('.desktop-shell.sidebar-transitioning .sidebar');
    const sidebarAfterBlock = extractCssBlock('.sidebar::after');

    expect(css).toContain('--qq-sidebar-collapsed-width: 72px');
    expect(shellBlock).toContain('transition: grid-template-columns 320ms var(--ease-out-soft)');
    expect(collapsedShellBlock).toContain('--qq-sidebar-width: var(--qq-sidebar-collapsed-width)');
    expect(collapsedSidebarBlock).toContain('align-items: stretch');
    expect(collapsedSidebarBlock).toContain('justify-items: center');
    expect(collapsedLabelBlock).not.toContain('display: none');
    expect(collapsedLabelBlock).toContain('opacity: 0');
    expect(collapsedLabelBlock).toContain('transform: translateX(-10px)');
    expect(collapsedLabelBlock).not.toContain('visibility: hidden');
    expect(collapseToggleBlock).toContain('margin-top: auto');
    expect(transitioningSidebarBlock).not.toContain('filter: blur');
    expect(transitioningSidebarBlock).not.toContain('backdrop-filter');
    expect(sidebarAfterBlock).toBe('');
    expect(css).not.toContain('sidebarTransitionVeil');
    expect(css).not.toContain('.desktop-shell.sidebar-transitioning .sidebar::after');
  });

  it('aligns sidebar tabs, icons, and the collapsed active indicator on one optical grid', () => {
    const sidebarBlock = extractCssBlockContaining('.sidebar', '--sidebar-nav-icon-column: 24px');
    const providerTabsBlock = extractCssBlock('.nav-library-provider-tabs');
    const sidebarIconsBlock = extractCssBlock(
      '.nav-item-icon > svg,\n.nav-library-category-trigger > svg:not(.nav-library-category-chevron),\n.sidebar-refresh-button > svg,\n.sidebar-collapse-toggle > svg'
    );
    const activeIndicatorBlock = extractCssBlock('.nav-item .nav-item-indicator');
    const selectedIndicatorBlock = extractCssBlock('.nav-primary-item.nav-item-active .nav-item-indicator');
    const collapsedNavItemBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-section .nav-item');
    const collapsedPrimaryNavBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-section .nav-primary-item');
    const collapsedPrimaryLabelBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-primary-item .nav-label');

    expect(sidebarBlock).toContain('--sidebar-nav-icon-column: 24px');
    expect(sidebarBlock).toContain('--sidebar-nav-icon-size: 20px');
    expect(sidebarBlock).toContain('--sidebar-nav-icon-stroke: 2');
    expect(providerTabsBlock).toContain('margin-inline-start: var(--sidebar-nav-inset)');
    expect(sidebarIconsBlock).toContain('width: var(--sidebar-nav-icon-size)');
    expect(sidebarIconsBlock).toContain('stroke-width: var(--sidebar-nav-icon-stroke)');
    expect(sidebarIconsBlock).toContain('shape-rendering: geometricPrecision');
    expect(sidebarIconsBlock).toContain('transform: none');
    expect(activeIndicatorBlock).toContain('top: 50%');
    expect(activeIndicatorBlock).toContain('left: -10px');
    expect(activeIndicatorBlock).toContain('height: 18px');
    expect(activeIndicatorBlock).toContain('translateY(-50%) scaleY(0.42)');
    expect(selectedIndicatorBlock).toContain('translateY(-50%) scaleY(1)');
    expect(collapsedNavItemBlock).toContain('justify-items: center');
    expect(collapsedPrimaryNavBlock).toContain('width: 44px');
    expect(collapsedPrimaryNavBlock).toContain('height: 44px');
    expect(collapsedPrimaryLabelBlock).toContain('display: none');
  });

  it('keeps sidebar collapse animation away from layout-thrashing transitions', () => {
    const sidebarBlock = extractMergedCssBlock('.sidebar');
    const transitioningSidebarBlock = extractCssBlock('.desktop-shell.sidebar-transitioning .sidebar');
    const labelMotionBlock = extractCssBlock('.brand-name,\n.nav-label,\n.nav-title');
    const collapsedLabelBlock = extractCssBlock(
      '.sidebar.sidebar-collapsed .brand-name,\n.sidebar.sidebar-collapsed .nav-label,\n.sidebar.sidebar-collapsed .nav-title,\n.sidebar.sidebar-collapsed .nav-provider-name,\n.sidebar.sidebar-collapsed .nav-provider-count,\n.sidebar.sidebar-collapsed .nav-provider-category-title'
    );
    const navItemBlock = extractCssBlock('.nav-item');
    const playlistItemBlock = extractCssBlock('.nav-playlist-item');
    const libraryPlaylistItemBlock = extractCssBlock('.nav-library-playlist-item');
    const playlistMainBlock = extractCssBlock('.nav-playlist-main');
    const likedTitleBlock = extractCssBlock('.nav-liked-playlist-title');
    const collapsedPlaylistTextBlock = extractCssBlock(
      '.sidebar.sidebar-collapsed .nav-playlist-main,\n.sidebar.sidebar-collapsed .nav-liked-playlist-title'
    );

    expect(sidebarBlock).toContain('contain: paint');
    expect(transitioningSidebarBlock).not.toContain('contain: paint');
    expect(navItemBlock).not.toContain('width 320ms');
    expect(navItemBlock).not.toContain('padding 320ms');
    expect(navItemBlock).not.toContain('gap 320ms');
    expect(playlistItemBlock).not.toContain('grid-template-columns 320ms');
    expect(playlistItemBlock).not.toContain('width 320ms');
    expect(libraryPlaylistItemBlock).not.toContain('grid-template-columns 320ms');
    expect(libraryPlaylistItemBlock).not.toContain('width 320ms');
    expect(labelMotionBlock).not.toContain('max-width 320ms');
    expect(labelMotionBlock).not.toContain('max-height 320ms');
    expect(labelMotionBlock).not.toContain('padding 320ms');
    expect(labelMotionBlock).not.toContain('margin 320ms');
    expect(playlistMainBlock).not.toContain('max-width 320ms');
    expect(likedTitleBlock).not.toContain('max-width 320ms');
    expect(collapsedLabelBlock).not.toContain('max-width 0');
    expect(collapsedPlaylistTextBlock).not.toContain('max-width: 0');
  });

  it('keeps sidebar playlists clustered and shows a provider source line', () => {
    const navTopSectionBlock = extractMergedCssBlock('.nav-top-section');
    const topToCreatedBlock = extractCssBlock('.nav-top-section + .nav-playlist-section');
    const topWithLibraryToCreatedBlock = extractCssBlock('.nav-top-section-with-library + .nav-playlist-section');
    const libraryPlaylistSectionBlock = extractCssBlock('.nav-library-playlist-section');
    const likedItemBlock = extractCssBlock('.nav-library-playlist-item');
    const likedTitleBlock = extractCssBlock('.nav-liked-playlist-title');
    const playlistSectionBlock = extractCssBlock('.nav-playlist-section');
    const playlistTitleBlock = extractCssBlock('.nav-playlist-section .nav-title');
    const playlistItemBlock = extractCssBlock('.nav-playlist-item');
    const playlistMainBlock = extractCssBlock('.nav-playlist-main');
    const playlistSourceBlock = extractCssBlock('.nav-playlist-source');
    const collapsedLikedItemBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-library-playlist-item');
    const collapsedPlaylistItemBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-playlist-item');
    const collapsedTextBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-playlist-main,\n.sidebar.sidebar-collapsed .nav-liked-playlist-title');
    const collapsedPlaylistSectionBlock = extractCssBlock('.sidebar.sidebar-collapsed .nav-playlist-section');
    const bottomControlsBlock = extractCssBlock('.sidebar-bottom-controls');

    expect(navTopSectionBlock).toContain('display: grid');
    expect(navTopSectionBlock).toContain('position: relative');
    expect(navTopSectionBlock).toContain('z-index: 3');
    expect(topToCreatedBlock).toContain('margin-top: 30px');
    expect(topWithLibraryToCreatedBlock).toContain('margin-top: 18px');
    expect(libraryPlaylistSectionBlock).toContain('display: grid');
    expect(libraryPlaylistSectionBlock).toContain('margin-top: 8px');
    expect(likedItemBlock).toContain('height: 44px');
    expect(likedItemBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(likedTitleBlock).toContain('white-space: nowrap');
    expect(likedTitleBlock).toContain('text-overflow: ellipsis');
    expect(playlistSectionBlock).toContain('align-content: start');
    expect(playlistSectionBlock).toContain('position: relative');
    expect(playlistSectionBlock).toContain('z-index: 1');
    expect(playlistSectionBlock).toContain('padding-bottom: 12px');
    expect(playlistTitleBlock).toContain('position: static');
    expect(playlistItemBlock).toContain('grid-template-columns: 32px minmax(0, 1fr)');
    expect(playlistMainBlock).toContain('grid-template-rows: auto auto');
    expect(playlistSourceBlock).toContain('color: var(--qq-muted)');
    expect(collapsedLikedItemBlock).toContain('grid-template-columns: 22px 0');
    expect(collapsedLikedItemBlock).toContain('height: 46px');
    expect(collapsedPlaylistItemBlock).toContain('grid-template-columns: 32px 0');
    expect(collapsedPlaylistItemBlock).toContain('justify-content: center');
    expect(collapsedPlaylistItemBlock).toContain('gap: 0');
    expect(collapsedTextBlock).not.toContain('display: none');
    expect(collapsedTextBlock).toContain('opacity: 0');
    expect(collapsedTextBlock).toContain('inline-size: 0');
    expect(collapsedTextBlock).toContain('transform: translateX(-10px)');
    expect(collapsedTextBlock).not.toContain('visibility: hidden');
    expect(collapsedPlaylistSectionBlock).toContain('padding-bottom: 68px');
    expect(bottomControlsBlock).toContain('z-index: 3');
    expect(bottomControlsBlock).toContain('width: 100%');
    expect(bottomControlsBlock).toContain('padding-top: 8px');
  });

  it('keeps provider library text and scrolling outside the window drag region', () => {
    const providerLibraryBlock = extractCssBlock('.nav-provider-library-section');
    const providerHeadingBlock = extractCssBlock('.nav-provider-heading');
    const providerCategoryTitleBlock = extractCssBlock('.nav-provider-category-title');
    const providerCategoryListBlock = extractCssBlock('.nav-provider-category-list');

    expect(providerLibraryBlock).toContain('overflow-y: auto');
    expect(providerLibraryBlock).toContain('overscroll-behavior: contain');
    expect(providerLibraryBlock).toContain('scrollbar-width: none');
    expect(providerLibraryBlock).toContain('-webkit-app-region: no-drag');
    expect(providerHeadingBlock).toContain('height: 22px');
    expect(providerHeadingBlock).toContain('-webkit-app-region: no-drag');
    expect(providerCategoryTitleBlock).toContain('font-size: 12px');
    expect(providerCategoryTitleBlock).toContain('-webkit-app-region: no-drag');
    expect(providerCategoryListBlock).toContain('display: grid');
    expect(providerCategoryListBlock).toContain('-webkit-app-region: no-drag');
  });

  it('uses compact QQ top chrome and search field', () => {
    const topBarBlock = extractCssBlock('.top-bar');
    const searchBoxBlock = extractCssBlock('.search-box');
    const iconButtonBlock = extractCssBlock('.icon-button');
    const entryTypographyBlock = extractCssBlock('.login-button,\n.theme-trigger');

    expect(topBarBlock).toContain('height: var(--qq-topbar-height)');
    expect(topBarBlock).not.toContain('backdrop-filter');
    expect(searchBoxBlock).toContain('width: 330px');
    expect(searchBoxBlock).toContain('height: 34px');
    expect(searchBoxBlock).toContain('background: var(--qq-hover)');
    expect(iconButtonBlock).toContain('border-radius: 50%');
    expect(entryTypographyBlock).toContain('font-size: 13px');
    expect(entryTypographyBlock).toContain('font-weight: 600');
    expect(entryTypographyBlock).toContain('line-height: 1');
  });

  it('routes visible QQ chrome colors through theme tokens', () => {
    const brandMarkBlock = extractCssBlock('.brand-mark');
    const navIconBlock = extractCssBlock('.nav-item svg');
    const iconButtonBlock = extractCssBlock('.icon-button');
    const chromeHoverBlock = extractCssBlock('.icon-button:hover,\n.theme-trigger:hover,\n.window-control-button:hover');
    const searchBoxBlock = extractCssBlock('.search-box');
    const searchFocusBlock = extractCssBlock('.search-box:focus-within');
    const progressTrackBlock = extractCssBlock('.progress-line div,\n.volume-control span');
    const mainContentBlock = extractCssBlock('.main-content');
    const searchProviderSwitcherBlock = extractCssBlock('.provider-segmented-control');
    const providerFocusBlock = extractCssBlock('.provider-segmented-option:focus-visible');
    const searchActionButtonBlock = extractCssBlock('.qq-search-action-button');
    const searchActionHoverBlock = extractCssBlock('.qq-search-action-button:hover');
    const searchSongListBlock = extractCssBlock('.qq-search-song-list');
    const playlistMessageBlock = extractCssBlock('.playlist-detail-message');
    const lyricsBackdropBlock = extractCssBlock('.lyrics-backdrop');
    const lyricLineBlock = extractCssBlock('.lyric-line');
    const queueListBlock = extractCssBlock('.queue-list');
    const disabledPlaylistPlayBlock = extractCssBlock('.playlist-detail-play-button:disabled');
    const detailSongListBlock = extractCssBlock('.playlist-detail-song-list');

    expect(brandMarkBlock).toContain('var(--qq-accent)');
    expect(navIconBlock).toContain('color: var(--qq-text)');
    expect(iconButtonBlock).toContain('color: var(--qq-muted)');
    expect(chromeHoverBlock).toContain('background: var(--qq-hover)');
    expect(searchBoxBlock).toContain('color: var(--qq-muted)');
    expect(searchBoxBlock).toContain('background: var(--qq-hover)');
    expect(searchFocusBlock).toContain('background: var(--qq-nav-hover)');
    expect(progressTrackBlock).toContain('background: color-mix(in srgb, var(--qq-muted) 38%, transparent)');
    expect(mainContentBlock).toContain('scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track)');
    expect(searchProviderSwitcherBlock).toContain('background: var(--qq-hover)');
    expect(providerFocusBlock).toContain('box-shadow: 0 0 0 2px');
    expect(css).not.toContain('.provider-segmented-option:focus {');
    expect(searchActionButtonBlock).toContain('color: var(--qq-on-accent)');
    expect(searchActionButtonBlock).toContain('background: var(--qq-accent)');
    expect(searchActionHoverBlock).toContain('background: var(--qq-hover)');
    expect(searchSongListBlock).toContain('scrollbar-width: none');
    expect(playlistMessageBlock).toContain('background: color-mix(in srgb, var(--qq-content-bg) 86%, var(--qq-hover) 14%)');
    expect(lyricsBackdropBlock).toContain('color-mix(in srgb, var(--qq-content-bg) 88%, transparent)');
    expect(lyricLineBlock).toContain('color: color-mix(in srgb, var(--qq-muted) 86%, var(--qq-text) 14%)');
    expect(queueListBlock).toContain('scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track)');
    expect(disabledPlaylistPlayBlock).toContain('background: var(--qq-hover)');
    expect(detailSongListBlock).toContain('scrollbar-width: none');
    expect(extractCssBlock('.song-list-visual-scrollbar')).toContain('pointer-events: auto');
  });

  it('uses themed non-transparent scrollbar tracks near the window edge', () => {
    const mainScrollbarBlock = extractCssBlock('.main-content::-webkit-scrollbar');
    const mainScrollbarTrackBlock = extractCssBlock('.main-content::-webkit-scrollbar-track');
    const mainScrollbarThumbBlock = extractCssBlock('.main-content::-webkit-scrollbar-thumb');
    const mainScrollbarThumbHoverBlock = extractCssBlock('.main-content::-webkit-scrollbar-thumb:hover');
    const mainScrollbarThumbActiveBlock = extractCssBlock('.main-content::-webkit-scrollbar-thumb:active');
    const queuePanelBlock = extractCssBlock('.desktop-shell .queue-panel');
    const queuePanelScrollbarThumbActiveBlock = extractCssBlock('.queue-panel::-webkit-scrollbar-thumb:active');
    const queueListBlock = extractCssBlock('.queue-list');
    const queueListScrollbarTrackBlock = extractCssBlock('.queue-list::-webkit-scrollbar-track');
    const queueListScrollbarThumbActiveBlock = extractCssBlock('.queue-list::-webkit-scrollbar-thumb:active');
    const searchSongListScrollbarThumbActiveBlock = extractCssBlock('.qq-search-song-list::-webkit-scrollbar-thumb:active');
    const playlistSongListBlock = extractCssBlock('.playlist-detail-song-list');
    const playlistSongListScrollbarTrackBlock = extractCssBlock('.playlist-detail-song-list::-webkit-scrollbar-track');
    const playlistSongListScrollbarThumbActiveBlock = extractCssBlock('.playlist-detail-song-list::-webkit-scrollbar-thumb:active');
    const lyricsLinesScrollbarThumbActiveBlock = extractCssBlock('.lyrics-lines::-webkit-scrollbar-thumb:active');
    const playlistHeadAndRowBlock = extractCssBlock('.playlist-detail-song-list-head,\n.playlist-detail-song-row');
    const playlistSongRowBlock = extractCssBlock('.playlist-detail-song-row');

    expect(mainScrollbarBlock).toContain('width: var(--app-scrollbar-size)');
    expect(mainScrollbarTrackBlock).toContain('background: var(--app-scrollbar-track)');
    expect(mainScrollbarTrackBlock).not.toContain('background: transparent');
    expect(mainScrollbarThumbBlock).toContain('border: 3px solid var(--app-scrollbar-track)');
    expect(mainScrollbarThumbBlock).toContain('background: var(--app-scrollbar-thumb)');
    expect(mainScrollbarThumbHoverBlock).toContain('background: var(--app-scrollbar-thumb-hover)');
    expect(mainScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(queuePanelBlock).toContain('padding: 22px 0 0 20px');
    expect(queuePanelScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(queueListBlock).toContain('padding-right: 0');
    expect(queueListScrollbarTrackBlock).toContain('background: var(--app-scrollbar-track)');
    expect(queueListScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(searchSongListScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(playlistSongListBlock).toContain('padding-right: 0');
    expect(playlistSongListScrollbarTrackBlock).toContain('background: transparent');
    expect(playlistSongListScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(lyricsLinesScrollbarThumbActiveBlock).toContain('background: var(--app-scrollbar-thumb-active)');
    expect(playlistHeadAndRowBlock).toContain('padding-inline: 14px 24px');
    expect(playlistSongRowBlock).toContain('padding-block: 7px');
  });

  it('uses per-card theme text in the theme picker preview', () => {
    const themeCardBlock = extractCssBlock('.theme-card');
    const themeCardSwatchBlock = extractCssBlock('.theme-card-swatch');
    const themeCardNameBlock = extractCssBlock('.theme-card-name');

    expect(themeCardBlock).toContain('grid-template-columns: 28px minmax(0, 1fr)');
    expect(themeCardBlock).toContain('min-height: 50px');
    expect(themeCardBlock).toContain('color: var(--theme-card-text)');
    expect(themeCardBlock).not.toContain('color: var(--qq-text)');
    expect(themeCardSwatchBlock).toContain('width: 28px');
    expect(themeCardSwatchBlock).toContain('height: 28px');
    expect(themeCardNameBlock).toContain('color: var(--theme-card-text)');
  });

  it('keeps the retained account playlist section on its compact grid', () => {
    const supplyBlock = extractCssBlock('.qq-supply-grid');
    const supplyCardBlock = extractCssBlock('.qq-supply-card');

    expect(supplyBlock).toContain('grid-template-columns: repeat(6, minmax(120px, 1fr))');
    expect(supplyCardBlock).toContain('border-radius: 4px');
    expect(supplyCardBlock).not.toContain('backdrop-filter');
  });

  it('uses a themed blurred QQ bottom player with centered transport controls', () => {
    const playerBarBlock = extractCssBlock('.player-bar');
    const playerActionsBlock = extractCssBlock('.player-actions');
    const playButtonBlock = extractCssBlock('.play-button');
    const playButtonHoverBlock = extractCssBlock('.play-button:hover');
    const playButtonFocusBlock = extractCssBlock('.play-button:focus-visible');
    const playButtonDisabledBlock = extractCssBlock('.play-button:disabled');
    const playButtonIconBlock = extractCssBlock('.play-button > svg');
    const progressBlock = extractCssBlock('.progress-line i');

    expect(playerBarBlock).toContain('height: var(--qq-player-height)');
    expect(playerBarBlock).toContain('background: var(--qq-persistent-chrome-bg)');
    expect(playerBarBlock).toContain('border-top: 1px solid var(--qq-persistent-chrome-border)');
    expect(playerBarBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(playerBarBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(playerBarBlock).toContain('box-shadow: 0 -10px 30px var(--qq-persistent-chrome-shadow-color)');
    expect(playerBarBlock).toContain('grid-template-columns: minmax(180px, 1fr) minmax(320px, 520px) minmax(180px, 1fr)');
    expect(playerBarBlock).toContain('transition:');
    expect(playerBarBlock).toContain('left 180ms ease');
    expect(playerActionsBlock).toContain('min-width: 116px');
    expect(playerActionsBlock).toContain('justify-content: flex-end');
    expect(playButtonBlock).toContain('color: #fff');
    expect(playButtonBlock).toContain('background: var(--qq-primary-action)');
    expect(playButtonBlock).toContain('color-mix(in srgb, var(--qq-primary-action)');
    expect(playButtonHoverBlock).toContain('color: #fff');
    expect(playButtonHoverBlock).toContain('background: var(--qq-primary-action-hover)');
    expect(playButtonHoverBlock).toContain('color-mix(in srgb, var(--qq-primary-action)');
    expect(playButtonHoverBlock).toContain('transform: none');
    expect(playButtonFocusBlock).toContain('color-mix(in srgb, var(--qq-primary-action)');
    expect(playButtonDisabledBlock).toContain('box-shadow: none');
    expect(playButtonIconBlock).toContain('color: #fff');
    expect(progressBlock).toContain('background: var(--qq-text)');
  });

  it('swaps old and new cover faces through one blurred reduced-motion-aware turn', () => {
    const layeredCoverBlock = extractCssBlock('.cover-thumb-layered');
    const flipperBlock = extractCssBlock('.cover-thumb-flipper');
    const artworkFaceBlock = extractCssBlock('.cover-thumb-artwork');
    const artworkBackBlock = extractCssBlock('.cover-thumb-artwork-back');
    const switchingBlock = extractCssBlock('.cover-thumb-song-switching');
    const frontLayerBlock = extractCssBlock('.cover-thumb-song-switching .cover-thumb-artwork-front');
    const backLayerBlock = extractCssBlock('.cover-thumb-song-switching .cover-thumb-artwork-back');
    const reducedSwapBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .cover-thumb-song-switching,\n" +
      ":root[data-reduce-effects='true'] .cover-thumb-song-switching .cover-thumb-artwork"
    );
    const frontKeyframes = extractKeyframesBlock('playerCoverSongSwapFront');
    const backKeyframes = extractKeyframesBlock('playerCoverSongSwapBack');

    expect(layeredCoverBlock).toContain('overflow: visible');
    expect(css).toContain('.cover-thumb-layered::before,\n.cover-thumb-layered::after {\n  content: none;');
    expect(flipperBlock).toContain('perspective: 520px');
    expect(flipperBlock).toContain('transition: none');
    expect(artworkFaceBlock).toContain('backface-visibility: hidden');
    expect(artworkBackBlock).toContain('opacity: 0');
    expect(artworkBackBlock).toContain('transform: rotateY(180deg)');
    expect(switchingBlock).not.toContain('animation:');
    expect(frontLayerBlock).toContain('animation: playerCoverSongSwapFront 520ms cubic-bezier(0.2, 0, 0.8, 0.5) both');
    expect(backLayerBlock).toContain('animation: playerCoverSongSwapBack 520ms cubic-bezier(0.2, 0.5, 0.8, 1) both');
    expect(frontLayerBlock).toContain('will-change: filter, opacity, transform');
    expect(backLayerBlock).toContain('will-change: filter, opacity, transform');
    expect(frontKeyframes).toContain('filter: blur(10px) saturate(1.08)');
    expect(frontKeyframes).toContain('transform: rotateY(90deg)');
    expect(frontKeyframes).not.toContain('animation-timing-function');
    expect(backKeyframes).toContain('filter: blur(10px) saturate(1.08)');
    expect(backKeyframes).toContain('transform: rotateY(-90deg)');
    expect(backKeyframes).toContain('transform: rotateY(0deg)');
    expect(backKeyframes).not.toContain('animation-timing-function');
    expect(frontKeyframes).not.toContain('rotateY(180deg)');
    expect(backKeyframes).not.toContain('rotateY(180deg)');
    expect(frontKeyframes).not.toContain('rotateY(360deg)');
    expect(backKeyframes).not.toContain('rotateY(360deg)');
    expect(reducedSwapBlock).toContain('animation: none !important');
    expect(reducedSwapBlock).toContain('filter: none !important');
    expect(reducedSwapBlock).toContain('transform: none !important');
  });

  it('lets the bottom player reveal long song titles inside the constrained title cell', () => {
    const nowPlayingTitleBlock = extractCssBlock('.now-playing-title');
    const nowPlayingTitleScrollBlock = extractCssBlock('.now-playing-title-scroll .now-playing-title-track');
    const nowPlayingTitleDuplicateBlock = extractCssBlock('.now-playing-title-duplicate');
    const marqueeBlock = extractKeyframesBlock('nowPlayingTitleMarquee');

    expect(nowPlayingTitleBlock).toContain('overflow: hidden');
    expect(nowPlayingTitleBlock).toContain('text-overflow: clip');
    expect(nowPlayingTitleScrollBlock).toContain('animation: nowPlayingTitleMarquee');
    expect(nowPlayingTitleDuplicateBlock).toContain('display: none');
    expect(marqueeBlock).toContain('translateX(calc(-50% - 16px))');
  });

  it('keeps search and playlist structure layered while the queue stays list-first', () => {
    const searchViewBlock = extractCssBlock('.qq-search-view');
    const searchHeroBlock = extractCssBlock('.qq-search-hero');
    const searchTransparentSurfacesBlock = extractCssBlock(
      '.qq-search-panel,\n.search-result-tabs,\n.search-entity-section'
    );
    const searchListHeadSurfaceBlock = extractCssBlock(
      '.song-list-scroll-shell > .qq-search-song-list-head'
    );
    const searchRowBlock = extractCssBlock('.qq-search-song-row');
    const searchOverviewPanelBlock = extractCssBlock(".qq-search-view[data-search-result-view='overview'] .qq-search-panel");
    const searchOverviewListShellBlock = extractCssBlock(".qq-search-view[data-search-result-view='overview'] .search-song-scroll-shell");
    const detailHeroBlock = extractCssBlock('.playlist-detail-hero');
    const queuePanelBlock = extractCssBlock('.desktop-shell .queue-panel');
    const queueListBlock = extractCssBlock('.queue-list');
    const queueRowActiveBlock = extractCssBlock('.queue-row:hover,\n.queue-row-active');

    expect(searchViewBlock).toContain('box-shadow: none');
    expect(searchHeroBlock).toContain('border-bottom: 0');
    expect(searchHeroBlock).toContain('background: transparent');
    expect(searchTransparentSurfacesBlock).toContain('background: transparent');
    expect(searchListHeadSurfaceBlock).toContain('background: transparent');
    expect(searchRowBlock).toContain('border-radius: 8px');
    expect(searchOverviewPanelBlock).toContain('flex: 0 0 auto');
    expect(searchOverviewListShellBlock).toContain('grid-template-rows: auto auto');
    expect(detailHeroBlock).toContain('background: transparent');
    expect(queuePanelBlock).toContain('background: var(--qq-persistent-chrome-bg)');
    expect(queuePanelBlock).toContain('border-left: 1px solid var(--qq-persistent-chrome-border)');
    expect(queuePanelBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(queuePanelBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(queuePanelBlock).toContain('box-shadow: -18px 0 50px var(--qq-persistent-chrome-shadow-color)');
    expect(queuePanelBlock).toContain('clip-path: inset(-72px 0 0 -72px)');
    expect(queuePanelBlock).toContain('padding: 22px 0 0 20px');
    expect(queuePanelBlock).toContain('display: flex');
    expect(queuePanelBlock).toContain('flex-direction: column');
    expect(queuePanelBlock).toContain('overflow: hidden');
    expect(queuePanelBlock).not.toContain('overflow-y: auto');
    expect(queueListBlock).toContain('min-height: 0');
    expect(queueListBlock).toContain('flex: 1 1 auto');
    expect(queueListBlock).toContain('overflow-y: auto');
    expect(queueRowActiveBlock).toContain('color: var(--qq-accent)');
  });

  it('themes song row action icons and context menus through QQ tokens', () => {
    const actionButtonBlock = extractCssBlock('.song-row-action-button');
    const actionButtonHoverBlock = extractCssBlock('.song-row-action-button:hover');
    const actionButtonLikedBlock = extractCssBlock('.song-row-action-button-liked');
    const likeIconBlock = extractCssBlock('.song-row-like-icon');
    const likedLikeIconBlock = extractCssBlock('.song-row-action-button-liked .song-row-like-icon');
    const likeInIconBlock = extractCssBlock('.song-row-action-button-like-in .song-row-like-icon');
    const likeOutIconBlock = extractCssBlock('.song-row-action-button-like-out .song-row-like-icon');
    const secondaryActionsBlock = extractCssBlock('.song-row-secondary-actions');
    const secondaryActionsVisibleBlock = extractCssBlock('.song-row:hover .song-row-secondary-actions,\n.song-row:focus-within .song-row-secondary-actions,\n.qq-search-song-row:hover .song-row-secondary-actions,\n.qq-search-song-row:focus-within .song-row-secondary-actions');
    const contextMenuBlock = extractCssBlock('.song-context-menu');
    const contextMenuItemBlock = extractCssBlock('.song-context-menu-item');
    const contextMenuItemHoverBlock = extractCssBlock('.song-context-menu-item:hover,\n.song-context-menu-item:focus-visible');

    expect(actionButtonBlock).toContain('color: var(--qq-muted)');
    expect(actionButtonBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(actionButtonHoverBlock).toContain('color: var(--qq-accent)');
    expect(actionButtonLikedBlock).toContain('color: var(--qq-accent)');
    expect(likeIconBlock).toContain('fill: transparent');
    expect(likeIconBlock).toContain('transition:');
    expect(likeIconBlock).toContain('fill 220ms ease');
    expect(likeIconBlock).toContain('filter 220ms ease');
    expect(likeIconBlock).toContain('transform 220ms ease');
    expect(likedLikeIconBlock).toContain('fill: currentColor');
    expect(likedLikeIconBlock).toContain('filter: blur(0)');
    expect(likedLikeIconBlock).toContain('transform: scale(1.08)');
    expect(likeInIconBlock).toContain('animation: song-row-like-fill 260ms ease both');
    expect(likeOutIconBlock).toContain('animation: song-row-like-empty 260ms ease both');
    expect(extractKeyframesBlock('song-row-like-fill')).toContain('filter: blur(4px)');
    expect(extractKeyframesBlock('song-row-like-empty')).toContain('fill: currentColor');
    expect(extractKeyframesBlock('song-row-like-empty')).toContain('filter: blur(4px)');
    expect(secondaryActionsBlock).toContain('opacity: 0');
    expect(secondaryActionsBlock).toContain('filter: blur(6px)');
    expect(secondaryActionsBlock).toContain('transform: translateX(-2px)');
    expect(secondaryActionsBlock).toContain('filter 180ms ease');
    expect(secondaryActionsVisibleBlock).toContain('opacity: 1');
    expect(secondaryActionsVisibleBlock).toContain('filter: blur(0)');
    expect(secondaryActionsVisibleBlock).toContain('transform: translateX(0)');
    expect(contextMenuBlock).toContain('color: var(--qq-text)');
    expect(contextMenuBlock).toContain('background: var(--qq-content-bg)');
    expect(contextMenuBlock).toContain('border: 1px solid var(--qq-line)');
    expect(contextMenuItemBlock).toContain('color: var(--qq-text)');
    expect(contextMenuItemHoverBlock).toContain('background: var(--qq-hover)');
    expect(contextMenuItemHoverBlock).toContain('color: var(--qq-accent)');
  });

  it('uses headered playlist rows with breathing room and aligned columns', () => {
    const playlistListBlock = extractCssBlock('.playlist-detail-song-list');
    const playlistWindowBlock = extractCssBlock('.playlist-detail-song-list-window');
    const playlistHeadAndRowBlock = extractCssBlock('.playlist-detail-song-list-head,\n.playlist-detail-song-row');
    const playlistHeadBlock = extractCssBlock('.playlist-detail-song-list-head');
    const playlistHeadFirstBlock = extractCssBlock('.playlist-detail-song-list-head span:nth-child(1)');
    const playlistHeadDurationBlock = extractCssBlock('.playlist-detail-song-list-head span:nth-child(4)');
    const playlistRowBlock = extractCssBlock('.playlist-detail-song-row');
    const playlistRowBeforeBlock = extractCssBlock('.playlist-detail-song-row::before');
    const playlistRowChildrenBlock = extractCssBlock('.playlist-detail-song-row > *');
    const playlistRowHoverBeforeBlock = extractCssBlock('.playlist-detail-song-row:hover::before,\n.playlist-detail-song-row:focus-visible::before');
    const playlistRowInteractiveTextBlock = extractCssBlock('.playlist-detail-song-row .song-row-main strong,\n.playlist-detail-song-row .song-row-main small');
    const searchHeadAndRowBlock = extractCssBlock('.qq-search-song-list-head,\n.qq-search-song-row');
    const searchRowBlock = extractCssBlock('.qq-search-song-row');
    const searchRowBeforeBlock = extractCssBlock('.qq-search-song-row::before');
    const searchRowChildrenBlock = extractCssBlock('.qq-search-song-row > *');
    const searchRowHoverBeforeBlock = extractCssBlock('.qq-search-song-row:hover::before,\n.qq-search-song-row:focus-visible::before');
    const searchHeadFirstBlock = extractCssBlock('.qq-search-song-list-head span:nth-child(1)');
    const searchHeadActionBlock = extractCssBlock('.qq-search-song-list-head span:nth-child(2)');
    const searchHeadSourceBlock = extractCssBlock('.qq-search-song-list-head span:nth-child(3)');
    const visualScrollbarThumbBlock = extractCssBlock('.song-list-visual-scrollbar::before');

    expect(playlistListBlock).toContain('align-content: start');
    expect(playlistListBlock).toContain('grid-auto-rows: max-content');
    expect(playlistListBlock).toContain('margin-inline: 0');
    expect(playlistListBlock).toContain('padding-inline: 0');
    expect(playlistListBlock).toContain('scrollbar-gutter: auto');
    expect(playlistListBlock).toContain('backdrop-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.08)');
    expect(playlistListBlock).toContain('-webkit-backdrop-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.08)');
    expect(playlistWindowBlock).not.toContain('backdrop-filter');
    expect(playlistHeadAndRowBlock).toContain('grid-template-columns: 44px minmax(0, 1.2fr) minmax(118px, 0.46fr) minmax(120px, 0.8fr) 52px');
    expect(playlistHeadAndRowBlock).toContain('padding-inline: 14px 24px');
    expect(playlistHeadBlock).toContain('color: var(--qq-muted)');
    expect(playlistHeadBlock).toContain('padding-block: 0');
    expect(playlistHeadFirstBlock).toContain('grid-column: 1 / 3');
    expect(playlistHeadDurationBlock).toContain('justify-self: end');
    expect(playlistRowBlock).toContain('border: 0');
    expect(playlistRowBlock).not.toContain('border-bottom');
    expect(playlistRowBlock).toContain('padding-block: 7px');
    expect(playlistRowBlock).toContain('border-radius: 8px');
    expect(playlistRowBeforeBlock).toContain('inset: 0');
    expect(playlistRowBeforeBlock).toContain('z-index: 0');
    expect(playlistRowBeforeBlock).toContain('border-radius: 8px');
    expect(playlistRowBeforeBlock).toContain('background: transparent');
    expect(playlistRowBeforeBlock).toContain('transition: background-color 160ms ease');
    expect(playlistRowBlock).toContain('background: transparent');
    expect(playlistRowBlock).toContain('background-image: none');
    expect(playlistRowBlock).toContain('backdrop-filter: none');
    expect(playlistRowBlock).toContain('-webkit-backdrop-filter: none');
    expect(playlistRowChildrenBlock).toContain('position: relative');
    expect(playlistRowChildrenBlock).toContain('z-index: 1');
    expect(playlistRowHoverBeforeBlock).toContain('background: var(--qq-song-hover)');
    expect(playlistRowHoverBeforeBlock).toContain('background-image: none');
    expect(playlistRowInteractiveTextBlock).toContain('cursor: pointer');
    expect(searchHeadAndRowBlock).toContain('padding-inline: 14px 24px');
    expect(searchHeadAndRowBlock).toContain('grid-template-columns: 42px minmax(240px, 1.35fr) minmax(132px, 0.48fr) minmax(92px, 0.46fr) minmax(150px, 0.76fr) 66px');
    expect(searchRowBlock).toContain('position: relative');
    expect(searchRowBlock).toContain('isolation: isolate');
    expect(searchRowBlock).toContain('border-radius: 8px');
    expect(searchRowBlock).toContain('padding-block: 7px');
    expect(searchRowBeforeBlock).toContain('inset: 0');
    expect(searchRowBeforeBlock).toContain('border-radius: 8px');
    expect(searchRowBeforeBlock).toContain('background: transparent');
    expect(searchRowBeforeBlock).toContain('transition: background-color 160ms ease');
    expect(searchRowBlock).toContain('background: transparent');
    expect(searchRowBlock).toContain('background-image: none');
    expect(searchRowChildrenBlock).toContain('position: relative');
    expect(searchRowChildrenBlock).toContain('z-index: 1');
    expect(searchRowHoverBeforeBlock).toContain('background: var(--qq-song-hover)');
    expect(searchRowHoverBeforeBlock).toContain('background-image: none');
    expect(searchHeadFirstBlock).toContain('grid-column: 1 / 3');
    expect(searchHeadActionBlock).toContain('grid-column: 3');
    expect(searchHeadSourceBlock).toContain('grid-column: 4');
    expect(visualScrollbarThumbBlock).toContain('top: 0');
    expect(visualScrollbarThumbBlock).toContain('transform: translate3d(0, var(--song-list-scrollbar-thumb-top, 0px), 0)');
    expect(visualScrollbarThumbBlock).toContain('will-change: transform');
  });

  it('uses theme-colored information without an emphasized current-song background', () => {
    const currentBackgroundBlock = extractCssBlock(
      '.playlist-detail-song-row.song-row-current::before,\n.qq-search-song-row.song-row-current::before'
    );
    const currentHoverBlock = extractCssBlock(
      '.playlist-detail-song-row.song-row-current:hover::before,\n.playlist-detail-song-row.song-row-current:focus-visible::before,\n.qq-search-song-row.song-row-current:hover::before,\n.qq-search-song-row.song-row-current:focus-visible::before'
    );
    const currentHoverColorBlock = extractCssBlockContaining(
      '.playlist-detail-song-row.song-row-current:hover::before,\n.playlist-detail-song-row.song-row-current:focus-visible::before,\n.qq-search-song-row.song-row-current:hover::before,\n.qq-search-song-row.song-row-current:focus-visible::before',
      'background: var(--qq-song-hover)'
    );
    const currentInfoBlock = extractCssBlock(
      '.playlist-detail-song-row.song-row-current .song-row-main strong,\n.playlist-detail-song-row.song-row-current .song-row-main small,\n.playlist-detail-song-row.song-row-current .song-album,\n.playlist-detail-song-row.song-row-current .playlist-detail-duration,\n.qq-search-song-row.song-row-current .qq-search-song-main strong,\n.qq-search-song-row.song-row-current .qq-search-song-main small,\n.qq-search-song-row.song-row-current .qq-search-album,\n.qq-search-song-row.song-row-current .qq-search-duration'
    );
    const currentActionsBlock = extractCssBlock(
      '.playlist-detail-song-row.song-row-current .song-row-actions,\n.qq-search-song-row.song-row-current .song-row-actions'
    );

    expect(currentBackgroundBlock).toContain('background: transparent');
    expect(currentHoverColorBlock).toContain('background: var(--qq-song-hover)');
    expect(currentHoverBlock).toContain('background-image: none');
    expect(currentHoverBlock).not.toContain('var(--qq-song-hover-gradient)');
    expect(currentInfoBlock).toContain('color: var(--qq-accent)');
    expect(currentActionsBlock).toBe('');
  });

  it('keeps queue rows aligned when title, artist and source all render', () => {
    const queueRowBlock = extractCssBlock('.queue-row');
    const queueRowContentBlock = extractCssBlock('.queue-row-content');
    const queueCoverBlock = extractCssBlock('.queue-row .song-cover-small');
    const queueSongBlock = extractCssBlock('.queue-song');
    const queueMetaBlock = extractCssBlock('.queue-meta');
    const queueMetaSpanBlock = extractCssBlock('.queue-meta span');
    const queueDurationBlock = extractCssBlock('.queue-duration');

    expect(queueRowBlock).toContain('min-height: 64px');
    expect(queueRowContentBlock).toContain('padding: 0');
    expect(queueRowContentBlock).toContain('grid-template-columns: 48px minmax(0, 1fr) auto');
    expect(queueCoverBlock).toContain('width: 48px');
    expect(queueCoverBlock).toContain('height: 48px');
    expect(queueSongBlock).toContain('min-width: 0');
    expect(queueSongBlock).toContain('overflow: hidden');
    expect(queueSongBlock).toContain('line-height: 1.2');
    expect(queueMetaBlock).toContain('min-width: 0');
    expect(queueMetaBlock).toContain('overflow: hidden');
    expect(queueMetaBlock).toContain('white-space: nowrap');
    expect(queueMetaSpanBlock).toContain('min-width: 0');
    expect(queueMetaSpanBlock).toContain('text-overflow: ellipsis');
    expect(queueDurationBlock).toContain('justify-self: end');
    expect(queueDurationBlock).toContain('align-self: start');
  });

  it('keeps lyrics full-window but switches the visible material to QQ light styling', () => {
    const overlayBlock = extractCssBlock('.lyrics-overlay');
    const backdropBlock = extractCssBlock('.lyrics-backdrop');
    const panelBlock = extractCssBlock('.lyrics-panel');
    const toolbarBlock = extractCssBlock('.lyrics-toolbar');
    const windowDragSurfaceBlock = extractCssBlock('.lyrics-window-drag-surface');
    const toolbarControlsBlock = extractCssBlock('.lyrics-toolbar button,\n.lyrics-window-controls');
    const lyricsDragSpaceBlock = extractCssBlock('.lyrics-drag-space');
    const hiddenToolbarBlock = extractCssBlock(".lyrics-toolbar[data-chrome-state='hidden']");
    const hiddenToolbarDragBlock = extractCssBlock(
      ".lyrics-toolbar[data-chrome-state='hidden'] > *,\n" +
      ".lyrics-toolbar[data-chrome-state='hidden'] button"
    );
    const stagePointerBlock = extractCssBlock('.playback-stage-3d');
    const queuePanelBlock = extractCssBlock('.desktop-shell .queue-panel');
    const lyricsQueuePanelBlock = extractCssBlock(":root[data-lyrics-open='true'] .desktop-shell .queue-panel");
    const stageBlock = extractCssBlock('.playback-stage-3d');
    const stageOrbitRingBlock = extractCssBlock('.stage-orbit-ring');
    const stageOrbitRingBBlock = extractCssBlock('.stage-orbit-ring-b');
    const stageOrbitGlowBlock = extractCssBlock('.stage-orbit-glow');
    const backgroundDepthBlock = extractCssBlock('.lyrics-depth-background');
    const coverDepthBlock = extractCssBlock('.lyrics-depth-cover');
    const lyricsArtBlock = extractCssBlock('.lyrics-art');
    const titleBlock = extractCssBlock('.lyrics-depth-title');
    const textBlock = extractCssBlock('.lyrics-depth-text');
    const lyricsContentBlock = extractCssBlock('.lyrics-content');
    const lyricsSongTitleBlock = extractCssBlock('.lyrics-content .lyrics-song-title');
    const lyricsSongTitleSweepBlock = extractCssBlock('.lyrics-content .lyrics-song-title::after');
    const lyricsSongArtistBlock = extractCssBlock('.lyrics-song-artist');
    const lyricsSongArtistHoverBlock = extractCssBlock('.lyrics-song-artist:hover');
    const lyricsSongArtistTextBlock = extractCssBlock('.lyrics-song-artist-text');
    const lyricsSideToolsBlock = extractCssBlock('.lyrics-side-tools');
    const hiddenLyricsPanelBlock = extractCssBlock(".lyrics-panel[data-chrome-state='hidden']");
    const hiddenLyricsSideToolsBlock = extractCssBlock(".lyrics-panel[data-chrome-state='hidden'] .lyrics-side-tools");
    const lyricsTranslationToggleBlock = extractCssBlock('.lyrics-translation-toggle');
    const lyricsTranslationToggleActiveBlock = extractCssBlock(".lyrics-translation-toggle[data-state='on']");
    const lyricsTranslationUnavailableBlock = extractMergedCssBlock('.lyrics-translation-unavailable');
    const lyricsTranslationUnavailableOpenBlock = extractCssBlock(".lyrics-translation-unavailable[data-state='open']");
    const lyricsTranslationUnavailableClosedBlock = extractCssBlock(".lyrics-translation-unavailable[data-state='closed']");
    const lyricsFontButtonBlock = extractCssBlock('.lyrics-font-button');
    const lyricsFontPopoverBlock = extractCssBlock('.lyrics-font-popover');
    const lyricsFontPopoverBackdropBlock = extractCssBlock('.lyrics-font-popover::before');
    const lyricsFontPopoverOpenBlock = extractCssBlock(".lyrics-font-popover[data-state='open']");
    const lyricsFontPopoverClosedBlock = extractCssBlock(".lyrics-font-popover[data-state='closed']");
    const lyricsFontSliderBlock = extractCssBlock('.lyrics-font-slider');
    const lyricsFontSliderTrackBlock = extractCssBlock('.lyrics-font-slider::-webkit-slider-runnable-track');
    const lyricsFontSliderThumbBlock = extractCssBlock('.lyrics-font-slider::-webkit-slider-thumb');
    const lyricsFontSliderMozTrackBlock = extractCssBlock('.lyrics-font-slider::-moz-range-track');
    const lyricsFontSliderMozThumbBlock = extractCssBlock('.lyrics-font-slider::-moz-range-thumb');
    const linesBlock = extractCssBlock('.lyrics-lines');
    const linesTopSpacerBlock = extractCssBlock('.lyrics-lines::before');
    const linesBottomSpacerBlock = extractCssBlock('.lyrics-lines::after');
    const lyricLineBlock = extractCssBlock('.lyric-line');
    const lyricLineTextBlock = extractCssBlock('.lyric-line-text');
    const lyricCharBlock = extractCssBlock('.lyric-char');
    const lyricTranslationBlock = extractCssBlock('.lyrics-translation-text');
    const lyricActiveBlocks = extractCssBlocks('.lyric-active');
    const lyricActiveBlock = extractCssBlock('.lyric-active');
    const activeLyricFillBlock = extractCssBlock('.lyric-active .lyric-char.lyric-char-filled::after');
    const activeLyricFillProgressBlock = extractCssBlock(
      '.lyric-active .lyric-char.lyric-char-filled.lyric-char-in-progress::after'
    );
    const activeLyricGlowBlocks = extractCssBlocks('.lyric-active .lyric-char::before');
    const activeLyricGlowBlock = activeLyricGlowBlocks[0] ?? '';
    const activeLyricGlowRadii = Array.from(
      activeLyricGlowBlock.matchAll(/0 0 (?<radius>\d+(?:\.\d+)?em) color-mix/g),
      (match) => match.groups?.radius ?? ''
    );
    const lyricActiveTextShadowValues = lyricActiveBlocks.flatMap((block) =>
      Array.from(
        block.matchAll(/(?:^|\n)\s*text-shadow:\s*(?<value>[^;]+);/g),
        (match) => match.groups?.value.trim() ?? ''
      )
    );
    const lyricActiveColorValues = lyricActiveBlocks.flatMap((block) =>
      Array.from(
        block.matchAll(/(?:^|\n)\s*color:\s*(?<value>[^;]+);/g),
        (match) => match.groups?.value.trim() ?? ''
      )
    );
    const activeLyricCompletedGlowBlock = extractCssBlock('.lyric-active .lyric-char.lyric-char-filled::before');
    const reducedMotionCss = css.slice(css.indexOf(
      '@media (prefers-reduced-motion: reduce) {\n  .lyric-active .lyric-char::before'
    ));
    const reducedMotionLyricGlowBlock = reducedMotionCss.match(
      /\.lyric-active \.lyric-char::before\s*\{(?<body>[^}]*)\}/
    )?.groups?.body ?? '';
    const reducedMotionLyricFillBlock = reducedMotionCss.match(
      /\.lyric-active \.lyric-char\.lyric-char-filled\.lyric-char-in-progress::after\s*\{(?<body>[^}]*)\}/
    )?.groups?.body ?? '';
    const activeLyricGlowProgressBlock = extractCssBlock('.lyric-active .lyric-char.lyric-char-in-progress::before');
    const instantLyricGlowBlock = extractCssBlock(".lyrics-lines[data-lyric-glow-transition='instant'] .lyric-char::before");
    const instantLyricFillBlock = extractCssBlock(
      ".lyrics-lines[data-lyric-glow-transition='instant'] .lyric-char.lyric-char-filled.lyric-char-in-progress::after"
    );
    const seekCueBlock = extractCssBlock('.lyric-seek-cue');
    const seekCueAfterBlock = extractCssBlock('.lyric-seek-cue::after');
    const seekTargetBlock = extractCssBlock('.lyric-seek-target');
    const settledLyricBlurBlock = extractCssBlock(".lyrics-lines[data-scroll-state='settled'] .lyric-line:not(.lyric-active)");
    const scrollingLyricBlurBlock = extractCssBlock(".lyrics-lines[data-scroll-state='scrolling'] .lyric-line");
    const topBounceBlock = extractCssBlock(".lyrics-lines[data-boundary-bounce='top']");
    const bottomBounceBlock = extractCssBlock(".lyrics-lines[data-boundary-bounce='bottom']");
    const linesScrollbarBlock = extractCssBlock('.lyrics-lines::-webkit-scrollbar');
    const titleShimmerBlock = extractKeyframesBlock('lyricsTitleShimmer');
    const titleSweepBlock = extractKeyframesBlock('lyricsTitleSweep');
    const topBounceKeyframes = extractKeyframesBlock('lyricsBoundaryBounceTop');
    const bottomBounceKeyframes = extractKeyframesBlock('lyricsBoundaryBounceBottom');
    const openTopBarBlock = extractCssBlock(":root[data-lyrics-open='true'] .desktop-shell .top-bar");
    const openTopDragSpaceBlock = extractCssBlock(":root[data-lyrics-open='true'] .desktop-shell .top-drag-space");
    const hiddenTopBarBlock = extractCssBlock(":root[data-lyrics-chrome='hidden'] .desktop-shell .top-bar");
    const restoringTopBarBlock = extractCssBlock(
      ":root[data-lyrics-phase='exiting'] .desktop-shell .top-bar,\n" +
      ":root[data-lyrics-phase='returning'] .desktop-shell .top-bar,\n" +
      ":root[data-lyrics-phase='restoring'] .desktop-shell .top-bar"
    );
    const restoringTopDragBlock = extractCssBlock(
      ":root[data-lyrics-phase='exiting'] .desktop-shell .top-bar-drag-surface,\n" +
      ":root[data-lyrics-phase='returning'] .desktop-shell .top-bar-drag-surface,\n" +
      ":root[data-lyrics-phase='restoring'] .desktop-shell .top-bar-drag-surface,\n" +
      ":root[data-lyrics-phase='exiting'] .desktop-shell .top-drag-space,\n" +
      ":root[data-lyrics-phase='returning'] .desktop-shell .top-drag-space,\n" +
      ":root[data-lyrics-phase='restoring'] .desktop-shell .top-drag-space"
    );
    const lyricsPlayerBarBlock = extractCssBlock('.lyrics-player-bar');
    const interactivePlayerBarBlock = extractCssBlock(
      ".lyrics-overlay[data-transition-phase='interactive'] .lyrics-player-bar"
    );
    const hiddenPlayerBarBlock = extractCssBlock(
      ".lyrics-overlay[data-transition-phase='interactive'] .lyrics-panel[data-chrome-state='hidden'] .lyrics-player-bar"
    );
    const exitingPlayerBarBlock = extractCssBlock(
      ".lyrics-overlay[data-transition-phase='exiting'] .lyrics-player-bar"
    );
    const reducedLyricsPlayerBarBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .lyrics-player-bar,\n:root[data-reduce-effects='true'] .lyrics-player-bar .now-playing,\n:root[data-reduce-effects='true'] .lyrics-player-bar .transport,\n:root[data-reduce-effects='true'] .lyrics-player-bar .player-actions"
    );
    const reducedInteractivePlayerBarBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .lyrics-overlay[data-transition-phase='interactive'] .lyrics-player-bar"
    );
    const reducedExitingPlayerBarBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .lyrics-overlay[data-transition-phase='exiting'] .lyrics-player-bar"
    );
    const clearLyricsLayerBlock = extractCssBlock(
      '.lyrics-overlay .lyrics-panel,\n.lyrics-overlay .playback-stage-3d,\n.lyrics-overlay .lyrics-player-bar'
    );
    const playerBarInKeyframes = extractKeyframesBlock('lyricsImmersivePlayerIn');
    const playerBarContentInKeyframes = extractKeyframesBlock('lyricsImmersivePlayerContentIn');
    const playerBarOutKeyframes = extractKeyframesBlock('lyricsImmersivePlayerOut');
    const rippleBlock = extractCssBlock('.lyrics-transition-ripple');
    const transitionVignetteBlock = extractCssBlock('.lyrics-transition-app-vignette');
    const transitionFlightBlock = extractCssBlock('.lyrics-transition-flight');

    expect(overlayBlock).toContain('background: transparent');
    expect(overlayBlock).toContain('pointer-events: auto');
    expect(overlayBlock).toContain('z-index: 100');
    expect(css).not.toContain(".lyrics-overlay[data-transition-phase='entering'] .lyrics-panel");
    expect(rippleBlock).toContain('z-index: 1');
    expect(transitionVignetteBlock).toContain('z-index: 2');
    expect(transitionFlightBlock).toContain('z-index: 120');
    expect(backdropBlock).toContain('var(--visual-canvas-glow)');
    expect(backdropBlock).toContain('var(--lyrics-cover-tone)');
    expect(backdropBlock).toContain('var(--lyrics-cover-secondary)');
    expect(backdropBlock).toContain('color-mix(in srgb, var(--qq-window-bg) 92%, transparent)');
    expect(panelBlock).toContain('background-color: var(--qq-content-bg)');
    expect(panelBlock).toContain('pointer-events: auto');
    expect(panelBlock).toContain('var(--lyrics-cover-secondary)');
    expect(panelBlock).toContain('var(--visual-canvas-glow)');
    expect(panelBlock).toContain('var(--qq-accent)');
    expect(panelBlock).toContain('grid-template-columns: minmax(360px, 0.9fr) minmax(420px, 1fr)');
    expect(toolbarBlock).toContain('background: transparent');
    expect(toolbarBlock).toContain('border-bottom: 0');
    expect(toolbarBlock).toContain('pointer-events: auto');
    expect(toolbarBlock).toContain('-webkit-app-region: drag');
    expect(windowDragSurfaceBlock).toContain('position: absolute');
    expect(windowDragSurfaceBlock).toContain('height: 64px');
    expect(windowDragSurfaceBlock).toContain('-webkit-app-region: drag');
    expect(toolbarControlsBlock).toContain('-webkit-app-region: no-drag');
    expect(lyricsDragSpaceBlock).toContain('flex: 1 1 auto');
    expect(lyricsDragSpaceBlock).toContain('-webkit-app-region: drag');
    expect(hiddenToolbarBlock).toContain('-webkit-app-region: drag');
    expect(hiddenToolbarDragBlock).toContain('-webkit-app-region: drag');
    expect(stageBlock).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(stagePointerBlock).toContain('pointer-events: none');
    expect(stageBlock).toContain('max-width: clamp(1180px, 84vw, 1480px)');
    expect(stageBlock).toContain('min-height: min(600px, calc(100vh - var(--qq-player-height) - 144px))');
    expect(stageBlock).toContain('gap: clamp(32px, 5.4vw, 104px)');
    expect(stageBlock).toContain('column-gap: clamp(32px, 5.4vw, 104px)');
    expect(stageBlock).toContain('row-gap: clamp(4px, 0.8vh, 12px)');
    expect(stageBlock).toContain('--immersive-cover-z: 0px');
    expect(stageBlock).toContain('transform-style: preserve-3d');
    expect(stageBlock).toContain('rotateX(var(--stage-tilt-x)) rotateY(var(--stage-tilt-y))');
    expect(stageBlock).toContain('transition:');
    expect(stageBlock).toContain('max-width 260ms ease');
    expect(stageBlock).not.toContain('background:');
    expect(stageBlock).not.toContain('background-image:');
    expect(stageOrbitRingBlock).toContain('border-color: color-mix(in srgb, var(--qq-accent) 38%, transparent)');
    expect(stageOrbitRingBlock).toContain('box-shadow: 0 0 46px color-mix(in srgb, var(--visual-canvas-glow) 20%, transparent)');
    expect(stageOrbitRingBBlock).toContain('border-color: color-mix(in srgb, var(--visual-particle-b) 36%, transparent)');
    expect(stageOrbitGlowBlock).toContain('background: radial-gradient(circle, color-mix(in srgb, var(--visual-canvas-glow) 24%, transparent), transparent 68%)');
    expect(backgroundDepthBlock).toContain('translate3d(var(--bg-shift-x), var(--bg-shift-y), -180px)');
    expect(backgroundDepthBlock).toContain('scale(var(--background-scale, 1.18))');
    expect(coverDepthBlock).toContain('var(--cover-shift-x)');
    expect(coverDepthBlock).toContain('var(--cover-shift-y)');
    expect(coverDepthBlock).toContain('scale(var(--cover-scale, 1))');
    expect(lyricsArtBlock).toContain('width: clamp(320px, 30vw, 430px)');
    expect(lyricsArtBlock).toContain('transition:');
    expect(lyricsArtBlock).toContain('width 260ms ease');
    expect(lyricsArtBlock).toContain('var(--lyrics-cover-shadow)');
    expect(lyricsArtBlock).toContain('color-mix(in srgb, var(--qq-accent) 22%, transparent)');
    expect(titleBlock).toContain('grid-row: 1');
    expect(titleBlock).toContain('min-width: 0');
    expect(titleBlock).toContain('justify-self: center');
    expect(titleBlock).toContain('text-align: center');
    expect(titleBlock).toContain('margin-bottom: 0');
    expect(titleBlock).toContain('overflow: visible');
    expect(titleBlock).toContain('translate3d(var(--title-shift-x), var(--title-shift-y), 0px)');
    expect(titleBlock).toContain('rotateX(var(--title-tilt-x)) rotateY(var(--title-tilt-y))');
    expect(textBlock).toContain('grid-row: 2');
    expect(textBlock).toContain('min-height: 0');
    expect(textBlock).toContain('justify-self: center');
    expect(textBlock).toContain('translate3d(var(--text-shift-x), var(--text-shift-y), 0px)');
    expect(textBlock).toContain('rotateX(var(--text-tilt-x)) rotateY(var(--text-tilt-y))');
    expect(lyricsContentBlock).toContain('max-width: 100%');
    expect(lyricsContentBlock).toContain('text-align: center');
    expect(lyricsContentBlock).toContain('overflow: visible');
    expect(lyricsSongTitleBlock).toContain('font-size: clamp(19px, 1.75vw, 28px)');
    expect(lyricsSongTitleBlock).toContain('transition: font-size 260ms ease');
    expect(lyricsSongTitleBlock).toContain('max-width: min(520px, 100%)');
    expect(lyricsSongTitleBlock).toContain('width: fit-content');
    expect(lyricsSongTitleBlock).toContain('overflow: hidden');
    expect(lyricsSongTitleBlock).toContain('text-overflow: ellipsis');
    expect(lyricsSongTitleBlock).toContain('white-space: nowrap');
    expect(lyricsSongTitleBlock).toContain('user-select: none');
    expect(lyricsSongTitleBlock).toContain('cursor: default');
    expect(lyricsSongTitleBlock).toContain('padding-block: 0.1em');
    expect(lyricsSongTitleBlock).toContain('position: relative');
    expect(lyricsSongTitleBlock).toContain('display: inline-block');
    expect(lyricsSongTitleBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(lyricsSongTitleBlock).toContain('animation: none');
    expect(lyricsSongTitleSweepBlock).toContain('content: attr(data-title)');
    expect(lyricsSongTitleSweepBlock).toContain('position: absolute');
    expect(lyricsSongTitleSweepBlock).toContain('inset: 0');
    expect(lyricsSongTitleSweepBlock).toContain('linear-gradient(115deg');
    expect(lyricsSongTitleSweepBlock).toContain('background-clip: text');
    expect(lyricsSongTitleSweepBlock).toContain('-webkit-background-clip: text');
    expect(lyricsSongTitleSweepBlock).toContain('-webkit-text-fill-color: transparent');
    expect(lyricsSongTitleSweepBlock).toContain('animation: lyricsTitleSweep 3.8s cubic-bezier(0.22, 1, 0.36, 1) infinite');
    expect(titleShimmerBlock).toContain('background-position: 0% 50%');
    expect(titleSweepBlock).toContain('background-position: 135% 50%');
    expect(titleSweepBlock).toContain('background-position: -135% 50%');
    expect(lyricsSongArtistBlock).toContain('cursor: pointer');
    expect(lyricsSongArtistBlock).toContain('padding: 2px 8px');
    expect(lyricsSongArtistBlock).toContain('border-radius: 10px');
    expect(lyricsSongArtistBlock).toContain('font-size: clamp(13px, 0.95vw, 16px)');
    expect(lyricsSongArtistBlock).toContain('overflow: visible');
    expect(lyricsSongArtistBlock).toContain('color: color-mix(in srgb, var(--qq-muted) 82%, var(--qq-text) 18%)');
    expect(lyricsSongArtistHoverBlock).toContain('box-shadow: 0 8px 22px color-mix(in srgb, var(--qq-lyric-active) 16%, transparent)');
    expect(lyricsSongArtistTextBlock).toContain('display: block');
    expect(lyricsSongArtistTextBlock).toContain('overflow: hidden');
    expect(lyricsSongArtistTextBlock).toContain('text-overflow: ellipsis');
    expect(lyricsSongArtistTextBlock).toContain('white-space: nowrap');
    expect(lyricsSongArtistTextBlock).toContain('user-select: none');
    expect(lyricsSongArtistTextBlock).toContain('cursor: default');
    expect(lyricsSideToolsBlock).toContain('position: fixed');
    expect(lyricsSideToolsBlock).toContain('right: clamp(24px, 3vw, 44px)');
    expect(lyricsSideToolsBlock).toContain('top: auto');
    expect(lyricsSideToolsBlock).toContain('bottom: calc(var(--qq-player-height) + 22px)');
    expect(lyricsSideToolsBlock).toContain('pointer-events: auto');
    expect(lyricsSideToolsBlock).toContain('transition:');
    expect(hiddenLyricsPanelBlock).toContain('cursor: none');
    expect(hiddenLyricsSideToolsBlock).toContain('opacity: 0');
    expect(hiddenLyricsSideToolsBlock).toContain('filter: blur(12px)');
    expect(hiddenLyricsSideToolsBlock).toContain('pointer-events: none');
    expect(lyricsTranslationToggleBlock).toContain('border-color: var(--qq-lyric-active)');
    expect(lyricsTranslationToggleBlock).toContain('transition:');
    expect(lyricsTranslationToggleActiveBlock).toContain('background: var(--qq-lyric-active)');
    expect(lyricsTranslationToggleActiveBlock).toContain('color: var(--qq-content-bg)');
    expect(lyricsTranslationToggleActiveBlock).toContain('box-shadow: 0 14px 34px color-mix(in srgb, var(--qq-lyric-active) 28%, transparent)');
    expect(lyricsTranslationUnavailableBlock).toContain('right: calc(100% + 10px)');
    expect(lyricsTranslationUnavailableBlock).toContain('background: var(--qq-glass-bg)');
    expect(lyricsTranslationUnavailableBlock).toContain('border: 1px solid var(--qq-glass-border)');
    expect(lyricsTranslationUnavailableBlock).toContain('box-shadow: var(--qq-glass-shadow)');
    expect(lyricsTranslationUnavailableBlock).toContain('backdrop-filter: var(--qq-glass-filter)');
    expect(lyricsTranslationUnavailableBlock).toContain('-webkit-backdrop-filter: var(--qq-glass-filter)');
    expect(lyricsTranslationUnavailableBlock).toContain('isolation: isolate');
    expect(lyricsTranslationUnavailableBlock).toContain('transform-origin: 100% 50%');
    expect(lyricsTranslationUnavailableBlock).toContain('--popover-slide-x: 4px');
    expect(lyricsTranslationUnavailableBlock).toContain('--popover-slide-y: 0px');
    expect(lyricsTranslationUnavailableBlock).toContain('will-change: opacity, transform, filter');
    expect(lyricsTranslationUnavailableOpenBlock).toContain('animation: anchoredPopoverIn 200ms var(--ease-out-soft)');
    expect(lyricsTranslationUnavailableClosedBlock).toContain('animation: anchoredPopoverOut 180ms ease forwards');
    expect(lyricsFontButtonBlock).toContain('font-weight: 800');
    expect(lyricsFontPopoverBlock).toContain('backdrop-filter: var(--qq-glass-filter)');
    expect(lyricsFontPopoverBlock).toContain('-webkit-backdrop-filter: var(--qq-glass-filter)');
    expect(lyricsFontPopoverBlock).toContain('top: auto');
    expect(lyricsFontPopoverBlock).toContain('right: calc(100% + 10px)');
    expect(lyricsFontPopoverBlock).toContain('bottom: -8px');
    expect(lyricsFontPopoverBlock).toContain('width: 56px');
    expect(lyricsFontPopoverBlock).toContain('height: 148px');
    expect(lyricsFontPopoverBlock).toContain('display: grid');
    expect(lyricsFontPopoverBlock).toContain('place-items: center');
    expect(lyricsFontPopoverBlock).toContain('overflow: hidden');
    expect(lyricsFontPopoverBlock).toContain('isolation: isolate');
    expect(lyricsFontPopoverBlock).toContain('color: var(--qq-text)');
    expect(lyricsFontPopoverBlock).toContain('background: var(--qq-glass-bg)');
    expect(lyricsFontPopoverBlock).toContain('border: 1px solid var(--qq-glass-border)');
    expect(lyricsFontPopoverBlock).toContain('border-radius: 8px');
    expect(lyricsFontPopoverBlock).toContain('box-shadow: var(--qq-glass-shadow)');
    expect(lyricsFontPopoverBlock).toContain('transform-origin: var(--popover-origin-x, 100%) var(--popover-origin-y, 100%)');
    expect(lyricsFontPopoverBlock).toContain('will-change: opacity, transform, filter');
    expect(lyricsFontPopoverBackdropBlock).toContain('content:');
    expect(lyricsFontPopoverBackdropBlock).toContain('position: absolute');
    expect(lyricsFontPopoverBackdropBlock).toContain('inset: 0');
    expect(lyricsFontPopoverBackdropBlock).toContain('z-index: 0');
    expect(lyricsFontPopoverBackdropBlock).toContain('linear-gradient(');
    expect(lyricsFontPopoverBackdropBlock).toContain('color-mix(in srgb, #ffffff 36%, transparent)');
    expect(lyricsFontPopoverBackdropBlock).toContain('color-mix(in srgb, var(--qq-hover) 14%, transparent)');
    expect(lyricsFontPopoverBackdropBlock).toContain('box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 58%, transparent)');
    expect(lyricsFontPopoverOpenBlock).toContain('animation: anchoredPopoverIn 200ms var(--ease-out-soft)');
    expect(lyricsFontPopoverClosedBlock).toContain('pointer-events: none');
    expect(lyricsFontPopoverClosedBlock).toContain('animation: anchoredPopoverOut 180ms ease forwards');
    expect(lyricsFontSliderBlock).toContain('writing-mode: vertical-lr');
    expect(lyricsFontSliderBlock).toContain('direction: rtl');
    expect(lyricsFontSliderBlock).toContain('height: 116px');
    expect(lyricsFontSliderBlock).toContain('width: 26px');
    expect(lyricsFontSliderBlock).toContain('appearance: none');
    expect(lyricsFontSliderBlock).toContain('-webkit-appearance: none');
    expect(lyricsFontSliderBlock).toContain('cursor: pointer');
    expect(lyricsFontSliderBlock).toContain('z-index: 1');
    expect(lyricsFontSliderTrackBlock).toContain('width: 8px');
    expect(lyricsFontSliderTrackBlock).toContain('height: 100%');
    expect(lyricsFontSliderTrackBlock).toContain('border-radius: var(--radius-pill)');
    expect(lyricsFontSliderTrackBlock).toContain('background: color-mix(in srgb, var(--qq-muted) 38%, transparent)');
    expect(lyricsFontSliderTrackBlock).toContain('box-shadow: inset 0 0 0 1px rgb(255 255 255 / 34%)');
    expect(lyricsFontSliderThumbBlock).toContain('width: 18px');
    expect(lyricsFontSliderThumbBlock).toContain('height: 18px');
    expect(lyricsFontSliderThumbBlock).toContain('margin-left: -5px');
    expect(lyricsFontSliderThumbBlock).toContain('background: var(--qq-accent)');
    expect(lyricsFontSliderThumbBlock).toContain('box-shadow: none');
    expect(lyricsFontSliderMozTrackBlock).toContain('width: 8px');
    expect(lyricsFontSliderMozTrackBlock).toContain('height: 100%');
    expect(lyricsFontSliderMozTrackBlock).toContain('background: color-mix(in srgb, var(--qq-muted) 38%, transparent)');
    expect(lyricsFontSliderMozThumbBlock).toContain('width: 18px');
    expect(lyricsFontSliderMozThumbBlock).toContain('height: 18px');
    expect(lyricsFontSliderMozThumbBlock).toContain('background: var(--qq-accent)');
    expect(lyricsFontSliderMozThumbBlock).toContain('box-shadow: none');
    expect(linesBlock).toContain('display: flex');
    expect(linesBlock).toContain('height: min(540px, 54vh)');
    expect(linesBlock).toContain('transition:');
    expect(linesBlock).toContain('height 260ms ease');
    expect(linesBlock).toContain('flex-direction: column');
    expect(linesBlock).toContain('align-items: center');
    expect(linesBlock).toContain('overflow-y: auto');
    expect(linesBlock).toContain('scrollbar-width: none');
    expect(linesBlock).toContain('-ms-overflow-style: none');
    expect(linesBlock).toContain('padding: 16px 22px 60px');
    expect(linesBlock).toContain('scroll-padding-block: 28px 64px');
    expect(linesBlock).toContain('mask-image: linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 64px), transparent 100%)');
    expect(linesBlock).toContain('-webkit-mask-image: linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 64px), transparent 100%)');
    expect(linesTopSpacerBlock).toContain('content:');
    expect(linesTopSpacerBlock).toContain('flex: 0 0 var(--lyrics-anchor-head-space, 44%)');
    expect(linesTopSpacerBlock).toContain('pointer-events: none');
    expect(linesBottomSpacerBlock).toContain('content:');
    expect(linesBottomSpacerBlock).toContain('flex: 0 0 var(--lyrics-anchor-tail-space, 56%)');
    expect(linesBottomSpacerBlock).toContain('pointer-events: none');
    expect(lyricLineBlock).toContain('width: 100%');
    expect(lyricLineBlock).toContain('text-align: center');
    expect(lyricLineBlock).toContain('overflow: visible');
    expect(lyricLineBlock).toContain('font-size: calc(clamp(17px, 1.55vw, 23px) * var(--lyrics-font-scale, 1))');
    expect(lyricLineBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(lyricLineBlock).toContain('color: color-mix(in srgb, var(--qq-muted) 86%, var(--qq-text) 14%)');
    expect(lyricLineBlock).toContain('transform: translate3d(0, calc(var(--lyric-signed-distance, 0) * 10px), 0)');
    expect(lyricLineBlock).toContain('transform 640ms cubic-bezier(0.16, 1, 0.3, 1)');
    expect(lyricLineBlock).toContain('transition-delay: calc(var(--lyric-flow-rank, 0) * 58ms)');
    expect(lyricLineBlock).toContain('user-select: none');
    expect(lyricLineBlock).toContain('cursor: default');
    expect(lyricLineTextBlock).toContain('display: inline-block');
    expect(lyricLineTextBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(lyricLineTextBlock).toContain('isolation: isolate');
    expect(lyricLineTextBlock).toContain('overflow: visible');
    expect(lyricLineTextBlock).toContain('padding: 0.12em 0.2em');
    expect(lyricLineTextBlock).toContain('margin: -0.12em -0.2em');
    expect(lyricLineTextBlock).toContain('user-select: none');
    expect(lyricCharBlock).toContain('display: inline-block');
    expect(lyricCharBlock).toContain('position: relative');
    expect(lyricCharBlock).toContain('overflow: visible');
    expect(lyricTranslationBlock).toContain('font-size: calc(0.78em * var(--lyrics-font-scale, 1))');
    expect(lyricTranslationBlock).toContain('color: color-mix(in srgb, currentColor 72%, transparent)');
    expect(lyricActiveBlock).toContain('color: var(--qq-text)');
    expect(lyricActiveBlock).toContain('font-size: calc(clamp(21px, 2.05vw, 30px) * var(--lyrics-font-scale, 1))');
    expect(lyricActiveBlock).toContain('background: transparent');
    expect(lyricActiveBlock).toContain('box-shadow: none');
    expect(lyricActiveBlock).toContain('text-shadow: none');
    expect(lyricActiveBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(lyricActiveTextShadowValues.every((value) => value === 'none')).toBe(true);
    expect(lyricActiveColorValues.some((value) => value.includes('accent'))).toBe(false);
    expect(css).not.toContain('.lyric-active .lyric-line-text::after');
    expect(css).not.toContain('.lyric-active .lyric-char::after');
    expect(css).not.toMatch(/\.lyric-active \.lyric-char\.lyric-char-in-progress::after\s*\{/);
    expect(activeLyricFillBlock).toContain('content: attr(data-lyric-char)');
    expect(activeLyricFillBlock).toContain('inset: 0');
    expect(activeLyricFillBlock).toContain('line-height: inherit');
    expect(activeLyricFillBlock).toContain('clip-path: inset');
    expect(activeLyricFillBlock).toContain('-webkit-text-fill-color: var(--qq-lyric-active)');
    expect(activeLyricFillBlock).not.toContain('text-shadow:');
    expect(activeLyricFillBlock).toContain('var(--qq-lyric-active)');
    expect(activeLyricFillBlock).toContain('transition: none');
    expect(activeLyricFillBlock).not.toContain('transition: clip-path');
    expect(activeLyricFillBlock).not.toContain('will-change: clip-path');
    expect(activeLyricFillBlock).not.toContain('filter: drop-shadow');
    expect(activeLyricFillBlock).not.toContain('background:');
    expect(activeLyricFillBlock).not.toContain('background-position');
    expect(activeLyricFillProgressBlock).toContain('transition: clip-path 180ms linear');
    expect(activeLyricFillProgressBlock).toContain('will-change: clip-path');
    expect(activeLyricFillProgressBlock).not.toContain('content:');
    expect(activeLyricFillProgressBlock).not.toContain('clip-path: inset');
    expect(activeLyricFillProgressBlock).not.toContain('text-shadow:');
    expect(activeLyricGlowBlocks).toHaveLength(1);
    expect(activeLyricGlowBlock).toContain('content: attr(data-lyric-char)');
    expect(activeLyricGlowBlock).toContain('color: transparent');
    expect(activeLyricGlowBlock).toContain('opacity: 0');
    expect(activeLyricGlowBlock).toContain('text-shadow:');
    expect(activeLyricGlowBlock).toContain('var(--qq-lyric-active)');
    expect(activeLyricGlowBlock).toContain('0.42em');
    expect(activeLyricGlowBlock).toContain('1.05em');
    expect(activeLyricGlowBlock).toContain('1.8em');
    expect(activeLyricGlowBlock).not.toContain('1.45em');
    expect(activeLyricGlowRadii).toEqual(['0.42em', '1.05em', '1.8em']);
    expect(activeLyricGlowBlock).toContain('transition: opacity 180ms ease-out');
    expect(activeLyricGlowBlock).not.toContain('clip-path');
    expect(activeLyricCompletedGlowBlock).toContain('opacity: 0.6');
    expect(activeLyricGlowProgressBlock).toContain('opacity: calc(0.6 + var(--lyric-char-progress, 0) * 0.4)');
    expect(activeLyricGlowProgressBlock).not.toContain('content:');
    expect(activeLyricGlowProgressBlock).not.toContain('text-shadow:');
    expect(instantLyricFillBlock).toContain('transition: none');
    expect(instantLyricGlowBlock).toContain('transition: none');
    expect(reducedMotionLyricFillBlock).toContain('transition: none');
    expect(reducedMotionLyricGlowBlock).toContain('transition: none');
    expect(seekCueBlock).toContain('position: absolute');
    expect(seekCueBlock).toContain('top: 50%');
    expect(seekCueBlock).toContain('left: calc(100% + 18px)');
    expect(seekCueBlock).toContain('background: color-mix(in srgb, var(--qq-lyric-active) 18%, var(--qq-content-bg) 82%)');
    expect(seekCueAfterBlock).toContain('content: none');
    expect(seekCueAfterBlock).toContain('display: none');
    expect(seekTargetBlock).toContain('color: var(--qq-lyric-active)');
    expect(settledLyricBlurBlock).toContain('filter: blur(calc(var(--lyric-distance) * 1.2px))');
    expect(scrollingLyricBlurBlock).toContain('filter: blur(0px)');
    expect(scrollingLyricBlurBlock).toContain('transform: translate3d(0, 0, 0)');
    expect(scrollingLyricBlurBlock).toContain('transition-delay: 0ms');
    expect(topBounceBlock).toContain('animation: lyricsBoundaryBounceTop 720ms var(--ease-spring)');
    expect(bottomBounceBlock).toContain('animation: lyricsBoundaryBounceBottom 720ms var(--ease-spring)');
    expect(topBounceKeyframes).toContain('transform: translate3d(0, 34px, 0)');
    expect(topBounceKeyframes).toContain('transform: translate3d(0, -8px, 0)');
    expect(topBounceKeyframes).toContain('transform: translate3d(0, 3px, 0)');
    expect(bottomBounceKeyframes).toContain('transform: translate3d(0, -34px, 0)');
    expect(bottomBounceKeyframes).toContain('transform: translate3d(0, 8px, 0)');
    expect(bottomBounceKeyframes).toContain('transform: translate3d(0, -3px, 0)');
    expect(linesScrollbarBlock).toContain('display: none');
    expect(openTopBarBlock).toContain('color: var(--qq-text)');
    expect(openTopBarBlock).toContain('background: transparent');
    expect(openTopBarBlock).toContain('border-bottom: 0');
    expect(openTopBarBlock).toContain('-webkit-app-region: no-drag');
    expect(openTopBarBlock).toContain('transition:');
    expect(openTopBarBlock).toContain('will-change: opacity, transform, filter');
    expect(openTopDragSpaceBlock).toContain('-webkit-app-region: no-drag');
    expect(hiddenTopBarBlock).toContain('opacity: 0');
    expect(hiddenTopBarBlock).toContain('transform: translate3d(0, -26px, 0)');
    expect(hiddenTopBarBlock).toContain('pointer-events: none');
    expect(restoringTopBarBlock).toContain('pointer-events: auto');
    expect(restoringTopBarBlock).toContain('-webkit-app-region: drag');
    expect(restoringTopDragBlock).toContain('-webkit-app-region: drag');
    expect(overlayBlock).toContain('filter: none');
    expect(clearLyricsLayerBlock).toContain('filter: none');
    expect(lyricsPlayerBarBlock).toContain('position: fixed');
    expect(lyricsPlayerBarBlock).toContain('left: 0');
    expect(lyricsPlayerBarBlock).toContain('right: 0');
    expect(lyricsPlayerBarBlock).toContain('bottom: 0');
    expect(lyricsPlayerBarBlock).toContain('z-index: 8');
    expect(lyricsPlayerBarBlock).toContain('background:');
    expect(lyricsPlayerBarBlock).toContain('linear-gradient(');
    expect(lyricsPlayerBarBlock).not.toContain('backdrop-filter');
    expect(lyricsPlayerBarBlock).toContain('opacity: 0');
    expect(lyricsPlayerBarBlock).toContain('clip-path: inset(100% 0 0 0)');
    expect(lyricsPlayerBarBlock).toContain('transform: translate3d(0, 42px, 0)');
    expect(lyricsPlayerBarBlock).toContain('pointer-events: none');
    expect(interactivePlayerBarBlock).toContain('opacity: 1');
    expect(interactivePlayerBarBlock).toContain('clip-path: inset(0 0 0 0)');
    expect(interactivePlayerBarBlock).toContain('transform: translate3d(0, 0, 0)');
    expect(interactivePlayerBarBlock).toContain('pointer-events: auto');
    expect(interactivePlayerBarBlock).toContain('animation: lyricsImmersivePlayerIn 520ms cubic-bezier(0.16, 1, 0.3, 1)');
    expect(hiddenPlayerBarBlock).toContain('opacity: 0');
    expect(hiddenPlayerBarBlock).toContain('pointer-events: none');
    expect(hiddenPlayerBarBlock).toContain('animation: lyricsImmersivePlayerOut 320ms cubic-bezier(0.4, 0, 1, 1) both');
    expect(exitingPlayerBarBlock).toContain('pointer-events: none');
    expect(exitingPlayerBarBlock).toContain('animation: lyricsImmersivePlayerOut 260ms cubic-bezier(0.4, 0, 1, 1)');
    expect(playerBarInKeyframes).toContain('opacity: 0');
    expect(playerBarInKeyframes).toContain('clip-path: inset(100% 0 0 0)');
    expect(playerBarInKeyframes).toContain('transform: translate3d(0, 42px, 0)');
    expect(playerBarInKeyframes).toContain('transform: translate3d(0, -3px, 0)');
    expect(playerBarInKeyframes).toContain('opacity: 1');
    expect(playerBarContentInKeyframes).toContain('transform: translate3d(0, 14px, 0)');
    expect(playerBarContentInKeyframes).toContain('transform: translate3d(0, 0, 0)');
    expect(playerBarOutKeyframes).toContain('opacity: 1');
    expect(playerBarOutKeyframes).toContain('opacity: 0');
    expect(playerBarOutKeyframes).toContain('transform: translate3d(0, 34px, 0)');
    expect(`${playerBarInKeyframes}${playerBarContentInKeyframes}${playerBarOutKeyframes}`).not.toContain('filter:');
    expect(reducedLyricsPlayerBarBlock).toContain('transform: none !important');
    expect(reducedLyricsPlayerBarBlock).toContain('animation: none !important');
    expect(reducedInteractivePlayerBarBlock).toContain('opacity: 1');
    expect(reducedExitingPlayerBarBlock).toContain('opacity: 0');
    expect(css).not.toContain(":root[data-lyrics-open='true'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='entering'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='handoff'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='unlocking'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='interactive'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='exiting'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='returning'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='restoring'] .desktop-shell > .player-bar");
    expect(css).not.toContain(":root[data-lyrics-phase='interactive'][data-lyrics-chrome='hidden'] .desktop-shell > .player-bar");
    expect(queuePanelBlock).toContain('z-index: 115');
    expect(lyricsQueuePanelBlock).toContain('background: var(--qq-persistent-chrome-bg)');
    expect(lyricsQueuePanelBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(lyricsQueuePanelBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(lyricsQueuePanelBlock).toContain('box-shadow: -18px 0 50px var(--qq-persistent-chrome-shadow-color)');
    expect(lyricsQueuePanelBlock).toContain('clip-path: inset(-72px 0 -72px -72px)');
    expect(lyricsQueuePanelBlock).toContain('will-change: transform, opacity');
  });

  it('keeps the top drag lane usable and the playlist detail header as an occupied layout row', () => {
    const topDragSpaceBlock = extractCssBlock('.top-drag-space');
    const playlistDetailBlock = extractCssBlock('.playlist-detail-view');
    const detailHeroShellBlock = extractCssBlock('.playlist-detail-hero-shell');
    const detailHeroBlock = extractCssBlock('.playlist-detail-hero');
    const detailCoverBlock = extractCssBlock('.playlist-detail-cover');
    const detailPanelBlock = extractMergedCssBlock('.playlist-detail-panel');
    const detailTransitionStageBlock = extractCssBlock(
      ".playlist-detail-view:not([data-playlist-kind='artist']) .playlist-detail-panel > .main-content-transition-stage"
    );
    const boundedDetailPanelBlock = extractCssBlock(
      ".playlist-detail-view:not([data-playlist-kind='artist']) .playlist-detail-panel"
    );
    const boundedDetailMainBlock = extractCssBlock(
      ".main-content-playlist:has(.playlist-detail-view:not([data-playlist-kind='artist']))"
    );
    const detailHeroRightPaddingBlock = extractCssBlock(
      ".main-content-playlist:has(.playlist-detail-view:not([data-playlist-kind='artist'])) .playlist-detail-hero-shell,\n.main-content-playlist:has(.playlist-detail-view[data-playlist-kind='artist'][data-artist-tab='tracks']) .playlist-detail-hero-shell"
    );
    const detailTransitionContentBlock = extractCssBlock('.playlist-detail-transition-content');
    const detailScrollShellBlock = extractCssBlock(
      '.playlist-detail-transition-content > .playlist-detail-song-scroll-shell'
    );
    const detailSongListBlock = extractCssBlock('.playlist-detail-song-list');
    const detailDescriptionBlock = extractCssBlock('.playlist-detail-heading p');
    const expandedDescriptionBlock = extractCssBlock(
      ".playlist-detail-view[data-header-compact='false'] .playlist-detail-description:not(:empty)"
    );

    expect(topDragSpaceBlock).toContain('-webkit-app-region: drag');
    expect(topDragSpaceBlock).toContain('min-width: 96px');
    expect(topDragSpaceBlock).not.toContain('display: none');
    expect(playlistDetailBlock).toContain('height: 100%');
    expect(playlistDetailBlock).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(playlistDetailBlock).toContain('overflow: visible');
    expect(playlistDetailBlock).toContain('--playlist-detail-hero-expanded-padding-x: 0px');
    expect(playlistDetailBlock).toContain('--playlist-detail-hero-sticky-padding-x: 0px');
    expect(detailHeroShellBlock).toContain('position: relative');
    expect(detailHeroShellBlock).toContain('z-index: 2');
    expect(detailHeroShellBlock).toContain('overflow: visible');
    expect(detailHeroShellBlock).toContain('min-height: var(--playlist-detail-hero-current-min-height)');
    expect(detailHeroShellBlock).not.toContain('position: sticky');
    expect(detailHeroShellBlock).not.toContain('position: fixed');
    expect(detailHeroShellBlock).not.toContain('position: absolute');
    expect(detailHeroBlock).toContain('pointer-events: auto');
    expect(detailHeroBlock).toContain('overflow: visible');
    expect(detailCoverBlock).toContain('var(--playlist-detail-cover-glow)');
    expect(detailCoverBlock).toContain('color-mix(in srgb');
    expect(detailCoverBlock).toContain('transition: box-shadow 220ms ease');
    expect(detailCoverBlock).not.toContain('box-shadow: none');
    expect(playlistDetailBlock).toContain('--playlist-detail-cover-size: 128px');
    expect(playlistDetailBlock).toContain('--playlist-detail-hero-expanded-height: 156px');
    expect(playlistDetailBlock).toContain('--playlist-detail-description-expanded-height: 40px');
    expect(playlistDetailBlock).toContain('--playlist-detail-header-content-blur: 0px');
    expect(detailPanelBlock).toContain('min-height: 0');
    expect(detailPanelBlock).toContain('display: flex');
    expect(detailPanelBlock).toContain('flex-direction: column');
    expect(detailPanelBlock).toContain('overflow: visible');
    expect(detailTransitionStageBlock).toContain('flex: 1 1 0');
    expect(detailTransitionStageBlock).toContain('min-height: 0');
    expect(boundedDetailPanelBlock).toContain('overflow: hidden');
    expect(boundedDetailMainBlock).toContain('overflow: visible');
    expect(boundedDetailMainBlock).toContain('padding: 0 0 0 40px');
    expect(detailHeroRightPaddingBlock).toContain('padding-right: clamp(30px, 4vw, 52px)');
    expect(detailHeroRightPaddingBlock).not.toContain("data-artist-tab='albums'");
    expect(detailTransitionContentBlock).toContain('height: 100%');
    expect(detailTransitionContentBlock).toContain('min-height: 0');
    expect(detailTransitionContentBlock).toContain('display: flex');
    expect(detailTransitionContentBlock).toContain('flex-direction: column');
    expect(detailScrollShellBlock).toContain('flex: 1 1 0');
    expect(detailScrollShellBlock).toContain('height: auto');
    expect(detailSongListBlock).toContain('flex: 1 1 auto');
    expect(detailSongListBlock).toContain('min-height: 0');
    expect(detailSongListBlock).toContain('overflow-y: auto');
    expect(detailDescriptionBlock).toContain('width: 100%');
    expect(detailDescriptionBlock).toContain('max-width: none');
    expect(expandedDescriptionBlock).toContain('margin-block-end: 6px');
  });

  it('uses theme-aware neutral layers for playlist and lyrics cover shadows', () => {
    const detailCoverBlock = extractCssBlock('.playlist-detail-cover');
    const lyricsArtBlock = extractCssBlock('.lyrics-art');

    expect(detailCoverBlock).toContain(
      '0 6px 18px color-mix(in srgb, var(--qq-text) 14%, transparent)'
    );
    expect(detailCoverBlock).not.toContain('0 6px 18px rgb(20 24 32 / 14%)');
    expect(lyricsArtBlock).toContain(
      '0 14px 42px color-mix(in srgb, var(--qq-text) 18%, transparent)'
    );
    expect(lyricsArtBlock).not.toContain('rgb(0 0 0 / 18%)');
  });

  it('keeps the active lyric anchored with staggered rows, elastic bounds and a clipped title sweep', () => {
    const linesBlock = extractCssBlock('.lyrics-lines');
    const titleBlock = extractCssBlock('.lyrics-content .lyrics-song-title');
    const titleSweepBlock = extractCssBlock('.lyrics-content .lyrics-song-title::after');
    const titleSweepKeyframes = extractKeyframesBlock('lyricsTitleSweep');
    const topSpacerBlock = extractCssBlock('.lyrics-lines::before');
    const bottomSpacerBlock = extractCssBlock('.lyrics-lines::after');
    const lyricLineBlock = extractCssBlock('.lyric-line');
    const topBounceBlock = extractCssBlock(".lyrics-lines[data-boundary-bounce='top']");
    const bottomBounceBlock = extractCssBlock(".lyrics-lines[data-boundary-bounce='bottom']");
    const topBounceKeyframes = extractKeyframesBlock('lyricsBoundaryBounceTop');
    const bottomBounceKeyframes = extractKeyframesBlock('lyricsBoundaryBounceBottom');

    expect(titleBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(titleBlock).toContain('animation: none');
    expect(titleSweepBlock).toContain('content: attr(data-title)');
    expect(titleSweepBlock).toContain('linear-gradient(115deg');
    expect(titleSweepBlock).toContain('background-clip: text');
    expect(titleSweepBlock).toContain('animation: lyricsTitleSweep 3.8s cubic-bezier(0.22, 1, 0.36, 1) infinite');
    expect(titleSweepKeyframes).toContain('background-position: 135% 50%');
    expect(titleSweepKeyframes).toContain('background-position: -135% 50%');
    expect(linesBlock).toContain('scroll-behavior: auto');
    expect(topSpacerBlock).toContain('flex: 0 0 var(--lyrics-anchor-head-space, 44%)');
    expect(bottomSpacerBlock).toContain('flex: 0 0 var(--lyrics-anchor-tail-space, 56%)');
    expect(lyricLineBlock).toContain('translate3d(0, calc(var(--lyric-signed-distance, 0) * 10px), 0)');
    expect(lyricLineBlock).toContain('transition-delay: calc(var(--lyric-flow-rank, 0) * 58ms)');
    expect(topBounceBlock).toContain('animation: lyricsBoundaryBounceTop 720ms var(--ease-spring)');
    expect(bottomBounceBlock).toContain('animation: lyricsBoundaryBounceBottom 720ms var(--ease-spring)');
    expect(topBounceKeyframes).toContain('translate3d(0, 34px, 0)');
    expect(topBounceKeyframes).toContain('translate3d(0, -8px, 0)');
    expect(bottomBounceKeyframes).toContain('translate3d(0, -34px, 0)');
    expect(bottomBounceKeyframes).toContain('translate3d(0, 8px, 0)');
  });

  it('puts playlist detail metadata and play action in the header', () => {
    const detailHeadingBlock = extractCssBlock('.playlist-detail-heading');
    const expandedDetailHeadingBlock = extractCssBlock(".playlist-detail-view[data-header-compact='false'] .playlist-detail-heading");
    const expandedDetailTitleBlock = extractCssBlock(".playlist-detail-view[data-header-compact='false'] .playlist-detail-heading h1");
    const expandedDetailDescriptionBlock = extractCssBlock(".playlist-detail-view[data-header-compact='false'] .playlist-detail-heading > p:not(.section-kicker)");
    const expandedDetailMetaBlock = extractCssBlock(".playlist-detail-view[data-header-compact='false'] .playlist-detail-meta");
    const expandedDetailActionsBlock = extractCssBlock(".playlist-detail-view[data-header-compact='false'] .playlist-detail-actions");
    const detailMetaBlock = extractCssBlock('.playlist-detail-meta');
    const detailActionsBlock = extractCssBlock('.playlist-detail-actions');
    const detailPlayButtonBlock = extractCssBlock('.playlist-detail-play-button');
    const detailPlayButtonIconBlock = extractCssBlock('.playlist-detail-play-button > svg');
    const detailPlayButtonHoverBlock = extractCssBlock('.playlist-detail-play-button:hover');
    const detailPlayButtonDisabledBlock = extractCssBlock('.playlist-detail-play-button:disabled');
    const playlistDetailBlock = extractCssBlock('.playlist-detail-view');

    expect(playlistDetailBlock).toContain('--playlist-detail-cover-sticky-size: 64px');
    expect(detailHeadingBlock).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(detailHeadingBlock).toContain('row-gap: 2px');
    expect(detailHeadingBlock).toContain('filter: blur(var(--playlist-detail-header-content-blur))');
    expect(expandedDetailHeadingBlock).toContain('align-self: center');
    expect(expandedDetailHeadingBlock).toContain('min-height: var(--playlist-detail-cover-current-size)');
    expect(expandedDetailHeadingBlock).toContain('grid-template-rows: auto 1fr auto auto 1fr auto');
    expect(expandedDetailTitleBlock).toContain('align-self: start');
    expect(expandedDetailDescriptionBlock).toContain('grid-row: 3');
    expect(expandedDetailDescriptionBlock).toContain('display: -webkit-box');
    expect(expandedDetailDescriptionBlock).toContain('-webkit-line-clamp: 2');
    expect(expandedDetailDescriptionBlock).toContain('white-space: normal');
    expect(expandedDetailMetaBlock).toContain('grid-row: 4');
    expect(expandedDetailActionsBlock).toContain('grid-row: 6');
    expect(expandedDetailActionsBlock).toContain('align-self: end');
    expect(detailMetaBlock).toContain('display: flex');
    expect(detailMetaBlock).toContain('grid-column: 1');
    expect(detailMetaBlock).toContain('font-size: 12px');
    expect(detailMetaBlock).toContain('line-height: 1.2');
    expect(detailMetaBlock).toContain('white-space: nowrap');
    expect(detailActionsBlock).toContain('max-height: var(--playlist-detail-meta-current-max-height)');
    expect(detailActionsBlock).toContain('grid-column: 1');
    expect(detailActionsBlock).toContain('justify-self: start');
    expect(detailActionsBlock).toContain('overflow: visible');
    expect(detailPlayButtonBlock).toContain('color: #fff');
    expect(detailPlayButtonBlock).toContain('background: var(--qq-primary-action)');
    expect(detailPlayButtonBlock).toContain('box-shadow: 0 9px 24px');
    expect(detailPlayButtonBlock).toContain('var(--qq-primary-action)');
    expect(detailPlayButtonBlock).toContain('height: 28px');
    expect(detailPlayButtonBlock).toContain('border-radius: 14px');
    expect(detailPlayButtonIconBlock).toContain('color: #fff');
    expect(detailPlayButtonHoverBlock).toContain('color: #fff');
    expect(detailPlayButtonHoverBlock).toContain('background: var(--qq-primary-action-hover)');
    expect(detailPlayButtonHoverBlock).toContain('box-shadow: 0 11px 28px');
    expect(detailPlayButtonHoverBlock).toContain('var(--qq-primary-action)');
    expect(detailPlayButtonHoverBlock).toContain('transform: none');
    expect(detailPlayButtonDisabledBlock).toContain('box-shadow: none');
    expect(detailPlayButtonHoverBlock).toContain('filter: none');
  });

  it('keeps artist tabs readable and animates entity link underlines', () => {
    const activeArtistTabBlock = extractCssBlock('.artist-detail-tab-active,\n.artist-detail-tab-active:hover');
    const entityLinkBlock = extractCssBlock('.song-entity-link');
    const entityUnderlineBlock = extractCssBlock('.song-entity-link::after');
    const entityUnderlineHoverBlock = extractCssBlock('.song-entity-link:hover::after');

    expect(activeArtistTabBlock).toContain('color: #fff');
    expect(activeArtistTabBlock).toContain('background: var(--visual-accent)');
    expect(entityLinkBlock).toContain('position: relative');
    expect(entityUnderlineBlock).toContain('background: currentColor');
    expect(entityUnderlineBlock).toContain('opacity: 0');
    expect(entityUnderlineBlock).toContain('transform: scaleX(0.35)');
    expect(entityUnderlineBlock).toContain('transition: transform 220ms var(--ease-out-soft), opacity 160ms ease');
    expect(entityUnderlineHoverBlock).toContain('opacity: 1');
    expect(entityUnderlineHoverBlock).toContain('transform: scaleX(1)');
  });

  it('keeps playlist detail chrome non-selectable while allowing title and description text selection', () => {
    const shellBlock = extractCssBlockContaining('.desktop-shell', 'user-select: none');
    const detailTitleBlock = extractCssBlock('.playlist-detail-heading h1');
    const detailDescriptionBlock = extractCssBlock('.playlist-detail-heading > p:not(.section-kicker)');
    const songRowBlock = extractCssBlock('.playlist-detail-song-row');
    const sidebarPlaylistBlock = extractCssBlock('.nav-playlist-item');

    expect(shellBlock).toContain('user-select: none');
    expect(detailTitleBlock).toContain('user-select: text');
    expect(detailDescriptionBlock).toContain('user-select: text');
    expect(songRowBlock).not.toContain('user-select: text');
    expect(sidebarPlaylistBlock).not.toContain('user-select: text');
  });

  it('uses anchored blur for popovers and a global feedback layer for playback notices', () => {
    const sharedPopoverBlock = extractCssBlock('.theme-popover,\n.login-popover,\n.settings-popover,\n.playback-mode-popover,\n.quality-popover,\n.volume-popover');
    const themeBlock = extractCssBlock('.theme-popover');
    const loginBlock = extractCssBlock('.login-popover');
    const settingsBlock = extractCssBlock('.settings-popover');
    const searchSuggestionBlock = extractCssBlock('.search-suggestion-popover');
    const playbackModeBlock = extractCssBlock('.playback-mode-popover');
    const qualityBlock = extractCssBlock('.quality-popover');
    const volumeBlock = extractCssBlock('.volume-popover');
    const playbackNoticeBlock = extractCssBlock('.playback-notice');
    const appNotificationSurfaceBlock = extractCssBlock('.playback-notice,\n.app-notification');
    const appNotificationCopyBlock = extractCssBlock('.app-notification-copy strong');
    const appNotificationActionBlock = extractCssBlock('.app-notification-action');
    const appNotificationHoverBlock = extractCssBlock('.app-notification.glass-surface:hover');
    const playbackNoticeOpenBlock = extractCssBlock(".playback-notice[data-state='open']");
    const playbackNoticeClosedBlock = extractCssBlock(".playback-notice[data-state='closed']");
    const playbackFeedbackLayerBlock = extractCssBlock('.playback-feedback-layer');
    const topAnchoredBlock = extractCssBlock('.theme-popover,\n.login-popover,\n.settings-popover,\n.search-suggestion-popover');
    const bottomAnchoredBlock = extractCssBlock('.playback-mode-popover,\n.quality-popover,\n.volume-popover');
    const openBlock = extractCssBlock(".theme-popover[data-state='open'],\n.login-popover[data-state='open'],\n.settings-popover[data-state='open'],\n.search-suggestion-popover[data-state='open'],\n.playback-mode-popover[data-state='open'],\n.quality-popover[data-state='open'],\n.volume-popover[data-state='open']");
    const closedBlock = extractCssBlock(".theme-popover[data-state='closed'],\n.login-popover[data-state='closed'],\n.settings-popover[data-state='closed'],\n.search-suggestion-popover[data-state='closed'],\n.playback-mode-popover[data-state='closed'],\n.quality-popover[data-state='closed'],\n.volume-popover[data-state='closed']");
    const searchSuggestionOpenBlock = extractCssBlock(".search-suggestion-popover[data-state='open']");
    const searchSuggestionClosedBlock = extractCssBlock(".search-suggestion-popover[data-state='closed']");
    const inKeyframes = extractKeyframesBlock('anchoredPopoverIn');
    const outKeyframes = extractKeyframesBlock('anchoredPopoverOut');
    const feedbackInKeyframes = extractKeyframesBlock('playbackFeedbackIn');
    const feedbackOutKeyframes = extractKeyframesBlock('playbackFeedbackOut');

    expect(css).not.toContain('.login-dialog-backdrop');
    expect(css).not.toContain('.desktop-shell .queue-panel::after');
    expect(css).not.toContain('.lyrics-panel::after');
    expect(css).not.toContain('--qq-glass-edge-');
    expect(css).not.toContain('.theme-popover::after');
    expect(css).not.toContain('.theme-popover::before');
    expect(css).not.toContain('.login-popover::after');
    expect(css).not.toContain('.login-popover::before');
    expect(css).not.toContain('.settings-popover::after');
    expect(css).not.toContain('.settings-popover::before');
    expect(css).not.toContain('.search-suggestion-popover::after');
    expect(css).not.toContain('.search-suggestion-popover::before');
    expect(css).not.toContain('.playback-mode-popover::after');
    expect(css).not.toContain('.playback-mode-popover::before');
    expect(css).not.toContain('.quality-popover::after');
    expect(css).not.toContain('.quality-popover::before');
    expect(css).not.toContain('.volume-popover::after');
    expect(css).not.toContain('.volume-popover::before');
    expect(css).not.toContain('.playback-notice::after');
    expect(css).not.toContain('.playback-notice::before');
    expect(css).not.toContain('.lyrics-translation-unavailable::after');
    expect(sharedPopoverBlock).toContain('background: var(--qq-glass-bg)');
    expect(sharedPopoverBlock).toContain('border: 1px solid var(--qq-glass-border)');
    expect(sharedPopoverBlock).toContain('box-shadow: var(--qq-popover-shadow)');
    expect(sharedPopoverBlock).toContain('backdrop-filter: var(--qq-glass-filter)');
    expect(sharedPopoverBlock).toContain('-webkit-backdrop-filter: var(--qq-glass-filter)');
    expect(sharedPopoverBlock).toContain('isolation: isolate');
    expect(sharedPopoverBlock).toContain('overflow: visible');
    expect(sharedPopoverBlock).toContain('transform-origin: var(--popover-origin-x, 100%) var(--popover-origin-y, 0)');
    expect(sharedPopoverBlock).toContain('will-change: opacity, transform, filter');
    expect(sharedPopoverBlock).not.toContain('--qq-popover-edge-');
    expect(css).not.toContain('data-sampled-backdrop');
    expect(css).not.toContain('.popover-sampled-edge');
    expect(themeBlock).toContain('width: 360px');
    expect(loginBlock).toContain('width: 360px');
    expect(settingsBlock).toContain('width: 320px');
    expect(playbackModeBlock).toContain('width: 136px');
    expect(qualityBlock).toContain('width: 112px');
    expect(volumeBlock).toContain('width: 54px');
    expect(topAnchoredBlock).toContain('--popover-slide-y: -4px');
    expect(bottomAnchoredBlock).toContain('--popover-slide-y: 4px');
    expect(searchSuggestionBlock).toContain('background: var(--qq-glass-bg)');
    expect(searchSuggestionBlock).toContain('border: 1px solid var(--qq-glass-border)');
    expect(searchSuggestionBlock).toContain('box-shadow: var(--qq-popover-shadow)');
    expect(searchSuggestionBlock).toContain('backdrop-filter: var(--qq-glass-filter)');
    expect(searchSuggestionBlock).toContain('-webkit-backdrop-filter: var(--qq-glass-filter)');
    expect(searchSuggestionBlock).toContain('isolation: isolate');
    expect(searchSuggestionBlock).toContain('transform-origin: var(--popover-origin-x, 100%) var(--popover-origin-y, 0)');
    expect(searchSuggestionBlock).toContain('will-change: opacity, transform, filter');
    expect(playbackNoticeBlock).toContain('background: var(--qq-glass-bg)');
    expect(playbackNoticeBlock).toContain('border-color: var(--qq-glass-border)');
    expect(playbackNoticeBlock).toContain('box-shadow: var(--qq-glass-shadow)');
    expect(playbackNoticeBlock).toContain('width: fit-content');
    expect(playbackNoticeBlock).toContain('max-width: min(460px, calc(100vw - 32px))');
    expect(appNotificationSurfaceBlock).toContain('border-radius: 12px');
    expect(appNotificationSurfaceBlock).toContain('display: inline-flex');
    expect(appNotificationSurfaceBlock).toContain('pointer-events: none');
    expect(appNotificationSurfaceBlock).toContain('0 24px 64px');
    expect(appNotificationSurfaceBlock).toContain('0 8px 24px');
    expect(appNotificationCopyBlock).toContain('white-space: normal');
    expect(appNotificationCopyBlock).toContain('overflow-wrap: anywhere');
    expect(appNotificationActionBlock).toContain('pointer-events: auto');
    expect(appNotificationHoverBlock).toContain('transform: none');
    expect(css).not.toContain('.playback-notice-close');
    expect(playbackFeedbackLayerBlock).toContain('position: fixed');
    expect(playbackFeedbackLayerBlock).toContain('z-index: 140');
    expect(playbackFeedbackLayerBlock).toContain('justify-items: center');
    expect(playbackFeedbackLayerBlock).toContain(
      'padding: max(36px, env(safe-area-inset-top)) 16px 16px'
    );
    expect(openBlock).toContain('animation: anchoredPopoverIn 200ms var(--ease-out-soft)');
    expect(closedBlock).toContain('animation: anchoredPopoverOut 180ms ease forwards');
    expect(searchSuggestionOpenBlock).toContain('animation: anchoredPopoverIn 200ms var(--ease-out-soft)');
    expect(searchSuggestionClosedBlock).toContain('animation: anchoredPopoverOut 180ms ease forwards');
    expect(playbackNoticeOpenBlock).toContain('animation: playbackFeedbackIn 200ms var(--ease-out-soft)');
    expect(playbackNoticeClosedBlock).toContain('animation: playbackFeedbackOut 180ms ease forwards');
    expect(feedbackInKeyframes).toContain('transform: translate3d(0, -8px, 0) scale(0.96)');
    expect(feedbackInKeyframes).toContain('filter: blur(6px)');
    expect(feedbackOutKeyframes).toContain('transform: translate3d(0, -5px, 0) scale(0.96)');
    expect(feedbackOutKeyframes).toContain('filter: blur(6px)');
    expect(inKeyframes).toContain('filter: blur(8px)');
    expect(inKeyframes).toContain('filter: blur(0)');
    expect(inKeyframes).toContain('transform: translate3d(var(--popover-slide-x, 0), var(--popover-slide-y, -4px), 0) scale(0.94)');
    expect(outKeyframes).toContain('filter: blur(0)');
    expect(outKeyframes).toContain('filter: blur(8px)');
    expect(outKeyframes).toContain('transform: translate3d(var(--popover-slide-x, 0), var(--popover-slide-y, -4px), 0) scale(0.94)');
  });

  it('uses palette-derived glass transitions for detail floating controls and playback feedback', () => {
    const floatingButtonBlock = extractCssBlock('.playlist-detail-floating-button');
    const floatingButtonBeforeBlock = extractCssBlock('.playlist-detail-floating-button::before');
    const floatingButtonIconBlock = extractCssBlock('.playlist-detail-floating-button > svg');
    const floatingButtonOpenBlock = extractCssBlock(".playlist-detail-floating-button[data-state='open']");
    const floatingButtonClosedBlock = extractCssBlock(".playlist-detail-floating-button[data-state='closed']");
    const toastBlock = extractCssBlock('.playback-started-toast');
    const feedbackInKeyframes = extractKeyframesBlock('playbackFeedbackIn');
    const feedbackOutKeyframes = extractKeyframesBlock('playbackFeedbackOut');

    expect(floatingButtonBlock).toContain('background:');
    expect(floatingButtonBlock).toContain('background: var(--qq-glass-bg)');
    expect(floatingButtonBlock).toContain('border: 1px solid var(--qq-glass-border)');
    expect(floatingButtonBlock).toContain('box-shadow:');
    expect(floatingButtonBlock).toContain('var(--qq-on-accent) 18%');
    expect(floatingButtonBlock).toContain('var(--qq-text) 14%');
    expect(floatingButtonBlock).not.toContain('#ffffff');
    expect(floatingButtonBeforeBlock).toContain('background:');
    expect(floatingButtonBeforeBlock).toContain('linear-gradient(');
    expect(floatingButtonBeforeBlock).toContain('var(--qq-on-accent) 18%');
    expect(floatingButtonBeforeBlock).toContain('var(--qq-primary-action) 12%');
    expect(floatingButtonIconBlock).toContain('position: relative');
    expect(floatingButtonIconBlock).toContain('z-index: 1');
    expect(floatingButtonOpenBlock).toContain('animation: anchoredPopoverIn 200ms var(--ease-out-soft)');
    expect(floatingButtonClosedBlock).toContain('animation: anchoredPopoverOut 180ms ease forwards');

    expect(toastBlock).toContain('max-width: min(320px, calc(100vw - 32px))');
    expect(toastBlock).toContain('animation: playbackFeedbackIn 200ms var(--ease-out-soft) both');
    expect(toastBlock).toContain('playbackFeedbackOut 180ms ease 1580ms forwards');
    expect(feedbackInKeyframes).toContain('filter: blur(6px)');
    expect(feedbackInKeyframes).toContain('filter: blur(0)');
    expect(feedbackOutKeyframes).toContain('filter: blur(0)');
    expect(feedbackOutKeyframes).toContain('filter: blur(6px)');
  });

  it('animates the queue panel from the right with blur and frosted glass', () => {
    const queuePanelBlock = extractCssBlock('.desktop-shell .queue-panel');
    const queuePanelOpenBlock = extractCssBlock(".desktop-shell .queue-panel[data-state='open']");
    const queuePanelClosedBlock = extractCssBlock(".desktop-shell .queue-panel[data-state='closed']");
    const inKeyframes = extractKeyframesBlock('queuePanelIn');
    const outKeyframes = extractKeyframesBlock('queuePanelOut');

    expect(queuePanelBlock).toContain('background: var(--qq-persistent-chrome-bg)');
    expect(queuePanelBlock).toContain('border-left: 1px solid var(--qq-persistent-chrome-border)');
    expect(queuePanelBlock).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(queuePanelBlock).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(queuePanelBlock).toContain('box-shadow: -18px 0 50px var(--qq-persistent-chrome-shadow-color)');
    expect(queuePanelBlock).toContain('clip-path: inset(-72px 0 0 -72px)');
    expect(queuePanelBlock).toContain('will-change: opacity, transform');
    expect(queuePanelBlock).not.toContain('will-change: opacity, transform, filter');
    expect(queuePanelBlock).toContain('transform-origin: 100% 50%');
    expect(queuePanelOpenBlock).toContain('animation: queuePanelIn 220ms var(--ease-out-soft)');
    expect(queuePanelClosedBlock).toContain('animation: queuePanelOut 190ms ease forwards');
    expect(inKeyframes).toContain('transform: translate3d(36px, 0, 0) scale(0.985)');
    expect(inKeyframes).toContain('filter: blur(10px)');
    expect(inKeyframes).toContain('transform: translate3d(0, 0, 0) scale(1)');
    expect(inKeyframes).toContain('filter: blur(0)');
    expect(outKeyframes).toContain('transform: translate3d(0, 0, 0) scale(1)');
    expect(outKeyframes).toContain('filter: blur(0)');
    expect(outKeyframes).toContain('transform: translate3d(36px, 0, 0) scale(0.985)');
    expect(outKeyframes).toContain('filter: blur(10px)');
  });

  it('provides stable main-content layers and one complete reduced-effects override', () => {
    const transitionStageBlock = extractMergedCssBlock('.main-content-transition-stage');
    const transitionPageStageBlock = extractCssBlock('.main-content-transition-stage-page');
    const transitionLayerBlock = extractCssBlock('.main-content-transition-layer');
    const transitionOutgoingLayerBlock = extractCssBlock('.main-content-transition-layer-outgoing');
    const transitionActiveLayerBlock = extractMergedCssBlock('.main-content-transition-layer-active');
    const contentSurfaceResetBlock = extractCssBlock(
      '.main-content,\n.main-content-transition-stage,\n.main-content-transition-layer-active'
    );
    const virtualPlaylistGridBlock = extractCssBlock(
      ".playlist-discovery-grid-shell[data-virtualized='true'] .playlist-discovery-grid"
    );
    const settingsBlock = extractCssBlock('.settings-popover');
    const settingsSegmentsBlock = extractCssBlock('.settings-motion-segments');
    const settingsSwitchBlock = extractCssBlock('.settings-switch-track');
    const reducedRootBlock = extractCssBlock(":root[data-reduce-effects='true']");
    const reducedBackdropBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] body *,\n:root[data-reduce-effects='true'] body *::before,\n:root[data-reduce-effects='true'] body *::after"
    );
    const reducedOpaqueSurfacesBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .glass-surface,\n:root[data-reduce-effects='true'] .desktop-shell .queue-panel,\n:root[data-reduce-effects='true'] .desktop-shell > .player-bar,\n:root[data-reduce-effects='true'] .playback-started-toast,\n:root[data-reduce-effects='true'] .playlist-detail-floating-button"
    );
    const reducedOpenBlock = extractCssBlock(":root[data-reduce-effects='true'] [data-state='open']");
    const reducedClosedBlock = extractCssBlock(":root[data-reduce-effects='true'] [data-state='closed']");
    const reducedLyricsDepthBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .playback-stage-3d,\n:root[data-reduce-effects='true'] .lyrics-depth-background,\n:root[data-reduce-effects='true'] .lyrics-depth-cover,\n:root[data-reduce-effects='true'] .lyrics-depth-title,\n:root[data-reduce-effects='true'] .lyrics-depth-text,\n:root[data-reduce-effects='true'] .stage-orbit"
    );
    const reducedLyricsGlowBlock = extractCssBlock(":root[data-reduce-effects='true'] .lyric-active .lyric-char::before");
    const reducedLyricsFillBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .lyric-active .lyric-char.lyric-char-filled.lyric-char-in-progress::after"
    );
    const reducedLyricsMediaClockFillBlock = extractCssBlock(
      ".lyrics-lines[data-lyric-media-clock='active'] .lyric-active .lyric-char.lyric-char-filled.lyric-char-in-progress::after"
    );
    const reducedHiddenLyricsCursorBlock = extractCssBlock(
      ":root[data-reduce-effects='true'] .lyrics-panel[data-chrome-state='hidden']"
    );
    const reducedFadeIn = extractKeyframesBlock('reducedEffectsFadeIn');
    const reducedFadeOut = extractKeyframesBlock('reducedEffectsFadeOut');

    expect(transitionStageBlock).toContain('position: relative');
    expect(transitionStageBlock).toContain('overflow: visible');
    expect(transitionStageBlock).toContain('isolation: isolate');
    expect(transitionStageBlock).not.toContain('display: grid');
    expect(transitionStageBlock).toContain('contain: layout style');
    expect(transitionStageBlock).not.toContain('paint');
    expect(transitionPageStageBlock).toContain('display: grid');
    expect(transitionPageStageBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(transitionLayerBlock).toContain('width: 100%');
    expect(transitionLayerBlock).toContain('backface-visibility: hidden');
    expect(transitionLayerBlock).not.toContain('will-change');
    expect(transitionLayerBlock).not.toContain('grid-area: 1 / 1');
    expect(transitionOutgoingLayerBlock).toContain('position: absolute');
    expect(transitionOutgoingLayerBlock).toContain('inset: 0');
    expect(transitionOutgoingLayerBlock).toContain('z-index: 1');
    expect(transitionOutgoingLayerBlock).toContain('contain: layout style paint');
    expect(transitionOutgoingLayerBlock).toContain('pointer-events: none');
    expect(transitionActiveLayerBlock).toContain('position: relative');
    expect(transitionActiveLayerBlock).toContain('z-index: 2');
    expect(contentSurfaceResetBlock).toContain('background-color: transparent');
    expect(contentSurfaceResetBlock).toContain('background-image: none');
    expect(virtualPlaylistGridBlock).not.toContain('will-change');

    expect(settingsBlock).toContain('width: 320px');
    expect(settingsSegmentsBlock).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(settingsSegmentsBlock).toContain('border-radius: 7px');
    expect(settingsSwitchBlock).toContain('width: 34px');
    expect(settingsSwitchBlock).toContain('height: 20px');

    expect(reducedRootBlock).toContain('--qq-glass-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.18)');
    expect(reducedRootBlock).toContain('--qq-persistent-chrome-border: var(--qq-line)');
    expect(reducedRootBlock).toContain('--qq-persistent-chrome-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.12)');
    expect(reducedBackdropBlock).toBe('');
    expect(reducedOpaqueSurfacesBlock).not.toContain('background-color:');
    expect(reducedOpaqueSurfacesBlock).not.toContain('background-image:');
    expect(reducedOpaqueSurfacesBlock).toContain('transition: none !important');

    expect(reducedOpenBlock).toContain('animation: reducedEffectsFadeIn 120ms linear both !important');
    expect(reducedOpenBlock).toContain('transform: none !important');
    expect(reducedOpenBlock).toContain('filter: none !important');
    expect(reducedClosedBlock).toContain('animation: reducedEffectsFadeOut 100ms linear both !important');
    expect(reducedFadeIn).toContain('opacity: 0');
    expect(reducedFadeIn).toContain('opacity: 1');
    expect(reducedFadeIn).not.toContain('filter:');
    expect(reducedFadeIn).not.toContain('transform:');
    expect(reducedFadeOut).not.toContain('filter:');
    expect(reducedFadeOut).not.toContain('transform:');

    expect(reducedLyricsDepthBlock).toContain('perspective: none !important');
    expect(reducedLyricsDepthBlock).toContain('transform: none !important');
    expect(reducedLyricsDepthBlock).toContain('transform-style: flat !important');
    expect(reducedLyricsGlowBlock).toContain('display: none');
    expect(reducedLyricsFillBlock).toContain('transition: clip-path 300ms linear !important');
    expect(reducedLyricsFillBlock).toContain('will-change: clip-path');
    expect(reducedLyricsMediaClockFillBlock).toContain('transition: none !important');
    expect(reducedHiddenLyricsCursorBlock).toContain('cursor: default');
    expect(css).not.toContain('.lyrics-transition-cover');
    expect(css).not.toContain('.lyrics-transition-refraction');
    expect(css).not.toContain('.lyrics-transition-curtain');
  });

  it('uses direct glyph updates when the reduced lyrics media clock is active', () => {
    const mediaClockFillBlock = extractCssBlock(
      ".lyrics-lines[data-lyric-media-clock='active'] .lyric-active .lyric-char.lyric-char-filled.lyric-char-in-progress::after"
    );

    expect(mediaClockFillBlock).toContain('transition: none !important');
  });

  it('keeps keyboard focus feedback while leaving the search input itself visually quiet', () => {
    const globalFocusBlock = extractCssBlock('*,\n*::before,\n*::after');
    const keyboardFocusResetBlock = extractCssBlock(':where(*):focus,\n:where(*):focus-visible');
    const interactiveFocusBlock = extractCssBlock(':where(button, input, select, textarea, a, [tabindex]):focus-visible');
    const searchInputBlock = extractMergedCssBlock('.search-box input');

    expect(globalFocusBlock).toBe('');
    expect(keyboardFocusResetBlock).toBe('');
    expect(interactiveFocusBlock).toContain('outline: none !important');
    expect(interactiveFocusBlock).toContain('box-shadow: 0 0 0 2px');
    expect(searchInputBlock).toContain('outline: 0;');
    expect(css).toMatch(
      /\.search-box input,[\s\S]*?\.search-box input:focus-visible\s*\{[\s\S]*?outline: 0 !important;[\s\S]*?box-shadow: none !important;/
    );
  });

  it('keeps a full top-bar drag surface available while popovers are open', () => {
    const dragSurfaceBlock = extractCssBlock('.top-bar-drag-surface');
    const dragSpaceBlock = extractCssBlock('.top-drag-space');

    expect(dragSurfaceBlock).toContain('inset: 0');
    expect(dragSurfaceBlock).toContain('-webkit-app-region: drag');
    expect(dragSpaceBlock).toContain('-webkit-app-region: drag');
  });

  it('keeps playlist discovery dense, scrollable, and stable across compact viewports', () => {
    const mainBlock = extractCssBlock('.main-content-playlist-discovery');
    const categorySwitcherBlock = extractCssBlock('.playlist-discovery-category-switcher');
    const categoryShortcutBlock = extractCssBlock('.playlist-discovery-category-shortcuts');
    const categoryMenuBlock = extractMergedCssBlock('.playlist-discovery-category-menu');
    const categoryMenuGroupsBlock = extractCssBlock('.playlist-discovery-category-menu-groups');
    const gridShellBlock = extractCssBlock('.playlist-discovery-grid-shell');
    const gridBlock = extractCssBlock('.playlist-discovery-grid');
    const sceneBlock = extractCssBlock('.playlist-discovery-card-scene');
    const imageBlock = extractCssBlock('.playlist-discovery-card-image');
    const cardBlock = extractCssBlock('.playlist-discovery-card');
    const cardOpenBlock = extractCssBlock('.playlist-discovery-card-open');
    const enteringCardBlock = extractCssBlock('.playlist-discovery-card-entering');
    const enteringKeyframes = extractKeyframesBlock('playlistDiscoveryCardIn');
    const categoryMenuInKeyframes = extractKeyframesBlock('playlistCategoryMenuIn');
    const categoryMenuOutKeyframes = extractKeyframesBlock('playlistCategoryMenuOut');
    const categoryButtonBlock = extractCssBlock('.playlist-discovery-category');
    const categoryFocusBlock = extractCssBlock('.playlist-discovery-category:focus-visible');
    const discoveryRefreshBlock = extractMergedCssBlock('.discovery-home-refresh');
    const providerRefreshBlock = extractMergedCssBlock('.provider-page-refresh');
    const skeletonCardBlock = extractCssBlock('.playlist-discovery-skeleton-card');
    const skeletonCoverBlock = extractCssBlock('.playlist-discovery-skeleton-cover');
    const skeletonGridBlock = extractCssBlock('.playlist-discovery-skeleton-grid');
    const skeletonSweepBlock = extractCssBlock('.playlist-discovery-skeleton-grid::after');
    const skeletonKeyframes = extractKeyframesBlock('playlistDiscoverySkeletonSweep');
    const appendLoaderBlock = extractCssBlock('.playlist-discovery-load-more-loader');
    const chartCardBlock = extractCssBlock('.chart-card');
    const chartOpenBlock = extractCssBlock('.chart-card-open');
    const chartHoverCoverBlock = extractCssBlock('.chart-card-open:hover .chart-card-cover');
    const titleBlock = extractMergedCssBlock('.playlist-discovery-card-copy h2');
    const descriptionBlock = extractCssBlock('.playlist-discovery-card-description');
    const settingsAppRowBlock = extractCssBlock('.settings-app-row');
    const discoverySectionBlock = extractCssBlock('.discovery-provider-home > .discovery-section');

    expect(mainBlock).toContain('overflow-y: auto');
    expect(mainBlock).toContain('scrollbar-gutter: stable');
    expect(categorySwitcherBlock).toContain('display: flex');
    expect(categoryShortcutBlock).toContain('overflow-x: auto');
    expect(categoryShortcutBlock).toContain('scrollbar-width: none');
    expect(categoryMenuBlock).toContain('position: absolute');
    expect(categoryMenuBlock).toContain('max-height: min(544px');
    expect(categoryMenuBlock).toContain(
      'backdrop-filter: blur(var(--app-backdrop-blur-radius)) saturate(1.18)'
    );
    expect(categoryMenuBlock).toContain('will-change: opacity, transform, filter');
    expect(categoryMenuBlock).toContain('border-radius: 8px');
    expect(categoryMenuBlock).not.toContain('border-radius: var(--catalog-control-radius)');
    expect(categoryMenuInKeyframes).toContain('filter: blur(8px)');
    expect(categoryMenuOutKeyframes).toContain('filter: blur(8px)');
    expect(categoryMenuGroupsBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(categoryButtonBlock).toContain('border-radius: var(--radius-pill)');
    expect(categoryFocusBlock).toContain('outline: 2px solid');
    expect(discoveryRefreshBlock).toContain('width: 34px');
    expect(discoveryRefreshBlock).toContain('height: 34px');
    expect(discoveryRefreshBlock).toContain('border-radius: var(--radius-pill)');
    expect(providerRefreshBlock).toContain('width: 34px');
    expect(providerRefreshBlock).toContain('height: 34px');
    expect(providerRefreshBlock).toContain('border-radius: var(--radius-pill)');
    expect(gridShellBlock).toContain('container-type: inline-size');
    expect(gridBlock).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).not.toContain('repeat(auto-fill');
    expect(sceneBlock).toContain('aspect-ratio: 1');
    expect(sceneBlock).toContain('transform-style: preserve-3d');
    expect(imageBlock).toContain('inset: 0');
    expect(imageBlock).toContain('width: 100%');
    expect(imageBlock).toContain('height: 100%');
    expect(imageBlock).toContain('object-fit: cover');
    expect(imageBlock).not.toContain('scale(');
    expect(css).toContain('@supports (content-visibility: auto)');
    expect(css).toContain('content-visibility: auto');
    expect(css).toContain('contain-intrinsic-size: auto 360px');
    expect(discoverySectionBlock).toContain('contain: layout style');
    expect(discoverySectionBlock).toContain('overflow-clip-margin: 24px');
    expect(cardOpenBlock).toContain('box-shadow: none');
    expect(enteringCardBlock).toContain('animation: playlistDiscoveryCardIn');
    expect(enteringKeyframes).toContain('filter: blur(3px)');
    expect(enteringKeyframes).not.toContain('translate3d');
    expect(skeletonCardBlock).toContain('display: grid');
    expect(skeletonCoverBlock).not.toContain('animation:');
    expect(skeletonGridBlock).toContain('overflow: hidden');
    expect(skeletonSweepBlock).toContain('animation: playlistDiscoverySkeletonSweep');
    expect(skeletonSweepBlock).toContain('will-change: transform');
    expect(skeletonKeyframes).toContain('transform: translate3d(130%, 0, 0)');
    expect(appendLoaderBlock).toContain('animation: sidebarRefreshSpin');
    expect(chartCardBlock).not.toContain('content-visibility: auto');
    expect(chartOpenBlock).toContain('box-shadow: none');
    expect(chartHoverCoverBlock).toContain('transform: translate3d(0, -3px, 0)');
    expect(titleBlock).toContain('-webkit-line-clamp: 2');
    expect(titleBlock).toContain('overflow-wrap: anywhere');
    expect(descriptionBlock).toBe('');
    expect(settingsAppRowBlock).toBe('');
  });

  it('uses one stable source switcher treatment across discovery and catalog pages', () => {
    const sharedControlBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-control,\n' +
      '.charts-view .provider-page-header .provider-segmented-control,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-control'
    );
    const sharedOptionBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-option,\n' +
      '.charts-view .provider-page-header .provider-segmented-option,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-option'
    );
    const sharedActiveBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-option-active,\n' +
      '.discovery-home .discovery-home-header .provider-segmented-option-active:hover,\n' +
      '.discovery-home .discovery-home-header .provider-segmented-option-active:focus-visible,\n' +
      '.charts-view .provider-page-header .provider-segmented-option-active,\n' +
      '.charts-view .provider-page-header .provider-segmented-option-active:hover,\n' +
      '.charts-view .provider-page-header .provider-segmented-option-active:focus-visible,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-option-active,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-option-active:hover,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-option-active:focus-visible'
    );
    const sharedMarkerResetBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-option::after,\n' +
      '.charts-view .provider-page-header .provider-segmented-option::after,\n' +
      '.playlist-discovery-view .provider-page-header .provider-segmented-option::after'
    );

    expect(sharedControlBlock).toContain('var(--visual-panel-border) 78%');
    expect(sharedControlBlock).toContain('var(--visual-deep-surface) 72%');
    expect(sharedControlBlock).not.toContain('--catalog-control-');
    expect(sharedOptionBlock).toContain('min-width: 84px');
    expect(sharedOptionBlock).toContain('color 160ms ease');
    expect(sharedOptionBlock).toContain('background-color 160ms ease');
    expect(sharedActiveBlock).toContain('color: #fff');
    expect(sharedActiveBlock).toContain('background: var(--qq-primary-action)');
    expect(sharedActiveBlock).toContain('background-image: none');
    expect(sharedActiveBlock).not.toMatch(/(?:height|padding|border-width):/);
    expect(sharedMarkerResetBlock).toContain('content: none');
    expect(css).toContain('--catalog-control-radius: var(--radius-pill)');
    expect(css).toContain('.playlist-discovery-category {\n  border-radius: var(--radius-pill);');
  });

  it('keeps provider discovery homes dense, responsive, and motion-safe', () => {
    const brandNameBlock = extractCssBlock('.brand-name');
    const sharedHeadingBlock = extractCssBlock(
      '.qq-section-heading h1,\n.section-heading h2,\n.queue-heading h2'
    );
    const playlistDetailHeadingBlock = extractMergedCssBlock('.playlist-detail-heading h1');
    const homeViewBlock = extractCssBlock('.home-view.discovery-home');
    const providerHomeBlock = extractCssBlock('.discovery-provider-home');
    const homeHeaderBlock = extractCssBlock('.discovery-home-header');
    const homeTitleBlock = extractCssBlock('.discovery-home-header h1');
    const sectionHeaderBlock = extractCssBlock('.discovery-section-header');
    const sectionTitleBlock = extractCssBlock('.discovery-section-header h2');
    const sectionActionBlock = extractCssBlock('.discovery-section-action');
    const providerTabBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-option'
    );
    const activeProviderTabBlock = extractCssBlock(
      '.discovery-home .discovery-home-header .provider-segmented-option-active,\n' +
      '.discovery-home .discovery-home-header .provider-segmented-option-active:hover'
    );
    const featuredTitleBlock = extractCssBlock('.qq-discovery-featured-copy strong');
    const artworkBlock = extractCssBlock('.discovery-artwork');
    const artworkImageBlock = extractCssBlock('.discovery-artwork > img');
    const fallbackBlock = extractCssBlock(".discovery-artwork-fallback[data-artwork-variant='0']");
    const coverPlayBlock = extractCssBlock('.discovery-cover-play');
    const quickStartBlock = extractCssBlock('.discovery-home .qq-discovery-quick-start');
    const primaryPreviewRowsBlock = extractCssBlock(
      '.qq-discovery-primary-preview > .qq-discovery-new-song-row,\n' +
      '.netease-discovery-primary-preview > .netease-discovery-song-row'
    );
    const qqServicePlayBlock = extractCssBlock('.qq-discovery-service-play');
    const qqNewSongGridBlock = extractCssBlock('.qq-discovery-new-song-grid');
    const qqNewSongOpenBlock = extractCssBlock('.qq-discovery-new-song-open');
    const qqNewSongSurfaceBlock = extractCssBlock('.qq-discovery-new-song-open::before');
    const qqNewSongArtworkBlock = extractCssBlock('.qq-discovery-new-song-artwork');
    const qqNewSongPlayBlock = extractCssBlock('.qq-discovery-new-song-play');
    const neteaseFeatureGridBlock = extractCssBlock('.discovery-home .netease-discovery-feature-grid');
    const neteaseFeatureCardBlock = extractCssBlock('.discovery-home .netease-discovery-feature-card');
    const neteaseFeatureActionBlock = extractCssBlock('.netease-discovery-feature-action');
    const neteasePrimaryPreviewBlock = extractCssBlock('.netease-discovery-primary-preview');
    const neteaseFeatureArtworkBlock = extractCssBlock('.netease-discovery-feature-artwork');
    const neteaseFeaturePaletteBlock = extractCssBlock('.netease-discovery-feature-palette');
    const neteaseFeatureRevealBlock = extractCssBlock('.netease-discovery-feature-reveal');
    const neteaseFeaturePreviewListBlock = extractCssBlock('.netease-discovery-feature-preview-list');
    const neteaseFeatureHoverBlock = extractCssBlock(
      '.netease-discovery-feature-card-interactive:hover,\n' +
      '.netease-discovery-feature-card-interactive:focus-within'
    );
    const neteaseFeatureHoverRevealBlock = extractCssBlock(
      '.netease-discovery-feature-card-interactive:hover .netease-discovery-feature-reveal,\n' +
      '.netease-discovery-feature-card-interactive:focus-within .netease-discovery-feature-reveal'
    );
    const neteaseSongGridBlock = extractCssBlock('.netease-discovery-song-grid');
    const neteaseSongRowBlock = extractCssBlock('.netease-discovery-song-row');
    const neteaseSongOpenBlock = extractCssBlock('.netease-discovery-song-open');
    const neteaseSongHoverBlock = extractCssBlock(
      '.netease-discovery-song-open:hover:not(:disabled),\n' +
      '.netease-discovery-song-open:focus-visible:not(:disabled)'
    );
    const neteaseSongHoverLayerBlock = extractCssBlock(
      '.netease-discovery-song-open:hover:not(:disabled)::before,\n' +
      '.netease-discovery-song-open:focus-visible:not(:disabled)::before'
    );
    const neteaseSongArtworkBlock = extractCssBlock('.netease-discovery-song-artwork');
    const neteaseSongPlayBlock = extractCssBlock('.netease-discovery-song-play-indicator');
    const neteaseSongTitleBlock = extractCssBlock('.netease-discovery-song-copy strong');
    const neteaseSongCurrentLayerBlock = extractCssBlock(
      '.netease-discovery-song-row-current .netease-discovery-song-open::before'
    );
    const neteaseSongCurrentTextBlock = extractCssBlock(
      '.netease-discovery-song-row-current .netease-discovery-song-index,\n' +
      '.netease-discovery-song-row-current .netease-discovery-song-copy strong,\n' +
      '.netease-discovery-song-row-current .netease-discovery-song-duration'
    );
    const recommendationCssStart = css.indexOf('/* Provider-specific recommendation homes. */');
    const recommendationCssEnd = css.indexOf('/* White/black theme contract and final page-level fixes. */', recommendationCssStart);
    const recommendationCss = css.slice(
      recommendationCssStart,
      recommendationCssEnd === -1 ? undefined : recommendationCssEnd
    );

    expect(recommendationCssStart).toBeGreaterThan(-1);
    expect(brandNameBlock).toContain('font-size: 21px');
    expect(brandNameBlock).toContain('font-weight: 400');
    expect(sharedHeadingBlock).toContain('font-size: 20px');
    expect(sharedHeadingBlock).toContain('font-weight: 800');
    expect(playlistDetailHeadingBlock).toContain('font-weight: 800');
    expect(homeViewBlock).toContain('gap: 0');
    expect(providerHomeBlock).toContain('container-name: discovery-home');
    expect(providerHomeBlock).toContain('container-type: inline-size');
    expect(providerHomeBlock).not.toContain('overflow-y: auto');
    expect(homeHeaderBlock).toContain('min-height: 44px');
    expect(homeTitleBlock).toContain('font-size: 24px');
    expect(homeTitleBlock).toContain('font-weight: 800');
    expect(sectionHeaderBlock).toContain('min-height: 36px');
    expect(sectionTitleBlock).toContain('font-size: 19px');
    expect(sectionTitleBlock).toContain('font-weight: 760');
    expect(sectionActionBlock).toContain('font-weight: 650');
    expect(providerTabBlock).toContain('transition:');
    expect(providerTabBlock).toContain('color 160ms ease');
    expect(providerTabBlock).toContain('background-color 160ms ease');
    expect(activeProviderTabBlock).toContain('color: #fff');
    expect(activeProviderTabBlock).toContain('background: var(--qq-primary-action)');
    expect(recommendationCss).not.toContain(
      '.discovery-home .discovery-home-header .provider-segmented-option::after'
    );
    expect(recommendationCss).not.toContain(
      '.discovery-home .discovery-home-header .provider-segmented-option-active::after'
    );
    expect(featuredTitleBlock).toContain('font-size: 24px');
    expect(featuredTitleBlock).toContain('font-weight: 620');
    expect(artworkBlock).toContain('border-radius: 6px');
    expect(artworkBlock).toContain('isolation: isolate');
    expect(artworkImageBlock).toContain('object-fit: cover');
    expect(fallbackBlock).toContain('var(--visual-material-a)');
    expect(fallbackBlock).toContain('var(--discovery-deep-surface)');
    expect(coverPlayBlock).toContain('border-radius: 50%');
    expect(coverPlayBlock).toContain('background: var(--discovery-action)');
    expect(quickStartBlock).toContain('minmax(280px, 0.85fr)');
    expect(quickStartBlock).toContain('minmax(0, 1.15fr)');
    expect(quickStartBlock).toContain('align-items: stretch');
    expect(primaryPreviewRowsBlock).toContain('width: 100%');
    expect(primaryPreviewRowsBlock).toContain('max-width: none');
    expect(primaryPreviewRowsBlock).toContain('flex: none');
    expect(qqServicePlayBlock).toContain('background: var(--discovery-action)');
    expect(qqServicePlayBlock).toContain('opacity: 0');
    expect(qqServicePlayBlock).toContain('transition:');
    expect(qqNewSongGridBlock).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(qqNewSongOpenBlock).toContain('height: 76px');
    expect(qqNewSongOpenBlock).toContain('border: 0');
    expect(qqNewSongOpenBlock).toContain('transition:');
    expect(qqNewSongSurfaceBlock).toContain('background: var(--qq-song-hover-gradient)');
    expect(qqNewSongSurfaceBlock).toContain('transition: opacity 180ms ease');
    expect(qqNewSongArtworkBlock).toContain('width: 50px');
    expect(qqNewSongArtworkBlock).toContain('transition:');
    expect(qqNewSongPlayBlock).toContain('color: var(--discovery-action)');
    expect(qqNewSongPlayBlock).toContain('box-sizing: border-box');
    expect(qqNewSongPlayBlock).toContain('flex: 0 0 32px');
    expect(qqNewSongPlayBlock).toContain('transform: none');
    expect(qqNewSongPlayBlock).not.toContain('scale(');
    expect(qqNewSongPlayBlock).toContain('transition:');
    expect(neteaseFeatureGridBlock).toContain('display: grid');
    expect(neteaseFeatureGridBlock).toContain('clamp(240px, 34cqw, 340px)');
    expect(neteaseFeatureGridBlock).toContain('minmax(0, 1fr)');
    expect(neteaseFeatureGridBlock).toContain('align-items: stretch');
    expect(neteaseFeatureCardBlock).toContain('width: 100%');
    expect(neteaseFeatureCardBlock).toContain('min-height: 196px');
    expect(neteaseFeatureCardBlock).toContain('aspect-ratio: auto');
    expect(neteaseFeatureCardBlock).toContain('--netease-discovery-feature-radius: 8px');
    expect(neteaseFeatureCardBlock).toContain('overflow: visible');
    expect(neteaseFeatureCardBlock).toContain('background: transparent');
    expect(neteaseFeatureActionBlock).toContain('overflow: hidden');
    expect(neteaseFeatureActionBlock).toContain('border-radius: var(--netease-discovery-feature-radius)');
    expect(neteaseFeatureActionBlock).toContain('background: color-mix(');
    expect(neteasePrimaryPreviewBlock).toContain('box-sizing: content-box');
    expect(neteasePrimaryPreviewBlock).toContain('margin: -8px');
    expect(neteasePrimaryPreviewBlock).toContain('padding: 8px');
    expect(neteasePrimaryPreviewBlock).toContain('overflow: visible');
    expect(neteaseFeatureArtworkBlock).toContain('transition: filter 220ms ease');
    expect(neteaseFeaturePaletteBlock).toContain('var(--netease-feature-primary)');
    expect(neteaseFeaturePaletteBlock).toContain('var(--netease-feature-secondary)');
    expect(neteaseFeaturePaletteBlock).toContain('transition: opacity 220ms ease');
    expect(neteaseFeatureRevealBlock).toContain('transform: translate3d(0, calc(100% + 14px), 0)');
    expect(neteaseFeatureRevealBlock).toContain('transition:');
    expect(neteaseFeaturePreviewListBlock).toContain('opacity: 0');
    expect(neteaseFeaturePreviewListBlock).toContain('transform: translate3d(0, 8px, 0)');
    expect(neteaseFeaturePreviewListBlock).toContain('transition:');
    expect(neteaseFeatureHoverBlock).toContain('transform: translate3d(0, -4px, 0)');
    expect(neteaseFeatureHoverRevealBlock).toContain('transform: translate3d(0, 0, 0)');
    expect(neteaseSongGridBlock).toContain('display: flex');
    expect(neteaseSongGridBlock).toContain('flex-wrap: wrap');
    expect(neteaseSongGridBlock).toContain('justify-content: flex-start');
    expect(neteaseSongRowBlock).toContain('height: 72px');
    expect(neteaseSongRowBlock).toContain('flex: 0 0 calc((100% - 28px) / 3)');
    expect(neteaseSongOpenBlock).toContain('display: grid');
    expect(neteaseSongOpenBlock).toContain('height: 72px');
    expect(neteaseSongOpenBlock).toContain('grid-template-columns: 28px 48px minmax(0, 1fr) 32px 42px');
    expect(neteaseSongOpenBlock).toContain('border: 0');
    expect(neteaseSongOpenBlock).toContain('border-radius: 8px');
    expect(neteaseSongOpenBlock).toContain('transition:');
    expect(neteaseSongHoverBlock).toContain('transform: none');
    expect(neteaseSongHoverBlock).toContain('0 8px 20px');
    expect(neteaseSongHoverBlock).not.toContain('inset');
    expect(neteaseSongHoverLayerBlock).toContain('opacity: 0.9');
    expect(neteaseSongArtworkBlock).toContain('width: 48px');
    expect(neteaseSongArtworkBlock).toContain('height: 48px');
    expect(neteaseSongArtworkBlock).toContain('transition:');
    expect(neteaseSongPlayBlock).toContain('box-sizing: border-box');
    expect(neteaseSongPlayBlock).toContain('flex: 0 0 32px');
    expect(neteaseSongPlayBlock).toContain('transform: none');
    expect(neteaseSongPlayBlock).not.toContain('scale(');
    expect(neteaseSongTitleBlock).toContain('font-size: 14px');
    expect(neteaseSongTitleBlock).toContain('transition: color 180ms ease');
    expect(neteaseSongCurrentLayerBlock).toContain('opacity: 0.72');
    expect(neteaseSongCurrentTextBlock).toContain('color: var(--discovery-action)');
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 1049px\) \{[\s\S]*?\.discovery-home \.netease-discovery-song-row\s*\{[\s\S]*?flex-basis: calc\(\(100% - 14px\) \/ 2\);[\s\S]*?max-width: calc\(\(100% - 14px\) \/ 2\)/
    );
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 639px\) \{[\s\S]*?\.discovery-home \.netease-discovery-song-row\s*\{[\s\S]*?flex-basis: 100%;[\s\S]*?max-width: 100%/
    );
    expect(recommendationCss).toContain('--discovery-surface: var(--visual-surface)');
    expect(recommendationCss).toContain('--discovery-text: var(--visual-text)');
    expect(recommendationCss).toContain('--discovery-border: var(--visual-panel-border)');
    expect(recommendationCss).toContain("@container discovery-home (max-width: 1049px)");
    expect(recommendationCss).toContain("@container discovery-home (max-width: 799px)");
    expect(recommendationCss).toContain("@container discovery-home (max-width: 639px)");
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 1049px\) \{[\s\S]*?\.discovery-home \.netease-discovery-feature-grid\s*\{[\s\S]*?minmax\(260px, 0\.82fr\) minmax\(0, 1\.18fr\)/
    );
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 799px\) \{[\s\S]*?\.discovery-home \.netease-discovery-feature-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?max-width: 420px/
    );
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 1049px\) \{[\s\S]*?\.discovery-home \.qq-discovery-new-song-grid\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/
    );
    expect(recommendationCss).toMatch(
      /@container discovery-home \(max-width: 639px\) \{[\s\S]*?\.discovery-home \.qq-discovery-new-song-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(recommendationCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(recommendationCss).toContain(":root[data-reduce-effects='true'] .discovery-cover-play");
    expect(recommendationCss).toContain(
      ":root[data-reduce-effects='true'] .qq-discovery-new-song-open"
    );
    expect(recommendationCss).toContain(
      ":root[data-reduce-effects='true'] .qq-discovery-new-song-artwork"
    );
    expect(recommendationCss).toContain('transition: none');
    expect(recommendationCss).toContain('transform: none');
    expect(recommendationCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.netease-discovery-feature-card,[\s\S]*?\.netease-discovery-song-open,[\s\S]*?\{\s*transition: none;/
    );
    expect(recommendationCss).toMatch(
      /:root\[data-reduce-effects='true'\] \.netease-discovery-feature-artwork,[\s\S]*?:root\[data-reduce-effects='true'\] \.netease-discovery-song-play-indicator\s*\{[\s\S]*?transition: none;/
    );
    expect(recommendationCss).toContain(
      ":root[data-reduce-effects='true'] .netease-discovery-song-open:hover:not(:disabled) .netease-discovery-song-artwork"
    );
    expect(recommendationCss).toContain(
      ":root[data-reduce-effects='true'] .netease-discovery-song-open:focus-visible:not(:disabled) .netease-discovery-song-artwork"
    );
    expect(recommendationCss.match(/#31c27c/g)).toHaveLength(1);
    expect(recommendationCss.match(/#ec4141/g)).toHaveLength(1);
    expect(recommendationCss).not.toContain('var(--qq-accent)');
    expect(recommendationCss).not.toContain('.netease-discovery-entry-card');
    expect(recommendationCss).not.toContain('.netease-discovery-song-play {');
  });

  it('keeps current-song recommendations stable, animated, and reduced-effects aware', () => {
    const panelBlock = extractCssBlock('.desktop-shell .similar-songs-panel');
    const rowBlock = extractCssBlock('.similar-song-row');
    const actionBlock = extractCssBlock('.similar-song-actions button');
    const toggleBlock = extractCssBlock('.similar-songs-toggle-button');

    expect(panelBlock).toContain('top: var(--qq-topbar-height)');
    expect(panelBlock).toContain('bottom: var(--qq-player-height)');
    expect(panelBlock).toContain('width: min(380px, calc(100vw - 72px))');
    expect(rowBlock).toContain('height: 68px');
    expect(rowBlock).toContain('grid-template-columns: 44px minmax(0, 1fr) 38px 72px');
    expect(rowBlock).toContain('transition:');
    expect(actionBlock).toContain('width: 32px');
    expect(actionBlock).toContain('height: 32px');
    expect(actionBlock).toContain('transition:');
    expect(toggleBlock).toContain('flex: 0 0 34px');
    expect(toggleBlock).toContain('transition:');
    expect(css).toContain(".desktop-shell .similar-songs-panel[data-state='open']");
    expect(css).toContain('animation: similarSongsPanelIn 220ms var(--ease-out-soft)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: similarSongsPanelFadeIn 120ms linear both');
    expect(css).toContain(":root[data-reduce-effects='true'] .desktop-shell .similar-songs-panel");
    expect(css).toContain(":root[data-reduce-effects='true'] .similar-song-row:hover .similar-song-cover");
  });

  it('keeps live player blur stable while content is scrolling', () => {
    const playerBlocks = extractMergedCssBlock('.desktop-shell > .player-bar');
    const playerTransitionBlock = extractCssBlock('.desktop-shell > .player-bar');

    expect(playerTransitionBlock).toContain('background-color 180ms ease');
    expect(playerTransitionBlock).not.toContain('backdrop-filter 180ms ease');
    expect(playerBlocks).toContain('backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(playerBlocks).toContain('-webkit-backdrop-filter: var(--qq-persistent-chrome-filter)');
    expect(css).not.toContain(".desktop-shell[data-scrolling='true'] > .player-bar");
  });
});

function extractCssBlock(selector: string) {
  return extractCssBlocks(selector).at(-1) ?? '';
}

function extractMergedCssBlock(selector: string) {
  return extractCssBlocks(selector).join('\n');
}

function extractCssBlockContaining(selector: string, fragment: string) {
  return extractCssBlocks(selector).filter((block) => block.includes(fragment)).at(-1) ?? '';
}

function extractCssBlocks(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 'g')));

  return matches.map((match) => match.groups?.body ?? '');
}

function extractKeyframesBlock(name: string) {
  const matches = Array.from(css.matchAll(new RegExp(`@keyframes\\s+${name}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`, 'g')));
  return matches.at(-1)?.groups?.body ?? '';
}
