# Tabletop

A campaign-agnostic table tool. One DM surface, one shared display, one
personal view per player, all fed from a single authoritative state that
is projected per audience before it reaches the wire.

```
packages/core     IR, validator, projection, reducer, protocol   pure, isomorphic
packages/server   state ownership, WS, asset serving             node
packages/web      one shell, rendered for either role            react
campaigns/        campaign.json + assets                         data
```

## One surface, two roles

There is no separate player app. `Table.tsx` is the whole interface, and
both roles render it over the same `World` type. A DM's `World` carries a
`secrets` sidecar and a control handle; a player's does not.

`World` is a union discriminated on `role`, so narrowing to `role:
'player'` yields a type with **no secrets field at all**. A player render
path cannot reach DM content because it cannot hold it.

For players, `project` runs server-side before serialisation. For the DM
it runs client-side over the IR they already have. Same function, same
output shape, different execution site for different reasons.

A viewer's world contains every scene they can see, not just the one
being shown, so navigation is local. Players can look around what they
have already discovered; the rail shows a rejoin control while they are
off on their own, and `f` snaps back to whatever the DM is presenting.

## Storage

One mechanism: SQLite, via Node's built-in `node:sqlite`. No native build
step, no external database.

`data/tabletop.db` holds the campaign source, the command log and
therefore the session. Restarting the server mid-game costs nothing: the
session is a fold over the log, and the log is in the database.

JSON stays the *authoring* format, because a DM writing a campaign wants
a text file in an editor. It is validated, then imported, and the
database is authoritative from then on. Edit the file and restart: a
changed hash triggers a re-import as a new revision with the command log
preserved, because commands reference ids and ids are stable. A file that
fails validation never reaches the database.

```
DB=data/mytable.db CAMPAIGN=campaigns/mine npm run dev
```

## Running

```
npm install
npm run dev
```

The server prints three URLs and two secrets:

```
DM        http://localhost:5173/#dm?room=table&key=<generated>
Table     http://localhost:5173/#table?room=table
Players   http://<lan-ip>:5173/#join?room=table
```

The DM key is regenerated on every start unless you set `DM_KEY`. Set
`ROOM` to change the room code and `CAMPAIGN` to point at a different
campaign directory.

```
CAMPAIGN=campaigns/mine ROOM=frostmoor DM_KEY=hunter2 npm run dev
```

Lint a campaign without starting anything:

```
npm run lint:campaign -- campaigns/mine
```

## The three layers

**Authored** — `campaign.json`. Immutable at runtime. This is the program.

**Session** — reveals, positions, HP, clock ticks. A fold over a command
log, held only by the server.

**Derived** — projections. Computed per audience, never persisted.

Keeping these apart is what lets you edit a campaign file between sessions
without migrating session state, and what makes undo a `pop` and a refold.

## Validation is a compile pass

`campaign.json` is untrusted input. It goes through parse, name resolution,
and checking before anything else sees it, and the result is a `CampaignIR`
in which every reference is already resolved. Nothing downstream does
defensive null checks.

The validator reports every problem at once, with JSON Pointer paths:

```
  error  /scenes/1/pin/parent
         unresolved reference "regionn"
  error  /scenes/2/tokens/0/nmae
         unknown field "nmae". Did you mean "name"?
  error  /scenes/3/facts/0/id
         duplicate id "fact.harbin". Ids are unique across the whole campaign.
  error  /scenes/0/tokens/0/reveal/1
         "statblok" is not a field group of token. Known groups: presence, identity, health, statblock, tactics
  error  /scenes/0/background
         asset not found: missing.jpg
```

It also detects pin cycles, checks that every referenced asset exists on
disk, and warns about scenes with empty prep fields. Unknown keys are
errors rather than warnings: a typo that silently does nothing is worse
than a stop.

## Projection

`Public*` types have no field capable of holding DM-only data, and
`project` is their only constructor. Player surfaces are typed to accept
nothing else, so they cannot render a secret even by mistake.

Because players connect from their own machines, projection runs
**server-side**, before serialisation. The wire never carries what a
client is not entitled to see. `npm test` asserts exactly this.

### Audiences

A reveal set is keyed by audience, and audiences compose by union. A
personal viewer resolves to `{table, player:x}`, so their view is the
table's reveals joined with their own. Adding a new audience — the two
characters who both speak Elvish, say — requires touching nothing in the
projection path.

Personal views follow the table's scene unless the DM explicitly pushes
them somewhere else. `follow` puts them back.

## Actors and placements

An **actor** is a definition: this is what a bugbear is. A **placement**
is an instance: this bugbear, on this map, here.

Actors live in the campaign file and never move. Placements live in
session state, so the DM adds, moves, duplicates, relabels and removes
tokens during play without touching a file. Two goblins from the same
actor are two placements with independent reveals, HP and positions.

The roster panel lists every actor, grouped as the campaign grouped
them. Click one to arm it, then click the map. A placed token starts
hidden from the players until it is revealed, so setting up a fight in
front of them is safe.

A campaign-authored placement gets the id `<scene>.<actor>` unless it
declares one, which keeps ids unique and stable across reloads so a
`reveal` in the campaign file keeps referring to the same token.

## Moving people moves their world

Token kinds can declare `"party": true`. **Bring the party here** moves
every party placement to the scene's `entry` point in a loose ring, and
the trip carries everything with it: the destination is presented to the
table, the scene is revealed, and the party is revealed standing in it.
One command in the log, so one undo reverses all of it. That is why the
behaviour is baked into the reducer rather than emitted as follow-up
commands.

An audience can declare which character it plays:

```json
{ "id": "emeric", "name": "Emeric", "actor": "pc.emeric" }
```

Sending that token to a scene then carries *that person's* screen with
it, reveals the destination to them alone, and leaves the table where it
was. Split the party and each screen follows its owner.

Bringing the party somewhere regroups them: the personal override is
dropped for everyone carried along, so a player who had been split off
lands on the new map with the rest rather than being stranded on
wherever they used to be. Player screens follow what is being shown, so
the change reaches every screen the moment it happens — no rejoin
needed. Only the DM's camera stays independent, which is the point of
it.

```json
"entry": { "x": 0.5, "y": 0.86 }
```

## Showing, marking, and going

Three different things, and the Places panel keeps them separate.

**Marking** puts a place on the map without anyone travelling: the pin
icon on a row reveals that scene's presence to the table, so the
players can see Axeholm exists, talk about it, and decide to head
there. Nobody moves and nothing is presented, which leaves room for
something to happen on the way.

**Showing** puts a place on every screen. Presenting also discovers it
in the same command — a scene on screen that the audience is not
allowed to see would project as nothing — so `present` reveals the
place and its description as part of the same undo.

**Going** is *bring the party here*: tokens move, the place is shown,
and the party is revealed standing in it.

Everything without a screen — monsters, NPCs, animals, objects — is
placed from the Roster and taken off from the token itself.

Showing one player a place, and moving one character while the rest
carry on, are supported by the engine (`present` to a personal
audience, `sendToScene`) and are not currently wired to any control.

## Pins and ways out

`pin` says which map contains which, so it must stay a tree — the
validator rejects cycles in it. That leaves no way to mark the stair
*back up*, since a sub-level pinning its own parent is exactly a cycle.

So a scene also has `links`: one-way markers that say nothing about
containment, only that there is a way to somewhere and it is here on
this map. A link may point at an ancestor, a sibling, anywhere.

```json
"links": [
  { "scene": "stonehill", "x": 0.5, "y": 0.9, "label": "Down to the taproom" }
]
```

They render as hollow markers with an arrow rather than filled dots, so
a way out never reads as a place. Like pins they are draggable by the
DM, and the corrected position persists in the database.

## Selecting more than one

Shift-click (or the platform modifier) adds and removes tokens from the
selection. Dragging on empty map sweeps up everything the box covers; a
press without a drag is still a click, so clicking bare map clears as
it always did. Dragging any token that is part of the selection carries
the whole group, keeping their spacing, and a group move is throttled
so five tokens do not put five messages on the wire per frame.

The map takes no text selection while any of this is happening, so
dragging across it never leaves a blue smear over the artwork.

## Anchors are exact

A pin's dot sits on its coordinate and the label hangs off it; a
token's ring is centred on its coordinate and the name hangs below.
Both are zero-size anchors, so nothing about a label's length can move
the marker off its point. The earlier version centred the whole
assembly, which displaced every dot by half its own label — the longer
the name, the further off the map it sat.

## Zoom

The wheel zooms toward the pointer, middle-drag or shift-drag pans, and
the percentage in the corner returns to the whole map. A new map always
opens at full view.

Zoom is a *local view*: never sent, never logged, never on anybody
else's screen. Two people can look at the same map at different
magnifications, and the DM zooming in does not move the table.

It works because the pointer-to-world mapping already inverts the
transform — normalised position is taken against the *transformed*
rect and scaled by the *layout* box — so dragging a token, placing one
and sweeping a selection all land in the right place while zoomed.
`test/zoom.mjs` asserts exactly that, along with the cursor staying
anchored and the view never leaving the image.

## The world is the image

The stage letterboxes the background at its true aspect ratio and
positions every token, pin and grid cell against the *image*, not the
window. A pin at (0.576, 0.786) is on Phandalin at every window size and
on every differently-shaped laptop. The whole map is always on screen at
zoom 1.

## Scale

A scene can declare a grid. With `"overlay": true` it draws countable
squares plus a scale bar; with `"overlay": false` (the two Schley maps,
which carry their own printed scales) only the scale bar shows. Both
maps are calibrated from their own printing — the regional hexes at
31px per 5 miles, the town bar at 470px per 500 feet — so the bar in
the corner agrees with the paper.

## The table screen shows; it never operates

Join as `#table` and it is the map and nothing else: no rail, no
room can see where they are and you can see at a glance that the screen
has not drifted from what you are showing. Banners, shared notes and
the clock strip still land on top of the map.

It is furniture for the wall, which is what a shared display is.

When a revealed clock advances, the event's text arrives as an ordinary
notification in the same corner as everything else, and expires like
one. A tick is news, and news does not sit in a corner of its own
forever — the Clocks panel is where the standing state lives.

## Pins are draggable

Authored pin coordinates are a starting guess. The DM drags the dot
onto the printed marker — once — and the corrected position lives in
session state, persisted in the database, visible to everyone, and
reversible with undo. A drag corrects the map; only a clean click
travels to the scene.

## Clocks, and the half-revealed state

A clock has two reveal groups: `presence` (it exists) and `track`
(where it stands). The panel's show button sets both together, and
treats a clock with only one of them as *not shown*, so a session log
written before the paired control existed is repaired by pressing show
once. A player looking at a presence-only clock is told the track is
hidden, rather than being shown an empty track that never moves.

## One notification corner

Notifications live at the top-right corner of the map, where the top
bar meets the inspector: one icon counting the notes still waiting on a
decision, the card for the newest one directly beneath it, and
confirmations stacking below that. The moment the recipient chooses —
tell the others, or keep it — the icon and card clear. Decided notes
are history, not notifications, and history lives in the Notes panel.

## Moving your own token

A player may drag their own token, and only within the map they are
standing on. Not another character's token, and not onto a different
scene: which map you are on stays the DM's to decide, so this cannot be
used to travel. `playerMayIssue` checks it against server state, and the
test asserts all four boundaries.

That is the complete list of player authority: what to do with a note
you were told, and where your own feet are.

## Collapsible sections

Item groups, a place's sub-locations, quests and the roster fold away.
Nothing else does — a disclosure arrow on a list of three things is
noise rather than structure. The labels are whatever the campaign called
its groups; the engine never interprets them.

## Portraits

Either name a file after the actor's id and drop it in
`assets/portraits/` — `portraits/mon.cryovain.jpg`, and that is the
whole interface, no JSON edit — or point an actor at any path
explicitly:

```json
{ "id": "pc.emeric", "kind": "pc", "name": "Emeric", "art": "emeric.jpg", ... }
```

The same file then shows in four places: inside the token's ring on the
map, on the roster chip, on the party strip, and — largest — as the
portrait in the right sidebar when the token is selected, directly
after the name and before the stat block, topped with the kind's
colour. Players see a portrait once the token's identity is revealed;
until then the ring shows initials and the sidebar shows none.

Works for anything with a token: player photos, NPC faces, monster art.

To fill a whole campaign at once:

```
npm run portraits:manifest -- campaigns/icespire   # writes sources.json
# paste a url next to anything you want art for
npm run portraits:fetch    -- campaigns/icespire   # downloads them
```

The manifest lists every actor and item still without art, with a
suggested search term built from what the campaign calls it. Filling in
a url and running the fetch writes the file under the name the app
already looks for. Regenerating preserves urls you have already
entered, and skips anything that has a file.

You choose the sources, so you choose the licence. Nothing is bundled.

## The two views are one view

The player's screen is the DM's screen with things removed, never a
separate design. Panels, dropdowns, cards and controls are the same
components; the DM's build on the player's rather than replacing them.
An item card, for instance, is one component that takes extra children
for the DM's giving controls, so the two cannot drift apart by
accident.

The rail simply carries fewer tabs for a player, because Roster,
Reveals and Roster are DM tools; everything a player does see is
identical.

## The party strip

The top of the inspector shows every party member: portrait, name,
health, and where they are standing right now, amber when that is not
the scene on screen. Clicking one jumps to them. Portraits come from the
actor's `art` field, so drop photos in the campaign's `assets/` folder
and point each party actor at one; until then initials hold the space.

Clicking anywhere on the map clears the selection, so the inspector
falls back to the description of the place being looked at.

## The map

`campaigns/icespire/assets/region.png` and `assets/phandalin.png` are
the regional and town maps from the Essentials Kit (Wizards of the
Coast, art by Mike Schley). They are here because they are your copies;
do not redistribute them.

Both are calibrated from their own printed scales: the regional hexes
measure 31px on an 854px image (one hex, five miles), and the town's
scale bar spans 470px for 500 feet, so the scale bar in the corner
agrees with the paper on either map. The townsfolk stand on their actual buildings — Toblen
at the Stonehill Inn, Halia at the Miner's Exchange, Linene at the
Lionshield Coster, Harbin in the Townmaster's Hall.

Every location pin is positioned against the real geography, so
Phandalin sits on Phandalin and Icespire Hold sits on Icespire Peak. The
region scene declares no grid overlay: the printed hexes are the scale,
one hex to five miles.

To swap in a different map, drop it in `assets/` and move the `pin`
coordinates. They are normalised, so the same numbers work at any
resolution.

## Nothing here knows what D&D is

The engine reads whatever a campaign declares and never interprets it.
Field groups, roster sections, token kinds and stat-block sections are
all campaign-supplied strings. The attribute row lays out however many
attributes there are, because six is D&D's number and not the engine's.
Even the word for a check's target number comes from the campaign:

```json
"difficultyLabel": "DC"
```

Leave it out and a check renders as `Perception 14`. Set it to `TN` and
it renders `Perception TN 14`.

Grep the engine sources for domain vocabulary and the only hits are in
comments. The campaign directory is the only place that knows about
dragons.

`campaigns/example` is the proof and doubles as a template: a heist in
a rainy city, with four attributes instead of six, `"Target"` instead
of `"DC"`, crew instead of a party, and opposition instead of a
bestiary. Same binary, no flags:

```
CAMPAIGN=campaigns/example npm run dev
```

## Stat blocks

An actor can carry a full block the DM runs from without opening a book:

```json
"stats": {
  "summary": "Large monstrosity, unaligned",
  "bar": [["AC", "14 (natural armor)"], ["HP", "39 (6d10 + 6)"], ["Speed", "30 ft., burrow 10 ft."]],
  "abilities": [["STR", "17 (+3)"], ["DEX", "11 (+0)"], "..."],
  "meta": [["Senses", "darkvision 60 ft., tremorsense 60 ft."], ["Challenge", "2 (450 XP)"]],
  "sections": [
    { "label": "Actions", "rows": [["Bite", "Melee, +5 to hit..."]] },
    { "label": "Running it", "rows": [["Placement", "Never appear where they are looking."]] }
  ]
}
```

Ordered label/value rows in named sections, so any system fits: the
engine lays a row out and never interprets it. Sections are free-form,
which is why every creature here has a **Running it** section alongside
Traits and Actions.

Stat blocks are DM-only by construction. They live in the secrets
sidecar and have no branch that reaches a player surface.

## Checks, options and notes

Three things a module leaves you to improvise, and the DM needs most:

**Options** — what the players can actually do here, in plain language,
so nobody has to invent affordances under pressure.

**Checks** — what they can roll, against what, and what each outcome
opens up. On a pass the DM clicks an audience, and the listed `reveals`
fire at that audience alone:

```json
"checks": [
  { "skill": "Arcana", "dc": 13,
    "when": "On the storage chest in the lower hall",
    "success": "The grain of the wood does not run the right way.",
    "failure": "It is a chest.",
    "reveals": ["gnomengarde.mon.mimic#lore"] }
]
```

Clicking a player's name rather than **everyone** reveals it to them and
sends the success text to their screen. That is how one character
learns something the rest of the table does not.

Clicking a player's name rather than **everyone** reveals it to them
and sends the success text as a note, so they get the same
share-or-keep choice.

## Items

Items are entities, not inventory. Giving one is a reveal, so the same
audience machinery decides who holds it, who has merely seen it, and who
knows nothing. `presence` shows the item and its short text; `detail`
adds the full description; `secret` is DM-only and unprojectable.

There is no weight, no slots and no economy. Sheets live elsewhere.

## Cues, read-aloud and branching

Three things a module usually leaves you to improvise:

**Read-aloud.** A scene entry with `"style": "read"` renders as boxed
text. It is a different act from a DM note: it is spoken.

**Cues.** DM-only prompts attached to a scene, each with an optional
`when`. Sensory detail, what happens if they push, how an NPC sounds.
Never projectable.

```json
"cues": [
  { "when": "They reach the sealed door",
    "text": "It is barred from this side. Let a player say that out loud." }
]
```

**Branching.** Quest stages form a graph, not a line. Each stage names
its exits, and the DM advances by choosing one. The Quests panel shows
the current exits as buttons, and **all N steps** expands the whole
graph so you can jump anywhere if the table went somewhere unexpected:

```json
{ "id": "arrived", "playerText": "...", "dmText": "...",
  "options": [
    { "label": "They notice gnomes are missing", "goto": "missing" },
    { "label": "They open the sealed door first", "goto": "door" }
  ]}
```

The validator resolves every `goto`, rejects duplicate stage ids, and
warns about stages nothing branches to. A stage with no options is a
legitimate ending, not a warning.

**Narration.** An actor can carry `narration`: lines to read when it
acts. The inspector cycles them, so a monster has something to say on
every turn of a fight without you inventing it under pressure.

### Token kinds are campaign data

The engine knows what a *group* is. It does not know that "statblock" or
"tracks" exist. A campaign declares its own token kinds, each with a
shape, an accent colour, and named information slots:

```json
"tokenKinds": [
  { "id": "animal", "label": "Animal", "shape": "diamond", "accent": "#7f9a6d",
    "entries": [
      { "id": "look",      "label": "What they see",    "group": "identity" },
      { "id": "tracks",    "label": "Signs and tracks", "group": "tracking" },
      { "id": "statblock", "label": "Stat block",       "group": "dm" }
    ]}
]
```

Every non-`dm` group an entry mentions becomes a revealable group for
that kind, and appears as a column in the reveal matrix automatically.
`tracking` above is not known to the engine; it exists because the
campaign said so.

Shapes are `disc`, `hex`, `square`, `diamond`. Colour comes from the
kind, so the stylesheet declares no per-kind hues.

### Field groups

A reveal target is `entityId` or `entityId#group`.

| kind      | groups                                                    |
|-----------|-----------------------------------------------------------|
| scene     | presence, description                                     |
| entry     | presence                                                  |
| placement | presence, identity, health, + whatever its kind declares  |
| quest     | presence, stage                                           |
| clock     | presence, track                                           |

`presence` without `identity` puts a figure on the map with no name.

`dm` is a reserved sink: content in that group has no branch that reaches
`PublicToken`, so it is DM-only by construction rather than by policy.
Attempting to reveal it is a validation error.

### Scene entries

Facts and handouts are one mechanism. An entry has text, an image, or
both, and is revealed individually:

```json
"entries": [
  { "id": "fact.kings", "text": "Two kings rule here.", "reveal": true },
  { "id": "img.chest",  "label": "The chest", "image": "chest.jpg" }
]
```

## Commands

Everything mutating is a command. The reducer is pure and total: out of
range values clamp rather than throw, so a replayed log cannot diverge
from the log that produced it.

`commit` runs registered observers after each command and applies whatever
they emit. Observers do not re-enter, so the pipeline is one level deep
and terminates by construction rather than by a step budget. **This is the
seam for triggers.** The campaign file carries no behaviour today; when it
does, a trigger is an observer and needs no new machinery.

## Wire protocol

Commands up, projected snapshots down, each tagged with a sequence number.
A client that reconnects sends its last `seq` and gets resynced.

Updates are currently full projected snapshots per audience. For a table
of five that is the right call — obviously correct, trivially verifiable,
a few kilobytes. `encodeUpdate` in `core/src/project.ts` is where a differ
drops in when it stops being the right call. Note that it must diff
*projections*, never authoritative state, or the diff itself leaks.

Only the DM can issue commands; the server rejects anything else.

## Interface

The map is the canvas, not a panel. The rail is 52px, icon-only, and its
drawer overlays the canvas rather than pushing it — pushing would reflow
the map under the cursor every time a panel opens.

The DM's camera is deliberately independent of every audience, so looking
ahead never shows anything. Pushing a view is an explicit act.

Amber hatching means one thing everywhere it appears: the players cannot
see this.

The table display has no chrome. Any control that appears on it is a bug.

## Adding a campaign

```
campaigns/mine/
  campaign.json
  assets/
    region.jpg
    emeric.png
```

Assets are referenced by path relative to `assets/`, and the server refuses
to serve anything outside that directory. Missing files are validation
errors at load, not broken images at the table.

Minimal viable campaign:

```json
{
  "schemaVersion": 1,
  "id": "mine",
  "title": "My campaign",
  "rootScene": "start",
  "scenes": [
    {
      "id": "start",
      "name": "Somewhere",
      "reveal": ["presence", "description"],
      "description": "It begins here.",
      "prep": { "want": "", "threat": "", "wrong": "", "notes": "" }
    }
  ]
}
```

`schemaVersion` is checked strictly. When the schema changes, bump it and
write a migration rather than accepting both shapes.


Clicking the map closes an open panel: the drawer overlays the canvas,
so reaching for the map is itself a request for room.

## What this deliberately does not do

No rules engine, no combat automation, no dice. Each would triple the
schema surface, and the table already has all three. The job here is
showing and hiding things well.

## Path resolution

npm workspaces run scripts with cwd set to the package directory, so the
server anchors `campaigns/` and the built client to its own module
location rather than `process.cwd()`. A relative `CAMPAIGN` is resolved
from the repo root; an absolute one is used as given.

If the server exits at startup it prints validation errors and stops; the
dev script kills Vite along with it so the real error stays visible.

## Known gaps

- Viewport pan and zoom are in the state and the transform, but there is
  no gesture layer yet. The DM camera is scene-level only.
- No character sheets, dice, or initiative, deliberately. Rolling and
  arguing about rules is the part of an in-person game worth protecting,
  and there are better tools for sheets. This app shows and hides things.
- No campaign editor. `campaign.json` is hand-authored, which is why the
  validator carries as much weight as it does.
- The page itself never scrolls. Panels and the inspector scroll; the map
  stays put.
- No editor. `campaign.json` is hand-authored, which is why the validator
  matters more than it otherwise would.
