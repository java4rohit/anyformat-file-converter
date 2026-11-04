const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
let library = null;
function loadLibrary() {
    library ??= import(/* webpackIgnore: true */ TESSERACT_URL).then((module) => module.default);
    library.catch(() => { library = null; });
    return library;
}
/** Recognize each page locally, reporting engine and page progress to the caller. */
export async function recognizePages(pages, onProgress) {
    const tesseract = await loadLibrary();
    onProgress('Loading English OCR data…');
    const worker = await tesseract.createWorker('eng', 1, {
        logger: ({ status, progress }) => {
            if (progress === undefined)
                onProgress(status);
            else
                onProgress(`${status} ${Math.round(progress * 100)}%`);
        },
    });
    try {
        const text = [];
        for (const [i, page] of pages.entries()) {
            onProgress(`Recognizing page ${i + 1} of ${pages.length}…`);
            text.push((await worker.recognize(page)).data.text.trim());
        }
        return text;
    }
    finally {
        await worker.terminate();
    }
}
//# sourceMappingURL=ocr.js.map