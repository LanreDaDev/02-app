import { AbsoluteFill, OffthreadVideo, Sequence } from 'remotion'
import type { CompositionProps } from './types'

export const TimelineComposition: React.FC<CompositionProps> = ({ clips }) => {
  let offset = 0

  return (
    <AbsoluteFill style={{ backgroundColor: '#08080a' }}>
      {clips.map((clip) => {
        const visibleFrames = clip.outFrame - clip.inFrame
        const from = offset
        offset += visibleFrames

        return (
          <Sequence key={clip.id} from={from} durationInFrames={visibleFrames}>
            <OffthreadVideo
              src={clip.src}
              startFrom={clip.inFrame}
              endAt={clip.outFrame}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
