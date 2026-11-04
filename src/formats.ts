import type { Format } from './types.js';

export const IMG_FORMATS: Format[] = [
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
  { id: 'webp', label: 'WEBP' },
  { id: 'bmp', label: 'BMP' },
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'DOCX' },
];

/** Every document format AnyFormat can write from text. */
const DOC_OUT = ['docx', 'odt', 'rtf', 'pdf', 'html', 'txt', 'md'];

export const TEXT_FORMATS: Record<string, string[]> = {
  docx: DOC_OUT,
  odt: DOC_OUT,
  rtf: DOC_OUT,
  pdf: DOC_OUT,
  md: DOC_OUT,
  txt: [...DOC_OUT, 'json'],
  html: DOC_OUT,
  csv: ['csv', 'json', 'txt', 'html', 'md'],
  json: ['json', 'csv', 'txt', 'html'],
};

export const TEXT_EXT = Object.keys(TEXT_FORMATS);
export const IMAGE_INPUTS = ['PNG', 'JPG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'];
