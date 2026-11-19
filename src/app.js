require('./index.css')

const {getMagicEntries} = require('./magic-entries')
const {cameraFocusPipelineModule} = require('./camera-focus')
const {imageIdentificationPipelineModule} = require('./image-identification-pipeline')

const MAGIC_CDN_BASE = 'https://d1y2o0xoe5yirl.cloudfront.net'

const getVideoUrl = value => /^https?:\/\//i.test(value)
  ? value
  : `${MAGIC_CDN_BASE}/${String(value).replace(/^\//, '')}`

const onxrloaded = () => {
  XR8.addCameraPipelineModule(cameraFocusPipelineModule({
    debug: new URLSearchParams(window.location.search).get('cameraDebug') === '1',
  }))
  XR8.addCameraPipelineModule(imageIdentificationPipelineModule())
  // The camera is used only to identify the gift; playback needs no AR targets.
  XR8.XrController.configure({imageTargetData: []})
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  const video = document.querySelector('#magic-video')
  const player = document.querySelector('#videoPlayer')
  const appLoader = document.querySelector('#customLoader')
  const scanOverlay = document.querySelector('#scanOverlay')
  const scanStatusText = document.querySelector('#scanStatusText')
  const videoLoader = document.querySelector('#videoLoader')
  const videoLoaderText = document.querySelector('#videoLoaderText')
  const timeoutOverlay = document.querySelector('#identificationTimeout')
  const tryAgainButton = document.querySelector('#identificationTryAgain')
  const exitButton = document.querySelector('#identificationExit')
  const soundToggle = document.querySelector('#soundToggle')
  const fullscreenToggle = document.querySelector('#fullscreenToggle')
  const videoMessage = document.querySelector('#videoMessage')
  const videoMessageText = document.querySelector('#videoMessageText')
  const scanAgainButton = document.querySelector('#videoScanAgain')

  if (!scene || !video || !player || !appLoader || !videoLoader || !videoLoaderText) return

  let hasActiveVideo = false
  let playbackRequest = 0
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const hideAppLoader = () => appLoader.classList.add('is-hidden')
  const updateSoundButton = () => {
    soundToggle?.classList.toggle('is-muted', video.muted)
    soundToggle?.setAttribute('aria-pressed', String(video.muted))
    soundToggle?.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video')
  }
  const hideVideoLoader = () => {
    videoLoader.classList.remove('is-visible')
    videoLoader.setAttribute('aria-hidden', 'true')
  }
  const showVideoLoader = (message) => {
    if (!hasActiveVideo) return
    videoLoaderText.textContent = message
    videoLoader.classList.add('is-visible')
    videoLoader.setAttribute('aria-hidden', 'false')
  }
  const showVideoMessage = (message, allowRescan = false) => {
    if (videoMessageText) videoMessageText.textContent = message
    if (videoMessage) videoMessage.hidden = false
    if (scanAgainButton) scanAgainButton.hidden = !allowRescan
  }
  const resumeScanning = () => {
    ++playbackRequest
    hasActiveVideo = false
    video.pause()
    video.removeAttribute('src')
    video.load()
    player.hidden = true
    if (fullscreenToggle) fullscreenToggle.hidden = true
    if (soundToggle) soundToggle.hidden = true
    if (videoMessage) videoMessage.hidden = true
    document.body.classList.remove('is-playing-video')
    hideVideoLoader()
    if (scanStatusText) scanStatusText.textContent = 'Searching image...'
    scanOverlay?.classList.remove('is-hidden')
    window.dispatchEvent(new Event('imageidentificationresume'))
  }

  scene.addEventListener('realityready', hideAppLoader, {once: true})
  scene.addEventListener('loaded', () => window.setTimeout(hideAppLoader, 2500), {once: true})

  video.muted = isIOS
  video.defaultMuted = isIOS
  updateSoundButton()
  hideVideoLoader()

  video.addEventListener('volumechange', updateSoundButton)
  video.addEventListener('loadstart', () => showVideoLoader('Loading video...'))
  video.addEventListener('waiting', () => showVideoLoader('Buffering video...'))
  video.addEventListener('stalled', () => showVideoLoader('Connection is slow...'))
  video.addEventListener('canplay', hideVideoLoader)
  video.addEventListener('playing', () => {
    if (!hasActiveVideo) return
    window.dispatchEvent(new Event('imageidentificationpause'))
    hideVideoLoader()
    if (videoMessage) videoMessage.hidden = true
    if (fullscreenToggle) fullscreenToggle.hidden = false
  })
  video.addEventListener('pause', hideVideoLoader)
  video.addEventListener('ended', () => {
    if (hasActiveVideo) resumeScanning()
  })
  video.addEventListener('error', () => {
    if (!hasActiveVideo) return
    hideVideoLoader()
    showVideoMessage('Video could not be loaded. Please scan your gift again.', true)
  })

  soundToggle?.addEventListener('click', () => {
    video.muted = !video.muted
    updateSoundButton()
  })

  fullscreenToggle?.addEventListener('click', async () => {
    if (!hasActiveVideo) return
    try {
      if (video.requestFullscreen) {
        await video.requestFullscreen()
      } else if (video.webkitEnterFullscreen) {
        // iPhone Safari uses the native video fullscreen API.
        video.webkitEnterFullscreen()
      } else if (video.webkitRequestFullscreen) {
        await video.webkitRequestFullscreen()
      } else {
        showVideoMessage('Fullscreen is unavailable in this browser. You can keep watching here.')
      }
    } catch (error) {
      showVideoMessage('Could not open fullscreen. Please try the fullscreen button again.')
      console.error('[magic] Fullscreen failed:', error)
    }
  })

  window.addEventListener('imageidentificationtimeout', () => {
    if (hasActiveVideo) return
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.add('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'false')
    tryAgainButton?.focus()
  })
  tryAgainButton?.addEventListener('click', () => {
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    resumeScanning()
  })
  scanAgainButton?.addEventListener('click', resumeScanning)
  exitButton?.addEventListener('click', () => window.location.assign('https://www.sisulogs.com/'))

  window.addEventListener('imageidentified', async (event) => {
    if (hasActiveVideo) return
    // Identification already chose the gift. Play its video directly, without
    // downloading target geometry/masks or waiting for an xrimagefound event.
    const [entry] = getMagicEntries(event.detail)
    if (!entry) return

    hasActiveVideo = true
    const request = ++playbackRequest
    window.dispatchEvent(new Event('imageidentificationpause'))
    hideAppLoader()
    scanOverlay?.classList.add('is-hidden')
    timeoutOverlay?.classList.remove('is-visible')
    timeoutOverlay?.setAttribute('aria-hidden', 'true')
    document.body.classList.add('is-playing-video')
    player.hidden = false
    if (soundToggle) soundToggle.hidden = false
    if (videoMessage) videoMessage.hidden = true
    video.src = getVideoUrl(entry.videoUrl)
    video.load()
    showVideoLoader('Starting video...')

    try {
      await video.play()
    } catch (error) {
      if (request !== playbackRequest) return
      if (error.name === 'NotAllowedError' && !video.muted) {
        // Browsers may require autoplay to begin muted until the viewer interacts.
        video.muted = true
        updateSoundButton()
        try {
          await video.play()
          return
        } catch (mutedError) {
          if (request !== playbackRequest) return
          error = mutedError
        }
      }
      hideVideoLoader()
      if (!video.error) showVideoMessage('Tap the play button on the video to start watching.')
      console.error('[magic] Video playback failed:', error)
    }
  })
})
