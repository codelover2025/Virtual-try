import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PoseFit, RingConfig, BangleConfig } from '../types.js';

type LoadedAsset = {
  primary:   THREE.Group;
  secondary: THREE.Group | null;
};

/**
 * Phase 2 – Production ThreeRenderer.
 *
 * Enhancements:
 * - Asset cache with URL-keyed storage and LRU eviction.
 * - Dynamic product replacement without renderer teardown.
 * - DRACO compression support for faster asset downloads.
 * - Optimised lighting: ambient + directional key/fill + rim point light.
 * - Smooth visibility transitions (fade in/out via material opacity).
 * - Memory cleanup: dispose geometry, material and textures on replacement.
 * - Throttled render: only flushes WebGL when pose or visibility changes.
 * - Stable overlay depth (do not map raw landmark z into world z).
 * - Baked GLTF clips are ignored so jewellery sits still on the body.
 * - Render quality scaling based on adaptive controller tier.
 * - Proper disposal of cached assets on cache eviction.
 */

const MAX_CACHED_ASSETS = 8;

export class ThreeRenderer {
  private renderer:  THREE.WebGLRenderer;
  private scene    = new THREE.Scene();
  private camera:    THREE.OrthographicCamera;
  private root     = new THREE.Group();
  private secondary = new THREE.Group();
  private occluder:  THREE.Mesh;
  private fingerOccluder: THREE.Mesh;
  private axesHelper: THREE.AxesHelper;
  private showDebugAxes = false;
  private ready    = false;

  // Ring mesh reference for tracking loop (prevents stale mesh reads)
  public readonly ringRef: { current: THREE.Group | null } = { current: null };

  // Video element reference for dimensions
  private videoElement: HTMLVideoElement | null = null;

  // Contact blob shadow texture for finger
  private blobShadowTexture: THREE.CanvasTexture | null = null;

  // Stability & smoothing state for ring
  private smoothRingPos = new THREE.Vector3();
  private smoothRingQuat = new THREE.Quaternion();
  private smoothRingScale = 1.0;
  private hasInitialRingPose = false;
  private ringTrackingDropFrames = 0;
  private ringOpacity = 1.0;
  private targetRingOpacity = 1.0;
  private currentGemOpacity = 1.0;

  // Bangle mesh reference for tracking loop (prevents stale mesh reads)
  public readonly bangleRef: {
    current: {
      group: THREE.Group;
      frontBand: THREE.Mesh;
      backBand: THREE.Mesh;
      frontStuds?: THREE.Mesh;
      backStuds?: THREE.Mesh;
    } | null;
  } = { current: null };

  // Uniforms shared by all bangle front/back materials
  private bangleUniforms = {
    uBangleCenter: { value: new THREE.Vector3() },
    uCamPos: { value: new THREE.Vector3(0, 0, 500) },
    uBangleRadius: { value: 1.0 },
    uBangleOpacity: { value: 1.0 },
    uDebugMode: { value: 0 },
  };

  // Stability & smoothing state for bangle
  private smoothBanglePos = new THREE.Vector3();
  private smoothBangleQuat = new THREE.Quaternion();
  private smoothBangleScale = 1.0;
  private hasInitialBanglePose = false;
  private bangleTrackingDropFrames = 0;
  private bangleOpacity = 1.0;
  private targetBangleOpacity = 1.0;

  // Asset caching with LRU
  private readonly assetCache = new Map<string, { group: THREE.Group; lastUsed: number }>();
  private currentAssetUrl: string | null = null;
  private mirrorSecondary = false;

  // Fade state
  private targetOpacity  = 1;
  private currentOpacity = 1;

  // Animation — kept for disposal only. Try-on never plays baked GLTF clips.
  private mixer: THREE.AnimationMixer | null = null;
  private envTexture: THREE.Texture | null = null;

  // Loaders (shared, singleton per renderer)
  private readonly gltfLoader: GLTFLoader;
  private readonly dracoLoader: DRACOLoader;
  private lastQualityTier: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' | null = null;

  // Last rendered state for change detection
  private lastPoseKey = '';

  // Render quality
  private pixelRatioOverride: number | null = null;
  /** Procedural meshes own their geometry. Cached GLTF clones share it. */
  private instanceOwnsGeometry = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // ── WebGL renderer ────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha:                true,
      antialias:            true,
      preserveDrawingBuffer: true,
      powerPreference:      'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Use NoToneMapping so WebGL transparent alpha channel (RGBA 0,0,0,0) is preserved
    this.renderer.toneMapping = THREE.NoToneMapping;

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 2000);
    this.camera.position.z = 500;

    // ── Lighting ──────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.38);
    const hemi = new THREE.HemisphereLight(0xfff4e5, 0x1a120c, 0.45);

    // Key light: warm directional from upper-right
    const key = new THREE.DirectionalLight(0xfff8e7, 1.55);
    key.position.set(0.5, 0.8, 1.5);

    // Fill light: cool directional from lower-left
    const fill = new THREE.DirectionalLight(0xddeeff, 0.35);
    fill.position.set(-1, -0.3, 0.8);

    // Rim/back light for metallic highlights
    const rim = new THREE.PointLight(0xffffff, 0.55, 900);
    rim.position.set(0, -200, 300);

    // Bottom fill for under-chin necklace illumination
    const bottomFill = new THREE.DirectionalLight(0xffeedd, 0.22);
    bottomFill.position.set(0, -1, 0.5);

    this.scene.add(ambient, hemi, key, fill, rim, bottomFill);

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.envTexture = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = this.envTexture;
      envScene.dispose();
      pmrem.dispose();
    } catch {
      this.envTexture = null;
    }

    // ── Depth-Buffer Face Occluder (colorWrite = false, depthWrite = true) ──
    const occluderGeo = new THREE.SphereGeometry(1.0, 24, 24);
    occluderGeo.scale(0.85, 1.15, 0.95);
    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });
    this.occluder = new THREE.Mesh(occluderGeo, occluderMat);
    this.occluder.renderOrder = -1;
    this.occluder.visible = false;
    this.scene.add(this.occluder);

    // ── Finger Occluder Cylinder (colorWrite = false, depthWrite = true) ────
    // Invisible cylinder aligned to ring finger segment (13 -> 14).
    // Cyl axis rotated to local Z so it matches fingerDir and ring hole axis.
    // renderOrder = 0 (lower than ring renderOrder = 1) so finger hides back of band naturally.
    const fingerOccluderGeo = new THREE.CylinderGeometry(1, 1, 1, 32);
    fingerOccluderGeo.rotateX(Math.PI * 0.5);
    const fingerOccluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });
    this.fingerOccluder = new THREE.Mesh(fingerOccluderGeo, fingerOccluderMat);
    this.fingerOccluder.renderOrder = 0;
    this.fingerOccluder.visible = false;
    this.scene.add(this.fingerOccluder);

    // ── AxesHelper for DEBUG toggle ─────────────────────────────────────────
    // Red = X, Green = Y (points to back of hand/gem), Blue = Z (runs along finger)
    this.axesHelper = new THREE.AxesHelper(2.5);
    this.axesHelper.renderOrder = 999;
    (this.axesHelper.material as THREE.Material).depthTest = false;
    this.axesHelper.visible = false;
    this.root.add(this.axesHelper);

    // ── Groups ─────────────────────────────────────────────────────────────
    this.scene.add(this.root, this.secondary);

    // ── Loaders ────────────────────────────────────────────────────────────
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    if (this.pixelRatioOverride != null) {
      this.renderer.setPixelRatio(this.pixelRatioOverride);
    }
    this.camera.left   = 0;
    this.camera.right  = width;
    this.camera.top    = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  // ─── Video element source ──────────────────────────────────────────────────

  setVideoSource(video: HTMLVideoElement | null): void {
    this.videoElement = video;
  }

  _getBlobShadowTexture(): THREE.CanvasTexture {
    if (this.blobShadowTexture) return this.blobShadowTexture;
    if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const center = size / 2;
      const grad = ctx.createRadialGradient(center, center, 0, center, center, size * 0.48);
      grad.addColorStop(0, 'rgba(12, 10, 8, 0.72)');
      grad.addColorStop(0.35, 'rgba(24, 20, 16, 0.48)');
      grad.addColorStop(0.70, 'rgba(32, 28, 24, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.blobShadowTexture = texture;
    return texture;
  }

  getFingerOccluder(): THREE.Mesh {
    return this.fingerOccluder;
  }

  // ─── Debug Axes Helper ─────────────────────────────────────────────────────

  setDebugAxes(show: boolean): void {
    this.showDebugAxes = show;
    if (this.axesHelper) {
      this.axesHelper.visible = show;
    }
  }

  isDebugAxes(): boolean {
    return this.showDebugAxes;
  }

  toggleDebugAxes(): boolean {
    this.setDebugAxes(!this.showDebugAxes);
    return this.showDebugAxes;
  }

  // ─── Quality control ───────────────────────────────────────────────────────

  setRenderQuality(tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'): void {
    if (tier === this.lastQualityTier) return;
    this.lastQualityTier = tier;
    switch (tier) {
      case 'HIGH':
        this.pixelRatioOverride = Math.min(window.devicePixelRatio, 2);
        break;
      case 'MEDIUM':
        this.pixelRatioOverride = Math.min(window.devicePixelRatio, 1.5);
        break;
      case 'LOW':
        this.pixelRatioOverride = 1;
        break;
      case 'MINIMAL':
        this.pixelRatioOverride = 0.75;
        break;
    }
    this.renderer.setPixelRatio(this.pixelRatioOverride);
  }

  /** Map mean luminance (0 dark … 1 bright) onto tone-mapping exposure. */
  setExposure(luminance: number): void {
    const exposure = Math.max(0.75, Math.min(1.65, 1.15 + (0.45 - luminance) * 0.9));
    this.renderer.toneMappingExposure = exposure;
  }

  // ─── Asset loading ─────────────────────────────────────────────────────────

  loadProceduralEarring(mirrorSec = true): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createGoldDropEarring();
    this.root.add(mesh.clone(true));
    if (mirrorSec) {
      const sec = createGoldDropEarring();
      sec.scale.x = -1;
      this.secondary.add(sec);
    }
    this.mirrorSecondary = mirrorSec;
    this.currentAssetUrl = 'procedural://earring';
    this.ready = true;
  }

  loadProceduralNecklace(): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createChokerNecklace();
    this.root.add(mesh);
    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = 'procedural://necklace';
    this.ready = true;
  }

  loadProceduralNoseRing(): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createSeptumNoseRing();
    this.root.add(mesh);
    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = 'procedural://nose_ring';
    this.ready = true;
  }

  loadProceduralRing(configOrId?: RingConfig | string): void {
    this.switchRing(configOrId ?? 'prod-ring-001');
  }

  /**
   * Hot-swap 3D ring following the selected product item.
   * Removes and disposes the old ring, builds the new ring, and attaches it
   * to this.root without resetting tracking transforms or camera/tracker state.
   */
  switchRing(configOrId: RingConfig | string): void {
    const config = resolveRingConfig(configOrId);
    console.log('[ThreeRenderer] Rebuilding ring for product:', config.id, config);

    // 1. Remove old ring from scene and dispose geometries, materials, textures
    if (this.ringRef.current) {
      this.root.remove(this.ringRef.current);
      this._disposeGroup(this.ringRef.current, true);
      this.ringRef.current = null;
    }

    // 2. Build the new ring
    this.instanceOwnsGeometry = true;
    const newRing = buildRing(config, this.envTexture, this._getBlobShadowTexture());
    this.ringRef.current = newRing;

    // 3. Add to the same parent group (this.root) that holds the tracking transform
    this.root.add(newRing);

    // 4. Ensure AxesHelper stays attached to this.root
    if (this.axesHelper && this.axesHelper.parent !== this.root) {
      this.root.add(this.axesHelper);
    }

    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = `procedural://ring?id=${config.id}`;
    this.ready = true;
  }

  loadProceduralBangle(configOrId?: BangleConfig | string): void {
    this.switchBangle(configOrId ?? 'prod-bangle-001');
  }

  /**
   * Two-pass realistic Bangle try-on:
   * Front mesh: fully opaque, depthWrite: true, renderOrder: 2, side >= -seam
   * Back mesh: translucent (0.16), darkened (0.7x), depthWrite: false, renderOrder: 1, side <= seam
   * Seamless blend with smoothstep(-seam, seam, side)
   */
  switchBangle(configOrId?: BangleConfig | string | null): void {
    const config = resolveBangleConfig(configOrId);
    console.log('[ThreeRenderer] Rebuilding bangle for product:', config.id, config);

    // 1. Remove old bangle and dispose geometries & materials
    if (this.bangleRef.current) {
      this.root.remove(this.bangleRef.current.group);
      this._disposeBangle(this.bangleRef.current);
      this.bangleRef.current = null;
    }

    // 2. Clear old ring if any
    if (this.ringRef.current) {
      this.root.remove(this.ringRef.current);
      this._disposeGroup(this.ringRef.current, true);
      this.ringRef.current = null;
    }

    // 3. Build the new two-pass bangle (band + studs)
    this.instanceOwnsGeometry = true;
    const isDebugMode =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('debug') === '1' ||
        new URLSearchParams(window.location.search).get('debug') === 'true');
    this.bangleUniforms.uDebugMode.value = isDebugMode ? 1 : 0;

    const bundle = buildBangle(config, this.envTexture, this.bangleUniforms);
    this.bangleRef.current = bundle;

    // 4. Add to the same parent group (this.root) holding tracking transform
    this.root.add(bundle.group);

    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = `procedural://bangle?id=${config.id}`;
    this.ready = true;
  }

  private _disposeBangle(bundle: {
    group: THREE.Group;
    frontBand: THREE.Mesh;
    backBand: THREE.Mesh;
    frontStuds?: THREE.Mesh;
    backStuds?: THREE.Mesh;
  }): void {
    // Both meshes share the same geometry, dispose once
    bundle.frontBand.geometry.dispose();
    bundle.frontStuds?.geometry.dispose();

    (bundle.frontBand.material as THREE.Material).dispose();
    (bundle.backBand.material as THREE.Material).dispose();
    (bundle.frontStuds?.material as THREE.Material)?.dispose();
    (bundle.backStuds?.material as THREE.Material)?.dispose();
  }

  loadProcedural(kind: string, mirrorSec = false): void {
    const normalized = (kind || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (normalized.includes('necklace')) {
      this.loadProceduralNecklace();
    } else if (normalized.includes('nose') || normalized.includes('septum')) {
      if (normalized.includes('stud') || normalized.includes('nostril')) {
        this._clearGroups();
        this.instanceOwnsGeometry = true;
        this.root.add(createNoseStud());
        this.mirrorSecondary = false;
        this.secondary.visible = false;
        this.currentAssetUrl = 'procedural://nose_stud';
        this.ready = true;
      } else {
        this.loadProceduralNoseRing();
      }
    } else if (normalized.includes('ring')) {
      this.loadProceduralRing();
    } else if (normalized.includes('bangle') || normalized.includes('bracelet')) {
      this.loadProceduralBangle();
    } else if (normalized.includes('earring')) {
      this.loadProceduralEarring(mirrorSec);
    } else {
      this.loadProceduralFallback(kind);
    }
  }

  loadProceduralFallback(kind: string): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createPlaceholderBadge(kind);
    this.root.add(mesh);
    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = `procedural://${kind}`;
    this.ready = true;
  }

  /** Fetch a GLB into the cache without replacing the currently worn piece. */
  async warmCache(url: string): Promise<void> {
    if (!url || url.startsWith('procedural://')) return;
    await this._loadIntoCache(url);
  }

  async loadModel(url: string, mirrorSec = false): Promise<void> {
    const is3dFile = Boolean(url && (url.endsWith('.glb') || url.endsWith('.gltf') || url.includes('.glb?') || url.includes('.gltf?')));
    if (!url || url.startsWith('procedural://') || !is3dFile) {
      const kind = url && url.startsWith('procedural://')
        ? url.replace('procedural://', '').trim()
        : 'ring';
      this.loadProcedural(kind, mirrorSec);
      return;
    }

    const cacheEntry = await this._loadIntoCache(url);

    this._clearGroups();
    this.instanceOwnsGeometry = false;
    const primary = cacheEntry.group.clone(true);
    this._isolateMaterials(primary);
    this._freezeSkinnedPose(primary);
    this.root.add(primary);

    if (mirrorSec) {
      const sec = cacheEntry.group.clone(true);
      this._isolateMaterials(sec);
      this._freezeSkinnedPose(sec);
      sec.scale.x = -1;
      this.secondary.add(sec);
    }
    this.mirrorSecondary = mirrorSec;
    this.currentAssetUrl  = url;
    this.ready = true;
    this.targetOpacity = 0;   // fade in
    this.currentOpacity = 0;
  }

  // ─── Dynamic product switching ──────────────────────────────────────────────

  async switchAsset(url: string, mirrorSec: boolean): Promise<void> {
    // Fade out current first.
    this.targetOpacity = 0;
    await this._waitFrames(4);
    await this.loadModel(url, mirrorSec);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  hasActiveAnimation(): boolean {
    return this.mixer != null;
  }

  render(pose: PoseFit, kind?: string): void {
    const isRing = (kind ?? '').toUpperCase().includes('RING') || (this.currentAssetUrl ?? '').includes('ring');
    if (isRing) {
      this._renderRing(pose, kind);
      return;
    }

    const isBangle = (kind ?? '').toUpperCase().includes('BANGLE') || (kind ?? '').toUpperCase().includes('BRACELET') || (this.currentAssetUrl ?? '').includes('bangle');
    if (isBangle) {
      this._renderBangle(pose, kind);
      return;
    }

    // Hide finger occluder when not in ring try-on mode
    this.fingerOccluder.visible = false;

    // Fade animation.
    if (this.currentOpacity !== this.targetOpacity) {
      const fadeSpeed = this.targetOpacity > this.currentOpacity ? 0.22 : 0.15;
      this.currentOpacity += (this.targetOpacity - this.currentOpacity) * fadeSpeed;
      if (Math.abs(this.currentOpacity - this.targetOpacity) < 0.01) {
        this.currentOpacity = this.targetOpacity;
      }
    } else if (pose.visible) {
      this.targetOpacity = 1;
    }

    if (!this.ready) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!pose.visible || this.currentOpacity < 0.01) {
      this.root.visible      = false;
      this.secondary.visible = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.targetOpacity = 1;

    // Compute pose key for change detection.
    const poseKey = `${pose.position.x.toFixed(1)},${pose.position.y.toFixed(1)},${pose.scale.toFixed(3)},${pose.rotationZ.toFixed(4)},${(pose.rotationX ?? 0).toFixed(3)},${(pose.rotationY ?? 0).toFixed(3)},${this.currentOpacity.toFixed(2)},${kind ?? ''}`;

    // Always render for fade animation, skip only when frozen.
    const needRender = poseKey !== this.lastPoseKey;

    // Occluder mesh transform for head occlusion
    if (pose.secondaryPosition) {
      const midX = (pose.position.x + pose.secondaryPosition.x) / 2;
      const midY = (pose.position.y + pose.secondaryPosition.y) / 2;
      const headDist = Math.hypot(
        pose.secondaryPosition.x - pose.position.x,
        pose.secondaryPosition.y - pose.position.y,
      );
      const headRadius = headDist * 0.55;
      this.occluder.visible = true;
      this.occluder.position.set(midX, midY - headRadius * 0.05, 0);
      this.occluder.scale.set(headRadius * 0.88, headRadius * 1.25, headRadius * 0.90);
      this.occluder.rotation.y = pose.yaw ?? 0;
      this.occluder.rotation.x = pose.pitch ?? 0;
      this.occluder.rotation.z = -pose.rotationZ;
    } else {
      this.occluder.visible = false;
    }

    // Depth in Three.js coordinate system (+Z towards camera):
    // MediaPipe -z is towards camera, so Three.js Z = -MediaPipe_z.
    const rootZ = pose.position.z !== undefined ? -pose.position.z : 4;
    const secZ = pose.secondaryPosition?.z !== undefined ? -pose.secondaryPosition.z : 4;

    // Head yaw fading thresholds:
    // |yaw| < 20 deg: show both earrings.
    // 20-45 deg: fade the far-side earring toward 0 opacity.
    // > 45 deg: hide the far earring completely, keep the near one attached.
    let rootOpacity = this.currentOpacity;
    let secOpacity  = this.currentOpacity;
    if (pose.secondaryPosition && pose.yaw !== undefined) {
      const YAW_20_DEG = (20 * Math.PI) / 180; // ~0.349 rad
      const YAW_45_DEG = (45 * Math.PI) / 180; // ~0.785 rad
      const absYaw = Math.abs(pose.yaw);
      if (absYaw > YAW_20_DEG) {
        const fade = absYaw >= YAW_45_DEG
          ? 0
          : Math.max(0, 1 - (absYaw - YAW_20_DEG) / (YAW_45_DEG - YAW_20_DEG));

        let rootIsFar = false;
        if (Math.abs(rootZ - secZ) > 0.04) {
          rootIsFar = rootZ < secZ;
        } else {
          rootIsFar = pose.yaw > 0
            ? pose.position.x > pose.secondaryPosition.x
            : pose.position.x < pose.secondaryPosition.x;
        }

        if (rootIsFar) {
          rootOpacity *= fade;
        } else {
          secOpacity *= fade;
        }
      }
    }

    // Apply primary.
    const s = worldScaleForKind(kind, pose.scale);
    const yaw = pose.rotationY ?? pose.yaw ?? 0;
    const pitch = pose.rotationX ?? pose.pitch ?? 0;
    if (rootOpacity > 0.01) {
      this.root.visible = true;
      this.root.position.set(pose.position.x, pose.position.y, rootZ);
      this.root.rotation.set(pitch, yaw, -pose.rotationZ);
      this.root.scale.setScalar(s);
      this._setGroupOpacity(this.root, rootOpacity);
    } else {
      this.root.visible = false;
    }

    // Apply secondary (only for dual items such as earrings).
    const isDualEarring =
      (kind?.toUpperCase().includes('EARRING') ?? false) ||
      (this.currentAssetUrl?.includes('earring') ?? false);
    if (isDualEarring && pose.secondaryPosition && secOpacity > 0.01) {
      this.secondary.visible = true;
      this.secondary.position.set(
        pose.secondaryPosition.x,
        pose.secondaryPosition.y,
        secZ,
      );
      this.secondary.rotation.set(pitch, yaw, -pose.rotationZ);
      this.secondary.scale.setScalar(s);
      this._setGroupOpacity(this.secondary, secOpacity);
    } else {
      this.secondary.visible = false;
    }

    if (needRender) {
      this.lastPoseKey = poseKey;
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Dedicated high-realism Ring Try-On Pipeline:
   * 1. Video Background Plane (camera feed rendered behind occluder in WebGL)
   * 2. Tracking drop hysteresis: keep last pose for ~5 frames before fade-out
   * 3. Axis mapping: Matrix4 basis with zAxis = fingerDir, yAxis = gem-up (palm normal flipped toward camera, orthogonalized), xAxis = cross(yAxis, zAxis)
   * 4. Scale: Ring outer radius = 0.55 x finger width in world units * Size Ratio slider.
   * 5. Stability: Smooth position, quaternion (slerp, alpha ~0.4), and scale
   * 6. Occluder: Cylinder axis along fingerDir, radius 0.85 x inner radius, length shorter than ring band
   * 7. Gem: Sits at local +Y (back of hand), fades out smoothly when palm normal faces camera (> 0.6 dot product)
   * 8. Sliders (Size Ratio & Vertical Position) preserved
   * 9. Debug axes toggle (AxesHelper)
   */
  private _renderRing(pose: PoseFit, kind?: string): void {
    // 1. Camera Video Background is rendered transparently over the underlying HTML5 <video> element

    // 2. Tracking drop hysteresis (keep pose for ~5 frames, then fade opacity out)
    const isTracking = pose.visible && pose.confidence > 0.08;
    if (isTracking) {
      this.ringTrackingDropFrames = 0;
      this.targetRingOpacity = 1.0;
    } else {
      this.ringTrackingDropFrames++;
      if (this.ringTrackingDropFrames <= 5 && this.hasInitialRingPose) {
        // Keep last pose, keep current opacity
        this.targetRingOpacity = 1.0;
      } else {
        // Fade opacity out gradually
        this.targetRingOpacity = 0.0;
      }
    }

    // Smooth opacity transition
    if (this.ringOpacity !== this.targetRingOpacity) {
      const fadeSpeed = this.targetRingOpacity > this.ringOpacity ? 0.25 : 0.15;
      this.ringOpacity += (this.targetRingOpacity - this.ringOpacity) * fadeSpeed;
      if (Math.abs(this.ringOpacity - this.targetRingOpacity) < 0.01) {
        this.ringOpacity = this.targetRingOpacity;
      }
    }

    if (!this.ready || this.ringOpacity < 0.01) {
      this.root.visible = false;
      this.secondary.visible = false;
      this.fingerOccluder.visible = false;
      this.occluder.visible = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 3. Targets: Position, Scale & Quaternion
    // Placement position is kept as is (pose.position.x, pose.position.y)
    const targetPos = new THREE.Vector3(pose.position.x, pose.position.y, 4);

    // SCALE: Ring outer radius = 0.55 x finger width in world units,
    // computed from landmarks 13-17 perpendicular distance with clamp. Multiply by Size Ratio slider.
    const fingerWidth = pose.ringSegment?.width ?? 32;
    const sizeRatio = pose.ringSegment?.sizeRatio ?? 1.0;
    const targetOuterRadius = Math.max(10, 0.55 * fingerWidth * sizeRatio);

    // AXIS MAPPING:
    // TorusGeometry's hole axis is local +Z. The ring's local +Z must map to
    // the FINGER axis (normalize(PIP - MCP)), converted to Three.js world
    // coordinates (flip Y, and use the same depth convention as the video plane).
    // Build rotation with Matrix4:
    //   zAxis = fingerDir
    //   yAxis = gem-up direction (palm normal flipped toward camera,
    //           then orthogonalized: up = normalize(up - fingerDir * dot(up, fingerDir)))
    //   xAxis = cross(yAxis, zAxis)
    //   matrix.makeBasis(xAxis, yAxis, zAxis)
    //   ring.quaternion.setFromRotationMatrix(matrix)
    const targetQuat = new THREE.Quaternion();

    if (pose.ringSegment) {
      const { mcp, pip, p0, p5, p17 } = pose.ringSegment;

      // Finger vector: MCP (13) -> PIP (14)
      // Screen space: delta X, delta Y (screen Y points downwards)
      // Depth space: MediaPipe -z is towards camera; Three.js +z is towards camera.
      // So Three.js delta Z is -((pip.z ?? 0) - (mcp.z ?? 0))
      const fdx = pip.x - mcp.x;
      const fdy = pip.y - mcp.y;
      const fdz = -((pip.z ?? 0) - (mcp.z ?? 0));
      const fingerLen = Math.hypot(fdx, fdy, fdz);
      const zAxis = fingerLen > 1e-4
        ? new THREE.Vector3(fdx / fingerLen, fdy / fingerLen, fdz / fingerLen)
        : new THREE.Vector3(0, -1, 0);

      // Palm normal from wrist (0) to index MCP (5) and pinky MCP (17)
      let palmNormal = new THREE.Vector3(0, 0, 1);
      if (p0 && p5 && p17) {
        const v0_5 = new THREE.Vector3(
          p5.x - p0.x,
          p5.y - p0.y,
          -((p5.z ?? 0) - (p0.z ?? 0)),
        );
        const v0_17 = new THREE.Vector3(
          p17.x - p0.x,
          p17.y - p0.y,
          -((p17.z ?? 0) - (p0.z ?? 0)),
        );
        palmNormal.crossVectors(v0_5, v0_17);
      }
      if (palmNormal.lengthSq() < 1e-4) {
        palmNormal.set(0, 0, 1);
      } else {
        palmNormal.normalize();
      }

      // Palm normal flipped toward camera (+Z in Three.js world convention)
      if (palmNormal.z < 0) {
        palmNormal.negate();
      }

      // Gram-Schmidt orthogonalization: up = normalize(up - fingerDir * dot(up, fingerDir))
      const up = palmNormal.clone().sub(zAxis.clone().multiplyScalar(palmNormal.dot(zAxis)));
      let yAxis = up.lengthSq() > 1e-4 ? up.normalize() : new THREE.Vector3(0, 0, 1);
      if (Math.abs(yAxis.dot(zAxis)) > 0.95) {
        // Fallback if collinear
        yAxis = new THREE.Vector3(0, 1, 0).sub(zAxis.clone().multiplyScalar(zAxis.y)).normalize();
      }

      // xAxis = cross(yAxis, zAxis)
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

      const rotMatrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      targetQuat.setFromRotationMatrix(rotMatrix);
    } else if (pose.ringQuaternion) {
      targetQuat.fromArray(pose.ringQuaternion);
    } else {
      targetQuat.setFromEuler(new THREE.Euler(
        pose.rotationX ?? 0,
        pose.rotationY ?? 0,
        -pose.rotationZ,
      ));
    }

    // 4. Stability Smoothing: slerp quaternion (alpha ~0.4), lerp position & scale
    if (!this.hasInitialRingPose) {
      this.smoothRingPos.copy(targetPos);
      this.smoothRingQuat.copy(targetQuat);
      this.smoothRingScale = targetOuterRadius;
      this.hasInitialRingPose = true;
    } else if (isTracking) {
      this.smoothRingPos.lerp(targetPos, 0.4);
      this.smoothRingQuat.slerp(targetQuat, 0.4);
      this.smoothRingScale += (targetOuterRadius - this.smoothRingScale) * 0.4;
    }

    // Apply to ring mesh
    this.root.visible = true;
    this.root.position.copy(this.smoothRingPos);
    this.root.quaternion.copy(this.smoothRingQuat);
    this.root.scale.setScalar(this.smoothRingScale);
    this._setGroupOpacity(this.root, this.ringOpacity);

    // Keep debug axes visibility in sync
    this.axesHelper.visible = this.showDebugAxes;

    // Hide secondary for single-hand ring try-on
    this.secondary.visible = false;
    this.occluder.visible = false; // head occluder off for rings

    // 5. Gem visibility & smooth fade:
    // Read ringRef.current inside tracking loop so loop never uses stale mesh
    const palmFacingDot = pose.ringSegment?.palmFacingDot ?? 0;
    let targetGemOpacity = 1.0;
    if (palmFacingDot > 0.6) {
      targetGemOpacity = Math.max(0.0, 1.0 - (palmFacingDot - 0.6) / 0.25);
    }
    this.currentGemOpacity += (targetGemOpacity - this.currentGemOpacity) * 0.25;
    const activeRing = this.ringRef.current ?? this.root;
    const gem = activeRing.getObjectByName('solitaire_gem') as THREE.Group | undefined;
    if (gem) {
      gem.visible = this.currentGemOpacity > 0.01;
      if (gem.visible) {
        this._setGroupOpacity(gem, this.currentGemOpacity * this.ringOpacity);
      }
    }

    // 6. Finger Occluder Cylinder:
    // Occluder cylinder radius must be SMALLER than the ring's inner radius (~0.85 x inner radius).
    // Inner radius of the solitaire ring is 0.78572 x smoothRingScale.
    // Cylinder axis uses the same fingerDir (aligned with smoothRingQuat).
    // Shorter than the ring band so only the back arc is hidden (~1.5 x tubeRadiusInWorld).
    // colorWrite = false, depthWrite = true, renderOrder = 0 (lower than ring 1).
    if (pose.ringSegment) {
      this.fingerOccluder.visible = true;
      const innerRadius = 0.78572 * this.smoothRingScale;
      const occluderRadius = 0.85 * innerRadius;
      const tubeRadiusInWorld = 0.10714 * this.smoothRingScale;
      const cylLength = 1.5 * tubeRadiusInWorld;

      this.fingerOccluder.position.copy(this.smoothRingPos);
      this.fingerOccluder.quaternion.copy(this.smoothRingQuat);
      this.fingerOccluder.scale.set(occluderRadius, occluderRadius, cylLength);
    } else {
      this.fingerOccluder.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Dedicated high-realism Bangle Try-On Pipeline (Two-Pass Front/Back Split):
   * 1. FRONT mesh: current material, opacity 1, transparent false/true, depthWrite true, renderOrder 2.
   *    In fragment shader, discard only fragments on back side (side < -seam).
   * 2. BACK mesh: cloned material, transparent true, opacity 0.16 (0.12-0.2), depthWrite false, renderOrder 1.
   *    In fragment shader, discard only fragments on front side (side > seam), darken x0.7, remove any outline.
   * 3. Compute split every frame:
   *    vec3 toCam = normalize(uCamPos - uBangleCenter);
   *    float side = dot(vWorldPos - uBangleCenter, toCam);
   *    float frontMask = smoothstep(-seam, seam, side);
   * 4. Keep visible while moving: update uniforms every frame (including held frames).
   * 5. Debug ?debug=1: tint back mesh red.
   */
  private _renderBangle(pose: PoseFit, kind?: string): void {
    // 1. Tracking drop hysteresis (keep pose for ~5 frames, then fade opacity out)
    const isTracking = pose.visible && pose.confidence > 0.08;
    if (isTracking) {
      this.bangleTrackingDropFrames = 0;
      this.targetBangleOpacity = 1.0;
    } else {
      this.bangleTrackingDropFrames++;
      if (this.bangleTrackingDropFrames <= 5 && this.hasInitialBanglePose) {
        // Keep last pose, keep current opacity
        this.targetBangleOpacity = 1.0;
      } else {
        // Fade opacity out gradually
        this.targetBangleOpacity = 0.0;
      }
    }

    // Smooth opacity transition (fades both front and back meshes together)
    if (this.bangleOpacity !== this.targetBangleOpacity) {
      const fadeSpeed = this.targetBangleOpacity > this.bangleOpacity ? 0.25 : 0.15;
      this.bangleOpacity += (this.targetBangleOpacity - this.bangleOpacity) * fadeSpeed;
      if (Math.abs(this.bangleOpacity - this.targetBangleOpacity) < 0.01) {
        this.bangleOpacity = this.targetBangleOpacity;
      }
    }

    if (!this.ready || this.bangleOpacity < 0.01) {
      this.root.visible = false;
      this.secondary.visible = false;
      this.fingerOccluder.visible = false;
      this.occluder.visible = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 2. Targets: Position, Scale & Orientation (Placement & orientation preserved)
    // Sizing calibrated to match previous standard (app.py & canvas2d-renderer):
    // target_w = palm_w * 1.22, where palm_w = pose.scale * 100.
    // Torus band has radius 0.8, so targetRadius = target_w / 2 = palm_w * 0.61.
    // scale = targetRadius / 0.8 = (pose.scale * 100 * 0.61) / 0.8 = pose.scale * 76.25.
    const targetPos = new THREE.Vector3(pose.position.x, pose.position.y, 4);
    const palmW = pose.scale * 100;
    const targetW = Math.max(45, Math.min(360, palmW * 1.22));
    const s = (targetW / 2) / 0.8;
    const yaw = pose.rotationY ?? pose.yaw ?? 0;
    const pitch = pose.rotationX ?? pose.pitch ?? 0;
    const roll = -pose.rotationZ;

    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll));

    // 3. Stability Smoothing: slerp quaternion (alpha ~0.4), lerp position & scale
    if (!this.hasInitialBanglePose) {
      this.smoothBanglePos.copy(targetPos);
      this.smoothBangleQuat.copy(targetQuat);
      this.smoothBangleScale = s;
      this.hasInitialBanglePose = true;
    } else if (isTracking) {
      this.smoothBanglePos.lerp(targetPos, 0.4);
      this.smoothBangleQuat.slerp(targetQuat, 0.4);
      this.smoothBangleScale += (s - this.smoothBangleScale) * 0.4;
    }

    // 4. Apply to this.root (both meshes share the same transform)
    this.root.visible = true;
    this.root.position.copy(this.smoothBanglePos);
    this.root.quaternion.copy(this.smoothBangleQuat);
    this.root.scale.setScalar(this.smoothBangleScale);

    // Read ref inside loop so loop never uses stale mesh
    const currentBangle = this.bangleRef.current;
    if (currentBangle && currentBangle.group.parent !== this.root) {
      this.root.add(currentBangle.group);
    }

    // 5. Update uniforms EVERY FRAME (including held frames when tracking drops)
    const isDebugMode =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('debug') === '1' ||
        new URLSearchParams(window.location.search).get('debug') === 'true');

    this.bangleUniforms.uBangleCenter.value.copy(this.smoothBanglePos);
    this.bangleUniforms.uCamPos.value.set(
      this.smoothBanglePos.x,
      this.smoothBanglePos.y,
      this.camera.position.z, // 500
    );
    this.bangleUniforms.uBangleRadius.value = Math.max(1.0, this.smoothBangleScale * 0.85);
    this.bangleUniforms.uBangleOpacity.value = this.bangleOpacity;
    this.bangleUniforms.uDebugMode.value = isDebugMode ? 1 : 0;

    // Hide secondary and other occluders
    this.secondary.visible = false;
    this.fingerOccluder.visible = false;
    this.occluder.visible = false;

    this.renderer.render(this.scene, this.camera);
  }

  getOccluder(): THREE.Mesh {
    return this.occluder;
  }

  clearJewellery(): void {
    this._clearGroups();
    this.ready = false;
    this.currentAssetUrl = null;
    this.root.visible = false;
    this.secondary.visible = false;
    this.occluder.visible = false;
    this.fingerOccluder.visible = false;
    this.hasInitialRingPose = false;
    this.ringTrackingDropFrames = 0;
    this.hasInitialBanglePose = false;
    this.bangleTrackingDropFrames = 0;
    this.bangleOpacity = 1.0;
    this.targetBangleOpacity = 1.0;
    if (this.bangleRef.current) {
      this.root.remove(this.bangleRef.current.group);
      this._disposeBangle(this.bangleRef.current);
      this.bangleRef.current = null;
    }
    try {
      this.renderer.clear();
    } catch {
      // In non-WebGL environments (e.g. testing) ignore clear error
    }
  }

  hasActiveMesh(): boolean {
    return this.ready && (this.root.children.length > 0 || this.secondary.children.length > 0);
  }

  getActiveUrl(): string | null {
    return this.currentAssetUrl;
  }

  dispose(): void {
    this._clearGroups();
    if (this.bangleRef.current) {
      this._disposeBangle(this.bangleRef.current);
      this.bangleRef.current = null;
    }
    this.assetCache.forEach((entry) => this._disposeGroup(entry.group, true));
    this.assetCache.clear();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.envTexture?.dispose();
    this.envTexture = null;
    this.scene.environment = null;
    this.blobShadowTexture?.dispose();
    this.blobShadowTexture = null;
    this.fingerOccluder.geometry.dispose();
    (this.fingerOccluder.material as THREE.Material)?.dispose();
    this.axesHelper.geometry.dispose();
    (this.axesHelper.material as THREE.Material)?.dispose();
    try {
      this.dracoLoader.dispose();
    } catch {
      // ignore
    }
    this.renderer.dispose();
  }

  // ─── Cache info ────────────────────────────────────────────────────────────

  getCacheStats() {
    return {
      size: this.assetCache.size,
      maxSize: MAX_CACHED_ASSETS,
      urls: [...this.assetCache.keys()],
      currentUrl: this.currentAssetUrl,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _loadIntoCache(url: string): Promise<{ group: THREE.Group; lastUsed: number }> {
    const hit = this.assetCache.get(url);
    if (hit) {
      hit.lastUsed = Date.now();
      return hit;
    }

    this._evictCacheIfNeeded();
    const gltf = await this.gltfLoader.loadAsync(url);
    gltf.scene.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMapIntensity = 0.8;
              m.needsUpdate = true;
            }
          });
        }
      }
    });
    const entry = { group: gltf.scene, lastUsed: Date.now() };
    this.assetCache.set(url, entry);
    return entry;
  }

  private _clearGroups(): void {
    if (this.ringRef.current) {
      this.root.remove(this.ringRef.current);
      this._disposeGroup(this.ringRef.current, true);
      this.ringRef.current = null;
    }
    if (this.axesHelper) {
      this.root.remove(this.axesHelper);
    }
    this._disposeGroup(this.root, this.instanceOwnsGeometry);
    this._disposeGroup(this.secondary, this.instanceOwnsGeometry);
    this.root.clear();
    this.secondary.clear();
    if (this.axesHelper) {
      this.axesHelper.visible = this.showDebugAxes;
      this.root.add(this.axesHelper);
    }
    this.ready = false;
    this.lastPoseKey = '';
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }

  /** Disable baked skin/morph motion so a GLB cannot idle-animate on the face. */
  private _freezeSkinnedPose(root: THREE.Object3D): void {
    root.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.pose();
      }
      const morph = node as THREE.Mesh;
      if (morph.morphTargetInfluences) {
        for (let i = 0; i < morph.morphTargetInfluences.length; i++) {
          morph.morphTargetInfluences[i] = 0;
        }
      }
    });
  }

  private _isolateMaterials(root: THREE.Object3D): void {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
    });
  }

  private _disposeGroup(group: THREE.Group, disposeGeometry: boolean): void {
    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (disposeGeometry) mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: THREE.Material) => {
          // Dispose texture maps except reusable/cached textures
          if ('map' in m && (m as THREE.MeshStandardMaterial).map) {
            const map = (m as THREE.MeshStandardMaterial).map;
            if (map && map !== this.blobShadowTexture) {
              map.dispose();
            }
          }
          if ('normalMap' in m && (m as THREE.MeshStandardMaterial).normalMap) {
            (m as THREE.MeshStandardMaterial).normalMap?.dispose();
          }
          if ('roughnessMap' in m && (m as THREE.MeshStandardMaterial).roughnessMap) {
            (m as THREE.MeshStandardMaterial).roughnessMap?.dispose();
          }
          if ('metalnessMap' in m && (m as THREE.MeshStandardMaterial).metalnessMap) {
            (m as THREE.MeshStandardMaterial).metalnessMap?.dispose();
          }
          if ('emissiveMap' in m && (m as THREE.MeshStandardMaterial).emissiveMap) {
            (m as THREE.MeshStandardMaterial).emissiveMap?.dispose();
          }
          if ('aoMap' in m && (m as THREE.MeshStandardMaterial).aoMap) {
            (m as THREE.MeshStandardMaterial).aoMap?.dispose();
          }
          m.dispose();
        });
      }
    });
  }

  private _setGroupOpacity(group: THREE.Group, opacity: number): void {
    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: THREE.Material) => {
          m.transparent = opacity < 1;
          m.opacity     = opacity;
          m.needsUpdate = true;
        });
      }
    });
  }

  private _evictCacheIfNeeded(): void {
    while (this.assetCache.size >= MAX_CACHED_ASSETS) {
      // Find the least recently used entry
      let oldestUrl: string | null = null;
      let oldestTime = Infinity;
      for (const [url, entry] of this.assetCache) {
        if (url === this.currentAssetUrl) continue; // don't evict current
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestUrl = url;
        }
      }
      if (oldestUrl) {
        const entry = this.assetCache.get(oldestUrl);
        if (entry) this._disposeGroup(entry.group, true);
        this.assetCache.delete(oldestUrl);
      } else {
        break; // can't evict
      }
    }
  }

  private _waitFrames(n: number): Promise<void> {
    return new Promise((resolve) => {
      let count = 0;
      const step = () => { if (++count >= n) resolve(); else requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
}

// ─── Procedural gold earring ────────────────────────────────────────────────

function createGoldDropEarring(): THREE.Group {
  const group = new THREE.Group();
  const gold  = new THREE.MeshStandardMaterial({
    color:     0xd4af37,
    metalness: 0.97,
    roughness: 0.14,
    envMapIntensity: 1.2,
  });
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.032, 16, 32, Math.PI), gold,
  );
  hook.rotation.z = Math.PI;
  hook.position.y = 0.0;

  const connector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.12, 12), gold,
  );
  connector.position.y = -0.16;

  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), gold);
  bead.position.y = -0.24;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.14, 12), gold,
  );
  stem.position.y = -0.40;

  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.20, 32, 32), gold);
  drop.scale.set(0.78, 1.18, 0.78);
  drop.position.y = -0.58;

  group.add(hook, connector, bead, stem, drop);
  return group;
}

// ─── Procedural jewellery for other categories ──────────────────────────────

function worldScaleForKind(kind: string | undefined, poseScale: number): number {
  const s = Math.max(0.3, poseScale);
  const k = (kind ?? '').toUpperCase();
  if (k.includes('EARRING')) return s * 42;
  if (k.includes('NOSE')) return s * 58;
  if (k.includes('NECKLACE') || k.includes('PENDANT') || k.includes('MANGALSUTRA')) return s * 34;
  if (k.includes('RING')) return s * 22;
  if (k.includes('BANGLE') || k.includes('BRACELET') || k.includes('WATCH')) return s * 76.25;
  return s * 18;
}

function createGoldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.96,
    roughness: 0.16,
    envMapIntensity: 1.15,
  });
}

function createGemMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xf7fbff,
    metalness: 0.08,
    roughness: 0.04,
    envMapIntensity: 1.35,
  });
}

function createChokerNecklace(): THREE.Group {
  const group = new THREE.Group();
  const gold = createGoldMaterial();
  const gem = createGemMaterial();

  // 4. Curve the chain as a catenary draping on collarbone, fading at the back sides
  const curvePoints: THREE.Vector3[] = [];
  const numPts = 32;
  const k = 1.25;
  const coshK = Math.cosh(k);
  const sag = 0.45;

  for (let i = 0; i <= numPts; i++) {
    const t = (i / numPts - 0.5) * 2; // -1 to +1
    const x = t * 1.62;
    // Catenary drape: hangs lowest at center (+Y in screen orthographic)
    const catRatio = (Math.cosh(k * t) - 1) / (coshK - 1);
    const y = sag * (1 - catRatio) + 0.1;
    // Wrap around neck depth
    const z = -Math.cos(t * Math.PI * 0.45) * 0.55 + 0.55;
    curvePoints.push(new THREE.Vector3(x, y, z));
  }

  const catenaryCurve = new THREE.CatmullRomCurve3(curvePoints);
  const chainGeo = new THREE.TubeGeometry(catenaryCurve, 64, 0.055, 12, false);
  const chain = new THREE.Mesh(chainGeo, gold);

  // Inner layered chain slightly smaller
  const innerPoints: THREE.Vector3[] = curvePoints.map((p) =>
    new THREE.Vector3(p.x * 0.90, p.y - 0.15, p.z * 0.90),
  );
  const innerCurve = new THREE.CatmullRomCurve3(innerPoints);
  const innerChainGeo = new THREE.TubeGeometry(innerCurve, 56, 0.038, 12, false);
  const innerChain = new THREE.Mesh(innerChainGeo, gold);

  // Pendant bail and drop hang down (+Y in screen orthographic) from collarbone center
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 12, 24), gold);
  bail.position.set(0, sag + 0.12, 0.1);

  const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), gem);
  pendant.scale.set(0.85, 1.35, 0.85);
  pendant.position.set(0, sag + 0.45, 0.12);

  group.add(chain, innerChain, bail, pendant);
  return group;
}

function createSeptumNoseRing(): THREE.Group {
  const group = new THREE.Group();
  const gold = createGoldMaterial();
  const gem = createGemMaterial();

  // Septum hoop with opening at top (-Y) and decorative bead hanging down (+Y)
  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.038, 16, 32, Math.PI * 1.7),
    gold,
  );
  hoop.rotation.z = -0.35 * Math.PI;

  const accent = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), gem);
  accent.position.set(0, 0.22, 0);

  group.add(hoop, accent);
  return group;
}

function createNoseStud(): THREE.Group {
  const group = new THREE.Group();
  const gold = createGoldMaterial();
  const gem = createGemMaterial();

  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.04, 16), gold);
  bezel.rotation.x = Math.PI * 0.5;

  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), gem);
  stone.position.set(0, 0, 0.02);

  group.add(bezel, stone);
  return group;
}

export const RING_CONFIGS: Record<string, RingConfig> = {
  'prod-ring-001': {
    id: 'prod-ring-001',
    gemColor: '#FFFFFF',
    gemShape: 'round',
    gemScale: 1.0,
    bandMetal: 'yellow',
    bandThickness: 0.107,
    hasHalo: false,
    haloColor: '#FFFFFF',
    accentStones: false,
  },
  'prod-ring-002': {
    id: 'prod-ring-002',
    gemColor: '#E0115F',
    gemShape: 'princess',
    gemScale: 1.08,
    bandMetal: 'yellow',
    bandThickness: 0.11,
    hasHalo: false,
    haloColor: '#FFFFFF',
    accentStones: true,
  },
  'prod-ring-003': {
    id: 'prod-ring-003',
    gemColor: '#1E6FD9',
    gemShape: 'round',
    gemScale: 1.05,
    bandMetal: 'white',
    bandThickness: 0.105,
    hasHalo: true,
    haloColor: '#FFFFFF',
    accentStones: true,
  },
  'prod-ring-004': {
    id: 'prod-ring-004',
    gemColor: '#2ECC71',
    gemShape: 'emerald',
    gemScale: 1.15,
    bandMetal: 'yellow',
    bandThickness: 0.125,
    hasHalo: false,
    haloColor: '#FFFFFF',
    accentStones: false,
  },
  'prod-ring-005': {
    id: 'prod-ring-005',
    gemColor: '#9B59B6',
    gemShape: 'pear',
    gemScale: 1.12,
    bandMetal: 'rose',
    bandThickness: 0.115,
    hasHalo: true,
    haloColor: '#FFFFFF',
    accentStones: true,
  },
};

export const RING_ALIAS_MAP: Record<string, string> = {
  'brilliant-solitaire-diamond-ring': 'prod-ring-001',
  'solitaire': 'prod-ring-001',
  'royal-ruby-pave-crown-ring': 'prod-ring-002',
  'ruby': 'prod-ring-002',
  'sapphire-halo-luxury-ring': 'prod-ring-003',
  'sapphire': 'prod-ring-003',
  'imperial-emerald-cut-gold-ring': 'prod-ring-004',
  'emerald': 'prod-ring-004',
  'amethyst-sovereign-gold-ring': 'prod-ring-005',
  'amethyst': 'prod-ring-005',
};

export function resolveRingConfig(configOrId?: RingConfig | string | null): RingConfig {
  if (configOrId && typeof configOrId === 'object' && 'gemColor' in configOrId) {
    return configOrId;
  }
  const str = typeof configOrId === 'string' ? configOrId.toLowerCase().trim() : '';
  if (str) {
    const urlMatch = str.match(/id=([a-z0-9_-]+)/i);
    const candidateId = (urlMatch ? urlMatch[1] : str).toLowerCase();

    if (RING_CONFIGS[candidateId]) return RING_CONFIGS[candidateId];
    if (RING_ALIAS_MAP[candidateId] && RING_CONFIGS[RING_ALIAS_MAP[candidateId]]) {
      return RING_CONFIGS[RING_ALIAS_MAP[candidateId]];
    }
    for (const [alias, id] of Object.entries(RING_ALIAS_MAP)) {
      if (candidateId.includes(alias)) {
        return RING_CONFIGS[id];
      }
    }
  }
  return RING_CONFIGS['prod-ring-001'];
}

export function buildRing(
  config: RingConfig,
  envTexture?: THREE.Texture | null,
  shadowTexture?: THREE.Texture | null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'solitaire_ring';
  group.renderOrder = 1;

  // 1. Metal Material (yellow #D4AF37, white #E5E4E2, rose #B76E79, metalness 1, roughness 0.25)
  const metalHex =
    config.bandMetal === 'white'
      ? 0xe5e4e2
      : config.bandMetal === 'rose'
        ? 0xb76e79
        : 0xd4af37;

  const bandMaterial = new THREE.MeshStandardMaterial({
    color: metalHex,
    metalness: 1.0,
    roughness: 0.25,
    envMap: envTexture ?? null,
    envMapIntensity: 1.35,
  });

  // 2. Band: TorusGeometry native hole axis is local +Z (no rotation around X)
  // Normalized so outer radius = ringRadius + tubeRadius = 1.0
  const thickness = Math.max(0.06, Math.min(0.20, config.bandThickness || 0.107));
  const ringRadius = 1.0 - thickness;
  const tubeRadius = thickness;

  const band = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, tubeRadius, 28, 64), bandMaterial);
  band.name = 'ring_band';
  group.add(band);

  // 3. Contact Shadow: Soft blob shadow plane under the band on the finger surface
  if (shadowTexture) {
    const shadowGeo = new THREE.PlaneGeometry(1.4, 0.9);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = Math.PI * 0.5;
    shadow.position.set(0, ringRadius - tubeRadius * 0.2, 0);
    shadow.renderOrder = 0.5;
    group.add(shadow);
  }

  // 4. Accent stones on band shank if accentStones === true
  if (config.accentStones) {
    const accentMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.04,
      transmission: 0.7,
      ior: 2.4,
      clearcoat: 1.0,
      transparent: true,
      opacity: 1.0,
      envMap: envTexture ?? null,
      envMapIntensity: 1.6,
    });
    const shankAngles = [0.22, 0.38, 0.54];
    for (const sign of [-1, 1]) {
      for (const a of shankAngles) {
        const theta = Math.PI * 0.5 + sign * a;
        const ax = Math.cos(theta) * ringRadius;
        const ay = Math.sin(theta) * ringRadius;
        const stone = new THREE.Mesh(
          new THREE.SphereGeometry(0.042 * (config.gemScale || 1.0), 8, 8),
          accentMat,
        );
        stone.position.set(ax, ay, tubeRadius * 0.6);
        group.add(stone);
      }
    }
  }

  // 5. Gem Group: sits at local +Y (back of hand)
  const gemGroup = new THREE.Group();
  gemGroup.name = 'solitaire_gem';

  const s = config.gemScale || 1.0;

  // Setting Collet in matching metal
  const collet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20 * s, 0.13 * s, 0.16 * s, 16),
    bandMaterial,
  );
  collet.position.set(0, 1.02, 0);
  gemGroup.add(collet);

  // Gem Material: color = gemColor, transmission ~0.6, ior 2.4, clearcoat 1
  const gemMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.gemColor),
    metalness: 0.0,
    roughness: 0.03,
    transmission: 0.6,
    ior: 2.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 1.0,
    envMap: envTexture ?? null,
    envMapIntensity: 1.6,
  });

  // Gem geometry chosen by gemShape
  switch (config.gemShape) {
    case 'princess': {
      // Square pyramidal princess cut
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 * s, 0.32 * s, 0.12 * s, 4),
        gemMaterial,
      );
      crown.rotation.y = Math.PI * 0.25;
      crown.position.set(0, 1.18, 0);

      const pavilion = new THREE.Mesh(
        new THREE.ConeGeometry(0.32 * s, 0.20 * s, 4),
        gemMaterial,
      );
      pavilion.rotation.y = Math.PI * 0.25;
      pavilion.rotation.z = Math.PI;
      pavilion.position.set(0, 1.02, 0);

      gemGroup.add(crown, pavilion);

      // 4 corner prongs
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const px = Math.cos(angle) * 0.23 * s;
        const pz = Math.sin(angle) * 0.23 * s;
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22 * s, 8), bandMaterial);
        prong.position.set(px, 1.12, pz);
        gemGroup.add(prong);
      }
      break;
    }

    case 'emerald': {
      // Rectangular step cut
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * s, 0.34 * s, 0.14 * s, 8),
        gemMaterial,
      );
      crown.scale.set(1.3, 1.0, 0.9);
      crown.position.set(0, 1.19, 0);

      const pavilion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34 * s, 0.10 * s, 0.18 * s, 8),
        gemMaterial,
      );
      pavilion.scale.set(1.3, 1.0, 0.9);
      pavilion.rotation.z = Math.PI;
      pavilion.position.set(0, 1.03, 0);

      gemGroup.add(crown, pavilion);

      // 4 corner prongs
      const corners = [
        [0.26 * s, 0.18 * s],
        [-0.26 * s, 0.18 * s],
        [0.26 * s, -0.18 * s],
        [-0.26 * s, -0.18 * s],
      ];
      for (const [cx, cz] of corners) {
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22 * s, 8), bandMaterial);
        prong.position.set(cx, 1.12, cz);
        gemGroup.add(prong);
      }
      break;
    }

    case 'pear': {
      // Teardrop pear cut
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.28 * s, 16, 16),
        gemMaterial,
      );
      crown.scale.set(0.85, 1.25, 0.75);
      crown.position.set(0, 1.18, 0);

      const pavilion = new THREE.Mesh(
        new THREE.ConeGeometry(0.24 * s, 0.18 * s, 16),
        gemMaterial,
      );
      pavilion.rotation.z = Math.PI;
      pavilion.position.set(0, 1.04, 0);

      gemGroup.add(crown, pavilion);

      // 4 setting prongs
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const px = Math.cos(angle) * 0.20 * s;
        const pz = Math.sin(angle) * 0.20 * s;
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22 * s, 8), bandMaterial);
        prong.position.set(px, 1.12, pz);
        gemGroup.add(prong);
      }
      break;
    }

    case 'round':
    default: {
      // Brilliant round faceted cut
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * s, 0.30 * s, 0.12 * s, 12),
        gemMaterial,
      );
      crown.position.set(0, 1.18, 0);

      const pavilion = new THREE.Mesh(
        new THREE.ConeGeometry(0.30 * s, 0.16 * s, 12),
        gemMaterial,
      );
      pavilion.rotation.z = Math.PI;
      pavilion.position.set(0, 1.04, 0);

      gemGroup.add(crown, pavilion);

      // 4 setting prongs
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const px = Math.cos(angle) * 0.22 * s;
        const pz = Math.sin(angle) * 0.22 * s;
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22 * s, 8), bandMaterial);
        prong.position.set(px, 1.12, pz);
        gemGroup.add(prong);
      }
      break;
    }
  }

  // 6. Optional Halo ring of small stones if hasHalo === true
  if (config.hasHalo) {
    const haloColor = config.haloColor || '#FFFFFF';
    const haloMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(haloColor),
      metalness: 0.0,
      roughness: 0.03,
      transmission: 0.6,
      ior: 2.4,
      clearcoat: 1.0,
      transparent: true,
      opacity: 1.0,
      envMap: envTexture ?? null,
    });
    const haloRadius = 0.38 * s;
    const stoneCount = 12;
    for (let i = 0; i < stoneCount; i++) {
      const theta = (i * 2 * Math.PI) / stoneCount;
      const hx = Math.cos(theta) * haloRadius;
      const hz = Math.sin(theta) * haloRadius;
      const stone = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 * s, 8, 8),
        haloMat,
      );
      stone.position.set(hx, 1.08, hz);
      gemGroup.add(stone);
    }
  }

  group.add(gemGroup);
  return group;
}

function createSolitaireRing(
  envTexture?: THREE.Texture | null,
  shadowTexture?: THREE.Texture | null,
): THREE.Group {
  return buildRing(RING_CONFIGS['prod-ring-001'], envTexture, shadowTexture);
}

export const BANGLE_CONFIGS: Record<string, BangleConfig> = {
  'prod-bangle-001': {
    id: 'prod-bangle-001',
    name: 'Dynasty 22k Imperial Gold Kada',
    bandMetal: 'yellow',
    bandThickness: 0.075,
    studColor: '#FFFFFF',
    studShape: 'round',
    studCount: 20,
  },
  'prod-bangle-002': {
    id: 'prod-bangle-002',
    name: 'Platinum Pavé Diamond Bangle',
    bandMetal: 'white',
    bandThickness: 0.07,
    studColor: '#F0F8FF',
    studShape: 'diamond',
    studCount: 24,
  },
  'prod-bangle-003': {
    id: 'prod-bangle-003',
    name: 'Royal Ruby Accented Gold Cuff',
    bandMetal: 'yellow',
    bandThickness: 0.08,
    studColor: '#E0115F',
    studShape: 'round',
    studCount: 16,
  },
  'prod-bangle-004': {
    id: 'prod-bangle-004',
    name: 'Emerald Crown Filigree Bangle',
    bandMetal: 'yellow',
    bandThickness: 0.075,
    studColor: '#2ECC71',
    studShape: 'round',
    studCount: 18,
  },
};

export const BANGLE_ALIAS_MAP: Record<string, string> = {
  'dynasty-22k-imperial-gold-kada': 'prod-bangle-001',
  'kada': 'prod-bangle-001',
  'platinum-pave-diamond-bangle': 'prod-bangle-002',
  'platinum': 'prod-bangle-002',
  'royal-ruby-accented-gold-cuff': 'prod-bangle-003',
  'cuff': 'prod-bangle-003',
  'emerald-crown-filigree-bangle': 'prod-bangle-004',
  'filigree': 'prod-bangle-004',
};

export function resolveBangleConfig(configOrId?: BangleConfig | string | null): BangleConfig {
  if (configOrId && typeof configOrId === 'object' && 'bandMetal' in configOrId) {
    return configOrId;
  }
  const str = typeof configOrId === 'string' ? configOrId.toLowerCase().trim() : '';
  if (str) {
    const urlMatch = str.match(/id=([a-z0-9_-]+)/i);
    const candidateId = (urlMatch ? urlMatch[1] : str).toLowerCase();

    if (BANGLE_CONFIGS[candidateId]) return BANGLE_CONFIGS[candidateId];
    if (BANGLE_ALIAS_MAP[candidateId] && BANGLE_CONFIGS[BANGLE_ALIAS_MAP[candidateId]]) {
      return BANGLE_CONFIGS[BANGLE_ALIAS_MAP[candidateId]];
    }
    for (const [alias, id] of Object.entries(BANGLE_ALIAS_MAP)) {
      if (candidateId.includes(alias)) {
        return BANGLE_CONFIGS[id];
      }
    }
  }
  return BANGLE_CONFIGS['prod-bangle-001'];
}

function applyBangleSplitShader(
  material: THREE.Material,
  uniforms: {
    uBangleCenter: { value: THREE.Vector3 };
    uCamPos: { value: THREE.Vector3 };
    uBangleRadius: { value: number };
    uBangleOpacity: { value: number };
    uDebugMode: { value: number };
  },
  isFront: boolean,
) {
  material.customProgramCacheKey = () => (isFront ? 'bangle_front_v1' : 'bangle_back_v1');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBangleCenter = uniforms.uBangleCenter;
    shader.uniforms.uCamPos = uniforms.uCamPos;
    shader.uniforms.uBangleRadius = uniforms.uBangleRadius;
    shader.uniforms.uBangleOpacity = uniforms.uBangleOpacity;
    shader.uniforms.uDebugMode = uniforms.uDebugMode;

    shader.vertexShader = `
      varying vec3 vWorldPos;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #include <project_vertex>
      `,
    );

    shader.fragmentShader = `
      uniform vec3 uBangleCenter;
      uniform vec3 uCamPos;
      uniform float uBangleRadius;
      uniform float uBangleOpacity;
      uniform int uDebugMode;
      varying vec3 vWorldPos;
      ${shader.fragmentShader}
    `;

    if (isFront) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        vec3 toCam = normalize(uCamPos - uBangleCenter);
        float side = dot(vWorldPos - uBangleCenter, toCam);
        float seam = max(0.02, 0.02 * uBangleRadius);
        if (side < -seam) discard;
        float frontMask = smoothstep(-seam, seam, side);
        gl_FragColor.a *= frontMask * uBangleOpacity;
        `,
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        vec3 toCam = normalize(uCamPos - uBangleCenter);
        float side = dot(vWorldPos - uBangleCenter, toCam);
        float seam = max(0.02, 0.02 * uBangleRadius);
        if (side > seam) discard;
        float backMask = 1.0 - smoothstep(-seam, seam, side);
        gl_FragColor.rgb *= 0.7;
        if (uDebugMode == 1) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.15, 0.15), 0.75);
          gl_FragColor.a = max(gl_FragColor.a, 0.45 * backMask);
        }
        gl_FragColor.a *= backMask * 0.16 * uBangleOpacity;
        `,
      );
    }
  };
}

export function buildBangle(
  config: BangleConfig,
  envTexture?: THREE.Texture | null,
  uniforms?: {
    uBangleCenter: { value: THREE.Vector3 };
    uCamPos: { value: THREE.Vector3 };
    uBangleRadius: { value: number };
    uBangleOpacity: { value: number };
    uDebugMode: { value: number };
  },
): {
  group: THREE.Group;
  frontBand: THREE.Mesh;
  backBand: THREE.Mesh;
  frontStuds: THREE.Mesh;
  backStuds: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = 'bangle_root';

  const metalHex =
    config.bandMetal === 'white'
      ? 0xe5e4e2
      : config.bandMetal === 'rose'
        ? 0xb76e79
        : 0xd4af37;

  // 1. Shared Band Geometry
  const bandRadius = 0.8;
  const tubeRadius = config.bandThickness ?? 0.075;
  const bandGeometry = new THREE.TorusGeometry(bandRadius, tubeRadius, 24, 64);
  bandGeometry.rotateX(Math.PI * 0.5);

  // a) FRONT Band: current material, opacity 1, depthWrite true, renderOrder 2
  const bandFrontMat = new THREE.MeshStandardMaterial({
    color: metalHex,
    metalness: 0.96,
    roughness: 0.18,
    envMap: envTexture ?? null,
    envMapIntensity: 1.25,
    opacity: 1.0,
    transparent: true,
    depthWrite: true,
  });

  // b) BACK Band: cloned material, transparent true, opacity 0.16, depthWrite false, renderOrder 1
  const bandBackMat = bandFrontMat.clone();
  bandBackMat.transparent = true;
  bandBackMat.opacity = 0.16;
  bandBackMat.depthWrite = false;

  if (uniforms) {
    applyBangleSplitShader(bandFrontMat, uniforms, true);
    applyBangleSplitShader(bandBackMat, uniforms, false);
  }

  const frontBand = new THREE.Mesh(bandGeometry, bandFrontMat);
  frontBand.name = 'bangle_band_front';
  frontBand.renderOrder = 2;

  const backBand = new THREE.Mesh(bandGeometry, bandBackMat);
  backBand.name = 'bangle_band_back';
  backBand.renderOrder = 1;

  // 2. Shared Studs Geometry (pavé studs + terminal knobs along circumference)
  const count = config.studCount ?? 20;
  const studRadius = 0.045;
  const baseStud = new THREE.SphereGeometry(studRadius, 12, 12);
  const studGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const x = Math.cos(theta) * bandRadius;
    const z = Math.sin(theta) * bandRadius;
    const g = baseStud.clone();
    g.translate(x, 0, z);
    studGeos.push(g);
  }
  baseStud.dispose();

  const knobGeo = new THREE.SphereGeometry(0.11, 16, 16);
  const leftKnob = knobGeo.clone();
  leftKnob.translate(-bandRadius, 0, 0);
  const rightKnob = knobGeo.clone();
  rightKnob.translate(bandRadius, 0, 0);
  knobGeo.dispose();
  studGeos.push(leftKnob, rightKnob);

  const studsGeometry = mergeGeometries(studGeos, false) || new THREE.BufferGeometry();
  studGeos.forEach((g) => g.dispose());

  const studColor = new THREE.Color(config.studColor || 0xffffff);

  // a) FRONT Studs: current material, opacity 1, depthWrite true, renderOrder 2
  const studFrontMat = new THREE.MeshPhysicalMaterial({
    color: studColor,
    metalness: 0.05,
    roughness: 0.05,
    transmission: 0.7,
    ior: 2.4,
    clearcoat: 1.0,
    envMap: envTexture ?? null,
    envMapIntensity: 1.5,
    opacity: 1.0,
    transparent: true,
    depthWrite: true,
  });

  // b) BACK Studs: cloned material, transparent true, opacity 0.16, depthWrite false, renderOrder 1
  const studBackMat = studFrontMat.clone();
  studBackMat.transparent = true;
  studBackMat.opacity = 0.16;
  studBackMat.depthWrite = false;

  if (uniforms) {
    applyBangleSplitShader(studFrontMat, uniforms, true);
    applyBangleSplitShader(studBackMat, uniforms, false);
  }

  const frontStuds = new THREE.Mesh(studsGeometry, studFrontMat);
  frontStuds.name = 'bangle_studs_front';
  frontStuds.renderOrder = 2;

  const backStuds = new THREE.Mesh(studsGeometry, studBackMat);
  backStuds.name = 'bangle_studs_back';
  backStuds.renderOrder = 1;

  // Both front and back meshes share the exact same transform via parent group
  group.add(backBand);
  group.add(backStuds);
  group.add(frontBand);
  group.add(frontStuds);

  return {
    group,
    frontBand,
    backBand,
    frontStuds,
    backStuds,
  };
}

function createKadaBangle(): THREE.Group {
  return buildBangle(BANGLE_CONFIGS['prod-bangle-001']).group;
}

function createPlaceholderBadge(_category: string): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.8,
    roughness: 0.2,
    wireframe: true,
  });
  const box = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 16, 32), mat);
  group.add(box);
  return group;
}
