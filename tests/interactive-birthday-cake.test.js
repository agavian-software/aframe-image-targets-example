const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {CakeCandleState, getCakeFrame, getCandleLayout, getCandleFrame, getCakeParticle} = require('../src/animations/interactive-birthday-cake/timeline')
const {normalizeOptions, requiredAssets} = require('../src/animations/interactive-birthday-cake/InteractiveBirthdayCakeEffect')
const {getCakePlacement, getCakeOptions} = require('../src/animations/interactive-birthday-cake')
const {CakeTapInteraction} = require('../src/animations/interactive-birthday-cake/interaction')
const {CAKE_FILES, acquireCakeAssets} = require('../src/animations/interactive-birthday-cake/assets')
const {drawCakeMessage, getBirthdayMessage} = require('../src/animations/interactive-birthday-cake/text')
const {getTargetVideoLayout} = require('../src/target-size')

test('candles light sequentially, wait for input, and celebrate exactly once after the last blow', () => {
  const state = new CakeCandleState(5)
  assert.equal(state.blow(0, 2), false)
  assert.equal(state.blow(99, 3), false)
  assert.ok(getCandleFrame(0, 5, 1.8, null).lit > getCandleFrame(4, 5, 1.8, null).lit)
  for (let i = 0; i < 5; i++) assert.equal(getCandleFrame(i, 5, 2.5, null).lit, 1)
  assert.equal(state.blow(2, 3), true)
  assert.equal(state.remaining, 4)
  assert.equal(state.blow(2, 3.1), false)
  assert.equal(state.celebrationAt, null)
  assert.equal(state.blowAll(4), 4)
  assert.equal(state.celebrationAt, 4)
  assert.equal(state.blowAll(5), 0)
  assert.equal(state.celebrationAt, 4)
  state.reset()
  assert.equal(state.remaining, 5)
  assert.equal(state.celebrationAt, null)
})

test('cake clears the picture after its entrance and message waits for extinguishing', () => {
  assert.ok(getCakeFrame(0).cakeY > 0)
  for (const time of [1.5, 3, 10, 100]) {
    const frame = getCakeFrame(time)
    assert.ok(frame.cakeY + 0.82 * 1199 / 1312 / 2 < 0)
    assert.equal(frame.messageAlpha, 0)
    assert.equal(frame.celebration, null)
  }
  assert.equal(getCakeFrame(4.1, 4).messageAlpha, 0)
  assert.equal(getCakeFrame(6.2, 4).messageAlpha, 1)
  assert.equal(getCakeFrame(10, 4).hintAlpha, 0)
})

test('candles switch to off with smoke and nonoverlapping touch targets for configurable counts', () => {
  for (const count of [1, 5, 7, 12]) {
    const layout = getCandleLayout(count)
    assert.equal(layout.length, count)
    assert.ok(layout.every(item => Number.isFinite(item.x) && item.width > 0))
    for (let i = 1; i < count; i++) assert.ok(layout[i].x - layout[i - 1].x > layout[i].hitWidth)
  }
  const justBlown = getCandleFrame(0, 5, 3.1, 3)
  assert.ok(justBlown.lit < 1)
  assert.ok(justBlown.smoke > 0)
  assert.equal(getCandleFrame(0, 5, 4.5, 3).lit, 0)
  assert.equal(getCandleFrame(0, 5, 4.5, 3).smoke, 0)
})

test('cake placement clears both full cropped photo and enlarged shaped video', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  for (const shape of ['', 'heart', 'circle']) {
    const picture = getTargetVideoLayout({}, size, crop)
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const placement = getCakePlacement(size, crop, video)
    assert.ok(placement.y <= picture.y - picture.height / 2)
    assert.ok(placement.y <= video.y - video.height / 2)
    assert.equal(placement.x, picture.x)
  }
})

test('tap controller accepts one tap and rejects synthetic duplicates, drags, multitouch and UI', () => {
  const listeners = new Map()
  const document = {addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)}
  const element = {getBoundingClientRect: () => ({left: 10, top: 20, width: 300, height: 600})}
  let at = 0, taps = 0, allowed = true
  const controller = new CakeTapInteraction({element, document, allowed: () => allowed, now: () => at, onTap: () => { taps++; return true }})
  const event = (values = {}) => ({pointerId: 1, button: 0, clientX: 100, clientY: 200,
    target: element, cancelable: true, preventDefault() {}, ...values})
  const down = values => listeners.get('pointerdown')(event(values))
  const up = values => listeners.get('pointerup')(event(values))
  down(); up(); up(); assert.equal(taps, 1)
  down(); up({clientX: 130}); assert.equal(taps, 1)
  down(); down({pointerId: 2, isPrimary: false}); up({pointerId: 2}); up(); assert.equal(taps, 1)
  down(); at = 1000; up(); assert.equal(taps, 1)
  down({target: {closest: () => true}}); up(); assert.equal(taps, 1)
  down(); listeners.get('pointercancel')(); up(); assert.equal(taps, 1)
  down(); controller.reset(); up(); assert.equal(taps, 1)
  allowed = false; down(); up(); assert.equal(taps, 1)
  allowed = true; down(); up(); assert.equal(taps, 2)
  controller.dispose(); assert.equal(listeners.size, 0)
})

test('configuration bounds work and hidden celebrations do not request artwork', () => {
  assert.equal(normalizeOptions().candleCount, 5)
  assert.equal(normalizeOptions({candleCount: 100}).candleCount, 12)
  assert.equal(normalizeOptions({candleCount: 0}).candleCount, 1)
  assert.equal(normalizeOptions({enabled: 'false'}).enabled, false)
  assert.equal(normalizeOptions({particleCount: 1000}).particleCount, 96)
  assert.equal(requiredAssets(normalizeOptions()).length, 11)
  assert.deepEqual(requiredAssets(normalizeOptions({showMessage: false, showCelebration: false})), ['cake', 'lit', 'off', 'flame', 'smoke'])
  assert.deepEqual(getCakeOptions({candleCount: 7, name: 'Priya', width: 99, targetName: 'wrong'}), {name: 'Priya', candleCount: 7})
})

test('name personalization preserves explicit messages and blanks', () => {
  assert.equal(getBirthdayMessage('Happy Birthday!', 'Priya'), 'Happy Birthday Priya')
  assert.equal(getBirthdayMessage('A special day', 'Priya'), 'A special day')
  assert.equal(getBirthdayMessage('', 'Priya'), '')
  const calls = []
  const context = {font: '', clearRect() {}, measureText(text) { return {width: text.length * parseInt(this.font.split(' ')[1], 10) * 0.6} },
    fillText(...args) { calls.push(args) }}
  const canvas = {getContext: () => context}
  drawCakeMessage(canvas, 'Happy Birthday\nPriya', '#783a32')
  assert.equal(calls.length, 2)
  assert.equal(context.textAlign, 'center')
  calls.length = 0
  drawCakeMessage(canvas, 'A'.repeat(180), '#783a32')
  assert.ok(calls.length <= 3)
  assert.ok(calls.every(([text, x, y, width]) => x === 512 && y > 0 && y < 256 && context.measureText(text).width <= width))
})

test('particles wait for the last candle and become occasional in the final state', () => {
  assert.ok(Array.from({length: 96}, (_, i) => getCakeParticle(i, null)).every(p => p.alpha === 0))
  for (const time of [0.5, 1.2, 4, 30]) {
    const particles = Array.from({length: 96}, (_, i) => getCakeParticle(i, time))
    assert.ok(particles.every(p => Number.isFinite(p.x) && p.y < 0 && p.alpha >= 0 && p.alpha <= 1))
    if (time > 2.5) assert.ok(particles.filter(p => p.alpha > 0).length <= 8)
  }
})

test('eleven exact WebP assets retain alpha and are not Git LFS pointer placeholders', () => {
  assert.equal(Object.keys(CAKE_FILES).length, 11)
  for (const filename of Object.values(CAKE_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/interactive-birthday-cake/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('cached cake assets share textures and dispose only after the final reference', async () => {
  const textures = []
  const THREE = {TextureLoader: class {
    load(url, done) {
      const texture = {url, image: {width: 256, height: 512}, disposed: 0, dispose() { this.disposed++ }}
      textures.push(texture); queueMicrotask(() => done(texture)); return texture
    }
  }}
  const first = acquireCakeAssets(THREE, {}, 'https://example.com/cake', 768, ['cake', 'lit'])
  const second = acquireCakeAssets(THREE, {}, 'https://example.com/cake', 768, ['cake', 'lit', 'smoke'])
  assert.equal(textures.length, 3)
  const [a, b] = await Promise.all([first.promise, second.promise])
  assert.equal(a.cake, b.cake)
  first.release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(a.cake.disposed, 0)
  second.release(); second.release(); await new Promise(resolve => setImmediate(resolve))
  assert.ok(textures.every(texture => texture.disposed === 1))
})

test('removal during an asset failure disposes late successful textures', async () => {
  const pending = []
  const THREE = {TextureLoader: class {
    load(url, done, progress, fail) {
      const texture = {image: {width: 256, height: 512}, disposed: false, dispose() { this.disposed = true }}
      pending.push({texture, done, fail}); return texture
    }
  }}
  const assets = acquireCakeAssets(THREE, {}, 'https://example.com/pending', 768, ['cake', 'lit'])
  const failure = assert.rejects(assets.promise, /missing/)
  assets.release(); pending[0].fail(new Error('missing artwork')); pending[1].done(pending[1].texture)
  await failure; await new Promise(resolve => setImmediate(resolve))
  assert.ok(pending.every(({texture}) => texture.disposed))
})
