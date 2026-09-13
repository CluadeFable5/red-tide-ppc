import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPhotoToCloudinary } from './backend.firebase'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('uploadPhotoToCloudinary', () => {
  it('posts the file and unsigned preset and returns secure_url', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'red-tide')
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'public-reports')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ secure_url: 'https://res.cloudinary.com/red-tide/photo.jpg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const file = new File(['photo'], 'water.jpg', { type: 'image/jpeg' })

    await expect(uploadPhotoToCloudinary(file)).resolves.toBe(
      'https://res.cloudinary.com/red-tide/photo.jpg',
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.cloudinary.com/v1_1/red-tide/image/upload')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    const body = init?.body as FormData
    expect(body.get('file')).toBe(file)
    expect(body.get('upload_preset')).toBe('public-reports')
  })

  it('surfaces Cloudinary upload errors clearly', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'red-tide')
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'bad-preset')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Upload preset not found' } }), {
        status: 400,
      }),
    )

    await expect(uploadPhotoToCloudinary(new File(['x'], 'x.jpg'))).rejects.toThrow(
      'Photo upload failed: Upload preset not found',
    )
  })

  it('fails before fetching when Cloudinary is not configured', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '')
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', '')
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(uploadPhotoToCloudinary(new File(['x'], 'x.jpg'))).rejects.toThrow(
      'VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
