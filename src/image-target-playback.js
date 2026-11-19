const {getVideoMaskConfig, prepareVideoMaskConfig} = require('./video-mask')
const {getShapeVideoScale, getTrackedTargetSize, getTargetVideoLayout} = require('./target-size')
const {registerMagicTargetVideoCover} = require('./video-cover')
const {registerMagicTargetConfetti} = require('./target-confetti')
const {registerMagicBirthdayBanner, getBirthdayPlacement} = require('./birthday-banner')

const MAGIC_CDN_BASE = 'https://d1y2o0xoe5yirl.cloudfront.net'

const isAbsoluteUrl = value => /^https?:\/\//i.test(value || '')

const joinUrl = (base, value) => {
  if (!value) return ''
  if (isAbsoluteUrl(value)) return value
  return `${String(base).replace(/\/$/, '')}/${String(value).replace(/^\//, '')}`
}

const normalizeTargetName = value => String(value || '').replace(/\.json$/i, '')

const DEFAULT_TARGET_SIZE = {width: 0.79, height: 1}
const SHAPE_VIDEO_SCALE = getShapeVideoScale(new URLSearchParams(window.location.search).get('shapeScale'))

const getTargetSize = imageUrl => new Promise((resolve) => {
  const image = new Image()

  image.onload = () => {
    const aspect = image.naturalWidth / image.naturalHeight
    if (!Number.isFinite(aspect) || aspect <= 0) {
      resolve(DEFAULT_TARGET_SIZE)
      return
    }

    // Approximate local dimensions until XR8 reports the target geometry.
    resolve({width: Math.min(aspect, 1), height: Math.min(1 / aspect, 1)})
  }
  image.onerror = () => resolve(DEFAULT_TARGET_SIZE)
  image.src = imageUrl
})

const getSafeTargetSize = (targetSize = DEFAULT_TARGET_SIZE) => (
  targetSize &&
    Number.isFinite(targetSize.width) &&
    Number.isFinite(targetSize.height) &&
    targetSize.width > 0 &&
    targetSize.height > 0
    ? targetSize
    : DEFAULT_TARGET_SIZE
)

const bindImageTargetName = (target, targetName) => {
  if (!target) return
  if (target.dataset.magicTargetName === targetName) return

  // XR Extras captures the target name in init() and does not react to later updates.
  // Recreate the component so a dynamically loaded target is actually tracked/rendered.
  target.setAttribute('name', targetName)
  target.removeAttribute('xrextras-named-image-target')
  target.setAttribute('xrextras-named-image-target', {name: targetName})
  target.dataset.magicTargetName = targetName
}

const loadImageTarget = (entry) => {
  const assetRoot = joinUrl(MAGIC_CDN_BASE, entry.path || '')
  const targetName = normalizeTargetName(entry.targetName)
  const targetJsonUrl = joinUrl(assetRoot, `${targetName}.json`)

  return fetch(targetJsonUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Target JSON failed to load (${response.status}): ${targetJsonUrl}`)
      }
      return response.json()
    })
    .then((targetData) => {
      targetData.name = targetName
      targetData.imagePath = joinUrl(assetRoot, `${targetName}_luminance.jpg`)
      targetData.resources = Object.assign({}, targetData.resources || {}, {
        originalImage: joinUrl(assetRoot, `${targetName}_original.jpg`),
        croppedImage: joinUrl(assetRoot, `${targetName}_cropped.jpg`),
        thumbnailImage: joinUrl(assetRoot, `${targetName}_thumbnail.jpg`),
        luminanceImage: joinUrl(assetRoot, `${targetName}_luminance.jpg`),
      })

      const maskConfig = getVideoMaskConfig(entry, value => joinUrl(MAGIC_CDN_BASE, value))
      // Recognition luminance images may be resized to 480x640. Use the
      // actual tracking crop for the initial aspect, not that raster size.
      return getTargetSize(targetData.resources.croppedImage).then((targetSize) => {
        // Validate/download masks before activating a matched experience.
        return prepareVideoMaskConfig(maskConfig).then(preparedConfig => ({
          targetData,
          targetName,
          targetSize,
          maskConfig: preparedConfig,
          videoUrl: joinUrl(MAGIC_CDN_BASE, entry.videoUrl),
          birthdayText: entry.birthdayText || 'Happy Birthday!',
        }))
      })
    })
}

const createImageTargetPlayback = ({scene, onTargetFound, onTargetLost}) => {
  registerMagicTargetVideoCover(window)
  registerMagicTargetConfetti(window)
  registerMagicBirthdayBanner(window)
  const targetExperiences = new Map()
  let loadGeneration = 0

  const hide = () => {
    targetExperiences.forEach(({plane, loadingPanel}) => {
      plane.setAttribute('magic-target-confetti', 'enabled', false)
      plane.setAttribute('visible', false)
      loadingPanel.setAttribute('visible', false)
    })
  }
  const clearEntities = () => {
    targetExperiences.forEach(({target}) => {
      if (target.id === 'magic-image-target') {
        target.removeAttribute('xrextras-named-image-target')
        target.removeAttribute('name')
        delete target.dataset.magicTargetName
        target.querySelectorAll('.magic-video-plane, .magic-target-loader, .magic-birthday-banner').forEach(el => el.remove())
      } else {
        target.remove()
      }
    })
    targetExperiences.clear()
  }

  const createTargetExperience = (match, index) => {
    const target = index === 0
      ? document.querySelector('#magic-image-target')
      : document.createElement('xrextras-named-image-target')

    if (!target) throw new Error('Image target container is missing.')

    // The legacy fade component registers parent listeners without cleaning
    // them up on removal. Reusing its entity lets tracking replace our masked
    // mesh with a rectangular one. Always use a separate, clean entity.
    target.querySelectorAll('[xrextras-target-video-fade]').forEach(legacy => legacy.remove())
    let plane = target.querySelector('.magic-video-plane')

    if (!plane) {
      plane = document.createElement('a-entity')
      target.appendChild(plane)
    }

    plane.classList.add('magic-video-plane')
    plane.removeAttribute('xrextras-target-video-fade')
    plane.removeAttribute('geometry')
    plane.removeAttribute('material')
    target.querySelectorAll('.magic-target-loader').forEach(loader => loader.remove())

    const targetSize = getSafeTargetSize(match.targetSize)
    const {width, height, x, y} = getTargetVideoLayout(
      match.maskConfig, targetSize, match.targetData.properties, SHAPE_VIDEO_SCALE)
    plane.setAttribute('position', {x, y, z: 0})
    plane.setAttribute('magic-target-video-cover', Object.assign({
      video: '#magic-video',
      width,
      height,
    }, match.maskConfig))
    plane.setAttribute('magic-target-confetti', {
      video: '#magic-video', width, height, enabled: false,
    })
    plane.setAttribute('visible', false)

    target.querySelectorAll('.magic-birthday-banner').forEach(el => el.remove())
    const birthday = document.createElement('a-entity')
    birthday.classList.add('magic-birthday-banner')
    const birthdayPlacement = getBirthdayPlacement(targetSize, match.targetData.properties, {width, height, x, y})
    birthday.setAttribute('position', {x: birthdayPlacement.x, y: birthdayPlacement.y, z: 0.018})
    birthday.setAttribute('magic-birthday-banner', {
      targetName: match.targetName,
      width: birthdayPlacement.width,
      text: match.birthdayText,
    })
    target.appendChild(birthday)

    const loadingPanel = document.createElement('a-entity')
    const loadingBackground = document.createElement('a-entity')
    const loadingRing = document.createElement('a-ring')
    const loadingText = document.createElement('a-entity')

    loadingPanel.setAttribute('visible', false)
    loadingPanel.setAttribute('position', {x, y, z: 0})
    loadingPanel.classList.add('magic-target-loader')
    loadingBackground.setAttribute('geometry', {
      primitive: 'plane',
      height,
      width,
    })
    loadingBackground.setAttribute('material', {
      color: '#05070c',
      opacity: 0.78,
      transparent: true,
      shader: 'flat',
    })
    loadingBackground.setAttribute('position', '0 0 0.004')
    loadingRing.setAttribute('radius-inner', Math.min(width, height) * 0.035)
    loadingRing.setAttribute('radius-outer', Math.min(width, height) * 0.052)
    loadingRing.setAttribute('theta-length', 270)
    loadingRing.setAttribute('material', {
      color: '#ffffff',
      opacity: 0.95,
      shader: 'flat',
    })
    loadingRing.setAttribute('position', `0 ${height * 0.11} 0.008`)
    loadingRing.setAttribute('animation', {
      property: 'rotation',
      to: '0 0 360',
      loop: true,
      dur: 900,
      easing: 'linear',
    })
    loadingText.setAttribute('text', {
      value: 'Loading video...',
      align: 'center',
      anchor: 'center',
      baseline: 'center',
      color: '#ffffff',
      width: Math.max(width * 1.45, 1.2),
    })
    loadingText.setAttribute('position', `0 ${height * -0.04} 0.009`)
    loadingPanel.appendChild(loadingBackground)
    loadingPanel.appendChild(loadingRing)
    loadingPanel.appendChild(loadingText)
    target.appendChild(loadingPanel)

    if (index > 0) {
      target.id = `magic-image-target-${index}`
      scene.appendChild(target)
    }

    bindImageTargetName(target, match.targetName)
    targetExperiences.set(match.targetName, {
      targetName: match.targetName,
      tracked: false,
      target,
      plane,
      birthday,
      width,
      height,
      x,
      y,
      targetProperties: match.targetData.properties,
      loadingPanel,
      loadingSize: {width, height},
      loadingText,
      videoUrl: match.videoUrl,
      maskConfig: match.maskConfig,
    })
  }

  const updateTargetGeometry = (targetName, geometry) => {
    const experience = targetExperiences.get(targetName)
    const targetSize = getTrackedTargetSize(geometry)
    if (!experience || !targetSize) return
    const {width, height, x, y} = getTargetVideoLayout(
      experience.maskConfig, targetSize, experience.targetProperties, SHAPE_VIDEO_SCALE)
    if (experience.width === width && experience.height === height &&
      experience.x === x && experience.y === y) return

    experience.width = width
    experience.height = height
    experience.x = x
    experience.y = y
    experience.plane.object3D.position.x = x
    experience.plane.object3D.position.y = y
    experience.loadingPanel.object3D.position.x = x
    experience.loadingPanel.object3D.position.y = y
    experience.plane.setAttribute('magic-target-video-cover', Object.assign({
      video: '#magic-video', width, height,
    }, experience.maskConfig))
    experience.plane.setAttribute('magic-target-confetti', {video: '#magic-video', width, height})
    const birthdayPlacement = getBirthdayPlacement(targetSize, experience.targetProperties, {width, height, x, y})
    experience.birthday.object3D.position.x = birthdayPlacement.x
    experience.birthday.object3D.position.y = birthdayPlacement.y
    experience.birthday.setAttribute('magic-birthday-banner', 'width', birthdayPlacement.width)
    experience.loadingPanel.object3D.scale.set(
      width / experience.loadingSize.width, height / experience.loadingSize.height, 1)
    console.log('[magic] Video layout:', {targetName, trackedSize: targetSize,
      crop: experience.targetProperties, video: {width, height, x, y}})
  }

  scene.addEventListener('xrimagescanning', (event) => {
    event.detail?.imageTargets?.forEach(({name, geometry}) => updateTargetGeometry(name, geometry))
  })
  scene.addEventListener('xrimageupdated', event => updateTargetGeometry(event.detail?.name, event.detail))
  scene.addEventListener('xrimagefound', (event) => {
    const experience = targetExperiences.get(event.detail?.name)
    if (!experience) return
    experience.tracked = true
    updateTargetGeometry(event.detail.name, event.detail)
    return onTargetFound(experience)
  })
  scene.addEventListener('xrimagelost', (event) => {
    const experience = targetExperiences.get(event.detail?.name)
    if (!experience) return
    experience.tracked = false
    return onTargetLost(experience)
  })

  return {
    async load(entries) {
      const generation = ++loadGeneration
      const matches = await Promise.all(entries.map(loadImageTarget))
      if (generation !== loadGeneration) return
      clearEntities()
      matches.forEach(createTargetExperience)
      window.XR8.XrController.configure({imageTargetData: matches.map(({targetData}) => targetData)})
    },
    clear() {
      ++loadGeneration
      hide()
      clearEntities()
      window.XR8?.XrController.configure({imageTargetData: []})
    },
    hide,
    show(targetName) {
      hide()
      const experience = targetExperiences.get(targetName)
      if (experience?.tracked) {
        experience.plane.setAttribute('visible', true)
        experience.plane.setAttribute('magic-target-confetti', 'enabled', true)
      }
    },
    isTracked: targetName => Boolean(targetExperiences.get(targetName)?.tracked),
    showLoading(targetName, message) {
      const experience = targetExperiences.get(targetName)
      if (!experience?.tracked) return false
      experience.loadingText.setAttribute('text', 'value', message)
      experience.loadingPanel.setAttribute('visible', true)
      return true
    },
    hideLoading() {
      targetExperiences.forEach(({loadingPanel}) => loadingPanel.setAttribute('visible', false))
    },
  }
}

module.exports = {createImageTargetPlayback}
