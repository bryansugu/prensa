/** Imagen RGBA plana compatible con ImageData (sin depender del DOM). */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function createRgba(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}
