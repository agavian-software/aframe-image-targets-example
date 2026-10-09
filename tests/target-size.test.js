const {test} = require('node:test')
const assert = require('node:assert/strict')
const {getTrackedTargetSize, getTargetVideoSize} = require('../src/target-size')

test('square tracked geometry fills the disc despite portrait recognition raster dimensions', () => {
  const tracked = getTrackedTargetSize({scaledWidth: 1, scaledHeight: 1, scale: 0.35})
  assert.deepEqual(tracked, {width: 1, height: 1})
  assert.deepEqual(getTargetVideoSize({shape: 'circle'}, tracked), {width: 1, height: 1})
  // Previously the 480x640 luminance image resulted in a 0.78 diameter.
  assert.notEqual(getTargetVideoSize({shape: 'circle'}, tracked).width, 480 / 640 * 1.04)
})

test('shape boundaries match the target without rectangular-video overscan', () => {
  const tracked = getTrackedTargetSize({scaledWidth: 0.8, scaledHeight: 1})
  for (const config of [{shape: 'circle'}, {shape: 'heart'}, {maskUrl: 'custom.png'}]) {
    assert.deepEqual(getTargetVideoSize(config, tracked), {width: 0.8, height: 0.8})
  }
  assert.deepEqual(getTargetVideoSize({}, tracked), {width: 0.8 * 1.04, height: 1.04})
})

test('missing or invalid tracking geometry is ignored, preserving the initial size', () => {
  for (const geometry of [undefined, null, {}, {scaledWidth: 1},
    {scaledWidth: 0, scaledHeight: 1}, {scaledWidth: NaN, scaledHeight: 1},
    {scaledWidth: 1, scaledHeight: Infinity}, {scaledWidth: -1, scaledHeight: 1}]) {
    assert.equal(getTrackedTargetSize(geometry), null)
  }
})
