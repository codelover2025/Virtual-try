export { ArEngine, detectorForKind } from './ar-engine.js';
export type { ArEngineHost } from './ar-engine.js';
export { CameraEngine } from './camera/camera-engine.js';
export type { CameraEngineOptions, CameraCapabilities, CameraHealthStatus } from './camera/camera-engine.js';
export { FaceDetector } from './detectors/face-detector.js';
export { HandDetector, FINGER_JOINTS } from './detectors/hand-detector.js';
export { PoseDetector } from './detectors/pose-detector.js';
export { LandmarkProcessor } from './landmarks/landmark-processor.js';
export type { ProcessorOptions, ProcessorMetrics } from './landmarks/landmark-processor.js';
export { BodyModelEstimator } from './landmarks/body-model-estimator.js';
export type { BodyModelMeasurements } from './landmarks/body-model-estimator.js';
export { AnchorRegistry } from './anchors/anchor-registry.js';
export type { AnchorRegistration, DetectorKind } from './anchors/anchor-registry.js';
export { PoseFitter } from './fitting/pose-fitter.js';
export type { PoseFitterOptions } from './fitting/pose-fitter.js';
export { TrackingEngine } from './tracking/tracking-engine.js';
export type { TrackingEngineOptions, TrackingMetrics } from './tracking/tracking-engine.js';
export { AdaptiveController } from './performance/adaptive-controller.js';
export type { QualityTier, AdaptiveMetrics } from './performance/adaptive-controller.js';
export { FpsMeter } from './performance/fps-meter.js';
export type { FpsMetrics } from './performance/fps-meter.js';
export { Canvas2dRenderer } from './renderers/canvas2d-renderer.js';
export { ThreeRenderer } from './renderers/three-renderer.js';
export { CaptureCompositor } from './capture/capture-compositor.js';
export { loadOpenCv } from './opencv/opencv-loader.js';
export { initTfBackend } from './models/tf-backend.js';
export {
  mapNormalizedToCanvas,
  mapPoseToCanvas,
  transformToScreen,
  transformPoseToScreen,
  resolvePhysicalEarMapping,
  type ViewportMappingOptions,
  type MappedCoordinateResult,
} from './utils/coordinate-transform.js';
export {
  isFaceCentered,
  evaluateFaceGuideStatus,
  shouldHideFaceGuide,
} from './tracking/face-guide-state.js';
export type { FaceGuideStatus, FrameDimensions } from './tracking/face-guide-state.js';
export type * from './types.js';
