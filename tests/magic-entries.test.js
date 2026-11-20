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

test('MATCHED data preserves per-target effect settings and backend banner text', () => {
  const entries = getMagicEntries({status: 'MATCHED', data: {
    enableConfetti: true, enableBanner: true, bannerMessage: 'Default', bannerType: 0,
    videoUrlV1: [
      {...videoEntry, enableConfetti: false, enableBanner: true, bannerMessage: 'Happy Birthday!\nMia'},
      {...videoEntry, targetName: 'second', enableConfetti: true, enableBanner: false, bannerMessage: ''},
      {...videoEntry, targetName: 'third', enableBanner: true, bannerType: 2},
    ],
  }})
  assert.equal(entries[0].enableConfetti, false)
  assert.equal(entries[0].enableBanner, true)
  assert.equal(entries[0].bannerMessage, 'Happy Birthday!\nMia')
  assert.equal(entries[0].birthdayText, entries[0].bannerMessage)
  assert.equal(entries[0].bannerType, '0')
  assert.equal(entries[1].enableConfetti, true)
  assert.equal(entries[1].enableBanner, false)
  assert.equal(entries[1].birthdayText, '')
  assert.equal(entries[2].bannerType, '2')
})

test('effect flags recognize false boolean, number, and string values without truthiness bugs', () => {
  for (const value of [false, 0, 'false', 'FALSE', '0', ' false ', '']) {
    const [entry] = getMagicEntries({videoUrlV1: [{...videoEntry, enableConfetti: value, enableBanner: value}]})
    assert.equal(entry.enableConfetti, false, String(value))
    assert.equal(entry.enableBanner, false, String(value))
  }
  for (const value of [true, 1, 'true', 'TRUE', '1', ' true ']) {
    const [entry] = getMagicEntries({videoUrlV1: [{...videoEntry, enableConfetti: value, enableBanner: value}]})
    assert.equal(entry.enableConfetti, true, String(value))
    assert.equal(entry.enableBanner, true, String(value))
  }
  const [legacy] = getMagicEntries({videoUrlV1: [videoEntry]})
  assert.equal(legacy.enableConfetti, true)
  assert.equal(legacy.enableBanner, true)
  assert.equal(legacy.bannerType, '0')
  assert.equal(legacy.bannerDesignType, 0)
})

test('banner categories and design IDs inherit response defaults with per-entry overrides', () => {
  const entries = getMagicEntries({status: 'MATCHED', data: {
    bannerType: 6, bannerDesignType: '12', videoUrlV1: [
      {...videoEntry},
      {...videoEntry, targetName: 'second', bannerType: 0, bannerDesignType: 0},
      {...videoEntry, targetName: 'third', bannerType: '3', bannerDesignType: ' 2 '},
    ],
  }})
  assert.deepEqual(entries.map(({bannerType, bannerDesignType}) => [bannerType, bannerDesignType]),
    [['6', 12], ['0', 0], ['3', 2]])
})

test('missing design IDs default to zero and invalid IDs cannot select design zero', () => {
  for (const value of [undefined, null]) {
    const [entry] = getMagicEntries({videoUrlV1: [{...videoEntry, bannerDesignType: value}]})
    assert.equal(entry.bannerDesignType, 0)
  }
  for (const value of [-1, 0.5, 'invalid', '', true, {}, Number.MAX_SAFE_INTEGER + 1]) {
    const [entry] = getMagicEntries({videoUrlV1: [{...videoEntry, bannerDesignType: value}]})
    assert.equal(entry.bannerDesignType, null)
  }
})

test('entry banner text takes priority over response text and preserves blank messages', () => {
  for (const bannerMessage of ['A new message', '']) {
    const [entry] = getMagicEntries({birthdayText: 'Old default', bannerMessage: 'New default',
      videoUrlV1: [{...videoEntry, birthdayText: 'Old entry', bannerMessage}]})
    assert.equal(entry.birthdayText, bannerMessage)
  }
})

test('gift settings merge response defaults and entry overrides without changing another target', () => {
  const entries = getMagicEntries({bannerOptions: {duration: 5, size: 1, particleCount: 64}, videoUrlV1: [
    {...videoEntry, bannerOptions: {duration: 8}}, {...videoEntry, targetName: 'other'},
  ]})
  assert.deepEqual(entries[0].bannerOptions, {duration: 8, size: 1, particleCount: 64})
  assert.deepEqual(entries[1].bannerOptions, {duration: 5, size: 1, particleCount: 64})
})
