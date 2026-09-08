# Drop-in portraits

Any actor without an `"art"` field in `campaign.json` picks up a file
here named after its id:

    portraits/mon.cryovain.jpg
    portraits/npc.halia.png
    portraits/mon.mimic.webp

Accepted extensions: `jpg`, `jpeg`, `png`, `webp`, `avif`.

Naming the file is the whole interface — no JSON edit, no restart beyond
the usual one. The same image is then used in four places: the token
ring on the map, the roster chip, the party strip, and the large
portrait in the right sidebar. Players only see it once that token's
identity has been revealed to them.

Items work the same way through their own `"art"` field, but are not
covered by this fallback, since an item id and an actor id share a
namespace only by accident.

Nothing here is shipped with the project: these are your files, and
whatever you drop in is subject to whatever licence it came with.
