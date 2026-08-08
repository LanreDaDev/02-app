"use client";

import { useState, useRef, useCallback, useMemo } from 'react'

export interface UploadProgress {
  id: string
  fileName: string
  progress: number
  status: 'queued' | 'uploading' | 'success' | 'error'
  error?: string
  url?: string
  key?: string
  photoId?: string
}

interface UseFileUploadOptions {
  projectId: string
  maxConcurrent?: number
  onSuccess?: (file: UploadProgress) => void
  onError?: (error: string) => void
}

export function useFileUpload({
  projectId,
  maxConcurrent = 2,
  onSuccess,
  onError,
}: UseFileUploadOptions) {
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({})
  const queueRef = useRef<{ id: string; file: File }[]>([])
  const activeRef = useRef(0)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  // Keep stable references to callbacks
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const drain = useCallback(() => {
    while (queueRef.current.length > 0 && activeRef.current < maxConcurrent) {
      const item = queueRef.current.shift()!
      activeRef.current++
      runUpload(item.id, item.file)
    }
  }, [maxConcurrent])

  const runUpload = useCallback(async (id: string, file: File, attempt = 0) => {
    const pid = projectIdRef.current
    const MAX_RETRIES = 1

    const update = (patch: Partial<UploadProgress>) => {
      setUploads((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev)
    }

    try {
      update({ status: 'uploading', progress: 0 })

      const contentType = file.type || 'image/jpeg'

      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: pid,
          fileName: file.name,
          contentType,
        }),
      })

      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({ error: `HTTP ${presignRes.status}` }))
        throw new Error(err.error || 'Failed to get upload URL')
      }

      const { uploadUrl, key, contentType: signedType } = await presignRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120000

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            update({ progress: Math.round((e.loaded / e.total) * 100) })
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`S3 returned ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.addEventListener('timeout', () => reject(new Error('Timed out')))

        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', signedType || contentType)
        xhr.send(file)
      })

      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          projectId: pid,
          fileName: file.name,
          fileSize: file.size,
        }),
      })

      if (!completeRes.ok) throw new Error('Failed to register upload')

      const { url, photo } = await completeRes.json()

      const result: UploadProgress = {
        id,
        fileName: file.name,
        progress: 100,
        status: 'success',
        url,
        key,
        photoId: photo?.id,
      }

      update(result)
      onSuccessRef.current?.(result)
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000))
        await runUpload(id, file, attempt + 1)
        return
      }
      const msg = err instanceof Error ? err.message : 'Upload failed'
      update({ status: 'error', error: msg })
      onErrorRef.current?.(msg)
      activeRef.current--
      drain()
      return
    }
    activeRef.current--
    drain()
  }, [drain])

  const addFiles = useCallback((files: File[]) => {
    const entries: Record<string, UploadProgress> = {}

    for (const file of files) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      entries[id] = { id, fileName: file.name, progress: 0, status: 'queued' }
      queueRef.current.push({ id, file })
    }

    setUploads((prev) => ({ ...prev, ...entries }))
    drain()
  }, [drain])

  const isUploading = useMemo(() => {
    return Object.values(uploads).some(
      (u) => u.status === 'queued' || u.status === 'uploading'
    )
  }, [uploads])

  const resetUploads = () => {
    queueRef.current = []
    activeRef.current = 0
    setUploads({})
  }

  const dismissUpload = (id: string) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id)
    setUploads((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const dismissActive = () => {
    queueRef.current = []
    setUploads((prev) => {
      const next: Record<string, UploadProgress> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v.status === 'success' || v.status === 'error') next[k] = v
      }
      return next
    })
  }

  return { uploads, isUploading, addFiles, resetUploads, dismissUpload, dismissActive }
}
