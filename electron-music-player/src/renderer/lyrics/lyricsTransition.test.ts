import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isLyricsDepthInteractive,
  createCoverFlightTarget,
  getLyricsTransitionDuration,
  toLyricsTransitionOrigin
} from './lyricsTransition';

describe('lyrics transition helpers', () => {
  it('keeps cover portal as the only transition contract', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/lyrics/lyricsTransition.ts'), 'utf8');

    expect(source).not.toContain('liquid-curtain');
    expect(source).not.toContain('musicplayer.lyrics-transition');
    expect(source).not.toContain('LyricsTransitionVariant');
  });

  it('normalizes a DOM rectangle for a shared-element transition', () => {
    expect(toLyricsTransitionOrigin({ left: 12.4, top: 620.7, width: 54.2, height: 54.8 })).toEqual({
      left: 12,
      top: 621,
      width: 54,
      height: 55
    });
  });

  it('uses reduced durations when motion is reduced', () => {
    expect(getLyricsTransitionDuration('enter', false)).toBe(2600);
    expect(getLyricsTransitionDuration('exit', false)).toBe(1200);
    expect(getLyricsTransitionDuration('enter', true)).toBe(160);
  });

  it('gives pointer depth to the settled lyrics phase only', () => {
    expect(isLyricsDepthInteractive('entering')).toBe(false);
    expect(isLyricsDepthInteractive('handoff')).toBe(false);
    expect(isLyricsDepthInteractive('unlocking')).toBe(false);
    expect(isLyricsDepthInteractive('interactive')).toBe(true);
    expect(isLyricsDepthInteractive('exiting')).toBe(false);
    expect(isLyricsDepthInteractive('returning')).toBe(false);
    expect(isLyricsDepthInteractive('restoring')).toBe(false);
  });

  it('centers the shared cover without scaling low-resolution artwork across the stage', () => {
    const flight = createCoverFlightTarget(
      { left: 20, top: 700, width: 50, height: 50 },
      { left: 120, top: 150, width: 400, height: 400 }
    );

    expect(flight).toEqual({
      coverScaleX: 8,
      coverScaleY: 8,
      coverX: 275,
      coverY: -375
    });
  });

  it('cancels and cleans up the active entry timeline when the lyric panel is closed early', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');

    expect(source).toMatch(/const transitionTimelineRef = useRef<gsap\.core\.Timeline \| null>\(null\)/);
    expect(source).toMatch(/const transitionDirectionRef = useRef<'enter' \| 'exit' \| null>\(null\)/);
    expect(source).toMatch(/const abortEntryTransitionRef = useRef<\(\(\) => void\) \| null>\(null\)/);
    expect(source).toMatch(
      /transitionDirectionRef\.current === 'enter'[\s\S]*?transitionTimelineRef\.current\.kill\(\)[\s\S]*?abortEntryTransitionRef\.current\?\.\(\)/s
    );
    expect(source).toMatch(
      /const completeAbortedEntryTransition = \(\) => \{[\s\S]*?cleanupTransitionLayers\(elements\)[\s\S]*?setLyricsOpen\(false\)/s
    );
  });

  it('settles interrupted or partially initialized transitions without changing their timelines', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');

    expect(source).toContain('const transitionSessionRef = useRef(0)');
    expect(source).toContain('const transitionWatchdogTimeoutRef = useRef(0)');
    expect(source).toContain('const transitionInitFrameRef = useRef(0)');
    expect(source).toMatch(/getLyricsTransitionDuration\(direction, reducedMotion\) \+ transitionWatchdogGraceMs/);
    expect(source).toMatch(/attempt < transitionInitRetryFrames[\s\S]*?requestAnimationFrame/s);
    expect(source).toMatch(/onInterrupt:[\s\S]*?recoverEntryTransition/s);
    expect(source).toMatch(/onInterrupt:\s*\(\) => \{[\s\S]*?recoverExitTransition\(\)/);
    expect(source).toMatch(/useLayoutEffect\(\(\) => \(\) => invalidateTransitionSession\(\), \[\]\)/);
  });

  it('hands the exit portal off from neutral geometry without a fixed intermediate pose', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const exitSource = source.slice(
      source.indexOf('function playCoverPortalExit'),
      source.indexOf('function createDepthStyle')
    );
    const handoffSource = exitSource.slice(
      exitSource.indexOf(".addLabel('handoff'"),
      exitSource.indexOf(".addLabel('returnFlight'")
    );

    expect(exitSource).toMatch(
      /gsap\.set\(elements\.flight, \{[\s\S]*?width: geometry\.targetWidth,[\s\S]*?height: geometry\.targetHeight,[\s\S]*?x: geometry\.targetPoint\.x,[\s\S]*?y: geometry\.targetPoint\.y,[\s\S]*?autoAlpha: 0[\s\S]*?\}\);/s
    );
    expect(exitSource).toMatch(
      /gsap\.set\(elements\.bob, \{[\s\S]*?x: 0,[\s\S]*?y: 0,[\s\S]*?z: 0,[\s\S]*?rotationX: 0,[\s\S]*?rotationY: 0[\s\S]*?\}\);/s
    );
    expect(exitSource).not.toContain("addLabel('undock'");
    expect(exitSource).not.toMatch(/z:\s*96/);
    expect(exitSource).not.toMatch(/rotationX:\s*-6/);
    expect(exitSource).not.toMatch(/rotationY:\s*7/);
    expect(exitSource).not.toContain('exitFlightDepth');
    expect(handoffSource).toContain(".set(elements.coverEnter, { autoAlpha: 0 }, 'handoff')");
    expect(handoffSource).toContain(".set(elements.flight, { autoAlpha: 1 }, 'handoff')");
    expect(handoffSource).not.toMatch(/\.to\(elements\.(?:coverEnter|flight)/);
    expect(exitSource).not.toContain('elements.edges');
  });

  it('keeps the cover portal as a complete shared-element transition instead of a card-only flip', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');

    expect(source).toContain('lyrics-transition-app-vignette');
    expect(source).toContain('lyrics-transition-flight');
    expect(source).toContain('lyrics-transition-bob');
    expect(source).toContain('lyrics-transition-glow');
    expect(source).toContain('lyrics-transition-ripple');
    expect(source).toContain('lyricsWaterRippleFilter');
    expect(source).toContain('feTurbulence');
    expect(source).toContain('feDisplacementMap');
    expect(source).toMatch(/addLabel\('lift'/);
    expect(source).toMatch(/addLabel\('defocus'/);
    expect(source).toMatch(/addLabel\('drawer'/);
    expect(source).toMatch(/addLabel\('flight'/);
    expect(source).toMatch(/addLabel\('dock'/);
    expect(source).toMatch(/addLabel\('handoff'/);
    expect(source).toMatch(/rotationY:\s*360/);
    expect(source).toMatch(/scaleY:\s*0\.82/);
    expect(source).toMatch(/attr:\s*\{\s*scale:\s*18\s*\}/);
    expect(source).toMatch(/filter:\s*'url\(#lyricsWaterRippleFilter\)'/);
  });

  it('runs the return flight through a short dock and hands off when the drawer exits', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const exitSource = source.slice(
      source.indexOf('function playCoverPortalExit'),
      source.indexOf('function createDepthStyle')
    );
    const handoffStart = Number(exitSource.match(/\.addLabel\('handoff', t\(([\d.]+)\)\)/)?.[1]);
    const returnFlightStart = Number(exitSource.match(/\.addLabel\('returnFlight', t\(([\d.]+)\)\)/)?.[1]);
    const drawerDownStart = Number(exitSource.match(/\.addLabel\('drawerDown', t\(([\d.]+)\)\)/)?.[1]);
    const dockStart = Number(exitSource.match(/\.addLabel\('dock', t\(([\d.]+)\)\)/)?.[1]);
    const playerHandoffStart = Number(exitSource.match(/\.addLabel\('playerHandoff', t\(([\d.]+)\)\)/)?.[1]);
    const returnFlightSource = exitSource.slice(
      exitSource.indexOf(".addLabel('returnFlight'"),
      exitSource.indexOf(".addLabel('drawerDown'")
    );
    const returnFlightDuration = Number(
      returnFlightSource.match(/\.to\(elements\.flight, \{[\s\S]*?duration: t\(([\d.]+)\)/s)?.[1]
    );
    const drawerDuration = Number(
      exitSource.match(/\.to\(elements\.panel, \{ yPercent: 100, duration: t\(([\d.]+)\)/)?.[1]
    );

    expect(exitSource).toMatch(/addLabel\('defocus'/);
    expect(exitSource).toMatch(/addLabel\('handoff'/);
    expect(exitSource).toMatch(/addLabel\('returnFlight'/);
    expect(exitSource).toMatch(/addLabel\('drawerDown'/);
    expect(exitSource).toMatch(/addLabel\('dock'/);
    expect(exitSource).toMatch(/addLabel\('playerHandoff'/);
    expect(exitSource).toMatch(/sourceCover/);
    expect(exitSource).not.toMatch(/\.to\(elements\.refraction/);
    expect(exitSource).not.toContain("addLabel('settleFloat'");
    expect(exitSource).not.toContain("filter: 'blur(5px)'");
    expect(exitSource).toMatch(/\.to\(elements\.flight,[\s\S]*?'returnFlight'\)/s);
    expect(exitSource).toMatch(/\.to\(elements\.panel, \{ yPercent: 100,[\s\S]*?'drawerDown'\)/s);
    expect(handoffStart).toBe(returnFlightStart);
    expect(drawerDownStart).toBeGreaterThan(returnFlightStart);
    expect(drawerDownStart).toBeLessThan(returnFlightStart + returnFlightDuration);
    expect(dockStart).toBeCloseTo(returnFlightStart + returnFlightDuration, 5);
    expect(playerHandoffStart).toBeCloseTo(drawerDownStart + drawerDuration, 5);
    expect(playerHandoffStart - dockStart).toBeLessThanOrEqual(0.3);
    expect(exitSource).toContain(
      ".set(elements.sourceCover ? [elements.sourceCover] : [], { autoAlpha: 1 }, 'playerHandoff')"
    );
    expect(exitSource).toContain(
      ".to(elements.appVignette, { autoAlpha: 0, '--app-blur': '0px', duration: t(0.28), ease: 'power2.inOut' }, 'dock')"
    );
    expect(exitSource).toContain(".call(callbacks.onRestore, [], at('playerHandoff', 0.22))");
  });

  it('blurs only the app beneath the lyrics drawer during entry and exit', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const entrySource = source.slice(
      source.indexOf('function playCoverPortalEntry'),
      source.indexOf('function playCoverPortalExit')
    );
    const exitSource = source.slice(
      source.indexOf('function playCoverPortalExit'),
      source.indexOf('function createDepthStyle')
    );

    expect(entrySource).toContain("'--app-blur': '24px'");
    expect(exitSource).toContain("'--app-blur': '24px'");
    expect(entrySource).not.toMatch(/elements\.(?:coverEnter|titleEnter|textEnter|linesEnter|toolbar|sideTools)[\s\S]{0,160}?filter:\s*'blur/);
    expect(exitSource).not.toMatch(/elements\.(?:coverEnter|titleEnter|textEnter|linesEnter|toolbar|sideTools)[\s\S]{0,160}?filter:\s*'blur/);
  });

  it('restores the home player as soon as the drawer and short dock complete', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const exitSource = source.slice(
      source.indexOf('function playCoverPortalExit'),
      source.indexOf('function createDepthStyle')
    );
    const drawerExit = exitSource.indexOf('.to(elements.panel, { yPercent: 100');
    const coverHandoff = exitSource.indexOf(".addLabel('playerHandoff'");
    const sourceCoverRestore = exitSource.indexOf(
      ".set(elements.sourceCover ? [elements.sourceCover] : [], { autoAlpha: 1 }, 'playerHandoff')"
    );
    const restoreApp = exitSource.indexOf('.call(callbacks.onRestore', sourceCoverRestore);

    expect(drawerExit).toBeGreaterThanOrEqual(0);
    expect(coverHandoff).toBeGreaterThan(drawerExit);
    expect(sourceCoverRestore).toBeGreaterThan(coverHandoff);
    expect(restoreApp).toBeGreaterThan(sourceCoverRestore);
    expect(exitSource).not.toContain("addLabel('settleFloat'");
    expect(exitSource).toContain(".call(callbacks.onRestore, [], at('playerHandoff', 0.22))");
  });

  it('rebuilds return geometry from a neutral artwork measurement when the portal exits', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const closeSource = source.slice(
      source.indexOf('const closeLyricsPanel'),
      source.indexOf('function handlePanelPointerMove')
    );
    const neutralMeasurementSource = source.slice(
      source.indexOf('function measureNeutralArtworkRect'),
      source.indexOf('function prepareTransitionLayers')
    );

    expect(source).toMatch(/const transitionGeometryRef = useRef<LyricsTransitionSessionGeometry \| null>\(null\)/);
    expect(source).toMatch(/transitionGeometryRef\.current = \{[\s\S]*?origin,[\s\S]*?coverFlightTarget/s);
    expect(closeSource).toMatch(/const origin = resolveCurrentTransitionOrigin\(transitionOrigin\)/);
    expect(closeSource).toMatch(/const frozenPointer = freezeDepthForTransition\(\)/);
    expect(closeSource).toMatch(/const target = measureNeutralArtworkRect\(stage, artwork, frozenPointer\)/);
    expect(closeSource).toMatch(/transitionGeometryRef\.current = \{ origin, coverFlightTarget, portalGeometry \}/);
    expect(closeSource).not.toMatch(/const sessionGeometry = transitionGeometryRef\.current/);
    expect(neutralMeasurementSource).toMatch(
      /applyDepthStyle\(stage, centerPointer\);[\s\S]*?return toLyricsTransitionOrigin\(artwork\.getBoundingClientRect\(\)\);[\s\S]*?finally \{[\s\S]*?applyDepthStyle\(stage, frozenPointer\);/s
    );
  });

  it('keeps the sampled 3D depth frozen while the exit portal starts', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/LyricsPanel.tsx'), 'utf8');
    const depthPhaseEffect = source.slice(
      source.indexOf('useEffect(() => {\n    if (!isLyricsDepthInteractive(transitionPhase))'),
      source.indexOf('const closeLyricsPanel')
    );
    const freezeDepthSource = source.slice(
      source.indexOf('function freezeDepthForTransition'),
      source.indexOf('function scheduleDepthFrame')
    );
    const exitSource = source.slice(
      source.indexOf('function playCoverPortalExit'),
      source.indexOf('function createDepthStyle')
    );

    expect(depthPhaseEffect).toMatch(/transitionPhase === 'exiting'/);
    expect(depthPhaseEffect).toMatch(/transitionPhase === 'returning'/);
    expect(depthPhaseEffect).toMatch(/transitionPhase === 'restoring'/);
    expect(depthPhaseEffect).toMatch(/return;[\s\S]*?lockDepthToCenter\(\)/);
    expect(freezeDepthSource).toMatch(/const pointer = \{ \.\.\.visualPointerRef\.current \}/);
    expect(freezeDepthSource).toMatch(/mode: 'locked',[\s\S]*?target: pointer,[\s\S]*?lastObservedPointer: pointer/s);
    expect(exitSource).toMatch(/\.\.\.createDepthStyle\(centerPointer\)/);
    expect(exitSource).toMatch(/applyDepthStyle\(elements\.stage, centerPointer\)/);
    expect(exitSource).not.toMatch(/frozenPointer\.(?:x|y)/);
  });
});
