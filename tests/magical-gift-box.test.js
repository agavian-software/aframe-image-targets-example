const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {DURATION, getEntranceEnd, getGiftBoxLayout, getGiftBoxFrame, getSparkleFrame} =
  require('../src/animations/magical-gift-box/timeline')
const {getGiftBoxPlacement, getGiftBoxOptions, getInitialVideoOpacity} = require('../src/animations/magical-gift-box')
const {normalizeOptions, drawGiftMessage} = require('../src/animations/magical-gift-box/MagicalGiftBoxEffect')
const {GIFT_FILES, acquireGiftAssets} = require('../src/animations/magical-gift-box/assets')
const {getTargetVideoLayout} = require('../src/target-size')

test('the gift lands closed, reveals the name after opening, and releases video after the name rises', () => {
  assert.equal(getGiftBoxFrame(0).closed, 1)
  assert.ok(getGiftBoxFrame(0).entranceY < 0)
  const waiting = getGiftBoxFrame(getEntranceEnd(DURATION))
  assert.equal(waiting.entranceY, 0)
  assert.equal(waiting.closed, 1)
  assert.equal(waiting.lidOpacity, 0)
  assert.equal(waiting.bannerOpacity, 0)
  assert.ok(getGiftBoxFrame(1.2).lidOpacity > 0.9)
  assert.equal(getGiftBoxFrame(1.5).explosion, 1)
  assert.equal(getGiftBoxFrame(1.88).hearts, 1)
  assert.equal(getGiftBoxFrame(2.19).stars, 1)
  assert.equal(getGiftBoxFrame(2.5).openBody, 1)
  assert.equal(getGiftBoxFrame(2.7).bannerOpacity, 1)
  assert.equal(getGiftBoxFrame(2.7).bannerLift, 0)
  assert.equal(getGiftBoxFrame(4.19).videoReady, false)
  assert.equal(getGiftBoxFrame(DURATION).bannerLift, 1)
  assert.equal(getGiftBoxFrame(DURATION).videoReady, true)
  assert.equal(getGiftBoxFrame(DURATION).artOpacity, 0)
  for (let elapsed = 0; elapsed <= DURATION; elapsed += 0.01) {
    const frame = getGiftBoxFrame(elapsed)
    const opacity = frame.closed + frame.closedBody + frame.explosion + frame.hearts + frame.stars + frame.openBody
    assert.ok(Math.abs(opacity - 1) < 0.000001, `Solid box weights at ${elapsed}`)
  }
  assert.deepEqual(getGiftBoxFrame(3, 2 * DURATION), getGiftBoxFrame(1.5, DURATION))
})

test('the gift fits in the cropped picture and the final banner clears the enlarged video', () => {
  const properties = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  for (const target of [{width: 0.6, height: 1}, {width: 1, height: 0.4}]) {
    const picture = getTargetVideoLayout({}, target, properties)
    for (const shape of ['', 'circle', 'heart']) {
      const video = getTargetVideoLayout({shape}, target, properties, 1.5)
      const placement = getGiftBoxPlacement(target, properties, video)
      const layout = getGiftBoxLayout(normalizeOptions({width: placement.width, ...placement.componentOptions,
        size: 3, offsetX: 3, offsetY: 3}))
      assert.equal(placement.x, picture.x)
      assert.equal(placement.y, picture.y)
      assert.ok((Math.abs(layout.x) + 0.26) * layout.scale < picture.width / 2)
      assert.ok((Math.abs(layout.y) + 0.26) * layout.scale < picture.height / 2)
      assert.ok(placement.y + layout.top * layout.scale > video.y + video.height / 2)
    }
  }
})

test('sparkles appear only after opening and fade before playback', () => {
  for (const time of [0, 1, 1.4, DURATION, 120]) {
    assert.ok(Array.from({length: 96}, (_, i) => getSparkleFrame(i, time)).every(p => p.opacity === 0))
  }
  for (const time of [1.8, 2.2, 2.8]) {
    const particles = Array.from({length: 96}, (_, i) => getSparkleFrame(i, time))
    assert.ok(particles.every(p => p.opacity >= 0 && p.opacity <= 1))
    assert.ok(particles.some(p => p.opacity > 0))
  }
})

test('configuration bounds particle count, scale, duration, and downward offsets', () => {
  const options = normalizeOptions({particleCount: 1000, duration: -2, size: 100, offsetY: -1})
  assert.equal(options.particleCount, 96)
  assert.equal(options.duration, 0.5)
  assert.equal(options.size, 3)
  assert.equal(options.offsetY, 0)
  assert.deepEqual(getGiftBoxOptions({duration: 6, size: 0.7, targetName: 'other', assetBase: 'other', text: 'other'}),
    {duration: 6, size: 0.7})
  assert.deepEqual(getGiftBoxOptions({enabled: 'false', recipientName: ' Priya '}), {enabled: false, name: 'Priya'})
  assert.equal(getInitialVideoOpacity({enabled: 'false'}), 1)
  assert.equal(getInitialVideoOpacity(), 0)
})

test('personalized text wraps long names within the blank banner and preserves an empty message', () => {
  const lines = []
  const context = {font: '', clearRect() {},
    measureText(text) { return {width: text.length * parseInt(this.font.split(' ')[1], 10) * 0.6} },
    fillText(...args) { lines.push(args) },
  }
  const canvas = {getContext: () => context}
  drawGiftMessage(canvas, 'Priya', '#79382f')
  assert.equal(lines.length, 1)
  assert.match(context.font, /216px/)
  lines.length = 0
  drawGiftMessage(canvas, 'Happy Birthday Priya', '#79382f')
  assert.equal(context.textAlign, 'center')
  assert.equal(context.fillStyle, '#79382f')
  assert.ok(lines.length > 0)
  lines.length = 0
  drawGiftMessage(canvas, 'A'.repeat(180), '#79382f')
  assert.ok(lines.length <= 3)
  for (const [text, x, y, width] of lines) {
    assert.ok(context.measureText(text).width <= width)
    assert.equal(x, 512)
    assert.ok(y > 0 && y < canvas.height)
  }
  lines.length = 0
  drawGiftMessage(canvas, '', '#79382f')
  assert.ok(lines.every(line => line[0] === ''))
})

test('the exact eight WebP assets are present with alpha-enabled WebP headers', () => {
  assert.equal(GIFT_FILES.length, 8)
  for (const file of GIFT_FILES) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/magical-gift-box/assets', file))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.equal(data.subarray(12, 16).toString(), 'VP8X')
    assert.ok(data[20] & 0x10, `${file} must retain its alpha channel`)
  }
})

test('live instances share textures and release them once after the final user leaves', async () => {
  const textures = []
  const THREE = {TextureLoader: class {
    load(url, onLoad) {
      const texture = {url, image: {width: 768, height: 768}, disposed: 0, dispose() { this.disposed++ }}
      textures.push(texture)
      queueMicrotask(() => onLoad(texture))
      return texture
    }
  }}
  const first = acquireGiftAssets(THREE, {}, 'https://example.com/shared', 768)
  const second = acquireGiftAssets(THREE, {}, 'https://example.com/shared', 768)
  assert.equal(textures.length, 8)
  await Promise.all([first.promise, second.promise])
  first.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(textures.every(texture => texture.disposed === 0))
  second.release()
  second.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(textures.every(texture => texture.disposed === 1))
})

test('removal during loading releases every texture, including late and failed requests', async () => {
  const pending = []
  const THREE = {TextureLoader: class {
    load(url, onLoad, progress, onError) {
      const texture = {image: {width: 768, height: 768}, disposed: false, dispose() { this.disposed = true }}
      pending.push({texture, onLoad, onError})
      return texture
    }
  }}
  const assets = acquireGiftAssets(THREE, {}, 'https://example.com/pending', 768)
  const failure = assert.rejects(assets.promise, /missing artwork/)
  assets.release()
  pending.forEach(({texture, onLoad, onError}, i) => i === 3
    ? onError(new Error('missing artwork')) : onLoad(texture))
  await failure
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(pending.every(({texture}) => texture.disposed))
})
