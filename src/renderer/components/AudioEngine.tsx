import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';

const SOURCE_STUCK_TIMEOUT_MS = 6000;
const WATCHDOG_INTERVAL_MS = 1000;

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

    audio.volume = usePlayerStore.getState().volume / 100;

    // 媒体代次：每次“装载新源 / 停止”都 +1，比 URL 引用更可靠地识别过期事件
    let mediaGeneration = 0;
    let sourceAppliedAt = 0;

    const tryPlay = (generation: number) => {
      const state = usePlayerStore.getState();
      if (!state.isPlaying || !state.currentPlaybackUrl) return;
      const playPromise = audio.play();
      if (!playPromise) return;
      // 加载被下一次切歌打断（AbortError）或自动播放被拒，忽略
      playPromise.catch(() => {});
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
      if (state.playbackSeekRevision !== prev.playbackSeekRevision) {
        const target = state.playbackPositionMs / 1000;
        if (Math.abs(audio.currentTime - target) > 0.5) {
          audio.currentTime = target;
        }
      }
    });

    const handleTimeUpdate = () => {
      const positionMs = audio.currentTime * 1000;
      usePlayerStore.getState().setPlaybackProgress(positionMs, audio.duration ? audio.duration * 1000 : undefined);
    };

    const handleEnded = () => {
      usePlayerStore.getState().handlePlaybackEnded();
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
      if (!audio.paused) return;
      if (Date.now() - sourceAppliedAt < SOURCE_STUCK_TIMEOUT_MS) return;
      setElementKey((key) => key + 1);
    }, WATCHDOG_INTERVAL_MS);

    // 元素重建（看门狗自愈）或应用启动时恢复当前播放
    const restored = usePlayerStore.getState();
    if (restored.currentPlaybackUrl) {
      loadSourceOnFreshElement(restored.currentPlaybackUrl);
    }

    return () => {
      mediaGeneration += 1;
      window.clearInterval(watchdogId);
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
    };
  }, [elementKey]);

  return <audio key={elementKey} ref={audioRef} preload="auto" style={{ display: 'none' }} />;
}