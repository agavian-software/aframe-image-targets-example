const DEFAULT_CAPTURE_INTERVAL_MS = 0
const DEFAULT_IDENTIFICATION_TIMEOUT_MS = 30000
const DEFAULT_API_URL = 'https://backend.agavian.in/ecommerce/magic/v1/image/match'
const DEFAULT_QR_API_PATH = '/ecommerce/magic/v1/image/qr'
const DEFAULT_PROCESSING_WIDTH = 480
const DEFAULT_JPEG_QUALITY = 0.85
const QR_SCAN_INTERVAL_MS = 600

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getMetaContent = (name) => {
  const element = document.querySelector(`meta[name="${name}"]`)
  return element ? element.content.trim() : ''
}

const getCustomerCodeFromUrl = () => {
  const query = new URLSearchParams(window.location.search)
  return (query.get('code') || query.get('customerCode') || query.get('customer_code') || '').trim()
}

const parseQrLinkParams = (rawValue) => {
  const link = typeof rawValue === 'string' ? rawValue.trim() : ''
  if (!link) return null

  try {
    const url = new URL(link, window.location.href)
    const params = Object.fromEntries(url.searchParams.entries())
    const code = (url.searchParams.get('code') || '').trim()

    return {
      link: url.href,
      code,
      customerCode: code,
      params,
    }
  } catch (_) {
    return {
      link,
      code: '',
      customerCode: '',
      params: {},
    }
  }
}

const getQrApiUrl = (config, customerCode) => {
  const configuredUrl = config.qrApiUrl || ''
  const encodedCustomerCode = encodeURIComponent(customerCode)

  if (configuredUrl) {
    const separator = configuredUrl.includes('?') ? '&' : '?'
    return `${configuredUrl}${separator}customerCode=${encodedCustomerCode}`
  }

  try {
    const url = new URL(config.apiUrl || DEFAULT_API_URL, window.location.href)
    return `${url.origin}${DEFAULT_QR_API_PATH}?customerCode=${encodedCustomerCode}`
  } catch (_) {
    return `${DEFAULT_QR_API_PATH}?customerCode=${encodedCustomerCode}`
  }
}

const getRuntimeConfig = () => {
  const query = new URLSearchParams(window.location.search)
  const globalConfig = window.IMAGE_IDENTIFICATION_CONFIG || {}

  return {
    apiUrl:
      query.get('imageApi') ||
      globalConfig.apiUrl ||
      getMetaContent('image-identification-api') ||
      DEFAULT_API_URL,
    qrApiUrl:
      query.get('qrApi') ||
      globalConfig.qrApiUrl ||
      getMetaContent('qr-code-api') ||
      '',
    customerCode:
      getCustomerCodeFromUrl(),
    fieldName:
      globalConfig.fieldName ||
      getMetaContent('image-identification-field') ||
      'files',
    captureIntervalMs: Number(globalConfig.captureIntervalMs) || DEFAULT_CAPTURE_INTERVAL_MS,
    identificationTimeoutMs:
      Number(globalConfig.identificationTimeoutMs) || DEFAULT_IDENTIFICATION_TIMEOUT_MS,
    processingWidth: Number(globalConfig.processingWidth) || DEFAULT_PROCESSING_WIDTH,
    jpegQuality: Number(globalConfig.jpegQuality) || DEFAULT_JPEG_QUALITY,
    headers: Object.assign({
      'x-tenant-id': 'TENT-136C2091',
    }, globalConfig.headers || {}),
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

const unwrapMagicResponse = (body) =>
  body?.response ||
  body?.data?.response ||
  body?.data?.data?.response ||
  body?.payload?.response ||
  body?.data ||
  body

const hasMatchedVideo = (body) => {
  const response = unwrapMagicResponse(body)
  return Array.isArray(response?.videoUrlV1)
    ? response.videoUrlV1.length > 0
    : Boolean(response?.videoUrlV1)
}

const imageIdentificationPipelineModule = () => {
  const config = getRuntimeConfig()
  const processingCanvas = document.createElement('canvas')
  let cameraCanvas = null
  let scanRegion = null
  let requestInFlight = false
  let qrRequestInFlight = false
  let qrDetecting = false
  let qrDetector = null
  let qrDetectorReady = false
  let lastQrScanAt = 0
  let lastCaptureAt = 0
  let warnedAboutMissingApi = false
  let matchFound = false
  let imageRecognitionPaused = false
  let identificationStartedAt = 0
  let requestController = null
  let timedOut = false
  let qrLookupStarted = false

  const stopPendingRequest = () => {
    if (requestController) {
      requestController.abort()
      requestController = null
    }
  }

  const ensureQrDetector = () => {
    if (qrDetectorReady) return Promise.resolve(qrDetector)
    qrDetectorReady = true

    if (typeof window.BarcodeDetector !== 'function') {
      console.warn('[image-identification] QR scanning is not supported by this browser.')
      return Promise.resolve(null)
    }

    return Promise.resolve()
      .then(() => {
        if (typeof window.BarcodeDetector.getSupportedFormats !== 'function') return true
        return window.BarcodeDetector.getSupportedFormats()
          .then(formats => !Array.isArray(formats) || formats.includes('qr_code'))
          .catch(() => true)
      })
      .then((isSupported) => {
        if (!isSupported) {
          console.warn('[image-identification] QR code format is not supported by this browser.')
          return null
        }

        qrDetector = new window.BarcodeDetector({formats: ['qr_code']})
        return qrDetector
      })
      .catch((error) => {
        console.warn('[image-identification] Could not start QR scanner:', error)
        qrDetector = null
        return null
      })
  }

  const timeOutIdentification = () => {
    timedOut = true
    matchFound = true
    stopPendingRequest()
    window.dispatchEvent(new Event('imageidentificationtimeout'))
    console.log('[image-identification] Stopped after 30 seconds without a match.')
  }

  const identifyCurrentFrame = () => {
    if (config.customerCode) return Promise.resolve()

    if (imageRecognitionPaused || matchFound || !config.apiUrl || !cameraCanvas || requestInFlight) {
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
    const controller = new AbortController()
    requestController = controller

    return canvasToJpeg(cameraCanvas, scanRegion, config, processingCanvas)
      .then((blob) => {
        const filename = `frame_${Date.now()}.jpg`
        const formData = new FormData()
        formData.append(config.fieldName, blob, filename)

        return fetch(config.apiUrl, {
          method: 'POST',
          headers: config.headers,
          body: formData,
          signal: controller.signal,
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
        if (timedOut || !hasMatchedVideo(body)) {
          return
        }

        matchFound = true
        stopPendingRequest()
        window.dispatchEvent(
          new CustomEvent('imageidentified', {
            detail: unwrapMagicResponse(body),
          })
        )
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        console.error('[image-identification] Request failed:', error)
      })
      .finally(() => {
        requestInFlight = false
        if (requestController === controller) requestController = null
      })
  }

  const identifyByCustomerCode = (customerCode = config.customerCode) => {
    if (!customerCode || qrLookupStarted || requestInFlight || matchFound) {
      return Promise.resolve()
    }

    qrLookupStarted = true
    requestInFlight = true
    const controller = new AbortController()
    requestController = controller
    const qrApiUrl = getQrApiUrl(config, customerCode)

    console.log('[image-identification] customerCode found; using QR lookup:', customerCode)

    return fetch(qrApiUrl, {
      method: 'GET',
      headers: config.headers,
      signal: controller.signal,
    })
      .then((response) =>
        parseResponse(response).then((body) => ({
          response,
          body,
        }))
      )
      .then(({response, body}) => {
        if (!response.ok) {
          console.error('[image-identification] QR API error', {
            status: response.status,
            response: body,
          })
          matchFound = false
          return
        }

        console.log('[image-identification] QR response:', body)
        if (timedOut || !hasMatchedVideo(body)) {
          matchFound = false
          return
        }

        matchFound = true
        stopPendingRequest()
        window.dispatchEvent(
          new CustomEvent('imageidentified', {
            detail: unwrapMagicResponse(body),
          })
        )
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        matchFound = false
        console.error('[image-identification] QR request failed:', error)
      })
      .finally(() => {
        requestInFlight = false
        if (requestController === controller) requestController = null
      })
  }

  const identifyCurrentQr = () => {
    if (config.customerCode || qrLookupStarted || qrRequestInFlight || qrDetecting || !cameraCanvas) {
      return Promise.resolve()
    }

    qrDetecting = true

    return ensureQrDetector()
      .then((detector) => {
        if (!detector || qrLookupStarted || qrRequestInFlight) return null
        return detector.detect(cameraCanvas)
      })
      .then((results) => {
        const rawValue = results?.find(item => item?.rawValue)?.rawValue
        if (!rawValue || qrLookupStarted) return

        const parsed = parseQrLinkParams(rawValue)
        if (!parsed?.code) {
          console.warn('[image-identification] QR found without code param:', parsed)
          window.dispatchEvent(new CustomEvent('qrdetected', {detail: parsed}))
          return
        }

        console.log('[image-identification] QR found; parsed code:', parsed.code)
        window.dispatchEvent(new CustomEvent('qrdetected', {detail: parsed}))

        qrRequestInFlight = true
        imageRecognitionPaused = true
        stopPendingRequest()
        requestInFlight = false

        return identifyByCustomerCode(parsed.code)
      })
      .finally(() => {
        qrDetecting = false
        qrRequestInFlight = false
      })
  }

  return {
    name: 'image-identification',

    onStart: ({canvas}) => {
      cameraCanvas = canvas
      scanRegion = document.querySelector('#scanRegion')
      lastCaptureAt = performance.now()
      lastQrScanAt = lastCaptureAt - QR_SCAN_INTERVAL_MS
      identificationStartedAt = lastCaptureAt
      console.log('[image-identification] Camera pipeline started.')
      window.addEventListener('imageidentificationpause', pauseIdentification)
      window.addEventListener('imageidentificationresume', resumeIdentification)
      identifyByCustomerCode()
    },

    onUpdate: () => {
      const now = performance.now()

      if (!matchFound && now - identificationStartedAt >= config.identificationTimeoutMs) {
        timeOutIdentification()
        return
      }

      if (!config.customerCode && !qrLookupStarted && now - lastQrScanAt >= QR_SCAN_INTERVAL_MS) {
        lastQrScanAt = now
        identifyCurrentQr()
      }

      if (
        imageRecognitionPaused ||
        matchFound ||
        requestInFlight ||
        now - lastCaptureAt < config.captureIntervalMs
      ) {
        return
      }

      lastCaptureAt = now
      identifyCurrentFrame()
    },

    onDetach: () => {
      window.removeEventListener('imageidentificationpause', pauseIdentification)
      window.removeEventListener('imageidentificationresume', resumeIdentification)
      cameraCanvas = null
      scanRegion = null
      requestInFlight = false
      qrRequestInFlight = false
      qrDetecting = false
      matchFound = false
      imageRecognitionPaused = false
      stopPendingRequest()
    },
  }

  function pauseIdentification() {
    imageRecognitionPaused = true
    stopPendingRequest()
  }

  function resumeIdentification() {
    if (config.customerCode) {
      matchFound = true
      imageRecognitionPaused = true
      timedOut = false
      return
    }

    matchFound = false
    imageRecognitionPaused = false
    timedOut = false
    identificationStartedAt = performance.now()
    // The caller owns the delay, so capture on the next pipeline update.
    lastCaptureAt = performance.now() - config.captureIntervalMs
    lastQrScanAt = performance.now() - QR_SCAN_INTERVAL_MS
  }
}

module.exports = {
  imageIdentificationPipelineModule,
}
