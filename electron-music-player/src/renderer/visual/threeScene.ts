import { type Camera } from 'three/src/cameras/Camera.js';
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
import { AdditiveBlending, DoubleSide } from 'three/src/constants.js';
import { BufferAttribute, Float32BufferAttribute } from 'three/src/core/BufferAttribute.js';
import { BufferGeometry } from 'three/src/core/BufferGeometry.js';
import { PlaneGeometry } from 'three/src/geometries/PlaneGeometry.js';
import { TorusGeometry } from 'three/src/geometries/TorusGeometry.js';
import { LineBasicMaterial } from 'three/src/materials/LineBasicMaterial.js';
import { type Material } from 'three/src/materials/Material.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { PointsMaterial } from 'three/src/materials/PointsMaterial.js';
import { Group } from 'three/src/objects/Group.js';
import { LineSegments } from 'three/src/objects/LineSegments.js';
import { Mesh } from 'three/src/objects/Mesh.js';
import { Points } from 'three/src/objects/Points.js';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { Scene } from 'three/src/scenes/Scene.js';
import type { VisualTheme } from './visualThemes';

export interface VisualSettings {
  enableGlobal3D: boolean;
  enableParticles: boolean;
  enableCardDepth: boolean;
  enablePlaybackStage: boolean;
  particleCount: number;
  pixelRatioCap: number;
}

interface AmbientSceneOptions {
  theme: VisualTheme;
  settings: VisualSettings;
  createRenderer?: (canvas: HTMLCanvasElement) => RendererLike;
}

interface RendererLike {
  setPixelRatio: (ratio: number) => void;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  render: (scene: Scene, camera: Camera) => void;
  dispose: () => void;
}

export interface AmbientSceneController {
  start: () => void;
  stop: () => void;
  dispose: () => void;
  updateTheme: (theme: VisualTheme) => void;
  updatePerformanceMode: (settings: VisualSettings) => void;
  isRunning: () => boolean;
}

export function createAmbientScene(
  canvas: HTMLCanvasElement,
  options: AmbientSceneOptions
): AmbientSceneController {
  let theme = options.theme;
  let settings = options.settings;
  let renderer: RendererLike | null = null;
  let animationFrame = 0;
  let running = false;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  let lastClientWidth = 0;
  let lastClientHeight = 0;
  let lastRenderWidth = 0;
  let lastRenderHeight = 0;

  const scene = new Scene();
  const camera = new PerspectiveCamera(46, 1, 0.1, 120);
  camera.position.set(0, 1.2, 9.2);

  const spaceRoot = new Group();
  const planeRoot = new Group();
  const orbitRoot = new Group();
  const waveRoot = new Group();
  scene.add(spaceRoot, planeRoot, orbitRoot, waveRoot);

  const flowMaterial = new PointsMaterial({
    size: 0.02,
    color: theme.particleA,
    transparent: true,
    opacity: 0.34,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const flowField = new Points(createFlowFieldGeometry(settings.particleCount), flowMaterial);
  spaceRoot.add(flowField);

  const gridMaterial = new LineBasicMaterial({
    color: theme.canvasGlow,
    transparent: true,
    opacity: 0.06,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const depthGrid = new LineSegments(createDepthGridGeometry(), gridMaterial);
  depthGrid.rotation.x = Math.PI * 0.62;
  depthGrid.rotation.z = -0.18;
  depthGrid.position.set(-0.6, -2.55, -1.25);
  spaceRoot.add(depthGrid);

  const waveMaterial = new LineBasicMaterial({
    color: theme.particleB,
    transparent: true,
    opacity: 0.11,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const waveCorridor = new LineSegments(createWaveCorridorGeometry(), waveMaterial);
  waveCorridor.position.set(0.15, -0.15, -2.1);
  waveCorridor.rotation.set(0.1, -0.08, -0.02);
  waveRoot.add(waveCorridor);

  const beatMaterial = new LineBasicMaterial({
    color: theme.accent,
    transparent: true,
    opacity: 0.075,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const beatLanes = new LineSegments(createBeatLaneGeometry(), beatMaterial);
  beatLanes.position.set(-0.35, 0.9, -3.2);
  beatLanes.rotation.set(0.34, 0.2, -0.2);
  waveRoot.add(beatLanes);

  const planeMaterialA = new MeshBasicMaterial({
    color: theme.materialA,
    transparent: true,
    opacity: 0.12,
    side: DoubleSide,
    depthWrite: false
  });
  const planeMaterialB = new MeshBasicMaterial({
    color: theme.materialB,
    transparent: true,
    opacity: 0.1,
    side: DoubleSide,
    depthWrite: false
  });
  const planeA = createSpatialPlane(3.8, 1.2, planeMaterialA);
  planeA.position.set(-2.1, 1.1, -2.2);
  planeA.rotation.set(0.9, -0.38, -0.32);
  const planeB = createSpatialPlane(3.2, 1.05, planeMaterialB);
  planeB.position.set(2.35, -0.8, -3.4);
  planeB.rotation.set(1.1, 0.46, 0.28);
  planeRoot.add(planeA, planeB);

  const orbitMaterialA = new MeshBasicMaterial({
    color: theme.canvasGlow,
    transparent: true,
    opacity: 0.08,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const orbitMaterialB = new MeshBasicMaterial({
    color: theme.particleB,
    transparent: true,
    opacity: 0.06,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const orbitA = new Mesh(new TorusGeometry(3.1, 0.012, 12, 160), orbitMaterialA);
  orbitA.rotation.set(1.05, 0.28, -0.38);
  const orbitB = new Mesh(new TorusGeometry(4.45, 0.01, 12, 180), orbitMaterialB);
  orbitB.rotation.set(1.18, -0.34, 0.26);
  orbitRoot.add(orbitA, orbitB);
  orbitRoot.position.set(0.36, -0.34, -1.25);
  orbitRoot.scale.setScalar(0.9);

  const themedMaterials = [
    flowMaterial,
    gridMaterial,
    planeMaterialA,
    planeMaterialB,
    waveMaterial,
    beatMaterial,
    orbitMaterialA,
    orbitMaterialB
  ];

  function start() {
    if (disposed || running) {
      return;
    }

    if (!settings.enableGlobal3D || !settings.enableParticles) {
      canvas.dataset.visualMode = 'disabled';
      return;
    }

    try {
      const nextRenderer =
        options.createRenderer?.(canvas) ??
        new WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance'
        });
      renderer = nextRenderer;
      nextRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
      resize();
      window.addEventListener('resize', resize, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
      }
      running = true;
      canvas.dataset.visualMode = 'three';
      tick(0);
    } catch {
      canvas.dataset.visualMode = 'fallback';
      running = false;
    }
  }

  function stop() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    window.removeEventListener('resize', resize);
    resizeObserver?.disconnect();
    resizeObserver = null;
    running = false;
  }

  function dispose() {
    if (disposed) {
      return;
    }

    stop();
    scene.traverse((object) => {
      const mesh = object as Mesh | Points | LineSegments;
      mesh.geometry?.dispose();
    });
    themedMaterials.forEach((material) => material.dispose());
    renderer?.dispose();
    renderer = null;
    disposed = true;
  }

  function updateTheme(nextTheme: VisualTheme) {
    theme = nextTheme;
    flowMaterial.color.set(theme.particleA);
    gridMaterial.color.set(theme.canvasGlow);
    planeMaterialA.color.set(theme.materialA);
    planeMaterialB.color.set(theme.materialB);
    waveMaterial.color.set(theme.particleB);
    beatMaterial.color.set(theme.accent);
    orbitMaterialA.color.set(theme.canvasGlow);
    orbitMaterialB.color.set(theme.particleB);
  }

  function updatePerformanceMode(nextSettings: VisualSettings) {
    settings = nextSettings;
    flowField.geometry.dispose();
    flowField.geometry = createFlowFieldGeometry(settings.particleCount);

    if (!settings.enableGlobal3D || !settings.enableParticles) {
      stop();
      canvas.dataset.visualMode = 'disabled';
      return;
    }

    renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
    lastClientWidth = 0;
    lastClientHeight = 0;
    resize();
  }

  function tick(time: number) {
    if (!running || !renderer) {
      return;
    }

    const t = time * 0.001;
    spaceRoot.rotation.y = t * 0.035;
    spaceRoot.rotation.x = Math.sin(t * 0.32) * 0.035;
    flowField.rotation.z = t * 0.018;
    planeRoot.rotation.y = Math.sin(t * 0.24) * 0.12;
    planeRoot.rotation.x = Math.cos(t * 0.2) * 0.045;
    waveRoot.position.x = Math.sin(t * 0.18) * 0.18;
    waveRoot.rotation.y = Math.sin(t * 0.2) * 0.08;
    waveRoot.rotation.z = Math.cos(t * 0.14) * 0.025;
    orbitRoot.rotation.z = t * 0.026;
    orbitRoot.rotation.y = Math.sin(t * 0.2) * 0.16;
    camera.position.x = Math.sin(t * 0.16) * 0.36;
    camera.position.y = 1.1 + Math.cos(t * 0.18) * 0.18;
    camera.lookAt(0, -0.15, -0.8);
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(tick);
  }

  function resize() {
    if (!renderer) {
      return;
    }

    const clientWidth = Math.max(1, Math.floor(canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth));
    const clientHeight = Math.max(1, Math.floor(canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight));
    const renderSize = fitRenderSize(clientWidth, clientHeight);

    if (
      clientWidth === lastClientWidth &&
      clientHeight === lastClientHeight &&
      renderSize.width === lastRenderWidth &&
      renderSize.height === lastRenderHeight
    ) {
      return;
    }

    lastClientWidth = clientWidth;
    lastClientHeight = clientHeight;
    lastRenderWidth = renderSize.width;
    lastRenderHeight = renderSize.height;

    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(renderSize.width, renderSize.height, false);
  }

  return {
    start,
    stop,
    dispose,
    updateTheme,
    updatePerformanceMode,
    isRunning: () => running
  };
}

function fitRenderSize(clientWidth: number, clientHeight: number) {
  const maxRenderPixels = 1_250_000;
  const pixelCount = clientWidth * clientHeight;
  const scale = pixelCount > maxRenderPixels ? Math.sqrt(maxRenderPixels / pixelCount) : 1;

  return {
    width: Math.max(1, Math.floor(clientWidth * scale)),
    height: Math.max(1, Math.floor(clientHeight * scale))
  };
}

function createFlowFieldGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const safeCount = Math.max(1, count);

  for (let index = 0; index < count; index += 1) {
    const progress = index / safeCount;
    const band = index % 5;
    const angle = progress * Math.PI * 8.5 + band * 1.35;
    const radius = 2.1 + Math.sin(progress * Math.PI * 3 + band) * 0.58 + band * 0.12;
    positions[index * 3] = Math.cos(angle) * radius + (band - 2) * 0.68;
    positions[index * 3 + 1] = Math.sin(progress * Math.PI * 4 + band) * 0.82 + (progress - 0.5) * 1.8;
    positions[index * 3 + 2] = -6.4 + Math.sin(angle * 0.72) * 1.4 + progress * 3.6;
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function createDepthGridGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const rows = 8;
  const columns = 12;
  const width = 11.8;
  const depth = 6.4;

  for (let row = 0; row <= rows; row += 1) {
    const z = -depth / 2 + (row / rows) * depth;
    positions.push(-width / 2, 0, z, width / 2, 0, z);
  }

  for (let column = 0; column <= columns; column += 1) {
    const x = -width / 2 + (column / columns) * width;
    positions.push(x, 0, -depth / 2, x, 0, depth / 2);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function createWaveCorridorGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const lanes = 5;
  const segments = 36;

  for (let lane = 0; lane < lanes; lane += 1) {
    const y = -1.25 + lane * 0.56;

    for (let segment = 0; segment < segments; segment += 1) {
      const start = segment / segments;
      const end = (segment + 1) / segments;
      const startX = -5.6 + start * 11.2;
      const endX = -5.6 + end * 11.2;
      const startZ = -5.4 + Math.sin(start * Math.PI * 1.7 + lane * 0.4) * 0.62;
      const endZ = -5.4 + Math.sin(end * Math.PI * 1.7 + lane * 0.4) * 0.62;
      const startY = y + Math.sin(start * Math.PI * 2.2 + lane) * 0.1;
      const endY = y + Math.sin(end * Math.PI * 2.2 + lane) * 0.1;
      positions.push(startX, startY, startZ, endX, endY, endZ);
    }
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function createBeatLaneGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const columns = 12;

  for (let column = 0; column < columns; column += 1) {
    const progress = column / Math.max(1, columns - 1);
    const x = -5.1 + progress * 10.2;
    const height = 0.18 + Math.abs(Math.sin(progress * Math.PI * 3)) * 0.22;
    positions.push(x, -height, -1.1 - progress * 3.6, x, height, -1.1 - progress * 3.6);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function createSpatialPlane(width: number, height: number, material: Material): Mesh {
  const plane = new Mesh(new PlaneGeometry(width, height, 1, 1), material);
  plane.renderOrder = -1;
  return plane;
}
