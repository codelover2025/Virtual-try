/**
 * Lazy OpenCV.js loader. OpenCV is optional and used for capture post-process helpers only.
 * Detection remains TensorFlow.js-based.
 */
export type CvModule = {
  Mat: new () => unknown;
  imread: (el: HTMLCanvasElement) => unknown;
  imshow: (el: HTMLCanvasElement, mat: unknown) => void;
};

let cvPromise: Promise<CvModule> | null = null;

export function loadOpenCv(scriptUrl = 'https://docs.opencv.org/4.x/opencv.js'): Promise<CvModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV.js requires a browser'));
  }
  if ((window as unknown as { cv?: CvModule }).cv) {
    return Promise.resolve((window as unknown as { cv: CvModule }).cv);
  }
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      const cv = (window as unknown as { cv: CvModule & { onRuntimeInitialized?: () => void } }).cv;
      if (!cv) {
        reject(new Error('OpenCV failed to load'));
        return;
      }
      if (cv.onRuntimeInitialized) {
        cv.onRuntimeInitialized = () => resolve(cv);
      } else {
        resolve(cv);
      }
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
  return cvPromise;
}
