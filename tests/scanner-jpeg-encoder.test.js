const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const {createWorkerJpegEncoder} = require('../src/scanner-jpeg-encoder')

const flush = () => new Promise(resolve => setImmediate(resolve))
const jpeg = new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)], {type: 'image/jpeg'})

const createHarness = () => {
  let time = 100
  let timerId = 0
  const workers = []
  const snapshots = []
  const timers = new Map()
  const window = {
    Blob,
    OffscreenCanvas: class { convertToBlob() {} },
    Worker: class {
      constructor(url) {
        this.url = url
        this.messages = []
        this.terminated = false
        workers.push(this)
      }

      postMessage(data, transfer) { this.messages.push({data, transfer}) }
      terminate() { this.terminated = true }
      reply(data) { this.onmessage({data}) }
    },
    createImageBitmap(canvas) {
      return new Promise(resolve => snapshots.push({canvas, resolve}))
    },
    setTimeout(callback, delay) {
      timers.set(++timerId, {callback, delay})
      return timerId
    },
    clearTimeout(id) { timers.delete(id) },
  }
  const workerUrl = 'https://scanner.example/subpath/scanner-jpeg-worker.js'
  const encoder = createWorkerJpegEncoder({window, workerUrl, now: () => time})
  const advance = ms => { time += ms }
  return {encoder, workers, snapshots, timers, advance, workerUrl}
}

test('the JPEG worker receives transferable captures and is reused', async () => {
  const {encoder, workers, snapshots, timers, advance, workerUrl} = createHarness()
  const canvas = {width: 900, height: 900}
  for (const index of [0, 1]) {
    const result = encoder.encode(canvas, 0.72)
    assert.equal(workers.length, 1)
    const [worker] = workers
    assert.equal(worker.url, workerUrl)
    assert.equal(snapshots[index].canvas, canvas)
    const bitmap = {close() { assert.fail('The worker owns the posted bitmap') }}
    advance(17)
    snapshots[index].resolve(bitmap)
    await flush()
    const {data, transfer} = worker.messages[index]
    assert.equal(data.bitmap, bitmap)
    assert.equal(data.jpegQuality, 0.72)
    assert.deepEqual(transfer, [bitmap])
    worker.reply({id: data.id, blob: jpeg, workerMs: 24})
    assert.deepEqual(await result, {blob: jpeg, snapshotMs: 17, workerMs: 24})
    assert.equal(timers.size, 0)
  }
  encoder.cancel()
  assert.equal(workers[0].terminated, true)
})

test('a worker job times out while taking the snapshot and releases a late bitmap', async () => {
  const {encoder, workers, snapshots, timers} = createHarness()
  const result = encoder.encode({}, 0.72)
  const [timeout] = timers.values()
  assert.equal(timeout.delay, 2000)
  timeout.callback()
  assert.deepEqual(await result, {blob: null, failure: 'worker-timeout'})
  assert.equal(workers[0].terminated, true)
  let closed = false
  snapshots[0].resolve({close() { closed = true }})
  await flush()
  assert.equal(closed, true)
  assert.equal(workers[0].messages.length, 0)
  assert.deepEqual(await encoder.encode({}, 0.72), {blob: null, failure: 'worker-disabled'})
})

test('cancelling an encode discards its reply while the next scan can start a worker', async () => {
  const {encoder, workers, snapshots} = createHarness()
  const first = encoder.encode({}, 0.72)
  snapshots[0].resolve({close() {}})
  await flush()
  encoder.cancel()
  assert.deepEqual(await first, {blob: null, failure: 'worker-cancelled'})
  assert.equal(workers[0].terminated, true)

  const second = encoder.encode({}, 0.72)
  snapshots[1].resolve({close() {}})
  await flush()
  const id = workers[1].messages[0].data.id
  workers[0].reply({id, blob: jpeg, workerMs: 99})
  workers[1].reply({id, blob: jpeg, workerMs: 24})
  assert.equal((await second).workerMs, 24)
})

test('a non-JPEG worker response requests native fallback', async () => {
  const {encoder, workers, snapshots} = createHarness()
  const result = encoder.encode({}, 0.72)
  snapshots[0].resolve({close() {}})
  await flush()
  const [worker] = workers
  worker.reply({id: worker.messages[0].data.id, blob: new Blob(['bad'], {type: 'image/png'})})
  assert.deepEqual(await result, {blob: null, failure: 'worker-invalid-jpeg'})
  assert.equal(worker.terminated, true)
})

test('the worker closes the bitmap before encoding it to the requested JPEG quality', async () => {
  const images = []
  const options = []
  const replies = []
  const self = {postMessage: reply => replies.push(reply)}
  let bitmapClosed = false
  const bitmap = {width: 900, height: 850, close() { bitmapClosed = true }}
  const OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width
      this.height = height
      images.push(this)
    }
    getContext() { return {drawImage: image => assert.equal(image, bitmap)} }
    async convertToBlob(settings) {
      assert.equal(bitmapClosed, true)
      options.push(settings)
      return jpeg
    }
  }

  vm.runInNewContext(fs.readFileSync(require.resolve('../src/scanner-jpeg-worker'), 'utf8'), {
    self, performance, OffscreenCanvas,
  })
  await self.onmessage({data: {id: 1, bitmap, jpegQuality: 0.72}})
  assert.equal(images[0].width, 900)
  assert.equal(images[0].height, 850)
  assert.equal(options[0].type, 'image/jpeg')
  assert.equal(options[0].quality, 0.72)
  assert.equal(replies[0].id, 1)
  assert.equal(replies[0].blob, jpeg)
})
