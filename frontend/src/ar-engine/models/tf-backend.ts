export type TfBackendName = 'webgl' | 'wasm' | 'cpu';

let tfInstance: any = null;
let backendInitPromise: Promise<TfBackendName> | null = null;

export async function initTfBackend(
  preferred: TfBackendName[] = ['webgl', 'wasm', 'cpu'],
): Promise<TfBackendName> {
  // Prevent TensorFlow.js from initializing in Node.js / SSR server context
  if (typeof window === 'undefined') {
    return 'cpu';
  }

  if (backendInitPromise) return backendInitPromise;

  backendInitPromise = (async () => {
    try {
      if (!tfInstance) {
        tfInstance = await import('@tensorflow/tfjs');
      }
      const tf = tfInstance;
      await tf.ready();
      for (const backend of preferred) {
        try {
          if (tf.findBackend && tf.findBackend(backend)) {
            const ok = await tf.setBackend(backend);
            if (ok) {
              await tf.ready();
              return backend;
            }
          }
        } catch {
          // try next backend
        }
      }
      return (tf.getBackend() as TfBackendName) || 'cpu';
    } catch (err) {
      console.warn('[TF Backend] Could not initialize preferred backend:', err);
      return 'cpu';
    }
  })();

  return backendInitPromise;
}

export { tfInstance as tf };
