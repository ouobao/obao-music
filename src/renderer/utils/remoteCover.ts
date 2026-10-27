/**
 * 缩略图展示位降采样：网易云 p1.music.126.net 原图 URL 追加 ?param=WxH，
 * 避免小尺寸列表缩略图拉取原图大图（解码/带宽开销）。
 * 已带 thumbnail/param 尺寸参数或非网易云 URL 原样返回。
 */
export function toThumbnailUrl(coverUrl: string, size = 300): string {
  if (!/^https:\/\/p1\.music\.126\.net\//i.test(coverUrl)) {
    return coverUrl;
  }
  if (/[?&](?:thumbnail|param)=/i.test(coverUrl)) {
    return coverUrl;
  }
  return `${coverUrl}${coverUrl.includes('?') ? '&' : '?'}param=${size}y${size}`;
}
