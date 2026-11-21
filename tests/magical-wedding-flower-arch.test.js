const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {MagicalWeddingFlowerArchEffect, normalizeOptions, requiredAssets, isRibbonUvHit} = require('../src/animations/magical-wedding-flower-arch/MagicalWeddingFlowerArchEffect')
const {getFlowerArchFrame, getFlowerArchLayout, getScissorPose, getCutRibbonPose, getFlowerArchParticle} = require('../src/animations/magical-wedding-flower-arch/timeline')
const {getFlowerArchPlacement, getFlowerArchOptions, getInitialVideoOpacity} = require('../src/animations/magical-wedding-flower-arch')
const {FLOWER_ARCH_FILES, acquireFlowerArchAssets} = require('../src/animations/magical-wedding-flower-arch/assets')
const {drawArchMessage} = require('../src/animations/magical-wedding-flower-arch/text')
const {getTargetVideoLayout} = require('../src/target-size')
const {getMagicEntries} = require('../src/magic-entries')

test('ribbon waits indefinitely for touch and never starts a timed automatic reveal', () => {
  for (const time of [0, 1, 100, 1000]) {
    const f = getFlowerArchFrame(time)
    assert.equal(f.active, false); assert.equal(f.cut, false); assert.equal(f.growth, 0)
    assert.equal(f.videoOpacity, 0); assert.equal(f.scissorAlpha, 0); assert.equal(f.message, 0)
  }
  assert.equal(getFlowerArchFrame(100, null, 6.5, 1, 0.2).videoOpacity, 0.2)
})

test('ribbon touch margin bridges small transparent bow gaps while rejecting empty corners', () => {
  const alpha = {width: 100, height: 40, data: new Uint8Array(4000)}
  alpha.data[20 * 100 + 47] = 255
  assert.equal(isRibbonUvHit({x: 0.47, y: 0.5}, alpha), true)
  assert.equal(isRibbonUvHit({x: 0.50, y: 0.5}, alpha), true)
  assert.equal(isRibbonUvHit({x: 0.02, y: 0.97}, alpha), false)
  assert.equal(isRibbonUvHit({x: 0.9, y: 0.1}, alpha), false)
})

test('touch drives scissors, cut pieces, outer growth, video reveal and final romantic state in order', () => {
  const at = 20, f = seconds => getFlowerArchFrame(at + seconds, at)
  assert.ok(f(0.1).highlight > 0)
  assert.ok(f(0.8).scissorAlpha > 0 && f(0.8).bladeAngle > 0)
  assert.equal(f(1.3).cut, false)
  assert.equal(f(1.35).cut, true); assert.equal(f(1.35).videoOpacity, 0)
  assert.equal(f(1.35).bladeAngle, 0)
  assert.ok(f(2).growth > 0 && f(2).growth < 1)
  assert.equal(f(2.65).cutAlpha, 0)
  assert.equal(f(3.2).videoOpacity, 0)
  assert.ok(f(3.7).videoOpacity > 0 && f(3.7).videoOpacity < 1)
  assert.equal(f(4.25).videoOpacity, 1); assert.equal(f(4.25).complete, 1)
  assert.equal(f(5.5).message, 1)
  for (const time of [6.5, 100]) {
    assert.equal(f(time).complete, 1); assert.equal(f(time).bloom, 0)
    assert.equal(f(time).message, 1); assert.equal(f(time).celebration, 1)
    assert.equal(f(time).scissorAlpha, 0); assert.equal(f(time).cutAlpha, 0)
  }
  assert.deepEqual(getFlowerArchFrame(6.5, 0, 13, 2), getFlowerArchFrame(6.5, 0))
})

test('cut action is single-use and tracking loss, disabling and removal reset or release the video gate', () => {
  const opacity = []
  const effect = Object.assign(Object.create(MagicalWeddingFlowerArchEffect.prototype), {
    options: normalizeOptions(), elapsed: 0, cutAt: null, tracked: false, ready: false,
    group: {visible: false}, sparkleColor: {set() {}}, onVideoOpacity: value => opacity.push(value),
  })
  assert.equal(effect.triggerCut(), false)
  effect.start(); effect.seek(20); assert.equal(effect.cutAt, null); assert.equal(effect.videoOpacity, 0)
  effect.ready = true
  const realSeek = effect.seek; effect.seek = function(t) { this.elapsed = t; this.publishVideoOpacity() }
  assert.equal(effect.triggerCut(), true); assert.equal(effect.cutAt, 20)
  assert.equal(effect.triggerCut(), false)
  effect.seek(24.25); assert.equal(effect.videoOpacity, 1)
  effect.configure({duration: 13, speed: 2}); assert.equal(effect.cutAt, 20)
  effect.ready = false; effect.seek = realSeek
  effect.reset(); assert.equal(effect.cutAt, null); assert.equal(effect.videoOpacity, 0)
  effect.configure({enabled: false}); assert.equal(effect.videoOpacity, 1)
  effect.configure({enabled: true}); assert.equal(effect.videoOpacity, 0)
  effect.failed = true; assert.equal(effect.videoOpacity, 1)
  effect.failed = false; effect.disposed = true; assert.equal(effect.videoOpacity, 1)
})

test('arch and message remain outside the target with uniform texture proportions on portrait and landscape pictures', () => {
  for (const ratio of [0.5, 0.75, 1, 1.5, 2]) {
    const o = normalizeOptions({width: 1, pictureHeight: ratio}), l = getFlowerArchLayout(o)
    assert.ok(l.archWidth > 1)
    assert.ok(l.baseY < -ratio / 2)
    assert.ok(l.baseY + l.archHeight > ratio / 2)
    assert.ok(Math.abs(l.archHeight / l.archWidth - 1402 / 1122) < 1e-10)
    assert.ok(l.bannerY + l.bannerHeight / 2 < l.baseY)
    const cut = getFlowerArchFrame(2.64, 0)
    const left = getCutRibbonPose('left', cut, l), right = getCutRibbonPose('right', cut, l)
    assert.ok(left.x < -0.5 && right.x > 0.5); assert.ok(left.y < 0 && right.y < 0)
    const scissors = getScissorPose(getFlowerArchFrame(1.35, 0), o)
    const x = scissors.x + Math.cos(scissors.rotation) * o.scissorSize * 0.30 - Math.sin(scissors.rotation) * o.scissorSize * 0.29
    const y = scissors.y + Math.sin(scissors.rotation) * o.scissorSize * 0.30 + Math.cos(scissors.rotation) * o.scissorSize * 0.29
    assert.ok(Math.abs(x) < 1e-10 && Math.abs(y) < 1e-10)
  }
})

test('center placement includes off-center photo crops and enlarged masked video bounds', () => {
  const size = {width: 0.6, height: 1}, crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5), p = getFlowerArchPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(p.x - p.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(p.x + p.width / 2 >= rect.x + rect.width / 2 - 1e-9)
      assert.ok(p.y - p.componentOptions.pictureHeight / 2 <= rect.y - rect.height / 2 + 1e-9)
      assert.ok(p.y + p.componentOptions.pictureHeight / 2 >= rect.y + rect.height / 2 - 1e-9)
    }
  }
})

test('anniversary text fits the banner cream area, keeps literal dates and supports blanks', () => {
  const calls = [], ctx = {font: '', clearRect() {}, measureText(text) { return {width: [...text].length * parseInt(this.font.split(' ')[1]) * 0.5} }, fillText(...args) { calls.push(args) }}
  const canvas = {getContext: () => ctx}
  drawArchMessage(canvas, normalizeOptions({anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya', startDate: '09/12/2001', endDate: '09/12/2026'}))
  assert.equal(calls.length, 3); assert.equal(calls[0][0], 'Happy 25th Wedding Anniversary')
  assert.equal(calls[2][0], '09/12/2001 – 09/12/2026')
  calls.length = 0; drawArchMessage(canvas, normalizeOptions({message: 'A'.repeat(220), coupleNames: 'B'.repeat(100)}))
  assert.ok(calls.length <= 6)
  assert.ok(calls.every(([text, x, y, width]) => x === 768 && y > 0 && y < 256 && ctx.measureText(text).width <= width))
  calls.length = 0; drawArchMessage(canvas, normalizeOptions({message: ''})); assert.ok(calls.every(([text]) => text === ''))
})

test('disabled arch never gates playback and mobile settings are bounded', () => {
  assert.equal(getInitialVideoOpacity(), 0)
  assert.equal(getInitialVideoOpacity({closedVideoOpacity: 0.2}), 0.2)
  for (const enabled of [false, 'false', 0, '0']) assert.equal(getInitialVideoOpacity({enabled}), 1)
  const o = normalizeOptions({archScale: -1, closedVideoOpacity: 1, particleCount: 999, petalCount: 999, maxTextureSize: 9999})
  assert.equal(o.archScale, 1); assert.equal(o.closedVideoOpacity, 0.35); assert.equal(o.particleCount, 72); assert.equal(o.petalCount, 40); assert.equal(o.maxTextureSize, 1024)
  assert.equal(requiredAssets(normalizeOptions()).length, 10)
  assert.equal(requiredAssets(normalizeOptions({useFullArch: false, showMessage: false, showOverlay: false, showBloom: false})).length, 6)
  assert.deepEqual(getFlowerArchOptions({anniversaryNumber: 25, duration: 8, width: 99, pictureHeight: 99, assetBase: 'wrong', targetName: 'wrong'}), {anniversaryNumber: 25, duration: 8})
  for (const bannerMessage of [undefined, '', 'With love']) {
    const entry = getMagicEntries({bannerType: 2, bannerDesignType: 1, videoUrlV1: [{targetName: 'wedding', videoUrl: 'wedding.mp4', bannerMessage}]})[0]
    assert.equal(entry.bannerMessage, bannerMessage ?? 'Happy Wedding Anniversary')
  }
})

test('final particles are finite, stay at the outer edges and idle counts are bounded', () => {
  const l = getFlowerArchLayout(normalizeOptions())
  for (const time of [0, 1, 2, 4, 6.5, 100]) for (const kind of ['sparkle', 'petal']) {
    const f = getFlowerArchFrame(time, 0), p = Array.from({length: 72}, (_, i) => getFlowerArchParticle(i, f, l, kind))
    assert.ok(p.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) && v.alpha >= 0 && v.alpha <= 1))
    if (time >= 6.5) assert.ok(p.filter(v => v.alpha > 0).length <= (kind === 'petal' ? 4 : 10))
  }
})

test('all ten supplied WebPs preserve exact names and alpha', () => {
  assert.equal(Object.keys(FLOWER_ARCH_FILES).length, 10)
  for (const filename of Object.values(FLOWER_ARCH_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/magical-wedding-flower-arch/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF'); assert.equal(data.subarray(8, 12).toString(), 'WEBP'); assert.ok(data[20] & 0x10)
  }
})

test('shared texture leases dispose late load results once after failure and removal', async () => {
  const pending = [], THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireFlowerArchAssets(THREE, {}, 'https://example.com/arch', 768, ['leftArch', 'ribbon'])
  const b = acquireFlowerArchAssets(THREE, {}, 'https://example.com/arch', 768, ['ribbon'])
  assert.equal(pending.length, 2)
  const rejected = assert.rejects(a.promise, /missing/)
  a.release(); pending[0].fail(new Error('missing')); pending[1].done(pending[1].texture)
  await rejected; await b.promise; await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 1); assert.equal(pending[1].texture.disposed, 0)
  b.release(); b.release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(pending[1].texture.disposed, 1)
})
