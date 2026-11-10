'use client';

import { create } from 'zustand';

interface TryOnState {
  sessionId: string | null;
  mirrorOn: boolean;
  isTracking: boolean;
  lastCaptureId: string | null;
  setSessionId: (id: string | null) => void;
  setMirrorOn: (on: boolean) => void;
  setTracking: (on: boolean) => void;
  setLastCaptureId: (id: string | null) => void;
  reset: () => void;
}

export const useTryOnStore = create<TryOnState>((set) => ({
  sessionId: null,
  mirrorOn: true,
  isTracking: false,
  lastCaptureId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  setMirrorOn: (mirrorOn) => set({ mirrorOn }),
  setTracking: (isTracking) => set({ isTracking }),
  setLastCaptureId: (lastCaptureId) => set({ lastCaptureId }),
  reset: () => set({ sessionId: null, isTracking: false, lastCaptureId: null }),
}));
