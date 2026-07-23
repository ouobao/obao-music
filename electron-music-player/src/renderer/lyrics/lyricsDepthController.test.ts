import { describe, expect, it } from 'vitest';
import {
  centerDepthPointer,
  createLyricsDepthState,
  reduceLyricsDepthState
} from './lyricsDepthController';

describe('lyrics depth controller', () => {
  it('moves from locked pointer control through centering into idle', () => {
    const locked = createLyricsDepthState(true);
    const unlocked = reduceLyricsDepthState(locked, { type: 'unlock' });
    const steered = reduceLyricsDepthState(unlocked, {
      type: 'sample',
      pointer: { x: 0.9, y: 0.1 }
    });
    const centering = reduceLyricsDepthState(steered, { type: 'request-idle' });
    const idle = reduceLyricsDepthState(centering, { type: 'centered' });

    expect(locked).toMatchObject({ mode: 'locked', target: centerDepthPointer });
    expect(unlocked.mode).toBe('pointer');
    expect(steered).toMatchObject({ mode: 'pointer', target: { x: 0.9, y: 0.1 } });
    expect(centering).toMatchObject({
      mode: 'centering',
      target: centerDepthPointer,
      resumeIdleAfterCenter: true
    });
    expect(idle).toMatchObject({ mode: 'idle', target: centerDepthPointer });
  });

  it('does not let unchanged Electron samples overwrite idle motion', () => {
    const pointer = { x: 0.72, y: 0.36 };
    const active = reduceLyricsDepthState(
      reduceLyricsDepthState(createLyricsDepthState(false), { type: 'sample', pointer }),
      { type: 'request-idle' }
    );
    const idle = reduceLyricsDepthState(active, { type: 'centered' });
    const unchanged = reduceLyricsDepthState(idle, { type: 'sample', pointer });

    expect(unchanged).toBe(idle);
    expect(unchanged.mode).toBe('idle');
  });

  it('starts center return only on the inside-to-outside edge', () => {
    const steered = reduceLyricsDepthState(createLyricsDepthState(false), {
      type: 'sample',
      pointer: { x: 1, y: 0 }
    });
    const firstLeave = reduceLyricsDepthState(steered, { type: 'leave' });
    const repeatedLeave = reduceLyricsDepthState(firstLeave, { type: 'leave' });

    expect(firstLeave).toMatchObject({
      mode: 'centering',
      pointerInside: false,
      resumeIdleAfterCenter: false
    });
    expect(repeatedLeave).toBe(firstLeave);
  });

  it('does not restart an active center return for repeated control movement', () => {
    const steered = reduceLyricsDepthState(createLyricsDepthState(false), {
      type: 'sample',
      pointer: { x: 0.84, y: 0.22 }
    });
    const firstCenter = reduceLyricsDepthState(steered, { type: 'center' });
    const repeatedCenter = reduceLyricsDepthState(firstCenter, { type: 'center' });

    expect(repeatedCenter).toBe(firstCenter);
  });

  it('wakes idle only after meaningful pointer movement', () => {
    const pointer = { x: 0.62, y: 0.48 };
    const active = reduceLyricsDepthState(createLyricsDepthState(false), { type: 'sample', pointer });
    const idle = reduceLyricsDepthState(
      reduceLyricsDepthState(active, { type: 'request-idle' }),
      { type: 'centered' }
    );
    const jitter = reduceLyricsDepthState(idle, {
      type: 'sample',
      pointer: { x: 0.621, y: 0.4795 }
    });
    const moved = reduceLyricsDepthState(idle, {
      type: 'sample',
      pointer: { x: 0.67, y: 0.43 }
    });

    expect(jitter).toBe(idle);
    expect(moved).toMatchObject({ mode: 'pointer', target: { x: 0.67, y: 0.43 } });
  });

  it('keeps reduced effects locked at center for every interaction', () => {
    const locked = createLyricsDepthState(true);
    const sampled = reduceLyricsDepthState(locked, {
      type: 'sample',
      pointer: { x: 1, y: 0 }
    });
    const idle = reduceLyricsDepthState(sampled, { type: 'request-idle' });

    expect(sampled).toBe(locked);
    expect(idle).toBe(locked);
  });
});
