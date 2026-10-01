import QRCode from 'qrcode';
import { env } from '../config/env';

/**
 * The only thing a QR ever encodes: an opaque path on the customer-facing app.
 * No seat, no screen, no theater id, no query string.
 *
 *   https://app.example.com/a8f7K2mQx91PvL4s
 */
export function buildQrUrl(hash: string): string {
  return `${env.APP_BASE_URL}/${hash}`;
}

/**
 * Tuned for scanning through a phone camera in a dark auditorium:
 * - errorCorrectionLevel 'H' survives glare, smudges and partial occlusion
 * - margin 4 (the spec minimum quiet zone) so scanners lock on quickly
 * - scale keeps every module a whole number of pixels, avoiding resampling blur
 * - pure black on pure white: maximum contrast, no anti-aliased greys
 * Deliberately no logos, no colours, no rounded modules.
 */
export const QR_OPTIONS = {
  errorCorrectionLevel: 'H' as const,
  margin: 4,
  scale: 8,
  color: {
    dark: '#000000ff',
    light: '#ffffffff',
  },
};

/** Number of modules across, including the quiet zone. Used to size expectations. */
export function qrModuleCount(hash: string): number {
  const qr = QRCode.create(buildQrUrl(hash), {
    errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel,
  });
  return qr.modules.size;
}

/** Rendered PNG edge length in pixels for a given hash. */
export function qrPixelSize(hash: string): number {
  return (qrModuleCount(hash) + QR_OPTIONS.margin * 2) * QR_OPTIONS.scale;
}

export function generateQrPng(hash: string): Promise<Buffer> {
  return QRCode.toBuffer(buildQrUrl(hash), { ...QR_OPTIONS, type: 'png' });
}

export function generateQrSvg(hash: string): Promise<string> {
  return QRCode.toString(buildQrUrl(hash), { ...QR_OPTIONS, type: 'svg' });
}

export function generateQrDataUrl(hash: string): Promise<string> {
  return QRCode.toDataURL(buildQrUrl(hash), { ...QR_OPTIONS });
}

/** Filename-safe, deterministic name for a seat QR image. */
export function qrFileNameForSeat(seatNumber: string, extension: 'png' | 'svg' = 'png'): string {
  const safe = seatNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${safe}.${extension}`;
}

/** CSV field escaping for the export manifest. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
