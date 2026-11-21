const {test} = require('node:test')
const assert = require('node:assert/strict')
const {BANNER_ANIMATIONS, getBannerAnimation} = require('../src/animations/banner-registry')

test('category zero / design zero selects the existing birthday animation', () => {
  const expected = BANNER_ANIMATIONS[0][0]
  assert.equal(getBannerAnimation(), expected)
  for (const category of [0, '0', ' 0 ']) {
    for (const design of [0, '0', ' 0 ']) {
      assert.equal(getBannerAnimation(category, design), expected)
    }
  }
  assert.equal(expected.id, 'birthday-banner')
  assert.equal(expected.component, 'magic-birthday-banner')
  const animation = expected.load()
  assert.equal(typeof animation.register, 'function')
  assert.equal(typeof animation.getPlacement, 'function')
})

test('all seven categories are represented and unmapped pairs have no fallback', () => {
  assert.deepEqual(Object.keys(BANNER_ANIMATIONS), ['0', '1', '2', '3', '4', '5', '6'])
  for (let category = 1; category <= 6; category++) {
    if (category !== 1) assert.equal(getBannerAnimation(category, 0), null)
    if (category !== 1) assert.equal(getBannerAnimation(String(category), '1'), null)
  }
  for (const design of [5, 15, 100]) assert.equal(getBannerAnimation(0, design), null)
})

test('category one / design zero selects the ring proposal without changing birthday designs', () => {
  const definition = getBannerAnimation('1', '0')
  assert.equal(definition.id, 'magical-ring-proposal')
  assert.equal(definition.component, 'magic-ring-proposal')
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(typeof definition.load().getOptions, 'function')
  assert.equal(getBannerAnimation(0, 0).id, 'birthday-banner')
})

test('category one / design one selects the flying letter and preserves proposal and birthday effects', () => {
  const definition = getBannerAnimation('1', '1')
  assert.equal(definition.id, 'flying-love-letter')
  assert.equal(definition.component, 'magic-love-letter')
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(typeof definition.load().getOptions, 'function')
  assert.equal(getBannerAnimation(1, 0).id, 'magical-ring-proposal')
  assert.equal(getBannerAnimation(0, 0).id, 'birthday-banner')
})

test('category one / design two selects Cupid and is the only video-revealing design', () => {
  const definition = getBannerAnimation('1', '2')
  assert.equal(definition.id, 'cupid-heart-reveal')
  assert.equal(definition.component, 'magic-cupid-reveal')
  assert.equal(definition.revealsVideo, true)
  assert.equal(definition.load().getInitialVideoOpacity(), 0)
  for (const [type, design] of [[0, 0], [0, 4], [1, 0], [1, 1]]) assert.notEqual(getBannerAnimation(type, design).revealsVideo, true)
})

test('category zero / design one selects the gift without changing the original design', () => {
  const definition = getBannerAnimation('0', '1')
  assert.equal(definition.id, 'magical-gift-box')
  assert.equal(definition.component, 'magic-gift-box')
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(getBannerAnimation(0, 0).id, 'birthday-banner')
})

test('invalid categories and designs never select the default animation', () => {
  for (const value of [-1, 0.5, NaN, Infinity, '', ' ', 'invalid', true, false, {}, [], null,
    Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(getBannerAnimation(value, 0), null)
    assert.equal(getBannerAnimation(0, value), null)
  }
  for (const category of [7, 8, 100, '7']) assert.equal(getBannerAnimation(category, 0), null)
})

test('category zero / design two selects balloons while preserving designs zero and one', () => {
  const definition = getBannerAnimation('0', '2')
  assert.equal(definition.id, 'balloon-name')
  assert.equal(definition.component, 'magic-balloon-name')
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(getBannerAnimation(0, 0).id, 'birthday-banner')
  assert.equal(getBannerAnimation(0, 1).id, 'magical-gift-box')
})

test('category zero / design three selects the fairy and preserves existing animations', () => {
  const definition = getBannerAnimation('0', '3')
  assert.equal(definition.id, 'fairy-magic-wand')
  assert.equal(definition.component, 'magic-fairy-wand')
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.deepEqual([0, 1, 2].map(design => getBannerAnimation(0, design).id),
    ['birthday-banner', 'magical-gift-box', 'balloon-name'])
})

test('category zero / design four selects the cake and preserves all existing effects', () => {
  const definition = getBannerAnimation('0', '4')
  assert.equal(definition.id, 'interactive-birthday-cake')
  assert.equal(definition.component, 'magic-birthday-cake')
  assert.equal(typeof definition.load().register, 'function')
  assert.deepEqual([0, 1, 2, 3].map(id => getBannerAnimation(0, id).id),
    ['birthday-banner', 'magical-gift-box', 'balloon-name', 'fairy-magic-wand'])
})
