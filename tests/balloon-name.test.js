const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {splitName, getNameLayout, getBalloonFrame, getLetterFrame, getBalloonParticle} = require('../src/animations/balloon-name/timeline')
const {normalizeOptions, requiredAssets} = require('../src/animations/balloon-name/BalloonNameEffect')
const {getBalloonPlacement, getBalloonOptions} = require('../src/animations/balloon-name')
const {BALLOON_FILES, acquireBalloonAssets} = require('../src/animations/balloon-name/assets')
const {drawLetterAtlas, drawMessage} = require('../src/animations/balloon-name/text')
const {getTargetVideoLayout} = require('../src/target-size')

test('names use dynamic graphemes and responsive centered spacing', () => {
  assert.deepEqual(splitName(' priya '), ['P', 'R', 'I', 'Y', 'A'])
  assert.deepEqual(splitName('A\u0301'), ['Á'])
  assert.equal(splitName('A'.repeat(100)).length, 32)
  assert.equal(splitName('').length, 0)
  for (const name of ['A', 'PRIYA', 'MARY JANE', 'A'.repeat(32)]) {
    const layout = getNameLayout(name)
    assert.ok(layout.every(item => item.width > 0))
    assert.ok(Math.abs(layout[0].x + layout.at(-1).x) < 0.00001)
    assert.ok(layout.at(-1).x - layout[0].x + layout[0].width <= 1.5)
  }
})

test('stages reveal bouquets, stagger letters, reveal the message, and celebrate', () => {
  assert.equal(getBalloonFrame(0).left, 0)
  assert.equal(getBalloonFrame(2).left, 1)
  assert.equal(getBalloonFrame(2).right, 1)
  assert.equal(getBalloonFrame(4).banner, 0)
  assert.equal(getBalloonFrame(5).banner, 1)
  assert.ok(getBalloonFrame(5.4).celebration > 0.9)
  assert.equal(getBalloonFrame(6).celebration, 0)
  assert.ok(getLetterFrame(0, 5, 2.5).rise > getLetterFrame(4, 5, 2.5).rise)
  for (const count of [1, 5, 12, 32]) {
    for (let i = 0; i < count; i++) assert.equal(getLetterFrame(i, count, 4).rise, 1)
  }
  assert.deepEqual(getBalloonFrame(4, 12), getBalloonFrame(2, 6))
})

test('placement encloses the full cropped picture and oversized video for precise clipping', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const picture = getTargetVideoLayout({}, size, crop)
    const placement = getBalloonPlacement(size, crop, video)
    for (const rectangle of [picture, video]) {
      assert.ok(placement.y >= rectangle.y + rectangle.height / 2 - 1e-9)
      assert.ok(placement.y - placement.componentOptions.pictureHeight <= rectangle.y - rectangle.height / 2 + 1e-9)
      assert.ok(placement.x - placement.width / 2 <= rectangle.x - rectangle.width / 2 + 1e-9)
      assert.ok(placement.x + placement.width / 2 >= rectangle.x + rectangle.width / 2 - 1e-9)
    }
  }
})

test('visibility determines exact asset requests and optional center is excluded by default', () => {
  const defaults = normalizeOptions({name: 'PRIYA'})
  assert.deepEqual(requiredAssets(defaults), ['left', 'right', 'pink', 'gold', 'banner', 'trail', 'burst'])
  assert.ok(!requiredAssets(defaults).includes('center'))
  assert.ok(requiredAssets({...defaults, showCenterBouquet: true}).includes('center'))
  assert.deepEqual(requiredAssets(normalizeOptions({name: '', showBouquets: false, showCelebration: false})), ['banner'])
  assert.deepEqual(requiredAssets(normalizeOptions({name: 'PRIYA', showLetters: false, showBouquets: false,
    showBanner: false, showCelebration: false})), [])
  assert.equal(normalizeOptions({enabled: 'false'}).enabled, false)
  assert.equal(normalizeOptions({showCenterBouquet: 'false'}).showCenterBouquet, false)
  assert.equal(normalizeOptions({particleCount: 10000, offsetY: -1}).particleCount, 80)
  assert.equal(normalizeOptions({particleCount: 10000, offsetY: -1}).offsetY, 0)
  assert.deepEqual(getBalloonOptions({name: 'PRIYA', width: 9, pictureHeight: 99, targetName: 'other'}), {name: 'PRIYA'})
})

test('sparkles stay outside the picture with a bounded quiet final animation', () => {
  for (const time of [0, 2, 4.99]) {
    assert.ok(Array.from({length: 80}, (_, i) => getBalloonParticle(i, time)).every(p => p.opacity === 0))
  }
  for (const time of [5.5, 6.5, 8, 50]) {
    const particles = Array.from({length: 80}, (_, i) => getBalloonParticle(i, time))
    assert.ok(particles.every(p => p.y - p.size > 0))
    if (time >= 7) assert.ok(particles.filter(p => p.opacity > 0).length <= 8)
  }
})

test('letter atlas contains actual characters and banner messages wrap safely', () => {
  const calls = []
  const context = {font: '', clearRect() {}, strokeText() {},
    measureText(text) { return {width: text.length * parseInt(this.font.split(' ')[1], 10) * 0.6} },
    fillText(...args) { calls.push(args) },
  }
  const canvas = {getContext: () => context}
  drawLetterAtlas(canvas, getNameLayout('PRIYA'), '#ffffff', '#783a32')
  assert.deepEqual(calls.map(call => call[0]), ['P', 'R', 'I', 'Y', 'A'])
  assert.equal(canvas.width, 1024)
  assert.equal(canvas.height, 512)
  calls.length = 0
  drawMessage(canvas, 'Happy Birthday\nPriya', '#783a32')
  assert.equal(calls.length, 2)
  assert.equal(context.textAlign, 'center')
  calls.length = 0
  drawMessage(canvas, 'A'.repeat(160), '#783a32')
  assert.ok(calls.length <= 3)
  assert.ok(calls.every(([text, x, y, width]) => x === 512 && y > 0 && y < 256 && context.measureText(text).width <= width))
})

test('all eight supplied WebP files retain alpha channels and exact filenames', () => {
  assert.equal(Object.keys(BALLOON_FILES).length, 8)
  for (const file of Object.values(BALLOON_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/balloon-name/assets', file))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('texture leases share single balloons and load only newly enabled files', async () => {
  const textures = []
  const THREE = {TextureLoader: class {
    load(url, onLoad) {
      const texture = {url, image: {width: 256, height: 512}, disposed: 0, dispose() { this.disposed++ }}
      textures.push(texture)
      queueMicrotask(() => onLoad(texture))
      return texture
    }
  }}
  const first = acquireBalloonAssets(THREE, {}, 'https://example.com/shared', 768, ['pink', 'gold'])
  const second = acquireBalloonAssets(THREE, {}, 'https://example.com/shared', 768, ['pink', 'gold', 'center'])
  assert.equal(textures.length, 3)
  const [a, b] = await Promise.all([first.promise, second.promise])
  assert.equal(a.pink, b.pink)
  first.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(a.pink.disposed, 0)
  second.release()
  second.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(textures.every(texture => texture.disposed === 1))
})

test('failed or pending texture leases dispose late requests after removal', async () => {
  const pending = []
  const THREE = {TextureLoader: class {
    load(url, onLoad, progress, onError) {
      const texture = {image: {width: 256, height: 512}, disposed: false, dispose() { this.disposed = true }}
      pending.push({texture, onLoad, onError})
      return texture
    }
  }}
  const assets = acquireBalloonAssets(THREE, {}, 'https://example.com/pending', 768, ['pink', 'gold'])
  const failure = assert.rejects(assets.promise, /missing/)
  assets.release()
  pending[0].onError(new Error('missing artwork'))
  pending[1].onLoad(pending[1].texture)
  await failure
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(pending.every(({texture}) => texture.disposed))
})
