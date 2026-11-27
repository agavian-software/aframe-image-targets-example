const {createWorkerJpegEncoder} = require('./scanner-jpeg-encoder')
const {getMagicEntries} = require('./magic-entries')

const DEFAULT_IDENTIFICATION_TIMEOUT_MS = 30000
const DEFAULT_WS_URL = 'wss://backend.agavian.in/magic/ws/magic-scan'
const DEFAULT_QR_API_URL = 'https://backend.agavian.in/magic/magic/v1/image/qr'
const DEFAULT_TENANT_CODE = 'TENT-136C2091'

// Browser -> backend image settings.
// 480px was fine for coarse embedding search, but homography benefits from more detail.
const DEFAULT_PROCESSING_WIDTH = 900
const DEFAULT_JPEG_QUALITY = 0.72
const DEFAULT_CAPTURE_PADDING_RATIO = 0.06
const REDUCED_PROCESSING_WIDTH = 720
const SLOW_CAPTURE_THRESHOLD_MS = 120
const SLOW_CAPTURES_BEFORE_REDUCTION = 2
const REDUCED_FRAMES_BEFORE_PROBE = 3

// Browser-side CV gate. These checks are intentionally lenient: they should reject
// obviously bad/moving frames, not try to perform the actual target match.
const DEFAULT_ANALYSIS_WIDTH = 160
const DEFAULT_QUALITY_CHECK_INTERVAL_MS = 140
const DEFAULT_MIN_SEND_INTERVAL_MS = 250
const DEFAULT_MIN_BRIGHTNESS = 25
const DEFAULT_MAX_BRIGHTNESS = 235
const DEFAULT_MIN_SHARPNESS = 45
const DEFAULT_MAX_MOTION_SCORE = 18

const MAX_SOCKET_BUFFERED_BYTES = 512 * 1024
const MAX_DEBUG_LOG_ENTRIES = 20
const WS_RECONNECT_BASE_MS = 750
const WS_RECONNECT_MAX_MS = 5000

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const elapsedMs = (start, end) => start == null ? null : Math.round(end - start)

const getMetaContent = (name) => {
  const element = document.querySelector(`meta[name="${name}"]`)
  return element ? element.content.trim() : ''
}

const getCustomerCodeFromUrl = () => {
  const query = new URLSearchParams(window.location.search)
  return (query.get('code') || query.get('customerCode') || query.get('customer_code') || '').trim()
}

const getCustomerCodeLookupUrl = (config, customerCode) => {
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
  const queryWidth = Number(query.get('scanWidth'))
  const globalWidth = Number(globalConfig.processingWidth)
  const fixedWidth = queryWidth === REDUCED_PROCESSING_WIDTH || queryWidth === DEFAULT_PROCESSING_WIDTH
    ? queryWidth
    : (Number.isFinite(globalWidth) && globalWidth !== 0 ? globalWidth : null)
  const debugParam = query.get('scannerDebug') ?? query.get('scannerdebug')
  const showScannerDebug = debugParam !== null && debugParam !== '0'

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

    processingWidth: fixedWidth ?? DEFAULT_PROCESSING_WIDTH,
    adaptiveWidth: fixedWidth === null,
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

    // The direct customer-code lookup uses the X-Tenant-Id HTTP header.
    headers: Object.assign({
      'x-tenant-id': tenantCode,
    }, configuredHeaders),

    debugCv: globalConfig.debugCv === true,
    scannerDebug: showScannerDebug || globalConfig.scannerDebug === true,
    showScannerDebug,
    useWorkerJpeg: query.get('scanEncoder') !== 'canvas',
  }
}

const createScannerDebugPanel = () => {
  const panel = document.createElement('details')
  const heading = document.createElement('summary')
  const output = document.createElement('pre')
  const entries = []

  panel.className = 'scannerDebug'
  panel.open = true
  heading.textContent = 'Scanner timing'
  output.setAttribute('aria-label', 'Recent scanner events')
  panel.append(heading, output)
  document.body.appendChild(panel)

  return {
    log(event, fields, elapsed) {
      const timestamp = (elapsed / 1000).toFixed(2)
      const details = Object.entries(fields || {})
        .filter(([, value]) => value != null)
        .map(([name, value]) => {
          const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
          return `${name}=${text}`
        })
      const title = `${timestamp}s  ${event}`
      entries.unshift(details.length ? `${title}\n${details.join('  ')}` : title)
      if (entries.length > MAX_DEBUG_LOG_ENTRIES) entries.pop()
      output.textContent = entries.join('\n\n')
    },
    remove: () => panel.remove(),
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

const createCaptureSurface = () => ({canvas: document.createElement('canvas'), context: null})

const drawCaptureRegion = (sourceCanvas, {sx, sy, sw, sh}, surface, width) => {
  const targetWidth = Math.max(2, Math.floor(width))
  const targetHeight = Math.max(2, Math.floor((sh / sw) * targetWidth))
  const {canvas} = surface

  if (canvas.width !== targetWidth) canvas.width = targetWidth
  if (canvas.height !== targetHeight) canvas.height = targetHeight

  surface.context ||= canvas.getContext('2d', {willReadFrequently: true})
  const {context} = surface
  if (!context) {
    throw new Error('Could not create the frame capture canvas.')
  }

  // Replace the whole crop, including any transparent pixels from the XR canvas.
  context.globalCompositeOperation = 'copy'
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

const canvasToJpeg = (canvas, jpegQuality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not encode the camera frame as JPEG.'))
        }
      },
      'image/jpeg',
      clamp(jpegQuality, 0.1, 1)
    )
  })

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
  analysisSurface,
  previousGray
) => {
  let crop
  let imageData
  const {canvas} = analysisSurface

  try {
    crop = getCaptureRegion(sourceCanvas, scanRegion, config.capturePaddingRatio)
    const context = drawCaptureRegion(sourceCanvas, crop, analysisSurface, config.analysisWidth)
    imageData = context.getImageData(0, 0, canvas.width, canvas.height)
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

  const {gray, brightness} = createGrayPixels(imageData)
  const sharpness = calculateLaplacianVariance(gray, canvas.width, canvas.height)
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
    crop,
    reason,
    gray,
    brightness,
    sharpness,
    motionScore,
  }
}

const unwrapMagicResponse = (body) =>
  body?.response ||
  body?.data?.response ||
  body?.data?.data?.response ||
  body?.magic?.response ||
  body?.payload?.response ||
  body?.data ||
  body

const startCustomerCodeIdentification = (customerCode) => {
  const config = getRuntimeConfig()
  const lookupUrl = getCustomerCodeLookupUrl(config, customerCode)
  let pendingLookup = null
  let timeout = null

  const cancelLookup = () => {
    pendingLookup?.abort()
    pendingLookup = null
    window.clearTimeout(timeout)
  }
  const failLookup = () => {
    cancelLookup()
    window.dispatchEvent(new Event('imageidentificationtimeout'))
  }
  const lookup = async () => {
    if (pendingLookup) return
    const controller = new AbortController()
    pendingLookup = controller
    timeout = window.setTimeout(failLookup, config.identificationTimeoutMs)

    try {
      const response = await fetch(lookupUrl, {
        method: 'GET',
        headers: config.headers,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!response.ok) throw new Error(`Customer lookup returned HTTP ${response.status}.`)
      const body = unwrapMagicResponse(await response.json())
      if (controller.signal.aborted) return
      if (!getMagicEntries(body).length) throw new Error('Customer lookup returned no playable image targets.')

      window.clearTimeout(timeout)
      pendingLookup = null
      window.dispatchEvent(new CustomEvent('imageidentified', {detail: body}))
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('[image-identification] Customer lookup failed:', error)
      failLookup()
    }
  }

  window.addEventListener('imageidentificationpause', cancelLookup)
  window.addEventListener('imageidentificationresume', lookup)
  lookup()
}

const hasMatchedVideo = (body) => {
  const response = unwrapMagicResponse(body)
  return Array.isArray(response?.videoUrlV1)
    ? response.videoUrlV1.length > 0
    : Boolean(response?.videoUrlV1)
}

const imageIdentificationPipelineModule = () => {
  const config = getRuntimeConfig()
  const processingSurface = createCaptureSurface()
  const analysisSurface = createCaptureSurface()
  const workerJpeg = config.useWorkerJpeg ? createWorkerJpegEncoder({
    window,
    workerUrl: new URL('scanner-jpeg-worker.js', document.baseURI || window.location.href),
    now: () => performance.now(),
  }) : null

  let cameraCanvas = null
  let scanRegion = null

  let matchFound = false
  let imageRecognitionPaused = false
  let identificationSuspended = false
  let scanGeneration = 0
  let identificationStartedAt = 0
  let timedOut = false

  let socket = null
  let socketReadyForFrame = false
  let encodingFrame = false
  let socketRetryTimer = null
  let socketReconnectTimer = null
  let socketReconnectAttempts = 0
  let socketGeneration = 0
  let intentionallyClosingSocket = false

  let previousAnalysisGray = null
  let lastQualityCheckAt = -Infinity
  let lastFrameAttemptAt = -Infinity
  let lastQualityReason = ''
  let slowCaptureCount = 0
  let reducedFramesRemaining = 0
  let lastSentWidth = null
  let timing = null
  let debugPanel = null

  const logTiming = (event, fields) => {
    if (!timing) return
    console.log('[image-identification] timing', {event, ...fields})
    debugPanel?.log(event, fields, performance.now() - identificationStartedAt)
  }

  const reportSocketReply = (event, message, extra) => {
    if (!timing) return
    const now = performance.now()
    const replyMs = elapsedMs(timing.pendingSendAt, now)
    timing.pendingSendAt = null
    logTiming(event, {
      [event === 'ready' ? 'sendToReadyMs' : 'sendToReplyMs']: replyMs,
      serverProcessingMs: message.lastProcessingMs ?? null,
      confirmations: message.currentConfirmations ?? null,
      requiredConfirmations: message.requiredConfirmations ?? null,
      lastResult: message.lastResult ?? null,
      ...extra,
    })
  }

  const allowNextFrame = () => {
    socketReadyForFrame = true
    if (timing) timing.readyAt ??= performance.now()
  }

  const clearSocketRetryTimer = () => {
    if (socketRetryTimer === null) return
    window.clearTimeout(socketRetryTimer)
    socketRetryTimer = null
  }

  const retryFrameAfter = (delay) => {
    clearSocketRetryTimer()
    const current = socket
    socketRetryTimer = window.setTimeout(() => {
      socketRetryTimer = null
      if (socket === current && current?.readyState === WebSocket.OPEN && !encodingFrame) {
        allowNextFrame()
      }
    }, delay)
  }

  const clearSocketReconnectTimer = () => {
    if (socketReconnectTimer !== null) {
      window.clearTimeout(socketReconnectTimer)
      socketReconnectTimer = null
    }
  }

  const closeImageSocket = (reason = 'CLIENT_CLOSE') => {
    clearSocketReconnectTimer()
    clearSocketRetryTimer()
    socketReadyForFrame = false
    encodingFrame = false
    socketGeneration++
    workerJpeg?.cancel()

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
    lastQualityCheckAt = -Infinity
    lastFrameAttemptAt = -Infinity
    lastQualityReason = ''
    slowCaptureCount = 0
    reducedFramesRemaining = 0
    lastSentWidth = null
    timing = config.scannerDebug ? {
      readyAt: null,
      pendingSendAt: null,
      lastSendAt: null,
      lastUpdateAt: null,
      maxXrUpdateGapMs: 0,
      rejectedFrames: {},
    } : null
  }

  const logScanStart = () => {
    if (config.showScannerDebug && document.body) debugPanel ||= createScannerDebugPanel()
    logTiming('scan-start', {
      cameraWidth: cameraCanvas?.width,
      cameraHeight: cameraCanvas?.height,
      processingWidth: config.processingWidth,
      adaptiveWidth: config.adaptiveWidth,
      preferredJpegEncoder: workerJpeg ? 'worker' : 'canvas',
    })
  }

  const noteCaptureTime = (width, duration) => {
    if (!config.adaptiveWidth) return
    if (reducedFramesRemaining > 0) {
      reducedFramesRemaining--
      if (reducedFramesRemaining === 0) {
        logTiming('capture-width-change', {from: width, to: config.processingWidth, reason: 'full-width-probe'})
      }
      return
    }

    if (duration < SLOW_CAPTURE_THRESHOLD_MS) {
      slowCaptureCount = 0
      return
    }

    slowCaptureCount++
    if (slowCaptureCount >= SLOW_CAPTURES_BEFORE_REDUCTION) {
      // Give the matcher regular full-detail frames, even if the phone stays slow.
      slowCaptureCount = 0
      reducedFramesRemaining = REDUCED_FRAMES_BEFORE_PROBE
      logTiming('capture-width-change', {
        from: width,
        to: REDUCED_PROCESSING_WIDTH,
        reason: 'slow-capture',
        captureMs: Math.round(duration),
      })
    }
  }

  const dispatchMatch = (payload) => {
    if (identificationSuspended || matchFound || timedOut) return
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
      if (encodingFrame) {
        logTiming('ready-during-encode')
        return
      }
      clearSocketRetryTimer()
      allowNextFrame()
      reportSocketReply('ready', message)

      if (config.adaptiveWidth && lastSentWidth === config.processingWidth &&
          Number(message.currentConfirmations) > 0) {
        // A full-detail frame is already confirming a match. Keep that detail
        // so the backend can finish with consecutive confirmations.
        if (reducedFramesRemaining > 0) {
          logTiming('capture-width-held', {width: lastSentWidth, reason: 'match-confirming'})
        }
        reducedFramesRemaining = 0
        slowCaptureCount = 0
      }

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
      reportSocketReply('matched', message, {
        scanElapsedMs: elapsedMs(identificationStartedAt, performance.now()),
      })
      console.log('[image-identification] WebSocket match:', message)
      dispatchMatch(message)
      return
    }

    if (status === 'BUSY') {
      socketReadyForFrame = false
      const retryAfterMs = Math.max(250, Number(message?.retryAfterMs) || 1000)
      if (timing) timing.readyAt = null
      reportSocketReply('busy', message, {retryAfterMs})
      retryFrameAfter(retryAfterMs)
      return
    }

    if (status === 'ERROR') {
      console.warn('[image-identification] backend scanner error:', message)
      socketReadyForFrame = false
      clearSocketRetryTimer()
      if (timing) timing.readyAt = null
      reportSocketReply('error', message, {code: message.code})

      // PROCESSING_ERROR is normally followed by READY from the backend.
      // FRAME_TOO_LARGE is not, so allow another frame after a short delay.
      if (message?.code === 'FRAME_TOO_LARGE') {
        retryFrameAfter(500)
      }
    }
  }

  const scheduleSocketReconnect = () => {
    if (
      socketReconnectTimer !== null ||
      matchFound ||
      timedOut ||
      imageRecognitionPaused
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
    if (imageRecognitionPaused || matchFound || timedOut) return

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
    clearSocketRetryTimer()
    socketReadyForFrame = false
    encodingFrame = false
    lastSentWidth = null
    if (timing) {
      timing.readyAt = null
      timing.pendingSendAt = null
    }

    const generation = ++socketGeneration
    const connectingAt = performance.now()
    const ws = new WebSocket(config.wsUrl)
    socket = ws

    ws.onopen = () => {
      if (generation !== socketGeneration) return
      socketReconnectAttempts = 0
      logTiming('socket-open', {connectMs: elapsedMs(connectingAt, performance.now())})
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
      encodingFrame = false
      clearSocketRetryTimer()
      workerJpeg?.cancel()

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

  const timeOutIdentification = () => {
    if (timing) {
      const now = performance.now()
      logTiming('timeout', {
        scanElapsedMs: elapsedMs(identificationStartedAt, now),
        waitingForReadyMs: elapsedMs(timing.pendingSendAt, now),
        maxXrUpdateGapMs: Math.round(timing.maxXrUpdateGapMs),
        rejectedFrames: timing.rejectedFrames,
      })
    }
    ++scanGeneration
    timedOut = true
    matchFound = true
    closeImageSocket('TIMEOUT')
    window.dispatchEvent(new Event('imageidentificationtimeout'))
    console.log('[image-identification] Stopped after timeout without a match.')
  }

  const sendCurrentFrameIfReady = async () => {
    if (
      imageRecognitionPaused ||
      matchFound ||
      timedOut ||
      !cameraCanvas ||
      !scanRegion ||
      !socketReadyForFrame ||
      encodingFrame ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return
    }

    const now = performance.now()

    if (
      now - lastFrameAttemptAt < config.minSendIntervalMs ||
      now - lastQualityCheckAt < config.qualityCheckIntervalMs
    ) {
      return
    }

    lastQualityCheckAt = now

    if (socket.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
      logTiming('send-buffer-busy', {bufferedBytes: socket.bufferedAmount})
      return
    }

    const quality = analyzeFrameQuality(
      cameraCanvas,
      scanRegion,
      config,
      analysisSurface,
      previousAnalysisGray
    )
    const captureStartedAt = performance.now()

    previousAnalysisGray = quality.gray || previousAnalysisGray

    if (quality.reason !== lastQualityReason && (config.debugCv || timing)) {
      const details = {
        accepted: quality.accepted,
        reason: quality.reason,
        brightness: Number(quality.brightness || 0).toFixed(1),
        sharpness: Number(quality.sharpness || 0).toFixed(1),
        motionScore: quality.motionScore == null
          ? null
          : Number(quality.motionScore).toFixed(1),
      }
      if (config.debugCv) console.log('[image-identification] browser CV:', details)
      if (!quality.accepted) logTiming('quality-rejected', details)
      lastQualityReason = quality.reason
    }

    if (!quality.accepted) {
      if (timing) {
        const {rejectedFrames} = timing
        rejectedFrames[quality.reason] = (rejectedFrames[quality.reason] || 0) + 1
      }
      return
    }

    // Bind the encode to this socket and scan so a late blob cannot use a new connection.
    const generation = scanGeneration
    const current = socket
    const isCurrent = () => generation === scanGeneration && socket === current
    const width = reducedFramesRemaining > 0 ? REDUCED_PROCESSING_WIDTH : config.processingWidth
    socketReadyForFrame = false
    encodingFrame = true
    lastFrameAttemptAt = now

    try {
      const {canvas} = processingSurface
      drawCaptureRegion(cameraCanvas, quality.crop, processingSurface, width)
      const jpegStartedAt = performance.now()
      const workerResult = workerJpeg
        ? await workerJpeg.encode(canvas, clamp(config.jpegQuality, 0.1, 1))
        : null
      if (!isCurrent() || current.readyState !== WebSocket.OPEN) return
      const blob = workerResult?.blob || await canvasToJpeg(canvas, config.jpegQuality)
      const jpegReadyAt = performance.now()
      if (!isCurrent() || current.readyState !== WebSocket.OPEN) return

      const bufferedBytes = current.bufferedAmount
      current.send(blob)
      const sentAt = performance.now()
      lastSentWidth = canvas.width

      if (config.debugCv) {
        console.log('[image-identification] frame sent', {
          bytes: blob.size, width: canvas.width, height: canvas.height,
        })
      }
      if (timing) {
        logTiming('frame-sent', {
          sendGapMs: elapsedMs(timing.lastSendAt, sentAt),
          readyToSendMs: elapsedMs(timing.readyAt, sentAt),
          qualityMs: elapsedMs(now, captureStartedAt),
          cropMs: elapsedMs(captureStartedAt, jpegStartedAt),
          jpegMs: elapsedMs(jpegStartedAt, jpegReadyAt),
          jpegEncoder: workerResult?.blob ? 'worker' : 'canvas',
          jpegSnapshotMs: workerResult?.snapshotMs,
          jpegWorkerMs: workerResult?.workerMs,
          jpegWorkerFallback: workerResult?.failure,
          bytes: blob.size,
          width: canvas.width,
          height: canvas.height,
          bufferedBytesBeforeSend: bufferedBytes,
          maxXrUpdateGapMs: Math.round(timing.maxXrUpdateGapMs),
          rejectedFrames: timing.rejectedFrames,
        })
        timing.lastSendAt = sentAt
        timing.pendingSendAt = sentAt
        timing.readyAt = null
        timing.maxXrUpdateGapMs = 0
        timing.rejectedFrames = {}
      }
      noteCaptureTime(canvas.width, jpegReadyAt - captureStartedAt)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[image-identification] Could not prepare/send frame:', error)
      // No frame reached the server, so allow a new browser frame.
      allowNextFrame()
    } finally {
      if (isCurrent()) encodingFrame = false
    }
  }

  return {
    name: 'image-identification',

    onStart: ({canvas}) => {
      cameraCanvas = canvas
      scanRegion = document.querySelector('#scanRegion')

      identificationStartedAt = performance.now()
      resetBrowserCv()
      logScanStart()

      console.log('[image-identification] Camera pipeline started.')
      window.addEventListener('imageidentificationpause', pauseIdentification)
      window.addEventListener('imageidentificationresume', resumeIdentification)

      if (!identificationSuspended) openImageSocket()
    },

    onUpdate: () => {
      if (identificationSuspended) return
      const now = performance.now()

      if (timing && !matchFound) {
        if (timing.lastUpdateAt !== null) {
          timing.maxXrUpdateGapMs = Math.max(timing.maxXrUpdateGapMs, now - timing.lastUpdateAt)
        }
        timing.lastUpdateAt = now
      }

      if (!matchFound && now - identificationStartedAt >= config.identificationTimeoutMs) {
        timeOutIdentification()
        return
      }

      if (imageRecognitionPaused || matchFound || timedOut) return

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        openImageSocket()
        return
      }

      if (socketReadyForFrame) {
        sendCurrentFrameIfReady()
      }
    },

    onDetach: () => {
      ++scanGeneration
      identificationSuspended = true
      window.removeEventListener('imageidentificationpause', pauseIdentification)
      window.removeEventListener('imageidentificationresume', resumeIdentification)

      cameraCanvas = null
      scanRegion = null
      matchFound = false
      imageRecognitionPaused = true

      closeImageSocket('DETACH')
      resetBrowserCv()
      debugPanel?.remove()
      debugPanel = null
    },
  }

  function pauseIdentification() {
    ++scanGeneration
    identificationSuspended = true
    imageRecognitionPaused = true
    socketReadyForFrame = false
    closeImageSocket('PAUSED')
  }

  function resumeIdentification() {
    ++scanGeneration
    identificationSuspended = false

    matchFound = false
    imageRecognitionPaused = false
    timedOut = false
    identificationStartedAt = performance.now()
    resetBrowserCv()
    logScanStart()
    openImageSocket()
  }
}

module.exports = {
  getCustomerCodeFromUrl,
  imageIdentificationPipelineModule,
  startCustomerCodeIdentification,
}
