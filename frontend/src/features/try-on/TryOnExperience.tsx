'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArEngine, detectorForKind } from '@vj/ar-engine';
import { queryKeys } from '@vj/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ShoppingBag,
  Heart,
  Info,
  Maximize2,
  Minimize2,
  WifiOff,
  Sliders,
  RotateCcw,
  ArrowLeft,
  Camera,
  CameraOff,
  Loader2,
  X,
  Sparkles as SparklesIcon,
} from 'lucide-react';
import {
  Button,
  Badge,
  toast,
  formatPrice,
  CameraComponent,
  JewellerySelector,
  CaptureModal,
  type CameraHud,
  type JewellerySelectorItem,
} from '@vj/ui';
import type { JewelleryKind } from '@vj/shared';
import type { ProductDetailDto, ProductListItemDto } from '@vj/types';
import type { TryOnAnalyticsEvent } from '@vj/api-client';
import { api } from '@/lib/api';
import { assetCache } from '@/lib/asset-cache';
import { useTryOnStore } from '@/stores/try-on-store';
import { useStudioStore } from '@/stores/studio-store';
import { toJewelleryConfig, uploadCapture } from './try-on-bridge';
import {
  cacheCatalogue,
  getCachedOrFallbackCatalogue,
  getProductFromCacheOrFallback,
} from './offline-catalog';
import { TryOnCategorySwitch } from '@/components/try-on/try-on-category-switch';
import { TryOnLoadingState } from '@/components/try-on/try-on-loading-state';
import { TryOnErrorState } from '@/components/try-on/try-on-error-state';

export interface TryOnExperienceProps {
  product: ProductDetailDto;
  alternativeProducts?: ProductListItemDto[];
  initialKindFilter?: JewelleryKind | 'ALL';
  mode?: 'single' | 'multi';
  onClose?: () => void;
}

export function TryOnExperience({
  product: initialProduct,
  alternativeProducts,
  initialKindFilter = 'ALL',
  mode: initialMode = 'single',
  onClose,
}: TryOnExperienceProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [studioMode, setStudioMode] = useState<'single' | 'multi'>(initialMode);
  const [currentProduct, setCurrentProduct] = useState<ProductDetailDto>(initialProduct);
  const [activeMultiProducts, setActiveMultiProducts] = useState<Map<JewelleryKind, ProductDetailDto>>(() => {
    const map = new Map<JewelleryKind, ProductDetailDto>();
    map.set(initialProduct.jewelleryKind, initialProduct);
    return map;
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArEngine | null>(null);
  const isStartingRef = useRef(false);

  const [hud, setHud] = useState<CameraHud>({ status: 'IDLE', fps: 0 });
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentCaptureBlob, setCurrentCaptureBlob] = useState<Blob | null>(null);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [isSavedInSession, setIsSavedInSession] = useState(false);
  const [captureMeta, setCaptureMeta] = useState({ width: 0, height: 0 });
  const [kindFilter, setKindFilter] = useState<JewelleryKind | 'ALL'>(initialKindFilter);
  const [switchingPieceId, setSwitchingPieceId] = useState<string | null>(null);
  const pendingEvents = useRef<TryOnAnalyticsEvent[]>([]);
  const lastStatus = useRef('');

  const {
    sessionId,
    setSessionId,
    setTracking,
    setLastCaptureId,
    mirrorOn,
    setMirrorOn,
  } = useTryOnStore();

  const { switcherScrollPos, setSwitcherScrollPos } = useStudioStore();

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [fineTuneScale, setFineTuneScale] = useState(1.0);
  const [fineTuneY, setFineTuneY] = useState(0);

  // Necklace fine-tuning (only size and length in multi-jewellery mode)
  const [necklaceScale, setNecklaceScale] = useState(1.0);
  const [necklaceLengthY, setNecklaceLengthY] = useState(0);

  const handleFineTuneChange = (scale: number, y: number) => {
    setFineTuneScale(scale);
    setFineTuneY(y);
    engineRef.current?.setFineTune(scale, y);
  };

  const handleResetFineTune = () => {
    setFineTuneScale(1.0);
    setFineTuneY(0);
    engineRef.current?.setFineTune(1.0, 0);
  };

  const handleNecklaceFineTuneChange = (scale: number, y: number) => {
    setNecklaceScale(scale);
    setNecklaceLengthY(y);
    engineRef.current?.setNecklaceFineTune(scale, y);
  };

  const handleResetNecklaceFineTune = () => {
    setNecklaceScale(1.0);
    setNecklaceLengthY(0);
    engineRef.current?.setNecklaceFineTune(1.0, 0);
  };

  const [debugAxes, setDebugAxes] = useState(false);
  const handleToggleDebugAxes = useCallback(() => {
    setDebugAxes((prev) => {
      const next = !prev;
      engineRef.current?.setDebugAxes(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'x' || e.key === 'X') {
        handleToggleDebugAxes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleDebugAxes]);

  const isDebugMode =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('debug') === '1' ||
      new URLSearchParams(window.location.search).get('debug') === 'true');

  // Clean shutdown when component unmounts
  useEffect(() => {
    return () => {
      isStartingRef.current = false;
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // If initialProduct changes externally (e.g. navigation or item choice)
  useEffect(() => {
    if (currentProduct.id === initialProduct.id) return;
    stopCamera();
    setCurrentProduct(initialProduct);
  }, [initialProduct.id]);

  useEffect(() => {
    setKindFilter(initialKindFilter);
  }, [initialKindFilter]);

  // Load alternative products for in-studio switcher if not provided
  const catalogQuery = useQuery({
    queryKey: queryKeys.products.list({ pageSize: 16 }),
    queryFn: async () => {
      try {
        const res = await api.catalog.listProducts({ pageSize: 16 });
        cacheCatalogue(res.items);
        return res;
      } catch {
        const fallback = getCachedOrFallbackCatalogue();
        return {
          items: fallback,
          total: fallback.length,
          page: 1,
          pageSize: fallback.length,
          totalPages: 1,
        };
      }
    },
    enabled: !alternativeProducts || alternativeProducts.length === 0,
  });

  const selectorItems: JewellerySelectorItem[] = (
    alternativeProducts && alternativeProducts.length > 0
      ? alternativeProducts
      : catalogQuery.data?.items ?? [currentProduct]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    jewelleryKind: p.jewelleryKind,
    priceCents: p.priceCents,
    currency: p.currency,
    primaryImage: p.primaryImage,
  }));

  const categoryKinds = Array.from(new Set(selectorItems.map((item) => item.jewelleryKind)));
  const visibleItems =
    kindFilter === 'ALL'
      ? selectorItems
      : selectorItems.filter((item) => item.jewelleryKind === kindFilter);
  const selectorKey = selectorItems.map((item) => item.id).join(',');

  // Start AR session with API (falls back gracefully to client-side session when backend is offline)
  const sessionQuery = useQuery({
    queryKey: ['try-on', 'bootstrap', currentProduct.id],
    queryFn: async () => {
      try {
        const session = await api.tryOn.startSession({
          productId: currentProduct.id,
          clientInfo: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
            deviceClass:
              typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
                ? 'mobile'
                : 'desktop',
          },
        });
        setIsOfflineMode(false);
        return session;
      } catch {
        // Backend offline: client-side engine still functions fully
        setIsOfflineMode(true);
        return {
          sessionId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          asset: currentProduct.tryOnAsset,
          isOffline: true,
        };
      }
    },
  });

  useEffect(() => {
    if (sessionQuery.data?.sessionId) setSessionId(sessionQuery.data.sessionId);
  }, [sessionQuery.data?.sessionId, setSessionId]);

  useEffect(() => {
    const handleLeave = () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);
    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      handleLeave();
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      engineRef.current?.setLowPowerMode(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!selectorKey) return;
    let active = true;
    const ids = selectorKey.split(',');
    void api.tryOn.getProductAssets(ids).then(async (rows) => {
      if (!active) return;
      const urls = rows
        .map((row) => row.asset.url)
        .filter((url) => url && !url.startsWith('procedural://'));
      await assetCache.preloadMany(urls);
      await engineRef.current?.preloadAssets(urls.map((url) => assetCache.resolve(url)));
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectorKey]);

  useEffect(() => {
    if (!sessionId || isOfflineMode || sessionId.startsWith('offline-')) return;
    const flush = () => {
      const metrics = engineRef.current?.getMetrics();
      if (metrics) {
        pendingEvents.current.push({
          type: 'performance',
          value: Math.round(metrics.fps),
          meta: {
            qualityTier: metrics.qualityTier,
            cameraHealth: metrics.cameraHealth,
            status: metrics.status,
          },
        });
      }
      const batch = pendingEvents.current.splice(0, 40);
      if (!batch.length) return;
      void api.tryOn.recordEvents(sessionId, batch).catch(() => {
        pendingEvents.current.unshift(...batch.slice(-20));
      });
    };
    const eventsTimer = window.setInterval(flush, 8000);
    const heartTimer = window.setInterval(() => {
      void api.tryOn.heartbeat(sessionId).catch(() => undefined);
    }, 60_000);
    return () => {
      window.clearInterval(eventsTimer);
      window.clearInterval(heartTimer);
      flush();
    };
  }, [sessionId, isOfflineMode]);

  const asset = sessionQuery.data?.asset ?? currentProduct.tryOnAsset;

  // Start Camera & AR tracking
  async function startCamera() {
    if (!videoRef.current || !overlayRef.current || !threeRef.current) return;
    if (isStartingRef.current || running) return;
    isStartingRef.current = true;
    setStarting(true);
    setHud((prev) => ({ ...prev, error: undefined }));
    try {
      engineRef.current?.stop();
      const engine = new ArEngine();
      engineRef.current = engine;

      let lastHudUpdate = 0;
      let lastReportedFps = 0;
      let lastReportedStatus = '';
      let lastReportedPrompt: string | undefined = undefined;
      let lastReportedError: string | undefined = undefined;
      let lastReportedShoulders: boolean | undefined = undefined;
      let lastReportedFaceCentered: boolean | undefined = undefined;

      engine.on((e) => {
        const now = performance.now();
        const roundedFps = Math.round(e.fps);

        // Immediate updates for key state changes; throttled at 500ms for continuous FPS changes
        const statusChanged = e.status !== lastReportedStatus;
        const promptChanged = e.promptMessage !== lastReportedPrompt;
        const errorChanged = e.error !== lastReportedError;
        const shouldersChanged = e.shouldersVisible !== lastReportedShoulders;
        const faceCenteredChanged = e.faceCentered !== lastReportedFaceCentered;
        const timeToUpdateFps = now - lastHudUpdate > 500 && Math.abs(roundedFps - lastReportedFps) >= 1;

        if (statusChanged || promptChanged || errorChanged || shouldersChanged || faceCenteredChanged || timeToUpdateFps) {
          lastHudUpdate = now;
          lastReportedStatus = e.status;
          lastReportedPrompt = e.promptMessage;
          lastReportedError = e.error;
          lastReportedShoulders = e.shouldersVisible;
          lastReportedFaceCentered = e.faceCentered;
          lastReportedFps = roundedFps;

          setHud({
            status: e.status,
            fps: roundedFps,
            error: e.error,
            promptMessage: e.promptMessage,
            shouldersVisible: e.shouldersVisible,
            faceCentered: e.faceCentered,
          });
        }

        if (statusChanged) {
          setTracking(e.status === 'TRACKING');
        }

        if (e.status !== lastStatus.current) {
          lastStatus.current = e.status;
          if (!isOfflineMode) {
            pendingEvents.current.push({ type: 'tracking_change', value: e.status });
          }
        }
        if (e.error && !isOfflineMode) {
          pendingEvents.current.push({ type: 'engine_error', value: e.error });
        }
      });

      if (studioMode === 'multi' && activeMultiProducts.size > 0) {
        const primaryProduct = Array.from(activeMultiProducts.values())[0];
        const primaryConfig = await toJewelleryConfig(
          primaryProduct.jewelleryKind,
          primaryProduct.tryOnAsset,
          primaryProduct.id,
          (primaryProduct.metadata as any)?.ringConfig,
          (primaryProduct.metadata as any)?.bangleConfig,
        );
        await engine.start(
          {
            video: videoRef.current,
            overlayCanvas: overlayRef.current,
            threeCanvas: threeRef.current,
          },
          {
            ...primaryConfig,
            mirroredPreview: mirrorOn,
            targetFps: 30,
            debugLandmarks: isDebugMode,
          },
        );
        for (const [kind, prod] of activeMultiProducts) {
          if (kind !== primaryProduct.jewelleryKind) {
            const cfg = await toJewelleryConfig(
              prod.jewelleryKind,
              prod.tryOnAsset,
              prod.id,
              (prod.metadata as any)?.ringConfig,
              (prod.metadata as any)?.bangleConfig,
            );
            await engine.addOrUpdateJewellery(cfg);
          }
        }
      } else {
        const config = await toJewelleryConfig(
          currentProduct.jewelleryKind,
          asset,
          currentProduct.id,
          (currentProduct.metadata as any)?.ringConfig,
          (currentProduct.metadata as any)?.bangleConfig,
        );
        await engine.start(
          {
            video: videoRef.current,
            overlayCanvas: overlayRef.current,
            threeCanvas: threeRef.current,
          },
          {
            ...config,
            mirroredPreview: mirrorOn,
            targetFps: 30,
            debugLandmarks: isDebugMode,
          },
        );
      }
      setRunning(true);
      toast.success(studioMode === 'multi' ? 'Multi-Jewellery Studio camera connected' : 'Studio camera connected');
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      const errName = errorObj?.name || '';
      const errMsg = errorObj?.message || '';

      let friendlyMessage = 'Could not access camera. Please check device permissions and try again.';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || /permission/i.test(errMsg)) {
        friendlyMessage = 'Camera permission denied. Please allow camera access in your browser settings to try on jewellery.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || /not found/i.test(errMsg)) {
        friendlyMessage = 'No camera detected on this device. Please connect a webcam or switch to a smartphone with a camera.';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError' || /in use/i.test(errMsg)) {
        friendlyMessage = 'Camera is currently in use by another application. Please close other camera tabs/apps and retry.';
      } else if (errName === 'OverconstrainedError') {
        friendlyMessage = 'Camera does not support requested resolution. Trying fallback settings…';
      }

      setHud((prev) => ({ ...prev, error: friendlyMessage, status: 'ERROR' }));
      toast.error(friendlyMessage);
      setRunning(false);
    } finally {
      setStarting(false);
      isStartingRef.current = false;
    }
  }

  function stopCamera() {
    isStartingRef.current = false;
    engineRef.current?.stop();
    engineRef.current = null;
    setRunning(false);
    setStarting(false);
    setTracking(false);
    setHud({ status: 'IDLE', fps: 0, error: undefined });
  }

  async function flipCamera() {
    try {
      await engineRef.current?.flipCamera();
      const isMirrored = engineRef.current?.isMirrored();
      if (typeof isMirrored === 'boolean') {
        setMirrorOn(isMirrored);
      }
      toast.info('Camera switched');
    } catch {
      toast.error('Unable to flip camera on this device');
    }
  }

  function toggleMirror() {
    const next = !mirrorOn;
    setMirrorOn(next);
    engineRef.current?.setMirrored(next);
  }

  // Handle switching jewellery piece in-studio:
  // - Keeps the camera stream and models loaded once per session
  // - In Single Mode: same-category swaps cleanly; different category directly transfers to Multi Mode!
  // - In Multi Mode: adds or swaps category piece seamlessly
  async function handleSelectPiece(item: JewellerySelectorItem) {
    if (studioMode === 'single' && item.id === currentProduct.id) return;
    if (studioMode === 'multi' && activeMultiProducts.get(item.jewelleryKind)?.id === item.id) return;

    setSwitchingPieceId(item.id);
    try {
      let detail: ProductDetailDto;
      try {
        detail = await api.catalog.getProduct(item.id);
      } catch {
        const fallback = getProductFromCacheOrFallback(item.id);
        if (!fallback) throw new Error('Product not found in catalogue');
        detail = fallback;
      }

      // Stop camera session cleanly so it always displays the Studio Virtual Mirror (Image 2)
      if (running || engineRef.current) {
        stopCamera();
      }

      if (studioMode === 'single') {
        setCurrentProduct(detail);
        const newMap = new Map<JewelleryKind, ProductDetailDto>();
        newMap.set(detail.jewelleryKind, detail);
        setActiveMultiProducts(newMap);
        handleResetFineTune();

        useStudioStore.getState().selectPieceInStudio(detail);

        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/try-on') && !window.location.pathname.includes('/multi')) {
          window.history.replaceState(null, '', `/try-on/${detail.id}`);
        }

        toast.info(`Selected ${detail.name}. Click "Open Camera" to try on.`);
      } else {
        // Multi mode: Add or update the piece of this category
        const newMap = new Map(activeMultiProducts);
        newMap.set(detail.jewelleryKind, detail);
        setActiveMultiProducts(newMap);
        setCurrentProduct(detail);

        toast.info(`Selected ${detail.name}. Click "Open Camera" to try on.`);
      }

      if (!isOfflineMode) {
        pendingEvents.current.push({
          type: 'product_swap',
          value: detail.id,
          meta: { jewelleryKind: detail.jewelleryKind },
        });
      }
    } catch (err) {
      toast.error('Could not switch jewellery item');
    } finally {
      setSwitchingPieceId(null);
    }
  }

  async function handleRemovePiece(item: { id: string; jewelleryKind: JewelleryKind; name?: string }) {
    if (activeMultiProducts.size <= 1) {
      toast.info('At least one piece must remain in studio. Pick another piece to swap.');
      return;
    }
    const newMap = new Map(activeMultiProducts);
    newMap.delete(item.jewelleryKind);
    setActiveMultiProducts(newMap);

    const remaining = Array.from(newMap.values());
    if (remaining.length > 0) {
      setCurrentProduct(remaining[0]);
    }

    if (running && engineRef.current) {
      engineRef.current.removeJewellery(item.jewelleryKind);
      toast.info(`Removed ${item.name || item.jewelleryKind.replace(/_/g, ' ').toLowerCase()}`);
    }
  }

  // Snapshot capture handler
  const handleCapture = async () => {
    if (!engineRef.current || !overlayRef.current) {
      toast.error('Camera not ready for capture');
      return;
    }
    try {
      const shot = await engineRef.current.captureHQ({
        mimeType: 'image/jpeg',
        quality: 0.92,
        thumbnail: true,
      });
      setCurrentCaptureBlob(shot.blob);
      setCaptureMeta({ width: shot.width, height: shot.height });
      if (!isOfflineMode) {
        pendingEvents.current.push({ type: 'capture', value: shot.width });
      }
      const url = URL.createObjectURL(shot.blob);
      setPreviewUrl(url);
      setCaptureOpen(true);
      setIsSavedInSession(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Snapshot capture failed');
    }
  };

  // Save capture to user lookbook / server (with direct download in offline mode)
  const saveCaptureMutation = useMutation({
    mutationFn: async () => {
      if (!currentCaptureBlob) throw new Error('No snapshot captured');
      if (isOfflineMode || sessionId?.startsWith('offline-')) {
        // In offline mode, download directly to user's device
        const url = URL.createObjectURL(currentCaptureBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tryon-${currentProduct.slug}-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { id: `local-${Date.now()}`, storageKey: 'local' };
      }
      if (!sessionId) throw new Error('No active try-on session');
      return uploadCapture({
        sessionId,
        blob: currentCaptureBlob,
        width: captureMeta.width,
        height: captureMeta.height,
      });
    },
    onSuccess: (data) => {
      setLastCaptureId(data.id);
      setIsSavedInSession(true);
      if (isOfflineMode || sessionId?.startsWith('offline-')) {
        toast.success('Snapshot saved directly to your device');
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save capture to account');
    },
  });

  if (sessionQuery.isLoading && !isOfflineMode) {
    return <TryOnLoadingState label="Initializing Luxury AR Studio…" subtext="Calibrating 3D sensors and camera stream" />;
  }

  return (
    <div className="space-y-6">
      {/* Offline Mode Indicator Banner */}
      {isOfflineMode && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Offline Studio Mode:</strong> Running client-side AR engine with bundled catalogue. Live virtual fitting and photo snapshots remain fully operational.
            </span>
          </div>
          <Badge variant="outline" className="border-amber-400/50 text-amber-300 shrink-0 ml-3">
            Offline Ready
          </Badge>
        </div>
      )}

      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="rounded-full gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 mr-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Exit Studio
              </Button>
            )}
            <Badge variant="outline" className="border-primary/40 text-primary">
              Live Fitting
            </Badge>
            {isDebugMode && (
              <Badge variant="outline" className="border-amber-400 bg-amber-500/10 text-amber-300 font-mono text-[11px]">
                DEBUG (?debug=1)
              </Badge>
            )}
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
              Session: {sessionId ? sessionId.slice(0, 8) : 'Direct'}
            </span>
            <button
              type="button"
              onClick={handleToggleDebugAxes}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono border transition-colors cursor-pointer ${
                debugAxes
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground'
              }`}
              title="Toggle 3D Ring AxesHelper (X key: Red=X, Green=Y dorsal, Blue=Z finger)"
            >
              Axes [X]: {debugAxes ? 'ON' : 'OFF'}
            </button>
          </div>
          <h1
            data-testid="current-product-name"
            className="mt-1 font-serif text-2xl sm:text-3xl font-normal text-foreground"
          >
            {currentProduct.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={stopCamera}
              className="rounded-full gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-3 cursor-pointer"
            >
              <CameraOff className="h-3.5 w-3.5 text-amber-400" /> Close Camera
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={startCamera}
              disabled={starting}
              className="rounded-full gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3.5 shadow-sm cursor-pointer"
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              {starting ? 'Connecting…' : 'Open Camera'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCinemaMode(!cinemaMode)}
            className="hidden sm:inline-flex rounded-full gap-1.5 text-xs text-muted-foreground"
          >
            {cinemaMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {cinemaMode ? 'Exit Cinema' : 'Cinema Mode'}
          </Button>

          {currentProduct.priceCents != null ? (
            <div className="text-right">
              <span className="text-xs text-muted-foreground uppercase tracking-wider block">Price</span>
              <span className="font-serif text-xl font-semibold text-primary">
                {formatPrice(currentProduct.priceCents, currentProduct.currency ?? 'INR')}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Studio Workspace: Viewfinder & Jewellery Drawer */}
      <div
        className={
          cinemaMode
            ? 'flex flex-col items-center justify-center max-w-4xl mx-auto space-y-6'
            : 'grid gap-8 lg:grid-cols-[1fr_360px]'
        }
      >
        {/* Left Column: Real-time Camera Viewfinder */}
        <div className="flex flex-col items-center w-full">
          <CameraComponent
            videoRef={videoRef}
            overlayRef={overlayRef}
            threeRef={threeRef}
            running={running}
            starting={starting}
            hud={hud}
            mirrorOn={mirrorOn}
            onStart={startCamera}
            onStop={stopCamera}
            onFlip={flipCamera}
            onMirrorToggle={toggleMirror}
            onCapture={handleCapture}
            onRetry={startCamera}
            onDismissError={() => setHud((prev) => ({ ...prev, error: undefined, status: 'IDLE' }))}
            promptText={`Position your camera to see ${currentProduct.name} fitted precisely in real-time.`}
            guideMode={detectorForKind(currentProduct.jewelleryKind)}
          />

          {/* Active Multi-Fitting Bar (Visible in Multi-Jewellery Mode) */}
          {studioMode === 'multi' && (
            <div className="mt-3 w-full max-w-xl p-3 rounded-2xl border border-primary/20 bg-card/95 shadow-md backdrop-blur-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>Active Multi-Fitting ({activeMultiProducts.size} pieces)</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStudioMode('single');
                    const single =
                      activeMultiProducts.get(currentProduct.jewelleryKind) ??
                      Array.from(activeMultiProducts.values())[0];
                    if (single) {
                      const newMap = new Map<JewelleryKind, ProductDetailDto>();
                      newMap.set(single.jewelleryKind, single);
                      setActiveMultiProducts(newMap);
                      setCurrentProduct(single);
                      if (running && engineRef.current) {
                        void toJewelleryConfig(
                          single.jewelleryKind,
                          single.tryOnAsset,
                          single.id,
                          (single.metadata as any)?.ringConfig,
                          (single.metadata as any)?.bangleConfig,
                        ).then((c) => engineRef.current?.setJewellery(c));
                      }
                    }
                    toast.info('Returned to Single Piece Studio');
                  }}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Exit Multi Mode
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {Array.from(activeMultiProducts.values()).map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 text-xs bg-muted/80 border border-primary/20 px-2.5 py-1 rounded-full font-medium text-foreground"
                  >
                    <span className="text-[10px] uppercase font-mono text-primary/80">
                      {p.jewelleryKind.replace(/_/g, ' ')}:
                    </span>
                    <span className="truncate max-w-[130px]">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePiece(p)}
                      title={`Remove ${p.name}`}
                      className="ml-1 text-muted-foreground hover:text-destructive hover:scale-110 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick In-Studio Jewellery Switcher Strip */}
          <div className="mt-4 w-full max-w-xl space-y-2">
            <TryOnCategorySwitch
              categories={categoryKinds}
              selectedCategory={kindFilter}
              onSelectCategory={setKindFilter}
            />
            <JewellerySelector
              items={visibleItems}
              selectedId={currentProduct.id}
              selectedIds={studioMode === 'multi' ? Array.from(activeMultiProducts.values()).map((p) => p.id) : undefined}
              loadingId={switchingPieceId}
              onSelect={handleSelectPiece}
              onRemove={studioMode === 'multi' ? handleRemovePiece : undefined}
              initialScrollLeft={switcherScrollPos}
              onScrollChange={setSwitcherScrollPos}
            />
          </div>
        </div>

        {/* Right Column: Piece Details & Atelier Actions (Desktop side / Mobile bottom) */}
        {!cinemaMode && (
          <aside className="space-y-6">
            {/* Atelier Spec Card */}
            <div className="rounded-3xl border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge variant="secondary" className="mb-2">
                    {currentProduct.jewelleryKind.replace(/_/g, ' ')}
                  </Badge>
                  <h2 className="font-serif text-2xl font-normal leading-snug">
                    {currentProduct.name}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">SKU: {currentProduct.sku}</p>
                </div>

                {currentProduct.primaryImage?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentProduct.primaryImage.url}
                    alt={currentProduct.name}
                    className="h-16 w-16 rounded-xl object-cover border"
                  />
                ) : null}
              </div>

              {currentProduct.description ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {currentProduct.description}
                </p>
              ) : null}

              {currentProduct.priceCents != null ? (
                <div className="border-t pt-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Estimate</div>
                  <div className="text-2xl font-serif font-semibold text-primary">
                    {formatPrice(currentProduct.priceCents, currentProduct.currency ?? 'INR')}
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 rounded-full gap-2">
                  <ShoppingBag className="h-4 w-4" /> Add to Shopping Bag
                </Button>
                <Button variant="outline" size="icon" className="rounded-full shrink-0">
                  <Heart className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Atelier Fit Fine-Tuning: in Multi Mode, ONLY Size & Length of Necklace can be changed */}
            {studioMode === 'multi' ? (
              (() => {
                const activeNecklace =
                  activeMultiProducts.get('NECKLACE') ??
                  activeMultiProducts.get('PENDANT') ??
                  activeMultiProducts.get('MANGALSUTRA');

                return (
                  <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Necklace Fit Adjustment</span>
                      </div>
                      {activeNecklace && (necklaceScale !== 1.0 || necklaceLengthY !== 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleResetNecklaceFineTune}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Reset
                        </Button>
                      )}
                    </div>

                    {activeNecklace ? (
                      <div className="space-y-3 text-xs">
                        <div className="rounded-xl bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-foreground flex items-center gap-2">
                          <SparklesIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>
                            Adjusting <strong>{activeNecklace.name}</strong> size and drape length.
                          </span>
                        </div>
                        <div>
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span>Necklace Size</span>
                            <span className="font-mono text-[11px] text-foreground">
                              {Math.round(necklaceScale * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.80"
                            max="1.20"
                            step="0.02"
                            value={necklaceScale}
                            onChange={(e) =>
                              handleNecklaceFineTuneChange(parseFloat(e.target.value), necklaceLengthY)
                            }
                            className="w-full accent-primary cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span>Necklace Length (Drape)</span>
                            <span className="font-mono text-[11px] text-foreground">
                              {necklaceLengthY > 0 ? `+${necklaceLengthY}` : necklaceLengthY} px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-30"
                            max="30"
                            step="1"
                            value={necklaceLengthY}
                            onChange={(e) =>
                              handleNecklaceFineTuneChange(necklaceScale, parseInt(e.target.value, 10))
                            }
                            className="w-full accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-center space-y-2">
                        <p className="text-xs text-muted-foreground">
                          No necklace currently equipped in multi-fitting.
                        </p>
                        <p className="text-[11px] text-primary font-medium">
                          Add a necklace to the fitting to adjust size and drape length.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setKindFilter('NECKLACE')}
                          className="rounded-full text-xs h-7 mt-1 cursor-pointer"
                        >
                          Browse Necklaces
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* Single Piece Mode: Standard single fine-tune + Direct transfer banner */
              <div className="space-y-4">
                <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Fine-Tune Fit</span>
                    </div>
                    {(fineTuneScale !== 1.0 || fineTuneY !== 0) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetFineTune}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>Size Ratio</span>
                        <span className="font-mono text-[11px] text-foreground">{Math.round(fineTuneScale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="1.20"
                        step="0.02"
                        value={fineTuneScale}
                        onChange={(e) => handleFineTuneChange(parseFloat(e.target.value), fineTuneY)}
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>Vertical Position</span>
                        <span className="font-mono text-[11px] text-foreground">{fineTuneY > 0 ? `+${fineTuneY}` : fineTuneY} px</span>
                      </div>
                      <input
                        type="range"
                        min="-30"
                        max="30"
                        step="1"
                        value={fineTuneY}
                        onChange={(e) => handleFineTuneChange(fineTuneScale, parseInt(e.target.value, 10))}
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Direct transfer to Multi-Jewellery studio card */}
                <div className="rounded-3xl border border-primary/30 bg-primary/5 p-4 shadow-sm flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <SparklesIcon className="h-3.5 w-3.5 text-primary" /> Multi-Jewellery Studio
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Mix and match necklace, earrings, rings, and bangles together.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setStudioMode('multi');
                      toast.info('Switched to Multi-Jewellery Studio! Pick additional pieces below to wear together.');
                    }}
                    className="rounded-full text-xs h-8 px-3.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  >
                    Try Multi
                  </Button>
                </div>
              </div>
            )}

            {/* Fitting & Sensor Diagnostic Card */}
            <div className="rounded-2xl border bg-muted/40 p-4 text-xs space-y-2.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" />
                <span>AR Sensor Calibration</span>
              </div>
              <p className="text-muted-foreground leading-normal">
                Fitting is calibrated automatically using multi-point facial landmark and pose detection.
                Natural lighting yields the most luminous shine.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-muted-foreground">
                <div className="rounded-md bg-background/80 p-2 border">
                  <span className="block text-[10px] uppercase text-muted-foreground">Asset Engine</span>
                  <span className="font-semibold text-foreground">Three.js WebGL</span>
                </div>
                <div className="rounded-md bg-background/80 p-2 border">
                  <span className="block text-[10px] uppercase text-muted-foreground">Model Status</span>
                  <span className="font-semibold text-foreground">
                    {asset ? 'Ready' : 'Procedural'}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Snapshot Capture Modal */}
      <CaptureModal
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        previewUrl={previewUrl}
        productName={currentProduct.name}
        onSave={() => saveCaptureMutation.mutateAsync().then(() => undefined)}
        isSaving={saveCaptureMutation.isPending}
        onDownload={() => {
          if (!previewUrl) return;
          const a = document.createElement('a');
          a.href = previewUrl;
          a.download = `${currentProduct.slug || 'try-on'}-${Date.now()}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success('Snapshot downloaded to your device');
        }}
      />
    </div>
  );
}
