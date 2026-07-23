import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineSegments } from 'three/src/objects/LineSegments.js';
import { Mesh } from 'three/src/objects/Mesh.js';
import { Points } from 'three/src/objects/Points.js';
import { type Scene } from 'three/src/scenes/Scene.js';
import { createAmbientScene } from './threeScene';
import { getVisualTheme } from './visualThemes';

describe('createAmbientScene', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Three source module imports to keep the visual chunk tree-shakeable', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/visual/threeScene.ts'), 'utf8');

    expect(source).not.toContain("import * as THREE from 'three'");
    expect(source).not.toContain("from 'three'");
    expect(source).toContain("from 'three/src/renderers/WebGLRenderer.js'");
  });

  it('does not start WebGL rendering in low performance mode', () => {
    const canvas = document.createElement('canvas');
    const scene = createAmbientScene(canvas, {
      theme: getVisualTheme('white'),
      settings: {
        enableGlobal3D: false,
        enableParticles: false,
        enableCardDepth: false,
        enablePlaybackStage: true,
        particleCount: 96,
        pixelRatioCap: 1
      }
    });

    scene.start();

    expect(scene.isRunning()).toBe(false);
    expect(canvas.dataset.visualMode).toBe('disabled');
  });

  it('creates one unified spatial backdrop without sidebar-only render layers', () => {
    const canvas = document.createElement('canvas');
    let renderableLayerCount = 0;
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn((renderedScene: Scene) => {
        renderableLayerCount = 0;
        renderedScene.traverse((object) => {
          if (object instanceof Mesh || object instanceof Points || object instanceof LineSegments) {
            renderableLayerCount += 1;
          }
        });
      }),
      dispose: vi.fn()
    };
    const scene = createAmbientScene(canvas, {
      theme: getVisualTheme('black'),
      settings: {
        enableGlobal3D: true,
        enableParticles: true,
        enableCardDepth: true,
        enablePlaybackStage: true,
        particleCount: 48,
        pixelRatioCap: 1
      },
      createRenderer: () => renderer
    });

    scene.start();

    expect(canvas.dataset.visualMode).toBe('three');
    expect(renderableLayerCount).toBeGreaterThanOrEqual(7);
    expect(renderableLayerCount).toBeLessThanOrEqual(8);
  });

  it('disposes without throwing when called more than once', () => {
    const canvas = document.createElement('canvas');
    const scene = createAmbientScene(canvas, {
      theme: getVisualTheme('white'),
      settings: {
        enableGlobal3D: true,
        enableParticles: true,
        enableCardDepth: true,
        enablePlaybackStage: true,
        particleCount: 12,
        pixelRatioCap: 1
      },
      createRenderer: () => ({
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn()
      })
    });

    scene.start();
    scene.dispose();
    scene.dispose();

    expect(scene.isRunning()).toBe(false);
  });

  it('does not reallocate the WebGL drawing buffer on every animation frame', () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const canvas = document.createElement('canvas');
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn()
    };
    const scene = createAmbientScene(canvas, {
      theme: getVisualTheme('black'),
      settings: {
        enableGlobal3D: true,
        enableParticles: true,
        enableCardDepth: true,
        enablePlaybackStage: true,
        particleCount: 24,
        pixelRatioCap: 1
      },
      createRenderer: () => renderer
    });

    scene.start();
    const initialSetSizeCalls = renderer.setSize.mock.calls.length;
    expect(initialSetSizeCalls).toBe(1);

    expect(rafCallback).toBeTypeOf('function');
    const frame = rafCallback as unknown as FrameRequestCallback;
    frame(16);
    frame(32);
    frame(48);

    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(renderer.setSize).toHaveBeenCalledTimes(initialSetSizeCalls);

    scene.dispose();
  });
});
