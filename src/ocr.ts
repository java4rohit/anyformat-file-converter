const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

interface RecognitionWorker {
  recognize(image: Blob): Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
}

interface TesseractModule {
  createWorker(
    language: string,
    oem?: number,
    options?: { logger?: (message: { status: string; progress?: number }) => void },
  ): Promise<RecognitionWorker>;
}

interface TesseractExports { default: TesseractModule }

let library: Promise<TesseractModule> | null = null;

function loadLibrary(): Promise<TesseractModule> {
  library ??= import(/* webpackIgnore: true */ TESSERACT_URL as string).then((module: TesseractExports) => module.default);
  library.catch(() => { library = null; });
  return library;
}

/** Recognize each page locally, reporting engine and page progress to the caller. */
export async function recognizePages(
  pages: Blob[],
  onProgress: (message: string) => void,
): Promise<string[]> {
  const tesseract = await loadLibrary();
  onProgress('Loading English OCR data…');
  const worker = await tesseract.createWorker('eng', 1, {
    logger: ({ status, progress }) => {
      if (progress === undefined) onProgress(status);
      else onProgress(`${status} ${Math.round(progress * 100)}%`);
    },
  });
  try {
    const text: string[] = [];
    for (const [i, page] of pages.entries()) {
      onProgress(`Recognizing page ${i + 1} of ${pages.length}…`);
      text.push((await worker.recognize(page)).data.text.trim());
    }
    return text;
  } finally {
    await worker.terminate();
  }
}
