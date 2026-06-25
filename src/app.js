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
// Overlap the tracked boundary so pose jitter/cropping never reveals a rim.
// The generated target/video pairs are usually portrait, and the video plane
// was leaving side gutters, so horizontal overscan is intentionally stronger.
const TARGET_VIDEO_OVERSCAN_X = 1.28
const TARGET_VIDEO_OVERSCAN_Y = 1.08
const TARGET_LOST_GRACE_MS = 2500

const getTargetSize = imageUrl => new Promise((resolve) => {
  const image = new Image()

  image.onload = () => {
    const aspect = image.naturalWidth / image.naturalHeight
    if (!Number.isFinite(aspect) || aspect <= 0) {
      resolve(DEFAULT_TARGET_SIZE)
      return
    }

    // Image-target coordinates use the longest side as one unit.
    resolve(aspect >= 1
      ? {width: 1, height: 1 / aspect}
      : {width: aspect, height: 1})
  }
  image.onerror = () => resolve(DEFAULT_TARGET_SIZE)
  image.src = imageUrl
})

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
  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#magic-video')
  const appLoader = document.querySelector('#customLoader')
  const scanOverlay = document.querySelector('#scanOverlay')
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

  const showVideoLoader = (message = 'Buffering video...') => {
    if (!playingTargetName) {
      return
    }

    videoLoaderText.textContent = message
    videoLoader.classList.add('is-visible')
    videoLoader.setAttribute('aria-hidden', 'false')
  }

  const hideVideoLoader = () => {
    videoLoader.classList.remove('is-visible')
    videoLoader.setAttribute('aria-hidden', 'true')
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
    scanOverlay?.classList.remove('is-hidden')

    identificationRestartTimer = window.setTimeout(() => {
      identificationRestartTimer = null
      window.dispatchEvent(new Event('imageidentificationresume'))
      console.log('[magic] Video stopped; image identification resumed after 4 seconds.')
    }, 4000)
  }

  scene.addEventListener('realityready', hideAppLoader, {once: true})

  // Avoid leaving the custom overlay above permission or runtime messages forever.
  scene.addEventListener('loaded', () => {
    window.setTimeout(hideAppLoader, 8000)
  }, {once: true})

  video.pause()
  video.muted = isIOS
  video.defaultMuted = isIOS
  updateSoundButton()
  hideVideoLoader()

  const bindVideoEvents = (targetVideo) => {
    targetVideo.addEventListener('loadstart', () => showVideoLoader('Loading video...'))
    targetVideo.addEventListener('waiting', () => showVideoLoader('Buffering video...'))
    targetVideo.addEventListener('stalled', () => showVideoLoader('Connection is slow...'))
    targetVideo.addEventListener('canplay', hideVideoLoader)
    targetVideo.addEventListener('playing', () => {
      hideVideoLoader()
      window.dispatchEvent(new Event('imageidentificationpause'))
      console.log('[magic] Video is playing; identification paused.')
    })
    targetVideo.addEventListener('pause', hideVideoLoader)
    targetVideo.addEventListener('ended', restartIdentificationAfterVideo)
    targetVideo.addEventListener('error', () => showVideoLoader('Video could not be loaded'))
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
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.add('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'false')
    tryAgainButton?.focus()
  })

  tryAgainButton?.addEventListener('click', () => {
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    scanOverlay?.classList.remove('is-hidden')
    window.dispatchEvent(new Event('imageidentificationresume'))
  })

  exitButton?.addEventListener('click', () => {
    window.location.assign('https://www.sisulogs.com/')
  })

  const clearTargetExperiences = () => {
    cancelTargetLostTimer()
    video.pause()
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
    playingTargetName = ''
  }

  const createTargetExperience = (match, index) => {
    const target = index === 0
      ? document.querySelector('#magic-image-target')
      : document.createElement('xrextras-named-image-target')

    if (!target) throw new Error('Image target container is missing.')

    let plane = target.querySelector('[xrextras-target-video-fade]')

    if (!plane) {
      plane = document.createElement('a-entity')
      target.appendChild(plane)
    }

    const targetSize = match.targetSize || DEFAULT_TARGET_SIZE
    const width = targetSize.width * TARGET_VIDEO_OVERSCAN_X
    const height = targetSize.height * TARGET_VIDEO_OVERSCAN_Y
    plane.setAttribute('xrextras-target-video-fade', {
      video: '#magic-video',
      height,
      width,
    })
    plane.setAttribute('geometry', {primitive: 'plane', height, width})

    if (index > 0) {
      target.id = `magic-image-target-${index}`
      scene.appendChild(target)
    }

    bindImageTargetName(target, match.targetName)
    targetExperiences.set(match.targetName, {
      target,
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
    showVideoLoader('Loading matched experience...')

    Promise.all(entries.map(loadImageTarget))
      .then((matches) => {
        clearTargetExperiences()
        matches.forEach(createTargetExperience)
        activeMatchSignature = signature

        XR8.XrController.configure({imageTargetData: matches.map(({targetData}) => targetData)})
        scanOverlay?.classList.remove('is-hidden')
        hideVideoLoader()
        console.log('[magic] Loaded image targets:', matches.map(({targetName}) => targetName))
      })
      .catch((error) => {
        applyingMatch = false
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
      video.pause()
      video.src = experience.videoUrl
      video.load()
    }

    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      showVideoLoader('Starting video...')
    }

    console.log('[magic] Target detected:', event.detail.name, experience.videoUrl)
    video.play().catch((error) => {
      playingTargetName = ''
      hideVideoLoader()
      console.error('[magic] Video playback failed:', error)
    })
  })

  scene.addEventListener('xrimagelost', (event) => {
    const experience = targetExperiences.get(event.detail?.name)
    if (!experience) return
    if (playingTargetName !== event.detail.name) return

    hideVideoLoader()

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
