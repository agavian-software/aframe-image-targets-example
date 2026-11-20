const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const match = {videoUrlV1: [{targetName: 'gift', videoUrl: 'gift.mp4'}]}

const createScanner = ({formats} = {}) => {
  let now = 1000
  const listeners = new Map()
  const events = []
  const sockets = []
  const detections = []
  const requests = []
  const encodings = []
  const timers = new Map()
  const logs = []
  let nextTimer = 0
  const window = {
    location: {search: '', href: 'https://scanner.example/'},
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
      static getSupportedFormats() { return formats || Promise.resolve(['qr_code']) }
      detect() {
        const result = deferred()
        detections.push(result)
        return result.promise
      }
    },
  }
  class WebSocket {
    static OPEN = 1
    static CONNECTING = 0
    static CLOSED = 3
    constructor() { this.readyState = 1; this.sent = []; this.bufferedAmount = 0; sockets.push(this) }
    close() { this.readyState = 3 }
    send(blob) { this.sent.push(blob) }
    message(body) { this.onmessage({data: JSON.stringify(body)}) }
  }
  class CustomEvent extends Event {
    constructor(name, options) { super(name); this.detail = options.detail }
  }
  const rect = {left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100}
  const cameraCanvas = {width: 100, height: 100, getBoundingClientRect: () => rect}
  const document = {
    querySelector: selector => selector === '#scanRegion' ? {getBoundingClientRect: () => rect} : null,
    createElement() {
      const canvas = {width: 0, height: 0, toBlob: callback => encodings.push(callback)}
      canvas.getContext = () => ({
        drawImage() {},
        getImageData() {
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
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/image-identification-pipeline'), 'utf8'), {
    module, window, document, URL, URLSearchParams, WebSocket, Event, CustomEvent, AbortController,
    Uint8Array, performance: {now: () => now}, console: {
      log() {}, warn() {}, error(...args) { logs.push(args.map(String).join(' ')) },
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
  const advance = ms => { now += ms; scanner.onUpdate() }
  const reply = request => request.resolve({ok: true,
    headers: {get: () => 'application/json'}, json: async () => match})
  return {scanner, events, sockets, detections, requests, encodings, pause, resume, advance, reply, logs}
}

test('playback pause closes the scanner socket and drops a QR result already being detected', async () => {
  const app = createScanner()
  app.scanner.onUpdate()
  await flush()
  assert.equal(app.detections.length, 1)
  app.pause()
  assert.equal(app.sockets[0].readyState, 3)
  app.detections[0].resolve([{rawValue: 'https://gift.example/?code=old'}])
  await flush()
  app.advance(60000)
  await flush()
  assert.equal(app.requests.length, 0)
  assert.equal(app.detections.length, 1)
  assert.equal(app.sockets.length, 1)
  assert.equal(app.events.some(event => ['qrdetected', 'imageidentified', 'imageidentificationtimeout'].includes(event.type)), false)
  app.resume()
  app.scanner.onUpdate()
  await flush()
  assert.equal(app.sockets.length, 2)
  assert.equal(app.detections.length, 2)
})

test('QR detector initialization cannot start scanning after playback has paused it', async () => {
  const formats = deferred()
  const app = createScanner({formats: formats.promise})
  app.scanner.onUpdate()
  await flush()
  app.pause()
  formats.resolve(['qr_code'])
  await flush()
  assert.equal(app.detections.length, 0)
})

test('playback aborts a QR API request and ignores a late response even after scanning resumes', async () => {
  const app = createScanner()
  app.scanner.onUpdate()
  await flush()
  app.detections[0].resolve([{rawValue: 'https://gift.example/?code=old'}])
  await flush()
  assert.equal(app.requests.length, 1)
  app.pause()
  assert.equal(app.requests[0].options.signal.aborted, true)
  app.resume()
  app.scanner.onUpdate()
  await flush()
  app.detections[1].resolve([{rawValue: 'https://gift.example/?code=new'}])
  await flush()
  assert.equal(app.requests.length, 2)
  app.reply(app.requests[0])
  await flush()
  assert.equal(app.events.filter(event => event.type === 'imageidentified').length, 0)
  app.reply(app.requests[1])
  await flush()
  assert.equal(app.events.filter(event => event.type === 'imageidentified').length, 1)
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

test('WebSocket MATCHED dispatches effect flags, type, and message from data.videoUrlV1 unchanged', () => {
  const app = createScanner()
  const entry = {targetName: 'gift', videoUrl: 'gift.mp4', enableConfetti: false,
    enableBanner: true, bannerMessage: 'Happy Birthday!\nMia', bannerType: 0}
  app.sockets[0].message({status: 'MATCHED', data: {videoUrlV1: [entry]}})
  const identified = app.events.find(event => event.type === 'imageidentified')
  assert.ok(identified)
  assert.deepEqual(JSON.parse(JSON.stringify(identified.detail.videoUrlV1[0])), entry)
})
