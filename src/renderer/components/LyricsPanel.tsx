import { ChevronDown, Languages, Menu } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Fragment, type CSSProperties, type MouseEvent, type RefObject, type WheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findActiveLyricLine, getLyricCharStartMs, getLyricLineProgress, parseLrc } from '../lyrics/lyricsTimeline';
import { createTranslationMap } from '../lyrics/lyricsTranslation';
import {
  centerDepthPointer,
  createLyricsDepthState,
  reduceLyricsDepthState,
  type LyricsDepthEvent,
  type LyricsDepthPointer
} from '../lyrics/lyricsDepthController';
import { createLyricsRequestKey, useLyricsStore } from '../state/lyricsStore';
import { usePlayerStore } from '../state/playerStore';
import { useSearchStore } from '../state/searchStore';
import { useUiStore } from '../state/uiStore';
import { useCoverPalette } from '../hooks/useCoverPalette';
import {
  createFallbackLyricsTransitionOrigin,
  createCoverFlightTarget,
  getLyricsTransitionDuration,
  isLyricsDepthInteractive,
  toLyricsTransitionOrigin,
  type CoverFlightTarget,
  type LyricsTransitionOrigin,
  type LyricsTransitionPhase
} from '../lyrics/lyricsTransition';
import type { CoverPalette } from '../utils/coverPalette';
import { reportRendererDiagnostic, toErrorDetails } from '../utils/runtimeDiagnostics';
import {
  createVariableVirtualLayout,
  createVariableVirtualWindowRange,
  findVariableItemAtViewportCenter,
  getVariableItemOffset
} from '../utils/variableVirtualWindow';
import { PopoverMenu } from './PopoverMenu';
import { PlayIcon } from './icons';
import { WindowControls } from './WindowControls';
import { LyricsPlayerBar } from './PlayerBar';

const centerPointer = centerDepthPointer;
const isTestRuntime = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const chromeIdleDelayMs = 5000;
const centerReturnDurationMs = 760;
const lyricAutoScrollDurationMs = 720;
const depthPointerSettleDistance = 0.0015;
const depthPointerFollowAmount = 0.18;
const defaultCoverTone = 'linear-gradient(135deg, #d84848, #2f6f90)';
const lyricFontScaleStorageKey = 'musicplayer.lyrics-font-scale';
const lyricFontScaleMin = 0.86;
const lyricFontScaleMax = 1.24;
/** 汉堡菜单中的字号档位（连续滑块已废弃） */
const lyricFontScaleSteps: { label: string; value: number }[] = [
  { label: '小', value: 0.86 },
  { label: '标准', value: 1 },
  { label: '大', value: 1.12 },
  { label: '特大', value: 1.24 }
];
const fontScaleScrollGuardMs = 320;
const lyricAnchorViewportRatio = 0.44;
const lyricVirtualizationThreshold = 80;
const lyricVirtualEstimatedRowHeight = 62;
const lyricVirtualOverscanPx = 640;
const lyricVirtualScrollBucketPx = 96;
const lyricLongLineThreshold = 192;
const transitionInitRetryFrames = 2;
const transitionWatchdogGraceMs = 900;
const cursorPollFailureBackoffMs = 1000;

gsap.registerPlugin(useGSAP);

type DepthStyle = CSSProperties & Record<`--${string}`, string>;
type LyricsChromeState = 'visible' | 'hidden';
type LyricsScrollState = 'settled' | 'scrolling';
type LyricGlowTransition = 'instant' | 'flowing';

interface LyricsMediaClockContext {
  activeIndex: number;
  lines: ReturnType<typeof parseLrc>;
  durationMs: number;
}

interface LyricLineFillCache {
  line: HTMLElement | null;
  progress: number;
  /** 逐字模式下的 fill 容器（.lyric-line-text-fill[data-char-fill]） */
  container: HTMLElement | null;
  /** 逐字模式所属行索引，行切换时失效 */
  lineIndex: number;
  /** 已填满的字符数，-1 表示未初始化（首次同步时全量重建） */
  filledCount: number;
}

interface LyricsPanelProps {
  transitionOrigin?: LyricsTransitionOrigin | null;
  transitionPalette?: CoverPalette | null;
  reduceEffects?: boolean;
  mediaRef?: RefObject<HTMLAudioElement | null>;
}

interface LyricsVirtualViewport {
  scrollTop: number;
  viewportSize: number;
}

export function LyricsPanel({
  transitionOrigin = null,
  transitionPalette = null,
  reduceEffects = false,
  mediaRef
}: LyricsPanelProps) {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentPlaybackUrl = usePlayerStore((state) => state.currentPlaybackUrl);
  const storeMediaElement = usePlayerStore((state) => state.mediaElement);
  const hostMedia = storeMediaElement ?? mediaRef?.current ?? null;
  const playbackDurationMs = usePlayerStore((state) => state.playbackDurationMs);
  const playbackSeekRevision = usePlayerStore((state) => state.playbackSeekRevision);
  const setLyricsOpen = usePlayerStore((state) => state.setLyricsOpen);
  const seekPlayback = usePlayerStore((state) => state.seekPlayback);
  const search = useSearchStore((state) => state.search);
  const navigateToView = useUiStore((state) => state.navigateToView);
  const lrc = useLyricsStore((state) => state.lrc);
  const tlyric = useLyricsStore((state) => state.tlyric);
  const lyricsSongKey = useLyricsStore((state) => state.songKey);
  const isLyricsLoading = useLyricsStore((state) => state.isLoading);
  const lyricsErrorMessage = useLyricsStore((state) => state.errorMessage);
  const loadLyrics = useLyricsStore((state) => state.loadLyrics);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const artworkRef = useRef<HTMLDivElement | null>(null);
  const transitionAppVignetteRef = useRef<HTMLDivElement | null>(null);
  const transitionFlightRef = useRef<HTMLDivElement | null>(null);
  const transitionBobRef = useRef<HTMLDivElement | null>(null);
  const transitionGlowRef = useRef<HTMLDivElement | null>(null);
  const transitionShadowRef = useRef<HTMLDivElement | null>(null);
  const transitionRippleRef = useRef<HTMLDivElement | null>(null);
  const transitionDisplacementRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const transitionHoverTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const transitionGlowTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const transitionBusyRef = useRef(false);
  const transitionTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const transitionDirectionRef = useRef<'enter' | 'exit' | null>(null);
  const abortEntryTransitionRef = useRef<(() => void) | null>(null);
  const transitionSessionRef = useRef(0);
  const transitionWatchdogTimeoutRef = useRef(0);
  const transitionInitFrameRef = useRef(0);
  const transitionGeometryRef = useRef<LyricsTransitionSessionGeometry | null>(null);
  const sideToolsRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const lyricsLinesRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const playbackPositionRef = useRef(usePlayerStore.getState().playbackPositionMs);
  const depthFrameRef = useRef(0);
  const lyricMediaClockFrameRef = useRef(0);
  const lyricMediaClockActiveRef = useRef(false);
  const lyricLineFillCacheRef = useRef<LyricLineFillCache>({
    line: null,
    progress: -1,
    container: null,
    lineIndex: -1,
    filledCount: -1
  });
  const chromeIdleTimeoutRef = useRef(0);
  const idleDepthStartTimeoutRef = useRef(0);
  const lyricsAutoScrollFrameRef = useRef(0);
  const lyricsVirtualScrollFrameRef = useRef(0);
  const lyricsScrollIdleTimeoutRef = useRef(0);
  const lastProgrammaticLyricScrollAtRef = useRef(0);
  const lyricLineSizesRef = useRef<Array<number | undefined>>([]);
  const lyricLineSizeKeyRef = useRef('');
  const isAutoScrollingLyricsRef = useRef(false);
  const isAdjustingLyricFontRef = useRef(false);
  const fontScaleScrollGuardTimeoutRef = useRef(0);
  const windowRestorePromiseRef = useRef<Promise<boolean> | null>(null);
  const lyricsMountedRef = useRef(false);
  const visualPointerRef = useRef(centerPointer);
  const reduceEffectsRef = useRef(reduceEffects);
  const depthStateRef = useRef(createLyricsDepthState(reduceEffects || !isTestRuntime));
  const centerReturnStartedAtRef = useRef(0);
  const centerReturnStartPointerRef = useRef<LyricsDepthPointer>(centerPointer);
  const idleDepthMotionStartedAtRef = useRef(0);
  const previousActiveIndexRef = useRef(-1);
  const lyricMotionOriginIndexRef = useRef(-1);
  const previousPlaybackSeekRevisionRef = useRef(playbackSeekRevision);
  const previousGlowSongIdRef = useRef(currentSong?.id ?? null);
  const lyricGlowTransitionRef = useRef<LyricGlowTransition>('flowing');
  const initialTransitionPhase: LyricsTransitionPhase = isTestRuntime ? 'interactive' : 'entering';
  const transitionPhaseRef = useRef<LyricsTransitionPhase>(initialTransitionPhase);
  const [transitionPhase, setTransitionPhaseState] = useState<LyricsTransitionPhase>(initialTransitionPhase);
  const [depthMode, setDepthMode] = useState(depthStateRef.current.mode);
  const [chromeState, setChromeState] = useState<LyricsChromeState>('visible');
  const [lyricsScrollState, setLyricsScrollState] = useState<LyricsScrollState>('settled');
  const [showTranslation, setShowTranslation] = useState(false);
  const [fontScale, setFontScale] = useState(readStoredLyricFontScale);
  const [isLyricsMenuOpen, setIsLyricsMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLyricMediaClockActive, setLyricMediaClockActiveState] = useState(false);
  const [lyricGlowTransition, setLyricGlowTransitionState] = useState<LyricGlowTransition>('flowing');
  const [lyricLineSizeRevision, setLyricLineSizeRevision] = useState(0);
  const [lyricsVirtualViewport, setLyricsVirtualViewport] = useState<LyricsVirtualViewport>({
    scrollTop: 0,
    viewportSize: 540
  });
  useEffect(() => {
    const shouldResetGlow =
      previousPlaybackSeekRevisionRef.current !== playbackSeekRevision ||
      previousGlowSongIdRef.current !== (currentSong?.id ?? null);
    previousPlaybackSeekRevisionRef.current = playbackSeekRevision;
    previousGlowSongIdRef.current = currentSong?.id ?? null;
    if (shouldResetGlow) {
      setLyricGlowTransition('instant');
    }
  }, [currentSong?.id, playbackSeekRevision]);
  const stageStyle = useMemo(() => createDepthStyle(centerPointer), []);
  const currentLyricsKey = currentSong ? createLyricsRequestKey(currentSong) : null;
  const ownsCurrentLyrics = currentLyricsKey !== null && lyricsSongKey === currentLyricsKey;
  const displayedLrc = ownsCurrentLyrics ? lrc : null;
  const displayedTlyric = ownsCurrentLyrics ? tlyric : null;
  const displayedLyricsLoading = Boolean(currentSong && (!ownsCurrentLyrics || isLyricsLoading));
  const displayedLyricsErrorMessage = ownsCurrentLyrics ? lyricsErrorMessage : null;
  const effectiveLrc = useMemo(
    () => (displayedLrc && !isNoLyricsPlaceholder(displayedLrc) ? displayedLrc : null),
    [displayedLrc]
  );
  const lines = useMemo(() => parseLrc(effectiveLrc ?? ''), [effectiveLrc]);
  const translatedLines = useMemo(() => parseLrc(displayedTlyric ?? ''), [displayedTlyric]);
  const plainTranslatedLines = useMemo(
    () => (displayedTlyric && translatedLines.length === 0 ? createPlainLyricLines(displayedTlyric) : []),
    [displayedTlyric, translatedLines.length]
  );
  const translationsByStartMs = useMemo(
    () => createTranslationMap(lines, translatedLines, plainTranslatedLines),
    [lines, translatedLines, plainTranslatedLines]
  );
  const hasTranslations = translationsByStartMs.size > 0;
  const canToggleTranslation = Boolean(currentSong && effectiveLrc);
  const lyricsMenuItems = useMemo(() => [
    {
      key: 'translation',
      icon: <Languages size={14} strokeWidth={2} />,
      label: showTranslation ? '隐藏译文' : '显示译文',
      checked: showTranslation,
      disabled: !canToggleTranslation || (showTranslation && !hasTranslations),
      onSelect: () => setShowTranslation((value) => !value)
    },
    {
      key: 'font-scale',
      label: '歌词字号',
      children: lyricFontScaleSteps.map((step) => ({
        key: `font-${step.value}`,
        label: step.label,
        checked: Math.abs(fontScale - step.value) < 0.045,
        onSelect: () => handleFontScaleChange(step.value)
      }))
    }
  ], [canToggleTranslation, fontScale, hasTranslations, showTranslation]);
  const plainLyricLines = useMemo(() => (effectiveLrc && lines.length === 0 ? createPlainLyricLines(effectiveLrc) : []), [effectiveLrc, lines.length]);
  const renderedLyricCount = lines.length || plainLyricLines.length;
  const lyricsVirtualized = renderedLyricCount > lyricVirtualizationThreshold;
  const lyricLineSizeKey = `${currentLyricsKey ?? 'none'}:${effectiveLrc?.length ?? 0}:${displayedTlyric?.length ?? 0}:${fontScale}:${showTranslation}`;
  if (lyricLineSizeKeyRef.current !== lyricLineSizeKey) {
    lyricLineSizeKeyRef.current = lyricLineSizeKey;
    lyricLineSizesRef.current = [];
  }
  const lyricVirtualLayout = useMemo(
    () => createVariableVirtualLayout({
      itemSizes: Array.from(
        { length: renderedLyricCount },
        (_, index) => lyricLineSizesRef.current[index]
      ),
      estimate: lyricVirtualEstimatedRowHeight
    }),
    [lyricLineSizeRevision, renderedLyricCount, lyricLineSizeKey]
  );
  const lyricVirtualRange = useMemo(
    () => createVariableVirtualWindowRange(lyricVirtualLayout, {
      scrollTop: lyricsVirtualViewport.scrollTop,
      viewportSize: lyricsVirtualViewport.viewportSize,
      overscanPx: lyricVirtualOverscanPx
    }),
    [lyricVirtualLayout, lyricsVirtualViewport]
  );
  const lyricVirtualIndexes = useMemo(() => {
    if (!lyricsVirtualized) {
      return [];
    }

    const indexes = new Set<number>();
    for (let index = lyricVirtualRange.startIndex; index < lyricVirtualRange.endIndex; index += 1) {
      indexes.add(index);
    }
    if (activeIndex >= 0 && activeIndex < renderedLyricCount) {
      indexes.add(activeIndex);
    }
    return [...indexes].sort((left, right) => left - right);
  }, [activeIndex, lyricVirtualRange, lyricsVirtualized, renderedLyricCount]);
  const lyricMotionOriginIndex = lyricMotionOriginIndexRef.current;
  const lyricDurationMs = playbackDurationMs || currentSong?.durationMs || 0;
  const activeLineProgress = getLyricLineProgress(
    lines,
    activeIndex,
    playbackPositionRef.current,
    lyricDurationMs
  );
  const lyricStatusMessage = !currentSong
    ? '播放歌曲后显示歌词'
    : !effectiveLrc
      ? (displayedLyricsLoading ? '歌词加载中' : displayedLyricsErrorMessage ?? '当前歌曲暂无歌词')
      : null;
  const coverTone = currentSong?.coverTone ?? defaultCoverTone;
  const sampledCoverPalette = useCoverPalette(coverTone, transitionPalette ? undefined : currentSong?.coverUrl);
  const coverPalette = transitionPalette ?? sampledCoverPalette;
  const coverImage = createCoverImage(currentSong?.coverUrl);
  const hasCoverImage = Boolean(currentSong?.coverUrl);
  const songTitle = currentSong?.title ?? '未播放歌曲';
  const primaryArtist = formatPrimaryArtist(currentSong?.artist ?? '');
  const transitionLayerStyle = {
    '--lyrics-transition-primary': coverPalette.primary,
    '--lyrics-transition-secondary': coverPalette.secondary,
    '--song-cover-image': coverImage,
    '--cover-tone': coverPalette.tone
  } as DepthStyle;
  const lyricMediaClockContextRef = useRef<LyricsMediaClockContext>({
    activeIndex,
    lines,
    durationMs: lyricDurationMs
  });

  function setTransitionPhase(nextPhase: LyricsTransitionPhase) {
    transitionPhaseRef.current = nextPhase;
    setTransitionPhaseState(nextPhase);
  }

  function clearTransitionWatchdog() {
    if (!transitionWatchdogTimeoutRef.current) {
      return;
    }

    window.clearTimeout(transitionWatchdogTimeoutRef.current);
    transitionWatchdogTimeoutRef.current = 0;
  }

  function clearTransitionInitFrame() {
    if (!transitionInitFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(transitionInitFrameRef.current);
    transitionInitFrameRef.current = 0;
  }

  function beginTransitionSession() {
    clearTransitionWatchdog();
    clearTransitionInitFrame();
    transitionSessionRef.current += 1;
    return transitionSessionRef.current;
  }

  function invalidateTransitionSession() {
    clearTransitionWatchdog();
    clearTransitionInitFrame();
    transitionSessionRef.current += 1;
  }

  function isCurrentTransitionSession(sessionId: number) {
    return transitionSessionRef.current === sessionId;
  }

  function startTransitionWatchdog(
    sessionId: number,
    direction: 'enter' | 'exit',
    reducedMotion: boolean,
    onTimeout: () => void
  ) {
    clearTransitionWatchdog();
    transitionWatchdogTimeoutRef.current = window.setTimeout(() => {
      transitionWatchdogTimeoutRef.current = 0;
      if (isCurrentTransitionSession(sessionId)) {
        onTimeout();
      }
    }, getLyricsTransitionDuration(direction, reducedMotion) + transitionWatchdogGraceMs);
  }

  function resolveLyricsTransitionElements(panel: HTMLDivElement) {
    const backdrop = (backdropRef.current ?? panel.querySelector<HTMLElement>('.lyrics-dynamic-bg')) as HTMLDivElement | null;
    const toolbar = panel.querySelector<HTMLElement>('.lyrics-header');
    const sideTools = sideToolsRef.current;
    const stage = stageRef.current;
    const artwork = artworkRef.current;
    const appVignette = transitionAppVignetteRef.current;
    const flight = transitionFlightRef.current;
    const bob = transitionBobRef.current;
    const glow = transitionGlowRef.current;
    const shadow = transitionShadowRef.current;
    const ripple = transitionRippleRef.current;
    const displacement = transitionDisplacementRef.current;
    const overlay = panel.closest<HTMLElement>('.lyrics-overlay');
    const coverEnter = panel.querySelector<HTMLElement>('.lyrics-artwork-container');
    const titleEnter = panel.querySelector<HTMLElement>('.lyrics-artwork-meta');
    const textEnter = panel.querySelector<HTMLElement>('.lyrics-scroll-zone');
    const linesEnter = panel.querySelector<HTMLElement>('.lyrics-scroll-container');
    const sourceCover = document.querySelector<HTMLElement>('.song-cover-wrapper');
    const edges = flight ? Array.from(flight.querySelectorAll<HTMLElement>('.lyrics-transition-edge')) : [];
    const refractionTargets = [
      panel.querySelector<HTMLElement>('.lyrics-header'),
      panel.querySelector<HTMLElement>('.lyrics-header-actions'),
      titleEnter,
      textEnter
    ].filter((element): element is HTMLElement => element !== null);

    if (
      !backdrop
      || !toolbar
      || !sideTools
      || !stage
      || !artwork
      || !appVignette
      || !flight
      || !bob
      || !glow
      || !shadow
      || !ripple
      || !displacement
      || !overlay
      || edges.length !== 4
      || !coverEnter
      || !titleEnter
      || !textEnter
      || !linesEnter
    ) {
      return null;
    }

    const elements: LyricsTransitionElements = {
      backdrop,
      panel,
      toolbar,
      sideTools,
      stage,
      coverEnter,
      titleEnter,
      textEnter,
      linesEnter,
      appVignette,
      flight,
      bob,
      glow,
      shadow,
      edges,
      ripple,
      displacement,
      sourceCover,
      refractionTargets
    };
    return { artwork, elements };
  }

  function setLyricGlowTransition(nextTransition: LyricGlowTransition) {
    if (lyricGlowTransitionRef.current === nextTransition) {
      return;
    }

    lyricGlowTransitionRef.current = nextTransition;
    setLyricGlowTransitionState(nextTransition);
  }

  function commitActiveLyricIndex(nextIndex: number) {
    const previousIndex = previousActiveIndexRef.current;
    if (nextIndex === previousIndex) {
      return false;
    }

    lyricMotionOriginIndexRef.current = previousIndex >= 0 ? previousIndex : nextIndex;
    previousActiveIndexRef.current = nextIndex;
    const { lines: currentLines, durationMs } = lyricMediaClockContextRef.current;
    const lineProgress = getLyricLineProgress(
      currentLines,
      nextIndex,
      playbackPositionRef.current,
      durationMs
    );
    setActiveIndex(nextIndex);
    return true;
  }

  function syncActiveLyricFill(index: number, lineProgress: number, positionMs?: number) {
    const line = activeLineRef.current;
    if (!line) {
      resetLyricLineFillCache(lyricLineFillCacheRef.current);
      return;
    }

    const container = line.querySelector<HTMLElement>('[data-char-fill]');
    if (container) {
      const { lines: currentLines, durationMs } = lyricMediaClockContextRef.current;
      syncCharFill(
        container,
        index,
        positionMs ?? playbackPositionRef.current,
        currentLines,
        durationMs,
        lyricLineFillCacheRef.current
      );
      return;
    }

    syncLyricLineProgress(line, lineProgress, lyricLineFillCacheRef.current);
  }

  useLayoutEffect(() => () => invalidateTransitionSession(), []);

  const { contextSafe } = useGSAP(
    (_context, contextSafeForEntry) => {
      if (isTestRuntime) {
        return;
      }

      const sessionId = beginTransitionSession();
      let settled = false;
      let activeElements: LyricsTransitionElements | null = null;

      const claimSettlement = () => {
        if (settled || !isCurrentTransitionSession(sessionId)) {
          return false;
        }

        settled = true;
        clearTransitionWatchdog();
        clearTransitionInitFrame();
        return true;
      };
      const clearEntryTransitionState = () => {
        transitionBusyRef.current = false;
        transitionTimelineRef.current = null;
        transitionDirectionRef.current = null;
        abortEntryTransitionRef.current = null;
      };
      const completeAbortedEntryTransition = () => {
        if (!claimSettlement()) {
          return;
        }

        const elements = activeElements;
        clearEntryTransitionState();
        stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
        if (elements) {
          cleanupTransitionLayers(elements);
        }
        setTransitionPhase('restoring');
        void finishLyricsClose().then((closed) => {
          if (closed || !isCurrentTransitionSession(sessionId)) {
            return;
          }

          if (elements && panelRef.current === elements.panel) {
            restoreLyricsAfterFailedClose(elements);
          } else if (panelRef.current) {
            setTransitionPhase('interactive');
          }
        });
      };
      const recoverEntryTransition = () => {
        if (!claimSettlement()) {
          return;
        }

        const elements = activeElements;
        const timeline = transitionTimelineRef.current;
        clearEntryTransitionState();
        stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
        timeline?.kill();
        if (elements) {
          restoreInteractiveLyricsLayers(elements);
        }
        setTransitionPhase('interactive');
      };

      transitionBusyRef.current = true;
      transitionDirectionRef.current = 'enter';
      abortEntryTransitionRef.current = completeAbortedEntryTransition;

      let startEntryTransition: (attempt: number) => void;
      const runEntryTransition = (attempt: number) => {
        if (settled || !isCurrentTransitionSession(sessionId)) {
          return;
        }

        const panel = panelRef.current;
        const resolved = panel ? resolveLyricsTransitionElements(panel) : null;
        if (!resolved) {
          if (attempt < transitionInitRetryFrames) {
            transitionInitFrameRef.current = window.requestAnimationFrame(() => {
              transitionInitFrameRef.current = 0;
              startEntryTransition(attempt + 1);
            });
          } else {
            reportLyricsTransitionFailure(
              'lyrics-transition-entry-elements-missing',
              'Required entry transition elements were not mounted'
            );
            recoverEntryTransition();
          }
          return;
        }

        const { artwork, elements } = resolved;
        activeElements = elements;
        const reducedMotion = reduceEffects;

        try {
          const origin = resolveTransitionOrigin(transitionOrigin);
          const target = toLyricsTransitionOrigin(artwork.getBoundingClientRect());
          const coverFlightTarget = createCoverFlightTarget(origin, target);
          const portalGeometry = createLyricsPortalGeometry(origin, coverFlightTarget);
          transitionGeometryRef.current = {
            origin,
            coverFlightTarget,
            portalGeometry
          };
          prepareTransitionLayers(elements, origin);

          const completeEntryTransition = () => {
            if (!claimSettlement()) {
              return;
            }

            clearEntryTransitionState();
            setTransitionPhase('interactive');
            gsap.set([elements.panel, elements.stage], {
              clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,opacity,visibility'
            });
            gsap.set([elements.coverEnter, elements.titleEnter, elements.textEnter, elements.linesEnter], {
              clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,opacity,visibility,--lyrics-target-aura-opacity'
            });
            gsap.set([elements.toolbar, elements.sideTools], {
              clearProps: 'transform,translate,rotate,scale,x,y,z,opacity,visibility,filter'
            });
            gsap.set(
              [
                elements.appVignette,
                elements.flight,
                elements.glow,
                elements.shadow,
                elements.ripple,
                ...elements.edges
              ],
              {
                autoAlpha: 0,
                clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,skewX,filter,clipPath'
              }
            );
            gsap.set(elements.refractionTargets, { filter: 'none' });
            gsap.set(elements.displacement, { attr: { scale: 0 } });
            if (elements.sourceCover) {
              gsap.set(elements.sourceCover, { clearProps: 'opacity,visibility' });
            }
          };

          const timeline = gsap.timeline({
            defaults: {
              ease: 'power3.out',
              overwrite: 'auto'
            },
            onComplete: completeEntryTransition,
            onReverseComplete: completeAbortedEntryTransition,
            onInterrupt: () => {
              if (settled || !isCurrentTransitionSession(sessionId)) {
                return;
              }
              if (transitionDirectionRef.current === 'exit') {
                completeAbortedEntryTransition();
              } else {
                reportLyricsTransitionFailure(
                  'lyrics-transition-entry-interrupted',
                  'The entry timeline was interrupted unexpectedly'
                );
                recoverEntryTransition();
              }
            }
          });

          transitionTimelineRef.current = timeline;

          const updateEntryPhase = (phase: 'handoff' | 'unlocking') => {
            if (
              !settled
              && isCurrentTransitionSession(sessionId)
              && transitionDirectionRef.current === 'enter'
            ) {
              setTransitionPhase(phase);
            }
          };
          if (reducedMotion) {
            playReducedMotionEntry(timeline, elements, {
              onHandoff: () => updateEntryPhase('handoff'),
              onUnlock: () => updateEntryPhase('unlocking')
            });
          } else {
            playSimpleSlideEntry(timeline, elements, {
              onHandoff: () => updateEntryPhase('handoff'),
              onUnlock: () => updateEntryPhase('unlocking')
            });
          }
          startTransitionWatchdog(sessionId, 'enter', reducedMotion, () => {
            if (transitionDirectionRef.current === 'exit') {
              completeAbortedEntryTransition();
            } else {
              reportLyricsTransitionFailure(
                'lyrics-transition-entry-timeout',
                'The entry timeline exceeded its expected duration'
              );
              recoverEntryTransition();
            }
          });
        } catch (error) {
          reportLyricsTransitionFailure('lyrics-transition-entry-error', error);
          recoverEntryTransition();
        }
      };
      startEntryTransition = contextSafeForEntry
        ? contextSafeForEntry(runEntryTransition)
        : runEntryTransition;
      startEntryTransition(0);
    },
    { scope: panelRef }
  );

  useEffect(() => {
    visualPointerRef.current = centerPointer;
    applyDepthStyle(stageRef.current, centerPointer);
  }, []);

  useEffect(() => {
    reduceEffectsRef.current = reduceEffects;
    if (!reduceEffects) {
      if (isLyricsDepthInteractive(transitionPhaseRef.current)) {
        dispatchDepthEvent({ type: 'unlock' });
      }
      return;
    }

    lockDepthToCenter();
  }, [reduceEffects]);

  useLayoutEffect(() => {
    const playerState = usePlayerStore.getState();
    const positionMs = playerState.playbackPositionMs;
    const durationMs = playerState.playbackDurationMs || currentSong?.durationMs || 0;
    const nextIndex = findActiveLyricLine(lines, positionMs);
    playbackPositionRef.current = positionMs;
    lyricMediaClockContextRef.current = {
      activeIndex: nextIndex,
      lines,
      durationMs
    };

    if (commitActiveLyricIndex(nextIndex)) {
      return;
    }

    resetLyricLineFillCache(lyricLineFillCacheRef.current);
    const media = hostMedia;
    if (
      media &&
      isCurrentLyricsMedia(media, currentPlaybackUrl) &&
      !media.paused &&
      !media.ended &&
      !media.seeking
    ) {
      syncLyricLineFillFromMedia(media);
      return;
    }

    const lineProgress = getLyricLineProgress(lines, nextIndex, positionMs, durationMs);
    syncActiveLyricFill(nextIndex, lineProgress, positionMs);
  }, [currentPlaybackUrl, currentSong?.id, hostMedia, lines, lyricDurationMs, mediaRef, playbackSeekRevision]);

  // The layout pass above may commit the active line state. Synchronize the
  // newly rendered line after React has committed it, without making the
  // layout effect depend on the state it updates.
  useEffect(() => {
    const { lines: currentLines, durationMs } = lyricMediaClockContextRef.current;
    const lineProgress = getLyricLineProgress(
      currentLines,
      activeIndex,
      playbackPositionRef.current,
      durationMs
    );
    syncActiveLyricFill(activeIndex, lineProgress, playbackPositionRef.current);
  }, [activeIndex]);

  useEffect(() => usePlayerStore.subscribe((state, previousState) => {
    if (
      state.playbackPositionMs === previousState.playbackPositionMs &&
      state.playbackDurationMs === previousState.playbackDurationMs &&
      state.playbackSeekRevision === previousState.playbackSeekRevision
    ) {
      return;
    }

    const positionMs = state.playbackPositionMs;
    const durationMs = state.playbackDurationMs || state.currentSong?.durationMs || 0;
    const nextIndex = findActiveLyricLine(lines, positionMs);
    playbackPositionRef.current = positionMs;
    lyricMediaClockContextRef.current = {
      activeIndex: nextIndex,
      lines,
      durationMs
    };

    if (commitActiveLyricIndex(nextIndex)) {
      return;
    }

    if (state.playbackSeekRevision !== previousState.playbackSeekRevision) {
      resetLyricLineFillCache(lyricLineFillCacheRef.current);
    } else if (
      state.currentSong?.id === previousState.currentSong?.id &&
      lyricGlowTransitionRef.current === 'instant'
    ) {
      setLyricGlowTransition('flowing');
    }

    if (lyricMediaClockActiveRef.current) {
      return;
    }

    const lineProgress = getLyricLineProgress(lines, nextIndex, positionMs, durationMs);
    syncActiveLyricFill(nextIndex, lineProgress, positionMs);
  }), [lines]);

  useEffect(() => {
    const media = hostMedia;
    if (!media) {
      cancelLyricMediaClockFrame();
      setLyricMediaClockActive(false);
      return undefined;
    }
    const expectedMediaUrl = normalizeMediaUrl(currentPlaybackUrl ?? '');
    const isCurrentMedia = () => isCurrentLyricsMediaUrl(media, expectedMediaUrl);

    const syncFromMedia = () => {
      if (!isCurrentMedia()) {
        return;
      }

      syncLyricLineFillFromMedia(media);
    };

    const stop = (syncPosition: boolean) => {
      cancelLyricMediaClockFrame();
      if (syncPosition) {
        syncFromMedia();
      }
      setLyricMediaClockActive(false);
    };

    const tick = () => {
      lyricMediaClockFrameRef.current = 0;
      if (!isCurrentMedia() || media.paused || media.ended || media.seeking) {
        stop(false);
        return;
      }

      syncFromMedia();
      lyricMediaClockFrameRef.current = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (!isCurrentMedia() || media.paused || media.ended || media.seeking) {
        stop(false);
        return;
      }

      setLyricMediaClockActive(true);
      syncFromMedia();
      if (!lyricMediaClockFrameRef.current) {
        lyricMediaClockFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    const handlePause = () => stop(true);
    const handleInterruptedPlayback = () => stop(false);
    const handleSeeked = () => {
      syncFromMedia();
      start();
    };

    media.addEventListener('loadedmetadata', start);
    media.addEventListener('playing', start);
    media.addEventListener('pause', handlePause);
    media.addEventListener('waiting', handleInterruptedPlayback);
    media.addEventListener('stalled', handleInterruptedPlayback);
    media.addEventListener('seeking', handleInterruptedPlayback);
    media.addEventListener('seeked', handleSeeked);
    media.addEventListener('ended', handlePause);
    media.addEventListener('emptied', handleInterruptedPlayback);
    start();

    return () => {
      cancelLyricMediaClockFrame();
      setLyricMediaClockActive(false);
      media.removeEventListener('loadedmetadata', start);
      media.removeEventListener('playing', start);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('waiting', handleInterruptedPlayback);
      media.removeEventListener('stalled', handleInterruptedPlayback);
      media.removeEventListener('seeking', handleInterruptedPlayback);
      media.removeEventListener('seeked', handleSeeked);
      media.removeEventListener('ended', handlePause);
      media.removeEventListener('emptied', handleInterruptedPlayback);
    };
  }, [currentPlaybackUrl, currentSong?.id, hostMedia, mediaRef]);

  useEffect(() => {
    lyricsMountedRef.current = true;

    return () => {
      invalidateTransitionSession();
      lyricsMountedRef.current = false;
      if (depthFrameRef.current) {
        window.cancelAnimationFrame(depthFrameRef.current);
        depthFrameRef.current = 0;
      }

      cancelLyricMediaClockFrame();
      clearChromeIdleTimer();
      clearIdleDepthStartTimer();
      clearLyricsAutoScrollFrame();
      clearLyricsVirtualScrollFrame();
      clearLyricsScrollIdleTimer();
      clearFontScaleScrollGuardTimer();
      stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
      transitionTimelineRef.current?.kill();
      transitionTimelineRef.current = null;
      transitionDirectionRef.current = null;
      abortEntryTransitionRef.current = null;
      transitionBusyRef.current = false;
      restoreTransitionSourceCover(document.querySelector<HTMLElement>('.song-cover-wrapper'));
      window.queueMicrotask(() => {
        if (!lyricsMountedRef.current) {
          void restoreWindowAfterLyrics();
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!isLyricsDepthInteractive(transitionPhase)) {
      clearChromeIdleTimer();
      return;
    }

    scheduleChromeIdleHide();
    return () => clearChromeIdleTimer();
  }, [transitionPhase]);

  useEffect(() => {
    const handleWindowDepthPointerMove = (event: globalThis.MouseEvent) => {
      if (!isLyricsDepthInteractive(transitionPhaseRef.current)) {
        return;
      }

      if (reduceEffectsRef.current) {
        showLyricsChrome();
        return;
      }

      if (isLyricsChromePointerTarget(event.target)) {
        showLyricsChrome();
        return;
      }

      const pointer = createPointerFromWindowEvent(event);
      submitDepthPointer(pointer);
      showLyricsChrome();
    };

    const handleWindowPointerOut = (event: globalThis.MouseEvent) => {
      if (event.relatedTarget) {
        return;
      }

      dispatchDepthEvent({ type: 'leave' });
    };

    window.addEventListener('mousemove', handleWindowDepthPointerMove, { passive: true });
    window.addEventListener('mouseout', handleWindowPointerOut, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleWindowDepthPointerMove);
      window.removeEventListener('mouseout', handleWindowPointerOut);
    };
  }, []);

  useEffect(() => {
    if (!isLyricsDepthInteractive(transitionPhase)) {
      if (
        transitionPhase === 'exiting'
        || transitionPhase === 'returning'
        || transitionPhase === 'restoring'
      ) {
        return;
      }
      lockDepthToCenter();
      return;
    }

    if (reduceEffectsRef.current) {
      lockDepthToCenter();
      return;
    }

    dispatchDepthEvent({ type: 'unlock' });

    const getCursorPosition = window.musicPlayer?.window.getCursorPosition;
    if (!getCursorPosition) {
      return;
    }

    let active = true;
    let requestPending = false;
    let retryAfter = 0;
    const pollCursor = async () => {
      if (
        !active
        || requestPending
        || Date.now() < retryAfter
        || !isLyricsDepthInteractive(transitionPhaseRef.current)
      ) {
        return;
      }

      requestPending = true;
      try {
        const cursor = await getCursorPosition();
        if (!active || !cursor || !isLyricsDepthInteractive(transitionPhaseRef.current)) {
          return;
        }

        if (!cursor.inside) {
          dispatchDepthEvent({ type: 'leave' });
          return;
        }

        const didMove = submitDepthPointer({
          x: clamp(cursor.x / Math.max(1, window.innerWidth || 1440)),
          y: clamp(cursor.y / Math.max(1, window.innerHeight || 900))
        });
        if (didMove) {
          showLyricsChrome();
        }
      } catch {
        retryAfter = Date.now() + cursorPollFailureBackoffMs;
        return;
      } finally {
        requestPending = false;
      }
    };

    void pollCursor();
    const pollTimer = window.setInterval(() => {
      void pollCursor();
    }, 80);

    return () => {
      active = false;
      window.clearInterval(pollTimer);
    };
  }, [transitionPhase]);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const handleNativeWindowBlur = () => {
      hideLyricsChrome();
      dispatchDepthEvent({ type: 'leave' });
    };

    window.addEventListener('blur', handleNativeWindowBlur);

    return () => {
      window.removeEventListener('blur', handleNativeWindowBlur);
    };
  }, []);

  useEffect(() => {
    const viewport = lyricsLinesRef.current;
    if (!viewport) {
      return;
    }

    const updateAnchorSpaces = () => {
      const viewportSize = viewport.clientHeight || 540;
      setLyricsVirtualViewport((current) => (
        current.viewportSize === viewportSize
          ? current
          : { ...current, viewportSize }
      ));
    };
    updateAnchorSpaces();
    window.addEventListener('resize', updateAnchorSpaces);

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateAnchorSpaces);
    resizeObserver?.observe(viewport);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateAnchorSpaces);
    };
  }, [lines.length, plainLyricLines.length]);

  useLayoutEffect(() => {
    const viewport = lyricsLinesRef.current;
    if (!lyricsVirtualized || !viewport) {
      return undefined;
    }

    const updateMeasurements = (elements: Element[]) => {
      let changed = false;
      elements.forEach((element) => {
        const row = element as HTMLElement;
        const index = Number(row.dataset.lyricIndex);
        const size = row.offsetHeight;
        if (!Number.isInteger(index) || index < 0 || size <= 0) {
          return;
        }

        const previousSize = lyricLineSizesRef.current[index];
        if (previousSize === undefined || Math.abs(previousSize - size) > 0.5) {
          lyricLineSizesRef.current[index] = size;
          changed = true;
        }
      });

      if (changed) {
        setLyricLineSizeRevision((revision) => revision + 1);
      }
    };

    const rows = Array.from(viewport.querySelectorAll<HTMLElement>('.lyric-virtual-row'));
    updateMeasurements(rows);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => updateMeasurements(entries.map((entry) => entry.target)));
    rows.forEach((row) => resizeObserver?.observe(row));

    return () => resizeObserver?.disconnect();
  }, [lyricLineSizeKey, lyricVirtualIndexes, lyricsVirtualized]);

  useLayoutEffect(() => {
    if (lyricsScrollState !== 'settled') {
      return;
    }

    scrollActiveLyricIntoView();
  }, [activeIndex, lines.length, lyricsScrollState]);

  useEffect(() => {
    document.documentElement.style.setProperty('--lyrics-cover-tone', coverPalette.tone);
    document.documentElement.style.setProperty('--lyrics-title-glow', coverPalette.primary);
    document.documentElement.style.setProperty('--lyrics-cover-shadow', coverPalette.shadow);
    document.documentElement.style.setProperty('--lyrics-cover-secondary', coverPalette.secondary);

    return () => {
      document.documentElement.style.removeProperty('--lyrics-cover-tone');
      document.documentElement.style.removeProperty('--lyrics-title-glow');
      document.documentElement.style.removeProperty('--lyrics-cover-shadow');
      document.documentElement.style.removeProperty('--lyrics-cover-secondary');
    };
  }, [coverPalette]);

  useEffect(() => {
    document.documentElement.dataset.lyricsOpen = 'true';

    return () => {
      delete document.documentElement.dataset.lyricsOpen;
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.lyricsPhase = transitionPhase;

    return () => {
      if (document.documentElement.dataset.lyricsPhase === transitionPhase) {
        delete document.documentElement.dataset.lyricsPhase;
      }
    };
  }, [transitionPhase]);

  useLayoutEffect(() => {
    document.documentElement.dataset.lyricsChrome = chromeState;

    return () => {
      delete document.documentElement.dataset.lyricsChrome;
    };
  }, [chromeState]);

  useEffect(() => {
    if (!currentSong) {
      return;
    }

    void loadLyrics(currentSong);
  }, [currentSong, loadLyrics]);

  const closeLyricsPanel = contextSafe(() => {
    clearChromeIdleTimer();
    setChromeState('visible');

    if (transitionDirectionRef.current === 'enter') {
      stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
      setTransitionPhase('exiting');
      transitionDirectionRef.current = 'exit';
      freezeDepthForTransition();
      if (transitionTimelineRef.current) {
        transitionTimelineRef.current.kill();
      }
      abortEntryTransitionRef.current?.();
      return;
    }

    if (transitionBusyRef.current) {
      return;
    }

    if (isTestRuntime || !panelRef.current) {
      setTransitionPhase('restoring');
      void finishLyricsClose().then((closed) => {
        if (!closed && panelRef.current) {
          setTransitionPhase('interactive');
        }
      });
      return;
    }

    const sessionId = beginTransitionSession();
    const reducedMotion = reduceEffects;
    let settled = false;
    let activeElements: LyricsTransitionElements | null = null;

    const claimSettlement = () => {
      if (settled || !isCurrentTransitionSession(sessionId)) {
        return false;
      }

      settled = true;
      clearTransitionWatchdog();
      clearTransitionInitFrame();
      return true;
    };
    const clearExitTransitionState = () => {
      transitionBusyRef.current = false;
      transitionTimelineRef.current = null;
      transitionDirectionRef.current = null;
      abortEntryTransitionRef.current = null;
    };
    const finishExitWithoutTimeline = () => {
      if (!claimSettlement()) {
        return;
      }

      clearExitTransitionState();
      stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
      setTransitionPhase('restoring');
      void finishLyricsClose().then((closed) => {
        if (!closed && isCurrentTransitionSession(sessionId) && panelRef.current) {
          setTransitionPhase('interactive');
        }
      });
    };
    const recoverExitTransition = () => {
      if (!claimSettlement()) {
        return;
      }

      const elements = activeElements;
      const timeline = transitionTimelineRef.current;
      clearExitTransitionState();
      stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
      timeline?.kill();
      if (elements) {
        restoreLyricsAfterFailedClose(elements);
      } else {
        setTransitionPhase('interactive');
      }
    };

    setTransitionPhase('exiting');
    transitionBusyRef.current = true;
    transitionDirectionRef.current = 'exit';

    let startExitTransition: (attempt: number) => void;
    const runExitTransition = (attempt: number) => {
      if (settled || !isCurrentTransitionSession(sessionId)) {
        return;
      }

      const panel = panelRef.current;
      const resolved = panel ? resolveLyricsTransitionElements(panel) : null;
      if (!resolved) {
        if (attempt < transitionInitRetryFrames) {
          transitionInitFrameRef.current = window.requestAnimationFrame(() => {
            transitionInitFrameRef.current = 0;
            startExitTransition(attempt + 1);
          });
        } else {
          reportLyricsTransitionFailure(
            'lyrics-transition-exit-elements-missing',
            'Required exit transition elements were not mounted'
          );
          finishExitWithoutTimeline();
        }
        return;
      }

      const { artwork, elements } = resolved;
      const { stage } = elements;
      activeElements = elements;

      try {
        stopTransitionHoverLoops(transitionHoverTimelineRef, transitionGlowTimelineRef);
        const frozenPointer = freezeDepthForTransition();

        // Fullscreen and normal window layouts can have different cover coordinates. Build
        // the return flight from the neutral layout so pointer depth is not applied twice.
        const origin = resolveCurrentTransitionOrigin(transitionOrigin);
        const target = measureNeutralArtworkRect(stage, artwork, frozenPointer);
        const coverFlightTarget = createCoverFlightTarget(origin, target);
        const portalGeometry = createLyricsPortalGeometry(origin, coverFlightTarget);
        transitionGeometryRef.current = { origin, coverFlightTarget, portalGeometry };
        prepareTransitionLayers(elements, origin);

        const completeExitTransition = () => {
          if (!claimSettlement()) {
            return;
          }

          clearExitTransitionState();
          cleanupTransitionLayers(elements);
          setTransitionPhase('restoring');
          void finishLyricsClose().then((closed) => {
            if (
              !closed
              && isCurrentTransitionSession(sessionId)
              && panelRef.current === panel
            ) {
              restoreLyricsAfterFailedClose(elements);
            }
          });
        };
        const timeline = gsap.timeline({
          defaults: {
            overwrite: 'auto'
          },
          onComplete: completeExitTransition,
          onInterrupt: () => {
            if (settled || !isCurrentTransitionSession(sessionId)) {
              return;
            }
            reportLyricsTransitionFailure(
              'lyrics-transition-exit-interrupted',
              'The exit timeline was interrupted unexpectedly'
            );
            recoverExitTransition();
          }
        });

        transitionTimelineRef.current = timeline;

        const updateExitPhase = (phase: 'returning' | 'restoring') => {
          if (
            !settled
            && isCurrentTransitionSession(sessionId)
            && transitionDirectionRef.current === 'exit'
          ) {
            setTransitionPhase(phase);
          }
        };
        if (reducedMotion) {
          playReducedMotionExit(timeline, elements, {
            onReturn: () => updateExitPhase('returning'),
            onRestore: () => updateExitPhase('restoring')
          });
        } else {
          playSimpleSlideExit(timeline, elements, {
            onReturn: () => updateExitPhase('returning'),
            onRestore: () => updateExitPhase('restoring')
          });
        }
        startTransitionWatchdog(
          sessionId,
          'exit',
          reducedMotion,
          () => {
            reportLyricsTransitionFailure(
              'lyrics-transition-exit-timeout',
              'The exit timeline exceeded its expected duration'
            );
            recoverExitTransition();
          }
        );
      } catch (error) {
        reportLyricsTransitionFailure('lyrics-transition-exit-error', error);
        recoverExitTransition();
      }
    };

    startExitTransition = contextSafe(runExitTransition);
    startExitTransition(0);
  });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isLyricsMenuOpen) {
        event.preventDefault();
        setIsLyricsMenuOpen(false);
        return;
      }

      event.preventDefault();
      closeLyricsPanel();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeLyricsPanel, isLyricsMenuOpen]);

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(
        <div
          className="lyrics-transition-flight"
          aria-hidden="true"
          ref={transitionFlightRef}
          style={transitionLayerStyle}
        >
          <div className="lyrics-transition-glow" ref={transitionGlowRef} />
          <div className="lyrics-transition-bob" ref={transitionBobRef}>
            <div className="lyrics-transition-shadow" ref={transitionShadowRef} />
            <div className="lyrics-transition-card" />
            <div className="lyrics-transition-edge lyrics-transition-edge-top" />
            <div className="lyrics-transition-edge lyrics-transition-edge-right" />
            <div className="lyrics-transition-edge lyrics-transition-edge-bottom" />
            <div className="lyrics-transition-edge lyrics-transition-edge-left" />
          </div>
        </div>,
        document.body
      ) : null}
      <section
      className={`lyrics-overlay${chromeState === 'hidden' ? ' chrome-hidden' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="歌词详情"
      data-transition-origin={transitionOrigin ? 'player-cover' : 'fallback'}
      data-transition-phase={transitionPhase}
      data-reduce-effects={reduceEffects ? 'true' : 'false'}
      style={transitionLayerStyle}
    >
      <div
        className="lyrics-transition-app-vignette"
        aria-hidden="true"
        ref={transitionAppVignetteRef}
        style={transitionLayerStyle}
      />
      <div
        className="lyrics-panel"
        ref={panelRef}
        style={{ '--lyrics-scale': String(fontScale) } as DepthStyle}
        onMouseMove={handlePanelPointerMove}
      >
        <div className="lyrics-transition-ripple" aria-hidden="true" ref={transitionRippleRef} />
        <svg className="lyrics-transition-filter-defs" aria-hidden="true" focusable="false">
          <defs>
            <filter id="lyricsWaterRippleFilter" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.009 0.028"
                numOctaves={1}
                seed={17}
                result="lyricsWaterRippleNoise"
              />
              <feDisplacementMap
                id="lyricsWaterRippleDisplacement"
                ref={transitionDisplacementRef}
                in="SourceGraphic"
                in2="lyricsWaterRippleNoise"
                scale="0"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
        <div className="lyrics-dynamic-bg" aria-hidden="true">
          <span className="lyrics-glow-orb lyrics-glow-1" />
          <span className="lyrics-glow-orb lyrics-glow-2" />
        </div>
        <header className="lyrics-header">
          <div className="lyrics-header-left">
            <button
              className="lyrics-header-btn"
              type="button"
              title="收起歌词页"
              aria-label="收起歌词页"
              onClick={closeLyricsPanel}
            >
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="lyrics-header-title" title={songTitle}>{songTitle}</div>
          <div className="lyrics-header-actions" ref={sideToolsRef}>
            <button
              className="lyrics-header-btn"
              type="button"
              title="歌词设置"
              aria-label="歌词设置"
              aria-haspopup="menu"
              aria-expanded={isLyricsMenuOpen}
              ref={menuButtonRef}
              onClick={() => setIsLyricsMenuOpen((value) => !value)}
            >
              <Menu aria-hidden="true" size={15} />
            </button>
            {typeof document !== 'undefined' ? (
              <PopoverMenu
                open={isLyricsMenuOpen}
                onClose={() => setIsLyricsMenuOpen(false)}
                triggerRef={menuButtonRef}
                position="bottom"
                align="right"
                ariaLabel="歌词页设置"
                items={lyricsMenuItems}
              />
            ) : null}
            <WindowControls />
          </div>
        </header>

        <main className="lyrics-main-body" ref={stageRef} style={stageStyle}>
          <section
            className="lyrics-artwork-container lyrics-cover-enter"
            style={
              {
                '--cover-tone': coverPalette.tone,
                '--lyrics-cover-shadow': coverPalette.shadow
              } as DepthStyle
            }
          >
            <div className="lyrics-big-cover-anchor">
              <div
                className="lyrics-big-cover"
                ref={artworkRef}
                style={
                  {
                    '--cover-tone': coverPalette.tone,
                    '--song-cover-image': coverImage
                  } as DepthStyle
                }
              />
            </div>
            <div className="lyrics-artwork-meta">
              <h2 className="lyrics-song-title" title={songTitle}>
                {songTitle}
              </h2>
              {primaryArtist ? (
                <button
                  className="lyrics-song-artist"
                  type="button"
                  title={currentSong?.artist}
                  aria-label={`Search artist ${primaryArtist}`}
                  onClick={handleArtistClick}
                >
                  <span className="lyrics-song-artist-text">{primaryArtist}</span>
                </button>
              ) : null}
            </div>
          </section>

          <section className="lyrics-scroll-zone">
            <div className="lyrics-scroll-wrap">
              <div
                className={`lyrics-scroll-container${lyricsScrollState === 'scrolling' ? ' user-scrolling' : ''}`}
                data-lyric-glow-transition={lyricGlowTransition}
                data-lyric-media-clock={isLyricMediaClockActive ? 'active' : 'fallback'}
                data-virtualized={lyricsVirtualized ? 'true' : 'false'}
                ref={lyricsLinesRef}
                onScroll={handleLyricsScroll}
                onWheel={handleLyricsWheel}
              >
                {lyricStatusMessage ? <p className="lyrics-status">{lyricStatusMessage}</p> : null}
                {lyricsVirtualized ? (
                  <div
                    className="lyrics-virtual-space"
                    style={{ '--lyrics-virtual-height': `${lyricVirtualLayout.totalHeight}px` } as DepthStyle}
                  >
                    {lyricVirtualIndexes.map((index) => renderLyricRow(index, true))}
                  </div>
                ) : (
                  Array.from({ length: renderedLyricCount }, (_, index) => renderLyricRow(index, false))
                )}
              </div>
            </div>
          </section>
        </main>
        <LyricsPlayerBar reduceEffects={reduceEffects} />
      </div>
      </section>
    </>
  );

  function renderLyricRow(index: number, virtualized: boolean) {
    const timedLine = lines[index];
    const plainLine = timedLine ? null : plainLyricLines[index];
    if (!timedLine && !plainLine) {
      return null;
    }

    const key = timedLine ? `${timedLine.startMs}-${timedLine.text}` : `${plainLine}-${index}`;
    const row = timedLine ? renderTimedLyricLine(timedLine, index) : (
      <div className={`lyric-line ${getLyricLineDistanceClass(index)}`} data-lyric-index={index}>
        <span className="lyric-line-text">{plainLine}</span>
      </div>
    );

    if (!virtualized) {
      return <Fragment key={key}>{row}</Fragment>;
    }

    return (
      <div
        className="lyric-virtual-row"
        data-lyric-index={index}
        key={key}
        style={
          {
            '--lyric-virtual-offset': `${getVariableItemOffset(lyricVirtualLayout, index)}px`
          } as DepthStyle
        }
      >
        {row}
      </div>
    );
  }

  function getLyricLineDistanceClass(index: number) {
    if (index === activeIndex) {
      return 'active';
    }

    const delta = Math.abs(index - activeIndex);
    if (delta === 1) return 'near-1';
    if (delta === 2) return 'near-2';
    if (delta === 3) return 'far-1';
    return 'far-2';
  }

  function handleLyricLineClick(index: number) {
    const line = lines[index];
    // 允许点击任意行（含当前行下方的未来行）跳转到该句开始播放
    if (!line) {
      return;
    }

    seekPlayback(line.startMs, lyricDurationMs);
  }

  function renderTimedLyricLine(line: (typeof lines)[number], index: number) {
    const isActive = index === activeIndex;
    const lineProgress = isActive ? activeLineProgress : index < activeIndex ? 1 : 0;
    const isLongActiveLine = isActive && Array.from(line.text).length > lyricLongLineThreshold;
    const isCharFill = isActive && !isLongActiveLine;
    const lyricDistance = getLyricDistance(index, activeIndex);
    const translation = translationsByStartMs.get(line.startMs);
    const className = [
      'lyric-line',
      getLyricLineDistanceClass(index),
      isLongActiveLine ? 'lyric-long-line' : ''
    ].filter(Boolean).join(' ');

    return (
      <div
        className={className}
        ref={isActive ? activeLineRef : undefined}
        style={
          {
            '--lyric-line-progress': formatProgressPercent(lineProgress)
          } as DepthStyle
        }
        aria-current={isActive ? 'true' : undefined}
        data-lyric-index={index}
        data-lyric-motion={lyricDistance <= 5 ? 'active' : undefined}
        data-timed-lyric="true"
        onClick={() => handleLyricLineClick(index)}
      >
        <button
          className="lyric-hover-play-btn"
          type="button"
          tabIndex={-1}
          aria-hidden="true"
        >
          <PlayIcon size={13} strokeWidth={2.4} filled />
        </button>
        <div className="lyric-text-content">
          <span className="lyric-line-text" aria-label={line.text}>
            <span className="lyric-line-text-base">{line.text}</span>
            {isCharFill ? (
              <span className="lyric-line-text-fill" aria-hidden="true" data-char-fill>
                {Array.from(line.text).map((char, charIndex) => (
                  <span key={charIndex} className="lyric-char-fill" data-char-index={charIndex}>
                    {char}
                  </span>
                ))}
              </span>
            ) : (
              <span className="lyric-line-text-fill" aria-hidden="true">{line.text}</span>
            )}
          </span>
          {showTranslation && translation ? <span className="lyrics-translation-text">{translation}</span> : null}
        </div>
      </div>
    );
  }

  function handlePanelPointerMove(event: MouseEvent<HTMLDivElement>) {
    if (!isLyricsDepthInteractive(transitionPhaseRef.current)) {
      return;
    }

    if (reduceEffectsRef.current) {
      showLyricsChrome();
      return;
    }

    if (isLyricsChromePointerTarget(event.target)) {
      showLyricsChrome();
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const hasLayout = rect.width > 0 && rect.height > 0;
    const width = hasLayout ? rect.width : 1440;
    const height = hasLayout ? rect.height : 900;
    const left = hasLayout ? rect.left : 0;
    const top = hasLayout ? rect.top : 0;

    submitDepthPointer({
      x: clamp((event.clientX - left) / width),
      y: clamp((event.clientY - top) / height)
    });
    showLyricsChrome();
  }

  function markLyricFontAdjustment() {
    isAdjustingLyricFontRef.current = true;
    clearFontScaleScrollGuardTimer();
    fontScaleScrollGuardTimeoutRef.current = window.setTimeout(() => {
      isAdjustingLyricFontRef.current = false;
      fontScaleScrollGuardTimeoutRef.current = 0;
    }, fontScaleScrollGuardMs);
  }

  function handleFontScaleChange(nextScale: number) {
    const safeScale = clampLyricFontScale(nextScale);
    markLyricFontAdjustment();
    setFontScale(safeScale);
    persistLyricFontScale(safeScale);
  }

  function handleLyricsScroll() {
    scheduleLyricsVirtualViewportUpdate();
    // 程序性滚动（rAF 自动定位）会派发 scroll 事件，不能把它当成用户滚动而
    // 挂上 .user-scrolling（导致逐行模糊消失）。距上次程序滚动 <200ms 视为同一程序滚动。
    if (
      isAutoScrollingLyricsRef.current
      || isAdjustingLyricFontRef.current
      || performance.now() - lastProgrammaticLyricScrollAtRef.current < 200
    ) {
      return;
    }

    setLyricsScrollState('scrolling');
    clearLyricsScrollIdleTimer();
    lyricsScrollIdleTimeoutRef.current = window.setTimeout(() => {
      setLyricsScrollState('settled');
      scrollActiveLyricIntoView();
      lyricsScrollIdleTimeoutRef.current = 0;
    }, 3000);
  }

  function handleLyricsWheel(event: WheelEvent<HTMLDivElement>) {
    const viewport = event.currentTarget;
    clearLyricsAutoScrollFrame();
    isAutoScrollingLyricsRef.current = false;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const isAtTop = viewport.scrollTop <= 0;
    const isAtBottom = viewport.scrollTop >= maxScrollTop - 1;

    if ((event.deltaY < 0 && isAtTop) || (event.deltaY > 0 && isAtBottom)) {
      event.preventDefault();
    }
  }

  function handleArtistClick() {
    if (!currentSong || !primaryArtist) {
      return;
    }

    const providerId = currentSong.providerId === 'netease' || currentSong.providerId === 'qq' ? currentSong.providerId : 'qq';
    void finishLyricsClose();
    navigateToView('search', { keyword: primaryArtist });
    void search(providerId, primaryArtist);
  }

  async function finishLyricsClose() {
    const restored = await restoreWindowAfterLyrics();
    if (restored) {
      setLyricsOpen(false);
    }
    return restored;
  }

  function restoreWindowAfterLyrics(): Promise<boolean> {
    // 新版歌词页不再改变窗口全屏状态，收起时保持窗口原样
    // （旧的 setFullscreen(false) 会把用户手动最大化的窗口打回普通尺寸）
    if (!windowRestorePromiseRef.current) {
      windowRestorePromiseRef.current = Promise.resolve(true);
    }
    return windowRestorePromiseRef.current;
  }

  function showLyricsChrome() {
    setChromeState('visible');
    scheduleChromeIdleHide();
  }

  function hideLyricsChrome() {
    if (!isLyricsDepthInteractive(transitionPhaseRef.current)) {
      return;
    }

    clearChromeIdleTimer();
    setChromeState('hidden');
  }

  function scheduleChromeIdleHide() {
    clearChromeIdleTimer();
    chromeIdleTimeoutRef.current = window.setTimeout(() => {
      if (!isLyricsDepthInteractive(transitionPhaseRef.current)) {
        chromeIdleTimeoutRef.current = 0;
        return;
      }

      setChromeState('hidden');
      dispatchDepthEvent({ type: 'request-idle' });
      chromeIdleTimeoutRef.current = 0;
    }, chromeIdleDelayMs);
  }

  function clearChromeIdleTimer() {
    if (!chromeIdleTimeoutRef.current) {
      return;
    }

    window.clearTimeout(chromeIdleTimeoutRef.current);
    chromeIdleTimeoutRef.current = 0;
  }

  function clearIdleDepthStartTimer() {
    if (!idleDepthStartTimeoutRef.current) {
      return;
    }

    window.clearTimeout(idleDepthStartTimeoutRef.current);
    idleDepthStartTimeoutRef.current = 0;
  }

  function clearLyricsScrollIdleTimer() {
    if (!lyricsScrollIdleTimeoutRef.current) {
      return;
    }

    window.clearTimeout(lyricsScrollIdleTimeoutRef.current);
    lyricsScrollIdleTimeoutRef.current = 0;
  }

  function clearLyricsAutoScrollFrame() {
    if (!lyricsAutoScrollFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(lyricsAutoScrollFrameRef.current);
    lyricsAutoScrollFrameRef.current = 0;
  }

  function clearLyricsVirtualScrollFrame() {
    if (!lyricsVirtualScrollFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(lyricsVirtualScrollFrameRef.current);
    lyricsVirtualScrollFrameRef.current = 0;
  }

  function scheduleLyricsVirtualViewportUpdate() {
    if (!lyricsVirtualized || lyricsVirtualScrollFrameRef.current) {
      return;
    }

    lyricsVirtualScrollFrameRef.current = window.requestAnimationFrame(() => {
      lyricsVirtualScrollFrameRef.current = 0;
      const viewport = lyricsLinesRef.current;
      if (!viewport) {
        return;
      }

      // 自动滚动期间用精确 scrollTop（桶化会让虚拟窗口滞后于逐帧滚动，
      // 行来回挂载/卸载造成"染色后行消失再出现"的跳动感）
      const scrollTop = isAutoScrollingLyricsRef.current
        ? Math.max(0, viewport.scrollTop)
        : Math.floor(Math.max(0, viewport.scrollTop) / lyricVirtualScrollBucketPx) * lyricVirtualScrollBucketPx;

      const nextViewport = {
        scrollTop,
        viewportSize: viewport.clientHeight || 540
      };
      setLyricsVirtualViewport((current) => (
        current.scrollTop === nextViewport.scrollTop && current.viewportSize === nextViewport.viewportSize
          ? current
          : nextViewport
      ));
    });
  }

  function clearFontScaleScrollGuardTimer() {
    if (!fontScaleScrollGuardTimeoutRef.current) {
      return;
    }

    window.clearTimeout(fontScaleScrollGuardTimeoutRef.current);
    fontScaleScrollGuardTimeoutRef.current = 0;
  }

  function scrollActiveLyricIntoView() {
    const viewport = lyricsLinesRef.current;
    const activeLine = activeLineRef.current;

    if (activeIndex < 0 || !viewport || (!activeLine && !lyricsVirtualized)) {
      return;
    }

    isAutoScrollingLyricsRef.current = true;
    clearLyricsAutoScrollFrame();

    const targetTop = lyricsVirtualized
      ? getAnchoredLyricScrollTop({
          lineTop: parseScrollPaddingTop(viewport) + getVariableItemOffset(lyricVirtualLayout, activeIndex),
          lineHeight: lyricLineSizesRef.current[activeIndex] ?? lyricVirtualLayout.estimate,
          viewportHeight: viewport.clientHeight,
          scrollHeight: viewport.scrollHeight
        })
      : getAnchoredLyricScrollTopFromRects({
          lineViewportTop: activeLine!.getBoundingClientRect().top,
          lineHeight: activeLine!.getBoundingClientRect().height,
          viewportTop: viewport.getBoundingClientRect().top,
          viewportHeight: viewport.clientHeight,
          currentScrollTop: viewport.scrollTop,
          scrollHeight: viewport.scrollHeight
        });
    if (isTestRuntime || reduceEffectsRef.current) {
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top: targetTop, behavior: 'auto' });
      } else {
        viewport.scrollTop = targetTop;
      }
      isAutoScrollingLyricsRef.current = false;
      return;
    }

    const startTop = viewport.scrollTop;
    const startedAt = window.performance.now();
    const tick = (time: number) => {
      const elapsedMs = time - startedAt;
      viewport.scrollTop = createAnchoredLyricScrollFrame(startTop, targetTop, elapsedMs, lyricAutoScrollDurationMs);
      lastProgrammaticLyricScrollAtRef.current = window.performance.now();

      if (elapsedMs >= lyricAutoScrollDurationMs) {
        viewport.scrollTop = targetTop;
        lastProgrammaticLyricScrollAtRef.current = window.performance.now();
        lyricsAutoScrollFrameRef.current = 0;
        isAutoScrollingLyricsRef.current = false;
        return;
      }

      lyricsAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    lyricsAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function submitDepthPointer(pointer: LyricsDepthPointer) {
    return dispatchDepthEvent({ type: 'sample', pointer });
  }

  function dispatchDepthEvent(event: LyricsDepthEvent) {
    const previousState = depthStateRef.current;
    const nextState = reduceLyricsDepthState(previousState, event);
    if (nextState === previousState) {
      return false;
    }

    depthStateRef.current = nextState;
    if (nextState.mode !== previousState.mode) {
      setDepthMode(nextState.mode);
    }

    if (nextState.mode === 'locked') {
      clearIdleDepthStartTimer();
      cancelDepthFrame();
      visualPointerRef.current = centerPointer;
      applyDepthStyle(stageRef.current, centerPointer);
      return true;
    }

    if (nextState.mode === 'centering') {
      const isNewCenterReturn = previousState.mode !== 'centering' ||
        previousState.resumeIdleAfterCenter !== nextState.resumeIdleAfterCenter;
      if (!isNewCenterReturn) {
        return true;
      }

      clearIdleDepthStartTimer();
      cancelDepthFrame();
      centerReturnStartPointerRef.current = visualPointerRef.current;
      centerReturnStartedAtRef.current = window.performance.now();

      if (isTestRuntime) {
        visualPointerRef.current = centerPointer;
        applyDepthStyle(stageRef.current, centerPointer);
        if (nextState.resumeIdleAfterCenter) {
          idleDepthStartTimeoutRef.current = window.setTimeout(() => {
            idleDepthStartTimeoutRef.current = 0;
            dispatchDepthEvent({ type: 'centered' });
          }, centerReturnDurationMs);
        }
        return true;
      }
    }

    if (nextState.mode === 'idle') {
      idleDepthMotionStartedAtRef.current = window.performance.now();
      if (isTestRuntime) {
        applyIdleDepthFrame(idleDepthMotionStartedAtRef.current + 16);
      }
    }

    if (nextState.mode === 'pointer') {
      clearIdleDepthStartTimer();
      if (isTestRuntime) {
        visualPointerRef.current = nextState.target;
        applyDepthStyle(stageRef.current, nextState.target);
        return true;
      }
    }

    scheduleDepthFrame();
    return true;
  }

  function freezeDepthForTransition(): LyricsDepthPointer {
    clearIdleDepthStartTimer();
    cancelDepthFrame();
    const pointer = { ...visualPointerRef.current };
    const currentState = depthStateRef.current;
    depthStateRef.current = {
      ...currentState,
      mode: 'locked',
      target: pointer,
      lastObservedPointer: pointer,
      resumeIdleAfterCenter: false
    };
    if (currentState.mode !== 'locked') {
      setDepthMode('locked');
    }

    return pointer;
  }

  function restoreLyricsAfterFailedClose(elements: LyricsTransitionElements) {
    visualPointerRef.current = centerPointer;
    depthStateRef.current = {
      ...depthStateRef.current,
      target: centerPointer,
      lastObservedPointer: centerPointer,
      resumeIdleAfterCenter: false
    };
    restoreInteractiveLyricsLayers(elements);
    setTransitionPhase('interactive');
  }

  function scheduleDepthFrame() {
    if (depthFrameRef.current || reduceEffectsRef.current) {
      return;
    }

    depthFrameRef.current = window.requestAnimationFrame(renderDepthFrame);
  }

  function renderDepthFrame(time: number) {
    depthFrameRef.current = 0;
    const state = depthStateRef.current;

    if (state.mode === 'locked' || reduceEffectsRef.current) {
      visualPointerRef.current = centerPointer;
      applyDepthStyle(stageRef.current, centerPointer);
      return;
    }

    if (state.mode === 'pointer') {
      const nextPointer = lerpPointer(visualPointerRef.current, state.target, depthPointerFollowAmount);
      const distance = getPointerDistance(nextPointer, state.target);
      visualPointerRef.current = distance < depthPointerSettleDistance ? state.target : nextPointer;
      applyDepthStyle(stageRef.current, visualPointerRef.current);
      if (distance >= depthPointerSettleDistance) {
        scheduleDepthFrame();
      }
      return;
    }

    if (state.mode === 'centering') {
      const nextPointer = createCenterReturnPointer(
        centerReturnStartPointerRef.current,
        time - centerReturnStartedAtRef.current,
        centerReturnDurationMs
      );
      visualPointerRef.current = nextPointer;
      applyDepthStyle(stageRef.current, nextPointer);

      if (getPointerDistance(nextPointer, centerPointer) <= depthPointerSettleDistance) {
        visualPointerRef.current = centerPointer;
        applyDepthStyle(stageRef.current, centerPointer);
        dispatchDepthEvent({ type: 'centered' });
      } else {
        scheduleDepthFrame();
      }
      return;
    }

    applyIdleDepthFrame(time);
    scheduleDepthFrame();
  }

  function applyIdleDepthFrame(time: number) {
    const elapsedSeconds = (time - idleDepthMotionStartedAtRef.current) / 1000;
    const pointer = {
      x: clamp(0.5 + Math.sin(elapsedSeconds * 0.82) * 0.06),
      y: clamp(0.5 + Math.cos(elapsedSeconds * 0.64) * 0.045)
    };
    visualPointerRef.current = pointer;
    applyDepthStyle(stageRef.current, pointer);
  }

  function cancelDepthFrame() {
    if (!depthFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(depthFrameRef.current);
    depthFrameRef.current = 0;
  }

  function setLyricMediaClockActive(active: boolean) {
    if (lyricMediaClockActiveRef.current === active) {
      return;
    }

    lyricMediaClockActiveRef.current = active;
    setLyricMediaClockActiveState(active);
  }

  function cancelLyricMediaClockFrame() {
    if (!lyricMediaClockFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(lyricMediaClockFrameRef.current);
    lyricMediaClockFrameRef.current = 0;
  }

  function syncLyricLineFillFromMedia(media: HTMLAudioElement) {
    const { lines: currentLines, durationMs } = lyricMediaClockContextRef.current;
    const positionMs = getMediaPositionMs(media);
    const nextIndex = findActiveLyricLine(currentLines, positionMs);
    playbackPositionRef.current = positionMs;
    lyricMediaClockContextRef.current.activeIndex = nextIndex;

    if (commitActiveLyricIndex(nextIndex)) {
      return;
    }

    const lineProgress = getLyricLineProgress(currentLines, nextIndex, positionMs, durationMs);

    syncActiveLyricFill(nextIndex, lineProgress, positionMs);
  }


  function lockDepthToCenter() {
    dispatchDepthEvent({ type: 'lock' });
  }
}

function reportLyricsTransitionFailure(event: string, value: unknown) {
  const error = toErrorDetails(value);
  const currentSong = usePlayerStore.getState().currentSong;
  reportRendererDiagnostic({
    level: 'warn',
    event,
    area: 'lyrics-transition',
    message: error.message,
    stack: error.stack,
    entityId: currentSong?.id
  });
}

interface AnchoredLyricScrollTopOptions {
  lineTop: number;
  lineHeight: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface AnchoredLyricScrollTopFromRectsOptions {
  lineViewportTop: number;
  lineHeight: number;
  viewportTop: number;
  viewportHeight: number;
  currentScrollTop: number;
  scrollHeight: number;
}

export function getAnchoredLyricScrollTop({
  lineTop,
  lineHeight,
  viewportHeight,
  scrollHeight
}: AnchoredLyricScrollTopOptions): number {
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const anchoredTop = lineTop + lineHeight / 2 - viewportHeight * lyricAnchorViewportRatio;

  return Math.max(0, Math.min(anchoredTop, maxScrollTop || anchoredTop));
}

export function getAnchoredLyricScrollTopFromRects({
  lineViewportTop,
  lineHeight,
  viewportTop,
  viewportHeight,
  currentScrollTop,
  scrollHeight
}: AnchoredLyricScrollTopFromRectsOptions) {
  return getAnchoredLyricScrollTop({
    lineTop: lineViewportTop - viewportTop + currentScrollTop,
    lineHeight,
    viewportHeight,
    scrollHeight
  });
}

export function getLyricAnchorSpaces(viewportHeight: number) {
  const safeViewportHeight = Math.max(0, viewportHeight);
  return {
    head: safeViewportHeight * lyricAnchorViewportRatio,
    tail: safeViewportHeight * (1 - lyricAnchorViewportRatio)
  };
}

/** 滚动容器的上 padding：虚拟行偏移不含 padding，锚定计算需要补回 */
function parseScrollPaddingTop(viewport: HTMLElement) {
  return parseFloat(window.getComputedStyle(viewport).paddingTop) || 0;
}

export function createAnchoredLyricScrollFrame(startTop: number, targetTop: number, elapsedMs: number, durationMs = lyricAutoScrollDurationMs) {
  const progress = clamp(elapsedMs / Math.max(1, durationMs));
  // easeOutCubic：启动即动（行切换的染色与滚动同步），收尾缓停
  return startTop + (targetTop - startTop) * easeOutCubic(progress);
}

function createPlainLyricLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\[[a-zA-Z]+:.*\]$/.test(line) && !/^\[\d{2,}:\d{2}(?:[.:]\d{1,3})?\]/.test(line));
}

function readStoredLyricFontScale() {
  if (typeof window === 'undefined') {
    return 1;
  }

  const rawValue = window.localStorage.getItem(lyricFontScaleStorageKey);
  const parsedValue = rawValue ? Number(rawValue) : 1;
  return clampLyricFontScale(parsedValue);
}

function persistLyricFontScale(value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(lyricFontScaleStorageKey, String(clampLyricFontScale(value)));
}

function clampLyricFontScale(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(lyricFontScaleMin, Math.min(lyricFontScaleMax, value));
}

function formatLyricTime(positionMs: number) {
  const totalSeconds = Math.max(0, Math.floor(positionMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPrimaryArtist(artist: string) {
  const trimmedArtist = artist.trim();
  if (!trimmedArtist) {
    return '';
  }

  const [firstArtist] = trimmedArtist.split(/[/,&]+/);
  return firstArtist.replace(/\s*\([^)]*\)\s*$/, '').trim() || trimmedArtist;
}

function getLyricDistance(index: number, activeIndex: number) {
  if (activeIndex < 0) {
    return 0;
  }

  return Math.min(Math.abs(index - activeIndex), 6);
}

function getLyricSignedDistance(index: number, activeIndex: number) {
  if (activeIndex < 0) {
    return 0;
  }

  return Math.max(-6, Math.min(index - activeIndex, 6));
}

export function getLyricFlowRank(index: number, activeIndex: number, previousActiveIndex: number) {
  if (activeIndex < 0) {
    return 0;
  }

  const motionOriginIndex = previousActiveIndex >= 0 && previousActiveIndex !== activeIndex ? previousActiveIndex : activeIndex;
  return Math.min(Math.abs(index - motionOriginIndex), 5);
}

function isNoLyricsPlaceholder(input: string) {
  const plainText = input.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, '');
  return plainText.includes('娌℃湁濉瘝') && plainText.includes('鍙ｇ櫧');
}

function formatProgressPercent(progress: number) {
  const percent = Math.max(0, Math.min(1, progress)) * 100;
  return `${Math.round(percent * 100) / 100}%`;
}

function resetLyricLineFillCache(cache: LyricLineFillCache) {
  cache.line = null;
  cache.progress = -1;
  cache.container = null;
  cache.lineIndex = -1;
  cache.filledCount = -1;
}

function syncLyricLineProgress(line: HTMLElement | null, progress: number, cache?: LyricLineFillCache) {
  if (!line) {
    if (cache) resetLyricLineFillCache(cache);
    return;
  }

  const safeProgress = clamp(progress);
  if (cache && cache.line === line && Math.abs(cache.progress - safeProgress) < 0.0001) {
    return;
  }

  const value = formatProgressPercent(safeProgress);
  if (line.style.getPropertyValue('--lyric-line-progress') !== value) {
    line.style.setProperty('--lyric-line-progress', value);
  }

  if (cache) {
    cache.line = line;
    cache.progress = safeProgress;
  }
}

/**
 * 逐字描光：按行内字符时间轴（与 getLyricLineProgress 同一时间窗口均分）
 * 计算"已填满字符数"，只更新边界处 1-2 个字符的 class，
 * 已唱完的字符长期保持 .filled（纯色 + 微光，无每帧重绘）。
 */
function syncCharFill(
  container: HTMLElement | null,
  lineIndex: number,
  positionMs: number,
  lines: ReturnType<typeof parseLrc>,
  durationMs: number,
  cache: LyricLineFillCache
) {
  if (!container) {
    if (cache.lineIndex === lineIndex) {
      resetLyricLineFillCache(cache);
    }
    return;
  }

  const charCount = container.childElementCount;
  if (charCount <= 0) {
    return;
  }

  // 行切换（React 已渲染新行）→ 全量清理到初始未唱态
  if (cache.lineIndex !== lineIndex || cache.container !== container || cache.filledCount < 0) {
    cache.container = container;
    cache.lineIndex = lineIndex;
    cache.filledCount = 0;
    for (let index = 0; index < charCount; index += 1) {
      const span = container.children[index] as HTMLElement;
      span.classList.remove('filled', 'filling');
      span.style.removeProperty('--lyric-char-progress');
    }
  }

  const line = lines[lineIndex];
  if (!line) {
    return;
  }

  const nextStartMs = lines[lineIndex + 1]?.startMs;
  const endMs = nextStartMs ?? durationMs;
  const safeEndMs = endMs > line.startMs ? endMs : line.startMs + 4000;
  const lineDurationMs = safeEndMs - line.startMs;
  if (lineDurationMs <= 0) {
    return;
  }

  const charDurationMs = lineDurationMs / charCount;
  const filledCount = clampCharCount(Math.floor((positionMs - line.startMs) / charDurationMs), charCount);
  const prevFilled = cache.filledCount;

  // 无填满数变化：当前字内部渐变推进，仅原地更新进度（带最小阈值防抖）
  if (filledCount === prevFilled) {
    if (filledCount < charCount) {
      updateFillingChar(container, filledCount, positionMs, lines, lineIndex, charCount, charDurationMs, durationMs);
    }
    return;
  }

  if (filledCount > prevFilled) {
    // 前进：把 [prevFilled, filledCount) 标为已唱完
    for (let index = prevFilled; index < filledCount; index += 1) {
      const span = container.children[index] as HTMLElement;
      span.classList.remove('filling');
      span.classList.add('filled');
      span.style.removeProperty('--lyric-char-progress');
    }
  } else {
    // 回退（seek 后退等）：清掉 [filledCount, prevFilled]
    for (let index = filledCount; index <= prevFilled; index += 1) {
      const span = container.children[index] as HTMLElement;
      span.classList.remove('filled', 'filling');
      span.style.removeProperty('--lyric-char-progress');
    }
  }

  if (filledCount < charCount) {
    // 当前字转渐变态
    updateFillingChar(container, filledCount, positionMs, lines, lineIndex, charCount, charDurationMs, durationMs);
  } else {
    // 行唱完：最后一个字也转为纯色
    const lastSpan = container.children[charCount - 1] as HTMLElement;
    lastSpan.classList.remove('filling');
    lastSpan.style.removeProperty('--lyric-char-progress');
  }

  cache.filledCount = filledCount;
}

function updateFillingChar(
  container: HTMLElement,
  charIndex: number,
  positionMs: number,
  lines: ReturnType<typeof parseLrc>,
  lineIndex: number,
  charCount: number,
  charDurationMs: number,
  durationMs: number
) {
  const span = container.children[charIndex] as HTMLElement;
  span.classList.remove('filled');
  span.classList.add('filling');
  const charStartMs = getLyricCharStartMs(lines, lineIndex, charIndex, charCount, durationMs);
  const charProgress = clamp((positionMs - charStartMs) / charDurationMs);
  const percent = Math.round(charProgress * 1000) / 10;
  const previousPercent = parseFloat(span.style.getPropertyValue('--lyric-char-progress'));
  // 注意：首次无值时 parseFloat 为 NaN，NaN 比较恒为 false 会导致渐变永远停在 0%（整字跳变）
  if (Number.isNaN(previousPercent) || Math.abs(percent - previousPercent) >= 0.05) {
    span.style.setProperty('--lyric-char-progress', `${percent}%`);
  }
}

function clampCharCount(value: number, max: number) {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

function isCurrentLyricsMedia(media: HTMLAudioElement | null | undefined, playbackUrl: string | null) {
  if (!media || !playbackUrl) {
    return false;
  }

  return isCurrentLyricsMediaUrl(media, normalizeMediaUrl(playbackUrl));
}

function isCurrentLyricsMediaUrl(media: HTMLAudioElement, expectedSource: string) {
  return Boolean(expectedSource) && (media.currentSrc === expectedSource || media.src === expectedSource);
}

function getMediaPositionMs(media: HTMLAudioElement) {
  return Number.isFinite(media.currentTime) ? Math.max(0, media.currentTime * 1000) : 0;
}

function normalizeMediaUrl(value: string) {
  if (!value) {
    return '';
  }

  try {
    const baseUrl = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function createPointerFromWindowEvent(event: globalThis.MouseEvent) {
  const width = Math.max(1, window.innerWidth || 1440);
  const height = Math.max(1, window.innerHeight || 900);

  return {
    x: clamp(event.clientX / width),
    y: clamp(event.clientY / height)
  };
}

function isLyricsChromePointerTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('.lyrics-toolbar, .lyrics-side-tools, .lyrics-player-bar')
  );
}

interface LyricsTransitionElements {
  backdrop: HTMLDivElement;
  panel: HTMLDivElement;
  toolbar: HTMLElement;
  sideTools: HTMLDivElement;
  stage: HTMLElement;
  coverEnter: HTMLElement;
  titleEnter: HTMLElement;
  textEnter: HTMLElement;
  linesEnter: HTMLElement;
  appVignette: HTMLDivElement;
  flight: HTMLDivElement;
  bob: HTMLDivElement;
  glow: HTMLDivElement;
  shadow: HTMLDivElement;
  edges: HTMLElement[];
  ripple: HTMLDivElement;
  displacement: SVGElement;
  sourceCover: HTMLElement | null;
  refractionTargets: HTMLElement[];
}

interface LyricsPortalGeometry {
  targetWidth: number;
  targetHeight: number;
  flightStartScale: number;
  flightStartPoint: { x: number; y: number };
  floatPoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  targetCenter: { x: number; y: number };
  rippleRadius: number;
  rippleStartRadius: number;
}

interface LyricsTransitionSessionGeometry {
  origin: LyricsTransitionOrigin;
  coverFlightTarget: CoverFlightTarget;
  portalGeometry: LyricsPortalGeometry;
}

interface LyricsEntryPhaseCallbacks {
  onHandoff: () => void;
  onUnlock: () => void;
}

interface LyricsExitPhaseCallbacks {
  onReturn: () => void;
  onRestore: () => void;
}

function resolveTransitionOrigin(origin: LyricsTransitionOrigin | null) {
  if (origin) {
    return origin;
  }

  const playerCover = document.querySelector<HTMLElement>('.song-cover-wrapper');
  const playerCoverRect = playerCover?.getBoundingClientRect();

  if (playerCoverRect && playerCoverRect.width > 0 && playerCoverRect.height > 0) {
    return toLyricsTransitionOrigin(playerCoverRect);
  }

  return createFallbackLyricsTransitionOrigin();
}

function resolveCurrentTransitionOrigin(fallbackOrigin: LyricsTransitionOrigin | null) {
  const playerCover = document.querySelector<HTMLElement>('.song-cover-wrapper');
  const playerCoverRect = playerCover?.getBoundingClientRect();

  if (playerCoverRect && playerCoverRect.width > 0 && playerCoverRect.height > 0) {
    return toLyricsTransitionOrigin(playerCoverRect);
  }

  return resolveTransitionOrigin(fallbackOrigin);
}

function measureNeutralArtworkRect(
  stage: HTMLElement,
  artwork: HTMLElement,
  frozenPointer: LyricsDepthPointer
) {
  applyDepthStyle(stage, centerPointer);
  try {
    return toLyricsTransitionOrigin(artwork.getBoundingClientRect());
  } finally {
    // Both style writes happen in the same task, before Chromium can paint the neutral pose.
    applyDepthStyle(stage, frozenPointer);
  }
}

function prepareTransitionLayers(elements: LyricsTransitionElements, origin: LyricsTransitionOrigin) {
  gsap.set(elements.appVignette, { autoAlpha: 0, '--app-blur': '0px' });
  gsap.set(elements.flight, {
    // Flight coordinates are viewport-relative; keep the fixed layer at the viewport origin.
    left: 0,
    top: 0,
    width: origin.width,
    height: origin.height,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    rotationX: 0,
    rotationY: 0,
    autoAlpha: 0
  });
  gsap.set(elements.bob, {
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    rotation: 0,
    rotationX: 0,
    rotationY: 0,
    filter: 'blur(0px)'
  });
  gsap.set(elements.glow, { autoAlpha: 0, scale: 0.82 });
  gsap.set(elements.shadow, { autoAlpha: 0, scale: 0.72 });
  gsap.set(elements.edges, { autoAlpha: 0, rotationX: 0, rotationY: 0, z: 0, filter: 'brightness(1)' });
  gsap.set(elements.ripple, {
    autoAlpha: 0,
    '--ripple-x': '50%',
    '--ripple-y': '50%',
    '--ripple-radius': '180px'
  });
  gsap.set(elements.refractionTargets, { filter: 'none' });
  gsap.set(elements.displacement, { attr: { scale: 0 } });
}

function cleanupTransitionLayers(elements: LyricsTransitionElements) {
  gsap.set(
    [
      elements.appVignette,
      elements.flight,
      elements.glow,
      elements.shadow,
      elements.ripple,
      ...elements.edges
    ],
    {
      autoAlpha: 0,
      clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,skewX,filter,clipPath'
    }
  );
  gsap.set(elements.refractionTargets, { filter: 'none' });
  gsap.set(elements.displacement, { attr: { scale: 0 } });
  restoreTransitionSourceCover(elements.sourceCover);
}

function restoreTransitionSourceCover(sourceCover: HTMLElement | null) {
  if (sourceCover) {
    gsap.set(sourceCover, { clearProps: 'opacity,visibility' });
  }
}

function restoreInteractiveLyricsLayers(elements: LyricsTransitionElements) {
  gsap.set([elements.panel, elements.stage], {
    clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,opacity,visibility'
  });
  gsap.set([elements.coverEnter, elements.titleEnter, elements.textEnter, elements.linesEnter], {
    clearProps: 'transform,translate,rotate,scale,x,y,z,rotation,rotationX,rotationY,opacity,visibility,--lyrics-target-aura-opacity'
  });
  gsap.set([elements.toolbar, elements.sideTools], {
    clearProps: 'transform,translate,rotate,scale,x,y,z,opacity,visibility,filter'
  });
  cleanupTransitionLayers(elements);
  applyDepthStyle(elements.stage, centerPointer);
}

function createLyricsPortalGeometry(origin: LyricsTransitionOrigin, target: CoverFlightTarget): LyricsPortalGeometry {
  const targetWidth = Math.max(1, origin.width * Math.max(0.01, target.coverScaleX));
  const targetHeight = Math.max(1, origin.height * Math.max(0.01, target.coverScaleY));
  const flightStartScale = origin.width / targetWidth;
  const flightStartPoint = {
    x: origin.left + origin.width / 2 - targetWidth / 2,
    y: origin.top + origin.height / 2 - targetHeight / 2
  };
  const targetPoint = {
    x: flightStartPoint.x + target.coverX,
    y: flightStartPoint.y + target.coverY
  };
  const targetCenter = {
    x: targetPoint.x + targetWidth / 2,
    y: targetPoint.y + targetHeight / 2
  };
  const viewportWidth = Math.max(1, window.innerWidth || 1440);
  const viewportHeight = Math.max(1, window.innerHeight || 900);

  return {
    targetWidth,
    targetHeight,
    flightStartScale,
    flightStartPoint,
    floatPoint: { x: flightStartPoint.x + 10, y: flightStartPoint.y - 26 },
    targetPoint,
    targetCenter,
    rippleRadius:
      Math.hypot(
        Math.max(targetCenter.x, viewportWidth - targetCenter.x),
        Math.max(targetCenter.y, viewportHeight - targetCenter.y)
      ) + 96,
    rippleStartRadius: Math.max(targetWidth, targetHeight) * 0.58
  };
}

function stopTransitionHoverLoops(
  hoverRef: { current: gsap.core.Timeline | null },
  glowRef: { current: gsap.core.Timeline | null }
) {
  hoverRef.current?.kill();
  glowRef.current?.kill();
  hoverRef.current = null;
  glowRef.current = null;
}

function playReducedMotionEntry(
  timeline: gsap.core.Timeline,
  elements: LyricsTransitionElements,
  callbacks: LyricsEntryPhaseCallbacks
) {
  const duration = getLyricsTransitionDuration('enter', true) / 1000;

  timeline
    .set([
      elements.stage,
      elements.coverEnter,
      elements.titleEnter,
      elements.textEnter,
      elements.linesEnter,
      elements.toolbar,
      elements.sideTools
    ], { autoAlpha: 0 })
    .set(elements.panel, { yPercent: 0 })
    .call(callbacks.onHandoff, [], 0)
    .call(callbacks.onUnlock, [], 0.01)
    .fromTo(elements.panel, { autoAlpha: 0 }, { autoAlpha: 1, duration }, 0)
    .to([
      elements.stage,
      elements.coverEnter,
      elements.titleEnter,
      elements.textEnter,
      elements.linesEnter,
      elements.toolbar,
      elements.sideTools
    ], { autoAlpha: 1, duration }, 0);
}

function playReducedMotionExit(
  timeline: gsap.core.Timeline,
  elements: LyricsTransitionElements,
  callbacks: LyricsExitPhaseCallbacks
) {
  const duration = getLyricsTransitionDuration('exit', true) / 1000;

  timeline
    .to([elements.stage, elements.panel], { autoAlpha: 0, yPercent: 0, duration, ease: 'power1.in' }, 0)
    .call(callbacks.onReturn, [], duration * 0.5)
    .call(callbacks.onRestore, [], duration)
    .to(elements.appVignette, { autoAlpha: 0, duration: 0.12 }, duration);
}

/**
 * 新版歌词页转场：简单的整页推拉。
 * 面板连同全部内容从底部推入 / 推出，内容本身不做二次动画，
 * 避免封面等元素在过渡中出现先隐藏再浮现的跳变。
 */
function playSimpleSlideEntry(
  timeline: gsap.core.Timeline,
  elements: LyricsTransitionElements,
  callbacks: LyricsEntryPhaseCallbacks
) {
  const duration = getLyricsTransitionDuration('enter', false) / 1000;

  timeline
    .set(elements.panel, { autoAlpha: 1, yPercent: 100 }, 0)
    .call(callbacks.onHandoff, [], 0)
    .to(elements.panel, { yPercent: 0, duration, ease: 'power3.out' }, 0)
    .call(callbacks.onUnlock, [], duration * 0.55);
}

/** 与进入对应的推拉退出：面板整体推回底部。 */
function playSimpleSlideExit(
  timeline: gsap.core.Timeline,
  elements: LyricsTransitionElements,
  callbacks: LyricsExitPhaseCallbacks
) {
  const duration = getLyricsTransitionDuration('exit', false) / 1000;

  timeline
    .to(elements.panel, { yPercent: 100, duration, ease: 'power3.inOut' }, 0)
    .call(callbacks.onReturn, [], duration * 0.5)
    .call(callbacks.onRestore, [], Math.max(duration - 0.04, duration * 0.9));
}

function createDepthStyle(pointer: typeof centerPointer): DepthStyle {
  const x = pointer.x - 0.5;
  const y = pointer.y - 0.5;
  const distance = Math.min(Math.hypot(x, y), 0.72);

  return {
    '--pointer-x': formatPointer(pointer.x),
    '--pointer-y': formatPointer(pointer.y),
    '--stage-tilt-x': `${formatPointer(y * -22)}deg`,
    '--stage-tilt-y': `${formatPointer(x * 26)}deg`,
    '--bg-shift-x': `${formatPointer(x * -82)}px`,
    '--bg-shift-y': `${formatPointer(y * -68)}px`,
    '--bg-tilt-x': `${formatPointer(y * 7)}deg`,
    '--bg-tilt-y': `${formatPointer(x * -9)}deg`,
    '--background-scale': formatPointer(1.18 + distance * 0.04),
    '--cover-shift-x': `${formatPointer(x * 128)}px`,
    '--cover-shift-y': `${formatPointer(y * 90)}px`,
    '--cover-tilt-x': `${formatPointer(y * -24)}deg`,
    '--cover-tilt-y': `${formatPointer(x * 34)}deg`,
    '--cover-scale': formatPointer(1 + distance * 0.045),
    '--immersive-cover-shift-x': `${formatPointer(x * 84)}px`,
    '--immersive-cover-shift-y': `${formatPointer(y * 62)}px`,
    '--immersive-cover-tilt-x': `${formatPointer(y * -17)}deg`,
    '--immersive-cover-tilt-y': `${formatPointer(x * 23)}deg`,
    '--title-shift-x': `${formatPointer(x * 48)}px`,
    '--title-shift-y': `${formatPointer(y * 32)}px`,
    '--title-tilt-x': `${formatPointer(y * -5)}deg`,
    '--title-tilt-y': `${formatPointer(x * -7)}deg`,
    '--lyric-shift-x': `${formatPointer(x * 74)}px`,
    '--lyric-shift-y': `${formatPointer(y * 48)}px`,
    '--lyric-tilt-x': `${formatPointer(y * -7)}deg`,
    '--lyric-tilt-y': `${formatPointer(x * -10)}deg`,
    '--text-shift-x': `${formatPointer(x * 58)}px`,
    '--text-shift-y': `${formatPointer(y * 42)}px`,
    '--text-tilt-x': `${formatPointer(y * -6)}deg`,
    '--text-tilt-y': `${formatPointer(x * -8)}deg`,
    '--immersive-text-shift-x': `${formatPointer(x * 30)}px`,
    '--immersive-text-shift-y': `${formatPointer(y * 26)}px`,
    '--immersive-text-tilt-x': `${formatPointer(y * -4)}deg`,
    '--immersive-text-tilt-y': `${formatPointer(x * -5.5)}deg`
  };
}

function applyDepthStyle(element: HTMLElement | null, pointer: typeof centerPointer) {
  if (!element) {
    return;
  }

  const depthStyle = createDepthStyle(pointer);
  Object.entries(depthStyle).forEach(([name, value]) => {
    if (element.style.getPropertyValue(name) !== value) {
      element.style.setProperty(name, value);
    }
  });
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerpPointer(current: typeof centerPointer, target: typeof centerPointer, amount: number) {
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount
  };
}

export function createCenterReturnPointer(startPointer: typeof centerPointer, elapsedMs: number, durationMs = centerReturnDurationMs) {
  const progress = clamp(elapsedMs / Math.max(1, durationMs));
  return lerpPointer(startPointer, centerPointer, easeInOutCubic(progress));
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getPointerDistance(current: typeof centerPointer, target: typeof centerPointer) {
  return Math.hypot(current.x - target.x, current.y - target.y);
}

function createCoverImage(coverUrl?: string): string {
  return coverUrl ? `url("${coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))';
}

function formatPointer(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

