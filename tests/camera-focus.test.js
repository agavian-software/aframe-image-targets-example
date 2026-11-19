const {test} = require('node:test')
const assert = require('node:assert/strict')
const {cameraFocusPipelineModule, getFocusPoint} = require('../src/camera-focus')

const createCamera = (options = {}) => {
  const listeners = new Map()
  const elements = new Set()
  const doc = {
    addEventListener(name, handler) { listeners.set(name, handler) },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) listeners.delete(name)
    },
    createElement() {
      const element = {style: {}, setAttribute() {}, remove() { elements.delete(element) }}
      return element
    },
    body: {appendChild(element) { elements.add(element) }},
  }
  const requests = []
  const settings = {facingMode: 'environment', pointsOfInterest: []}
  const constraints = {
    width: {ideal: 1280}, frameRate: {ideal: 30},
    advanced: [{zoom: 1}, {focusMode: 'manual', focusDistance: 0}],
  }
  const track = {
    readyState: 'live',
    getCapabilities: () => ({focusMode: ['manual', 'continuous', 'single-shot']}),
    getConstraints: () => constraints,
    getSettings: () => settings,
    async applyConstraints(values) {
      requests.push(values)
      if (options.apply) await options.apply(values)
      const focus = values.advanced.at(-1)
      settings.focusMode = focus.focusMode
      if (focus.pointsOfInterest && !options.ignorePoint) settings.pointsOfInterest = focus.pointsOfInterest
    },
    ...options.track,
  }
  const module = cameraFocusPipelineModule({
    document: doc,
    mediaDevices: {getSupportedConstraints: () => ({pointsOfInterest: options.points !== false})},
    debug: options.debug || false,
  })
  const attach = () => module.onAttach({
    canvas: {getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 800})},
    stream: {getVideoTracks: () => [track]},
    videoWidth: 600, videoHeight: 800,
  })
  const event = (extra = {}) => ({
    pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 400,
    target: {closest: () => null}, ...extra,
  })
  const emit = (name, extra) => listeners.get(name)?.(event(extra))
  const tap = async (extra) => {
    emit('pointerdown', extra)
    await emit('pointerup', extra)
  }
  return {
    module, attach, requests, settings, constraints, track, elements, listeners, tap, emit,
    get indicators() { return new Set([...elements].filter(element => element.className === 'cameraFocusIndicator')) },
    get help() { return [...elements].find(element => element.className === 'cameraFocusHelp') },
    get debugPanel() { return [...elements].find(element => element.className === 'cameraFocusDebug') },
  }
}

test('focus points account for preview crop, offsets, rotation dimensions, and mirroring', () => {
  const rect = {left: 10, top: 20, width: 400, height: 800}
  const point = getFocusPoint(10, 420, rect, 600, 800)
  assert.ok(Math.abs(point.x - 1 / 6) < 1e-10)
  assert.equal(point.y, 0.5)
  assert.ok(Math.abs(getFocusPoint(10, 420, rect, 600, 800, true).x - 5 / 6) < 1e-10)
  assert.deepEqual(getFocusPoint(210, 420, rect, 800, 600), {x: 0.5, y: 0.5})
  assert.equal(getFocusPoint(10, 20, rect, 0, 0), null)
})

test('startup enables continuous focus and preserves the engine camera constraints', async () => {
  const camera = createCamera()
  await camera.attach()
  assert.deepEqual(camera.requests, [{
    width: {ideal: 1280}, frameRate: {ideal: 30},
    advanced: [{zoom: 1}, {focusMode: 'continuous'}],
  }])
  assert.equal(camera.constraints.advanced[1].focusMode, 'manual')
  camera.module.onDetach()
})

test('tap requests the cropped camera location and displays a neutral marker', async () => {
  const camera = createCamera()
  await camera.attach()
  await camera.tap()
  const focus = camera.requests.at(-1).advanced.at(-1)
  assert.equal(focus.focusMode, 'continuous')
  assert.ok(Math.abs(focus.pointsOfInterest[0].x - 1 / 6) < 1e-10)
  assert.equal(focus.pointsOfInterest[0].y, 0.5)
  assert.equal(camera.indicators.size, 1)
  camera.module.onDetach()
  assert.equal(camera.indicators.size, 0)
  assert.equal(camera.listeners.size, 0)
})

test('unsupported and silently ignored point controls do not display a false focus point', async () => {
  for (const options of [{points: false}, {ignorePoint: true}]) {
    const camera = createCamera(options)
    await camera.attach()
    await camera.tap()
    assert.equal(camera.indicators.size, 0)
    assert.equal(camera.settings.focusMode, 'continuous')
    camera.module.onDetach()
  }
})

test('rejected point constraints fall back to autofocus without breaking the camera', async () => {
  const camera = createCamera({apply: async (values) => {
    if (values.advanced.at(-1).pointsOfInterest) throw new Error('Unsupported point')
  }})
  await camera.attach()
  await camera.tap()
  assert.equal(camera.requests.length, 3)
  assert.deepEqual(camera.requests.at(-1).advanced.at(-1), {focusMode: 'continuous'})
  assert.equal(camera.indicators.size, 0)
  camera.module.onDetach()
})

test('fixed-focus cameras and browsers without camera controls continue normally', async () => {
  for (const track of [{getCapabilities: undefined}, {getCapabilities: () => ({focusMode: ['manual']})}]) {
    const camera = createCamera({track})
    await camera.attach()
    await camera.tap()
    assert.equal(camera.requests.length, 0)
    camera.module.onDetach()
  }
})

test('buttons, drags, multitouch, canceled gestures and out-of-preview taps do not focus', async () => {
  const camera = createCamera()
  await camera.attach()
  await camera.tap({target: {closest: () => ({tagName: 'BUTTON'})}})
  camera.emit('pointerdown')
  await camera.emit('pointerup', {clientX: 40})
  camera.emit('pointerdown')
  camera.emit('pointerdown', {pointerId: 2, isPrimary: false})
  await camera.emit('pointerup')
  camera.emit('pointerdown')
  camera.emit('pointercancel')
  await camera.emit('pointerup')
  await camera.tap({clientX: -1})
  assert.equal(camera.requests.length, 1)
  camera.module.onDetach()
})

test('pause disables taps and resume reapplies autofocus', async () => {
  const camera = createCamera()
  await camera.attach()
  camera.module.onPaused()
  await camera.tap()
  assert.equal(camera.requests.length, 1)
  await camera.module.onResume()
  assert.equal(camera.requests.length, 2)
  camera.module.onDetach()
})

test('detach discards queued taps while a previous camera request is pending', async () => {
  let release
  const camera = createCamera({apply: () => new Promise(resolve => { release = resolve })})
  const startup = camera.attach()
  await Promise.resolve()
  const pendingTap = camera.tap()
  camera.module.onDetach()
  release()
  await startup
  await pendingTap
  assert.equal(camera.requests.length, 1)
  assert.equal(camera.indicators.size, 0)
})

test('camera replacement configures the new stream and removes the old focus marker', async () => {
  const camera = createCamera()
  await camera.attach()
  await camera.tap()
  let requests = 0
  const replacement = {
    readyState: 'live', getCapabilities: () => ({focusMode: ['continuous']}),
    applyConstraints: async () => { requests += 1 },
  }
  await camera.module.onCameraStatusChange({status: 'hasStream', stream: {getVideoTracks: () => [replacement]}})
  assert.equal(requests, 1)
  assert.equal(camera.indicators.size, 0)
  camera.module.onRemove()
})

test('WebKit-style capabilities explain unsupported taps without claiming to focus', async () => {
  const camera = createCamera({debug: true, track: {
    getCapabilities: () => ({width: {min: 320, max: 1920}, zoom: {min: 1, max: 5}}),
  }})
  await camera.attach()
  assert.equal(camera.help, undefined)
  assert.equal(camera.requests.length, 0)
  const diagnostics = JSON.parse(camera.debugPanel.textContent)
  assert.equal(diagnostics.version, 'focus-v2')
  assert.deepEqual(diagnostics.focusModes, [])
  assert.match(diagnostics.result, /not exposed/)
  await camera.tap()
  assert.match(camera.help.textContent, /move your phone farther away/)
  assert.equal(camera.requests.length, 0)
  assert.equal(camera.indicators.size, 0)
  camera.module.onDetach()
  assert.equal(camera.elements.size, 0)
})

test('minimum focus distance is used for guidance without trying to manually set it', async () => {
  const camera = createCamera({track: {
    getCapabilities: () => ({focusDistance: {min: 0.2, max: 100}}),
  }})
  await camera.attach()
  await camera.tap()
  assert.match(camera.help.textContent, /at least 20 cm/)
  assert.equal(camera.requests.length, 0)
  camera.module.onPaused()
  assert.equal(camera.help, undefined)
  camera.module.onDetach()
})

test('diagnostic overlay is opt-in and unconfirmed point requests give guidance', async () => {
  const camera = createCamera({ignorePoint: true})
  await camera.attach()
  await camera.tap()
  assert.equal(camera.debugPanel, undefined)
  assert.ok(camera.help)
  assert.equal(camera.indicators.size, 0)
  camera.module.onDetach()
})
