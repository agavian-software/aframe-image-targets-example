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
  }),
  1: Object.freeze({}),
  2: Object.freeze({}),
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
