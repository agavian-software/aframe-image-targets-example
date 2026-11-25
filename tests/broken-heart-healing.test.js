const {test} = require('node:test')
const assert = require('node:assert/strict')
const {DEFAULT_TIMINGS, DEFAULT_PATH, getHealingFrame, getStitchPoint} =
  require('../src/animations/broken-heart-healing/timeline')

test('heart timeline reveals the first video frame during opening and starts playback after it', () => {
  const at = time => getHealingFrame(time, DEFAULT_TIMINGS)
  assert.equal(at(1.5).needleAlpha, 0)
  assert.equal(at(2.5).approach, 1)
  assert.ok(at(4).stitch > 0)
  assert.equal(at(5.5).repair, 1)
  assert.equal(at(6.5).heal, 1)
  assert.equal(at(6.5).videoOpacity, 0)
  assert.ok(at(7.25).videoOpacity > 0 && at(7.25).videoOpacity < 1)
  assert.equal(at(7.99).videoReady, false)
  assert.equal(at(8).videoReady, true)
  assert.equal(at(8).doorAlpha, 0)
  assert.equal(at(8).videoOpacity, 1)
  assert.equal(at(9.5).banner, 1)
  assert.equal(at(20).ambientTime, 12)
  assert.equal(getHealingFrame(8, {...DEFAULT_TIMINGS, doorOpen: 2.5}).videoReady, false)
})

test('each stitch begins and ends at its configured path points', () => {
  for (let i = 0; i < DEFAULT_PATH.length - 1; i++) {
    const [x, y] = DEFAULT_PATH[i]
    const [nextX, nextY] = DEFAULT_PATH[i + 1]
    assert.deepEqual(getStitchPoint(DEFAULT_PATH, i, 0), {x, y})
    const end = getStitchPoint(DEFAULT_PATH, i, 1)
    assert.ok(Math.abs(end.x - nextX) < 1e-12)
    assert.ok(Math.abs(end.y - nextY) < 1e-12)
  }
})
