/**
 * Decoded-pixel frame change metric for skipping VLM when the scene is static.
 * Compares grayscale downscaled frames (not JPEG file bytes).
 */
import jpeg from 'jpeg-js';

export type FrameChangeGateOpts = {
  width: number;
  height: number;
  pixelNoiseFloor: number;
};

/**
 * Decode both JPEGs to grayscale at width×height and return the fraction of
 * pixels whose absolute difference exceeds pixelNoiseFloor (0..1).
 * Returns 1 when decode fails or sizes mismatch (fail open → analyze).
 */
export function decodedFrameChangePercent(
  prevJpeg: Buffer,
  nextJpeg: Buffer,
  opts: FrameChangeGateOpts,
): number {
  const w = Math.max(1, Math.floor(Number(opts.width) || 160));
  const h = Math.max(1, Math.floor(Number(opts.height) || 90));
  const floor = Math.max(0, Math.min(255, Math.floor(Number(opts.pixelNoiseFloor) || 15)));
  const a = decodeToGray(prevJpeg, w, h);
  const b = decodeToGray(nextJpeg, w, h);
  if (!a || !b || a.length !== b.length) return 1;
  let changed = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    if (Math.abs(a[i] - b[i]) > floor) changed++;
  }
  return n > 0 ? changed / n : 1;
}

function decodeToGray(jpegBuf: Buffer, w: number, h: number): Uint8Array | null {
  try {
    const decoded = jpeg.decode(jpegBuf, { useTArray: true, formatAsRGBA: true });
    if (!decoded?.data || !decoded.width || !decoded.height) return null;
    const srcW = decoded.width;
    const srcH = decoded.height;
    const src = decoded.data as Uint8Array;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / h));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / w));
        const i = (sy * srcW + sx) * 4;
        // Rec.601 luma
        out[y * w + x] = (src[i] * 77 + src[i + 1] * 150 + src[i + 2] * 29) >> 8;
      }
    }
    return out;
  } catch {
    return null;
  }
}
