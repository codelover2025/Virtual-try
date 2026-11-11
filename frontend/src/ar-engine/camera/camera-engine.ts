import type { CameraFacing } from '../types.js';

export type CameraEngineOptions = {
  facing?: CameraFacing;
  deviceId?: string;
  width?: number;
  height?: number;
  frameRate?: number;
};

export type CameraCapabilities = {
  deviceId: string;
  label: string;
  facing: CameraFacing;
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  supportsTorch: boolean;
  supportsZoom: boolean;
};

export type CameraHealthStatus = 'ACTIVE' | 'PAUSED' | 'RECONNECTING' | 'DEAD';

type StreamHealthCallback = (status: CameraHealthStatus) => void;

// Resolution / FPS fallback ladder for adaptive constraint negotiation.
const CONSTRAINT_LADDER: Array<{ width: number; height: number; frameRate: number }> = [
  { width: 1280, height: 720,  frameRate: 30 },
  { width: 960,  height: 540,  frameRate: 30 },
  { width: 640,  height: 480,  frameRate: 30 },
  { width: 1920, height: 1080, frameRate: 30 },
  { width: 320,  height: 240,  frameRate: 15 },
];

/**
 * Phase 2 – Production Camera Engine.
 *
 * Enhancements:
 * - Auto-reconnect with exponential backoff on stream end/disconnect.
 * - Device-change listener: react to USB cam plug/unplug.
 * - Stream health monitoring: periodically checks track state.
 * - Warm-up frame detection: waits for first real video frame before resolving.
 * - Torch (flashlight) and zoom control for supported devices.
 * - Front/rear camera switching with state preservation.
 * - Graceful permission recovery path.
 */
export class CameraEngine {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private facing: CameraFacing = 'user';
  private activeDeviceId: string | null = null;
  private visibilityHandler: (() => void) | null = null;
  private deviceChangeHandler: (() => void) | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private healthStatus: CameraHealthStatus = 'DEAD';
  private healthCallback: StreamHealthCallback | null = null;

  // Reconnect state
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOptions: CameraEngineOptions = {};

  // Track-ended detection
  private trackEndedHandler: (() => void) | null = null;

  // ─── Init / Start ──────────────────────────────────────────────────────────

  async init(
    video: HTMLVideoElement,
    options: CameraEngineOptions = {},
  ): Promise<HTMLVideoElement> {
    this.video = video;
    this.facing = options.facing ?? 'user';
    this.lastOptions = options;
    await this.start(options);
    this._bindVisibilityPause();
    this._bindDeviceChangeListener();
    this._startHealthMonitor();
    return video;
  }

  async start(options: CameraEngineOptions = {}): Promise<void> {
    this.stopTracks();
    const facing = options.facing ?? this.facing;
    this.facing = facing;
    this.lastOptions = options;

    if (options.deviceId) {
      await this._startByDeviceId(options.deviceId, options);
      return;
    }

    await this._startWithFallback(facing, options);
  }

  // ─── Camera Flip ───────────────────────────────────────────────────────────

  async flip(): Promise<void> {
    const next: CameraFacing = this.facing === 'user' ? 'environment' : 'user';
    await this.start({ ...this.lastOptions, facing: next, deviceId: undefined });
    this.facing = next;
  }

  // ─── Device Switching ──────────────────────────────────────────────────────

  async switchDevice(deviceId: string): Promise<void> {
    await this.start({ ...this.lastOptions, deviceId });
  }

  // ─── Permission Recovery ───────────────────────────────────────────────────

  async recoverPermission(): Promise<void> {
    // Step 1: Try minimal constraints to re-prompt the browser dialog.
    try {
      const test = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      test.getTracks().forEach((t) => t.stop());
    } catch {
      // The user may have permanently blocked; we attempt again anyway.
    }

    // Step 2: Wait a beat for the browser to settle, then retry with original options.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await this.start(this.lastOptions);
  }

  // ─── Device List ───────────────────────────────────────────────────────────

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => { /* already granted or denied */ });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
  }

  static async listCapabilities(): Promise<CameraCapabilities[]> {
    const devices = await CameraEngine.listDevices();
    return Promise.all(devices.map(async (d) => {
      const label = d.label || `Camera ${d.deviceId.slice(0, 4)}`;
      const facing: CameraFacing = label.toLowerCase().includes('front') ||
        label.toLowerCase().includes('facetime') ? 'user' : 'environment';

      let supportsTorch = false;
      let supportsZoom = false;
      let maxWidth = 1920;
      let maxHeight = 1080;
      let maxFrameRate = 60;

      // Probe capabilities by briefly opening the device
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: d.deviceId } },
        });
        const track = probe.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min: number; max: number };
          } | undefined;
          if (caps) {
            supportsTorch = caps.torch === true;
            supportsZoom = !!(caps.zoom && caps.zoom.max > 1);
            maxWidth = (caps.width as { max?: number })?.max ?? maxWidth;
            maxHeight = (caps.height as { max?: number })?.max ?? maxHeight;
            maxFrameRate = (caps.frameRate as { max?: number })?.max ?? maxFrameRate;
          }
        }
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        // Probe failed; use defaults
      }

      return {
        deviceId: d.deviceId,
        label,
        facing,
        maxWidth,
        maxHeight,
        maxFrameRate,
        supportsTorch,
        supportsZoom,
      };
    }));
  }

  // ─── Stream Optimization ───────────────────────────────────────────────────

  /**
   * Applies optimal track constraints to the active stream
   * based on desired FPS and resolution targets.
   */
  async optimizeStream(targetFps: number, targetWidth: number, targetHeight: number): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        frameRate: { ideal: targetFps },
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
      });
    } catch {
      // Non-fatal; best-effort stream optimisation.
    }
  }

  // ─── Torch (Flashlight) ────────────────────────────────────────────────────

  async setTorch(on: boolean): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
    } catch {
      // Torch not supported on this device
    }
  }

  // ─── Zoom Control ──────────────────────────────────────────────────────────

  async setZoom(level: number): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as { zoom?: { min: number; max: number } } | undefined;
      if (caps?.zoom) {
        const clamped = Math.max(caps.zoom.min, Math.min(caps.zoom.max, level));
        await track.applyConstraints({
          advanced: [{ zoom: clamped } as unknown as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Zoom not supported
    }
  }

  // ─── Health Monitoring ──────────────────────────────────────────────────────

  onHealthChange(cb: StreamHealthCallback): void {
    this.healthCallback = cb;
  }

  getHealthStatus(): CameraHealthStatus {
    return this.healthStatus;
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getVideo(): HTMLVideoElement {
    if (!this.video) throw new Error('Camera not initialized');
    return this.video;
  }

  getFacing(): CameraFacing {
    return this.facing;
  }

  getActiveDeviceId(): string | null {
    return this.activeDeviceId;
  }

  getTrackSettings(): MediaTrackSettings | null {
    return this.stream?.getVideoTracks()[0]?.getSettings() ?? null;
  }

  isActive(): boolean {
    return !!(this.stream && this.stream.active);
  }

  getResolution(): { width: number; height: number } {
    const settings = this.getTrackSettings();
    return {
      width: settings?.width ?? 1280,
      height: settings?.height ?? 720,
    };
  }

  // ─── Dispose ───────────────────────────────────────────────────────────────

  dispose(): void {
    this._unbindVisibilityPause();
    this._unbindDeviceChangeListener();
    this._stopHealthMonitor();
    this._clearReconnect();
    this._unbindTrackEnded();
    this.stopTracks();
    if (this.video) {
      this.video.srcObject = null;
    }
    this.video = null;
    this._setHealth('DEAD');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _startWithFallback(
    facing: CameraFacing,
    options: CameraEngineOptions,
  ): Promise<void> {
    const preferredWidth = options.width ?? 1280;
    const preferredHeight = options.height ?? 720;
    const preferredFps = options.frameRate ?? 30;

    // Build a sorted ladder starting from the preferred resolution.
    const ladder = CONSTRAINT_LADDER.slice().sort((a, b) => {
      const da = Math.abs(a.width - preferredWidth) + Math.abs(a.frameRate - preferredFps);
      const db = Math.abs(b.width - preferredWidth) + Math.abs(b.frameRate - preferredFps);
      return da - db;
    });

    let lastError: unknown;
    for (const rung of ladder) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: facing,
            width: { ideal: rung.width, max: preferredWidth },
            height: { ideal: rung.height, max: preferredHeight },
            frameRate: { ideal: rung.frameRate, max: preferredFps },
          },
        });
        await this._attachStream();
        return;
      } catch (err) {
        lastError = err;
      }
    }

    // Absolute fallback: any camera.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing } },
      });
      await this._attachStream();
    } catch {
      throw lastError;
    }
  }

  private async _startByDeviceId(
    deviceId: string,
    options: CameraEngineOptions,
  ): Promise<void> {
    const preferredWidth = options.width ?? 1280;
    const preferredHeight = options.height ?? 720;
    const preferredFps = options.frameRate ?? 30;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: preferredWidth },
          height: { ideal: preferredHeight },
          frameRate: { ideal: preferredFps },
        },
      });
    } catch {
      // Retry without constraints.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
    }
    await this._attachStream();
  }

  private async _attachStream(): Promise<void> {
    if (!this.video) throw new Error('Camera video element missing');
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;

    const track = this.stream?.getVideoTracks()[0];
    this.activeDeviceId = track?.getSettings().deviceId ?? null;

    // Determine facing from the track settings or label.
    const settings = track?.getSettings();
    if (settings?.facingMode === 'environment') {
      this.facing = 'environment';
    } else if (settings?.facingMode === 'user') {
      this.facing = 'user';
    }

    // Bind track-ended for disconnect detection.
    this._bindTrackEnded(track ?? null);

    await this.video.play();

    // Wait for the first real video frame to ensure the camera is fully warmed up.
    await this._waitForFirstFrame();

    this.reconnectAttempts = 0;
    this._setHealth('ACTIVE');
  }

  /**
   * Waits until the video element has at least one decoded frame,
   * ensuring the camera feed is truly alive before we return.
   */
  private _waitForFirstFrame(): Promise<void> {
    const video = this.video;
    if (!video) return Promise.resolve();

    return new Promise<void>((resolve) => {
      if (video.readyState >= 3 && video.videoWidth > 0) {
        resolve();
        return;
      }
      let attempts = 0;
      const maxAttempts = 60; // ~1 second at 60fps
      const check = () => {
        attempts++;
        if ((video.readyState >= 3 && video.videoWidth > 0) || attempts >= maxAttempts) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }

  private stopTracks(): void {
    this._unbindTrackEnded();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.activeDeviceId = null;
  }

  // ─── Track-ended detection (camera disconnect) ─────────────────────────────

  private _bindTrackEnded(track: MediaStreamTrack | null): void {
    this._unbindTrackEnded();
    if (!track) return;
    this.trackEndedHandler = () => {
      this._setHealth('RECONNECTING');
      this._scheduleReconnect();
    };
    track.addEventListener('ended', this.trackEndedHandler);
  }

  private _unbindTrackEnded(): void {
    if (!this.trackEndedHandler || !this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    track?.removeEventListener('ended', this.trackEndedHandler);
    this.trackEndedHandler = null;
  }

  // ─── Auto-reconnect with exponential backoff ───────────────────────────────

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._setHealth('DEAD');
      return;
    }

    if (this.reconnectTimer) return; // already scheduled

    const delay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.start(this.lastOptions);
      } catch {
        this._scheduleReconnect();
      }
    }, delay);
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // ─── Device-change listener (USB plug/unplug) ──────────────────────────────

  private _bindDeviceChangeListener(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    this.deviceChangeHandler = () => {
      // If the active device is gone, try to reconnect
      if (this.activeDeviceId && !this.isActive()) {
        this._setHealth('RECONNECTING');
        this._scheduleReconnect();
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
  }

  private _unbindDeviceChangeListener(): void {
    if (this.deviceChangeHandler && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
  }

  // ─── Stream health monitor ─────────────────────────────────────────────────

  private _startHealthMonitor(): void {
    this._stopHealthMonitor();
    this.healthInterval = setInterval(() => {
      if (!this.stream || !this.stream.active) {
        if (this.healthStatus === 'ACTIVE') {
          this._setHealth('RECONNECTING');
          this._scheduleReconnect();
        }
        return;
      }
      const track = this.stream.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') {
        if (this.healthStatus === 'ACTIVE') {
          this._setHealth('RECONNECTING');
          this._scheduleReconnect();
        }
      }
    }, 2000);
  }

  private _stopHealthMonitor(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private _setHealth(status: CameraHealthStatus): void {
    if (this.healthStatus === status) return;
    this.healthStatus = status;
    this.healthCallback?.(status);
  }

  // Pause camera when page is hidden to save power / avoid browser throttling.
  private _bindVisibilityPause(): void {
    if (typeof document === 'undefined') return;
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.stream?.getVideoTracks().forEach((t) => { t.enabled = false; });
        this._setHealth('PAUSED');
      } else {
        this.stream?.getVideoTracks().forEach((t) => { t.enabled = true; });
        if (this.video && this.video.paused) {
          void this.video.play().catch(() => { /* ignore autoplay policy */ });
        }
        if (this.stream?.active) {
          this._setHealth('ACTIVE');
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private _unbindVisibilityPause(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
