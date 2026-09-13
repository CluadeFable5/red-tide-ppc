/**
 * Small client-side image helper used by the demo backend.
 *
 * The real backend uploads the original file to Cloudinary. The demo
 * backend has nowhere to upload to, so it shrinks the image and keeps it as a
 * data URL — that keeps localStorage from exploding when someone demos the app
 * with a phone photo.
 */

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.8

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Browsers fire neither event for some corrupt files, so cap the wait. */
const DECODE_TIMEOUT_MS = 10_000

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => {
      img.src = ''
      reject(new Error('Image took too long to decode.'))
    }, DECODE_TIMEOUT_MS)

    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Could not decode that image file.'))
    }
    img.src = src
  })
}

/**
 * Downscale an image file to a JPEG data URL no larger than MAX_EDGE on its
 * longest side. Falls back to the raw data URL when canvas is unavailable.
 */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that image file.'))
    reader.readAsDataURL(file)
  })

  if (typeof document === 'undefined') return raw

  try {
    const img = await loadImage(raw)
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw

    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } catch {
    return raw
  }
}
