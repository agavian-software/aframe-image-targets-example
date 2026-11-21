const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {FlyingLoveLetterEffect, normalizeOptions, requiredAssets} = require('../src/animations/flying-love-letter/FlyingLoveLetterEffect')
const {getLoveLetterPlacement, getLoveLetterOptions} = require('../src/animations/flying-love-letter')
const {getLoveLetterFrame, getLoveLetterLayout, getFlightPose, getLovePetal, getLoveSparkle} = require('../src/animations/flying-love-letter/timeline')
const {DEFAULT_MESSAGE, getFullLetterText, layoutLetterText, drawLoveLetterText} = require('../src/animations/flying-love-letter/text')
const {LOVE_LETTER_FILES, acquireLoveLetterAssets} = require('../src/animations/flying-love-letter/assets')
const {getMagicEntries} = require('../src/magic-entries')
const {getTargetVideoLayout} = require('../src/target-size')
const {TargetTapInteraction} = require('../src/animations/shared/tap-interaction')

test('letter follows all six stages and the flapping phase remains continuous when landing', () => {
  const initial = getLoveLetterFrame(0)
  assert.equal(initial.flight, 0)
  assert.equal(initial.alpha, 0)
  assert.equal(initial.unfold, 0)
  assert.equal(getLoveLetterFrame(2).flight, 1)
  assert.equal(getLoveLetterFrame(2).opening, 0)
  assert.equal(getLoveLetterFrame(3.2).opening, 1)
  assert.equal(getLoveLetterFrame(3.2).unfold, 0)
  assert.equal(getLoveLetterFrame(5.5).unfold, 1)
  assert.equal(getLoveLetterFrame(5.5).message, 0)
  assert.equal(getLoveLetterFrame(8).message, 1)
  assert.equal(getLoveLetterFrame(8).heart, 0)
  assert.ok(getLoveLetterFrame(8.3).burst > 0)
  for (const time of [9.5, 30, 100]) {
    const frame = getLoveLetterFrame(time)
    assert.equal(frame.opening, 1)
    assert.equal(frame.unfold, 1)
    assert.equal(frame.message, 1)
    assert.equal(frame.heart, 1)
    assert.equal(frame.burst, 0)
  }
  assert.deepEqual(getLoveLetterFrame(9.5, 19, 2), getLoveLetterFrame(9.5))
  const layout = getLoveLetterLayout(normalizeOptions())
  const before = getFlightPose(getLoveLetterFrame(2 - 1e-7), layout)
  const after = getFlightPose(getLoveLetterFrame(2 + 1e-7), layout)
  assert.ok(Math.abs(before.flap - after.flap) < 1e-5)
  assert.equal(getFlightPose(initial, layout, 'left').x, -getFlightPose(initial, layout, 'right').x)
})

test('envelope and complete parchment stay above the top anchor at configurable scales', () => {
  for (const size of [0.15, 1, 3]) for (const envelopeSize of [0.25, 1]) for (const letterSize of [0.4, 1.5]) {
    const options = normalizeOptions({size, envelopeSize, letterSize, offsetY: -3})
    const layout = getLoveLetterLayout(options)
    assert.equal(options.offsetY, 0)
    assert.ok(layout.envelopeY - envelopeSize / 2 > 0)
    assert.ok(layout.letterY - layout.letterHeight / 2 > layout.envelopeY)
    for (const time of [0, 1, 2, 9.5, 30]) {
      assert.ok(getFlightPose(getLoveLetterFrame(time), layout).y - envelopeSize / 2 > 0)
    }
  }
})

test('placement encloses off-center printed image crops and overscanned video bounds', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const placement = getLoveLetterPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(placement.y >= rect.y + rect.height / 2)
      assert.ok(placement.x - placement.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(placement.x + placement.width / 2 >= rect.x + rect.width / 2 - 1e-9)
    }
  }
})

test('simulation advances by elapsed seconds equally at 15, 30 and 60 fps', () => {
  for (const fps of [15, 30, 60]) {
    const effect = Object.assign(Object.create(FlyingLoveLetterEffect.prototype), {
      elapsed: 0, ready: true, tracked: true, options: {enabled: true},
      seek(seconds) { this.elapsed = seconds },
    })
    for (let i = 0; i < fps * 10; i++) effect.update(1 / fps)
    assert.ok(Math.abs(effect.elapsed - 10) < 1e-10)
    effect.tracked = false; effect.update(1)
    assert.ok(Math.abs(effect.elapsed - 10) < 1e-10)
    effect.tracked = true; effect.options.enabled = false; effect.update(1)
    assert.ok(Math.abs(effect.elapsed - 10) < 1e-10)
  }
})

const makeTextCanvas = () => {
  const calls = []
  const ctx = {font: '', clearRect() {}, measureText(text) { return {width: [...text].length * parseInt(this.font) * 0.5} },
    fillText(...args) { calls.push(args) }}
  return {ctx, calls, canvas: {getContext: () => ctx}}
}
test('message reveals line by line and long messages retain full content for enlarged reading', () => {
  const {ctx, calls, canvas} = makeTextCanvas()
  const options = {message: 'My Love ❤️\nEvery day is beautiful with you.', recipientName: 'Priya', senderName: 'Aarav'}
  const layout = layoutLetterText(ctx, options)
  drawLoveLetterText(canvas, layout, 0, '#69392f')
  assert.equal(calls.length, 0)
  drawLoveLetterText(canvas, layout, 0.5, '#69392f')
  assert.equal(calls.length, Math.floor(layout.lines.length / 2))
  calls.length = 0
  drawLoveLetterText(canvas, layout, 1, '#69392f')
  assert.equal(calls.length, layout.lines.length + 1)
  assert.equal(calls.at(-1)[0], 'Tap letter to read')
  calls.length = 0
  drawLoveLetterText(canvas, layout, 1, '#69392f', false)
  assert.equal(calls.length, layout.lines.length)
  const longMessage = 'A very long loving message ❤️ '.repeat(3000) + '<script>literal text</script>'
  const longOptions = {...options, message: longMessage}
  const preview = layoutLetterText(ctx, longOptions)
  assert.equal(preview.overflow, true)
  assert.equal(preview.lines.length, 14)
  assert.ok(preview.lines.every(line => ctx.measureText(line).width <= 700))
  const full = getFullLetterText(longOptions)
  assert.ok(full.includes(longMessage))
  assert.ok(full.startsWith('To Priya,'))
  assert.ok(full.endsWith('With love,\nAarav'))
  assert.equal(getFullLetterText({message: '', senderName: '', recipientName: ''}), '')
})

test('particles use gravity and deterministic replay, and idle work stays limited', () => {
  const layout = getLoveLetterLayout(normalizeOptions())
  for (let i = 0; i < 48; i++) {
    const a = getLovePetal(i, getLoveLetterFrame(8.7), layout)
    const b = getLovePetal(i, getLoveLetterFrame(8.8), layout)
    const c = getLovePetal(i, getLoveLetterFrame(8.9), layout)
    assert.ok(c.y - 2 * b.y + a.y < 0)
    assert.notEqual(a.rotation, b.rotation)
    assert.deepEqual(a, getLovePetal(i, getLoveLetterFrame(8.7), layout))
    assert.equal(getLovePetal(i, getLoveLetterFrame(7.9), layout).alpha, 0)
    if (i >= 4) assert.equal(getLovePetal(i, getLoveLetterFrame(15), layout).alpha, 0)
  }
  for (const time of [0, 0.5, 2.5, 8.5, 9.5, 100]) {
    const particles = Array.from({length: 72}, (_, i) => getLoveSparkle(i, getLoveLetterFrame(time), layout, 'right'))
    assert.ok(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
    if (time >= 9.5) assert.ok(particles.filter(p => p.alpha > 0).length <= 10)
  }
})

test('mobile configuration is capped and only matching assets are requested', () => {
  assert.equal(requiredAssets(normalizeOptions()).length, 12)
  assert.deepEqual(requiredAssets(normalizeOptions({showWings: false, showSeal: false, showHeart: false,
    showPetals: false, showFireworks: false, showHearts: false, showSparkles: false})), ['closed', 'open', 'letter'])
  const options = normalizeOptions({enabled: 'false', allowRead: '0', particleCount: 999, petalCount: 999,
    maxTextureSize: 9999, speed: -1, entranceSide: 'invalid'})
  assert.equal(options.enabled, false)
  assert.equal(options.allowRead, false)
  assert.equal(options.particleCount, 72)
  assert.equal(options.petalCount, 48)
  assert.equal(options.maxTextureSize, 1024)
  assert.equal(options.speed, 0.1)
  assert.equal(options.entranceSide, 'left')
  assert.deepEqual(getLoveLetterOptions({recipientName: 'Priya', speed: 2, enabled: false,
    width: 99, assetBase: 'wrong', targetName: 'wrong', message: 'wrong'}), {enabled: false, recipientName: 'Priya', speed: 2})
  for (const bannerType of [1, '1', '01', '1.0']) for (const bannerMessage of [undefined, '', 'Always yours']) {
    const [entry] = getMagicEntries({bannerType, bannerDesignType: '1',
      videoUrlV1: [{targetName: 'love', videoUrl: 'love.mp4', bannerMessage}]})
    assert.equal(entry.bannerMessage, bannerMessage ?? DEFAULT_MESSAGE)
  }
})

test('all twelve supplied WebPs keep exact filenames and transparency', () => {
  assert.equal(Object.keys(LOVE_LETTER_FILES).length, 12)
  for (const filename of Object.values(LOVE_LETTER_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/flying-love-letter/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('shared asset leases release late success and failure results exactly once', async () => {
  const pending = []
  const THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireLoveLetterAssets(THREE, {}, 'https://example.com/love', 768, ['closed', 'open'])
  const b = acquireLoveLetterAssets(THREE, {}, 'https://example.com/love', 768, ['closed'])
  assert.equal(pending.length, 2)
  const failure = assert.rejects(a.promise, /missing/)
  a.release(); pending[1].fail(new Error('missing')); pending[0].done(pending[0].texture)
  await failure; await b.promise; await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 0)
  assert.equal(pending[1].texture.disposed, 1)
  b.release(); b.release(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 1)
})

test('mobile letter taps reject drags, multitouch, UI and disabled interactions and remove listeners', () => {
  const listeners = new Map()
  const document = {addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)}
  const element = {getBoundingClientRect: () => ({left: 10, top: 20, width: 300, height: 600})}
  let taps = 0, allowed = true
  const interaction = new TargetTapInteraction({element, document, allowed: () => allowed,
    onTap: () => { taps++; return true }})
  const event = (values = {}) => ({pointerId: 1, button: 0, clientX: 100, clientY: 200,
    target: element, cancelable: true, preventDefault() {}, ...values})
  const down = values => listeners.get('pointerdown')(event(values))
  const up = values => listeners.get('pointerup')(event(values))
  down(); up(); up(); assert.equal(taps, 1)
  down(); up({clientX: 130}); assert.equal(taps, 1)
  down(); down({pointerId: 2, isPrimary: false}); up({pointerId: 2}); up(); assert.equal(taps, 1)
  down({target: {closest: () => true}}); up(); assert.equal(taps, 1)
  down(); interaction.reset(); up(); assert.equal(taps, 1)
  allowed = false; down(); up(); assert.equal(taps, 1)
  allowed = true; down(); up(); assert.equal(taps, 2)
  interaction.dispose(); assert.equal(listeners.size, 0)
})
