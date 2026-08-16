const DEFAULT_IDENTIFICATION_TIMEOUT_MS = 30000
const DEFAULT_WS_URL = 'wss://backend.agavian.in/ecommerce/ws/magic-scan'
const DEFAULT_QR_API_URL = 'https://backend.agavian.in/ecommerce/magic/v1/image/qr'
const DEFAULT_TENANT_CODE = 'TENT-136C2091'

// Browser -> backend image settings.
// 480px was fine for coarse embedding search, but homography benefits from more detail.
const DEFAULT_PROCESSING_WIDTH = 900
const DEFAULT_JPEG_QUALITY = 0.72
const DEFAULT_CAPTURE_PADDING_RATIO = 0.06

// Browser-side CV gate. These checks are intentionally lenient: they should reject
// obviously bad/moving frames, not try to perform the actual target match.
const DEFAULT_ANALYSIS_WIDTH = 160
const DEFAULT_QUALITY_CHECK_INTERVAL_MS = 140
const DEFAULT_MIN_SEND_INTERVAL_MS = 250
const DEFAULT_MIN_BRIGHTNESS = 25
const DEFAULT_MAX_BRIGHTNESS = 235
const DEFAULT_MIN_SHARPNESS = 45
const DEFAULT_MAX_MOTION_SCORE = 18

const QR_SCAN_INTERVAL_MS = 600
const WS_RECONNECT_BASE_MS = 750
const WS_RECONNECT_MAX_MS = 5000

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
  const configuredUrl = config.qrApiUrl || DEFAULT_QR_API_URL
  const encodedCustomerCode = encodeURIComponent(customerCode)
  const separator = configuredUrl.includes('?') ? '&' : '?'
  return `${configuredUrl}${separator}customerCode=${encodedCustomerCode}`
}

const normalizeWebSocketUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw, window.location.href)
    if (url.protocol === 'https:') url.protocol = 'wss:'
    if (url.protocol === 'http:') url.protocol = 'ws:'
    return url.href
  } catch (_) {
    return raw
  }
}

const buildTenantWebSocketUrl = (value, tenantCode) => {
  const normalized = normalizeWebSocketUrl(value)
  if (!normalized) return ''

  try {
    const url = new URL(normalized, window.location.href)

    if (tenantCode) {
      url.searchParams.set('tenantCode', tenantCode)
    }

    return url.href
  } catch (_) {
    if (!tenantCode) return normalized

    const separator = normalized.includes('?') ? '&' : '?'
    return `${normalized}${separator}tenantCode=${encodeURIComponent(tenantCode)}`
  }
}

const getRuntimeConfig = () => {
  const query = new URLSearchParams(window.location.search)
  const globalConfig = window.IMAGE_IDENTIFICATION_CONFIG || {}
  const configuredHeaders = globalConfig.headers || {}

  const tenantCode = (
    query.get('tenantCode') ||
    globalConfig.tenantCode ||
    getMetaContent('tenant-code') ||
    configuredHeaders['x-tenant-id'] ||
    configuredHeaders['X-Tenant-Id'] ||
    DEFAULT_TENANT_CODE
  ).trim()

  const configuredWsUrl =
    query.get('imageWs') ||
    globalConfig.wsUrl ||
    getMetaContent('image-identification-websocket') ||
    DEFAULT_WS_URL

  return {
    tenantCode,

    // Browser WebSocket cannot send arbitrary X-Tenant-Id headers.
    // Therefore tenantCode is attached to the WebSocket handshake URL:
    // wss://.../ws/magic-scan?tenantCode=TENT-...
    wsUrl: buildTenantWebSocketUrl(configuredWsUrl, tenantCode),

    qrApiUrl:
      query.get('qrApi') ||
      globalConfig.qrApiUrl ||
      getMetaContent('qr-code-api') ||
      DEFAULT_QR_API_URL,

    customerCode: getCustomerCodeFromUrl(),

    processingWidth: Number(globalConfig.processingWidth) || DEFAULT_PROCESSING_WIDTH,
    jpegQuality: Number(globalConfig.jpegQuality) || DEFAULT_JPEG_QUALITY,
    capturePaddingRatio:
      Number(globalConfig.capturePaddingRatio) || DEFAULT_CAPTURE_PADDING_RATIO,

    identificationTimeoutMs:
      Number(globalConfig.identificationTimeoutMs) || DEFAULT_IDENTIFICATION_TIMEOUT_MS,

    analysisWidth: Number(globalConfig.analysisWidth) || DEFAULT_ANALYSIS_WIDTH,
    qualityCheckIntervalMs:
      Number(globalConfig.qualityCheckIntervalMs) || DEFAULT_QUALITY_CHECK_INTERVAL_MS,
    minSendIntervalMs:
      Number(globalConfig.minSendIntervalMs) || DEFAULT_MIN_SEND_INTERVAL_MS,
    minBrightness:
      Number(globalConfig.minBrightness) || DEFAULT_MIN_BRIGHTNESS,
    maxBrightness:
      Number(globalConfig.maxBrightness) || DEFAULT_MAX_BRIGHTNESS,
    minSharpness:
      Number(globalConfig.minSharpness) || DEFAULT_MIN_SHARPNESS,
    maxMotionScore:
      Number(globalConfig.maxMotionScore) || DEFAULT_MAX_MOTION_SCORE,

    // QR lookup is still normal HTTP, so keep X-Tenant-Id there.
    headers: Object.assign({
      'x-tenant-id': tenantCode,
    }, configuredHeaders),

    debugCv: globalConfig.debugCv === true,
  }
}

const getCaptureRegion = (sourceCanvas, scanRegion, paddingRatio = 0) => {
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

  // Keep a little context around the visible scan square. The backend is doing
  // containment verification, so it is fine (and useful) for the browser image
  // to include frame/wall around the clean S3 reference target.
  const safePadding = clamp(Number(paddingRatio) || 0, 0, 0.25)
  const padX = scanRect.width * safePadding
  const padY = scanRect.height * safePadding

  const left = clamp(scanRect.left - padX, canvasRect.left, canvasRect.right)
  const top = clamp(scanRect.top - padY, canvasRect.top, canvasRect.bottom)
  const right = clamp(scanRect.right + padX, canvasRect.left, canvasRect.right)
  const bottom = clamp(scanRect.bottom + padY, canvasRect.top, canvasRect.bottom)
  const scaleX = sourceWidth / canvasRect.width
  const scaleY = sourceHeight / canvasRect.height

  return {
    sx: Math.floor((left - canvasRect.left) * scaleX),
    sy: Math.floor((top - canvasRect.top) * scaleY),
    sw: Math.max(2, Math.floor((right - left) * scaleX)),
    sh: Math.max(2, Math.floor((bottom - top) * scaleY)),
  }
}

const drawCaptureRegion = (
  sourceCanvas,
  scanRegion,
  targetCanvas,
  width,
  paddingRatio = 0
) => {
  const {sx, sy, sw, sh} = getCaptureRegion(sourceCanvas, scanRegion, paddingRatio)
  const targetWidth = Math.max(2, Math.floor(width))
  const targetHeight = Math.max(2, Math.floor((sh / sw) * targetWidth))

  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight

  const context = targetCanvas.getContext('2d', {willReadFrequently: true})
  if (!context) {
    throw new Error('Could not create the frame capture canvas.')
  }

  context.drawImage(
    sourceCanvas,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    targetWidth,
    targetHeight
  )

  return context
}

const canvasToJpeg = (sourceCanvas, scanRegion, config, processingCanvas) => {
  try {
    drawCaptureRegion(
      sourceCanvas,
      scanRegion,
      processingCanvas,
      config.processingWidth,
      config.capturePaddingRatio
    )
  } catch (error) {
    return Promise.reject(error)
  }

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

const createGrayPixels = (imageData) => {
  const rgba = imageData.data
  const pixelCount = imageData.width * imageData.height
  const gray = new Uint8Array(pixelCount)

  let total = 0
  let gi = 0

  for (let i = 0; i < rgba.length; i += 4) {
    // Integer approximation of luminance: 0.299R + 0.587G + 0.114B
    const value = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8
    gray[gi++] = value
    total += value
  }

  return {
    gray,
    brightness: pixelCount ? total / pixelCount : 0,
  }
}

const calculateLaplacianVariance = (gray, width, height) => {
  if (!gray || width < 3 || height < 3) return 0

  let sum = 0
  let sumSquared = 0
  let count = 0

  // Skip every second pixel. This keeps browser-side CV very cheap while still
  // identifying strongly blurred frames.
  for (let y = 1; y < height - 1; y += 2) {
    const row = y * width

    for (let x = 1; x < width - 1; x += 2) {
      const index = row + x
      const center = gray[index]
      const laplacian =
        (4 * center) -
        gray[index - 1] -
        gray[index + 1] -
        gray[index - width] -
        gray[index + width]

      sum += laplacian
      sumSquared += laplacian * laplacian
      count++
    }
  }

  if (!count) return 0

  const mean = sum / count
  return (sumSquared / count) - (mean * mean)
}

const calculateMotionScore = (currentGray, previousGray) => {
  if (!currentGray || !previousGray || currentGray.length !== previousGray.length) {
    return null
  }

  let difference = 0
  let count = 0

  // Sampling every second pixel is enough for camera-motion detection.
  for (let i = 0; i < currentGray.length; i += 2) {
    difference += Math.abs(currentGray[i] - previousGray[i])
    count++
  }

  return count ? difference / count : null
}

const analyzeFrameQuality = (
  sourceCanvas,
  scanRegion,
  config,
  analysisCanvas,
  previousGray
) => {
  let context

  try {
    context = drawCaptureRegion(
      sourceCanvas,
      scanRegion,
      analysisCanvas,
      config.analysisWidth,
      config.capturePaddingRatio
    )
  } catch (error) {
    return {
      accepted: false,
      reason: 'NOT_READY',
      gray: previousGray,
      brightness: 0,
      sharpness: 0,
      motionScore: null,
      error,
    }
  }

  const imageData = context.getImageData(
    0,
    0,
    analysisCanvas.width,
    analysisCanvas.height
  )

  const {gray, brightness} = createGrayPixels(imageData)
  const sharpness = calculateLaplacianVariance(
    gray,
    analysisCanvas.width,
    analysisCanvas.height
  )
  const motionScore = calculateMotionScore(gray, previousGray)

  let reason = 'GOOD'

  if (brightness < config.minBrightness) {
    reason = 'TOO_DARK'
  } else if (brightness > config.maxBrightness) {
    reason = 'TOO_BRIGHT'
  } else if (sharpness < config.minSharpness) {
    reason = 'BLURRY'
  } else if (motionScore == null) {
    // We need two browser samples to know whether the camera is stable.
    reason = 'STABILIZING'
  } else if (motionScore > config.maxMotionScore) {
    reason = 'MOVING'
  }

  return {
    accepted: reason === 'GOOD',
    reason,
    gray,
    brightness,
    sharpness,
    motionScore,
  }
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
  const analysisCanvas = document.createElement('canvas')

  let cameraCanvas = null
  let scanRegion = null

  let qrRequestInFlight = false
  let qrDetecting = false
  let qrDetector = null
  let qrDetectorReady = false
  let lastQrScanAt = 0
  let qrLookupStarted = false
  let qrRequestController = null

  let matchFound = false
  let imageRecognitionPaused = false
  let identificationStartedAt = 0
  let timedOut = false

  let socket = null
  let socketReadyForFrame = false
  let socketReconnectTimer = null
  let socketReconnectAttempts = 0
  let socketGeneration = 0
  let intentionallyClosingSocket = false

  let previousAnalysisGray = null
  let lastQualityCheckAt = 0
  let lastFrameSentAt = 0
  let lastQualityReason = ''

  const clearQrRequest = () => {
    if (qrRequestController) {
      qrRequestController.abort()
      qrRequestController = null
    }
  }

  const clearSocketReconnectTimer = () => {
    if (socketReconnectTimer !== null) {
      window.clearTimeout(socketReconnectTimer)
      socketReconnectTimer = null
    }
  }

  const closeImageSocket = (reason = 'CLIENT_CLOSE') => {
    clearSocketReconnectTimer()
    socketReadyForFrame = false
    socketGeneration++

    const current = socket
    socket = null

    if (!current) return

    intentionallyClosingSocket = true
    try {
      if (
        current.readyState === WebSocket.OPEN ||
        current.readyState === WebSocket.CONNECTING
      ) {
        current.close(1000, String(reason).slice(0, 120))
      }
    } catch (_) {
    } finally {
      // onclose runs asynchronously, so it captures the old generation and
      // cannot reconnect this intentionally closed socket.
      window.setTimeout(() => {
        intentionallyClosingSocket = false
      }, 0)
    }
  }

  const resetBrowserCv = () => {
    previousAnalysisGray = null
    lastQualityCheckAt = 0
    lastFrameSentAt = 0
    lastQualityReason = ''
  }

  const dispatchMatch = (payload) => {
    const response = unwrapMagicResponse(payload)

    if (!hasMatchedVideo(response)) {
      console.warn('[image-identification] MATCHED received without videoUrlV1:', payload)
      return
    }

    matchFound = true
    socketReadyForFrame = false
    closeImageSocket('MATCHED')

    window.dispatchEvent(
      new CustomEvent('imageidentified', {
        detail: response,
      })
    )
  }

  const handleSocketMessage = (rawData) => {
    let message

    try {
      message = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    } catch (error) {
      console.error('[image-identification] Invalid WebSocket JSON:', rawData, error)
      return
    }

    const status = String(message?.status || '').toUpperCase()

    if (status === 'READY') {
      socketReadyForFrame = true

      if (config.debugCv) {
        console.log('[image-identification] backend READY', {
          confirmation: message?.currentConfirmations,
          required: message?.requiredConfirmations,
          candidateVideoMapId: message?.candidateVideoMapId,
          lastResult: message?.lastResult,
          processingMs: message?.lastProcessingMs,
        })
      }
      return
    }

    if (status === 'MATCHED') {
      console.log('[image-identification] WebSocket match:', message)
      dispatchMatch(message)
      return
    }

    if (status === 'BUSY') {
      socketReadyForFrame = false
      const retryAfterMs = Math.max(250, Number(message?.retryAfterMs) || 1000)

      window.setTimeout(() => {
        if (
          !matchFound &&
          !timedOut &&
          !imageRecognitionPaused &&
          socket?.readyState === WebSocket.OPEN
        ) {
          socketReadyForFrame = true
        }
      }, retryAfterMs)
      return
    }

    if (status === 'ERROR') {
      console.warn('[image-identification] backend scanner error:', message)
      socketReadyForFrame = false

      // PROCESSING_ERROR is normally followed by READY from the backend.
      // FRAME_TOO_LARGE is not, so allow another frame after a short delay.
      if (message?.code === 'FRAME_TOO_LARGE') {
        window.setTimeout(() => {
          if (
            !matchFound &&
            !timedOut &&
            !imageRecognitionPaused &&
            socket?.readyState === WebSocket.OPEN
          ) {
            socketReadyForFrame = true
          }
        }, 500)
      }
    }
  }

  const scheduleSocketReconnect = () => {
    if (
      socketReconnectTimer !== null ||
      matchFound ||
      timedOut ||
      imageRecognitionPaused ||
      config.customerCode ||
      qrLookupStarted
    ) {
      return
    }

    const delay = Math.min(
      WS_RECONNECT_MAX_MS,
      WS_RECONNECT_BASE_MS * Math.pow(2, Math.min(socketReconnectAttempts, 3))
    )

    socketReconnectAttempts++

    socketReconnectTimer = window.setTimeout(() => {
      socketReconnectTimer = null
      openImageSocket()
    }, delay)
  }

  const openImageSocket = () => {
    if (
      config.customerCode ||
      qrLookupStarted ||
      imageRecognitionPaused ||
      matchFound ||
      timedOut
    ) {
      return
    }

    if (!config.wsUrl) {
      console.error('[image-identification] WebSocket URL is missing.')
      return
    }

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    clearSocketReconnectTimer()
    socketReadyForFrame = false

    const generation = ++socketGeneration
    const ws = new WebSocket(config.wsUrl)
    socket = ws

    ws.onopen = () => {
      if (generation !== socketGeneration) return
      socketReconnectAttempts = 0
      console.log('[image-identification] WebSocket connected:', config.wsUrl)
      if (config.debugCv) {
        console.log('[image-identification] WebSocket tenant:', config.tenantCode)
      }
      // Do not set READY here. Backend afterConnectionEstablished() sends the
      // authoritative READY message when the scan session is prepared.
    }

    ws.onmessage = (event) => {
      if (generation !== socketGeneration) return
      handleSocketMessage(event.data)
    }

    ws.onerror = (event) => {
      if (generation !== socketGeneration) return
      console.warn('[image-identification] WebSocket error:', event)
    }

    ws.onclose = (event) => {
      if (generation !== socketGeneration) return

      if (socket === ws) socket = null
      socketReadyForFrame = false

      console.log('[image-identification] WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        clean: event.wasClean,
      })

      if (!intentionallyClosingSocket) {
        scheduleSocketReconnect()
      }
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
    closeImageSocket('TIMEOUT')
    clearQrRequest()
    window.dispatchEvent(new Event('imageidentificationtimeout'))
    console.log('[image-identification] Stopped after timeout without a match.')
  }

  const sendCurrentFrameIfReady = () => {
    if (
      config.customerCode ||
      qrLookupStarted ||
      imageRecognitionPaused ||
      matchFound ||
      timedOut ||
      !cameraCanvas ||
      !scanRegion ||
      !socketReadyForFrame ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return Promise.resolve()
    }

    const now = performance.now()

    if (now - lastQualityCheckAt < config.qualityCheckIntervalMs) {
      return Promise.resolve()
    }

    lastQualityCheckAt = now

    const quality = analyzeFrameQuality(
      cameraCanvas,
      scanRegion,
      config,
      analysisCanvas,
      previousAnalysisGray
    )

    previousAnalysisGray = quality.gray || previousAnalysisGray

    if (config.debugCv && quality.reason !== lastQualityReason) {
      console.log('[image-identification] browser CV:', {
        accepted: quality.accepted,
        reason: quality.reason,
        brightness: Number(quality.brightness || 0).toFixed(1),
        sharpness: Number(quality.sharpness || 0).toFixed(1),
        motionScore: quality.motionScore == null
          ? null
          : Number(quality.motionScore).toFixed(1),
      })
      lastQualityReason = quality.reason
    }

    if (!quality.accepted) {
      return Promise.resolve()
    }

    if (now - lastFrameSentAt < config.minSendIntervalMs) {
      return Promise.resolve()
    }

    // Lock before encoding. The backend unlocks us only by sending READY.
    socketReadyForFrame = false
    lastFrameSentAt = now

    return canvasToJpeg(
      cameraCanvas,
      scanRegion,
      config,
      processingCanvas
    )
      .then((blob) => {
        if (
          matchFound ||
          timedOut ||
          imageRecognitionPaused ||
          !socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return
        }

        // One frame at a time means bufferedAmount should normally stay near zero.
        // If it is unexpectedly backed up, wait for a later READY cycle instead
        // of adding more image bytes to the browser send buffer.
        if (socket.bufferedAmount > 512 * 1024) {
          console.warn('[image-identification] WebSocket send buffer is busy; frame dropped.')
          socketReadyForFrame = true
          return
        }

        socket.send(blob)

        if (config.debugCv) {
          console.log('[image-identification] frame sent', {
            bytes: blob.size,
            width: processingCanvas.width,
            height: processingCanvas.height,
          })
        }
      })
      .catch((error) => {
        console.error('[image-identification] Could not prepare/send frame:', error)
        // No frame reached the server, so allow a new browser frame.
        socketReadyForFrame = true
      })
  }

  const identifyByCustomerCode = (customerCode = config.customerCode) => {
    if (!customerCode || qrLookupStarted || qrRequestInFlight || matchFound) {
      return Promise.resolve()
    }

    qrLookupStarted = true
    qrRequestInFlight = true
    imageRecognitionPaused = true
    closeImageSocket('QR_LOOKUP')

    const controller = new AbortController()
    qrRequestController = controller
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
        qrRequestInFlight = false
        if (qrRequestController === controller) qrRequestController = null
      })
  }

  const identifyCurrentQr = () => {
    if (
      imageRecognitionPaused ||
      config.customerCode ||
      qrLookupStarted ||
      qrRequestInFlight ||
      qrDetecting ||
      !cameraCanvas
    ) {
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

        imageRecognitionPaused = true
        closeImageSocket('QR_DETECTED')
        return identifyByCustomerCode(parsed.code)
      })
      .finally(() => {
        qrDetecting = false
      })
  }

  return {
    name: 'image-identification',

    onStart: ({canvas}) => {
      cameraCanvas = canvas
      scanRegion = document.querySelector('#scanRegion')

      const now = performance.now()
      identificationStartedAt = now
      lastQrScanAt = now - QR_SCAN_INTERVAL_MS
      resetBrowserCv()

      console.log('[image-identification] Camera pipeline started.')
      window.addEventListener('imageidentificationpause', pauseIdentification)
      window.addEventListener('imageidentificationresume', resumeIdentification)

      if (config.customerCode) {
        identifyByCustomerCode()
      } else {
        openImageSocket()
      }
    },

    onUpdate: () => {
      const now = performance.now()

      if (!matchFound && now - identificationStartedAt >= config.identificationTimeoutMs) {
        timeOutIdentification()
        return
      }

      if (
        !imageRecognitionPaused &&
        !config.customerCode &&
        !qrLookupStarted &&
        now - lastQrScanAt >= QR_SCAN_INTERVAL_MS
      ) {
        lastQrScanAt = now
        identifyCurrentQr()
      }

      if (
        imageRecognitionPaused ||
        matchFound ||
        timedOut ||
        qrLookupStarted
      ) {
        return
      }

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        openImageSocket()
        return
      }

      if (socketReadyForFrame) {
        sendCurrentFrameIfReady()
      }
    },

    onDetach: () => {
      window.removeEventListener('imageidentificationpause', pauseIdentification)
      window.removeEventListener('imageidentificationresume', resumeIdentification)

      cameraCanvas = null
      scanRegion = null
      matchFound = false
      imageRecognitionPaused = true
      qrLookupStarted = false
      qrDetecting = false

      clearQrRequest()
      closeImageSocket('DETACH')
      resetBrowserCv()
    },
  }

  function pauseIdentification() {
    imageRecognitionPaused = true
    socketReadyForFrame = false
    closeImageSocket('PAUSED')
  }

  function resumeIdentification() {
    if (config.customerCode) {
      matchFound = true
      imageRecognitionPaused = true
      timedOut = false
      return
    }

    qrLookupStarted = false
    matchFound = false
    imageRecognitionPaused = false
    timedOut = false
    identificationStartedAt = performance.now()
    lastQrScanAt = performance.now() - QR_SCAN_INTERVAL_MS
    resetBrowserCv()
    openImageSocket()
  }
}

module.exports = {
  imageIdentificationPipelineModule,
}
