const WORKER_JOB_TIMEOUT_MS = 2000

const createWorkerJpegEncoder = ({window, workerUrl, now}) => {
  if (typeof window.Worker !== 'function' ||
      typeof window.createImageBitmap !== 'function' ||
      typeof window.OffscreenCanvas?.prototype?.convertToBlob !== 'function') {
    return null
  }

  let worker = null
  let pending = null
  let disabled = false
  let nextId = 0

  const settle = (result) => {
    if (!pending) return
    const {resolve, timeout} = pending
    pending = null
    window.clearTimeout(timeout)
    resolve(result)
  }

  const terminate = () => {
    const current = worker
    worker = null
    current?.terminate()
  }

  const fail = (failure) => {
    disabled = true
    terminate()
    settle({blob: null, failure})
  }

  const openWorker = () => {
    const current = new window.Worker(workerUrl)
    current.onmessage = ({data}) => {
      if (worker !== current || !pending || data?.id !== pending.id) return
      const {blob, workerMs, error} = data
      if (error || !(blob instanceof window.Blob) || blob.type !== 'image/jpeg' || !blob.size) {
        fail(error || 'worker-invalid-jpeg')
        return
      }
      settle({blob, snapshotMs: pending.snapshotMs, workerMs})
    }
    current.onerror = (event) => {
      if (worker !== current) return
      event.preventDefault?.()
      fail('worker-error')
    }
    current.onmessageerror = () => {
      if (worker === current) fail('worker-message-error')
    }
    return current
  }

  const transferSnapshot = async (job, current, canvas, jpegQuality) => {
    const startedAt = now()
    let bitmap
    let failure = 'worker-snapshot-failed'
    try {
      bitmap = await window.createImageBitmap(canvas)
      if (pending !== job || worker !== current) return
      job.snapshotMs = Math.round(now() - startedAt)
      failure = 'worker-transfer-failed'
      current.postMessage({id: job.id, bitmap, jpegQuality}, [bitmap])
      bitmap = null
    } catch (_) {
      if (pending === job) fail(failure)
    } finally {
      // Once posted, the worker owns and closes the bitmap.
      bitmap?.close()
    }
  }

  return {
    encode(canvas, jpegQuality) {
      if (disabled) return Promise.resolve({blob: null, failure: 'worker-disabled'})
      if (pending) return Promise.resolve({blob: null, failure: 'worker-busy'})

      return new Promise(resolve => {
        const job = {id: ++nextId, resolve, timeout: null, snapshotMs: null}
        pending = job
        job.timeout = window.setTimeout(() => {
          if (pending === job) fail('worker-timeout')
        }, WORKER_JOB_TIMEOUT_MS)

        try {
          worker ||= openWorker()
        } catch (_) {
          fail('worker-start-failed')
          return
        }

        transferSnapshot(job, worker, canvas, jpegQuality)
      })
    },

    cancel() {
      terminate()
      settle({blob: null, failure: 'worker-cancelled'})
    },
  }
}

module.exports = {createWorkerJpegEncoder}
