const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {BIRTHDAY_FILES, getBirthdayPlacement, getBirthdayFrame, drawBirthdayText, isBirthdayBannerType} = require('../src/animations/birthday-banner')
const {getTargetVideoLayout} = require('../src/target-size')
const {getMagicEntries} = require('../src/magic-entries')

test('the birthday placement clears both the full uploaded picture and oversized shaped video', () => {
  const size = {width: 0.6, height: 1}
  const crop = {width: 480, height: 800, originalWidth: 1000, originalHeight: 1000, left: 100, top: 100}
  for (const shape of ['', 'circle', 'heart']) {
    const video = getTargetVideoLayout({shape}, size, crop, 1.5)
    const picture = getTargetVideoLayout({}, size, crop)
    const position = getBirthdayPlacement(size, crop, video)
    assert.equal(position.x, picture.x)
    assert.ok(position.y >= video.y + video.height / 2)
    assert.ok(position.y >= picture.y + picture.height / 2)
    assert.ok(position.width >= picture.width)
    assert.ok(position.width >= video.width)
  }
})

test('entrance starts behind the edge and floating keeps the full banner above it', () => {
  for (const width of [0.2, 0.8, 2]) {
    assert.ok(getBirthdayFrame(0, width).y + 0.7 < 0)
    let previousY = -Infinity
    for (let elapsed = 0; elapsed <= 1.7; elapsed += 0.05) {
      const frame = getBirthdayFrame(elapsed, width)
      assert.ok(frame.y >= previousY)
      previousY = frame.y
    }
    for (let elapsed = 1.7; elapsed < 40; elapsed += 0.1) {
      const frame = getBirthdayFrame(elapsed, width)
      assert.ok((frame.y - 0.5 * 470 / 1099) * frame.scale > 0)
    }
  }
})

test('transparent text is centered, wrapped, and shrunk into the banner safe area', () => {
  const calls = []
  const ctx = {
    font: '',
    clearRect: (...args) => calls.push(['clear', ...args]),
    measureText(text) { return {width: text.length * parseInt(this.font.split(' ')[1], 10) * 0.6} },
    fillText: (...args) => calls.push(['text', ...args]),
  }
  const canvas = {getContext: () => ctx}
  drawBirthdayText(canvas, 'Happy Birthday!\nAarav')
  assert.equal(canvas.width, 1024)
  assert.equal(canvas.height, 256)
  assert.equal(ctx.textAlign, 'center')
  assert.deepEqual(calls[0], ['clear', 0, 0, 1024, 256])
  assert.equal(calls.filter(call => call[0] === 'text').length, 2)
  calls.length = 0
  drawBirthdayText(canvas, 'Wishing our wonderful birthday star a very happy birthday filled with magical adventures')
  for (const [, , x, y, maxWidth] of calls.filter(call => call[0] === 'text')) {
    assert.equal(x, 512)
    assert.ok(y > 0 && y < 256)
    assert.equal(maxWidth, 940)
  }
  calls.length = 0
  drawBirthdayText(canvas, '')
  assert.ok(calls.filter(call => call[0] === 'text').every(call => call[1] === ''))
})

test('the child design supports only category zero / design zero', () => {
  for (const value of [0, '0', undefined, null]) assert.equal(isBirthdayBannerType(value), true)
  for (const value of [1, 2, 3, 4, 5, 6, '1', '2']) assert.equal(isBirthdayBannerType(value), false)
  for (const value of [0, '0', undefined]) assert.equal(isBirthdayBannerType(0, value), true)
  for (const value of [1, '1', -1, 0.5, null]) assert.equal(isBirthdayBannerType(0, value), false)
})

test('birthday messages support entry overrides and response defaults', () => {
  const entries = getMagicEntries({birthdayText: 'Happy Birthday!\nMia', videoUrlV1: [
    {targetName: 'left', videoUrl: 'left.mp4'},
    {targetName: 'right', videoUrl: 'right.mp4', birthdayText: 'Happy Birthday, Aarav!'},
  ]})
  assert.equal(entries[0].birthdayText, 'Happy Birthday!\nMia')
  assert.equal(entries[1].birthdayText, 'Happy Birthday, Aarav!')
})

test('all seven exact PNG filenames retain RGBA transparency and original dimensions', () => {
  const expected = [[394, 472], [396, 471], [170, 177], [176, 205], [178, 206], [165, 175], [1099, 470]]
  assert.equal(BIRTHDAY_FILES.length, 7)
  BIRTHDAY_FILES.forEach((filename, index) => {
    const data = fs.readFileSync(path.join(__dirname, '../src/animations/birthday-banner/assets', filename))
    assert.equal(data.subarray(1, 4).toString(), 'PNG')
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], expected[index])
    assert.equal(data[25], 6, `${filename} must retain its alpha channel`)
  })
})
