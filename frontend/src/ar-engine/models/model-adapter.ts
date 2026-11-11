import type { LandmarkResult } from '../types.js';

export type PixelInput = HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface ModelAdapter {
  readonly name: string;
  load(): Promise<void>;
  estimate(input: PixelInput): Promise<LandmarkResult | null>;
  dispose(): void;
}
