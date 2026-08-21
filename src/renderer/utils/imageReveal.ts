import type { SyntheticEvent } from 'react';

/**
 * 图片加载完成/失败后触发虚化淡入填充（配合 CSS .img-loaded 过渡）
 */
export function onImageReveal(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.classList.add('img-loaded');
}

/**
 * ref 回调：挂载时若图片已完成加载（HTTP/内存缓存命中时，解码可能在
 * React 绑定 onLoad 之前就结束），onLoad 永远不会触发，图片会永久停留
 * 在 opacity:0 的占位态 —— 表现为“所有封面都不显示”。
 * 因此在 ref 挂载点补一次 complete 检查，双保险。
 */
export function imageRevealRef(el: HTMLImageElement | null) {
  if (!el) return;
  if (el.complete) {
    el.classList.add('img-loaded');
  }
}
