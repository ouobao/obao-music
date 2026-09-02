import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';

const SOURCE_STUCK_TIMEOUT_MS = 6000;
const WATCHDOG_INTERVAL_MS = 1000;
/** 频繁拖动进度条时，seek 的节流间隔（避免高频 currentTime 赋值压垮媒体管线） */
const SEEK_THROTTLE_MS = 120;
/** seek 挂起判定阈值：seeking 状态持续超过该时长 → 重建元素 */
const SEEK_STUCK_TIMEOUT_MS = 4000;
/** "假播放"饿死判定阈值：元素未暂停但 currentTime 停滞超过该时长 → 重建元素 */
const PLAYBACK_STALL_TIMEOUT_MS = 8000;

/**
 * 音频引擎：负责把 store 中的播放状态落到 <audio> 元素上。
 *
 * 快速切歌可靠性（针对 Chromium 媒体管线的两个已知缺陷）：
 * - 同一 <audio> 元素上连续快速 load() 可能让媒体管线卡死在 NETWORK_LOADING，
 *   canplay 永不触发、readyState 停留在 0/1；此后该元素的所有操作都无效，
 *   直到重启应用。因此【每次切换播放源都重建 <audio> 元素】（elementKey 递增），
 *   每个源永远使用全新的媒体元素，从根上规避这个缺陷。
 * - 在 readyState < 2（数据未就绪）时【绝不】调用 play()。Chromium 中若在元素
 *   还是 HAVE_NOTHING 时就 play()，且加载被下一次切歌打断，该 play() 的 promise
 *   会永远 pending，后续 play() 都返回同一个 pending promise。
 * - 看门狗：装载播放源后一段时间仍未真正出声（无论卡在“未就绪”还是“已就绪但
 *   play() 卡死”），判定媒体管线卡死 → 重建元素自愈。配合主进程音频请求的
 *   响应头超时（防止 CDN 会话挂起导致永久加载中），彻底解决“频繁切歌后永久
 *   无法播放”。
 */
export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elementKey, setElementKey] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 注册到 store 供歌词 rAF 时钟直接采样 currentTime（元素重建时旧 cleanup 先跑、新 effect 后跑）
    usePlayerStore.setState({ mediaElement: audio });

    audio.volume = usePlayerStore.getState().volume / 100;

    // 媒体代次：每次“装载新源 / 停止”都 +1，比 URL 引用更可靠地识别过期事件
    let mediaGeneration = 0;
    let sourceAppliedAt = 0;
    let seekThrottleTimerId = 0;
    let scheduledSeekTargetMs = -1;
    let seekingStartedAtMs = 0;

    const tryPlay = (generation: number) => {
      const state = usePlayerStore.getState();
      if (!state.isPlaying || !state.currentPlaybackUrl) return;
      const playPromise = audio.play();
      if (!playPromise) return;
      // 加载被下一次切歌打断（AbortError）属正常；其他拒绝（如管线异常）记录便于诊断
      playPromise.catch((error: unknown) => {
        if ((error as DOMException)?.name === 'AbortError') return;
        console.warn('[audio] play() 被拒绝:', (error as DOMException)?.name, error);
      });
    };

    const loadSourceOnFreshElement = (url: string) => {
      const generation = ++mediaGeneration;
      sourceAppliedAt = Date.now();
      try {
        audio.removeAttribute('src');
      } catch {
        // ignore
      }
      audio.src = url;
      audio.load();
      const state = usePlayerStore.getState();
      if (state.isPlaying && audio.readyState >= 2) {
        tryPlay(generation);
      }
      // readyState < 2 时依赖 canplay 事件触发播放
    };

    const unsubscribeUrl = usePlayerStore.subscribe((state, prev) => {
      if (state.currentPlaybackUrl === prev.currentPlaybackUrl) return;
      // 无论 URL 有值还是变 null，都重建元素以确保全新的媒体管线。
      // 不可在旧元素上 removeAttribute + load()，否则连续快速切歌时
      // Chromium 媒体管线会卡死在 NETWORK_LOADING，canplay 永不触发。
      setElementKey((key) => key + 1);
    });

    const unsubscribePlaying = usePlayerStore.subscribe((state, prev) => {
      if (state.isPlaying === prev.isPlaying) return;
      if (state.isPlaying) {
        if (state.currentPlaybackUrl && audio.readyState >= 2) {
          tryPlay(mediaGeneration);
        }
        // url 为空或仍在加载：canplay 处理器负责播放
      } else {
        audio.pause();
      }
    });

    const unsubscribeVolume = usePlayerStore.subscribe((state, prev) => {
      if (state.volume !== prev.volume) {
        audio.volume = state.volume / 100;
      }
    });

    const unsubscribeSeek = usePlayerStore.subscribe((state, prev) => {
      if (state.playbackSeekRevision === prev.playbackSeekRevision) return;
      const target = state.playbackPositionMs / 1000;
      if (!Number.isFinite(target) || target < 0) return;
      if (Math.abs(audio.currentTime - target) < 0.3) return;
      scheduledSeekTargetMs = target * 1000;
      // 节流：高频拖动进度条时合并为每 SEEK_THROTTLE_MS 一次实际 seek，
      // 避免连续 currentTime 赋值压垮 Chromium 媒体管线（管线 seek 队列爆炸死锁）
      if (seekThrottleTimerId) return;
      seekThrottleTimerId = window.setTimeout(() => {
        seekThrottleTimerId = 0;
        // 元数据未就绪时不丢弃 seek：保留 pending 目标，canplay 后应用，
        // 避免"加载中拖动进度条 → 位置被 timeupdate 刷回 0"
        if (audio.readyState < 1) return;
        const nextTarget = scheduledSeekTargetMs / 1000;
        scheduledSeekTargetMs = -1;
        try {
          if (Math.abs(audio.currentTime - nextTarget) >= 0.3) {
            audio.currentTime = nextTarget;
          }
        } catch {
          // ignore: 元素已在重建/卸载中
        }
      }, SEEK_THROTTLE_MS);
    });

    // canplay 后应用挂起的 seek（媒体管线就绪后一次性落到目标位置）
    const applyPendingSeek = () => {
      if (scheduledSeekTargetMs < 0 || audio.readyState < 1) return;
      const nextTarget = scheduledSeekTargetMs / 1000;
      scheduledSeekTargetMs = -1;
      try {
        if (Math.abs(audio.currentTime - nextTarget) >= 0.3) {
          audio.currentTime = nextTarget;
        }
      } catch {
        // ignore: 元素已在重建/卸载中
      }
    };

    // seek 挂起检测：seeking 状态持续过久（媒体管线死锁）→ 重建元素自愈
    const handleSeeking = () => {
      seekingStartedAtMs = Date.now();
    };
    const handleSeeked = () => {
      seekingStartedAtMs = 0;
    };

    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);

    // 最近一次 currentTime 前进的时刻：用于检测"假播放"（元素未暂停但数据饿死）
    let lastProgressAtMs = 0;
    let lastProgressPositionSec = -1;

    const handleTimeUpdate = () => {
      const positionSec = audio.currentTime;
      if (positionSec !== lastProgressPositionSec) {
        lastProgressPositionSec = positionSec;
        lastProgressAtMs = Date.now();
      }
      const positionMs = positionSec * 1000;
      usePlayerStore.getState().setPlaybackProgress(positionMs, audio.duration ? audio.duration * 1000 : undefined);
    };

    const handleEnded = () => {
      const state = usePlayerStore.getState();
      state.handlePlaybackEnded();
      // 单曲循环：ended 后元素处于暂停态，仅 seek(0) 不会恢复播放。
      // 若 store 仍在播放状态且未切歌（单曲循环保留原播放 URL），直接在本元素
      // 重新起播（play() 对 ended 元素会从开头重放），替代原先依赖看门狗
      // 1~6s 后重建元素"误打误撞"续命的方式（每次循环伴随静音与元素重建）
      const next = usePlayerStore.getState();
      if (next.isPlaying && next.currentPlaybackUrl && next.currentPlaybackUrl === state.currentPlaybackUrl) {
        tryPlay(mediaGeneration);
      }
    };

    const handleError = () => {
      const state = usePlayerStore.getState();
      // 快速切歌被 load() 打断时浏览器可能报 MEDIA_ERR_ABORTED(3)，忽略
      if (audio.error?.code === 3) return;
      // 该错误对应的 src 已不是当前播放源（期间又切了歌），忽略
      const expectedUrl = state.currentPlaybackUrl;
      if (!expectedUrl) return;
      const message = audio.error ? `播放失败 (${audio.error.code})` : '播放失败';
      state.setPlaybackError(message, expectedUrl);
    };

    const handleStalled = () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && state.playbackStatus === 'ready') {
        state.setPlaybackStatus('loading');
      }
    };

    const handleCanPlay = () => {
      applyPendingSeek();
      const state = usePlayerStore.getState();
      if (state.isPlaying && state.currentPlaybackUrl && audio.paused) {
        tryPlay(mediaGeneration);
      }
      state.setPlaybackStatus('ready');
    };

    const handlePlay = () => {
      const state = usePlayerStore.getState();
      if (!state.isPlaying) {
        state.setPlaybackStatus('ready');
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);

    // 看门狗：装载源后一直没出声（无论卡在“未就绪”还是“play() 卡死”）→ 重建元素自愈
    const watchdogId = window.setInterval(() => {
      if (sourceAppliedAt === 0) return;
      const current = usePlayerStore.getState();
      if (!current.isPlaying || !current.currentPlaybackUrl) return;
      if (audio.error) return;
      // seek 挂起：seeking 状态持续过久说明媒体管线死锁（频繁拖动进度条的已知缺陷），
      // 此时 audio.paused 可能为 false，原看门狗条件覆盖不到 → 单独检测并重建
      if (seekingStartedAtMs !== 0 && Date.now() - seekingStartedAtMs > SEEK_STUCK_TIMEOUT_MS) {
        setElementKey((key) => key + 1);
        return;
      }
      if (!audio.paused) {
        // "假播放"饿死：元素未暂停但 currentTime 长时间无前进（数据流饿死，
        // readyState 停留在 HAVE_METADATA/HAVE_CURRENT_DATA）→ 原条件
        // `if (!audio.paused) return` 会让这类元素永远绕过重建，表现为
        // UI 转圈、进度冻结但永不自愈 → 重建元素
        const anchorMs = lastProgressAtMs || sourceAppliedAt;
        if (audio.readyState < 3 && Date.now() - anchorMs > PLAYBACK_STALL_TIMEOUT_MS) {
          setElementKey((key) => key + 1);
        }
        return;
      }
      if (Date.now() - sourceAppliedAt < SOURCE_STUCK_TIMEOUT_MS) return;
      setElementKey((key) => key + 1);
    }, WATCHDOG_INTERVAL_MS);

    // 元素重建（看门狗自愈）或应用启动时恢复当前播放
    const restored = usePlayerStore.getState();
    if (restored.currentPlaybackUrl) {
      loadSourceOnFreshElement(restored.currentPlaybackUrl);
    }

    return () => {
      usePlayerStore.setState({ mediaElement: null });
      mediaGeneration += 1;
      window.clearInterval(watchdogId);
      if (seekThrottleTimerId) window.clearTimeout(seekThrottleTimerId);
      unsubscribeUrl();
      unsubscribePlaying();
      unsubscribeVolume();
      unsubscribeSeek();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      // 旧元素退场前显式停掉并断开源：React 提交新 DOM 与执行 cleanup 之间存在
      // 窗口，期间旧元素的 canplay 订阅仍可能触发发声（幽灵双声）；同时让
      // musicplayer-audio:// 协议请求被取消，主进程随之中止对应的上游流
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        // ignore
      }
    };
  }, [elementKey]);

  return <audio key={elementKey} ref={audioRef} preload="auto" style={{ display: 'none' }} />;
}