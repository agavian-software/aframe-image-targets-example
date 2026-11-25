const {test} = require('node:test')
const assert = require('node:assert/strict')
const {normalizeOptions} = require('../src/animations/teddy-bear-sorry/TeddyBearSorryEffect')
const {getTeddyFrame, getTeddyLayout, getTeddyPose} = require('../src/animations/teddy-bear-sorry/timeline')
const {drawTeddyMessage} = require('../src/animations/teddy-bear-sorry/text')

test('teddy walks, kneels, offers the rose and unfolds the letter before playing video', () => {
  const options = normalizeOptions()
  const frame = time => getTeddyFrame(time, options)
  assert.equal(frame(2.5).walking, 1)
  assert.equal(frame(3.5).kneeling, 1)
  assert.ok(frame(4.4).roseAlpha > 0)
  assert.equal(frame(5.75).envelope, 1)
  assert.ok(frame(6.38).burst > 0)
  assert.ok(frame(6.75).videoOpacity > 0 && frame(6.75).videoOpacity < 1)
  assert.equal(frame(6.99).videoReady, false)
  assert.equal(frame(7).videoReady, true)
  assert.equal(frame(7).unfolding, 1)
  assert.equal(frame(9).banner, 1)
  assert.equal(frame(12).ambient, 1)
  assert.equal(getTeddyFrame(0, normalizeOptions({revealVideo: false})).videoOpacity, 1)
})

test('early opening changes the letter timing while video still starts at the scheduled reveal', () => {
  const options = normalizeOptions({interactiveLetter: true})
  assert.equal(getTeddyFrame(5.65, options).canOpen, true)
  assert.equal(getTeddyFrame(5.66, options, 5.65).canOpen, false)
  assert.ok(getTeddyFrame(6, options, 5.65).unfolding > 0)
  assert.equal(getTeddyFrame(6.4, options, 5.65).videoReady, false)
  assert.equal(getTeddyFrame(7, options, 5.65).videoReady, true)
})

test('default layout keeps the settled teddy, letter, and banner clear of portrait and landscape targets', () => {
  for (const [width, pictureHeight] of [[0.8, 1.3], [1.3, 0.55]]) {
    const options = normalizeOptions({width, pictureHeight, boundsBottom: -pictureHeight / 2 - 0.13})
    const layout = getTeddyLayout(options, {letter: 1.03, banner: 1.5})
    const pose = getTeddyPose(11, getTeddyFrame(11, options), layout, options)
    assert.ok(pose.foot + pose.kneelHeight < layout.bounds.bottom)
    assert.ok(layout.letterY + layout.letterHeight / 2 < layout.bounds.bottom)
    assert.ok(layout.bannerY + layout.bannerHeight / 2 < Math.min(pose.foot, layout.letterY - layout.letterHeight / 2))
  }
})

test('banner canvas draws multiple lines and names and caps long messages', () => {
  const lines = []
  const ctx = {
    measureText(value) { return {width: value.length * Number(this.font.match(/(\d+)px/)[1]) * 0.53} },
    fillText(value, x, y) { lines.push({value, x, y}) },
  }
  const canvas = {getContext: () => ctx}
  drawTeddyMessage(canvas, normalizeOptions({message: 'I’m sorry ❤️\nPlease forgive me.', recipientName: 'Sam', senderName: 'Alex'}))
  assert.deepEqual(lines.map(line => line.value), ['I’m sorry ❤️', 'For Sam', 'Please forgive me.', 'With love, Alex'])
  assert.ok(lines.every(({x, y}) => x === 512 && y > 0 && y < canvas.height))
  lines.length = 0
  drawTeddyMessage(canvas, normalizeOptions({message: 'x'.repeat(150), maxMessageLength: 32}))
  assert.equal(Array.from(lines.map(line => line.value).join('')).length, 32)
  assert.match(lines.at(-1).value, /…$/)
})
