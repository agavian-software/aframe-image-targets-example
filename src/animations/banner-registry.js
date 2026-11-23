// API bannerType (category) -> bannerDesignType (design within that category).
// Add each new animation here; unmapped pairs render no banner.
const BANNER_ANIMATIONS = Object.freeze({
  0: Object.freeze({
    0: Object.freeze({
      id: 'birthday-banner',
      component: 'magic-birthday-banner',
      load: () => {
        const {registerMagicBirthdayBanner, getBirthdayPlacement} = require('./birthday-banner')
        return {register: registerMagicBirthdayBanner, getPlacement: getBirthdayPlacement}
      },
    }),
    1: Object.freeze({
      id: 'magical-gift-box',
      component: 'magic-gift-box',
      load: () => {
        const {registerMagicalGiftBoxEffect, getGiftBoxPlacement, getGiftBoxOptions} = require('./magical-gift-box')
        return {register: registerMagicalGiftBoxEffect, getPlacement: getGiftBoxPlacement, getOptions: getGiftBoxOptions}
      },
    }),
    2: Object.freeze({
      id: 'balloon-name',
      component: 'magic-balloon-name',
      load: () => {
        const {registerBalloonNameEffect, getBalloonPlacement, getBalloonOptions} = require('./balloon-name')
        return {register: registerBalloonNameEffect, getPlacement: getBalloonPlacement, getOptions: getBalloonOptions}
      },
    }),
    3: Object.freeze({
      id: 'fairy-magic-wand',
      component: 'magic-fairy-wand',
      load: () => {
        const {registerFairyMagicWandEffect, getFairyPlacement, getFairyOptions} = require('./fairy-magic-wand')
        return {register: registerFairyMagicWandEffect, getPlacement: getFairyPlacement, getOptions: getFairyOptions}
      },
    }),
    4: Object.freeze({
      id: 'interactive-birthday-cake',
      component: 'magic-birthday-cake',
      load: () => {
        const {registerInteractiveBirthdayCakeEffect, getCakePlacement, getCakeOptions} = require('./interactive-birthday-cake')
        return {register: registerInteractiveBirthdayCakeEffect, getPlacement: getCakePlacement, getOptions: getCakeOptions}
      },
    }),
  }),
  1: Object.freeze({
    0: Object.freeze({
      id: 'magical-ring-proposal',
      component: 'magic-ring-proposal',
      load: () => {
        const {registerMagicalRingProposalEffect, getProposalPlacement, getProposalOptions} = require('./magical-ring-proposal')
        return {register: registerMagicalRingProposalEffect, getPlacement: getProposalPlacement, getOptions: getProposalOptions}
      },
    }),
    1: Object.freeze({
      id: 'flying-love-letter',
      component: 'magic-love-letter',
      load: () => {
        const {registerFlyingLoveLetterEffect, getLoveLetterPlacement, getLoveLetterOptions} = require('./flying-love-letter')
        return {register: registerFlyingLoveLetterEffect, getPlacement: getLoveLetterPlacement, getOptions: getLoveLetterOptions}
      },
    }),
    2: Object.freeze({
      id: 'cupid-heart-reveal', component: 'magic-cupid-reveal', revealsVideo: true,
      load: () => {
        const {registerCupidHeartRevealEffect, getCupidPlacement, getCupidOptions, getInitialVideoOpacity} = require('./cupid-heart-reveal')
        return {register: registerCupidHeartRevealEffect, getPlacement: getCupidPlacement, getOptions: getCupidOptions, getInitialVideoOpacity}
      },
    }),
  }),
  2: Object.freeze({
    0: Object.freeze({
      id: 'golden-rings-anniversary', component: 'magic-golden-rings-anniversary',
      load: () => {
        const {registerGoldenRingsAnniversaryEffect, getAnniversaryPlacement, getAnniversaryOptions} = require('./golden-rings-anniversary')
        return {register: registerGoldenRingsAnniversaryEffect, getPlacement: getAnniversaryPlacement, getOptions: getAnniversaryOptions}
      },
    }),
    1: Object.freeze({
      id: 'magical-wedding-flower-arch', component: 'magic-wedding-flower-arch', revealsVideo: true,
      load: () => {
        const {registerMagicalWeddingFlowerArchEffect, getFlowerArchPlacement, getFlowerArchOptions, getInitialVideoOpacity} = require('./magical-wedding-flower-arch')
        return {register: registerMagicalWeddingFlowerArchEffect, getPlacement: getFlowerArchPlacement, getOptions: getFlowerArchOptions, getInitialVideoOpacity}
      },
    }),
    2: Object.freeze({
      id: 'traditional-south-indian-wedding-arch', component: 'magic-south-indian-wedding-arch', revealsVideo: true,
      load: () => {
        const {registerTraditionalSouthIndianWeddingArchEffect, getTempleArchPlacement, getTempleArchOptions, getInitialVideoOpacity} = require('./traditional-south-indian-wedding-arch')
        return {register: registerTraditionalSouthIndianWeddingArchEffect, getPlacement: getTempleArchPlacement, getOptions: getTempleArchOptions, getInitialVideoOpacity}
      },
    }),
  }),
  3: Object.freeze({}),
  4: Object.freeze({}),
  5: Object.freeze({}),
  6: Object.freeze({}),
})

const normalizeBannerDesignType = (value = 0) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

const getBannerAnimation = (bannerType = 0, bannerDesignType = 0) => {
  const category = normalizeBannerDesignType(bannerType)
  const design = normalizeBannerDesignType(bannerDesignType)
  if (category === null || design === null) return null
  return BANNER_ANIMATIONS[category]?.[design] ?? null
}

module.exports = {BANNER_ANIMATIONS, getBannerAnimation, normalizeBannerDesignType}
