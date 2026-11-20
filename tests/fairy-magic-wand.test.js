const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {getFairyFrame, getFairyPose, getOrbitPoint, getMagicParticle} = require('../src/animations/fairy-magic-wand/timeline')
const {normalizeOptions, requiredAssets} = require('../src/animations/fairy-magic-wand/FairyMagicWandEffect')
const {getFairyPlacement, getFairyOptions} = require('../src/animations/fairy-magic-wand')
const {FAIRY_FILES, acquireFairyAssets} = require('../src/animations/fairy-magic-wand/assets')
const {drawFairyMessage} = require('../src/animations/fairy-magic-wand/text')
const {getTargetVideoLayout} = require('../src/target-size')

test('fairy enters, waves, completes the circle, bursts, and reveals the message in order', () => {
  assert.equal(getFairyFrame(0).alpha, 0)
  assert.equal(getFairyFrame(1.5).entrance, 1)
  assert.equal(getFairyFrame(1.5).circle, 0)
  assert.equal(getFairyFrame(3).circle, 1)
  assert.ok(Math.abs(getFairyFrame(2).wave) > 0.1)
  assert.ok(getFairyFrame(3.2).burstAlpha > 0.9)
  assert.equal(getFairyFrame(4).burstAlpha, 0)
  assert.equal(getFairyFrame(4).messageAlpha, 0)
  assert.equal(getFairyFrame(5).messageAlpha, 1)
  assert.equal(getFairyFrame(5).messageScale, 1)
  assert.deepEqual(getFairyFrame(4, 10), getFairyFrame(2, 5))
  assert.deepEqual(getFairyFrame(1, 5, 2), getFairyFrame(2, 5))
})

test('the complete fairy settles outside the right edge and its painted wand faces the picture', () => {
  const options = {pictureRatio: 0.7, size: 1, fairySize: 0.48, useHoverPose: true}
  const initial = getFairyPose(getFairyFrame(0), options)
  const settled = getFairyPose(getFairyFrame(1.5), options)
  assert.ok(initial.x > settled.x)
  for (const time of [1.5, 1.8, 2, 3.5, 4.5, 5, 10]) {
    const pose = getFairyPose(getFairyFrame(time), options)
    const halfWidth = Math.abs(Math.cos(pose.rotation)) * pose.width / 2 + Math.abs(Math.sin(pose.rotation)) * pose.height / 2
    assert.ok(pose.x - halfWidth > 0.5)
    assert.ok(pose.tip.x < pose.x)
  }
})

test('the magic ring clears every corner of portrait, square, and landscape pictures', () => {
  for (const ratio of [0.3, 0.7, 1, 2, 3]) {
    for (let i = 0; i <= 512; i++) {
      const p = getOrbitPoint(i / 512, ratio)
      assert.ok(Math.abs(p.x) > 0.5 || p.y > 0 || p.y < -ratio)
    }
    const first = getOrbitPoint(0, ratio), last = getOrbitPoint(1, ratio)
    assert.ok(Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9)
  }
})

test('fairy clipping bounds include off-center crops and enlarged video surfaces', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  for (const shape of ['', 'circle', 'heart']) {
    const picture = getTargetVideoLayout({}, size, crop)
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const placement = getFairyPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(placement.x - placement.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(placement.x + placement.width / 2 >= rect.x + rect.width / 2 - 1e-9)
      assert.ok(placement.y >= rect.y + rect.height / 2 - 1e-9)
      assert.ok(placement.y - placement.componentOptions.pictureHeight <= rect.y - rect.height / 2 + 1e-9)
    }
  }
})

test('selective artwork loading avoids duplicate wings and wand and honors visibility', () => {
  const defaults = normalizeOptions()
  assert.deepEqual(requiredAssets(defaults), ['flying', 'hover', 'trail', 'burst', 'stars', 'ribbon'])
  assert.ok(requiredAssets({...defaults, showWandHighlight: true}).includes('wand'))
  assert.deepEqual(requiredAssets(normalizeOptions({useHoverPose: false, showTrail: false,
    showBurst: false, showStars: false, showMessage: false})), ['flying'])
  assert.deepEqual(requiredAssets(normalizeOptions({showFairy: false, showTrail: false,
    showBurst: false, showStars: false, showMessage: false})), [])
  assert.equal(normalizeOptions({enabled: 'false'}).enabled, false)
  assert.equal(normalizeOptions({particleCount: 10000, duration: -1}).particleCount, 96)
  assert.equal(normalizeOptions({particleCount: 10000, duration: -1}).duration, 0.5)
  assert.deepEqual(getFairyOptions({fairySize: 0.6, width: 99, targetName: 'wrong', message: 'wrong'}), {fairySize: 0.6})
})

test('real-time particles start at the wand and settle to at most eight glints', () => {
  const tip = {x: 0.7, y: 0.05}
  for (const time of [0, 1, 1.49]) {
    assert.ok(Array.from({length: 96}, (_, i) => getMagicParticle(i, getFairyFrame(time), 0.7, tip)).every(p => p.alpha === 0))
  }
  for (const time of [2, 3.4, 5.3, 30]) {
    const particles = Array.from({length: 96}, (_, i) => getMagicParticle(i, getFairyFrame(time), 0.7, tip))
    assert.ok(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
    if (time >= 5) assert.ok(particles.filter(p => p.alpha > 0).length <= 8)
  }
})

test('dynamic ribbon text supports blank messages and wraps long names in the safe area', () => {
  const calls = []
  const context = {font: '', clearRect() {},
    measureText(text) { return {width: text.length * parseInt(this.font.split(' ')[1], 10) * 0.6} },
    fillText(...args) { calls.push(args) },
  }
  const canvas = {getContext: () => context}
  drawFairyMessage(canvas, 'Happy Birthday\nPriya', '#78402d')
  assert.equal(context.fillStyle, '#78402d')
  assert.equal(context.textAlign, 'center')
  assert.equal(calls.length, 2)
  calls.length = 0
  drawFairyMessage(canvas, 'A'.repeat(180), '#78402d')
  assert.ok(calls.length <= 3)
  assert.ok(calls.every(([text, x, y, width]) => x === 512 && y > 0 && y < 256 && context.measureText(text).width <= width))
  calls.length = 0
  drawFairyMessage(canvas, '', '#78402d')
  assert.ok(calls.every(([text]) => text === ''))
})

test('all nine supplied WebP files preserve alpha and exact filenames', () => {
  assert.equal(Object.keys(FAIRY_FILES).length, 9)
  for (const filename of Object.values(FAIRY_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/fairy-magic-wand/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('fairy texture leases share artwork until the final instance releases it', async () => {
  const loaded = []
  const THREE = {TextureLoader: class {
    load(url, done) {
      const texture = {url, image: {width: 256, height: 512}, disposed: 0, dispose() { this.disposed++ }}
      loaded.push(texture)
      queueMicrotask(() => done(texture))
      return texture
    }
  }}
  const first = acquireFairyAssets(THREE, {}, 'https://example.com/fairy', 768, ['flying', 'hover'])
  const second = acquireFairyAssets(THREE, {}, 'https://example.com/fairy', 768, ['flying', 'hover', 'wand'])
  assert.equal(loaded.length, 3)
  const [a, b] = await Promise.all([first.promise, second.promise])
  assert.equal(a.flying, b.flying)
  first.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(a.flying.disposed, 0)
  second.release(); second.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(loaded.every(texture => texture.disposed === 1))
})

test('failed fairy loads release late successful textures after removal', async () => {
  const pending = []
  const THREE = {TextureLoader: class {
    load(url, done, progress, fail) {
      const texture = {image: {width: 256, height: 512}, disposed: false, dispose() { this.disposed = true }}
      pending.push({texture, done, fail})
      return texture
    }
  }}
  const assets = acquireFairyAssets(THREE, {}, 'https://example.com/missing', 768, ['flying', 'hover'])
  const failure = assert.rejects(assets.promise, /missing/)
  assets.release()
  pending[0].fail(new Error('missing artwork'))
  pending[1].done(pending[1].texture)
  await failure
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(pending.every(({texture}) => texture.disposed))
})
