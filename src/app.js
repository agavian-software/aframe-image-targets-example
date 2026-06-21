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

const loadImageTarget = (entry) => {
  const assetRoot = joinUrl(MAGIC_CDN_BASE, entry.path || '')
  const targetName = String(entry.targetName).replace(/\.json$/i, '')
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

      return {
        targetData,
        targetName,
        videoUrl: joinUrl(assetRoot, entry.videoUrl),
      }
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

  if (!scene || !video || !appLoader || !videoLoader || !videoLoaderText) {
    return
  }

  let playbackRequested = false
  let activeTargetName = ''
  let applyingMatch = false

  const hideAppLoader = () => {
    appLoader.classList.add('is-hidden')
  }

  const showVideoLoader = (message = 'Buffering video...') => {
    if (!playbackRequested) {
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

  scene.addEventListener('realityready', hideAppLoader, {once: true})

  // Avoid leaving the custom overlay above permission or runtime messages forever.
  scene.addEventListener('loaded', () => {
    window.setTimeout(hideAppLoader, 8000)
  }, {once: true})

  video.pause()
  hideVideoLoader()

  video.addEventListener('loadstart', () => {
    showVideoLoader('Loading video...')
  })

  video.addEventListener('waiting', () => {
    showVideoLoader('Buffering video...')
  })

  video.addEventListener('stalled', () => {
    showVideoLoader('Connection is slow...')
  })

  video.addEventListener('canplay', hideVideoLoader)
  video.addEventListener('playing', hideVideoLoader)
  video.addEventListener('pause', hideVideoLoader)

  video.addEventListener('error', () => {
    showVideoLoader('Video could not be loaded')
  })

  window.addEventListener('imageidentified', (event) => {
    if (applyingMatch) return

    const entry = getMagicEntries(event.detail)[0]
    if (!entry) return

    applyingMatch = true
    showVideoLoader('Loading matched experience...')

    loadImageTarget(entry)
      .then((match) => {
        const target = document.querySelector('#magic-image-target')

        video.pause()
        video.src = match.videoUrl
        video.load()
        target?.setAttribute('name', match.targetName)
        activeTargetName = match.targetName

        XR8.XrController.configure({imageTargetData: [match.targetData]})
        scanOverlay?.classList.remove('is-hidden')
        hideVideoLoader()
        console.log('[magic] Loaded image target:', match.targetName)
      })
      .catch((error) => {
        applyingMatch = false
        hideVideoLoader()
        window.dispatchEvent(new Event('imageidentificationresume'))
        console.error('[magic] Could not load matched target:', error)
      })
  })

  scene.addEventListener('xrimagefound', (event) => {
    if (!event.detail || event.detail.name !== activeTargetName) {
      return
    }

    playbackRequested = true
    scanOverlay?.classList.add('is-hidden')
    video.muted = false

    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      showVideoLoader('Starting video...')
    }

    video.play().catch(() => {
      playbackRequested = false
      hideVideoLoader()
    })
  })

  scene.addEventListener('xrimagelost', (event) => {
    if (!event.detail || event.detail.name !== activeTargetName) {
      return
    }

    playbackRequested = false
    scanOverlay?.classList.remove('is-hidden')
    hideVideoLoader()
    video.pause()
    video.currentTime = 0
  })
})
