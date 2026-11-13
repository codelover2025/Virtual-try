import type { JewelleryKind } from '@vj/shared';
import { CameraEngine } from './camera/camera-engine.js';
import type { CameraHealthStatus } from './camera/camera-engine.js';
import { FaceDetector } from './detectors/face-detector.js';
import { HandDetector } from './detectors/hand-detector.js';
import { PoseDetector } from './detectors/pose-detector.js';
import { AnchorRegistry } from './anchors/anchor-registry.js';
import { LandmarkProcessor } from './landmarks/landmark-processor.js';
import { PoseFitter } from './fitting/pose-fitter.js';
import { TrackingEngine } from './tracking/tracking-engine.js';
import { AdaptiveController } from './performance/adaptive-controller.js';
import type { QualityTier } from './performance/adaptive-controller.js';
import { FpsMeter } from './performance/fps-meter.js';
import { Canvas2dRenderer } from './renderers/canvas2d-renderer.js';
import { ThreeRenderer } from './renderers/three-renderer.js';
import { CaptureCompositor } from './capture/capture-compositor.js';
import { LightingEstimator } from './imaging/lighting-estimator.js';
import { BodyModelEstimator } from './landmarks/body-model-estimator.js';
import type { BodyModelMeasurements } from './landmarks/body-model-estimator.js';
import { initTfBackend } from './models/tf-backend.js';
import type { ModelAdapter } from './models/model-adapter.js';
import { isFaceCentered } from './tracking/face-guide-state.js';
import { mapPoseToCanvas } from './utils/coordinate-transform.js';
import type {
  ArEngineConfig,
  ArEngineEvents,
  BangleConfig,
  CaptureOptions,
  CaptureResult,
  JewelleryConfig,
  LandmarkResult,
  PoseFit,
  RingConfig,
  TrackingStatus,
} from './types.js';

export type ArEngineHost = {
  video:          HTMLVideoElement;
  overlayCanvas:  HTMLCanvasElement;
  threeCanvas?:   HTMLCanvasElement;
};

type Listener = (events: ArEngineEvents) => void;

const FACE_LANDMARK_KEYS = [
  'LEFT_EAR_LOBE', 'RIGHT_EAR_LOBE', 'NOSE_TIP',
  'LEFT_EYE', 'RIGHT_EYE', 'CHIN', 'MOUTH', 'NECKLACE_ANCHOR',
  'FOREHEAD_CENTER', 'MAANG_TIKKA',
];

const HAND_LANDMARK_KEYS = [
  'WRIST', 'BANGLE_ANCHOR', 'WATCH_ANCHOR',
  'RING_SLOT_1', 'RING_SLOT_2', 'RING_SLOT_3',
  'index_finger_mcp', 'ring_finger_mcp',
];

// Suppress benign TensorFlow Lite / Emscripten C++ stderr info logs (e.g. "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.")
// which are mapped to console.error by Emscripten and otherwise trigger Next.js 15 dev error overlay.
if (typeof window !== 'undefined' && !(window as any).__tfliteLogFiltered) {
  (window as any).__tfliteLogFiltered = true;
  const originalError = window.console.error;
  window.console.error = function (...args: any[]) {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (
      first.startsWith('INFO:') ||
      first.includes('Created TensorFlow Lite') ||
      first.includes('XNNPACK delegate')
    ) {
      console.info(...args);
      return;
    }
    originalError.apply(window.console, args);
  };
}

/**
 * Phase 2 – Production AR try-on engine facade.
 *
 * New capabilities over Phase 1:
 * - `setJewellery()`: hot-swap jewellery without stopping the camera.
 * - `captureHQ()`: returns both full-res and thumbnail blobs.
 * - `preloadAssets()`: warms up the image/model cache before user interaction.
 * - `setLowPowerMode()`: reduces detection frequency when page is background.
 * - Full error recovery with exponential back-off.
 * - Asset lazy-loading: load model only when tracking first acquires.
 * - Camera permission recovery path.
 * - Frame budget enforcement: skips render when behind budget.
 * - Camera health monitoring with auto-reconnect.
 * - Quality tier adaptation based on device performance.
 * - Comprehensive metrics for analytics integration.
 * - Watermark support for captured images.
 */
export class ArEngine {
  private readonly camera    = new CameraEngine();
  private readonly processor = new LandmarkProcessor();
  private readonly tracker   = new TrackingEngine();
  private readonly fpsMeter  = new FpsMeter();
  private readonly capture   = new CaptureCompositor();
  private readonly lighting  = new LightingEstimator();
  private adaptive           = new AdaptiveController(28);

  private detector:       ModelAdapter | null = null;
  private fitter:         PoseFitter   | null = null;
  private canvasRenderer: Canvas2dRenderer | null = null;
  private threeRenderer:  ThreeRenderer    | null = null;

  private host:   ArEngineHost  | null = null;
  private config: ArEngineConfig | null = null;

  private raf          = 0;
  private running      = false;
  private detecting    = false;
  private frameIndex   = 0;
  private mirrored     = true;
  private debugLandmarks = false;
  private lastRenderTier: QualityTier | null = null;

  private lastPose:      PoseFit       | null = null;
  private lastLandmarks: LandmarkResult | null = null;
  private lastLuma:      number | null = null;

  private readonly bodyModel = new BodyModelEstimator();
  private fineTuneScale = 1.0;
  private fineTuneOffsetY = 0;

  private status: TrackingStatus = 'INITIALIZING';
  private listeners = new Set<Listener>();

  // Error recovery
  private recoverAttempts = 0;
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;
  private maxRecoverAttempts = 8;

  // Asset loading deferred flag
  private assetLoaded = false;
  private assetLoadingPromise: Promise<void> | null = null;

  // ─── Event bus ─────────────────────────────────────────────────────────────

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  async start(host: ArEngineHost, config: ArEngineConfig): Promise<void> {
    this.host    = host;
    this.config  = config;
    this.mirrored = config.mirroredPreview ?? true;
    this.debugLandmarks = config.debugLandmarks ?? false;
    this.adaptive = new AdaptiveController(config.targetFps ?? 28);

    if (typeof window !== 'undefined') {
      (window as any).__arEngine = this;
      (window as any).__toggleRingDebugAxes = () => this.toggleDebugAxes();
      (window as any).__setRingDebugAxes = (s: boolean) => this.setDebugAxes(s);
    }

    await initTfBackend();

    // Camera with permission recovery
    try {
      await this.camera.init(host.video, { facing: 'user' });
    } catch (err) {
      try {
        await this.camera.recoverPermission();
      } catch {
        throw err;
      }
    }

    // Camera health monitoring
    this.camera.onHealthChange((status) => {
      if (status === 'RECONNECTING' || status === 'DEAD') {
        this.emit({
          status: this.status,
          fps: this.fpsMeter.getFps(),
          error: `Camera ${status.toLowerCase()}`,
        });
        if (status === 'DEAD') {
          this.scheduleRecovery();
        }
      }
    });

    // Detector (lazy-loaded based on category)
    const registration = AnchorRegistry.get(config.jewelleryKind);
    this.detector = this._createDetector(registration.detector);
    await this.detector.load();

    // Tracking engine with status callback
    this.tracker.reset();
    this.tracker.setStatusChangeCallback((s) => {
      this.status = s;
      if (s === 'LOST') this.scheduleRecovery();
    });

    // Fitter
    const profile = AnchorRegistry.mergeProfile(config.jewelleryKind, config.anchorProfile);
    this.fitter = new PoseFitter(profile, {
      scale:         config.defaultScale    ?? 1,
      rotationZ:     ((config.defaultRotationZ ?? 0) * Math.PI) / 180,
      fingerIndex:   config.fingerIndex,
      jewelleryKind: config.jewelleryKind,
    });
    this.fitter.setFineTune(this.fineTuneScale, this.fineTuneOffsetY);

    // Renderers
    const ctx = host.overlayCanvas.getContext('2d');
    if (!ctx) throw new Error('overlay canvas 2d context missing');
    this.canvasRenderer = new Canvas2dRenderer(host.overlayCanvas, ctx);

    await this._loadAsset(config);

    this.syncCanvasSizes();
    this.running = true;
    this.processor.reset();
    this.frameIndex = 0;
    this.loop();
  }

  // ─── Dynamic jewellery hot-swap ────────────────────────────────────────────

  async setJewellery(config: JewelleryConfig): Promise<void> {
    if (!this.host || !this.canvasRenderer) return;

    const isRingSwap = this.config?.jewelleryKind === 'RINGS' && config.jewelleryKind === 'RINGS';
    const isBangleSwap = this.config?.jewelleryKind === 'BANGLES' && config.jewelleryKind === 'BANGLES';

    if (!isRingSwap && !isBangleSwap) {
      // Fully clear previous active asset from both renderers
      if (this.threeRenderer) {
        this.threeRenderer.clearJewellery();
      }
      this.canvasRenderer.clearJewellery();

      // Update fitter for new kind / anchor.
      const profile = AnchorRegistry.mergeProfile(config.jewelleryKind, config.anchorProfile);
      this.fitter = new PoseFitter(profile, {
        scale:         config.defaultScale    ?? 1,
        rotationZ:     ((config.defaultRotationZ ?? 0) * Math.PI) / 180,
        fingerIndex:   config.fingerIndex,
        jewelleryKind: config.jewelleryKind,
      });
      this.fitter.setFineTune(this.fineTuneScale, this.fineTuneOffsetY);
    }

    // If kind changed, swap detector (lazy load only what is needed).
    const registration = AnchorRegistry.get(config.jewelleryKind);
    const needsNewDetector = !this.detector || this.detector.name !== registration.detector;
    const kindChanged = this.config?.jewelleryKind !== config.jewelleryKind;

    if (needsNewDetector) {
      this.detector?.dispose();
      this.detector = this._createDetector(registration.detector);
      await this.detector.load();
      this.processor.reset();
      this.tracker.reset();
    }

    if (kindChanged) {
      this.lastPose = null;
      this.lastLandmarks = null;
      this.bodyModel.reset();
    }

    // Load the new asset without restarting the camera or render loop.
    await this._loadAsset(config);

    // Keep session flags (mirror, fps, debug) while replacing jewellery fields.
    this.config = { ...(this.config ?? {}), ...config };

    this.emit({ status: this.status, fps: this.fpsMeter.getFps(), assetReady: true });
  }

  // ─── Asset preloading ──────────────────────────────────────────────────────

  async preloadAssets(urls: string[]): Promise<void> {
    await Promise.allSettled(
      urls.map((url) => {
        if (url.endsWith('.glb') || url.endsWith('.gltf')) {
          // Warm the GLB cache only — never swap the live mesh.
          return this.threeRenderer?.warmCache(url) ?? Promise.resolve();
        }
        return this.canvasRenderer?.preload(url) ?? Promise.resolve();
      }),
    );
  }

  // ─── Camera controls ───────────────────────────────────────────────────────

  setMirrored(on: boolean): void {
    this.mirrored = on;
  }

  isMirrored(): boolean {
    return this.mirrored;
  }

  getFacing(): 'user' | 'environment' {
    return this.camera.getFacing();
  }

  async flipCamera(): Promise<void> {
    await this.camera.flip();
    this.mirrored = this.camera.getFacing() === 'user';
  }

  async switchDevice(deviceId: string): Promise<void> {
    await this.camera.switchDevice(deviceId);
  }

  async optimizeStream(targetFps: number, width: number, height: number): Promise<void> {
    await this.camera.optimizeStream(targetFps, width, height);
  }

  async setTorch(on: boolean): Promise<void> {
    await this.camera.setTorch(on);
  }

  async setZoom(level: number): Promise<void> {
    await this.camera.setZoom(level);
  }

  static listCameras(): Promise<MediaDeviceInfo[]> {
    return CameraEngine.listDevices();
  }

  static listCameraCapabilities() {
    return CameraEngine.listCapabilities();
  }

  // ─── Universal Fit & Fine-Tuning ──────────────────────────────────────────

  setFineTune(scaleMultiplier = 1.0, offsetY = 0): void {
    this.fineTuneScale = scaleMultiplier;
    this.fineTuneOffsetY = offsetY;
    this.fitter?.setFineTune(scaleMultiplier, offsetY);
  }

  private necklaceStyle: 'layered' | 'choker' | 'long_chain' = 'layered';

  setNecklaceStyle(style: 'layered' | 'choker' | 'long_chain'): void {
    this.necklaceStyle = style;
  }

  getNecklaceStyle(): 'layered' | 'choker' | 'long_chain' {
    return this.necklaceStyle;
  }

  getBodyModel(): BodyModelMeasurements {
    return this.bodyModel.getMeasurements();
  }

  // ─── Capture ───────────────────────────────────────────────────────────────

  async captureBlob(): Promise<Blob> {
    if (!this.host) throw new Error('Engine not started');
    const sources: Array<HTMLCanvasElement | HTMLVideoElement> = [
      this.host.video,
      this.host.overlayCanvas,
    ];
    if (this.host.threeCanvas) sources.push(this.host.threeCanvas);
    return this.capture.toBlob(sources, this.mirrored);
  }

  async captureHQ(options: CaptureOptions = {}): Promise<CaptureResult> {
    if (!this.host) throw new Error('Engine not started');

    const sources: Array<HTMLCanvasElement | HTMLVideoElement> = [
      this.host.video,
      this.host.overlayCanvas,
    ];
    if (this.host.threeCanvas) sources.push(this.host.threeCanvas);

    return this.capture.captureHQ(sources, this.mirrored, options);
  }

  /** Set a watermark to apply to all captures. */
  setWatermark(config: { text: string; position?: 'bottom-right' | 'bottom-left' | 'bottom-center'; opacity?: number } | null): void {
    this.capture.setWatermark(config);
  }

  // ─── Status / metrics ──────────────────────────────────────────────────────

  getStatus(): TrackingStatus {
    return this.status;
  }

  getFps(): number {
    return this.fpsMeter.getFps();
  }

  getMetrics() {
    return {
      fps:            this.fpsMeter.getFps(),
      latencyMs:      this.fpsMeter.getMeanLatency(),
      p95LatencyMs:   this.fpsMeter.getP95Latency(),
      p99LatencyMs:   this.fpsMeter.getP99Latency(),
      droppedFrames:  this.fpsMeter.getDroppedFrames(),
      jankFrames:     this.fpsMeter.getJankFrames(),
      status:         this.status,
      qualityTier:    this.adaptive.getQualityTier(),
      detectEveryN:   this.adaptive.getDetectEveryN(),
      detectScale:    this.adaptive.getDetectScale(),
      frameBudgetMs:  this.adaptive.getFrameBudgetMs(),
      thermalPressure: this.adaptive.getMetrics().thermalPressure,
      tracking:       this.tracker.getMetrics(),
      cameraHealth:   this.camera.getHealthStatus(),
      cameraResolution: this.camera.getResolution(),
    };
  }

  setLowPowerMode(on: boolean): void {
    this.adaptive.setLowPowerMode(on);
  }

  // ─── Stop ──────────────────────────────────────────────────────────────────

  stop(): void {
    this.running = false;
    this.detecting = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastRenderTier = null;
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    this.detector?.dispose();
    this.threeRenderer?.dispose();
    this.canvasRenderer?.dispose();
    this.camera.dispose();
    this.processor.reset();
    this.tracker.reset();
    this.fpsMeter.reset();
    this.adaptive.reset();
    this.detector       = null;
    this.fitter         = null;
    this.canvasRenderer = null;
    this.threeRenderer  = null;
    this.host           = null;
    this.lastPose       = null;
    this.lastLandmarks  = null;
    this.recoverAttempts = 0;
    this.assetLoaded     = false;
    this.assetLoadingPromise = null;
    this.bodyModel.reset();
    this.fineTuneScale = 1.0;
    this.fineTuneOffsetY = 0;
    this.config = null;
  }

  // ─── Frame loop ────────────────────────────────────────────────────────────
  // Render stays on rAF. Detection runs in the background so a slow MediaPipe
  // call cannot stall jewellery updates into stop-motion.

  private loop = (): void => {
    if (!this.running || !this.host || !this.detector || !this.fitter || !this.canvasRenderer) return;

    const t0 = performance.now();

    try {
      const video = this.host.video;

      if (video.readyState >= 2) {
        if (
          this.host.overlayCanvas.width !== video.videoWidth &&
          video.videoWidth > 0
        ) {
          this.syncCanvasSizes();
        }

        this.canvasRenderer.clear();

        const tier = this.adaptive.getQualityTier();
        if (this.threeRenderer && tier !== this.lastRenderTier) {
          this.threeRenderer.setRenderQuality(tier);
          this.lastRenderTier = tier;
        }

        const skipExtras = this.adaptive.shouldSkipRender();

        if (!skipExtras && this.frameIndex % 16 === 0) {
          const size = this.lastPose?.scale ? this.lastPose.scale * 4 : video.videoWidth * 0.35;
          const sampleX = this.lastPose ? this.lastPose.position.x : video.videoWidth / 2;
          const luma = this.lighting.estimate(video, {
            x: sampleX,
            y: this.lastPose?.position.y ?? video.videoHeight / 2,
            size,
          });
          this.lastLuma = luma;
          if (this.threeRenderer) {
            this.threeRenderer.setExposure(luma);
          }
        }

        if (this.adaptive.shouldDetect(this.frameIndex) && !this.detecting) {
          void this.runDetection();
        }

        const pose = this.fitter.fit(this.lastLandmarks);
        this.lastPose = pose;
        this.status   = this.tracker.update(pose);

        if (this.status === 'TRACKING') {
          this.recoverAttempts = Math.max(0, this.recoverAttempts - 1);
        }

        const videoW = video.videoWidth || this.host.overlayCanvas.width;
        const videoH = video.videoHeight || this.host.overlayCanvas.height;
        const canvasW = this.host.overlayCanvas.width;
        const canvasH = this.host.overlayCanvas.height;

        const renderPose = mapPoseToCanvas(pose, {
          videoWidth: videoW,
          videoHeight: videoH,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          isMirrored: false, // The parent DOM wrapper (camera-mirror-wrapper) already applies CSS -scale-x-100 to mirror both video and canvas on screen.
          fit: 'cover',
        });

        if (this.status !== 'LOST' && renderPose.visible) {
          const is3d = this.is3DAsset(this.config);
          const kind = this.config?.jewelleryKind;
          if (is3d && this.threeRenderer) {
            this.threeRenderer.render(renderPose, kind);
          } else if (!is3d && this.canvasRenderer) {
            // Sort by depth (z) so far earring renders first and near earring renders in front
            const isEarring =
              (kind?.toUpperCase().includes('EARRING') ?? false) ||
              (this.config?.assetUrl?.includes('earring') ?? false);
            const isNecklace =
              (kind?.toUpperCase().includes('NECK') ?? false) ||
              (kind?.toUpperCase().includes('PENDANT') ?? false) ||
              (kind?.toUpperCase().includes('MANGALSUTRA') ?? false);

            if (isEarring && renderPose.secondaryPosition) {
              const rz = renderPose.position.z;
              const sz = renderPose.secondaryPosition.z;
              let primaryIsFar = false;
              if (rz !== undefined && sz !== undefined && Math.abs(rz - sz) > 0.5) {
                primaryIsFar = rz > sz; // in MediaPipe, larger z is farther
              } else if (renderPose.yaw !== undefined) {
                primaryIsFar = renderPose.yaw > 0
                  ? renderPose.position.x > renderPose.secondaryPosition.x
                  : renderPose.position.x < renderPose.secondaryPosition.x;
              }
              if (primaryIsFar) {
                this.canvasRenderer.drawJewellery(renderPose, false, kind);
                this.canvasRenderer.drawJewellery(renderPose, true, kind);
              } else {
                this.canvasRenderer.drawJewellery(renderPose, true, kind);
                this.canvasRenderer.drawJewellery(renderPose, false, kind);
              }
            } else if (isNecklace && renderPose.secondaryPosition) {
              // Necklace display modes:
              // 'layered' (default): renders both Choker (primary) and Long Chain (secondary)
              // 'choker': renders only the Choker
              // 'long_chain': renders only the Long Chain
              if (this.necklaceStyle === 'layered') {
                this.canvasRenderer.drawJewellery(renderPose, true, kind);  // Long chain behind
                this.canvasRenderer.drawJewellery(renderPose, false, kind); // Choker in front
              } else if (this.necklaceStyle === 'long_chain') {
                this.canvasRenderer.drawJewellery(renderPose, true, kind);
              } else {
                this.canvasRenderer.drawJewellery(renderPose, false, kind);
              }
            } else {
              this.canvasRenderer.drawJewellery(renderPose, false, kind);
            }
          }
        } else if (this.is3DAsset(this.config) && this.threeRenderer) {
          this.threeRenderer.render(
            { ...renderPose, visible: renderPose.visible && this.status !== 'LOST' },
            this.config?.jewelleryKind,
          );
        }

        if (this.debugLandmarks && this.canvasRenderer) {
          this.canvasRenderer.drawDebugOverlay({
            landmarks: this.lastLandmarks,
            pose,
            fps: Math.round(this.fpsMeter.getFps()),
            latencyMs: performance.now() - t0,
            status: this.status,
          });
        }
      }
    } catch (err) {
      this.emit({
        status:    this.status,
        fps:       this.fpsMeter.getFps(),
        error:     err instanceof Error ? err.message : 'AR frame error',
      });
      this.scheduleRecovery();
    }

    const dt = performance.now() - t0;
    this.adaptive.recordFrameMs(dt);
    const fps = this.fpsMeter.tick();

    let promptMessage: string | undefined;
    let shouldersVisible: boolean | undefined;

    if (this.lastLuma != null && this.lastLuma < 0.20 && this.status === 'TRACKING') {
      promptMessage = 'Please increase lighting';
    }

    if (this.lastLandmarks?.kind === 'pose') {
      shouldersVisible = this.lastLandmarks.shouldersVisible !== false;
      const neckKind = this.config?.jewelleryKind;
      if (
        !shouldersVisible &&
        (neckKind === 'NECKLACE' || neckKind === 'PENDANT' || neckKind === 'MANGALSUTRA')
      ) {
        promptMessage = 'Step back so shoulders are visible';
      }
    }

    if (this.lastLandmarks?.kind === 'hand') {
      const wrist = this.lastLandmarks.named['WRIST'];
      const videoW = this.host?.video.videoWidth || 640;
      const videoH = this.host?.video.videoHeight || 480;
      if (
        wrist &&
        (wrist.x < videoW * 0.05 ||
          wrist.x > videoW * 0.95 ||
          wrist.y < videoH * 0.05 ||
          wrist.y > videoH * 0.95)
      ) {
        promptMessage = 'Show your full hand';
      }
    } else if (
      this.detector?.name === 'hand' &&
      !this.lastLandmarks &&
      (this.config?.jewelleryKind === 'RINGS' ||
        this.config?.jewelleryKind === 'BANGLES' ||
        this.config?.jewelleryKind === 'BRACELET' ||
        this.config?.jewelleryKind === 'WATCH')
    ) {
      promptMessage = 'Show your hand to the camera';
    }

    if (this.lastLandmarks) {
      this.bodyModel.estimate(this.lastLandmarks);
    }

    let faceCentered = false;
    if (this.status === 'TRACKING' && this.lastLandmarks) {
      const p =
        this.lastLandmarks.named['NOSE'] ??
        this.lastLandmarks.named['NOSE_TIP'] ??
        this.lastLandmarks.named['CHIN'] ??
        this.lastLandmarks.named['NECK_BASE'];
      const videoW = this.host?.video.videoWidth || this.host?.overlayCanvas.width || 640;
      const videoH = this.host?.video.videoHeight || this.host?.overlayCanvas.height || 480;
      if (p && videoW > 0 && videoH > 0) {
        faceCentered = isFaceCentered(p, { width: videoW, height: videoH });
      } else {
        faceCentered = true;
      }
    }

    this.emit({
      status: this.status,
      fps,
      latencyMs: dt,
      shouldersVisible,
      promptMessage,
      faceCentered,
    });
    this.frameIndex += 1;
    if (this.running) {
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private async runDetection(): Promise<void> {
    if (this.detecting || !this.detector || !this.host) return;
    this.detecting = true;
    try {
      const raw = await this.detector.estimate(this.host.video);
      if (!this.running) return;
      const { result } = this.processor.process(raw);
      this.lastLandmarks = result;
    } catch {
      // Keep previous landmarks.
    } finally {
      this.detecting = false;
    }
  };

  // ─── Private helpers ───────────────────────────────────────────────────────

  is3DAsset(config?: JewelleryConfig | null): boolean {
    if (!config) return false;
    if (config.jewelleryKind === 'RINGS' || config.jewelleryKind === 'BANGLES') return true;
    const type = String(config.assetType);
    if (type === 'IMAGE_OVERLAY' || type === 'IMAGE_2D') return false;
    if (
      type === 'MODEL_GLB' ||
      type === 'MODEL_GLTF' ||
      type === 'MODEL_3D' ||
      type === 'PROCEDURAL'
    ) {
      return true;
    }
    const url = config.assetUrl || '';
    if (url.startsWith('procedural://')) return true;
    if (url.endsWith('.glb') || url.endsWith('.gltf')) return true;
    return false;
  }

  getThreeRenderer(): ThreeRenderer | null {
    return this.threeRenderer;
  }

  setDebugAxes(show: boolean): void {
    this.threeRenderer?.setDebugAxes(show);
  }

  toggleDebugAxes(): boolean {
    return this.threeRenderer?.toggleDebugAxes() ?? false;
  }

  isDebugAxes(): boolean {
    return this.threeRenderer?.isDebugAxes() ?? false;
  }

  switchRing(configOrId: RingConfig | string): void {
    this.threeRenderer?.switchRing(configOrId);
  }

  switchBangle(configOrId: BangleConfig | string): void {
    this.threeRenderer?.switchBangle(configOrId);
  }

  getCanvasRenderer(): Canvas2dRenderer | null {
    return this.canvasRenderer;
  }

  getActiveConfig(): JewelleryConfig | null {
    return this.config;
  }

  private async _loadAsset(config: JewelleryConfig): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this._loadAssetOnce(config);
        return;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 280 * (attempt + 1)));
      }
    }
    this.emit({
      status: this.status,
      fps: this.fpsMeter.getFps(),
      error: lastError instanceof Error ? lastError.message : 'Asset loading failed',
    });
    throw lastError instanceof Error ? lastError : new Error('Asset loading failed');
  }

  private async _loadAssetOnce(config: JewelleryConfig): Promise<void> {
    if (!this.host || !this.canvasRenderer) return;

    const use3d = this.is3DAsset(config);

    if (use3d && this.host.threeCanvas) {
      // Clear 2D renderer so no lingering 2D image is drawn
      this.canvasRenderer.clearJewellery();

      if (!this.threeRenderer) {
        this.threeRenderer = new ThreeRenderer(this.host.threeCanvas);
        this.threeRenderer.setVideoSource(this.host.video);
        this.syncCanvasSizes();
      } else {
        this.threeRenderer.setVideoSource(this.host.video);
      }

      if (config.jewelleryKind === 'RINGS') {
        const ringSpec = config.ringConfig || config.productId || config.assetUrl;
        this.threeRenderer.switchRing(ringSpec);
      } else if (config.jewelleryKind === 'BANGLES') {
        const bangleSpec = config.bangleConfig || config.productId || config.assetUrl;
        this.threeRenderer.switchBangle(bangleSpec);
      } else {
        this.threeRenderer.clearJewellery();
        const modelUrl = (config.assetUrl?.endsWith('.glb') || config.assetUrl?.endsWith('.gltf'))
          ? config.assetUrl
          : `procedural://${config.jewelleryKind.toLowerCase()}`;
        await this.threeRenderer.loadModel(
          modelUrl,
          config.mirrorForOppositeEar ?? (config.jewelleryKind === 'EARRINGS'),
        );
      }
    } else {
      // Clear 3D renderer completely so previous mesh does not remain frozen
      if (this.threeRenderer) {
        this.threeRenderer.clearJewellery();
      }
      this.canvasRenderer.clearJewellery();

      if (config.assetUrl && !config.assetUrl.startsWith('procedural://')) {
        try {
          await this.canvasRenderer.loadOverlay(
            config.assetUrl,
            config.mirrorForOppositeEar ?? false,
          );
        } catch {
          this._loadProceduralFallback(config);
        }
      } else {
        this._loadProceduralFallback(config);
      }
    }

    this.assetLoaded = true;
  }

  private _loadProceduralFallback(config: JewelleryConfig): void {
    if (!this.host?.threeCanvas) return;
    if (!this.threeRenderer) {
      this.threeRenderer = new ThreeRenderer(this.host.threeCanvas);
      this.threeRenderer.setVideoSource(this.host.video);
      this.syncCanvasSizes();
    } else {
      this.threeRenderer.setVideoSource(this.host.video);
    }
    this.threeRenderer.loadProcedural(
      config.jewelleryKind.toLowerCase(),
      config.mirrorForOppositeEar ?? (config.jewelleryKind === 'EARRINGS'),
    );
  }

  private syncCanvasSizes(): void {
    if (!this.host) return;
    const video = this.host.video;
    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;
    this.host.overlayCanvas.width  = w;
    this.host.overlayCanvas.height = h;
    if (this.host.threeCanvas) {
      this.host.threeCanvas.width  = w;
      this.host.threeCanvas.height = h;
      this.threeRenderer?.resize(w, h);
    }
  }

  private mirrorPose(pose: PoseFit, width: number): PoseFit {
    if (!this.mirrored) return pose;
    return {
      ...pose,
      position: { x: width - pose.position.x, y: pose.position.y },
      secondaryPosition: pose.secondaryPosition
        ? { x: width - pose.secondaryPosition.x, y: pose.secondaryPosition.y }
        : undefined,
      rotationZ: -pose.rotationZ,
      yaw: pose.yaw !== undefined ? -pose.yaw : undefined,
      rotationY: pose.rotationY !== undefined ? -pose.rotationY : undefined,
    };
  }

  private scheduleRecovery(): void {
    if (this.recoverAttempts >= this.maxRecoverAttempts) return;
    if (this.recoverTimer) return; // already scheduled

    const delay = Math.min(200 * Math.pow(1.6, this.recoverAttempts), 4000);
    this.recoverAttempts += 1;

    this.recoverTimer = setTimeout(() => {
      this.recoverTimer = null;
      try {
        this.processor.reset();
        this.tracker.reset();
        this.fitter?.reset?.();
        this.recoverAttempts = Math.max(0, this.recoverAttempts - 1);
      } catch {
        // ignore
      }
    }, delay);
  }

  private _createDetector(detectorKind: 'face' | 'hand' | 'pose'): ModelAdapter {
    switch (detectorKind) {
      case 'pose':
        return new PoseDetector();
      case 'hand':
        return new HandDetector();
      case 'face':
      default:
        return new FaceDetector();
    }
  }

  private emit(events: ArEngineEvents): void {
    for (const listener of this.listeners) listener(events);
  }
}

export function detectorForKind(kind: JewelleryKind): 'face' | 'hand' | 'pose' {
  return AnchorRegistry.get(kind).detector;
}
