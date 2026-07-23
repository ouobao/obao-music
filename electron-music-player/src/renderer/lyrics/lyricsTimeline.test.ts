import { describe, expect, it } from 'vitest';
import {
  findActiveLyricLine,
  getLyricLineProgress,
  maxLyricsInputBytes,
  maxLyricsLineCount,
  maxLyricTimestampMs,
  maxTimestampsPerLyricLine,
  parseLrc,
  validateLyricsInput
} from './lyricsTimeline';

describe('parseLrc', () => {
  it('parses timestamped lyric lines in milliseconds', () => {
    const lines = parseLrc('[00:01.20]第一句\n[01:02.345]第二句');

    expect(lines).toEqual([
      { startMs: 1200, text: '第一句' },
      { startMs: 62345, text: '第二句' }
    ]);
  });

  it('parses QQ colon-fraction timestamps', () => {
    const lines = parseLrc('[00:01:23]QQ 歌词');

    expect(lines).toEqual([{ startMs: 1230, text: 'QQ 歌词' }]);
  });

  it('ignores metadata and empty lines', () => {
    const lines = parseLrc('[ar:Mine Radio]\n\n[00:02.00]有效歌词');

    expect(lines).toEqual([{ startMs: 2000, text: '有效歌词' }]);
  });

  it('ignores timestamp-only rows so blank lyric entries are not centered', () => {
    const lines = parseLrc('[00:00.00]\n[00:05.00]第一句\n[00:12.00]   \n[00:18.00]第二句');

    expect(lines).toEqual([
      { startMs: 5000, text: '第一句' },
      { startMs: 18000, text: '第二句' }
    ]);
  });

  it('rejects lyric input that exceeds the byte or line budget before splitting it', () => {
    const oversized = `${'a'.repeat(maxLyricsInputBytes - 2)}你好`;
    const tooManyLines = Array.from({ length: maxLyricsLineCount + 1 }, (_, index) => `[00:00]line ${index}`).join('\n');

    expect(validateLyricsInput(oversized)).toBe('歌词内容超过 512 KiB');
    expect(parseLrc(oversized)).toEqual([]);
    expect(validateLyricsInput(tooManyLines)).toBe('歌词行数超过 5000 行');
    expect(parseLrc(tooManyLines)).toEqual([]);
  });

  it('rejects excessive timestamps and unsafe timestamp values', () => {
    const tooManyTimestamps = Array.from(
      { length: maxTimestampsPerLyricLine + 1 },
      (_, index) => `[00:${String(index).padStart(2, '0')}]`
    ).join('') + 'line';

    expect(validateLyricsInput(tooManyTimestamps)).toBe('单行时间戳数量超过 8 个');
    expect(parseLrc(tooManyTimestamps)).toEqual([]);
    expect(validateLyricsInput('[00:60.00]invalid seconds')).toBe('歌词时间戳无效');
    expect(validateLyricsInput(`[${Math.floor(maxLyricTimestampMs / 60_000)}:00.001]out of range`)).toBe('歌词时间戳无效');
    expect(validateLyricsInput('[00:1]malformed seconds')).toBe('歌词时间戳无效');
    expect(validateLyricsInput('[00:00.1234]malformed fraction')).toBe('歌词时间戳无效');
    expect(parseLrc('[00:60.00]invalid seconds')).toEqual([]);
  });
});

describe('findActiveLyricLine', () => {
  const lines = parseLrc('[00:00.00]前奏\n[00:10.00]主歌\n[00:20.00]副歌');

  it('returns the current line index by playback position', () => {
    expect(findActiveLyricLine(lines, 0)).toBe(0);
    expect(findActiveLyricLine(lines, 12000)).toBe(1);
    expect(findActiveLyricLine(lines, 26000)).toBe(2);
  });

  it('returns -1 before the first lyric line', () => {
    expect(findActiveLyricLine(lines, -100)).toBe(-1);
  });

  it('applies positive and negative lyric offsets', () => {
    expect(findActiveLyricLine(lines, 9500, 1000)).toBe(1);
    expect(findActiveLyricLine(lines, 10500, -1000)).toBe(0);
  });
});

describe('getLyricLineProgress', () => {
  const lines = parseLrc('[00:00.00]intro\n[00:10.00]verse\n[00:20.00]chorus');

  it('returns the active line progress between its start time and the next line', () => {
    expect(getLyricLineProgress(lines, 1, 15000)).toBe(0.5);
  });

  it('clamps progress before and after the active lyric window', () => {
    expect(getLyricLineProgress(lines, 1, 9000)).toBe(0);
    expect(getLyricLineProgress(lines, 1, 22000)).toBe(1);
  });

  it('uses the song duration for the last lyric line', () => {
    expect(getLyricLineProgress(lines, 2, 25000, 30000)).toBe(0.5);
  });

  it('returns full progress for an invalid active line', () => {
    expect(getLyricLineProgress(lines, -1, 15000)).toBe(1);
  });
});
