const DEFAULT_CAPTURE_INTERVAL_MS = 2000
const DEFAULT_PROCESSING_WIDTH = 480
const DEFAULT_JPEG_QUALITY = 0.85

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getMetaContent = (name) => {
  const element = document.querySelector(`meta[name="${name}"]`)
  return element ? element.content.trim() : ''
}

const getRuntimeConfig = () => {
  const query = new URLSearchParams(window.location.search)
  const globalConfig = window.IMAGE_IDENTIFICATION_CONFIG || {}

  return {
    apiUrl:
      query.get('imageApi') ||
      globalConfig.apiUrl ||
      getMetaContent('image-identification-api'),
    fieldName:
      globalConfig.fieldName ||
      getMetaContent('image-identification-field') ||
      'formData',
    captureIntervalMs: Number(globalConfig.captureIntervalMs) || DEFAULT_CAPTURE_INTERVAL_MS,
    processingWidth: Number(globalConfig.processingWidth) || DEFAULT_PROCESSING_WIDTH,
    jpegQuality: Number(globalConfig.jpegQuality) || DEFAULT_JPEG_QUALITY,
    headers: globalConfig.headers || {},
  }
}

const getCaptureRegion = (sourceCanvas, scanRegion) => {
  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('8th Wall camera canvas is not ready.')
  }

  if (!scanRegion) {
    throw new Error('The scan square element could not be found.')
  }

  const canvasRect = sourceCanvas.getBoundingClientRect()
  const scanRect = scanRegion.getBoundingClientRect()
  if (!canvasRect.width || !canvasRect.height || !scanRect.width || !scanRect.height) {
    throw new Error('The scan square is not ready.')
  }

  const left = clamp(scanRect.left, canvasRect.left, canvasRect.right)
  const top = clamp(scanRect.top, canvasRect.top, canvasRect.bottom)
  const right = clamp(scanRect.right, canvasRect.left, canvasRect.right)
  const bottom = clamp(scanRect.bottom, canvasRect.top, canvasRect.bottom)
  const scaleX = sourceWidth / canvasRect.width
  const scaleY = sourceHeight / canvasRect.height

  return {
    sx: Math.floor((left - canvasRect.left) * scaleX),
    sy: Math.floor((top - canvasRect.top) * scaleY),
    sw: Math.max(2, Math.floor((right - left) * scaleX)),
    sh: Math.max(2, Math.floor((bottom - top) * scaleY)),
  }
}

const canvasToJpeg = (sourceCanvas, scanRegion, config, processingCanvas) => {
  let region

  try {
    region = getCaptureRegion(sourceCanvas, scanRegion)
  } catch (error) {
    return Promise.reject(error)
  }

  const {sx, sy, sw, sh} = region
  const width = Math.max(2, Math.floor(config.processingWidth))
  const height = Math.max(2, Math.floor((sh / sw) * width))

  processingCanvas.width = width
  processingCanvas.height = height

  const context = processingCanvas.getContext('2d', {willReadFrequently: true})
  if (!context) {
    return Promise.reject(new Error('Could not create the frame capture canvas.'))
  }

  context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    processingCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not encode the camera frame as JPEG.'))
        }
      },
      'image/jpeg',
      clamp(config.jpegQuality, 0.1, 1)
    )
  })
}

const parseResponse = (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

const imageIdentificationPipelineModule = () => {
  const config = getRuntimeConfig()
  const processingCanvas = document.createElement('canvas')
  let cameraCanvas = null
  let scanRegion = null
  let requestInFlight = false
  let lastCaptureAt = 0
  let warnedAboutMissingApi = false

  const identifyCurrentFrame = () => {
    if (!config.apiUrl || !cameraCanvas || requestInFlight) {
      if (!config.apiUrl && !warnedAboutMissingApi) {
        warnedAboutMissingApi = true
        console.warn(
          '[image-identification] API URL is missing. Set the image-identification-api meta tag, ' +
            'window.IMAGE_IDENTIFICATION_CONFIG.apiUrl, or the ?imageApi= query parameter.'
        )
      }
      return Promise.resolve()
    }

    requestInFlight = true

    return canvasToJpeg(cameraCanvas, scanRegion, config, processingCanvas)
      .then((blob) => {
        const filename = `frame_${Date.now()}.jpg`
        const formData = new FormData()
        formData.append(config.fieldName, blob, filename)
        formData.append('frameShape', '0')
        formData.append(
          'mobileFlag',
          String(
            window.matchMedia?.('(pointer: coarse)').matches ||
              navigator.maxTouchPoints > 0
          )
        )

        return fetch(config.apiUrl, {
          method: 'POST',
          headers: config.headers,
          body: formData,
        })
      })
      .then((response) =>
        parseResponse(response).then((body) => ({
          response,
          body,
        }))
      )
      .then(({response, body}) => {
        if (!response.ok) {
          console.error('[image-identification] API error', {
            status: response.status,
            response: body,
          })
          return
        }

        console.log('[image-identification] Identified image response:', body)
        window.dispatchEvent(
          new CustomEvent('imageidentified', {
            detail: body,
          })
        )
      })
      .catch((error) => {
        console.error('[image-identification] Request failed:', error)
      })
      .finally(() => {
        requestInFlight = false
      })
  }

  return {
    name: 'image-identification',

    onStart: ({canvas}) => {
      cameraCanvas = canvas
      scanRegion = document.querySelector('#scanRegion')
      lastCaptureAt = performance.now()
      console.log('[image-identification] Camera pipeline started.')
    },

    onUpdate: () => {
      const now = performance.now()

      if (requestInFlight || now - lastCaptureAt < config.captureIntervalMs) {
        return
      }

      lastCaptureAt = now
      identifyCurrentFrame()
    },

    onDetach: () => {
      cameraCanvas = null
      scanRegion = null
      requestInFlight = false
    },
  }
}

module.exports = {
  imageIdentificationPipelineModule,
}
