export const FPS = 30
export const DEFAULT_CLIP_DURATION_FRAMES = 120 // 4 seconds at 30fps

export const RESOLUTION_16_9 = { width: 1920, height: 1080 } as const
export const RESOLUTION_9_16 = { width: 1080, height: 1920 } as const

export function getResolution(aspectRatio: '16:9' | '9:16') {
  return aspectRatio === '9:16' ? RESOLUTION_9_16 : RESOLUTION_16_9
}
