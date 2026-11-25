import jsQR from 'jsqr';

export interface BrowserBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

export type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BrowserBarcodeDetector;

export function decodeCanvasQr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxDim = 640
): string | null {
  const scale = maxDim > 0 && srcWidth > maxDim ? maxDim / srcWidth : 1;
  const targetW = Math.max(1, Math.round(srcWidth * scale));
  const targetH = Math.max(1, Math.round(srcHeight * scale));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  ctx.drawImage(source, 0, 0, targetW, targetH);
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const code = jsQR(imgData.data, imgData.width, imgData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return code?.data || null;
}
