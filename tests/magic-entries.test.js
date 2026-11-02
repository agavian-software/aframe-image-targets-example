const {test} = require('node:test')
const assert = require('node:assert/strict')
const {getMagicEntries} = require('../src/magic-entries')
const {getVideoMaskConfig, getVideoSurfaceSize} = require('../src/video-mask')

const videoEntry = {targetName: 'gift', videoUrl: 'portrait.mp4'}

test('shape ID 9 inherits response custom mask URLs for array and single video entries', () => {
  for (const frameShape of [9, '9']) {
    for (const field of ['customShapeUrl', 'maskUrl']) {
      for (const videoUrlV1 of [[videoEntry], videoEntry]) {
        const entries = getMagicEntries({frameShape, [field]: '/uploads/square.png', videoUrlV1})
        assert.equal(entries.length, 1)
        const config = getVideoMaskConfig(entries[0], url => `https://cdn.example${url}`)
        assert.equal(config.maskUrl, 'https://cdn.example/uploads/square.png')
        assert.equal(config.shape, '')
        assert.deepEqual(getVideoSurfaceSize(config, 2, 1), {width: 1, height: 1})
      }
    }
  }
})

test('each entry custom mask overrides response defaults, including nested URLs and modes', () => {
  for (const local of [{maskUrl: 'local.png'}, {customShapeUrl: 'local.png'},
    {shape: {customShapeUrl: 'local.png', maskMode: 'alpha'}}]) {
    const [entry] = getMagicEntries({frameShape: 9, maskUrl: 'default.png', maskMode: 'luminance',
      videoUrlV1: [{...videoEntry, ...local}]})
    const config = getVideoMaskConfig(entry)
    assert.equal(config.maskUrl, 'local.png')
    assert.equal(config.maskMode, local.shape ? 'alpha' : 'luminance')
  }
})

test('response shape objects retain their custom URLs when entries contain numeric ID 9', () => {
  const [entry] = getMagicEntries({frameShape: {customShapeUrl: 'square.png', maskMode: 'alpha'},
    videoUrlV1: [{...videoEntry, shape: 9}]})
  assert.deepEqual(getVideoMaskConfig(entry), {maskUrl: 'square.png', maskMode: 'alpha', shape: ''})
})

test('shape ID 9 without a URL fails instead of falling back to a landscape rectangle', () => {
  for (const shape of [9, '9']) {
    const [entry] = getMagicEntries({frameShape: shape, videoUrlV1: [videoEntry]})
    assert.throws(() => getVideoMaskConfig(entry), /shape 9 requires/)
  }
  assert.throws(() => getVideoMaskConfig({shape: {arShapeId: 9, shapeName: 'SquareMask'}}),
    /shape 9 requires/)
  assert.deepEqual(getVideoMaskConfig({shape: 0}), {maskUrl: '', maskMode: 'auto', shape: ''})
})

test('invalid or empty backend video entries remain ignored', () => {
  for (const response of [null, {}, {videoUrlV1: []},
    {videoUrlV1: [null, 'video.mp4', {targetName: 'gift'}]}]) {
    assert.deepEqual(getMagicEntries(response), [])
  }
})
