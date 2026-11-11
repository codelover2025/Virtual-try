/**
 * Pinned MediaPipe version and asset path resolver.
 * Self-hosts WASM and .task models under public/models while maintaining
 * pinned CDN fallback.
 */
export const MEDIAPIPE_VERSION = '1.1.1';

export function getWasmPath(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/models/wasm`;
  }
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
}

export function getModelPath(filename: string, fallbackCdnUrl: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `/models/${filename}`;
  }
  return fallbackCdnUrl;
}

