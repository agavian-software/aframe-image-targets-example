const {test} = require('node:test')
const assert = require('node:assert/strict')
const {getVideoMaskConfig, getVideoSurfaceSize, prepareVideoMask, prepareVideoMaskConfig} = require('../src/video-mask')

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
      this.naturalWidth = source.width || source.length / 4
      this.naturalHeight = source.height || 1
      this.pixels = source.pixels || source
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

test('custom square cutout on a portrait canvas keeps its proportions after loading', async () => {
  // Same 9:16 canvas ratio as the actual 945x1680 backend SquareMask.
  const pixels = new Uint8ClampedArray(9 * 16 * 4)
  for (let y = 3; y < 12; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      pixels.fill(255, (y * 9 + x) * 4, (y * 9 + x + 1) * 4)
    }
  }
  imageSources.set('portrait-square-mask.webp', {width: 9, height: 16, pixels})
  const config = await prepareVideoMaskConfig(getVideoMaskConfig({shape: {
    arShapeId: 9, shapeName: 'SquareMask', customShapeUrl: 'portrait-square-mask.webp',
  }}))
  assert.equal(config.maskAspect, 9 / 16)
  const surface = getVideoSurfaceSize(config, 1, 1)
  assert.deepEqual(surface, {width: 9 / 16, height: 1})
  // The 9x9 cutout must remain square in world coordinates.
  assert.equal(surface.width, surface.height * 9 / 16)
  const canvas = await prepareVideoMask(config)
  assert.equal(canvas.pixels[1], 0)
  assert.equal(canvas.pixels[(3 * 9) * 4 + 1], 255)
  assert.equal(canvas.pixels[(12 * 9) * 4 + 1], 0)
})

test('custom canvas aspect fits portrait and landscape targets and ignores invalid ratios', () => {
  assert.deepEqual(getVideoSurfaceSize({maskUrl: 'mask', maskAspect: 9 / 16}, 2, 1),
    {width: 9 / 16, height: 1})
  assert.deepEqual(getVideoSurfaceSize({maskUrl: 'mask', maskAspect: 16 / 9}, 1, 2),
    {width: 1, height: 9 / 16})
  for (const maskAspect of [0, -1, NaN, Infinity]) {
    assert.deepEqual(getVideoSurfaceSize({maskUrl: 'mask', maskAspect}, 2, 1), {width: 1, height: 1})
  }
})
