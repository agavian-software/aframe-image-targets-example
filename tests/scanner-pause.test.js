const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {createRequire} = require('node:module')

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const match = {videoUrlV1: [{targetName: 'gift', videoUrl: 'gift.mp4'}]}

const createScanner = ({search = '', workerJpeg} = {}) => {
  let now = 1000
  const listeners = new Map()
  const events = []
  const sockets = []
  const barcodeCalls = []
  const requests = []
  const encodings = []
  const encodedWidths = []
  const canvasStats = []
  const timers = new Map()
  const logs = []
  const debugLogs = []
  let nextTimer = 0
  const window = {
    location: {search, href: 'https://scanner.example/'},
    IMAGE_IDENTIFICATION_CONFIG: {},
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(listener)
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener) },
    dispatchEvent(event) {
      events.push(event)
      listeners.get(event.type)?.forEach(listener => listener(event))
    },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer },
    clearTimeout(id) { timers.delete(id) },
    BarcodeDetector: class {
      static getSupportedFormats() {
        barcodeCalls.push('getSupportedFormats')
        return Promise.resolve(['qr_code'])
      }
      constructor() { barcodeCalls.push('constructor') }
      detect() {
        barcodeCalls.push('detect')
        return Promise.resolve([])
      }
    },
  }
  class WebSocket {
    static OPEN = 1
    static CONNECTING = 0
    static CLOSED = 3
    constructor() { this.readyState = 1; this.sent = []; this.bufferedAmount = 0; sockets.push(this) }
    close() { this.readyState = 3 }
    disconnect() {
      this.close()
      this.onclose({code: 1006, reason: '', wasClean: false})
    }
    send(blob) { this.sent.push(blob) }
    message(body) { this.onmessage({data: JSON.stringify(body)}) }
  }
  class CustomEvent extends Event {
    constructor(name, options) { super(name); this.detail = options.detail }
  }
  const rect = {left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100}
  const cameraCanvas = {width: 100, height: 100, getBoundingClientRect: () => rect}
  const createDomElement = tagName => ({
    tagName,
    children: [],
    textContent: '',
    append(...children) {
      for (const child of children) {
        this.children.push(child)
        child.parentNode = this
      }
    },
    appendChild(child) {
      this.append(child)
      return child
    },
    remove() {
      if (!this.parentNode) return
      const siblings = this.parentNode.children
      siblings.splice(siblings.indexOf(this), 1)
      this.parentNode = null
    },
    setAttribute(name, value) { this[name] = value },
  })
  const body = createDomElement('body')
  const document = {
    body,
    querySelector: selector => selector === '#scanRegion' ? {getBoundingClientRect: () => rect} : null,
    createElement(tagName) {
      if (tagName !== 'canvas') return createDomElement(tagName)
      const stats = {width: 0, height: 0, dimensionWrites: 0, pixelReads: 0}
      canvasStats.push(stats)
      const canvas = {
        get width() { return stats.width },
        set width(value) { stats.width = value; stats.dimensionWrites++ },
        get height() { return stats.height },
        set height(value) { stats.height = value; stats.dimensionWrites++ },
        toBlob(callback) {
          encodedWidths.push(canvas.width)
          encodings.push(callback)
        },
      }
      canvas.getContext = () => ({
        drawImage() {},
        getImageData() {
          stats.pixelReads++
          const {width, height} = canvas
          const data = new Uint8ClampedArray(width * height * 4)
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const index = (y * width + x) * 4
              data.fill(35 + ((x * 17 + y * 31) % 181), index, index + 3)
              data[index + 3] = 255
            }
          }
          return {width, height, data}
        },
      })
      return canvas
    },
  }
  const module = {exports: {}}
  const scannerPath = require.resolve('../src/image-identification-pipeline')
  vm.runInNewContext(fs.readFileSync(scannerPath, 'utf8'), {
    require: workerJpeg ? () => ({createWorkerJpegEncoder: () => workerJpeg}) : createRequire(scannerPath),
    module, window, document, URL, URLSearchParams, WebSocket, Event, CustomEvent, AbortController,
    BarcodeDetector: window.BarcodeDetector,
    Uint8Array, performance: {now: () => now}, console: {
      log(...args) { debugLogs.push(args) }, warn() {}, error(...args) { logs.push(args.map(String).join(' ')) },
    },
    fetch(url, options) {
      const result = deferred()
      requests.push({url, options, ...result})
      return result.promise
    },
  })
  const scanner = module.exports.imageIdentificationPipelineModule()
  scanner.onStart({canvas: cameraCanvas})
  const pause = () => window.dispatchEvent(new Event('imageidentificationpause'))
  const resume = () => window.dispatchEvent(new Event('imageidentificationresume'))
  const advanceClock = ms => { now += ms }
  const advance = ms => { advanceClock(ms); scanner.onUpdate() }
  const runTimers = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id)
      callback()
    }
  }
  const reply = request => request.resolve({ok: true,
    headers: {get: () => 'application/json'}, json: async () => match})
  return {
    scanner, events, sockets, barcodeCalls, requests, encodings, encodedWidths,
    canvasStats, body, pause, resume, advance, advanceClock, runTimers, reply, logs, debugLogs,
  }
}

test('image scanning and resume use the socket without starting camera barcode detection', async () => {
  const app = createScanner()
  app.scanner.onUpdate()
  app.advance(1200)
  await flush()
  assert.deepEqual(app.barcodeCalls, [])
  app.pause()
  assert.equal(app.sockets[0].readyState, 3)
  app.advance(60000)
  await flush()
  assert.equal(app.sockets.length, 1)
  assert.equal(app.events.some(event => event.type === 'imageidentificationtimeout'), false)
  app.resume()
  app.advance(1200)
  await flush()
  assert.equal(app.sockets.length, 2)
  assert.equal(app.requests.length, 0)
  assert.deepEqual(app.barcodeCalls, [])
})

test('a direct customer code link uses HTTP and dispatches the match without camera barcode detection', async () => {
  const app = createScanner({search: '?code=gift%2B2026'})
  assert.equal(app.requests.length, 1)
  const [request] = app.requests
  assert.equal(request.options.method, 'GET')
  assert.equal(new URL(request.url).searchParams.get('customerCode'), 'gift+2026')
  app.advance(1200)
  app.reply(request)
  await flush()
  assert.equal(app.events.find(event => event.type === 'imageidentified')?.detail, match)
  assert.equal(app.sockets.length, 0)
  assert.deepEqual(app.barcodeCalls, [])
})

test('pause aborts a direct customer code lookup and ignores its late response', async () => {
  const app = createScanner({search: '?code=gift'})
  assert.equal(app.requests.length, 1)
  const [request] = app.requests
  app.pause()
  assert.equal(request.options.signal.aborted, true)
  app.resume()
  app.scanner.onUpdate()
  app.reply(request)
  await flush()
  assert.equal(app.events.some(event => event.type === 'imageidentified'), false)
  assert.equal(app.sockets.length, 0)
})

test('an encoded camera frame from before playback cannot be sent into a resumed scan', async () => {
  const app = createScanner()
  app.sockets[0].message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(200)
  await flush()
  assert.equal(app.encodings.length, 1, app.logs.join('\n'))
  app.pause()
  app.resume()
  app.sockets[1].message({status: 'READY'})
  app.encodings[0]({size: 100})
  await flush()
  assert.equal(app.sockets[0].sent.length, 0)
  assert.equal(app.sockets[1].sent.length, 0)
  app.scanner.onUpdate()
  app.advance(200)
  await flush()
  assert.equal(app.encodings.length, 2)
  app.encodings[1]({size: 200})
  await flush()
  assert.equal(app.sockets[1].sent.length, 1)
})

test('the scanner skips quality checks during send cooldown and reuses same-sized canvases', async () => {
  const app = createScanner()
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  assert.equal(app.encodings.length, 1)
  const analysis = app.canvasStats.find(stats => stats.pixelReads > 0)
  assert.equal(analysis.pixelReads, 2)
  const dimensionWrites = app.canvasStats.map(stats => stats.dimensionWrites)

  app.encodings[0]({size: 100})
  await flush()
  socket.message({status: 'READY'})
  app.advance(140)
  assert.equal(analysis.pixelReads, 2)
  assert.equal(app.encodings.length, 1)

  app.advance(110)
  assert.equal(analysis.pixelReads, 3)
  assert.equal(app.encodings.length, 2)
  assert.deepEqual(app.canvasStats.map(stats => stats.dimensionWrites), dimensionWrites)
})

test('a duplicate READY during encoding cannot release the next frame', async () => {
  const app = createScanner()
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  assert.equal(app.encodings.length, 1)

  socket.message({status: 'READY'})
  app.advance(250)
  assert.equal(app.encodings.length, 1)
  app.encodings[0]({size: 100})
  await flush()
  assert.equal(socket.sent.length, 1)

  app.advance(250)
  assert.equal(app.encodings.length, 1)
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  assert.equal(app.encodings.length, 2)
})

test('a disconnected socket cannot send its unfinished frame through its replacement', async () => {
  const app = createScanner()
  const [oldSocket] = app.sockets
  oldSocket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  assert.equal(app.encodings.length, 1)

  oldSocket.disconnect()
  app.advance(750)
  app.runTimers()
  assert.equal(app.sockets.length, 2)
  const replacement = app.sockets[1]
  replacement.message({status: 'READY'})
  app.scanner.onUpdate()
  assert.equal(app.encodings.length, 2)

  app.encodings[0]({size: 100})
  await flush()
  assert.equal(oldSocket.sent.length, 0)
  assert.equal(replacement.sent.length, 0)
  replacement.message({status: 'READY'})
  app.advance(250)
  assert.equal(app.encodings.length, 2)

  app.encodings[1]({size: 200})
  await flush()
  assert.equal(replacement.sent.length, 1)
  assert.equal(replacement.sent[0].size, 200)
})

test('scanner debug reports local encoding and server turnaround independently with a width override', async () => {
  const app = createScanner({search: '?scannerDebug=1&scanWidth=720'})
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  assert.deepEqual(app.encodedWidths, [720])

  app.advanceClock(135)
  app.encodings[0]({size: 100})
  await flush()
  app.advanceClock(330)
  socket.message({status: 'READY', lastProcessingMs: 300})

  const timings = app.debugLogs
    .filter(([label]) => label === '[image-identification] timing')
    .map(([, details]) => details)
  const sent = timings.find(entry => entry.event === 'frame-sent')
  assert.equal(sent.width, 720)
  assert.equal(sent.jpegMs, 135)
  assert.equal(sent.bytes, 100)
  const ready = timings.find(entry => entry.event === 'ready' && entry.sendToReadyMs != null)
  assert.equal(ready.sendToReadyMs, 330)
  assert.equal(ready.serverProcessingMs, 300)
  const log = app.body.children[0].children.find(child => child.tagName === 'pre')
  assert.match(log.textContent, /frame-sent/)
  assert.match(log.textContent, /jpegMs=135/)
  assert.match(log.textContent, /sendToReadyMs=330/)
  assert.match(log.textContent, /serverProcessingMs=300/)
})

test('worker JPEG output uses the socket and a worker failure falls back to canvas', async () => {
  const jobs = []
  const app = createScanner({
    search: '?scannerDebug=1&scanWidth=900',
    workerJpeg: {
      encode(canvas, quality) {
        const result = deferred()
        jobs.push({result, width: canvas.width, quality})
        return result.promise
      },
      cancel() {},
    },
  })
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  assert.equal(jobs[0].width, 900)
  assert.equal(jobs[0].quality, 0.72)
  assert.equal(app.encodings.length, 0)
  assert.equal(socket.sent.length, 0)

  const blob = new Blob(['worker jpeg'], {type: 'image/jpeg'})
  jobs[0].result.resolve({blob, snapshotMs: 4, workerMs: 19})
  await flush()
  assert.deepEqual(socket.sent, [blob])

  socket.message({status: 'READY'})
  app.advance(250)
  jobs[1].result.resolve({blob: null, failure: 'worker-error'})
  await flush()
  assert.equal(app.encodings.length, 1)
  app.encodings[0]({size: 100})
  await flush()

  assert.equal(socket.sent.length, 2)
  const log = app.body.children[0].children.find(child => child.tagName === 'pre')
  assert.match(log.textContent, /jpegEncoder=worker.*jpegSnapshotMs=4.*jpegWorkerMs=19/)
  assert.match(log.textContent, /jpegEncoder=canvas.*jpegWorkerFallback=worker-error/)
})

test('a worker result after pause cannot fall back to canvas or send to a later scan', async () => {
  const job = deferred()
  let cancelled = false
  const app = createScanner({
    workerJpeg: {
      encode: () => job.promise,
      cancel() { cancelled = true },
    },
  })
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()
  app.advance(140)
  app.pause()
  assert.equal(cancelled, true)
  app.resume()

  job.resolve({blob: null, failure: 'cancelled'})
  await flush()
  assert.equal(app.encodings.length, 0)
  assert.equal(socket.sent.length, 0)
  assert.equal(app.sockets[1].sent.length, 0)
})

test('the timing panel is opt-in and keeps the 20 newest events visible after a match', () => {
  assert.equal(createScanner().body.children.length, 0)
  assert.equal(createScanner({search: '?scannerDebug=0'}).body.children.length, 0)

  const app = createScanner({search: '?scannerDebug'})
  const [panel] = app.body.children
  assert.equal(panel.tagName, 'details')
  assert.equal(panel.className, 'scannerDebug')
  assert.equal(panel.open, true)
  const [summary, log] = panel.children
  assert.equal(summary.textContent, 'Scanner timing')
  assert.equal(log.tagName, 'pre')
  assert.match(log.textContent, /scan-start/)

  const [socket] = app.sockets
  for (let lastProcessingMs = 2000; lastProcessingMs < 2024; lastProcessingMs++) {
    socket.message({status: 'READY', lastProcessingMs})
  }
  const displayedTimes = Array.from(log.textContent.matchAll(/serverProcessingMs=(\d+)/g),
    ([, value]) => Number(value))
  assert.deepEqual(displayedTimes, Array.from({length: 20}, (_, index) => 2023 - index))
  assert.doesNotMatch(log.textContent, /scan-start/)

  socket.message({status: 'MATCHED', data: match})
  assert.equal(app.body.children[0], panel)
  assert.match(log.textContent, /matched/)
  app.scanner.onDetach()
  assert.equal(app.body.children.length, 0)
})

test('only sustained slow local capture temporarily lowers the automatic JPEG width', async () => {
  const app = createScanner()
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()

  const jpegTimes = [150, 10, 150, 150, 10, 10, 10, 10]
  for (const [index, jpegMs] of jpegTimes.entries()) {
    app.advance(250)
    assert.equal(app.encodings.length, index + 1)
    app.advanceClock(jpegMs)
    app.encodings[index]({size: 100})
    await flush()
    app.advanceClock(350)
    socket.message({status: 'READY', lastProcessingMs: 300})
  }

  assert.deepEqual(app.encodedWidths, [900, 900, 900, 900, 720, 720, 720, 900])
})

test('full-width capture continues when the backend is confirming a match', async () => {
  const app = createScanner()
  const [socket] = app.sockets
  socket.message({status: 'READY'})
  app.scanner.onUpdate()

  for (const currentConfirmations of [0, 1, 2]) {
    app.advance(250)
    app.advanceClock(130)
    app.encodings[currentConfirmations]({size: 100})
    await flush()
    socket.message({status: 'READY', currentConfirmations})
  }

  app.advance(250)
  assert.deepEqual(app.encodedWidths, [900, 900, 900, 900])
})

test('WebSocket MATCHED dispatches effect flags, type, and message from data.videoUrlV1 unchanged', () => {
  const app = createScanner()
  const entry = {targetName: 'gift', videoUrl: 'gift.mp4', enableConfetti: false,
    enableBanner: true, bannerMessage: 'Happy Birthday!\nMia', bannerType: 0}
  app.sockets[0].message({status: 'MATCHED', data: {videoUrlV1: [entry]}})
  const identified = app.events.find(event => event.type === 'imageidentified')
  assert.ok(identified)
  assert.deepEqual(JSON.parse(JSON.stringify(identified.detail.videoUrlV1[0])), entry)
})
