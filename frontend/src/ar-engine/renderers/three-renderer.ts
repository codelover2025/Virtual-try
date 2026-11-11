import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PoseFit } from '../types.js';

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
  private ready    = false;

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

    // Enable tone mapping for better metallic appearance
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 2000);
    this.camera.position.z = 10;

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

  loadProceduralRing(): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createSolitaireRing();
    this.root.add(mesh);
    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = 'procedural://ring';
    this.ready = true;
  }

  loadProceduralBangle(): void {
    this._clearGroups();
    this.instanceOwnsGeometry = true;
    const mesh = createKadaBangle();
    this.root.add(mesh);
    this.mirrorSecondary = false;
    this.secondary.visible = false;
    this.currentAssetUrl = 'procedural://bangle';
    this.ready = true;
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
    if (!url || url.startsWith('procedural://')) {
      const kind = url ? url.replace('procedural://', '').trim() : 'earring';
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
      this.occluder.scale.set(headRadius * 0.95, headRadius * 1.35, headRadius * 1.1);
      this.occluder.rotation.y = pose.yaw ?? 0;
      this.occluder.rotation.x = pose.pitch ?? 0;
      this.occluder.rotation.z = -pose.rotationZ;
    } else {
      this.occluder.visible = false;
    }

    // Far-side earring fade when head turns past ~35 degrees (|yaw| > 0.61 rad)
    let rootOpacity = this.currentOpacity;
    let secOpacity  = this.currentOpacity;
    if (pose.secondaryPosition && pose.yaw !== undefined) {
      const FAR_YAW_THRESHOLD = 0.61; // ~35 deg
      const FAR_YAW_MAX = 0.85;       // ~48.7 deg
      const absYaw = Math.abs(pose.yaw);
      if (absYaw > FAR_YAW_THRESHOLD) {
        const fade = Math.max(0, 1 - (absYaw - FAR_YAW_THRESHOLD) / (FAR_YAW_MAX - FAR_YAW_THRESHOLD));
        const primaryIsSmallerX = pose.position.x < pose.secondaryPosition.x;
        if (pose.yaw > 0) {
          if (primaryIsSmallerX) {
            rootOpacity *= fade;
          } else {
            secOpacity *= fade;
          }
        } else {
          if (primaryIsSmallerX) {
            secOpacity *= fade;
          } else {
            rootOpacity *= fade;
          }
        }
      }
    }

    // Apply primary. Keep jewellery in a thin overlay slab so landmark-z
    // does not make metal swim toward/away from the camera.
    const s = worldScaleForKind(kind, pose.scale);
    const yaw = pose.rotationY ?? pose.yaw ?? 0;
    const pitch = pose.rotationX ?? pose.pitch ?? 0;
    const earPush = Math.max(-14, Math.min(14, yaw * 16));
    if (rootOpacity > 0.01) {
      this.root.visible = true;
      this.root.position.set(pose.position.x, pose.position.y, 4 + earPush);
      this.root.rotation.set(pitch, yaw, -pose.rotationZ);
      this.root.scale.setScalar(s);
      this._setGroupOpacity(this.root, rootOpacity);
    } else {
      this.root.visible = false;
    }

    // Apply secondary.
    if (pose.secondaryPosition && secOpacity > 0.01) {
      this.secondary.visible = true;
      this.secondary.position.set(
        pose.secondaryPosition.x,
        pose.secondaryPosition.y,
        4 - earPush,
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

  getOccluder(): THREE.Mesh {
    return this.occluder;
  }

  clearJewellery(): void {
    this._clearGroups();
    this.ready = false;
    this.currentAssetUrl = null;
    this.root.visible = false;
    this.secondary.visible = false;
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
    this.assetCache.forEach((entry) => this._disposeGroup(entry.group, true));
    this.assetCache.clear();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.envTexture?.dispose();
    this.envTexture = null;
    this.scene.environment = null;
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
    this._disposeGroup(this.root, this.instanceOwnsGeometry);
    this._disposeGroup(this.secondary, this.instanceOwnsGeometry);
    this.root.clear();
    this.secondary.clear();
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
          // Dispose all texture maps
          if ('map' in m && (m as THREE.MeshStandardMaterial).map) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
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
  hook.position.y = 0.18;

  const connector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.12, 12), gold,
  );
  connector.position.y = 0.02;

  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), gold);
  bead.position.y = -0.06;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.14, 12), gold,
  );
  stem.position.y = -0.22;

  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.20, 32, 32), gold);
  drop.scale.set(0.78, 1.18, 0.78);
  drop.position.y = -0.40;

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
  if (k.includes('BANGLE') || k.includes('BRACELET') || k.includes('WATCH')) return s * 28;
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

  // Visible chain symmetrically positioned around the neck
  const chainArc = Math.PI * 1.45;
  const chain = new THREE.Mesh(
    new THREE.TorusGeometry(1.65, 0.08, 16, 72, chainArc),
    gold,
  );
  chain.rotation.x = Math.PI * 0.58;
  chain.rotation.z = -0.225 * Math.PI;
  chain.position.set(0, 0, 0.15);

  const innerArc = Math.PI * 1.35;
  const innerChain = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.045, 12, 64, innerArc),
    gold,
  );
  innerChain.rotation.x = Math.PI * 0.58;
  innerChain.rotation.z = -0.175 * Math.PI;
  innerChain.position.set(0, 0.12, 0.12);

  // Pendant bail and drop hang down (+Y in screen orthographic)
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 12, 24), gold);
  bail.position.set(0, 1.65, 0.2);

  const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), gem);
  pendant.scale.set(0.85, 1.35, 0.85);
  pendant.position.set(0, 2.05, 0.22);

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

function createSolitaireRing(): THREE.Group {
  const group = new THREE.Group();
  const gold = createGoldMaterial();
  const gem = createGemMaterial();

  // Finger band encircling finger (perpendicular to finger axis Y)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 16, 32), gold);
  band.rotation.x = Math.PI * 0.5;

  // Raised crown collet facing outward (+Z toward viewer)
  const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.12, 12), gold);
  collet.rotation.x = Math.PI * 0.5;
  collet.position.set(0, -0.32, 0.06);

  // Center Solitaire facing outward (+Z)
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gem);
  stone.position.set(0, -0.32, 0.16);

  group.add(band, collet, stone);
  return group;
}

function createKadaBangle(): THREE.Group {
  const group = new THREE.Group();
  const gold = createGoldMaterial();

  // Main cuff encircling the wrist (tilted for 3D wrist perspective)
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.075, 20, 48), gold);
  cuff.rotation.x = Math.PI * 0.5;

  // Twin ornamental terminal knobs
  const leftKnob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), gold);
  leftKnob.position.set(-0.8, 0, 0);

  const rightKnob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), gold);
  rightKnob.position.set(0.8, 0, 0);

  group.add(cuff, leftKnob, rightKnob);
  return group;
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
