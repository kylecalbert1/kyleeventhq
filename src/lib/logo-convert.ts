export type LogoVariant = "black" | "white" | "colored";

export type ConvertedLogo = {
  name: string;
  blobs: Record<LogoVariant, Blob>;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image: ${file.name}`));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
}

export function baseName(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/**
 * Mirrors the Python/PIL script:
 * existing alpha if real, else corner-average background keying with a
 * 15..60 distance ramp, then tight crop on alpha > 20 with a 4px margin.
 */
export async function convertLogo(file: File): Promise<ConvertedLogo> {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error(`Empty image: ${file.name}`);

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, w, h).data;

  // 1. alpha channel
  let hasRealAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      hasRealAlpha = true;
      break;
    }
  }

  const alpha = new Uint8ClampedArray(w * h);
  if (hasRealAlpha) {
    for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4 + 3];
  } else {
    const cornerIdx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
    let br = 0;
    let bg = 0;
    let bb = 0;
    for (const c of cornerIdx) {
      br += data[c];
      bg += data[c + 1];
      bb += data[c + 2];
    }
    br /= 4;
    bg /= 4;
    bb /= 4;
    for (let p = 0; p < w * h; p++) {
      const o = p * 4;
      const dr = data[o] - br;
      const dg = data[o + 1] - bg;
      const db = data[o + 2] - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      let a: number;
      if (dist <= 15) a = 0;
      else if (dist >= 60) a = 255;
      else a = Math.round(((dist - 15) / 45) * 255);
      alpha[p] = a;
    }
  }

  // 2. bounding box of alpha > 20, + 4px margin
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
  }
  minX = Math.max(0, minX - 4);
  minY = Math.max(0, minY - 4);
  maxX = Math.min(w - 1, maxX + 4);
  maxY = Math.min(h - 1, maxY + 4);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  // 3. build variants
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d")!;

  const blobs = {} as Record<LogoVariant, Blob>;
  const variants: LogoVariant[] = ["black", "white", "colored"];
  for (const variant of variants) {
    const imageData = octx.createImageData(cw, ch);
    const d = imageData.data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sp = (y + minY) * w + (x + minX);
        const dp = (y * cw + x) * 4;
        if (variant === "black") {
          d[dp] = 0;
          d[dp + 1] = 0;
          d[dp + 2] = 0;
        } else if (variant === "white") {
          d[dp] = 255;
          d[dp + 1] = 255;
          d[dp + 2] = 255;
        } else {
          d[dp] = data[sp * 4];
          d[dp + 1] = data[sp * 4 + 1];
          d[dp + 2] = data[sp * 4 + 2];
        }
        d[dp + 3] = alpha[sp];
      }
    }
    octx.clearRect(0, 0, cw, ch);
    octx.putImageData(imageData, 0, 0);
    blobs[variant] = await canvasToBlob(out);
  }

  return { name: `${baseName(file.name)}.png`, blobs };
}

export const VARIANTS: LogoVariant[] = ["black", "white", "colored"];

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
