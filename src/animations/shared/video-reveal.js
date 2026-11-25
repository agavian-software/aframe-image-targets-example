const {getTargetVideoLayout} = require('../../target-size')

const getPhotoVideoPlacement = (size, properties, video) => {
  const photo = getTargetVideoLayout({}, size, properties, 1)
  return {x: photo.x, y: photo.y, width: photo.width, componentOptions: {
    pictureHeight: photo.height,
    boundsLeft: Math.min(-photo.width / 2, video.x - photo.x - video.width / 2),
    boundsRight: Math.max(photo.width / 2, video.x - photo.x + video.width / 2),
    boundsBottom: Math.min(-photo.height / 2, video.y - photo.y - video.height / 2),
    boundsTop: Math.max(photo.height / 2, video.y - photo.y + video.height / 2),
  }}
}

const setTargetVideoOpacity = (el, opacity) => {
  const plane = el.parentElement?.querySelector('.magic-video-plane')
  const cover = plane?.components?.['magic-target-video-cover']
  if (cover) cover.setRevealOpacity(opacity)
  else if (plane) plane.setAttribute('magic-target-video-cover', 'revealOpacity', opacity)
}

module.exports = {getPhotoVideoPlacement, setTargetVideoOpacity}
