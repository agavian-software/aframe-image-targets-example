const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {GoldenRingsAnniversaryEffect, normalizeOptions, requiredAssets} = require('../src/animations/golden-rings-anniversary/GoldenRingsAnniversaryEffect')
const {getAnniversaryPlacement, getAnniversaryOptions} = require('../src/animations/golden-rings-anniversary')
const {getAnniversaryFrame, getAnniversaryLayout, getRingPose, getAnniversarySparkle, getAnniversaryPetal, heartPoint} = require('../src/animations/golden-rings-anniversary/timeline')
const {DEFAULT_MESSAGE, ordinal, getAnniversaryText, drawAnniversaryText} = require('../src/animations/golden-rings-anniversary/text')
const {ANNIVERSARY_FILES, acquireAnniversaryAssets} = require('../src/animations/golden-rings-anniversary/assets')
const {getMagicEntries} = require('../src/magic-entries')
const {getTargetVideoLayout} = require('../src/target-size')

test('anniversary follows all six timed stages and holds the joined rings, heart and banner', () => {
  const initial = getAnniversaryFrame(0)
  assert.equal(initial.entrance, 0); assert.equal(initial.alpha, 0); assert.equal(initial.joined, 0)
  assert.equal(getAnniversaryFrame(1.8).entrance, 1)
  assert.equal(getAnniversaryFrame(1.8).join, 0)
  assert.equal(getAnniversaryFrame(3.2).joined, 1)
  assert.equal(getAnniversaryFrame(3.2).heart, 0)
  assert.ok(getAnniversaryFrame(3.2).burst > 0)
  assert.equal(getAnniversaryFrame(4.5).heart, 1)
  assert.equal(getAnniversaryFrame(4.5).message, 0)
  assert.equal(getAnniversaryFrame(6).message, 1)
  assert.equal(getAnniversaryFrame(6).celebration, 0)
  for (const time of [7.5, 20, 100]) {
    const f = getAnniversaryFrame(time)
    assert.equal(f.joined, 1); assert.equal(f.heart, 1); assert.equal(f.message, 1)
    assert.equal(f.celebration, 1); assert.equal(f.burst, 0)
  }
  assert.deepEqual(getAnniversaryFrame(7.5, 15, 2), getAnniversaryFrame(7.5))
})

test('rings enter from opposite picture edges and converge smoothly before the final sprite takes over', () => {
  for (const size of [0.15, 1, 3]) {
    const o = normalizeOptions({size}), layout = getAnniversaryLayout(o)
    const left = getRingPose('left', getAnniversaryFrame(0), layout, o)
    const right = getRingPose('right', getAnniversaryFrame(0), layout, o)
    assert.ok(left.x * size < -0.5 && right.x * size > 0.5)
    assert.ok(left.y < 0 && right.y < 0)
    assert.equal(left.x, -right.x); assert.equal(left.y, right.y)
    const approaching = getRingPose('left', getAnniversaryFrame(2), layout, o)
    const almostJoined = getRingPose('left', getAnniversaryFrame(3), layout, o)
    assert.ok(Math.abs(almostJoined.x) < Math.abs(approaching.x))
    for (const side of ['left', 'right']) assert.equal(getRingPose(side, getAnniversaryFrame(3.2), layout, o).alpha, 0)
  }
})

test('layout keeps the banner and joined composition above the picture for all supported sizes', () => {
  for (const size of [0.15, 1, 3]) for (const ringSize of [0.15, 0.9]) for (const bannerSize of [0.5, 1.8]) {
    const o = normalizeOptions({size, ringSize, bannerSize, offsetY: -3}), l = getAnniversaryLayout(o)
    assert.equal(o.offsetY, 0)
    assert.ok(l.bannerY - l.bannerHeight / 2 > 0)
    assert.ok(l.ringY - l.heartWidth / 2 > l.bannerY + l.bannerHeight / 2)
    assert.ok(l.ringY - l.joinedWidth / 2 > 0)
  }
})

test('placement encloses the full off-center photo and shaped, enlarged video surfaces', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5), p = getAnniversaryPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(p.y >= rect.y + rect.height / 2)
      assert.ok(p.y - p.componentOptions.pictureHeight <= rect.y - rect.height / 2 + 1e-9)
      assert.ok(p.x - p.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(p.x + p.width / 2 >= rect.x + rect.width / 2 - 1e-9)
    }
  }
})

test('text supports ordinals, literal dates, name personalization, templates and explicit blanks', () => {
  for (const [n, expected] of [[0, ''], [1, '1st'], [2, '2nd'], [3, '3rd'], [11, '11th'], [12, '12th'],
    [13, '13th'], [21, '21st'], [25, '25th'], [111, '111th'], [112, '112th']]) assert.equal(ordinal(n), expected)
  const o = normalizeOptions({anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya', startDate: '09/12/2001', endDate: '09/12/2026'})
  assert.equal(getAnniversaryText(o), 'Happy 25th Wedding Anniversary\nEswaran ❤️ Priya\n09/12/2001 – 09/12/2026')
  assert.ok(getAnniversaryText({...o, message: 'Celebrating {years} years — our {anniversary} anniversary'}).startsWith('Celebrating 25 years — our 25th anniversary'))
  assert.equal(getAnniversaryText(normalizeOptions()), DEFAULT_MESSAGE)
  assert.equal(getAnniversaryText(normalizeOptions({message: ''})), '')
  assert.equal(getAnniversaryText(normalizeOptions({message: '', coupleNames: 'A & B'})), 'A & B')
})

test('CanvasTexture text wraps and shrinks into the cream strip for long names and messages', () => {
  const calls = [], ctx = {font: '', clearRect() {}, measureText(text) { return {width: [...text].length * parseInt(this.font.split(' ')[1]) * 0.5} },
    fillText(...args) { calls.push(args) }}
  const canvas = {getContext: () => ctx}
  drawAnniversaryText(canvas, normalizeOptions({anniversaryNumber: 25, coupleNames: 'Eswaran ❤️ Priya', startDate: '09/12/2001', endDate: '09/12/2026'}))
  assert.equal(calls.length, 3)
  calls.length = 0
  drawAnniversaryText(canvas, normalizeOptions({message: 'A'.repeat(220), coupleNames: 'B'.repeat(100), startDate: '2001', endDate: '2026'}))
  assert.ok(calls.length <= 6)
  assert.ok(calls.every(([text, x, y, width]) => x === 792 && y > 0 && y < 192 && ctx.measureText(text).width <= width))
  calls.length = 0; drawAnniversaryText(canvas, normalizeOptions({message: ''}))
  assert.ok(calls.every(([text]) => text === ''))
})

test('elapsed-time simulation preserves speed across frame rates and stops when tracking is lost', () => {
  for (const fps of [15, 30, 60]) {
    const effect = Object.assign(Object.create(GoldenRingsAnniversaryEffect.prototype), {
      options: {enabled: true}, elapsed: 0, ready: true, tracked: true, seek(t) { this.elapsed = t },
    })
    for (let i = 0; i < 10 * fps; i++) effect.update(1 / fps)
    assert.ok(Math.abs(effect.elapsed - 10) < 1e-10)
    effect.tracked = false; effect.update(1)
    assert.ok(Math.abs(effect.elapsed - 10) < 1e-10)
  }
})

test('heart particles form a closed curve and idle work is bounded', () => {
  const a = heartPoint(0), b = heartPoint(1)
  assert.ok(Math.abs(a.x - b.x) < 1e-10 && Math.abs(a.y - b.y) < 1e-10)
  const l = getAnniversaryLayout(normalizeOptions())
  for (const time of [0, 2.9, 3.1, 3.7, 4.5, 6.5, 7.5, 100]) {
    const f = getAnniversaryFrame(time)
    const particles = Array.from({length: 80}, (_, i) => getAnniversarySparkle(i, f, l))
    assert.ok(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
    if (time >= 7.5) assert.ok(particles.filter(p => p.alpha > 0).length <= 8)
    const petals = Array.from({length: 40}, (_, i) => getAnniversaryPetal(i, f, 1))
    assert.ok(petals.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
    if (time >= 7.5) assert.ok(petals.filter(p => p.alpha > 0).length <= 4)
  }
})

test('mobile options are capped and API options cannot override tracking or asset routing', () => {
  const o = normalizeOptions({enabled: 'false', particleCount: 999, petalCount: 999, heartParticleCount: 999, maxTextureSize: 9999})
  assert.equal(o.enabled, false); assert.equal(o.particleCount, 80); assert.equal(o.petalCount, 40)
  assert.equal(o.heartParticleCount, 24); assert.equal(o.maxTextureSize, 1024)
  assert.equal(requiredAssets(normalizeOptions()).length, 8)
  assert.deepEqual(requiredAssets(normalizeOptions({showMessage: false, showHeart: false, showBurst: false, showPetals: false, showOrbit: false})), ['left', 'right', 'joined'])
  assert.deepEqual(getAnniversaryOptions({anniversaryNumber: 25, duration: 10, width: 99, pictureHeight: 99, targetName: 'wrong', assetBase: 'wrong'}), {anniversaryNumber: 25, duration: 10})
  for (const bannerType of [2, '2', '02']) for (const bannerMessage of [undefined, '', 'A lifetime together']) {
    const entry = getMagicEntries({bannerType, bannerDesignType: 0, videoUrlV1: [{targetName: 'anniversary', videoUrl: 'love.mp4', bannerMessage}]})[0]
    assert.equal(entry.bannerMessage, bannerMessage ?? DEFAULT_MESSAGE)
  }
})

test('all eight supplied WebPs retain exact filenames and alpha', () => {
  assert.equal(Object.keys(ANNIVERSARY_FILES).length, 8)
  for (const filename of Object.values(ANNIVERSARY_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/golden-rings-anniversary/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF'); assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('shared texture leases release late successes and failures after teardown', async () => {
  const pending = [], THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireAnniversaryAssets(THREE, {}, 'https://example.com/anniversary', 768, ['left', 'right'])
  const b = acquireAnniversaryAssets(THREE, {}, 'https://example.com/anniversary', 768, ['left'])
  assert.equal(pending.length, 2)
  const rejected = assert.rejects(a.promise, /missing/)
  a.release(); pending[1].fail(new Error('missing')); pending[0].done(pending[0].texture)
  await rejected; await b.promise; await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 0); assert.equal(pending[1].texture.disposed, 1)
  b.release(); b.release(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 1)
})
