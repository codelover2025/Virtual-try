import * as tf from '@tensorflow/tfjs';

export type TfBackendName = 'webgl' | 'wasm' | 'cpu';

export async function initTfBackend(preferred: TfBackendName[] = ['webgl', 'wasm', 'cpu']): Promise<TfBackendName> {
  await tf.ready();
  for (const backend of preferred) {
    try {
      const ok = await tf.setBackend(backend);
      if (ok) {
        await tf.ready();
        return backend;
      }
    } catch {
      // try next
    }
  }
  throw new Error('No TensorFlow.js backend available');
}

export { tf };
