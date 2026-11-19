const clamp = value => Math.max(0, Math.min(1, value))

// XR8 fills the canvas with a centered, cover-cropped camera image.
const getFocusPoint = (clientX, clientY, rect, videoWidth, videoHeight, mirrored = false) => {
  if (!rect.width || !rect.height || !videoWidth || !videoHeight) return null
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  const x = clamp((clientX - rect.left + (width - rect.width) / 2) / width)
  return {
    x: mirrored ? 1 - x : x,
    y: clamp((clientY - rect.top + (height - rect.height) / 2) / height),
  }
}

const cameraFocusPipelineModule = ({
  document: doc = document,
  mediaDevices = navigator.mediaDevices,
  debug = false,
} = {}) => {
  let canvas = null
  let video = null
  let videoWidth = 0
  let videoHeight = 0
  let session = null
  let paused = false
  let pointer = null
  let indicator = null
  let indicatorTimer = null
  let help = null
  let helpTimer = null
  let debugPanel = null

  const getSettings = track => {
    try { return track.getSettings?.() || {} } catch (error) { return {} }
  }

  const report = (current, result) => {
    if (!debug || session !== current) return
    const settings = getSettings(current.track)
    const details = {
      version: 'focus-v2',
      result,
      camera: current.track.label || 'Unnamed camera',
      focusModes: current.capabilities.focusMode || [],
      focusMode: settings.focusMode || 'not exposed',
      pointControlRecognized: current.supportsPoints,
      minimumFocusDistanceMeters: current.capabilities.focusDistance?.min ?? 'not exposed',
      resolution: [settings.width, settings.height],
    }
    if (!debugPanel) {
      debugPanel = doc.createElement('pre')
      debugPanel.className = 'cameraFocusDebug'
      doc.body.appendChild(debugPanel)
    }
    debugPanel.textContent = JSON.stringify(details, null, 2)
    console.info('[camera-focus]', details)
  }

  const hideHelp = () => {
    clearTimeout(helpTimer)
    help?.remove()
    help = null
  }

  const showDistanceHelp = (current) => {
    if (!isActive(current)) return
    hideHelp()
    help = doc.createElement('div')
    help.className = 'cameraFocusHelp'
    help.setAttribute('role', 'status')
    const minimum = current.capabilities.focusDistance?.min
    help.textContent = Number.isFinite(minimum) && minimum > 0
      ? `If blurry, keep the camera at least ${Math.ceil(minimum * 100)} cm away.`
      : 'If the image is blurry, move your phone farther away until it is sharp.'
    doc.body.appendChild(help)
    helpTimer = setTimeout(hideHelp, 3500)
  }

  const hideIndicator = () => {
    clearTimeout(indicatorTimer)
    indicator?.remove()
    indicator = null
  }

  const showIndicator = (x, y) => {
    hideIndicator()
    indicator = doc.createElement('div')
    indicator.className = 'cameraFocusIndicator'
    indicator.setAttribute('aria-hidden', 'true')
    indicator.style.left = `${x}px`
    indicator.style.top = `${y}px`
    doc.body.appendChild(indicator)
    // This marks a requested focus point, not confirmation of optical focus.
    indicatorTimer = setTimeout(hideIndicator, 1100)
  }

  const isActive = current => (
    session === current && !paused && current.track.readyState === 'live'
  )

  const requestFocus = (current, point, position) => {
    // Serialize requests so a slow startup/resume cannot overwrite a later tap.
    current.queue = current.queue.then(async () => {
      if (!isActive(current)) return
      const modes = current.capabilities.focusMode || []
      const focusMode = modes.includes('continuous') ? 'continuous'
        : modes.includes('single-shot') ? 'single-shot' : null
      if (!focusMode || !current.track.applyConstraints) {
        report(current, 'Focus controls are not exposed by this camera/browser; native autofocus only.')
        if (position) showDistanceHelp(current)
        return
      }

      const apply = async (includePoint) => {
        // Keep the engine's resolution, frame rate, and other constraints.
        const constraints = {...current.track.getConstraints?.()}
        const removeFocus = (values) => {
          const {focusMode: mode, focusDistance, pointsOfInterest, ...rest} = values
          return rest
        }
        const advanced = (constraints.advanced || []).map(removeFocus)
          .filter(values => Object.keys(values).length)
        await current.track.applyConstraints({
          ...removeFocus(constraints),
          advanced: [...advanced, {
            focusMode,
            ...(includePoint ? {pointsOfInterest: [point]} : {}),
          }],
        })
      }

      try {
        const includePoint = Boolean(point && current.supportsPoints)
        try {
          await apply(includePoint)
        } catch (error) {
          if (!includePoint || !isActive(current)) throw error
          current.supportsPoints = false
          await apply(false)
        }
        if (!isActive(current)) return
        report(current, 'Autofocus requested; optical focus cannot be confirmed by JavaScript.')
        if (!position) return
        if (!includePoint || !current.supportsPoints) {
          report(current, 'Tap focus is not available; autofocus requested without a focus point.')
          showDistanceHelp(current)
          return
        }
        // Unknown advanced constraints may be silently ignored by browsers.
        // Only mark a tapped location if the camera reports that point back.
        const points = getSettings(current.track).pointsOfInterest || []
        if (points.some(value => Math.abs(value.x - point.x) < 0.01 &&
          Math.abs(value.y - point.y) < 0.01)) {
          showIndicator(position.x, position.y)
          report(current, 'Focus point accepted; optical focus cannot be confirmed by JavaScript.')
        } else {
          report(current, 'Focus point was not confirmed by this camera/browser.')
          showDistanceHelp(current)
        }
      } catch (error) {
        if (isActive(current)) {
          console.debug('[camera-focus] Focus request unavailable:', error)
          report(current, 'Focus request failed.')
          if (position) showDistanceHelp(current)
        }
      }
    })
    return current.queue
  }

  const attachStream = (stream) => {
    const track = stream?.getVideoTracks?.()[0]
    if (session?.track === track) return
    session = null
    hideIndicator()
    hideHelp()
    if (!track) return
    try {
      let capabilities = {}
      // WebKit may expose a live camera without exposing focus controls.
      // Keep that track attached so unsupported taps can provide useful guidance.
      try { capabilities = track.getCapabilities?.() || {} } catch (error) { /* Use native autofocus. */ }
      session = {
        track,
        capabilities,
        // This flag means the browser recognizes points, not that every lens does.
        supportsPoints: Boolean(mediaDevices?.getSupportedConstraints?.().pointsOfInterest),
        queue: Promise.resolve(),
      }
      return requestFocus(session)
    } catch (error) {
      console.debug('[camera-focus] Camera controls unavailable:', error)
    }
  }

  const onPointerDown = (event) => {
    if (!session || paused || event.isPrimary === false || event.button !== 0 ||
      event.target?.closest?.('a, button, input, select, textarea, [role="button"], [contenteditable], #customLoader, .timeoutOverlay')) {
      pointer = null
      return
    }
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now()}
  }

  const onPointerUp = (event) => {
    const start = pointer
    pointer = null
    if (!start || event.pointerId !== start.id || !session || paused ||
      Date.now() - start.time > 600 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return
    const rect = canvas?.getBoundingClientRect()
    if (!rect || event.clientX < rect.left || event.clientX > rect.left + rect.width ||
      event.clientY < rect.top || event.clientY > rect.top + rect.height) return
    const settings = getSettings(session.track)
    const point = getFocusPoint(event.clientX, event.clientY, rect,
      video?.videoWidth || videoWidth, video?.videoHeight || videoHeight,
      settings.facingMode === 'user')
    if (point) return requestFocus(session, point, {x: event.clientX, y: event.clientY})
  }

  const cancelPointer = () => { pointer = null }
  const updateSize = (size) => {
    videoWidth = size.videoWidth
    videoHeight = size.videoHeight
  }
  const detach = () => {
    session = null
    pointer = null
    canvas = null
    video = null
    hideIndicator()
    hideHelp()
    debugPanel?.remove()
    debugPanel = null
    doc.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('pointerup', onPointerUp, true)
    doc.removeEventListener('pointercancel', cancelPointer, true)
  }

  return {
    name: 'camera-focus',
    onAttach: (data) => {
      detach()
      canvas = data.canvas
      video = data.video
      paused = false
      updateSize(data)
      doc.addEventListener('pointerdown', onPointerDown, {capture: true, passive: true})
      doc.addEventListener('pointerup', onPointerUp, {capture: true, passive: true})
      doc.addEventListener('pointercancel', cancelPointer, {capture: true, passive: true})
      return attachStream(data.stream || data.video?.srcObject)
    },
    onCameraStatusChange: ({status, stream, video: cameraVideo}) => {
      if (cameraVideo) video = cameraVideo
      if (status === 'requesting' || status === 'failed') {
        session = null
        pointer = null
        hideIndicator()
        hideHelp()
      }
      if (canvas && (stream || cameraVideo?.srcObject)) return attachStream(stream || cameraVideo.srcObject)
    },
    onVideoSizeChange: updateSize,
    onPaused: () => {
      paused = true
      pointer = null
      hideIndicator()
      hideHelp()
    },
    onResume: () => {
      paused = false
      if (session) return requestFocus(session)
    },
    onDetach: detach,
    onRemove: detach,
  }
}

module.exports = {cameraFocusPipelineModule, getFocusPoint}
