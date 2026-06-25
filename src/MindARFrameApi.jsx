'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

import { checkImage } from '@package/api/slices/MagicSlice';
import { getWebsiteDetails } from '@package/api/slices/customDomainSlice';
import {
  buildAnalyticsLink,
  getAnalyticsTenantId,
  normalizeAnalyticsCustomerCode,
  normalizeAnalyticsCustomerId,
} from './arAnalyticsUtils';

const AR_ANALYTICS_SESSION_PREFIX = 'ar_analytics_session_sent::';

function hardStopAllVideoStreams(rootEl) {
  try {
    const videos = rootEl ? Array.from(rootEl.querySelectorAll('video')) : [];
    for (const v of videos) {
      try {
        const stream = v.srcObject;
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (_) {}
          });
        }
      } catch (_) {}

      try {
        v.pause();
      } catch (_) {}
      try {
        v.srcObject = null;
      } catch (_) {}
      try {
        v.removeAttribute('src');
      } catch (_) {}
      try {
        v.load();
      } catch (_) {}
      try {
        v.remove();
      } catch (_) {}
    }
  } catch (_) {}
}

function disposeThreeScene(scene) {
  if (!scene) return;

  try {
    scene.traverse((obj) => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function') {
        try {
          obj.geometry.dispose();
        } catch (_) {}
      }

      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          if (!material) continue;

          for (const key in material) {
            const value = material[key];
            if (value && value.isTexture && typeof value.dispose === 'function') {
              try {
                value.dispose();
              } catch (_) {}
            }
          }

          if (typeof material.dispose === 'function') {
            try {
              material.dispose();
            } catch (_) {}
          }
        }
      }
    });
  } catch (_) {}
}

function removeMindarUiOverlays() {
  try {
    const selectors = [
      '.mindar-ui-overlay',
      '.mindar-ui-loading',
      '.mindar-ui-scanning',
      '[class^="mindar-ui-"]',
      '[class*=" mindar-ui-"]',
    ];

    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      try {
        el.remove();
      } catch (_) {}
    });
  } catch (_) {}
}

async function hardTeardownMindAR(mindarThree, containerEl) {
  try {
    if (mindarThree?.renderer) {
      try {
        mindarThree.renderer.setAnimationLoop(null);
      } catch (_) {}
    }
    try {
      mindarThree?.controller?.stop?.();
    } catch (_) {}
    try {
      mindarThree?.controller?.dispose?.();
    } catch (_) {}
    try {
      await mindarThree?.stop?.();
    } catch (_) {}
    try {
      disposeThreeScene(mindarThree?.scene);
    } catch (_) {}

    if (mindarThree?.renderer) {
      try {
        mindarThree.renderer.renderLists?.dispose?.();
      } catch (_) {}
      try {
        mindarThree.renderer.dispose();
      } catch (_) {}
      try {
        const gl = mindarThree.renderer.getContext?.();
        const ext = gl?.getExtension?.('WEBGL_lose_context');
        ext?.loseContext?.();
      } catch (_) {}
    }
  } finally {
    hardStopAllVideoStreams(containerEl);
    try {
      if (containerEl) containerEl.innerHTML = '';
    } catch (_) {}
    removeMindarUiOverlays();
  }
}

function blobToFile(blob, filename) {
  try {
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  } catch (_) {
    blob.name = filename;
    return blob;
  }
}

async function waitForCanPlay(videoEl, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const cleanup = (cb) => {
      clearInterval(timer);
      videoEl.removeEventListener('canplay', ok);
      videoEl.removeEventListener('error', bad);
      cb();
    };
    const ok = () => cleanup(() => resolve());
    const bad = () => cleanup(() => reject(new Error('Video cannot play (URL/CORS/codec).')));
    const timeout = () => cleanup(() => reject(new Error('Video canplay timeout.')));

    const timer = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) timeout();
    }, 250);

    videoEl.addEventListener('canplay', ok);
    videoEl.addEventListener('error', bad);

    if (videoEl.readyState >= 3) ok();
  });
}

async function waitForVideoMetadataSoft(videoEl, timeoutMs = 2500) {
  if (videoEl.readyState >= 1) return true;

  return new Promise((resolve) => {
    const cleanup = (result) => {
      clearTimeout(timer);
      videoEl.removeEventListener('loadedmetadata', onReady);
      videoEl.removeEventListener('canplay', onReady);
      videoEl.removeEventListener('error', onError);
      resolve(result);
    };

    const onReady = () => cleanup(true);
    const onError = () => cleanup(false);
    const timer = setTimeout(() => cleanup(false), Math.max(500, timeoutMs));

    videoEl.addEventListener('loadedmetadata', onReady);
    videoEl.addEventListener('canplay', onReady);
    videoEl.addEventListener('error', onError);
  });
}

function isAbsoluteUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function getFirstStringValue(value, keys = []) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = getFirstStringValue(entry, keys);
      if (resolved) return resolved;
    }
    return null;
  }

  if (typeof value === 'object') {
    const candidateKeys =
      keys.length > 0
        ? keys
        : ['url', 'videoUrl', 'video', 'path', 'key', 'fileUrl', 'mindFile', 'targetUrl'];

    for (const key of candidateKeys) {
      const resolved = getFirstStringValue(value[key], keys);
      if (resolved) return resolved;
    }
  }

  return null;
}

function joinCdn(base, maybePath) {
  const path = getFirstStringValue(maybePath);
  if (!path) return null;
  if (isAbsoluteUrl(path)) return path;
  if (!base || typeof base !== 'string') return path;

  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

const DEFAULT_TARGET_SIZE = { width: 1, height: 1 };
const TARGET_VIDEO_OVERSCAN = 1.04;

function getTargetSizeFromAspect(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) return DEFAULT_TARGET_SIZE;
  return aspect >= 1 ? { width: 1, height: 1 / aspect } : { width: aspect, height: 1 };
}

function getImageSize(imageUrl) {
  return new Promise((resolve) => {
    if (!imageUrl || typeof Image === 'undefined') {
      resolve(DEFAULT_TARGET_SIZE);
      return;
    }

    const image = new Image();
    image.onload = () => resolve(getTargetSizeFromAspect(image.naturalWidth / image.naturalHeight));
    image.onerror = () => resolve(DEFAULT_TARGET_SIZE);
    image.src = imageUrl;
  });
}

function applyTextureCover(texture, sourceAspect, targetAspect) {
  if (!texture || !Number.isFinite(sourceAspect) || !Number.isFinite(targetAspect)) return;
  if (sourceAspect <= 0 || targetAspect <= 0) return;

  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  if (sourceAspect > targetAspect) {
    const repeatX = targetAspect / sourceAspect;
    texture.repeat.x = repeatX;
    texture.offset.x = (1 - repeatX) / 2;
  } else if (sourceAspect < targetAspect) {
    const repeatY = sourceAspect / targetAspect;
    texture.repeat.y = repeatY;
    texture.offset.y = (1 - repeatY) / 2;
  }

  texture.needsUpdate = true;
}

function ensureMp4FileName(fileName, fallbackName) {
  const trimmedName = typeof fileName === 'string' ? fileName.trim() : '';
  const safeName = trimmedName || fallbackName;
  return /\.mp4$/i.test(safeName) ? safeName : `${safeName}.mp4`;
}

export function isMobileLike() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

function normalizeCropMargins({ cropMargin = 0, cropMargins = null }) {
  const clamp01 = (n) => Math.max(0, Math.min(0.45, Number(n) || 0));

  if (cropMargins && typeof cropMargins === 'object') {
    return {
      top: clamp01(cropMargins.top),
      right: clamp01(cropMargins.right),
      bottom: clamp01(cropMargins.bottom),
      left: clamp01(cropMargins.left),
    };
  }

  const margin = clamp01(cropMargin);
  return { top: margin, right: margin, bottom: margin, left: margin };
}

async function captureVideoFrameToJpegFile({
  videoEl,
  canvasEl,
  processingWidth,
  quality = 0.85,
  cropMargin = 0.12,
  cropMargins = null,
}) {
  const videoWidth = videoEl.videoWidth || 0;
  const videoHeight = videoEl.videoHeight || 0;
  if (!videoWidth || !videoHeight) throw new Error('Video has no dimensions yet.');

  const crop = normalizeCropMargins({ cropMargin, cropMargins });
  const sx = Math.floor(videoWidth * crop.left);
  const sy = Math.floor(videoHeight * crop.top);
  const sw = Math.max(2, Math.floor(videoWidth * (1 - crop.left - crop.right)));
  const sh = Math.max(2, Math.floor(videoHeight * (1 - crop.top - crop.bottom)));
  const width = Math.max(2, Math.floor(processingWidth));
  const height = Math.max(2, Math.floor((sh / sw) * width));

  canvasEl.width = width;
  canvasEl.height = height;

  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context missing.');

  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvasEl.toBlob((result) => resolve(result), 'image/jpeg', quality);
  });

  if (!blob) throw new Error('Failed to create JPEG blob from frame.');
  return blobToFile(blob, `frame_${Date.now()}.jpg`);
}

function setRendererSRGBOutput(renderer) {
  try {
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  } catch (_) {}
}

function setVideoTextureSRGB(texture) {
  try {
    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    if ('encoding' in texture) texture.encoding = THREE.sRGBEncoding;
  } catch (_) {}
}

function getMaskUrlForShape(shape, cdnBase = '') {
  if (shape && typeof shape === 'object') {
    const customShapeUrl =
      typeof shape.customShapeUrl === 'string' ? shape.customShapeUrl.trim() : '';
    if (customShapeUrl) return joinCdn(cdnBase, customShapeUrl);
  }

  if (Number(shape) === 1) return joinCdn(cdnBase, '/mask/mask_circle.png');
  return null;
}

function makeMaskedVideoMaterial(videoTexture, maskTexture) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uVideo: { value: videoTexture },
      uMask: { value: maskTexture },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uVideo;
      uniform sampler2D uMask;

      void main() {
        vec4 videoColor = texture2D(uVideo, vUv);
        float maskAlpha = texture2D(uMask, vUv).r;
        vec4 outputColor = vec4(videoColor.rgb, videoColor.a * maskAlpha);
        if (outputColor.a < 0.01) discard;
        gl_FragColor = outputColor;
      }
    `,
  });

  material.toneMapped = false;
  return material;
}

function getMagicResponse(action) {
  return (
    action?.payload?.response ||
    action?.payload?.data?.response ||
    action?.payload?.magic?.response ||
    action?.payload ||
    {}
  );
}

export default function MindARFrameApi({
  targetIndex: fallbackTargetIndex = 0,
  videoUrl: fallbackVideoUrl,
  processingWidth = 480,
  cropMargin = 0.12,
  cropMargins = null,
  showScanOverlay = true,
  scanOverlayText = 'Searching image...',
  scanOverlayHint = 'Keep the Gift inside the square',
  scanOverlayOpacity = 0.55,
  scanOverlayBoxSize = 600,
  overlayLogoSrc = null,
  overlayText = '',
  overlayOpacity = 0.65,
  showOverlay = true,
  previewLimit = 6,
  autoStart = false,
  mindarNoTargetTimeoutMs = 6000,
  mindarLostTimeoutMs = 3500,
  cameraMaxScanMs = 60000,
  cdnBase = 'https://d1uz3yzodmrx8t.cloudfront.net',
  stabilize = true,
  positionAlpha = 0.18,
  rotationAlpha = 0.14,
  snapOnFound = true,
  trackingLostDelayMs = 250,
  onExit = null,
  fileUrlLogo = '',
  debugFlag,
}) {
  const containerRef = useRef(null);
  const mindarRef = useRef(null);
  const cameraCaptureTimeoutRef = useRef(null);
  const cameraStopTimeoutRef = useRef(null);
  const cameraStartedAtRef = useRef(0);
  const processingCanvasRef = useRef(null);
  const scanVideoRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const uiStateRef = useRef('idle');
  const effectTokenRef = useRef(0);
  const apiInFlightRef = useRef(false);
  const anchorsRef = useRef(new Map());
  const activeTargetRef = useRef(null);
  const currentMindFileRef = useRef(null);
  const mindarNoTargetTimerRef = useRef(null);
  const mindarLostTimerRef = useRef(null);
  const mindarPlaybackCheckTimerRef = useRef(null);
  const anyMindTargetFoundRef = useRef(false);
  const soundEnabledRef = useRef(true);
  const frameShapeRef = useRef(0);
  const maskCacheRef = useRef(new Map());
  const textureLoaderRef = useRef(null);
  const switchingRef = useRef(false);
  const analyticsPostedRef = useRef(false);
  const websiteDetailsFetchAttemptsRef = useRef(0);

  const dispatch = useDispatch();
  const websiteDetails = useSelector((state) => state.custom.websiteDetails);
  const websiteDetailsLoading = useSelector((state) => state.custom.loading);

  const [uiState, setUiState] = useState('idle');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState(null);
  const [hasActiveMindTarget, setHasActiveMindTarget] = useState(false);
  const [framePreviews, setFramePreviews] = useState([]);
  const previewUrlsRef = useRef([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadEnabled, setIsDownloadEnabled] = useState(false);
  const [videoTargets, setVideoTargets] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioImageUrl, setAudioImageUrl] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [debug, setDebug] = useState({
    tick: 0,
    lastCapture: '-',
    usingMind: false,
    mindFile: '-',
    api: 'idle',
    apiHttp: '-',
    lastTargetIndex: '-',
    scanElapsed: '0s',
  });

  const hasWebsiteDetails =
    websiteDetails && typeof websiteDetails === 'object' && Object.keys(websiteDetails).length > 0;

  const setUi = (next) => {
    uiStateRef.current = next;
    setUiState(next);
  };

  const clearContainer = () => {
    if (containerRef.current) containerRef.current.innerHTML = '';
    removeMindarUiOverlays();
  };

  const clearPreviews = () => {
    try {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    } catch (_) {}
    previewUrlsRef.current = [];
    setFramePreviews([]);
  };

  const pushFramePreview = (blobOrFile) => {
    const url = URL.createObjectURL(blobOrFile);
    previewUrlsRef.current.push(url);

    setFramePreviews((prev) => {
      const limit = Math.max(1, previewLimit);
      const next = [
        { id: `${Date.now()}_${Math.random()}`, url, ts: new Date().toLocaleTimeString() },
        ...prev,
      ];
      const limited = next.slice(0, limit);
      const overflow = next.slice(limit);

      overflow.forEach((item) => {
        try {
          URL.revokeObjectURL(item.url);
        } catch (_) {}
        previewUrlsRef.current = previewUrlsRef.current.filter((storedUrl) => storedUrl !== item.url);
      });

      return limited;
    });
  };

  const clearMindarTimers = () => {
    if (mindarNoTargetTimerRef.current) {
      clearTimeout(mindarNoTargetTimerRef.current);
      mindarNoTargetTimerRef.current = null;
    }
    if (mindarLostTimerRef.current) {
      clearTimeout(mindarLostTimerRef.current);
      mindarLostTimerRef.current = null;
    }
    if (mindarPlaybackCheckTimerRef.current) {
      clearTimeout(mindarPlaybackCheckTimerRef.current);
      mindarPlaybackCheckTimerRef.current = null;
    }
  };

  const stopCameraScanTimers = () => {
    if (cameraCaptureTimeoutRef.current) {
      clearTimeout(cameraCaptureTimeoutRef.current);
      cameraCaptureTimeoutRef.current = null;
    }
    if (cameraStopTimeoutRef.current) {
      clearTimeout(cameraStopTimeoutRef.current);
      cameraStopTimeoutRef.current = null;
    }
  };

  const stopScannerVideo = async () => {
    if (scanVideoRef.current) {
      try {
        const stream = scanVideoRef.current.srcObject;
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (_) {}
      try {
        scanVideoRef.current.pause();
      } catch (_) {}
      try {
        scanVideoRef.current.srcObject = null;
      } catch (_) {}
      scanVideoRef.current = null;
    }
  };

  const stopAllMindarAnchors = () => {
    try {
      for (const [, obj] of anchorsRef.current.entries()) {
        try {
          clearTimeout(obj?.lostTimer);
        } catch (_) {}
        try {
          obj?.overlayVideo?.pause?.();
        } catch (_) {}
        try {
          if (obj?.overlayVideo) obj.overlayVideo.src = '';
        } catch (_) {}
        try {
          obj?.overlayVideo?.load?.();
        } catch (_) {}
        try {
          obj?.videoTexture?.dispose?.();
        } catch (_) {}
        try {
          obj?.maskTexture?.dispose?.();
        } catch (_) {}
        try {
          obj?.plane?.material?.map?.dispose?.();
        } catch (_) {}
        try {
          obj?.plane?.material?.dispose?.();
        } catch (_) {}
        try {
          obj?.plane?.geometry?.dispose?.();
        } catch (_) {}
        try {
          obj?.scene?.remove?.(obj?.smoothGroup);
        } catch (_) {}
      }
    } catch (_) {}

    anchorsRef.current = new Map();
    activeTargetRef.current = null;
    setHasActiveMindTarget(false);
  };

  const stopAudioPlayer = () => {
    try {
      audioPlayerRef.current?.pause?.();
    } catch (_) {}
    try {
      if (audioPlayerRef.current) audioPlayerRef.current.currentTime = 0;
    } catch (_) {}
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.removeAttribute('src');
        audioPlayerRef.current.load();
      }
    } catch (_) {}
    setAudioUrl(null);
    setAudioImageUrl(null);
  };

  const tryPlayAudio = async () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;

    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      setStatus('Playing audio...');
    } catch (_) {
      setStatus('Tap play to start audio.');
    }
  };

  const hasAnyTargetPlaying = () => {
    try {
      return Array.from(anchorsRef.current.values()).some(
        (anchor) => anchor?.overlayVideo && !anchor.overlayVideo.paused
      );
    } catch (_) {
      return false;
    }
  };

  const pauseAllExcept = async (keepTargetIndex) => {
    for (const [targetIndex, obj] of anchorsRef.current.entries()) {
      if (!obj?.overlayVideo || targetIndex === keepTargetIndex) continue;

      try {
        obj.overlayVideo.pause();
      } catch (_) {}
      try {
        obj.overlayVideo.muted = true;
      } catch (_) {}
    }
  };

  const updateStabilization = () => {
    if (!stabilize) return;

    const aPos = Math.max(0.001, Math.min(1, positionAlpha));
    const aRot = Math.max(0.001, Math.min(1, rotationAlpha));

    for (const [, obj] of anchorsRef.current.entries()) {
      if (!obj?.isFound) continue;
      if (!obj?.anchor?.group || !obj?.smoothGroup) continue;

      obj.anchor.group.updateMatrixWorld(true);
      obj.tmpMat.copy(obj.anchor.group.matrixWorld);
      obj.tmpMat.decompose(obj.tmpPos, obj.tmpQuat, obj.tmpScale);

      if (obj.needsSnap) {
        obj.smoothGroup.position.copy(obj.tmpPos);
        obj.smoothGroup.quaternion.copy(obj.tmpQuat);
        obj.smoothGroup.scale.copy(obj.tmpScale);
        obj.needsSnap = false;
        continue;
      }

      obj.smoothGroup.position.lerp(obj.tmpPos, aPos);
      obj.smoothGroup.quaternion.slerp(obj.tmpQuat, aRot);
      obj.smoothGroup.scale.lerp(obj.tmpScale, aPos);
    }
  };

  const teardownMindAROnly = async () => {
    clearMindarTimers();
    stopAllMindarAnchors();

    const mindarThree = mindarRef.current;
    mindarRef.current = null;
    currentMindFileRef.current = null;

    if (mindarThree) {
      await hardTeardownMindAR(mindarThree, containerRef.current);
    } else {
      hardStopAllVideoStreams(containerRef.current);
      clearContainer();
      removeMindarUiOverlays();
    }

    setDebug((prev) => ({ ...prev, usingMind: false, mindFile: '-' }));
  };

  const closeToIdle = async (reason = 'Stopped') => {
    if (switchingRef.current) return;
    switchingRef.current = true;

    try {
      stopCameraScanTimers();
      clearMindarTimers();
      stopAudioPlayer();
      await stopScannerVideo();
      await teardownMindAROnly();

      apiInFlightRef.current = false;
      anyMindTargetFoundRef.current = false;
      clearPreviews();
      clearContainer();
      setError(null);
      setStatus(reason);
      setDebug({
        usingMind: false,
        mindFile: '-',
        api: 'idle',
        apiHttp: '-',
        lastTargetIndex: '-',
        tick: 0,
        lastCapture: '-',
        scanElapsed: '0s',
      });
      setHasActiveMindTarget(false);
      setUi('idle');
    } finally {
      switchingRef.current = false;
    }
  };

  const returnToCameraLoop = async (reason = 'Returning to camera...') => {
    if (switchingRef.current) return;
    switchingRef.current = true;

    try {
      setStatus(reason);
      setUi('switching');
      stopCameraScanTimers();
      stopAudioPlayer();
      await teardownMindAROnly();
      apiInFlightRef.current = false;
      anyMindTargetFoundRef.current = false;
      setError(null);
      setHasActiveMindTarget(false);
      await startCameraOnly();
    } finally {
      switchingRef.current = false;
    }
  };

  const handleDownloadVideos = async () => {
    if (isDownloading) return;

    const activeTargetIndex = activeTargetRef.current;
    const activeAnchor = activeTargetIndex != null ? anchorsRef.current.get(activeTargetIndex) : null;
    const activeVideoUrl =
      activeAnchor?.overlayVideo?.currentSrc ||
      activeAnchor?.overlayVideo?.src ||
      (Array.isArray(videoTargets)
        ? videoTargets.find((target) => target?.targetIndex === activeTargetIndex)?.videoUrl
        : null);

    if (!activeVideoUrl) {
      setStatus('Show a target to download its current video.');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);
    setStatus('Preparing download...');

    try {
      const fallbackName = `video-${(activeTargetIndex ?? 0) + 1}.mp4`;
      const response = await fetch(activeVideoUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`Failed to download ${fallbackName}`);

      let blob;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        const totalBytes = Number(response.headers.get('content-length')) || 0;
        let loadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loadedBytes += value.length;
          }

          if (totalBytes > 0) {
            setDownloadProgress(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));
          }
        }

        blob = new Blob(chunks);
      } else {
        blob = await response.blob();
        setDownloadProgress(99);
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = ensureMp4FileName(
        activeVideoUrl.split('/').pop()?.split('?')[0],
        fallbackName
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);

      setDownloadProgress(100);
      setStatus('Download started.');
    } catch (_) {
      const fallbackName = `video-${(activeTargetIndex ?? 0) + 1}.mp4`;
      const link = document.createElement('a');
      link.href = activeVideoUrl;
      link.setAttribute('download', fallbackName);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatus('Download started.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleFullscreenVideo = async () => {
    const active = activeTargetRef.current;
    const activeAnchor = active == null ? null : anchorsRef.current.get(active);
    const video = activeAnchor?.overlayVideo;
    const videoSrc = video?.currentSrc || video?.src;

    if (!video || !videoSrc) {
      setStatus('Show a target to open video fullscreen.');
      return;
    }

    const isIOSLike =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    if (isIOSLike) {
      let overlay = null;
      let fullscreenVideo = null;
      let cleanedUp = false;

      const cleanupIOSFullscreen = async () => {
        if (cleanedUp) return;
        cleanedUp = true;

        try {
          if (fullscreenVideo && Number.isFinite(fullscreenVideo.currentTime)) {
            video.currentTime = fullscreenVideo.currentTime;
          }
        } catch (_) {}

        try {
          fullscreenVideo?.pause?.();
        } catch (_) {}

        try {
          overlay?.remove?.();
        } catch (_) {}

        if (activeTargetRef.current === active && hasActiveMindTarget) {
          try {
            await video.play();
          } catch (_) {}
        }
      };

      try {
        overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '2147483647';
        overlay.style.background = '#000';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.pointerEvents = 'auto';

        fullscreenVideo = document.createElement('video');
        fullscreenVideo.src = videoSrc;
        fullscreenVideo.loop = video.loop;
        fullscreenVideo.muted = video.muted;
        fullscreenVideo.volume = video.volume;
        fullscreenVideo.controls = true;
        fullscreenVideo.playsInline = true;
        fullscreenVideo.crossOrigin = video.crossOrigin || 'anonymous';
        fullscreenVideo.setAttribute('playsinline', 'true');
        fullscreenVideo.setAttribute('webkit-playsinline', 'true');
        fullscreenVideo.style.width = '100vw';
        fullscreenVideo.style.height = '100vh';
        fullscreenVideo.style.objectFit = 'contain';
        fullscreenVideo.style.background = '#000';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.innerText = 'Close';
        closeButton.style.position = 'fixed';
        closeButton.style.top = 'calc(env(safe-area-inset-top, 0px) + 12px)';
        closeButton.style.right = '12px';
        closeButton.style.zIndex = '2147483647';
        closeButton.style.padding = '10px 14px';
        closeButton.style.borderRadius = '14px';
        closeButton.style.border = '1px solid rgba(255,255,255,0.28)';
        closeButton.style.background = 'rgba(17,17,17,0.72)';
        closeButton.style.color = '#fff';
        closeButton.style.fontWeight = '800';
        closeButton.style.touchAction = 'manipulation';
        closeButton.addEventListener('click', cleanupIOSFullscreen);

        overlay.appendChild(fullscreenVideo);
        overlay.appendChild(closeButton);
        document.body.appendChild(overlay);

        try {
          fullscreenVideo.currentTime = video.currentTime || 0;
        } catch (_) {}

        try {
          video.pause();
        } catch (_) {}

        const playPromise = fullscreenVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => setStatus('Tap play to start fullscreen video.'));
        }

        return;
      } catch (e) {
        console.warn('iOS fullscreen overlay failed:', e);
        await cleanupIOSFullscreen();
      }
    }

    if (typeof video.webkitEnterFullscreen === 'function') {
      try {
        video.webkitEnterFullscreen();
        return;
      } catch (e) {
        console.warn('Direct iOS fullscreen failed, trying connected video fallback:', e);
      }
    }

    let fullscreenVideo = null;
    let cleanedUp = false;

    const cleanupFullscreenVideo = async () => {
      if (cleanedUp) return;
      cleanedUp = true;

      try {
        if (fullscreenVideo && Number.isFinite(fullscreenVideo.currentTime)) {
          video.currentTime = fullscreenVideo.currentTime;
        }
      } catch (_) {}

      try {
        fullscreenVideo?.pause?.();
      } catch (_) {}

      try {
        fullscreenVideo?.remove?.();
      } catch (_) {}

      if (activeTargetRef.current === active && hasActiveMindTarget) {
        try {
          await video.play();
        } catch (_) {}
      }
    };

    try {
      fullscreenVideo = document.createElement('video');
      fullscreenVideo.src = videoSrc;
      fullscreenVideo.loop = video.loop;
      fullscreenVideo.muted = video.muted;
      fullscreenVideo.volume = video.volume;
      fullscreenVideo.controls = true;
      fullscreenVideo.crossOrigin = video.crossOrigin || 'anonymous';
      fullscreenVideo.style.position = 'fixed';
      fullscreenVideo.style.inset = '0';
      fullscreenVideo.style.width = '100vw';
      fullscreenVideo.style.height = '100vh';
      fullscreenVideo.style.objectFit = 'contain';
      fullscreenVideo.style.background = '#000';
      fullscreenVideo.style.zIndex = '2147483647';
      fullscreenVideo.style.pointerEvents = 'auto';

      document.body.appendChild(fullscreenVideo);

      try {
        fullscreenVideo.currentTime = video.currentTime || 0;
      } catch (_) {}

      try {
        video.pause();
      } catch (_) {}

      fullscreenVideo.load();
      const playPromise = fullscreenVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }

      if (typeof fullscreenVideo.webkitEnterFullscreen === 'function') {
        const handleWebkitFullscreenEnd = () => {
          fullscreenVideo.removeEventListener('webkitendfullscreen', handleWebkitFullscreenEnd);
          cleanupFullscreenVideo();
        };

        fullscreenVideo.addEventListener('webkitendfullscreen', handleWebkitFullscreenEnd);
        fullscreenVideo.webkitEnterFullscreen();
        return;
      }

      if (typeof fullscreenVideo.requestFullscreen === 'function') {
        const handleFullscreenChange = () => {
          if (!document.fullscreenElement) {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            cleanupFullscreenVideo();
          }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        await fullscreenVideo.requestFullscreen();
        return;
      }

      await cleanupFullscreenVideo();
      setStatus('Fullscreen is not supported by this browser.');
    } catch (e) {
      console.warn('Fullscreen video failed:', e);
      await cleanupFullscreenVideo();
      setStatus('Tap again to open fullscreen video.');
    }
  };

  const enableSound = async () => {
    soundEnabledRef.current = true;
    setSoundEnabled(true);

    const active = activeTargetRef.current;
    const video = active == null ? null : anchorsRef.current.get(active)?.overlayVideo;
    if (!video) {
      setStatus('Sound enabled (show a target)');
      return;
    }

    try {
      video.muted = false;
      video.volume = 1;
      await video.play();
      setStatus('Sound enabled');
    } catch (_) {}
  };

  const handleSoundToggle = async () => {
    const nextEnabled = !soundEnabledRef.current;
    if (nextEnabled) {
      await enableSound();
      return;
    }

    soundEnabledRef.current = false;
    setSoundEnabled(false);

    try {
      for (const [, obj] of anchorsRef.current.entries()) {
        if (obj?.overlayVideo) obj.overlayVideo.muted = true;
      }
      setStatus('Sound muted.');
    } catch (_) {}
  };

  const getMaskTexture = async (url) => {
    if (!url) return null;

    const cached = maskCacheRef.current.get(url);
    if (cached) return cached;

    if (!textureLoaderRef.current) {
      const loader = new THREE.TextureLoader();
      try {
        loader.setCrossOrigin('anonymous');
      } catch (_) {}
      textureLoaderRef.current = loader;
    }

    const texture = await new Promise((resolve, reject) => {
      textureLoaderRef.current.load(url, resolve, undefined, reject);
    });

    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    maskCacheRef.current.set(url, texture);
    return texture;
  };

  const postArAnalytics = async ({ customerCode = '', customerId = 0 } = {}) => {
    if (analyticsPostedRef.current || typeof window === 'undefined') return;

    const link = buildAnalyticsLink();
    if (!link) return;

    const normalizedCustomerCode = normalizeAnalyticsCustomerCode(customerCode);
    const normalizedCustomerId = normalizeAnalyticsCustomerId(customerId);
    const analyticsCustomerKey = normalizedCustomerCode || normalizedCustomerId;
    const sessionKey = `${AR_ANALYTICS_SESSION_PREFIX}${link}::${analyticsCustomerKey}`;

    try {
      if (window.sessionStorage.getItem(sessionKey) === '1') {
        analyticsPostedRef.current = true;
        return;
      }
    } catch (_) {}

    analyticsPostedRef.current = true;

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    if (!apiBaseUrl) return;

    const payload = {
      link,
      imageRecognizeCount: 1,
      customerCode: normalizedCustomerCode,
      customerId: normalizedCustomerId,
      event: {
        device: window.navigator?.userAgent || window.navigator?.platform || 'unknown',
        ipAddress: '',
        location: window.location?.hostname || '',
        // Location permission disabled for now.
        locationLatitude: '',
        locationLongitude: '',
      },
    };

    try {
      const tenantId = getAnalyticsTenantId();
      const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/common/ar/analytic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AR analytics failed with status ${response.status}`);
      }

      try {
        window.sessionStorage.setItem(sessionKey, '1');
      } catch (_) {}
    } catch (err) {
      analyticsPostedRef.current = false;
      console.warn('AR analytics post failed:', err);
    }
  };

  async function dummyMindLookupApi({ frameFile }) {
    const payload = {
      frameShape: 0,
      formData: frameFile,
      mobileFlag: isMobileLike(),
    };

    const action = await dispatch(checkImage(payload));
    if (action?.error) return { httpStatus: 500, ok: false };

    const resp = getMagicResponse(action);
    const shapeVal = typeof resp?.frameShape === 'number' ? resp.frameShape : 0;
    const customerCode = normalizeAnalyticsCustomerCode(
      resp?.customerCode ?? resp?.customer?.customerCode ?? resp?.code
    );
    const customerId = normalizeAnalyticsCustomerId(
      resp?.customerId ?? resp?.customer?.customerId ?? resp?.userId ?? resp?.customer?.id
    );
    frameShapeRef.current = shapeVal;

    const mindPathRaw = resp?.mindFile;
    const mindPath = Array.isArray(mindPathRaw) ? mindPathRaw[0] : mindPathRaw;
    const mindFileUrl = mindPath ? joinCdn(cdnBase, mindPath) : null;
    const targetVideosRaw = Array.isArray(resp?.videoUrlV1)
      ? resp.videoUrlV1
      : resp?.videoUrlV1
        ? [resp.videoUrlV1]
        : [];
    const responseTargetImageUrl = joinCdn(
      cdnBase,
      resp?.imageUrl || resp?.image || resp?.thumbnailUrl || resp?.thumbnail || resp?.coverUrl
    );
    const normalizedTargetVideosBase = targetVideosRaw
      .map((item, index) => {
        if (typeof item === 'string') {
          return {
            targetIndex: index,
            videoUrl: joinCdn(cdnBase, item),
            shape: shapeVal,
            targetImageUrl: responseTargetImageUrl,
          };
        }

        if (!item || typeof item !== 'object') return null;
        if (item.audioUrl) return null;

        return {
          targetIndex: typeof item.targetIndex === 'number' ? item.targetIndex : index,
          videoUrl: joinCdn(cdnBase, item.videoUrl || item.url || item.videoUrlV1 || item.video),
          shape: item.shape ?? shapeVal,
          targetImageUrl: joinCdn(
            cdnBase,
            item.imageUrl || item.image || item.thumbnailUrl || item.thumbnail || item.coverUrl
          ),
        };
      })
      .filter((item) => !!item?.videoUrl);
    const normalizedTargetVideos = await Promise.all(
      normalizedTargetVideosBase.map(async (item) => ({
        ...item,
        targetSize: await getImageSize(item.targetImageUrl),
      }))
    );
    const normalizedAudioUrls = targetVideosRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return joinCdn(cdnBase, item.audioUrl || item.audio);
      })
      .filter(Boolean);
    const normalizedAudioImageUrls = targetVideosRaw
      .map((item) => {
        if (!item || typeof item !== 'object' || !(item.audioUrl || item.audio)) return null;
        return joinCdn(
          cdnBase,
          item.imageUrl || item.image || item.thumbnailUrl || item.thumbnail || item.coverUrl
        );
      })
      .filter(Boolean);
    const legacyAudioUrl = resp?.audioUrl ? joinCdn(cdnBase, resp.audioUrl) : null;
    const legacyAudioImageUrl = resp?.imageUrl
      ? joinCdn(cdnBase, resp.imageUrl)
      : joinCdn(cdnBase, resp?.image || resp?.thumbnailUrl || resp?.thumbnail || resp?.coverUrl);

    const legacyVideoUrl = resp?.videoUrl ? joinCdn(cdnBase, resp.videoUrl) : null;
    if (normalizedTargetVideos.length === 0 && legacyVideoUrl) {
      normalizedTargetVideos.push({
        targetIndex: typeof resp?.targetIndex === 'number' ? resp.targetIndex : 0,
        videoUrl: legacyVideoUrl,
        shape: shapeVal,
        targetImageUrl: responseTargetImageUrl,
        targetSize: await getImageSize(responseTargetImageUrl),
      });
    }

    frameShapeRef.current = normalizedTargetVideos[0]?.shape ?? shapeVal;
    setVideoTargets(normalizedTargetVideos);
    setIsDownloadEnabled(Boolean(resp?.isDownloadEnabled));

    const targetIndexes = Array.isArray(resp?.targetIndexes)
      ? resp.targetIndexes.filter((targetIndex) => typeof targetIndex === 'number')
      : [];

    return {
      httpStatus: 200,
      ok: !!mindFileUrl,
      mindFiles: mindFileUrl ? [mindFileUrl] : [],
      targetVideos: normalizedTargetVideos,
      audioUrl: normalizedAudioUrls[0] || legacyAudioUrl || null,
      imageUrl: normalizedAudioImageUrls[0] || legacyAudioImageUrl || null,
      legacyTargetIndex: typeof resp?.targetIndex === 'number' ? resp.targetIndex : null,
      targetIndexes,
      frameShape: shapeVal,
      customerCode,
      customerId,
    };
  }

  const openAudioPlayer = async (nextAudioUrl, nextImageUrl = null) => {
    if (!nextAudioUrl) throw new Error('audioUrl is required.');

    stopCameraScanTimers();
    clearMindarTimers();
    await stopScannerVideo();
    await teardownMindAROnly();
    clearPreviews();
    clearContainer();
    setHasActiveMindTarget(false);
    setError(null);

    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = nextAudioUrl;
        audioPlayerRef.current.load();
      }
    } catch (_) {}

    setAudioUrl(nextAudioUrl);
    setAudioImageUrl(nextImageUrl);
    setUi('audio');
    setStatus('Playing audio...');
    setTimeout(() => {
      tryPlayAudio();
    }, 0);
  };

  const tryApiForMindFile = async ({ frameFile }) => {
    if (uiStateRef.current !== 'running' || apiInFlightRef.current) return;

    apiInFlightRef.current = true;
    setDebug((prev) => ({ ...prev, api: 'calling', apiHttp: '-' }));

    try {
      setStatus('Calling API...');
      const res = await dummyMindLookupApi({ frameFile });
      const httpStatus = res?.httpStatus ?? (res?.ok ? 200 : 500);
      setDebug((prev) => ({ ...prev, apiHttp: String(httpStatus) }));

      if (httpStatus === 200 && res?.audioUrl) {
        setDebug((prev) => ({
          ...prev,
          api: 'ok',
          mindFile: '-',
          lastTargetIndex: 'audio',
        }));
        setStatus('Found audio. Opening player...');
        postArAnalytics({ customerCode: res?.customerCode, customerId: res?.customerId });
        await openAudioPlayer(res.audioUrl, res.imageUrl);
        return;
      }

      const ok200 =
        httpStatus === 200 &&
        res?.ok === true &&
        Array.isArray(res.mindFiles) &&
        res.mindFiles.length > 0;

      if (!ok200) {
        setDebug((prev) => ({ ...prev, api: 'non-200' }));
        setStatus('Searching image...');
        return;
      }

      const mindFile = res.mindFiles[0];
      let targetVideos = Array.isArray(res?.targetVideos) ? res.targetVideos : [];

      if (targetVideos.length === 0 && fallbackVideoUrl) {
        const idx =
          typeof res?.legacyTargetIndex === 'number'
            ? res.legacyTargetIndex
            : Array.isArray(res?.targetIndexes) && typeof res.targetIndexes[0] === 'number'
              ? res.targetIndexes[0]
              : fallbackTargetIndex;

        targetVideos = [{
          targetIndex: idx,
          videoUrl: fallbackVideoUrl,
          shape: res?.frameShape ?? 0,
          targetSize: DEFAULT_TARGET_SIZE,
        }];
      }

      const idxLabel = targetVideos.map((target) => target.targetIndex).join(',');
      setDebug((prev) => ({
        ...prev,
        api: 'ok',
        mindFile,
        lastTargetIndex: idxLabel || '-',
      }));
      setStatus('Found. Loading AR...');
      postArAnalytics({ customerCode: res?.customerCode, customerId: res?.customerId });

      await startMindARWithMindFile(mindFile, targetVideos);
    } catch (e) {
      console.error(e);
      setDebug((prev) => ({ ...prev, api: 'err', apiHttp: 'ERR' }));
      setStatus('Searching image...');
    } finally {
      apiInFlightRef.current = false;
    }
  };

  const addOrUpdateAnchorVideo = async ({
    targetIndex,
    videoUrl,
    shape = 0,
    targetSize = DEFAULT_TARGET_SIZE,
  }) => {
    if (!mindarRef.current) return;
    if (!videoUrl) throw new Error('videoUrl is required for overlay.');

    const existing = anchorsRef.current.get(targetIndex);
    if (existing?.overlayVideo) {
      const video = existing.overlayVideo;
      try {
        video.pause();
      } catch (_) {}
      video.src = videoUrl;
      video.loop = true;
      video.muted = !soundEnabledRef.current;
      video.volume = 1;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.load();
      await waitForVideoMetadataSoft(video);
      const nextAspect =
        video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      const safeTargetSize =
        targetSize &&
        Number.isFinite(targetSize.width) &&
        Number.isFinite(targetSize.height) &&
        targetSize.width > 0 &&
        targetSize.height > 0
          ? targetSize
          : DEFAULT_TARGET_SIZE;
      const planeWidth = safeTargetSize.width * TARGET_VIDEO_OVERSCAN;
      const planeHeight = safeTargetSize.height * TARGET_VIDEO_OVERSCAN;
      applyTextureCover(existing.videoTexture, nextAspect, planeWidth / planeHeight);
      try {
        existing.plane.geometry.dispose();
      } catch (_) {}
      existing.plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      try {
        video.pause();
      } catch (_) {}
      return;
    }

    const overlayVideo = document.createElement('video');
    overlayVideo.src = videoUrl;
    overlayVideo.loop = true;
    overlayVideo.muted = !soundEnabledRef.current;
    overlayVideo.volume = 1;
    overlayVideo.playsInline = true;
    overlayVideo.preload = 'auto';
    overlayVideo.crossOrigin = 'anonymous';
    overlayVideo.setAttribute('playsinline', 'true');
    overlayVideo.setAttribute('webkit-playsinline', 'true');
    overlayVideo.disablePictureInPicture = true;

    overlayVideo.load();
    await waitForVideoMetadataSoft(overlayVideo);
    try {
      overlayVideo.pause();
    } catch (_) {}

    const aspect =
      overlayVideo.videoWidth && overlayVideo.videoHeight
        ? overlayVideo.videoWidth / overlayVideo.videoHeight
        : 16 / 9;
    const videoTexture = new THREE.VideoTexture(overlayVideo);
    setVideoTextureSRGB(videoTexture);
    const safeTargetSize =
      targetSize &&
      Number.isFinite(targetSize.width) &&
      Number.isFinite(targetSize.height) &&
      targetSize.width > 0 &&
      targetSize.height > 0
        ? targetSize
        : DEFAULT_TARGET_SIZE;
    const planeWidth = safeTargetSize.width * TARGET_VIDEO_OVERSCAN;
    const planeHeight = safeTargetSize.height * TARGET_VIDEO_OVERSCAN;
    applyTextureCover(videoTexture, aspect, planeWidth / planeHeight);

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    let material = null;
    let maskTexture = null;
    const maskUrl = getMaskUrlForShape(shape, cdnBase);

    if (maskUrl) {
      try {
        maskTexture = await getMaskTexture(maskUrl);
      } catch (e) {
        console.warn('Failed to load mask texture, falling back to normal material', e);
      }

      if (maskTexture) material = makeMaskedVideoMaterial(videoTexture, maskTexture);
    }

    if (!material) {
      material = new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: THREE.DoubleSide,
        transparent: true,
      });
      material.toneMapped = false;
    }

    const plane = new THREE.Mesh(geometry, material);
    const anchor = mindarRef.current.addAnchor(targetIndex);
    const scene = mindarRef.current.scene;

    const smoothGroup = new THREE.Group();
    scene.add(smoothGroup);
    smoothGroup.add(plane);
    smoothGroup.visible = false;

    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();

    const stateObj = {
      anchor,
      overlayVideo,
      videoTexture,
      plane,
      maskTexture,
      shape,
      scene,
      smoothGroup,
      isFound: false,
      needsSnap: true,
      lostTimer: null,
      tmpMat,
      tmpPos,
      tmpQuat,
      tmpScale,
    };

    anchor.onTargetFound = async () => {
      clearTimeout(stateObj.lostTimer);
      stateObj.lostTimer = null;
      clearTimeout(mindarLostTimerRef.current);
      mindarLostTimerRef.current = null;
      clearTimeout(mindarPlaybackCheckTimerRef.current);
      mindarPlaybackCheckTimerRef.current = null;

      anyMindTargetFoundRef.current = true;
      activeTargetRef.current = targetIndex;
      stateObj.isFound = true;
      stateObj.smoothGroup.visible = true;
      stateObj.needsSnap = !!snapOnFound;
      setHasActiveMindTarget(true);
      await pauseAllExcept(targetIndex);
      setStatus(`Target ${targetIndex} detected`);

      try {
        overlayVideo.muted = !soundEnabledRef.current;
        overlayVideo.volume = 1;
      } catch (_) {}

      try {
        await overlayVideo.play();
      } catch (e) {
        console.warn('play() blocked on target found:', e);
        try {
          overlayVideo.muted = true;
        } catch (_) {}
        soundEnabledRef.current = false;
        setSoundEnabled(false);
        setStatus('Audio blocked by browser. Playing muted.');
        try {
          await overlayVideo.play();
        } catch (_) {}
      }

      mindarPlaybackCheckTimerRef.current = setTimeout(() => {
        if (uiStateRef.current !== 'mindar') return;

        if (overlayVideo.paused && !hasAnyTargetPlaying()) {
          returnToCameraLoop('Video did not start. Scanning again...');
          return;
        }

        clearTimeout(mindarNoTargetTimerRef.current);
        mindarNoTargetTimerRef.current = null;
      }, 1200);
    };

    anchor.onTargetLost = () => {
      stateObj.isFound = false;
      stateObj.needsSnap = true;
      setStatus(`Target ${targetIndex} stabilizing...`);

      clearTimeout(stateObj.lostTimer);
      clearTimeout(mindarLostTimerRef.current);
      stateObj.lostTimer = setTimeout(() => {
        if (stateObj.isFound) return;

        stateObj.smoothGroup.visible = false;

        try {
          overlayVideo.pause();
        } catch (_) {}

        if (activeTargetRef.current === targetIndex) activeTargetRef.current = null;
        setHasActiveMindTarget(false);
        setStatus(`Target ${targetIndex} lost. Point at the target again...`);
      }, Math.max(0, trackingLostDelayMs));

      mindarLostTimerRef.current = setTimeout(() => {
        if (uiStateRef.current === 'mindar' && activeTargetRef.current == null && !hasAnyTargetPlaying()) {
          returnToCameraLoop('Target lost. Scanning again...');
        }
      }, Math.max(500, mindarLostTimeoutMs));
    };

    anchorsRef.current.set(targetIndex, stateObj);
  };

  const startMindARWithMindFile = async (mindFile, targetVideos) => {
    if (!containerRef.current) throw new Error('Container missing');
    if (!mindFile) throw new Error('mindFile URL missing');

    stopCameraScanTimers();
    await stopScannerVideo();

    if (mindarRef.current) await teardownMindAROnly();

    clearContainer();
    clearMindarTimers();
    stopAllMindarAnchors();
    anyMindTargetFoundRef.current = false;
    setHasActiveMindTarget(false);
    removeMindarUiOverlays();
    setUi('mindar');
    currentMindFileRef.current = mindFile;

    try {
      setError(null);

      const mindarThree = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: mindFile,
      });
      mindarRef.current = mindarThree;

      const { renderer, scene, camera } = mindarThree;

      try {
        if (THREE.ColorManagement && 'enabled' in THREE.ColorManagement) {
          THREE.ColorManagement.enabled = true;
        }
      } catch (_) {}

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      setRendererSRGBOutput(renderer);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.inset = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.zIndex = '1';
      renderer.domElement.style.pointerEvents = 'none';
      renderer.domElement.style.touchAction = 'none';

      if (!Array.isArray(targetVideos) || targetVideos.length === 0) {
        throw new Error('No targetVideos provided.');
      }

      setStatus('Preparing AR video...');
      for (const targetVideo of targetVideos) {
        const targetIndex =
          typeof targetVideo?.targetIndex === 'number' ? targetVideo.targetIndex : 0;
        const vurl = targetVideo?.videoUrl || fallbackVideoUrl;
        if (!vurl) throw new Error('videoUrl is required.');

        await addOrUpdateAnchorVideo({
          targetIndex,
          videoUrl: vurl,
          shape: targetVideo?.shape ?? 0,
          targetSize: targetVideo?.targetSize ?? DEFAULT_TARGET_SIZE,
        });
      }

      setDebug((prev) => ({ ...prev, usingMind: true, mindFile }));
      setStatus('Opening camera (MindAR)...');
      await mindarThree.start();

      const mindVideoEl = containerRef.current.querySelector('video');
      if (mindVideoEl) {
        mindVideoEl.style.position = 'absolute';
        mindVideoEl.style.inset = '0';
        mindVideoEl.style.width = '100%';
        mindVideoEl.style.height = '100%';
        mindVideoEl.style.objectFit = 'cover';
        mindVideoEl.style.zIndex = '0';
        mindVideoEl.style.display = 'block';
        mindVideoEl.style.pointerEvents = 'none';
        mindVideoEl.style.touchAction = 'none';
      }

      clearTimeout(mindarNoTargetTimerRef.current);
      mindarNoTargetTimerRef.current = setTimeout(() => {
        if (!hasAnyTargetPlaying()) {
          returnToCameraLoop('Target not found in AR. Scanning again...');
        }
      }, Math.max(1000, mindarNoTargetTimeoutMs));

      renderer.setAnimationLoop(() => {
        updateStabilization();
        renderer.render(scene, camera);
      });

      setStatus('Point at the target image...');
    } catch (e) {
      setDebug((prev) => ({ ...prev, usingMind: false }));
      setError(e?.message || 'MindAR start failed.');

      try {
        await teardownMindAROnly();
      } catch (_) {}

      await startCameraOnly();
      throw e;
    }
  };

  const scheduleNextCameraCapture = () => {
    if (uiStateRef.current !== 'running') return;

    const now = Date.now();
    const elapsed = now - (cameraStartedAtRef.current || now);
    const remaining = cameraMaxScanMs - elapsed;
    setDebug((prev) => ({ ...prev, scanElapsed: `${Math.floor(elapsed / 1000)}s` }));

    if (remaining <= 0) {
      closeToIdle('Auto-stopped (1 minute).');
      return;
    }

    const delay = Math.min(2000, remaining);
    cameraCaptureTimeoutRef.current = setTimeout(async () => {
      try {
        if (uiStateRef.current !== 'running') return;
        if (!scanVideoRef.current || !processingCanvasRef.current) return;
        if (apiInFlightRef.current) return;

        const frameFile = await captureVideoFrameToJpegFile({
          videoEl: scanVideoRef.current,
          canvasEl: processingCanvasRef.current,
          processingWidth,
          quality: 0.85,
          cropMargin,
          cropMargins,
        });

        pushFramePreview(frameFile);
        setDebug((prev) => ({
          ...prev,
          tick: (prev.tick || 0) + 1,
          lastCapture: new Date().toLocaleTimeString(),
        }));

        await tryApiForMindFile({ frameFile });
      } catch (_) {
      } finally {
        scheduleNextCameraCapture();
      }
    }, Math.max(250, delay));
  };

  async function startCameraOnly() {
    if (!containerRef.current) return;
    if (uiStateRef.current === 'running') return;

    setError(null);
    setUi('running');
    setHasActiveMindTarget(false);
    setStatus('Searching image...');
    clearPreviews();
    stopCameraScanTimers();
    clearMindarTimers();
    stopAudioPlayer();
    removeMindarUiOverlays();
    setDebug((prev) => ({
      ...prev,
      usingMind: false,
      mindFile: '-',
      api: 'idle',
      apiHttp: '-',
      lastTargetIndex: '-',
      tick: 0,
      lastCapture: '-',
      scanElapsed: '0s',
    }));
    apiInFlightRef.current = false;

    try {
      clearContainer();

      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = false;
      video.autoplay = true;
      video.style.position = 'absolute';
      video.style.inset = '0';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.zIndex = '0';
      video.style.pointerEvents = 'none';
      video.style.touchAction = 'none';

      containerRef.current.appendChild(video);
      scanVideoRef.current = video;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;

      await new Promise((resolve) => {
        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady);
      });

      if (!processingCanvasRef.current) processingCanvasRef.current = document.createElement('canvas');
      cameraStartedAtRef.current = Date.now();
      cameraStopTimeoutRef.current = setTimeout(() => {
        if (uiStateRef.current === 'running') closeToIdle('Auto-stopped (1 minute).');
      }, Math.max(1000, cameraMaxScanMs));
      scheduleNextCameraCapture();
    } catch (e) {
      setError(e?.message || 'Failed to start camera.');
      await closeToIdle('Camera failed.');
    }
  }

  const handleExit = async () => {
    await closeToIdle('Exited.');
    try {
      if (typeof onExit === 'function') {
        onExit();
        return;
      }
    } catch (_) {}
    try {
      window.location.assign('/');
    } catch (_) {}
  };

  useEffect(() => {
    const token = ++effectTokenRef.current;
    if (autoStart) startCameraOnly();

    return () => {
      setTimeout(() => {
        if (effectTokenRef.current === token) closeToIdle('Stopped.');
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasWebsiteDetails) {
      websiteDetailsFetchAttemptsRef.current = 0;
      return;
    }

    if (websiteDetailsLoading || websiteDetailsFetchAttemptsRef.current >= 2) return;

    websiteDetailsFetchAttemptsRef.current += 1;
    dispatch(getWebsiteDetails());
  }, [dispatch, hasWebsiteDetails, websiteDetailsLoading]);

  useEffect(() => {
    if (uiState !== 'audio' || !audioUrl) return;

    const timer = setTimeout(() => {
      tryPlayAudio();
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, uiState]);

  const scanBoxPx = Math.max(160, Math.min(360, Number(scanOverlayBoxSize) || 260));
  const logoSrc = websiteDetails?.websiteLogoUrl
    ? `${fileUrlLogo || ''}${websiteDetails.websiteLogoUrl}`
    : overlayLogoSrc;
  const titleText = websiteDetails?.websiteTitle || overlayText;
  const hasVisibleTopOverlay =
    showOverlay &&
    (uiState === 'running' || uiState === 'mindar' || uiState === 'audio') &&
    (logoSrc || titleText);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <style jsx>{`
        @keyframes spinMindScan {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes audioGlowPulse {
          0%,
          100% {
            transform: scale(0.96);
            opacity: 0.72;
          }
          50% {
            transform: scale(1.04);
            opacity: 1;
          }
        }
      `}</style>

      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: uiState === 'idle' ? '#fff' : '#000',
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          pointerEvents: uiState === 'audio' ? 'auto' : 'none',
          opacity: uiState === 'audio' ? 1 : 0,
          visibility: uiState === 'audio' ? 'visible' : 'hidden',
          background:
            uiState === 'audio'
              ? 'radial-gradient(circle at 50% 18%, rgba(35,166,143,0.24), transparent 34%), linear-gradient(180deg, rgba(8,16,20,0.94), rgba(3,8,10,0.98))'
              : 'transparent',
        }}
        aria-hidden={uiState !== 'audio'}
      >
        <div
          style={{
            width: 'min(460px, 100%)',
            background: 'rgba(255,255,255,0.97)',
            color: '#101418',
            borderRadius: 8,
            padding: 20,
            boxShadow: '0 24px 80px rgba(0,0,0,0.42)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            border: '1px solid rgba(255,255,255,0.56)',
          }}
        >
          <div
            style={{
              width: 'min(240px, 100%)',
              aspectRatio: '1 / 1',
              alignSelf: 'center',
              borderRadius: 8,
              background:
                audioImageUrl
                  ? '#0c1114'
                  : 'linear-gradient(135deg, rgba(25,168,143,0.95), rgba(39,85,132,0.98))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
            }}
          >
            {audioImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={audioImageUrl}
                alt="Audio thumbnail"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    position: 'absolute',
                    width: 170,
                    height: 170,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.2)',
                    animation: 'audioGlowPulse 2.8s ease-in-out infinite',
                  }}
                  aria-hidden="true"
                />
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.34)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: '0 18px 42px rgba(0,0,0,0.22)',
                  }}
                  aria-hidden="true"
                >
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 18V5L20 3V16"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 18C9 19.1 7.9 20 6.5 20C5.1 20 4 19.1 4 18C4 16.9 5.1 16 6.5 16C7.9 16 9 16.9 9 18Z"
                      stroke="currentColor"
                      strokeWidth="1.9"
                    />
                    <path
                      d="M20 16C20 17.1 18.9 18 17.5 18C16.1 18 15 17.1 15 16C15 14.9 16.1 14 17.5 14C18.9 14 20 14.9 20 16Z"
                      stroke="currentColor"
                      strokeWidth="1.9"
                    />
                  </svg>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0 }}>Audio Message</div>
            <div style={{ color: '#526067', fontSize: 13, fontWeight: 700 }}>
              {status || 'Playing audio...'}
            </div>
          </div>

          <audio
            ref={audioPlayerRef}
            src={audioUrl || ''}
            controls
            autoPlay
            preload="auto"
            style={{
              width: '100%',
              height: 44,
              accentColor: '#19a88f',
            }}
            onPlay={() => setStatus('Playing audio...')}
            onPause={() => setStatus('Audio paused.')}
            onCanPlay={tryPlayAudio}
            onError={() => {
              if (audioUrl) setError('Audio cannot play.');
            }}
          />

          <button
            onClick={() => closeToIdle('Closed.')}
            style={{
              alignSelf: 'flex-end',
              background: '#101418',
              color: '#fff',
              border: '1px solid #101418',
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 800,
              touchAction: 'manipulation',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {showScanOverlay &&
        (uiState === 'running' || (uiState === 'mindar' && !hasActiveMindTarget)) && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1500,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: scanBoxPx,
                height: scanBoxPx,
                borderRadius: 18,
                border: '3px solid rgba(255,255,255,0.85)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                background: 'rgba(0,0,0,0.05)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: 22,
                  border: '2px solid rgba(255,255,255,0.18)',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -56,
                  transform: 'translateX(-50%)',
                  background: `rgba(0,0,0,${Math.min(
                    0.9,
                    Math.max(0.1, scanOverlayOpacity)
                  )})`,
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  maxWidth: '88vw',
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: 'rgba(255,255,255,0.95)',
                    animation: 'spinMindScan 0.9s linear infinite',
                  }}
                />
                <div style={{ fontWeight: 900, fontSize: 13 }}>
                  {scanOverlayText || 'Searching image...'}
                </div>
              </div>

              {!!scanOverlayHint && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -60,
                    transform: 'translateX(-50%)',
                    background: `rgba(0,0,0,${Math.min(
                      0.9,
                      Math.max(0.1, scanOverlayOpacity)
                    )})`,
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 16,
                    fontWeight: 800,
                    fontSize: 12,
                    maxWidth: '88vw',
                    textAlign: 'center',
                  }}
                >
                  {scanOverlayHint}
                </div>
              )}
            </div>
          </div>
        )}

      {hasVisibleTopOverlay && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            left: 10,
            right: 10,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'auto',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              background: `rgba(0,0,0,${Math.min(1, Math.max(0, overlayOpacity))})`,
              color: '#fff',
              padding: '8px 10px',
              borderRadius: 14,
              maxWidth: '78vw',
              overflow: 'hidden',
            }}
          >
            {logoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt="logo"
                style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }}
              />
            )}
            {titleText && (
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {titleText}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {uiState === 'mindar' && hasActiveMindTarget && (
              <button
                onClick={handleFullscreenVideo}
                style={{
                  width: 42,
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.28)',
                  background: `rgba(0,0,0,${Math.min(1, Math.max(0, overlayOpacity))})`,
                  color: '#fff',
                  touchAction: 'manipulation',
                  cursor: 'pointer',
                }}
                aria-label="Open video fullscreen"
                title="Open video fullscreen"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M8 4H4V8M16 4H20V8M20 16V20H16M8 20H4V16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}

            <button
              onClick={() => closeToIdle('Closed.')}
              style={{
                background: `rgba(0,0,0,${Math.min(1, Math.max(0, overlayOpacity))})`,
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                padding: '8px 12px',
                borderRadius: 14,
                fontWeight: 800,
                touchAction: 'manipulation',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {uiState === 'mindar' && hasActiveMindTarget && !hasVisibleTopOverlay && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            right: 12,
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={handleFullscreenVideo}
            style={{
              width: 46,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.28)',
              background: 'rgba(17,17,17,0.72)',
              color: '#fff',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
              touchAction: 'manipulation',
              cursor: 'pointer',
            }}
            aria-label="Open video fullscreen"
            title="Open video fullscreen"
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M8 4H4V8M16 4H20V8M20 16V20H16M8 20H4V16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {uiState === 'mindar' && !!isDownloadEnabled && (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={handleDownloadVideos}
            disabled={isDownloading}
            style={{
              padding: '12px 18px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: isDownloading ? '#d9d9d9' : '#fff',
              color: '#111',
              fontWeight: 800,
              touchAction: 'manipulation',
              minWidth: 180,
              cursor: isDownloading ? 'not-allowed' : 'pointer',
            }}
          >
            {isDownloading ? `Downloading ${downloadProgress}%` : 'Download Now'}
          </button>
        </div>
      )}

      {uiState === 'mindar' && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={handleSoundToggle}
            style={{
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.28)',
              background: 'rgba(17,17,17,0.72)',
              color: '#fff',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
              touchAction: 'manipulation',
              cursor: 'pointer',
            }}
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
          >
            {soundEnabled ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 9V15H8L13 19V5L8 9H4Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 9.5C16.9 10.2 17.5 11.3 17.5 12.5C17.5 13.7 16.9 14.8 16 15.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M18.5 7C20 8.3 21 10.3 21 12.5C21 14.7 20 16.7 18.5 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 9V15H8L13 19V5L8 9H4Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M16 9L21 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M21 9L16 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      )}

      {debugFlag === 'true' && (uiState === 'running' || uiState === 'mindar') && (
        <div
          style={{
            position: 'fixed',
            bottom: 14,
            right: 14,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 14,
            fontSize: 13,
            maxWidth: '80vw',
            lineHeight: 1.25,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{status}</div>
          <div style={{ opacity: 0.92, fontSize: 12 }}>
            <div>Sound enabled: {String(soundEnabled)}</div>
            <div>Using MindAR: {String(debug.usingMind)}</div>
            <div>Mind file: {debug.mindFile}</div>
            <div>Last targetIndex: {debug.lastTargetIndex}</div>
            <div>Tick: {debug.tick}</div>
            <div>Last capture: {debug.lastCapture}</div>
            <div>Scan elapsed: {debug.scanElapsed}</div>
            <div>Crop ratios: {JSON.stringify(normalizeCropMargins({ cropMargin, cropMargins }))}</div>
            <div>Frame shape (API): {String(frameShapeRef.current)}</div>
          </div>
        </div>
      )}

      {error && (uiState === 'running' || uiState === 'mindar') && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            top: 70,
            zIndex: 9999,
            background: 'rgba(180,0,0,0.85)',
            color: '#fff',
            padding: 12,
            borderRadius: 14,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {uiState === 'idle' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            background: 'rgba(255,255,255,0.0)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <button
              onClick={startCameraOnly}
              style={{
                padding: '12px 18px',
                borderRadius: 14,
                border: '1px solid #ddd',
                background: '#fff',
                fontWeight: 800,
                touchAction: 'manipulation',
                minWidth: 160,
              }}
            >
              Try again
            </button>

            <button
              onClick={handleExit}
              style={{
                padding: '12px 18px',
                borderRadius: 14,
                border: '1px solid #ddd',
                background: '#fff',
                fontWeight: 800,
                touchAction: 'manipulation',
                minWidth: 160,
              }}
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {debugFlag === 'true' && framePreviews.length > 0 && uiState === 'running' && (
        <div
          style={{
            position: 'fixed',
            left: 10,
            bottom: 10,
            zIndex: 9999,
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            maxWidth: '70vw',
            padding: 6,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.35)',
            pointerEvents: 'auto',
          }}
        >
          {framePreviews.map((preview) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={preview.id}
              src={preview.url}
              alt={preview.ts}
              style={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
