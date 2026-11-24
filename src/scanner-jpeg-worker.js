let canvas = null
let context = null

self.onmessage = async ({data: {id, bitmap, jpegQuality}}) => {
  const startedAt = performance.now()
  try {
    try {
      if (!canvas) canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      if (canvas.width !== bitmap.width) canvas.width = bitmap.width
      if (canvas.height !== bitmap.height) canvas.height = bitmap.height
      if (!context) context = canvas.getContext('2d', {willReadFrequently: true})
      if (!context) throw new Error('Could not create the JPEG worker canvas.')
      context.globalCompositeOperation = 'copy'
      context.drawImage(bitmap, 0, 0)
    } finally {
      bitmap.close()
    }

    const blob = await canvas.convertToBlob({type: 'image/jpeg', quality: jpegQuality})
    self.postMessage({id, blob, workerMs: Math.round(performance.now() - startedAt)})
  } catch (_) {
    self.postMessage({id, error: 'worker-encode-failed'})
  }
}
