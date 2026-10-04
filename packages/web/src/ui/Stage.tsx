/* ------------------------------------------------------------------
   The stage holds one picture, whole, centred, letterboxed inside
   whatever shape the window happens to be.

   It does nothing else. There is no zoom, no pan and no viewport:
   what the DM is looking at is what the room is looking at, and a
   picture you can shove around is a picture somebody is fiddling with
   instead of listening. Fitting the image is the entire job.
------------------------------------------------------------------ */

export interface StageProps {
  /** Path under the campaign's assets directory, or null for the
      empty backdrop. */
  image: string | null
}

/* A filename is the author's, not a slug: "Icy Dwarven Fortress Hall.png"
   is a perfectly good name for a picture and should not have to be
   renamed to be served. Each segment is encoded, the separators are
   not, so a space survives the trip and a subdirectory still works. */
const assetUrl = (file: string) =>
  `/assets/${file.split('/').map(encodeURIComponent).join('/')}`

export function Stage({ image }: StageProps) {
  return (
    <div className="stage-clip">
      <div className="stage">
        {image
          ? <img className="stage-fit" src={assetUrl(image)} alt="" draggable={false} />
          : <Backdrop />}
      </div>
    </div>
  )
}

function Backdrop() {
  return (
    <svg className="stage-fit" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="bd" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#12171d" />
          <stop offset="100%" stopColor="#1e262f" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bd)" />
    </svg>
  )
}
