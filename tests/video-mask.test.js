const {test} = require('node:test')
const assert = require('node:assert/strict')
const {getVideoMaskConfig, getVideoSurfaceSize, prepareVideoMask} = require('../src/video-mask')

const imageSources = new Map()
let imageLoads = 0
global.window = {setTimeout, clearTimeout}
global.Image = class {
  set src(url) {
    imageLoads += 1
    const source = imageSources.get(url)
    queueMicrotask(() => {
      if (!source) {
        this.onerror?.()
        return
      }
      this.naturalWidth = source.length / 4
      this.naturalHeight = 1
      this.pixels = source
      this.onload?.()
    })
  }
}
global.document = {
  createElement() {
    const canvas = {commands: []}
    const ctx = {
      drawImage(image) { canvas.pixels = Uint8ClampedArray.from(image.pixels) },
      getImageData() { return {data: canvas.pixels} },
      putImageData(pixels) { canvas.pixels = pixels.data },
    }
    for (const name of ['fillRect', 'translate', 'scale', 'beginPath', 'arc',
      'moveTo', 'bezierCurveTo', 'closePath', 'fill']) {
      ctx[name] = (...args) => canvas.commands.push([name, ...args])
    }
    canvas.getContext = () => ctx
    return canvas
  },
}

test('custom upload URL overrides built-in shape and resolves CDN paths', () => {
  assert.deepEqual(getVideoMaskConfig({shape: 'heart', maskUrl: '/mask.png'},
    url => `https://cdn.example${url}`), {
    maskUrl: 'https://cdn.example/mask.png', maskMode: 'auto', shape: 'heart',
  })
  assert.equal(getVideoMaskConfig({shape: 1}).shape, 'circle')
  assert.equal(getVideoMaskConfig({frameShape: 'heart'}).shape, 'heart')
  assert.equal(getVideoMaskConfig({shape: {customShapeUrl: 'custom.png'}}).maskUrl, 'custom.png')
})

test('transparent colored image uses its outline, independent of image colors', async () => {
  imageSources.set('transparent.png', [0, 0, 0, 255, 255, 0, 0, 0, 0, 255, 0, 128])
  const config = getVideoMaskConfig({maskUrl: 'transparent.png'})
  const canvas = await prepareVideoMask(config)
  assert.deepEqual([...canvas.pixels], [255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255])
  const previousLoads = imageLoads
  assert.equal(await prepareVideoMask(config), canvas)
  assert.equal(imageLoads, previousLoads)
})

test('opaque black-and-white image uses brightness and retains soft edges', async () => {
  imageSources.set('opaque.png', [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255])
  const canvas = await prepareVideoMask(getVideoMaskConfig({maskUrl: 'opaque.png'}))
  assert.deepEqual([...canvas.pixels], imageSources.get('opaque.png'))
})

test('explicit mask modes override automatic format detection', async () => {
  imageSources.set('override.png', [0, 0, 0, 255, 255, 255, 255, 128])
  const alpha = await prepareVideoMask(getVideoMaskConfig({maskUrl: 'override.png', maskMode: 'alpha'}))
  const brightness = await prepareVideoMask(getVideoMaskConfig({maskUrl: 'override.png', maskMode: 'luminance'}))
  assert.deepEqual([...alpha.pixels], [255, 255, 255, 255, 128, 128, 128, 255])
  assert.deepEqual([...brightness.pixels], [0, 0, 0, 255, 128, 128, 128, 255])
})

test('a failed upload can be retried after becoming available', async () => {
  const config = getVideoMaskConfig({maskUrl: 'retry.png'})
  await assert.rejects(prepareVideoMask(config), /failed to load/)
  imageSources.set('retry.png', [255, 255, 255, 255])
  assert.ok(await prepareVideoMask(config))
})

test('shape video surfaces stay square for portrait, landscape and square targets', () => {
  for (const config of [{shape: 'circle'}, {shape: 'heart'}, {maskUrl: 'custom.png'}]) {
    for (const [width, height] of [[0.79, 1], [2, 1], [1, 1]]) {
      const surface = getVideoSurfaceSize(config, width, height)
      assert.equal(surface.width, Math.min(width, height))
      assert.equal(surface.height, surface.width)
      // A square source needs no cover crop on this surface.
      assert.equal(surface.width / surface.height, 1)
    }
  }
  assert.deepEqual(getVideoSurfaceSize({}, 0.79, 1), {width: 0.79, height: 1})
  assert.deepEqual(getVideoSurfaceSize({}, 2, 1), {width: 2, height: 1})
})

test('built-in shapes fill a square mask independently of target dimensions', async () => {
  const circle = await prepareVideoMask(getVideoMaskConfig({shape: 'circle'}))
  assert.equal(circle.width, 512)
  assert.equal(circle.height, 512)
  assert.deepEqual(circle.commands.find(([name]) => name === 'translate'), ['translate', 0, 0])
  assert.deepEqual(circle.commands.find(([name]) => name === 'scale'), ['scale', 512, 512])
  assert.deepEqual(circle.commands.find(([name]) => name === 'arc'), ['arc', 0.5, 0.5, 0.5, 0, Math.PI * 2])
  const heart = await prepareVideoMask(getVideoMaskConfig({shape: 'heart'}))
  assert.equal(heart.width, 512)
  assert.equal(heart.height, 512)
  assert.equal(heart.commands.filter(([name]) => name === 'bezierCurveTo').length, 4)
  assert.equal(await prepareVideoMask(getVideoMaskConfig({})), null)
})
