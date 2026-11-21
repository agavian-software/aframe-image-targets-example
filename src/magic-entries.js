const {normalizeBannerDesignType} = require('./animations/banner-registry')
const {DEFAULT_MESSAGE: DEFAULT_LOVE_MESSAGE} = require('./animations/flying-love-letter/text')
const getBannerOptions = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const getEffectEnabled = (value, fallback = true) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') return ['true', '1'].includes(value.trim().toLowerCase())
  return value === true || value === 1
}

const getMagicEntries = (response) => {
  // The scanner normally unwraps MATCHED.data before dispatching. Also accept
  // the original WebSocket envelope when processing a response directly.
  response = response?.videoUrlV1 != null ? response : response?.data ?? response
  const value = response?.videoUrlV1
  return (Array.isArray(value) ? value : value ? [value] : [])
    .filter(item => item && Object(item) === item && item.targetName && item.videoUrl)
    .map((item) => {
      const shape = item.shape ?? item.frameShape ?? response.frameShape
      const custom = shape && Object(shape) === shape ? shape : {}
      const responseShape = response.frameShape
      const responseCustom = responseShape && Object(responseShape) === responseShape ? responseShape : {}
      // The backend can put the custom mask beside videoUrlV1. Keep local
      // entry masks ahead of response defaults, including nested shape URLs.
      const maskUrl = item.maskUrl || item.customShapeUrl || custom.customShapeUrl ||
        response.maskUrl || response.customShapeUrl || responseCustom.customShapeUrl || ''
      const maskMode = item.maskMode || custom.maskMode || response.maskMode ||
        responseCustom.maskMode || 'auto'
      const enableConfetti = getEffectEnabled(item.enableConfetti ?? response.enableConfetti)
      const enableBanner = getEffectEnabled(item.enableBanner ?? response.enableBanner)
      const bannerType = String(item.bannerType ?? response.bannerType ?? 0).trim()
      const bannerDesignType = normalizeBannerDesignType(item.bannerDesignType ?? response.bannerDesignType ?? 0)
      const defaultMessage = normalizeBannerDesignType(bannerType) === 1 && bannerDesignType === 0
        ? 'Will You Marry Me? ❤️' : 'Happy Birthday!'
      const designMessage = normalizeBannerDesignType(bannerType) === 1 && bannerDesignType === 1
        ? DEFAULT_LOVE_MESSAGE : defaultMessage
      const effectMessage = normalizeBannerDesignType(bannerType) === 1 && bannerDesignType === 2
        ? 'You Stole My Heart ❤️' : designMessage
      const bannerMessage = item.bannerMessage ?? item.birthdayText ??
        response.bannerMessage ?? response.birthdayText ?? effectMessage
      const bannerOptions = {...getBannerOptions(response.bannerOptions), ...getBannerOptions(item.bannerOptions)}
      return Object.assign({}, item, {
        shape, maskUrl, maskMode, enableConfetti, enableBanner, bannerType, bannerDesignType, bannerOptions,
        bannerMessage: String(bannerMessage), birthdayText: String(bannerMessage),
      })
    })
}

module.exports = {getMagicEntries}
