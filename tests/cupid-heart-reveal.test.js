const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {CupidHeartRevealEffect, normalizeOptions, requiredAssets} = require('../src/animations/cupid-heart-reveal/CupidHeartRevealEffect')
const {getCupidFrame, getCupidPose, getArrowPose, getHalfPose, getCupidParticle} = require('../src/animations/cupid-heart-reveal/timeline')
const {getCupidPlacement, getCupidOptions, getInitialVideoOpacity} = require('../src/animations/cupid-heart-reveal')
const {CUPID_FILES, acquireCupidAssets} = require('../src/animations/cupid-heart-reveal/assets')
const {getMagicEntries} = require('../src/magic-entries')
const {getTargetVideoLayout} = require('../src/target-size')
const bounds = {left: -0.5, right: 0.5, bottom: -0.5, top: 0.5}

test('video stays hidden through impact and cracks, fades only while breaking, then stays revealed', () => {
  const options = normalizeOptions()
  const frame = getCupidFrame(0, options)
  assert.equal(frame.hitAt, 3.5)
  assert.equal(frame.breakAt, 4)
  assert.equal(frame.revealAt, 5)
  assert.equal(frame.endAt, 7)
  for (const time of [0, 1, 2, 3, 3.5, 3.99, 4]) assert.equal(getCupidFrame(time, options).videoOpacity, 0)
  let previous = 0
  for (let i = 1; i < 20; i++) {
    const opacity = getCupidFrame(4 + i / 20, options).videoOpacity
    assert.ok(opacity > previous && opacity < 1); previous = opacity
  }
  for (const time of [5, 7, 100]) assert.equal(getCupidFrame(time, options).videoOpacity, 1)
  const custom = normalizeOptions({arrowSpeed: 2, breakDuration: 2, speed: 0.5})
  assert.equal(getCupidFrame(0, custom).hitAt, 3.25)
  assert.equal(getCupidFrame(0, custom).revealAt, 5.75)
  assert.equal(getCupidFrame(11.5, custom).videoOpacity, 1)
})

test('arrow tip, not its center, visibly lands at the target center for configurable Cupid positions', () => {
  for (const cupidX of [-2, -0.82, 0, 1.5]) for (const cupidY of [-1, 0, 0.48, 2]) {
    const options = normalizeOptions({cupidX, cupidY})
    const bow = getCupidPose(getCupidFrame(3, options), options, bounds).bow
    for (const p of [0, 0.5, 1]) {
      const arrow = getArrowPose(p, bow, 0.25)
      const visibleTip = {x: arrow.x + Math.cos(arrow.rotation) * 0.25 * 0.47,
        y: arrow.y + Math.sin(arrow.rotation) * 0.25 * 0.47}
      assert.ok(Math.abs(visibleTip.x - bow.x * (1 - p)) < 1e-10)
      assert.ok(Math.abs(visibleTip.y - bow.y * (1 - p)) < 1e-10)
    }
  }
})

test('rotated heart halves completely clear portrait and landscape picture bounds', () => {
  for (const right of [0.5, 1.5]) for (const heartWidth of [0.2, 0.85, 2.5]) for (const side of ['left', 'right']) {
    const b = {...bounds, left: -right, right}
    const p = getHalfPose(side, 1, heartWidth, side === 'left' ? 160 / 255 : 180 / 255, b)
    const halfExtent = (Math.abs(Math.cos(p.rotation)) * p.width + Math.abs(Math.sin(p.rotation)) * p.height) / 2
    if (side === 'left') assert.ok(p.x + halfExtent < b.left)
    else assert.ok(p.x - halfExtent > b.right)
    assert.equal(p.alpha, 0)
  }
})

test('placement centers on the full printed picture and protects union bounds for off-center crops', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const placement = getCupidPlacement(size, crop, video), b = placement.componentOptions
    assert.equal(placement.x, picture.x)
    assert.equal(placement.y, picture.y)
    for (const rect of [picture, video]) {
      assert.ok(b.boundsLeft + placement.x <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(b.boundsRight + placement.x >= rect.x + rect.width / 2 - 1e-9)
      assert.ok(b.boundsBottom + placement.y <= rect.y - rect.height / 2 + 1e-9)
      assert.ok(b.boundsTop + placement.y >= rect.y + rect.height / 2 - 1e-9)
    }
  }
})

test('tracking, disabling and removal own the video gate without touching playback', () => {
  const changes = []
  const effect = Object.assign(Object.create(CupidHeartRevealEffect.prototype), {
    options: normalizeOptions(), elapsed: 0, ready: false, tracked: false,
    group: {visible: false}, onVideoOpacity: opacity => changes.push(opacity),
  })
  effect.start(); assert.equal(changes.at(-1), 0)
  effect.seek(4.5); assert.equal(changes.at(-1), 0.5)
  effect.seek(5); assert.equal(changes.at(-1), 1)
  effect.reset(); assert.equal(changes.at(-1), 0)
  assert.equal(effect.elapsed, 0)
  effect.start(); assert.equal(effect.elapsed, 0)
  effect.configure({enabled: false}); assert.equal(changes.at(-1), 1)
  effect.configure({enabled: true}); assert.equal(changes.at(-1), 0)
  effect.failed = true; effect.seek(0); assert.equal(changes.at(-1), 1)
  effect.failed = false; effect.disposed = true; effect.seek(0); assert.equal(changes.at(-1), 1)
})

test('mobile options are bounded, disabled designs do not gate video, and old designs retain defaults', () => {
  const o = normalizeOptions({particleCount: 999, petalCount: 999, fragmentCount: 999, arrowSpeed: 0, breakDuration: 99})
  assert.equal(o.particleCount, 72); assert.equal(o.petalCount, 40); assert.equal(o.fragmentCount, 32)
  assert.equal(o.arrowSpeed, 0.25); assert.equal(o.breakDuration, 4)
  assert.equal(requiredAssets(normalizeOptions()).length, 22)
  assert.equal(requiredAssets(normalizeOptions({showMessage: false, showPetals: false, showSparkles: false, showRing: false, showHearts: false})).length, 17)
  assert.equal(getInitialVideoOpacity(), 0)
  for (const enabled of [false, 'false', 0, '0']) assert.equal(getInitialVideoOpacity({enabled}), 1)
  assert.deepEqual(getCupidOptions({cupidX: -1, speed: 2, width: 99, pictureHeight: 99, boundsLeft: -99, targetName: 'wrong', assetBase: 'wrong'}), {cupidX: -1, speed: 2})
  for (const bannerMessage of [undefined, '', 'Always yours']) {
    const entry = getMagicEntries({bannerType: 1, bannerDesignType: 2,
      videoUrlV1: [{targetName: 'love', videoUrl: 'love.mp4', bannerMessage}]})[0]
    assert.equal(entry.bannerMessage, bannerMessage ?? 'You Stole My Heart ❤️')
  }
})

test('fragments expire at reveal completion and final sparkles are limited to ten', () => {
  for (const time of [0, 3.9, 4.4, 5, 7, 100]) {
    const frame = getCupidFrame(time, normalizeOptions())
    for (const kind of ['fragment', 'sparkle', 'petal']) {
      const particles = Array.from({length: 72}, (_, i) => getCupidParticle(i, frame, bounds, kind))
      assert.ok(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
      if (kind === 'fragment' && (time < 4 || time >= 5)) assert.ok(particles.every(p => p.alpha === 0))
      if (kind === 'sparkle' && time >= 7) assert.ok(particles.filter(p => p.alpha > 0).length <= 10)
    }
  }
})

test('all 22 supplied WebPs keep exact filenames and transparency, without duplicate wings', () => {
  assert.equal(Object.keys(CUPID_FILES).length, 22)
  assert.ok(Object.keys(CUPID_FILES).every(key => !/wing/i.test(key)))
  for (const filename of Object.values(CUPID_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/cupid-heart-reveal/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('texture leases share resources and clean up late failed or successful requests', async () => {
  const pending = []
  const THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireCupidAssets(THREE, {}, 'https://example.com/cupid', 768, ['whole', 'cracked'])
  const b = acquireCupidAssets(THREE, {}, 'https://example.com/cupid', 768, ['whole'])
  assert.equal(pending.length, 2)
  const rejected = assert.rejects(a.promise, /missing/)
  a.release(); pending[1].fail(new Error('missing')); pending[0].done(pending[0].texture)
  await rejected; await b.promise; await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 0); assert.equal(pending[1].texture.disposed, 1)
  b.release(); b.release(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 1)
})
