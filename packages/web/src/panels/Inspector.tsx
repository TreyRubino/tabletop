import { activeScene } from '../shell'
import { Empty } from '../ui/kit'
import { Markdown } from '../ui/markdown'
import type { ShellState } from '../shell'

/* ------------------------------------------------------------------
   The reading side: the scene's own markdown, rendered, and nothing
   else. No typed blocks, no boxes around some paragraphs and not
   others, no thumbnail of the picture already filling the stage. The
   campaign file is a document and this is where it is read.
------------------------------------------------------------------ */

export function Inspector({ world, viewing }: ShellState) {
  const scene = activeScene(world, viewing)

  if (!scene) {
    return (
      <div className="insp">
        <header className="insp-head">
          <div>
            <h2>Nothing on screen</h2>
            <p className="insp-kind">pick a scene to begin</p>
          </div>
        </header>
        <Empty>Choose somewhere in Scenes and it will open here.</Empty>
      </div>
    )
  }

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{scene.name}</h2>
          <p className="insp-kind">Scene</p>
        </div>
      </header>

      {scene.body.trim()
        ? <Markdown text={scene.body} />
        : <Empty>Nothing written here yet.</Empty>}
    </div>
  )
}
