import { Composition, registerRoot } from 'remotion'
import { TimelineComposition } from './TimelineComposition'
import { FPS, RESOLUTION_16_9, DEFAULT_CLIP_DURATION_FRAMES } from './constants'
import type { CompositionProps } from './types'

/**
 * Remotion entry point — bundled by `remotion lambda sites create` and rendered
 * by /api/generate/finalize.
 *
 * Only used to give Studio something to open. Real renders always arrive with
 * inputProps, and calculateMetadata below derives the true size and duration
 * from them.
 */
const defaultProps: CompositionProps = {
  fps: FPS,
  width: RESOLUTION_16_9.width,
  height: RESOLUTION_16_9.height,
  clips: [
    {
      id: 'preview-1',
      src: '/dev-samples/clip0.mp4',
      durationInFrames: DEFAULT_CLIP_DURATION_FRAMES,
      inFrame: 0,
      outFrame: DEFAULT_CLIP_DURATION_FRAMES,
      orderIndex: 0,
    },
    {
      id: 'preview-2',
      src: '/dev-samples/clip1.mp4',
      durationInFrames: DEFAULT_CLIP_DURATION_FRAMES,
      inFrame: 0,
      outFrame: DEFAULT_CLIP_DURATION_FRAMES,
      orderIndex: 1,
    },
  ],
}

function totalFrames(clips: CompositionProps['clips']) {
  return clips.reduce((acc, clip) => acc + (clip.outFrame - clip.inFrame), 0)
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Timeline"
      component={TimelineComposition as unknown as React.FC<Record<string, unknown>>}
      // Placeholders. calculateMetadata replaces all four from the real props —
      // without it every render would be clamped to the length of defaultProps,
      // truncating a 19-clip video to a few seconds.
      durationInFrames={Math.max(1, totalFrames(defaultProps.clips))}
      fps={defaultProps.fps}
      width={defaultProps.width}
      height={defaultProps.height}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const p = props as unknown as CompositionProps
        return {
          // Sum of every clip's trimmed length — the composition IS the edit.
          durationInFrames: Math.max(1, totalFrames(p.clips ?? [])),
          fps: p.fps ?? FPS,
          // 9:16 and 16:9 are both 1080p; the aspect decides which way round.
          width: p.width ?? RESOLUTION_16_9.width,
          height: p.height ?? RESOLUTION_16_9.height,
        }
      }}
    />
  )
}

registerRoot(RemotionRoot)
