import { useEffect, type RefObject } from 'react';

/**
 * 滚动渐入：监听主滚动容器内带有 [data-reveal] 的结构块，
 * 元素进入视口时添加 .revealed 类，触发"逐渐浮现"动画。
 * 同一元素只触发一次；新挂载的节点由 MutationObserver 自动接管。
 *
 * 注意：MutationObserver 回调只负责观察新增节点，不重建 IntersectionObserver，
 * 避免频繁 disconnect/reconnect 导致 IO 永远无法提交首次回调（元素始终无法浮现）。
 */
export function useScrollReveals(scrollRoot: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;

    const reduced =
      document.documentElement.dataset.reduceEffects === 'true' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // 即使在减少动画模式下，也要确保内容可见
    if (reduced) {
      // 直接为所有 data-reveal 元素添加 revealed 类
      root.querySelectorAll<HTMLElement>('[data-reveal]:not(.revealed)').forEach((el) => {
        el.classList.add('revealed');
      });
      return;
    }

    const revealed = new WeakSet<Element>();

    const BATCH_STEP_MS = 220;
    const MAX_BATCH_DELAY_MS = 1200;

    // 创建并持有唯一的 IntersectionObserver
    const io = new IntersectionObserver(
      (entries) => {
        const batch: HTMLElement[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          if (revealed.has(el)) continue;
          revealed.add(el);
          io.unobserve(el);
          batch.push(el);
        }
        batch.sort((a, b) => {
          const aOrder = Number(a.dataset.revealOrder ?? 0);
          const bOrder = Number(b.dataset.revealOrder ?? 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          const aIndex = Number(a.dataset.revealIndex ?? 0);
          const bIndex = Number(b.dataset.revealIndex ?? 0);
          if (aIndex !== bIndex) return aIndex - bIndex;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        batch.forEach((el, position) => {
          const delay = Math.min(position * BATCH_STEP_MS, MAX_BATCH_DELAY_MS);
          if (delay > 0) {
            el.style.transitionDelay = `${delay}ms`;
            const cleanup = () => {
              el.style.transitionDelay = '';
              el.removeEventListener('transitionend', cleanup);
            };
            el.addEventListener('transitionend', cleanup, { once: true });
          }
          el.classList.add('revealed');
        });
      },
      { root, rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
    );

    // 观察所有已存在的 [data-reveal] 元素
    const observeAll = () => {
      root.querySelectorAll<HTMLElement>('[data-reveal]:not(.revealed)').forEach((el) => io.observe(el));
    };
    observeAll();

    // MutationObserver 只负责观察新增节点，不重建 IO
    const mo = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches?.('[data-reveal]:not(.revealed)')) {
            io.observe(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll<HTMLElement>('[data-reveal]:not(.revealed)').forEach((el) => io.observe(el));
          }
        }
      }
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [scrollRoot]);
}