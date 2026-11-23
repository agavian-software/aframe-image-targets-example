const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {TraditionalSouthIndianWeddingArchEffect, DEFAULTS, normalizeOptions, requiredAssets} = require('../src/animations/traditional-south-indian-wedding-arch/TraditionalSouthIndianWeddingArchEffect')
const {TEMPLE_OPENING, getTempleArchFrame, getTempleArchLayout} = require('../src/animations/traditional-south-indian-wedding-arch/timeline')
const {getTempleArchPlacement, getTempleArchOptions, getInitialVideoOpacity} = require('../src/animations/traditional-south-indian-wedding-arch')
const {TEMPLE_ARCH_FILES, acquireTempleArchAssets} = require('../src/animations/traditional-south-indian-wedding-arch/assets')
const {getMagicEntries} = require('../src/magic-entries')
const {getTargetVideoLayout} = require('../src/target-size')

test('temple waits for touch and reveals video only as the cut ribbon separates', () => {
  for (const time of [0, 1, 20, 1000]) {
    const f = getTempleArchFrame(time)
    assert.equal(f.active, false); assert.equal(f.videoOpacity, 0); assert.equal(f.growth, 0)
  }
  for (const time of [0, 1, 1.34, 1.35]) assert.equal(getTempleArchFrame(time, 0).videoOpacity, 0)
  assert.ok(getTempleArchFrame(1.6, 0).videoOpacity > 0)
  assert.ok(getTempleArchFrame(2, 0).videoOpacity < 1)
  assert.equal(getTempleArchFrame(2.65, 0).videoOpacity, 1)
  assert.equal(getTempleArchFrame(2.65, 0).cutAlpha, 0)
  assert.equal(getTempleArchFrame(4.25, 0).complete, 1)
  assert.ok(getTempleArchFrame(1.4, 0).snip > 0)
  assert.equal(getTempleArchFrame(2, 0).snip, 0)
  assert.deepEqual(getTempleArchFrame(6.5, 0, 13, 2), getTempleArchFrame(6.5, 0))
})

test('calibrated transparent opening contains landscape and portrait video bounds plus clearance', () => {
  for (const ratio of [0.5, 0.75, 1, 1.5, 2]) for (const archScale of [1, 1.4, 1.8]) {
    const o = normalizeOptions({width: 1, pictureHeight: ratio, archScale}), l = getTempleArchLayout(o)
    const opening = {left: l.archX + (TEMPLE_OPENING.left - 0.5) * l.archWidth,
      right: l.archX + (TEMPLE_OPENING.right - 0.5) * l.archWidth,
      top: l.archY + (0.5 - TEMPLE_OPENING.top) * l.archHeight,
      bottom: l.archY + (0.5 - TEMPLE_OPENING.bottom) * l.archHeight}
    assert.ok(opening.left <= -0.5 - o.outerMargin + 1e-9)
    assert.ok(opening.right >= 0.5 + o.outerMargin - 1e-9)
    assert.ok(opening.top >= ratio / 2 + o.outerMargin - 1e-9)
    assert.ok(opening.bottom <= -ratio / 2 - o.outerMargin + 1e-9)
    assert.ok(Math.abs(l.archHeight / l.archWidth - 4 / 3) < 1e-10)
    assert.ok(l.bannerY + l.bannerHeight / 2 < -ratio / 2)
  }
})

test('registered growth bands partition the original canvas without duplicated toran or lamps', () => {
  const effect = Object.assign(Object.create(TraditionalSouthIndianWeddingArchEffect.prototype), {options: normalizeOptions(), batches: {}})
  const l = getTempleArchLayout(effect.options)
  for (const growth of [0.1, 0.4, 0.8, 1]) {
    const calls = {}, f = {...getTempleArchFrame(3, 0), growth, complete: 0}
    effect.renderArch((name, props) => { calls[name] = props }, f, l)
    const bands = [calls.lamps, calls.leftArch, calls.toran]
    assert.ok(Math.abs(bands.reduce((total, p) => total + p.uv[3], 0) - growth) < 1e-10)
    for (const p of bands) {
      assert.ok(Math.abs(p.height - p.uv[3] * l.archHeight) < 1e-10)
      assert.equal(p.width, l.archWidth)
      assert.equal(p.x, l.archX)
    }
  }
  const final = {}
  effect.renderArch((name, p) => { final[name] = p }, getTempleArchFrame(6.5, 0), l)
  assert.equal(final.fullArch.alpha, 1)
  for (const name of ['leftArch', 'rightArch', 'toran', 'lamps']) assert.equal(final[name].alpha, 0)
})

test('movable ribbon, scissors and cut pieces keep the same target-local cut point', () => {
  const o = normalizeOptions({ribbonX: 0.15, ribbonY: 0.12}), l = getTempleArchLayout(o)
  const effect = Object.assign(Object.create(TraditionalSouthIndianWeddingArchEffect.prototype), {options: o})
  const f = getTempleArchFrame(1.35, 0), p = effect.getScissorPose(f, l)
  const tipX = p.x + Math.cos(p.rotation) * o.scissorSize * 0.30 - Math.sin(p.rotation) * o.scissorSize * 0.29
  const tipY = p.y + Math.sin(p.rotation) * o.scissorSize * 0.30 + Math.cos(p.rotation) * o.scissorSize * 0.29
  assert.ok(Math.abs(tipX - l.ribbonX) < 1e-10 && Math.abs(tipY - l.ribbonY) < 1e-10)
  for (const side of ['left', 'right']) assert.equal(effect.getCutRibbonPose(side, f, l).y, l.ribbonY)
  const clamped = getTempleArchLayout(normalizeOptions({ribbonY: 100}))
  assert.ok(clamped.ribbonY + clamped.ribbonHeight / 2 < clamped.ratio / 2)
  assert.equal(effect.getHintText(), 'Tap Ribbon to Open')
})

test('tracking resets by default and optionally resumes an unfinished or completed ceremony', () => {
  for (const replayOnReacquire of [true, false]) {
    const effect = Object.assign(Object.create(TraditionalSouthIndianWeddingArchEffect.prototype), {
      options: normalizeOptions({replayOnReacquire}), elapsed: 20, cutAt: 19, tracked: true, ready: false,
      group: {visible: false}, interaction: {reset() {}},
    })
    effect.reset(); assert.equal(effect.tracked, false)
    assert.equal(effect.elapsed, replayOnReacquire ? 0 : 20)
    assert.equal(effect.cutAt, replayOnReacquire ? null : 19)
    effect.start(); assert.equal(effect.tracked, true)
    assert.equal(effect.elapsed, replayOnReacquire ? 0 : 20)
    assert.equal(effect.cutAt, replayOnReacquire ? null : 19)
  }
})

test('aliases map names/dates and animation controls before A-Frame defaults are applied', () => {
  const o = normalizeOptions({weddingDate: '09/12/2001', anniversaryDate: '09/12/2026', animationSpeed: 1.5, ribbonScale: 1.1})
  assert.equal(o.startDate, '09/12/2001'); assert.equal(o.endDate, '09/12/2026'); assert.equal(o.speed, 1.5)
  assert.ok(Math.abs(o.ribbonSize - 1.188) < 1e-10)
  const options = getTempleArchOptions({weddingDate: '2001', anniversaryDate: '2026', animationSpeed: 2,
    ribbonY: 0.1, width: 99, pictureHeight: 99, assetBase: 'wrong', targetName: 'wrong', closedVideoOpacity: 1})
  assert.deepEqual(options, {startDate: '2001', endDate: '2026', speed: 2, ribbonY: 0.1})
  const explicit = normalizeOptions({weddingDate: 'wrong', startDate: '', animationSpeed: 2, speed: 1})
  assert.equal(explicit.startDate, ''); assert.equal(explicit.speed, 1)
})

test('temple flags bound mobile work and cannot expose the video before cutting', () => {
  assert.equal(requiredAssets(normalizeOptions()).length, 12)
  assert.equal(requiredAssets(normalizeOptions({useFullArch: false, showToran: false, showLamps: false, showBloom: false, showMessage: false, showOverlay: false})).length, 6)
  assert.equal(getInitialVideoOpacity({closedVideoOpacity: 0.35}), 0)
  for (const enabled of [false, 'false', 0, '0']) assert.equal(getInitialVideoOpacity({enabled}), 1)
  const o = normalizeOptions({outerMargin: 0, particleCount: 999, petalCount: 999, showToran: 'false', showLamps: '0', replayOnReacquire: 'false'})
  assert.equal(o.outerMargin, 0.02); assert.equal(o.particleCount, 72); assert.equal(o.petalCount, 40)
  assert.equal(o.showToran, false); assert.equal(o.showLamps, false); assert.equal(o.replayOnReacquire, false)
  for (const bannerMessage of [undefined, '', 'Happy {anniversary} Anniversary']) {
    const entry = getMagicEntries({bannerType: 2, bannerDesignType: 2, videoUrlV1: [{targetName: 'wedding', videoUrl: 'wedding.mp4', bannerMessage}]})[0]
    assert.equal(entry.bannerMessage, bannerMessage ?? DEFAULTS.message)
  }
})

test('placement protects off-center printed crops and oversized shaped video surfaces', () => {
  const size = {width: 0.6, height: 1}, crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5), p = getTempleArchPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(p.x - p.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(p.x + p.width / 2 >= rect.x + rect.width / 2 - 1e-9)
      assert.ok(p.y - p.componentOptions.pictureHeight / 2 <= rect.y - rect.height / 2 + 1e-9)
      assert.ok(p.y + p.componentOptions.pictureHeight / 2 >= rect.y + rect.height / 2 - 1e-9)
    }
  }
})

test('all twelve supplied WebPs keep exact names and alpha', () => {
  assert.equal(Object.keys(TEMPLE_ARCH_FILES).length, 12)
  for (const filename of Object.values(TEMPLE_ARCH_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/traditional-south-indian-wedding-arch/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF'); assert.equal(data.subarray(8, 12).toString(), 'WEBP'); assert.ok(data[20] & 0x10)
  }
})

test('temple texture leases share artwork and dispose late failed/successful results exactly once', async () => {
  const pending = [], THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireTempleArchAssets(THREE, {}, 'https://example.com/temple', 768, ['ribbon', 'fullArch'])
  const b = acquireTempleArchAssets(THREE, {}, 'https://example.com/temple', 768, ['ribbon'])
  assert.equal(pending.length, 2)
  const rejected = assert.rejects(a.promise, /missing/)
  a.release(); pending[1].fail(new Error('missing')); pending[0].done(pending[0].texture)
  await rejected; await b.promise; await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[1].texture.disposed, 1); assert.equal(pending[0].texture.disposed, 0)
  b.release(); b.release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(pending[0].texture.disposed, 1)
})
