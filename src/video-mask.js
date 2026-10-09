// Each mask is converted to grayscale: white shows video, black hides it.
// Keep mask UVs unchanged while the video texture uses its own cover transform.
const maskCache = new Map()

const getVideoMaskConfig = (entry, resolveUrl = value => value) => {
  const shape = entry.shape ?? entry.frameShape
  const custom = shape && Object(shape) === shape ? shape : {}
  const url = entry.maskUrl || entry.customShapeUrl || custom.customShapeUrl || ''
  const mode = entry.maskMode || custom.maskMode || 'auto'
  return {
    maskUrl: url ? resolveUrl(url) : '',
    maskMode: ['alpha', 'luminance'].includes(mode) ? mode : 'auto',
    shape: Number(shape) === 1 || shape === 'circle' ? 'circle' : shape === 'heart' ? 'heart' : '',
  }
}

// Shape experiences use a square centered inside the tracked target. This
// keeps square video frames and mask outlines independent of target aspect.
const getVideoSurfaceSize = (config, width, height) => {
  if (!config.maskUrl && !config.shape) return {width, height}
  const size = Math.min(width, height)
  return {width: size, height: size}
}

const makeShapeMask = (shape) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const size = Math.min(canvas.width, canvas.height)
  ctx.translate((canvas.width - size) / 2, (canvas.height - size) / 2)
  ctx.scale(size, size)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  if (shape === 'circle') {
    ctx.arc(0.5, 0.5, 0.5, 0, Math.PI * 2)
  } else {
    ctx.moveTo(0.5, 0.95)
    ctx.bezierCurveTo(0.4, 0.85, 0.02, 0.58, 0.02, 0.3)
    ctx.bezierCurveTo(0.02, 0.02, 0.35, -0.02, 0.5, 0.23)
    ctx.bezierCurveTo(0.65, -0.02, 0.98, 0.02, 0.98, 0.3)
    ctx.bezierCurveTo(0.98, 0.58, 0.6, 0.85, 0.5, 0.95)
  }
  ctx.closePath()
  ctx.fill()
  return canvas
}

const loadImageMask = (url, mode) => new Promise((resolve, reject) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  const timer = window.setTimeout(() => fail(new Error(`Video mask timed out: ${url}`)), 15000)
  const cleanup = () => {
    window.clearTimeout(timer)
    image.onload = null
    image.onerror = null
  }
  const fail = (error) => {
    cleanup()
    reject(error)
  }
  image.onerror = () => fail(new Error(`Video mask failed to load: ${url}`))
  image.onload = () => {
    cleanup()
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let useAlpha = mode === 'alpha'
      if (mode === 'auto') {
        for (let i = 3; i < pixels.data.length; i += 4) {
          if (pixels.data[i] < 255) {
            useAlpha = true
            break
          }
        }
      }
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = useAlpha ? pixels.data[i + 3] : Math.round(
          (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] +
            0.0722 * pixels.data[i + 2]) * pixels.data[i + 3] / 255
        )
        pixels.data[i] = value
        pixels.data[i + 1] = value
        pixels.data[i + 2] = value
        pixels.data[i + 3] = 255
      }
      ctx.putImageData(pixels, 0, 0)
      resolve(canvas)
    } catch (error) {
      reject(error)
    }
  }
  image.src = url
})

const prepareVideoMask = (config) => {
  const {maskUrl, maskMode, shape} = config
  if (!maskUrl && !shape) return Promise.resolve(null)
  const key = JSON.stringify(maskUrl ? [maskUrl, maskMode] : [shape])
  if (maskCache.has(key)) return maskCache.get(key)
  const pending = maskUrl ? loadImageMask(maskUrl, maskMode) : Promise.resolve(makeShapeMask(shape))
  maskCache.set(key, pending)
  pending.catch(() => maskCache.delete(key))
  // Bound CPU canvas memory across many scanned experiences.
  if (maskCache.size > 32) maskCache.delete(maskCache.keys().next().value)
  return pending
}

module.exports = {getVideoMaskConfig, getVideoSurfaceSize, prepareVideoMask}
