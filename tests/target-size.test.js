const {test} = require('node:test')
const assert = require('node:assert/strict')
const {getShapeVideoScale, getTrackedTargetSize, getTargetVideoSize, getTargetVideoLayout} = require('../src/target-size')

test('default shape scale covers a narrow target rim and accepts explicit calibration', () => {
  for (const value of [null, undefined, '', '0', '-1', 'invalid', 'Infinity']) {
    assert.equal(getShapeVideoScale(value), 1.1)
  }
  assert.equal(getShapeVideoScale('1'), 1)
  assert.equal(getShapeVideoScale('1.12'), 1.12)
  const properties = {originalWidth: 1000, originalHeight: 1000,
    width: 750, height: 1000, left: 125, top: 0}
  const tracked = {width: 0.75, height: 1}
  assert.deepEqual(getTargetVideoLayout({shape: 'circle'}, tracked, properties, getShapeVideoScale(null)),
    {width: 1.1, height: 1.1, x: 0, y: 0})
  assert.deepEqual(getTargetVideoLayout({}, tracked, properties, getShapeVideoScale(null)),
    {width: 0.75 * 1.04, height: 1.04, x: 0, y: 0})
})

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

test('circle covers the original square beyond the centered portrait tracking crop', () => {
  const layout = getTargetVideoLayout({shape: 'circle'}, {width: 0.75, height: 1}, {
    originalWidth: 1200, originalHeight: 1200, width: 900, height: 1200, left: 150, top: 0,
  })
  assert.deepEqual(layout, {width: 1, height: 1, x: 0, y: 0})
})

test('off-center tracking crops translate video to the original image center', () => {
  assert.deepEqual(getTargetVideoLayout({shape: 'circle'}, {width: 0.6, height: 0.8}, {
    originalWidth: 1000, originalHeight: 1000, width: 600, height: 800, left: 100, top: 50,
  }), {width: 1, height: 1, x: 0.1, y: -0.05})
})

test('full square uploads need no enlargement and rectangular playback keeps its crop', () => {
  const fullCrop = {originalWidth: 1000, originalHeight: 1000, width: 1000, height: 1000}
  assert.deepEqual(getTargetVideoLayout({shape: 'circle'}, {width: 1, height: 1}, fullCrop),
    {width: 1, height: 1, x: 0, y: 0})
  const cropped = {...fullCrop, width: 750, left: 125}
  assert.deepEqual(getTargetVideoLayout({}, {width: 0.75, height: 1}, cropped),
    {width: 0.75 * 1.04, height: 1.04, x: 0, y: 0})
})

test('invalid crop metadata does not enlarge or shift the video', () => {
  for (const properties of [null, {}, {width: 0},
    {originalWidth: 1000, originalHeight: 1000, width: 750, height: 1000, left: 500}]) {
    assert.deepEqual(getTargetVideoLayout({shape: 'circle'}, {width: 0.75, height: 1}, properties),
      {width: 0.75, height: 0.75, x: 0, y: 0})
  }
})

test('optional calibration changes shape diameter without changing its center or rectangular videos', () => {
  const properties = {originalWidth: 1000, originalHeight: 1000,
    width: 600, height: 800, left: 100, top: 50}
  const tracked = {width: 0.6, height: 0.8}
  assert.deepEqual(getTargetVideoLayout({shape: 'circle'}, tracked, properties, 1.3),
    {width: 1.3, height: 1.3, x: 0.1, y: -0.05})
  assert.deepEqual(getTargetVideoLayout({}, tracked, properties, 1.3),
    {width: 0.6 * 1.04, height: 0.8 * 1.04, x: 0, y: 0})
  for (const scale of [-1, NaN, Infinity, 0]) {
    assert.equal(getTargetVideoLayout({shape: 'circle'}, tracked, properties, scale).width, 1)
  }
})
