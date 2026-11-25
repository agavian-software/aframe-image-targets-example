const {normalizeBannerDesignType} = require('./animations/banner-registry')
const {DEFAULT_MESSAGE: DEFAULT_LOVE_MESSAGE} = require('./animations/flying-love-letter/text')
const {DEFAULT_MESSAGE: DEFAULT_APOLOGY_MESSAGE} = require('./animations/broken-heart-healing/text')
const {getDefaultMessage: getTeddyMessage} = require('./animations/teddy-bear-sorry/text')
const {getDefaultMessage: getSantaMessage} = require('./animations/santa-flying-reindeer/text')
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
      const decorType = normalizeBannerDesignType(item.decorType ?? response.decorType ?? 0) ?? -1
      const enableBanner = getEffectEnabled(item.enableBanner ?? response.enableBanner)
      const bannerType = String(item.bannerType ?? response.bannerType ?? 0).trim()
      const category = normalizeBannerDesignType(bannerType)
      const bannerDesignType = normalizeBannerDesignType(item.bannerDesignType ?? response.bannerDesignType ?? 0)
      const bannerOptions = {...getBannerOptions(response.bannerOptions), ...getBannerOptions(item.bannerOptions)}
      const defaultMessage = category === 1 && bannerDesignType === 0
        ? 'Will You Marry Me? ❤️' : 'Happy Birthday!'
      const designMessage = category === 1 && bannerDesignType === 1
        ? DEFAULT_LOVE_MESSAGE : defaultMessage
      const effectMessage = category === 1 && bannerDesignType === 2
        ? 'You Stole My Heart ❤️' : designMessage
      const categoryMessage = category === 2 && [0, 1, 2].includes(bannerDesignType)
        ? 'Happy Wedding Anniversary' : effectMessage
      const apologyMessage = category === 3 && bannerDesignType === 0
        ? DEFAULT_APOLOGY_MESSAGE : categoryMessage
      const teddyMessage = category === 3 && bannerDesignType === 1
        ? getTeddyMessage(bannerOptions.messageLines) : apologyMessage
      const holidayMessage = category === 6 && bannerDesignType === 1
        ? getSantaMessage(bannerOptions.messageLines) : teddyMessage
      const bannerMessage = item.bannerMessage ?? item.birthdayText ??
        response.bannerMessage ?? response.birthdayText ?? holidayMessage
      return Object.assign({}, item, {
        shape, maskUrl, maskMode, enableConfetti, decorType, enableBanner, bannerType, bannerDesignType, bannerOptions,
        bannerMessage: String(bannerMessage), birthdayText: String(bannerMessage),
      })
    })
}

module.exports = {getMagicEntries}
