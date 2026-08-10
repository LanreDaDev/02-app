'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PhotoSource } from '@/lib/types/database'

/** What the picker needs. The photos route returns more; this is the useful part. */
export interface EditorPhoto {
  id: string
  file_name: string | null
  s3_key: string
  /** Presigned, so it expires — the route mints a fresh one on each load. */
  s3_url: string
  source: PhotoSource
  created_at: string
}

/**
 * A project's photos, split by where they came from.
 *
 * Uploads are the library. Extracted frames are not: they exist only because a
 * clip produced one, and showing them alongside uploads would fill the picker
 * with near-duplicates of shots the agent already used. They belong where they
 * are useful — starting the next slot exactly where the last one ended.
 */
export function usePhotos(projectId: string) {
  const [photos, setPhotos] = useState<EditorPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/photos`)
      if (!res.ok) throw new Error(`Could not load photos (${res.status})`)
      const data = (await res.json()) as EditorPhoto[]
      setPhotos(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load photos')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const uploads = photos.filter((p) => p.source === 'upload')
  const extractedFrames = photos.filter((p) => p.source === 'extracted_frame')

  return { photos, uploads, extractedFrames, loading, error, refresh }
}
