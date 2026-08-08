import { create } from 'zustand'
import type { Photo } from '@/lib/types/database'

type Step = 'create' | 'upload'
export type AspectRatio = '9:16' | '16:9'

interface NewProjectState {
  step: Step
  title: string
  aspectRatio: AspectRatio
  projectId: string | null
  photos: Photo[]
  selectionOrder: string[]
  error: string | null
  creating: boolean
  confirming: boolean

  setStep: (step: Step) => void
  setTitle: (title: string) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setProjectId: (id: string) => void
  addPhoto: (photo: Photo) => void
  setPhotos: (photos: Photo[]) => void
  removePhoto: (id: string) => void
  setError: (error: string | null) => void
  setCreating: (v: boolean) => void
  setConfirming: (v: boolean) => void

  reorderSelection: (ids: string[]) => void

  reset: () => void
}

const initialState = {
  step: 'create' as Step,
  title: '',
  aspectRatio: '9:16' as AspectRatio,
  projectId: null,
  photos: [],
  selectionOrder: [],
  error: null,
  creating: false,
  confirming: false,
}

export const useNewProjectStore = create<NewProjectState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setTitle: (title) => set({ title }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setProjectId: (id) => set({ projectId: id }),
  // Every uploaded photo is included by default, appended in upload order —
  // the user reorders or removes from the same grid rather than a separate select step.
  addPhoto: (photo) =>
    set((s) => ({
      photos: [...s.photos, photo],
      selectionOrder: [...s.selectionOrder, photo.id],
    })),
  setPhotos: (photos) => set({ photos, selectionOrder: photos.map((p) => p.id) }),
  removePhoto: (id) =>
    set((s) => ({
      photos: s.photos.filter((p) => p.id !== id),
      selectionOrder: s.selectionOrder.filter((x) => x !== id),
    })),
  setError: (error) => set({ error }),
  setCreating: (v) => set({ creating: v }),
  setConfirming: (v) => set({ confirming: v }),

  reorderSelection: (ids) => set({ selectionOrder: ids }),

  reset: () => set(initialState),
}))
