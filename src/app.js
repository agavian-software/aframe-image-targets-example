require('./index.css')

const {
  imageIdentificationPipelineModule,
} = require('./image-identification-pipeline')

const MAGIC_CDN_BASE = 'https://d1y2o0xoe5yirl.cloudfront.net'

const isAbsoluteUrl = value => /^https?:\/\//i.test(value || '')

const joinUrl = (base, value) => {
  if (!value) return ''
  if (isAbsoluteUrl(value)) return value
  return `${String(base).replace(/\/$/, '')}/${String(value).replace(/^\//, '')}`
}

const getMagicEntries = (response) => {
  const value = response?.videoUrlV1
  return (Array.isArray(value) ? value : value ? [value] : [])
    .filter(item => item && Object(item) === item && item.targetName && item.videoUrl)
}

const normalizeTargetName = value => String(value || '').replace(/\.json$/i, '')

const DEFAULT_TARGET_SIZE = {width: 0.79, height: 1}
const TARGET_VIDEO_OVERSCAN = 1.04
const TARGET_LOST_GRACE_MS = 2500
const SCAN_STATUS_SEARCHING = 'Searching image...'
const SCAN_STATUS_LOADING_MAGIC = 'Loading magic...'

const getTargetSize = imageUrl => new Promise((resolve) => {
  const image = new Image()

  image.onload = () => {
    const aspect = image.naturalWidth / image.naturalHeight
    if (!Number.isFinite(aspect) || aspect <= 0) {
      resolve(DEFAULT_TARGET_SIZE)
      return
    }

    // Image-target coordinates use target height as one unit.
    resolve({width: aspect, height: 1})
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

const getCoverTextureTransform = (sourceAspect, targetAspect) => {
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(targetAspect)) {
    return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
  }
  if (sourceAspect <= 0 || targetAspect <= 0) {
    return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
  }

  if (sourceAspect > targetAspect) {
    const repeatX = targetAspect / sourceAspect
    return {
      repeatX,
      repeatY: 1,
      offsetX: (1 - repeatX) / 2,
      offsetY: 0,
    }
  }

  if (sourceAspect < targetAspect) {
    const repeatY = sourceAspect / targetAspect
    return {
      repeatX: 1,
      repeatY,
      offsetX: 0,
      offsetY: (1 - repeatY) / 2,
    }
  }

  return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
}

const registerMagicTargetVideoCover = () => {
  if (!window.AFRAME || window.AFRAME.components['magic-target-video-cover']) return

  window.AFRAME.registerComponent('magic-target-video-cover', {
    schema: {
      video: {type: 'selector'},
      width: {type: 'number', default: 1},
      height: {type: 'number', default: 1},
    },

    init() {
      this.videoTexture = null
      this.material = null
      this.mesh = null
      this.onMetadata = this.updateTextureCover.bind(this)
    },

    update() {
      const THREE = window.AFRAME.THREE
      const video = this.data.video
      if (!THREE || !video) return

      if (!this.videoTexture || this.videoTexture.image !== video) {
        this.videoTexture?.dispose?.()
        this.videoTexture = new THREE.VideoTexture(video)
        this.videoTexture.minFilter = THREE.LinearFilter
        this.videoTexture.magFilter = THREE.LinearFilter
        this.videoTexture.format = THREE.RGBAFormat
        this.videoTexture.generateMipmaps = false
        if ('colorSpace' in this.videoTexture && THREE.SRGBColorSpace) {
          this.videoTexture.colorSpace = THREE.SRGBColorSpace
        } else if ('encoding' in this.videoTexture && THREE.sRGBEncoding) {
          this.videoTexture.encoding = THREE.sRGBEncoding
        }
      }

      if (!this.material) {
        this.material = new THREE.MeshBasicMaterial({
          map: this.videoTexture,
          side: THREE.DoubleSide,
          transparent: true,
        })
      } else {
        this.material.map = this.videoTexture
        this.material.needsUpdate = true
      }

      const geometry = new THREE.PlaneGeometry(this.data.width, this.data.height)
      if (!this.mesh) {
        this.mesh = new THREE.Mesh(geometry, this.material)
        this.el.setObject3D('mesh', this.mesh)
      } else {
        this.mesh.geometry?.dispose?.()
        this.mesh.geometry = geometry
      }

      video.removeEventListener('loadedmetadata', this.onMetadata)
      video.addEventListener('loadedmetadata', this.onMetadata)
      this.updateTextureCover()
    },

    updateTextureCover() {
      const video = this.data.video
      if (!video?.videoWidth || !video?.videoHeight || !this.videoTexture) return

      const sourceAspect = video.videoWidth / video.videoHeight
      const targetAspect = this.data.width / this.data.height
      const {repeatX, repeatY, offsetX, offsetY} = getCoverTextureTransform(sourceAspect, targetAspect)
      this.videoTexture.repeat.set(repeatX, repeatY)
      this.videoTexture.offset.set(offsetX, offsetY)
      this.videoTexture.needsUpdate = true
    },

    remove() {
      this.data.video?.removeEventListener('loadedmetadata', this.onMetadata)
      this.el.removeObject3D('mesh')
      this.mesh?.geometry?.dispose?.()
      this.material?.dispose?.()
      this.videoTexture?.dispose?.()
    },
  })
}

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

      return getTargetSize(targetData.imagePath).then(targetSize => ({
        targetData,
        targetName,
        targetSize,
        videoUrl: joinUrl(MAGIC_CDN_BASE, entry.videoUrl),
      }))
    })
}

const onxrloaded = () => {
  XR8.addCameraPipelineModule(imageIdentificationPipelineModule())

  XR8.XrController.configure({
    imageTargetData: [],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

document.addEventListener('DOMContentLoaded', () => {
  registerMagicTargetVideoCover()

  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#magic-video')
  const appLoader = document.querySelector('#customLoader')
  const scanOverlay = document.querySelector('#scanOverlay')
  const scanStatusText = document.querySelector('#scanStatusText')
  const videoLoader = document.querySelector('#videoLoader')
  const videoLoaderText = document.querySelector('#videoLoaderText')
  const timeoutOverlay = document.querySelector('#identificationTimeout')
  const tryAgainButton = document.querySelector('#identificationTryAgain')
  const exitButton = document.querySelector('#identificationExit')
  const soundToggle = document.querySelector('#soundToggle')

  if (!scene || !video || !appLoader || !videoLoader || !videoLoaderText) {
    return
  }

  const targetExperiences = new Map()
  let activeMatchSignature = ''
  let playingTargetName = ''
  let applyingMatch = false
  let videoTransitioning = false
  let identificationRestartTimer = null
  let targetLostTimer = null
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const updateSoundButton = () => {
    soundToggle?.classList.toggle('is-muted', video.muted)
    soundToggle?.setAttribute('aria-pressed', String(video.muted))
    soundToggle?.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video')
  }

  const hideAppLoader = () => {
    appLoader.classList.add('is-hidden')
  }

  const setScanStatus = (message) => {
    if (scanStatusText) scanStatusText.textContent = message
  }

  const setAllLoadingPanelsVisible = (visible) => {
    targetExperiences.forEach(({loadingPanel}) => {
      loadingPanel?.setAttribute('visible', visible)
    })
  }

  const setTargetLoadingVisible = (targetName, visible, message = 'Loading video...') => {
    const experience = targetExperiences.get(targetName)
    if (!experience?.loadingPanel) return false

    experience.loadingPanel.setAttribute('visible', visible)
    if (experience.loadingText) {
      experience.loadingText.setAttribute('text', 'value', message)
    }
    return true
  }

  const showVideoLoader = (message = 'Buffering video...', force = false) => {
    if (!force && !playingTargetName) {
      return
    }

    if (playingTargetName && setTargetLoadingVisible(playingTargetName, true, message)) {
      videoLoader.classList.remove('is-visible')
      videoLoader.setAttribute('aria-hidden', 'true')
      return
    }

    videoLoaderText.textContent = message
    videoLoader.classList.add('is-visible')
    videoLoader.setAttribute('aria-hidden', 'false')
  }

  const hideVideoLoader = () => {
    setAllLoadingPanelsVisible(false)
    videoLoader.classList.remove('is-visible')
    videoLoader.setAttribute('aria-hidden', 'true')
  }

  const setAllVideoPlanesVisible = (visible) => {
    targetExperiences.forEach(({plane}) => {
      plane?.setAttribute('visible', visible)
    })
  }

  const setTargetPlaneVisible = (targetName, visible) => {
    targetExperiences.get(targetName)?.plane?.setAttribute('visible', visible)
  }

  const applyVideoCoverToPlanes = () => {
    targetExperiences.forEach(({plane, width, height}) => {
      plane?.setAttribute('magic-target-video-cover', {
        video: '#magic-video',
        width,
        height,
      })
    })
  }

  const revealPlayingTarget = () => {
    if (!playingTargetName) return
    applyVideoCoverToPlanes()
    videoTransitioning = false
    setAllVideoPlanesVisible(false)
    setAllLoadingPanelsVisible(false)
    setTargetPlaneVisible(playingTargetName, true)
  }

  const clearVideoFrame = () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }

  const cancelIdentificationRestart = () => {
    if (identificationRestartTimer === null) return
    window.clearTimeout(identificationRestartTimer)
    identificationRestartTimer = null
  }

  const cancelTargetLostTimer = () => {
    if (targetLostTimer === null) return
    window.clearTimeout(targetLostTimer)
    targetLostTimer = null
  }

  const restartIdentificationAfterVideo = () => {
    cancelTargetLostTimer()
    cancelIdentificationRestart()
    applyingMatch = false
    playingTargetName = ''
    videoTransitioning = false
    setAllVideoPlanesVisible(false)
    setAllLoadingPanelsVisible(false)
    setScanStatus(SCAN_STATUS_SEARCHING)
    scanOverlay?.classList.remove('is-hidden')

    identificationRestartTimer = window.setTimeout(() => {
      identificationRestartTimer = null
      window.dispatchEvent(new Event('imageidentificationresume'))
      console.log('[magic] Video stopped; image identification resumed immediately.')
    }, 0)
  }

  scene.addEventListener('realityready', hideAppLoader, {once: true})

  // Avoid leaving the custom overlay above permission or runtime messages forever.
  scene.addEventListener('loaded', () => {
    window.setTimeout(hideAppLoader, 2500)
  }, {once: true})

  video.pause()
  video.muted = isIOS
  video.defaultMuted = isIOS
  updateSoundButton()
  hideVideoLoader()

  const bindVideoEvents = (targetVideo) => {
    targetVideo.addEventListener('loadstart', () => showVideoLoader('Loading video...'))
    targetVideo.addEventListener('loadedmetadata', applyVideoCoverToPlanes)
    targetVideo.addEventListener('waiting', () => showVideoLoader('Buffering video...'))
    targetVideo.addEventListener('stalled', () => showVideoLoader('Connection is slow...'))
    targetVideo.addEventListener('canplay', () => {
      revealPlayingTarget()
      hideVideoLoader()
    })
    targetVideo.addEventListener('playing', () => {
      revealPlayingTarget()
      hideVideoLoader()
      window.dispatchEvent(new Event('imageidentificationpause'))
      console.log('[magic] Video is playing; identification paused.')
    })
    targetVideo.addEventListener('pause', () => {
      if (!videoTransitioning) hideVideoLoader()
    })
    targetVideo.addEventListener('ended', restartIdentificationAfterVideo)
    targetVideo.addEventListener('error', () => {
      videoTransitioning = false
      showVideoLoader('Video could not be loaded')
    })
  }

  bindVideoEvents(video)

  soundToggle?.addEventListener('click', () => {
    video.muted = !video.muted
    updateSoundButton()

    if (!video.paused) return
    video.play().catch((error) => {
      console.error('[magic] Video playback failed after sound change:', error)
    })
  })

  window.addEventListener('imageidentificationtimeout', () => {
    setScanStatus(SCAN_STATUS_SEARCHING)
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.add('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'false')
    tryAgainButton?.focus()
  })

  tryAgainButton?.addEventListener('click', () => {
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    setScanStatus(SCAN_STATUS_SEARCHING)
    scanOverlay?.classList.remove('is-hidden')
    window.dispatchEvent(new Event('imageidentificationresume'))
  })

  exitButton?.addEventListener('click', () => {
    window.location.assign('https://www.sisulogs.com/')
  })

  const clearTargetExperiences = () => {
    cancelTargetLostTimer()
    videoTransitioning = false
    playingTargetName = ''
    clearVideoFrame()
    targetExperiences.forEach(({target}, targetName) => {
      if (targetName === target.dataset.magicTargetName && target.id === 'magic-image-target') {
        target.removeAttribute('xrextras-named-image-target')
        target.removeAttribute('name')
        delete target.dataset.magicTargetName
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

    let plane = target.querySelector('.magic-video-plane') ||
      target.querySelector('[xrextras-target-video-fade]')

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
    const width = targetSize.width * TARGET_VIDEO_OVERSCAN
    const height = targetSize.height * TARGET_VIDEO_OVERSCAN
    plane.setAttribute('magic-target-video-cover', {
      video: '#magic-video',
      width,
      height,
    })
    plane.setAttribute('visible', false)

    const loadingPanel = document.createElement('a-entity')
    const loadingBackground = document.createElement('a-entity')
    const loadingRing = document.createElement('a-ring')
    const loadingText = document.createElement('a-entity')

    loadingPanel.setAttribute('visible', false)
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
      target,
      plane,
      width,
      height,
      loadingPanel,
      loadingText,
      videoUrl: match.videoUrl,
    })
  }

  window.addEventListener('imageidentified', (event) => {
    if (applyingMatch) return

    const entries = getMagicEntries(event.detail)
    if (!entries.length) return

    const signature = entries.map((entry) => normalizeTargetName(entry.targetName)).join('|')
    if (signature === activeMatchSignature) return

    applyingMatch = true
    window.dispatchEvent(new Event('imageidentificationpause'))
    setScanStatus(SCAN_STATUS_LOADING_MAGIC)
    scanOverlay?.classList.add('is-hidden')
    showVideoLoader('Loading matched experience...', true)

    Promise.all(entries.map(loadImageTarget))
      .then((matches) => {
        clearTargetExperiences()
        matches.forEach(createTargetExperience)
        activeMatchSignature = signature

        XR8.XrController.configure({imageTargetData: matches.map(({targetData}) => targetData)})
        hideVideoLoader()
        console.log('[magic] Loaded image targets:', matches.map(({targetName}) => targetName))
      })
      .catch((error) => {
        applyingMatch = false
        setScanStatus(SCAN_STATUS_SEARCHING)
        hideVideoLoader()
        window.dispatchEvent(new Event('imageidentificationresume'))
        console.error('[magic] Could not load matched target:', error)
      })
  })

  scene.addEventListener('xrimagefound', (event) => {
    const experience = targetExperiences.get(event.detail?.name)
    if (!experience) return

    cancelTargetLostTimer()
    cancelIdentificationRestart()
    const targetChanged = playingTargetName !== event.detail.name
    playingTargetName = event.detail.name
    scanOverlay?.classList.add('is-hidden')
    video.muted = isIOS
    updateSoundButton()

    if (targetChanged || video.src !== experience.videoUrl) {
      videoTransitioning = true
      setAllVideoPlanesVisible(false)
      setAllLoadingPanelsVisible(false)
      showVideoLoader('Starting video...', true)
      clearVideoFrame()
      video.src = experience.videoUrl
      video.load()
    } else if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      revealPlayingTarget()
    }

    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      showVideoLoader('Starting video...')
    }

    console.log('[magic] Target detected:', event.detail.name, experience.videoUrl)
    video.play().catch((error) => {
      playingTargetName = ''
      videoTransitioning = false
      setAllVideoPlanesVisible(false)
      setAllLoadingPanelsVisible(false)
      hideVideoLoader()
      console.error('[magic] Video playback failed:', error)
    })
  })

  scene.addEventListener('xrimagelost', (event) => {
    const experience = targetExperiences.get(event.detail?.name)
    if (!experience) return
    if (playingTargetName !== event.detail.name) return

    hideVideoLoader()
    setTargetPlaneVisible(event.detail.name, false)
    setTargetLoadingVisible(event.detail.name, false)

    cancelTargetLostTimer()
    targetLostTimer = window.setTimeout(() => {
      targetLostTimer = null

      if (playingTargetName !== event.detail.name) return

      video.pause()
      restartIdentificationAfterVideo()
      console.log('[magic] Image target lost long enough to pause video:', event.detail.name)
    }, TARGET_LOST_GRACE_MS)

    console.log('[magic] Image target temporarily lost:', event.detail.name)
  })
})
