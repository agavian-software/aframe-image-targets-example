const {test} = require('node:test')
const assert = require('node:assert/strict')
const {normalizeOptions, getFrame, getLayout} = require('../src/animations/new-year-2027-countdown/timeline')
const {getNewYearPlacement} = require('../src/animations/new-year-2027-countdown')

test('the default timeline sees every digit, flashes at midnight, and reaches the final loop', () => {
  const options = normalizeOptions()
  const frame = time => getFrame(time, options)
  assert.ok(frame(0.75).clock > 0)
  assert.equal(frame(1.49).digit, null)
  assert.deepEqual([1.5, 2.3, 3.1, 3.9, 4.7, 5.5].map(time => frame(time).digit), [5, 4, 3, 2, 1, 0])
  assert.ok(frame(2.3).countdownTrail > frame(2.7).countdownTrail)
  assert.equal(frame(5.49).fireworks, 0)
  assert.equal(frame(5.5).flash, 1)
  assert.ok(frame(5.7).fireworks > 0.9)
  assert.equal(frame(6.49).year, 0)
  assert.ok(frame(7.17).year > 0 && frame(7.17).yearScale > 1 && frame(7.17).yearTrail > 0)
  assert.equal(frame(7.79).banner, 0)
  assert.ok(frame(8.4).banner > 0)
  assert.equal(frame(9).banner, 1)
  assert.equal(frame(8.99).confetti, 0)
  assert.equal(frame(30).confetti, 1)
  assert.equal(frame(30).year, 1)
})

test('the phases use custom durations and keep all five digits', () => {
  const o = normalizeOptions({timings: {clockEntrance: 0.5, countdownSequence: 2.5, midnightFlash: 0.5,
    yearReveal: 0.5, bannerReveal: 0.5}})
  const frame = time => getFrame(time, o)
  assert.deepEqual([0.7, 1.2, 1.7, 2.2, 2.7, 3].map(time => frame(time).digit), [5, 4, 3, 2, 1, 0])
  assert.equal(frame(3.49).year, 0)
  assert.ok(frame(3.7).year > 0)
  assert.equal(frame(4.49).confetti, 0)
  assert.ok(frame(4.7).confetti > 0)
})

test('headers and banner clear the combined bounds of the photo and overscanned video', () => {
  for (const size of [{width: 0.8, height: 1.3}, {width: 1.3, height: 0.55}]) {
    const properties = {width: 150, height: 100, originalWidth: 210, originalHeight: 150, left: 20, top: 25}
    const video = {x: -0.047, y: 0.1, width: size.width * 1.5, height: size.height * 1.65}
    const placement = getNewYearPlacement(size, properties, video)
    const l = getLayout(normalizeOptions({width: placement.width, ...placement.componentOptions}))
    assert.ok(l.clockY - l.clockWidth * 0.5 > l.top)
    assert.ok(l.countdownY - l.haloWidth * 0.5 > l.top)
    assert.ok(l.yearY - l.yearWidth * 0.23 > l.top)
    assert.ok(l.bannerY + l.bannerWidth * 0.5 < l.bottom)
    assert.ok(l.top * placement.width + placement.y >= video.y + video.height / 2 - 1e-12)
    assert.ok(l.bottom * placement.width + placement.y <= video.y - video.height / 2 + 1e-12)
  }
})
