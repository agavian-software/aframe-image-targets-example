const {getVideoSurfaceSize} = require('./video-mask')

const getShapeVideoScale = (value) => {
  const scale = Number(value)
  // Cover the narrow printed rim and small tracking inaccuracies by default.
  return Number.isFinite(scale) && scale > 0 ? scale : 1.1
}

const getTrackedTargetSize = (geometry = {}) => {
  const {scaledWidth: width, scaledHeight: height} = geometry || {}
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  // XR Extras applies geometry.scale on the parent. These dimensions are
  // already in the child's coordinate system: do not apply scale again.
  return {width, height}
}

const getTargetVideoSize = (config, targetSize, shapeScale = 1) => {
  const validScale = Number.isFinite(shapeScale) && shapeScale > 0 ? shapeScale : 1
  const overscan = config.maskUrl || config.shape ? validScale : 1
  return getVideoSurfaceSize(config, targetSize.width * overscan, targetSize.height * overscan)
}

const getTargetVideoLayout = (config, trackedSize, properties = {}, shapeScale = 1) => {
  const {width, height, originalWidth, originalHeight, left = 0, top = 0} = properties || {}
  if (!config.maskUrl && !config.shape) {
    // Fit playback inside the tracked image. Expanding to the original upload
    // includes borders/crop margins and can spill outside the physical target.
    const aspect = Number.isFinite(originalWidth) && originalWidth > 0 &&
      Number.isFinite(originalHeight) && originalHeight > 0
      ? originalWidth / originalHeight : trackedSize.width / trackedSize.height
    const fittedWidth = Math.min(trackedSize.width, trackedSize.height * aspect)
    return {width: fittedWidth, height: fittedWidth / aspect, x: 0, y: 0}
  }
  const validCrop = [width, height, originalWidth, originalHeight].every(
    value => Number.isFinite(value) && value > 0) &&
    Number.isFinite(left) && Number.isFinite(top) && left >= 0 && top >= 0 &&
    left + width <= originalWidth && top + height <= originalHeight
  if (!validCrop) {
    // Even without crop offsets, the uploaded image determines the aspect.
    // Keep the tracked width as the size reference rather than stretching a
    // square upload across a landscape recognition region.
    const fullSize = Number.isFinite(originalWidth) && originalWidth > 0 &&
      Number.isFinite(originalHeight) && originalHeight > 0
      ? {width: trackedSize.width, height: trackedSize.width * originalHeight / originalWidth}
      : trackedSize
    return Object.assign(getTargetVideoSize(config, fullSize, shapeScale), {x: 0, y: 0})
  }

  // XR8 anchors the tracking crop. Map the full uploaded image back into
  // that coordinate system, including any off-center crop translation.
  const unitsPerPixelX = trackedSize.width / width
  // Image pixels have one uniform scale. Independent X/Y scales can turn
  // a square original into a landscape plane when recognition is resized.
  const unitsPerPixelY = unitsPerPixelX
  const fullSize = {
    width: originalWidth * unitsPerPixelX,
    height: originalHeight * unitsPerPixelY,
  }
  return Object.assign(getTargetVideoSize(config, fullSize, shapeScale), {
    x: (originalWidth / 2 - left - width / 2) * unitsPerPixelX,
    // Image pixels increase downwards; the target's local Y increases upwards.
    y: -(originalHeight / 2 - top - height / 2) * unitsPerPixelY || 0,
  })
}

module.exports = {getShapeVideoScale, getTrackedTargetSize, getTargetVideoSize, getTargetVideoLayout}
