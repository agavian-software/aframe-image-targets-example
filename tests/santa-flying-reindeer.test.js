const {test} = require('node:test')
const assert = require('node:assert/strict')
const {normalizeOptions, getSantaLayout, getSantaFrame} = require('../src/animations/santa-flying-reindeer/timeline')
const {getSantaPlacement} = require('../src/animations/santa-flying-reindeer')

test('Santa flies in, pauses for the gift, and leaves the celebration running', () => {
  const options = normalizeOptions()
  const layout = getSantaLayout(options)
  const frame = time => getSantaFrame(time, options, layout)
  assert.ok(frame(0).santaX + layout.santaWidth / 2 < layout.bounds.left)
  assert.ok(frame(1).santaX > frame(0).santaX && frame(1).trail > 0)
  assert.equal(frame(2.2).turn, 0)
  assert.ok(frame(3.2).turn > 0.99)
  assert.ok(Math.abs(frame(3.2).santaX - options.santaX) < 1e-9)
  assert.equal(frame(3.2).giftAlpha, 0)
  assert.ok(frame(3.6).giftAlpha > 0 && frame(3.6).giftY < frame(3.2).giftY)
  assert.ok(frame(4.09).giftY > frame(3.98).giftY)
  assert.equal(frame(4.2).giftAlpha, 1)
  assert.ok(frame(4.55).burst > 0 && frame(4.55).openAlpha > 0)
  assert.equal(frame(5.4).openAlpha, 1)
  assert.equal(frame(5.4).banner, 0)
  assert.ok(frame(6).banner > 0 && frame(6).banner < 1)
  assert.equal(frame(7).banner, 1)
  assert.equal(frame(7).snow, 0)
  assert.equal(frame(9).snow, 1)
  assert.equal(frame(30).snowTime, 23)
  assert.equal(frame(30).santaAlpha, 0)
  assert.equal(frame(30).openAlpha, 1)
})

test('settled artwork clears the shifted, overscanned video on portrait and landscape targets', () => {
  for (const size of [{width: 0.8, height: 1.3}, {width: 1.3, height: 0.55}]) {
    const properties = {width: 150, height: 100, originalWidth: 210, originalHeight: 150, left: 20, top: 25}
    const video = {x: -0.047, y: 0.1, width: size.width * 1.5, height: size.height * 1.65}
    const placement = getSantaPlacement(size, properties, video)
    const options = normalizeOptions({width: placement.width, ...placement.componentOptions})
    const layout = getSantaLayout(options)
    const frame = getSantaFrame(3, options, layout)
    assert.ok(frame.santaY - 0.42 * layout.santaWidth > layout.bounds.top)
    assert.ok(layout.giftGround + 0.96 * layout.openWidth < layout.bounds.bottom)
    assert.ok(layout.bannerY + 0.35 * layout.bannerWidth < layout.bounds.bottom)
    assert.ok((layout.bounds.bottom * placement.width) + placement.y <= video.y - video.height / 2 + 1e-12)
  }
})
