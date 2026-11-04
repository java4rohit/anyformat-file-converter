# AnyFormat

Convert, crop, resize, and compress images and documents in your browser. AnyFormat is a lightweight, client-side app: your selected files are processed on your device and are not uploaded to an AnyFormat server.

## Features

- **Image conversion:** Open PNG, JPG/JPEG, WEBP, GIF, BMP, SVG, and AVIF images. Export as PNG, JPG, WEBP, BMP, PDF, or DOCX.
- **Document conversion:** Open DOCX, ODT, RTF, PDF, Markdown, TXT, HTML, CSV, and JSON files. Convert between supported text/document formats listed below.
- **PDF support:** Render PDF pages as images (up to 50 pages per PDF). If a PDF has a readable text layer, extract its text for document conversion too.
- **Crop images:** Drag and resize the crop frame, choose Free, 1:1, 16:9, 4:3, or 4:5, or reset the crop.
- **Resize images:** Enter output dimensions or scale from 5% to 200%.
- **Control output size and quality:** Set a target size in KB or MB. For lossy formats, AnyFormat lowers quality first and then dimensions to try to meet the limit. Adjust quality for JPG, WEBP, and PDF.
- **Work with multiple files:** Drop or select several files, switch between them in the queue, remove items, and convert all supported files.
- **Quick file intake:** Drag files onto the page, use the file picker, or paste an image from the clipboard.
- **Preview and download:** Preview the selected image or document text, then convert and download the result.
- **Runs locally:** File conversion happens in your browser. PDF support loads the PDF.js library from jsDelivr when needed.

## Supported conversions

### Images

| Input | Output |
| --- | --- |
| PNG, JPG/JPEG, WEBP, GIF, BMP, SVG, AVIF | PNG, JPG, WEBP, BMP, PDF, DOCX |

### Text and documents

Conversion routes depend on the input format:

| Input | Available outputs |
| --- | --- |
| DOCX, ODT, RTF, PDF, Markdown, HTML | DOCX, ODT, RTF, PDF, HTML, TXT, Markdown |
| TXT | DOCX, ODT, RTF, PDF, HTML, TXT, Markdown, JSON |
| CSV | CSV, JSON, TXT, HTML, Markdown |
| JSON | JSON, CSV, TXT, HTML |

Document conversion focuses on text content and basic structure such as headings, paragraphs, and lists. It is not intended to preserve complex layouts, styles, or embedded content.

## Getting started

### Requirements

- Node.js and npm
- Python 3 to run the included local web server
- A modern browser with JavaScript enabled

### Run locally

```bash
npm install
npm run build
npm run serve
```

Open [http://localhost:8000](http://localhost:8000) in your browser. Keep the server running while using the app.

The `build` command compiles the TypeScript source in `src/` into `dist/`. To rebuild automatically when source files change, use `npm run watch` in a separate terminal.

## Deploy to GitHub Pages

This repository includes a GitHub Actions workflow that builds and deploys the app when changes are pushed to `main`. It publishes only the app files (`index.html`, `style.css`, and `dist/`).

After the first workflow run succeeds, visit [https://java4rohit.github.io/anyformat-file-converter/](https://java4rohit.github.io/anyformat-file-converter/). You can also start a deployment manually from the repository's **Actions** tab using **Deploy to GitHub Pages**.

## Limitations

- Legacy `.doc` files are not supported; save them as `.docx` first.
- Scanned or image-only PDFs can be rendered as images, but do not have text available for document conversion.
- Only the first 50 pages of a PDF are rendered as images.
- PDF support requires an internet connection to load PDF.js from jsDelivr.
- A requested file-size limit may not be achievable for every image or output format; the app reports when even the smallest result exceeds the limit.
