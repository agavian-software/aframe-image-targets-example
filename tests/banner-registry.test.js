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
    assert.equal(getBannerAnimation(category, 0), null)
    assert.equal(getBannerAnimation(String(category), '1'), null)
  }
  for (const design of [1, 2, 15, 100]) assert.equal(getBannerAnimation(0, design), null)
})

test('invalid categories and designs never select the default animation', () => {
  for (const value of [-1, 0.5, NaN, Infinity, '', ' ', 'invalid', true, false, {}, [], null,
    Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(getBannerAnimation(value, 0), null)
    assert.equal(getBannerAnimation(0, value), null)
  }
  for (const category of [7, 8, 100, '7']) assert.equal(getBannerAnimation(category, 0), null)
})
