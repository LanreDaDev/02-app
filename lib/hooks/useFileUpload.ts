"use client";

import { useState } from 'react'

interface UploadProgress {
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  url?: string
  key?: string
}

interface UseFileUploadOptions {
  orderId: string
  type: 'photo' | 'video'
  onSuccess?: (file: UploadProgress) => void
  onError?: (error: string) => void
}

export function useFileUpload({
  orderId,
  type,
  onSuccess,
  onError,
}: UseFileUploadOptions) {
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({})
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = async (file: File) => {
    const fileId = `${file.name}-${Date.now()}`

    try {
      // Initialize upload state
      setUploads((prev) => ({
        ...prev,
        [fileId]: {
          fileName: file.name,
          progress: 0,
          status: 'pending',
        },
      }))

      setIsUploading(true)

      // Step 1: Get presigned URL
      const presignedResponse = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          orderId,
          type,
        }),
      })

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json()
        throw new Error(error.error || 'Failed to get upload URL')
      }

      const { uploadUrl, key } = await presignedResponse.json()

      // Step 2: Upload file to S3 with progress tracking
      setUploads((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], status: 'uploading' },
      }))

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploads((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], progress },
          }))
        }
      })

      // Upload promise
      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'))
        })

        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      // Step 3: Notify backend upload is complete
      const completeResponse = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          orderId,
          type,
        }),
      })

      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload')
      }

      const { url } = await completeResponse.json()

      // Mark as success
      const successState = {
        fileName: file.name,
        progress: 100,
        status: 'success' as const,
        url,
        key,
      }

      setUploads((prev) => ({
        ...prev,
        [fileId]: successState,
      }))

      onSuccess?.(successState)
    } catch (error: any) {
      const errorMessage = error.message || 'Upload failed'

      setUploads((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          status: 'error',
          error: errorMessage,
        },
      }))

      onError?.(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const uploadMultiple = async (files: File[]) => {
    setIsUploading(true)
    await Promise.all(files.map((file) => uploadFile(file)))
    setIsUploading(false)
  }

  const resetUploads = () => {
    setUploads({})
  }

  const removeUpload = (fileId: string) => {
    setUploads((prev) => {
      const newUploads = { ...prev }
      delete newUploads[fileId]
      return newUploads
    })
  }

  return {
    uploads,
    isUploading,
    uploadFile,
    uploadMultiple,
    resetUploads,
    removeUpload,
  }
}
