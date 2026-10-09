const {getVideoSurfaceSize} = require('./video-mask')

const getTrackedTargetSize = (geometry = {}) => {
  const {scaledWidth: width, scaledHeight: height} = geometry || {}
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  // XR Extras applies geometry.scale on the parent. These dimensions are
  // already in the child's coordinate system: do not apply scale again.
  return {width, height}
}

const getTargetVideoSize = (config, targetSize) => {
  const overscan = config.maskUrl || config.shape ? 1 : 1.04
  return getVideoSurfaceSize(config, targetSize.width * overscan, targetSize.height * overscan)
}

module.exports = {getTrackedTargetSize, getTargetVideoSize}
