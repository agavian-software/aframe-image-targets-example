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
    if (![1, 2, 3].includes(category)) assert.equal(getBannerAnimation(category, 0), null)
    if (![1, 2, 3, 6].includes(category)) assert.equal(getBannerAnimation(String(category), '1'), null)
  }
  for (const design of [5, 15, 100]) assert.equal(getBannerAnimation(0, design), null)
})

test('category six / design one selects Santa without a video reveal gate', () => {
  const definition = getBannerAnimation('6', '1')
  assert.equal(definition.id, 'santa-flying-reindeer')
  assert.equal(definition.component, 'magic-santa-flying-reindeer')
  assert.equal(Boolean(definition.revealsVideo || definition.defersVideoPlayback), false)
  const {register, getPlacement, getOptions} = definition.load()
  assert.equal(typeof register, 'function')
  assert.equal(typeof getPlacement, 'function')
  const options = getOptions({enabled: 'false', positions: {giftX: 0.2}, timings: {giftDrop: 1.3}})
  assert.equal(options.enabled, false)
  assert.equal(options.giftX, 0.2)
  assert.equal(options.giftDrop, 1.3)
})

test('category three / design zero reveals and defers the apology video', () => {
  const definition = getBannerAnimation('3', '0')
  assert.equal(definition.id, 'broken-heart-healing')
  assert.equal(definition.revealsVideo, true)
  assert.equal(definition.defersVideoPlayback, true)
  const {register, getInitialVideoOpacity} = definition.load()
  assert.equal(typeof register, 'function')
  assert.equal(getInitialVideoOpacity(), 0)
  assert.equal(getInitialVideoOpacity({enabled: 'false'}), 1)
})

test('category three / design one selects the teddy with an optional video reveal', () => {
  const definition = getBannerAnimation('3', '1')
  assert.equal(definition.id, 'teddy-bear-sorry')
  assert.equal(definition.component, 'magic-teddy-bear-sorry')
  assert.equal(definition.defersVideoPlayback, true)
  assert.equal(definition.load().getInitialVideoOpacity(), 0)
  assert.equal(definition.load().getInitialVideoOpacity({revealVideo: 'false'}), 1)
  assert.equal(definition.load().getInitialVideoOpacity({enabled: false}), 1)
  assert.equal(getBannerAnimation(3, 0).id, 'broken-heart-healing')
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

test('category one / design two selects Cupid while decorative designs leave video opacity unchanged', () => {
  const definition = getBannerAnimation('1', '2')
  assert.equal(definition.id, 'cupid-heart-reveal')
  assert.equal(definition.component, 'magic-cupid-reveal')
  assert.equal(definition.revealsVideo, true)
  assert.equal(definition.load().getInitialVideoOpacity(), 0)
  for (const [type, design] of [[0, 0], [0, 4], [1, 0], [1, 1]]) assert.notEqual(getBannerAnimation(type, design).revealsVideo, true)
})

test('category two / design one selects the interactive wedding arch with its initial video gate', () => {
  const definition = getBannerAnimation('2', '1')
  assert.equal(definition.id, 'magical-wedding-flower-arch'); assert.equal(definition.component, 'magic-wedding-flower-arch')
  assert.equal(definition.revealsVideo, true); assert.equal(definition.load().getInitialVideoOpacity(), 0)
  assert.equal(typeof definition.load().register, 'function'); assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(getBannerAnimation(2, 0).id, 'golden-rings-anniversary')
})

test('category two / design two selects the temple arch while retaining previous anniversary designs', () => {
  const definition = getBannerAnimation('2', '2')
  assert.equal(definition.id, 'traditional-south-indian-wedding-arch')
  assert.equal(definition.component, 'magic-south-indian-wedding-arch')
  assert.equal(definition.revealsVideo, true); assert.equal(definition.load().getInitialVideoOpacity(), 0)
  assert.equal(typeof definition.load().register, 'function'); assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(getBannerAnimation(2, 0).id, 'golden-rings-anniversary'); assert.equal(getBannerAnimation(2, 1).id, 'magical-wedding-flower-arch')
})

test('category two / design zero selects anniversary rings without gating the video', () => {
  const definition = getBannerAnimation('2', '0')
  assert.equal(definition.id, 'golden-rings-anniversary')
  assert.equal(definition.component, 'magic-golden-rings-anniversary')
  assert.notEqual(definition.revealsVideo, true)
  assert.equal(typeof definition.load().register, 'function')
  assert.equal(typeof definition.load().getPlacement, 'function')
  assert.equal(typeof definition.load().getOptions, 'function')
  assert.equal(getBannerAnimation(0, 0).id, 'birthday-banner')
  assert.equal(getBannerAnimation(1, 0).id, 'magical-ring-proposal')
  assert.equal(getBannerAnimation(1, 1).id, 'flying-love-letter')
  assert.equal(getBannerAnimation(1, 2).id, 'cupid-heart-reveal')
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
