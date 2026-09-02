import type { LyricLine } from '../../shared/musicTypes';

const timestampPattern = /\[(\d{2,}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const timestampCandidatePattern = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
export const maxLyricsInputBytes = 512 * 1024;
export const maxLyricsLineCount = 5_000;
export const maxTimestampsPerLyricLine = 8;
export const maxLyricTimestampMs = 24 * 60 * 60 * 1000;

const invalidLyricsInputMessage = '歌词时间戳无效';

export function parseLrc(input: string): LyricLine[] {
  if (validateLyricsInput(input)) {
    return [];
  }

  return input
    .split(/\r?\n/)
    .flatMap((rawLine) => {
      const matches = [...rawLine.matchAll(timestampPattern)];
      if (matches.length === 0) {
        return [];
      }

      const text = rawLine.replace(timestampPattern, '').trim();
      if (!text) {
        return [];
      }

      return matches.flatMap((match) => {
        const startMs = toMilliseconds(match[1], match[2], match[3]);
        return startMs === null ? [] : [{ startMs, text }];
      });
    })
    .sort((left, right) => left.startMs - right.startMs);
}

/** Returns a recoverable error message, or null when the lyric input is safe to parse. */
export function validateLyricsInput(input: string): string | null {
  if (new TextEncoder().encode(input).byteLength > maxLyricsInputBytes) {
    return '歌词内容超过 512 KiB';
  }

  const lines = input.split(/\r?\n/);
  if (lines.length > maxLyricsLineCount) {
    return '歌词行数超过 5000 行';
  }

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(timestampCandidatePattern)];
    if (matches.length > maxTimestampsPerLyricLine) {
      return '单行时间戳数量超过 8 个';
    }

    for (const match of matches) {
      if (
        match[1].length < 2
        || match[2].length !== 2
        || (match[3] && match[3].length > 3)
        || toMilliseconds(match[1], match[2], match[3]) === null
      ) {
        return invalidLyricsInputMessage;
      }
    }
  }

  return null;
}

export function findActiveLyricLine(
  lines: LyricLine[],
  positionMs: number,
  offsetMs = 0
): number {
  const targetMs = positionMs + offsetMs;
  let low = 0;
  let high = lines.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].startMs <= targetMs) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return activeIndex;
}

export function getLyricLineProgress(
  lines: LyricLine[],
  activeIndex: number,
  positionMs: number,
  durationMs = 0,
  offsetMs = 0
): number {
  const activeLine = lines[activeIndex];

  if (!activeLine) {
    return 1;
  }

  const targetMs = positionMs + offsetMs;
  const nextLineStartMs = lines[activeIndex + 1]?.startMs;
  const endMs = nextLineStartMs ?? durationMs;
  const safeEndMs = endMs > activeLine.startMs ? endMs : activeLine.startMs + 4000;

  return clampProgress((targetMs - activeLine.startMs) / (safeEndMs - activeLine.startMs));
}

/**
 * 行内第 charIndex 个字符的开始时间。时间窗口与 getLyricLineProgress 完全一致：
 * 行内字符时长均分 (下一个行 start 或 duration - 当前行 start)。
 */
export function getLyricCharStartMs(
  lines: LyricLine[],
  activeIndex: number,
  charIndex: number,
  charCount: number,
  durationMs = 0
): number {
  const activeLine = lines[activeIndex];

  if (!activeLine || charCount <= 0) {
    return activeLine?.startMs ?? 0;
  }

  const nextLineStartMs = lines[activeIndex + 1]?.startMs;
  const endMs = nextLineStartMs ?? durationMs;
  const safeEndMs = endMs > activeLine.startMs ? endMs : activeLine.startMs + 4000;

  return activeLine.startMs + ((safeEndMs - activeLine.startMs) * charIndex) / charCount;
}

function toMilliseconds(minutes: string, seconds: string, fraction = '0'): number | null {
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  if (!Number.isSafeInteger(minuteValue) || secondValue < 0 || secondValue > 59) {
    return null;
  }

  const normalizedFraction = fraction.padEnd(3, '0').slice(0, 3);
  const timestampMs = minuteValue * 60_000 + secondValue * 1000 + Number(normalizedFraction);
  return Number.isSafeInteger(timestampMs) && timestampMs <= maxLyricTimestampMs ? timestampMs : null;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
