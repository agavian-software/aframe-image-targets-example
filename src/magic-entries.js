const getMagicEntries = (response) => {
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
      return Object.assign({}, item, {shape, maskUrl, maskMode})
    })
}

module.exports = {getMagicEntries}
