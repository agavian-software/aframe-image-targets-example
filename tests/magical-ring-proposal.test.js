const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {getProposalFrame, getProposalLayout, heartPoint, getProposalSparkle, getProposalPetal} = require('../src/animations/magical-ring-proposal/timeline')
const {normalizeOptions, requiredAssets} = require('../src/animations/magical-ring-proposal/MagicalRingProposalEffect')
const {getProposalPlacement, getProposalOptions} = require('../src/animations/magical-ring-proposal')
const {PROPOSAL_FILES, acquireProposalAssets} = require('../src/animations/magical-ring-proposal/assets')
const {drawProposalMessage, DEFAULT_MESSAGE} = require('../src/animations/magical-ring-proposal/text')
const {getMagicEntries} = require('../src/magic-entries')
const {getTargetVideoLayout} = require('../src/target-size')

test('proposal follows the six timed stages and holds the romantic final pose', () => {
  const start = getProposalFrame(0)
  assert.equal(start.entrance, 0)
  assert.equal(start.ringAlpha, 0)
  assert.equal(start.message, 0)
  assert.equal(start.hearts, 0)
  assert.equal(getProposalFrame(1.5).entrance, 1)
  assert.equal(getProposalFrame(1.5).opening, 0)
  assert.ok(getProposalFrame(1).entrance > 1, 'entrance overshoots gently before settling')
  assert.equal(getProposalFrame(3).opening, 1)
  assert.equal(getProposalFrame(3).ringRise, 1)
  assert.equal(getProposalFrame(3).heart, 0)
  assert.equal(getProposalFrame(4.5).heart, 1)
  assert.equal(getProposalFrame(4.5).message, 0)
  assert.equal(getProposalFrame(6).message, 1)
  assert.ok(getProposalFrame(6.3).celebration > 0)
  for (const time of [8, 20, 100]) {
    const frame = getProposalFrame(time)
    assert.equal(frame.celebration, 0)
    assert.equal(frame.opening, 1)
    assert.equal(frame.ringAlpha, 1)
    assert.equal(frame.message, 1)
    assert.equal(frame.hearts, 1)
  }
  assert.deepEqual(getProposalFrame(8, 16, 2), getProposalFrame(8))
})

test('layout clears the photo for small and large boxes, rings, banners and effect scales', () => {
  for (const size of [0.15, 1, 3]) for (const boxSize of [0.15, 0.9]) for (const ringSize of [0.1, 0.6]) {
    const options = normalizeOptions({size, boxSize, ringSize, offsetY: 3})
    const layout = getProposalLayout(options)
    assert.equal(options.offsetY, 0)
    assert.ok(layout.bannerY + layout.bannerHeight / 2 < 0)
    assert.ok(layout.ringY + Math.max(layout.heartWidth, ringSize) / 2 < layout.bannerY - layout.bannerHeight / 2)
    assert.ok(layout.boxY + layout.boxHeight / 2 < layout.ringY - ringSize / 2)
    assert.ok(layout.boxY * size + layout.boxHeight * size / 2 < 0)
  }
})

test('bottom anchor includes full off-center photo crops and enlarged shaped videos', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  const picture = getTargetVideoLayout({}, size, crop)
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const placement = getProposalPlacement(size, crop, video)
    for (const rect of [picture, video]) {
      assert.ok(placement.y <= rect.y - rect.height / 2)
      assert.ok(placement.x - placement.width / 2 <= rect.x - rect.width / 2 + 1e-9)
      assert.ok(placement.x + placement.width / 2 >= rect.x + rect.width / 2 - 1e-9)
      assert.ok(placement.y + placement.componentOptions.pictureHeight >= rect.y + rect.height / 2 - 1e-9)
    }
  }
})

test('petals have gravity, varied velocities and rotation, and expire before the final pose', () => {
  const layout = getProposalLayout(normalizeOptions())
  for (let i = 0; i < 48; i++) {
    const early = getProposalPetal(i, getProposalFrame(6.7), layout)
    const later = getProposalPetal(i, getProposalFrame(6.8), layout)
    const last = getProposalPetal(i, getProposalFrame(6.9), layout)
    assert.ok(last.y - 2 * later.y + early.y < 0, 'downward acceleration')
    assert.notEqual(early.rotation, later.rotation)
    assert.equal(getProposalPetal(i, getProposalFrame(5.9), layout).alpha, 0)
    assert.equal(getProposalPetal(i, getProposalFrame(8.25), layout).alpha, 0)
  }
})

test('golden orbit forms a closed heart and idles with at most ten glints', () => {
  const first = heartPoint(0), last = heartPoint(1)
  assert.ok(Math.abs(first.x - last.x) < 1e-10 && Math.abs(first.y - last.y) < 1e-10)
  const layout = getProposalLayout(normalizeOptions())
  for (const time of [0, 2.5, 3.4, 4.49, 6.5, 8.5, 100]) {
    const particles = Array.from({length: 96}, (_, index) => getProposalSparkle(index, getProposalFrame(time), layout))
    assert.ok(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1))
    if (time < 2.5) assert.ok(particles.every(p => p.alpha === 0))
    if (time >= 8) assert.ok(particles.filter(p => p.alpha > 0).length <= 10)
  }
})

test('configuration caps mobile work, preserves explicit blank messages and protects routing', () => {
  const options = normalizeOptions({enabled: 'false', showPetals: '0', particleCount: 999, petalCount: 999, speed: -1})
  assert.equal(options.enabled, false)
  assert.equal(options.showPetals, false)
  assert.equal(options.particleCount, 96)
  assert.equal(options.petalCount, 48)
  assert.equal(options.speed, 0.1)
  assert.deepEqual(requiredAssets(normalizeOptions({showMessage: false, showHeart: false,
    showPetals: false, showFireworks: false, showHearts: false})), ['closed', 'open', 'ring'])
  assert.deepEqual(getProposalOptions({enabled: false, coupleNames: 'A & B', duration: 12,
    width: 99, pictureHeight: 99, targetName: 'wrong', assetBase: 'wrong', message: 'wrong'}),
  {enabled: false, coupleNames: 'A & B', duration: 12})
  for (const bannerMessage of [undefined, '', 'Say yes?']) {
    for (const bannerType of [1, '1', '01', '1.0']) {
      const [entry] = getMagicEntries({bannerType, videoUrlV1: [{targetName: 'love', videoUrl: 'love.mp4', bannerMessage}]})
      assert.equal(entry.bannerMessage, bannerMessage ?? DEFAULT_MESSAGE)
    }
  }
  assert.equal(getMagicEntries({videoUrlV1: [{targetName: 'birthday', videoUrl: 'birthday.mp4'}]})[0].bannerMessage, 'Happy Birthday!')
})

test('CanvasTexture text fits multiline messages and long names into the banner safe area', () => {
  const calls = []
  const ctx = {font: '', clearRect() {}, measureText(text) { return {width: [...text].length * parseInt(this.font.split(' ')[1]) * 0.6} },
    fillText(...args) { calls.push(args) }}
  const canvas = {getContext: () => ctx}
  drawProposalMessage(canvas, DEFAULT_MESSAGE, 'Aarav & Priya', '#fff1b8')
  assert.equal(calls.length, 2)
  assert.equal(calls[1][0], 'Aarav & Priya')
  calls.length = 0
  drawProposalMessage(canvas, 'A'.repeat(180), 'B'.repeat(50), '#fff1b8')
  assert.ok(calls.length <= 4)
  assert.ok(calls.every(([text, x, y, width]) => x === 512 && y > 0 && y < 256 && ctx.measureText(text).width <= width))
  calls.length = 0
  drawProposalMessage(canvas, '', '', '#fff1b8')
  assert.ok(calls.every(([text]) => text === ''))
})

test('all eight supplied WebPs retain exact filenames and alpha', () => {
  assert.equal(Object.keys(PROPOSAL_FILES).length, 8)
  for (const filename of Object.values(PROPOSAL_FILES)) {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/magical-ring-proposal/assets', filename))
    assert.equal(data.subarray(0, 4).toString(), 'RIFF')
    assert.equal(data.subarray(8, 12).toString(), 'WEBP')
    assert.ok(data[20] & 0x10)
  }
})

test('artwork leases share textures and release late results after a failed or removed effect', async () => {
  const pending = []
  const THREE = {TextureLoader: class { load(url, done, progress, fail) {
    const texture = {image: {width: 256, height: 256}, disposed: 0, dispose() { this.disposed++ }}
    pending.push({texture, done, fail}); return texture
  } }}
  const a = acquireProposalAssets(THREE, {}, 'https://example.com/proposal', 768, ['closed', 'open'])
  const b = acquireProposalAssets(THREE, {}, 'https://example.com/proposal', 768, ['closed'])
  assert.equal(pending.length, 2)
  const failure = assert.rejects(a.promise, /missing/)
  a.release()
  pending[1].fail(new Error('missing'))
  pending[0].done(pending[0].texture)
  await failure; await b.promise
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 0)
  assert.equal(pending[1].texture.disposed, 1)
  b.release(); b.release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending[0].texture.disposed, 1)
})
