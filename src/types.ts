/** Crop frame as fractions (0–1) of the source image. */
export interface Crop { l: number; t: number; r: number; b: number }

interface BaseEntry { file: File; ext: string; crop: Crop }

export interface ImageEntry extends BaseEntry {
  kind: 'image';
  url: string;
  img: HTMLImageElement;
  w: number;
  h: number;
}

export interface TextEntry extends BaseEntry {
  kind: 'text';
  text: string;
}

export type FileEntry = ImageEntry | TextEntry;

export interface Format { id: string; label: string }

export interface Settings {
  fmt: string;
  scale: number;
  quality: number;
  /** Locked crop aspect ratio (w/h), or null for free-form. */
  ratio: number | null;
  /** Maximum output size in bytes (images), or null for no limit. */
  targetBytes: number | null;
}
