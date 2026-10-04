# Tabletop

A campaign-agnostic table tool, cut back to one job: put a picture on
every screen in the room, and hold the words you read beside it.

```
packages/core     IR, validator, projection, reducer, protocol   pure, isomorphic
packages/server   state ownership, WS, asset serving             node
packages/web      one shell, rendered for either role            react
campaigns/        campaign.json + assets                         data
```

## What it is, and what it is not

A campaign is scenes. A scene is a name, some pictures and some text.
That is the whole domain.

There are no tokens, no actors, no items, no quests, no clocks and no
reveals. Nothing here is played on: a scene's pictures are looked at.
The DM reads, taps the next picture, and everyone's screen follows.

## Two surfaces, and a player is not asked who they are

There is no shared-display surface and no lobby. A player opens the
link and is in: every player holds the same projection, so there is
nothing on screen that differs between one of them and the next, and
therefore nothing to choose. The DM's link carries a key; every other
link is a player's.

Both roles render the same `Table.tsx` over the same `World`, with the
same content in it. The role decides who gets controls drawn — and the
server refuses a player's commands regardless, so the missing buttons
are a courtesy to the eye rather than the security boundary.

A viewer's world contains every scene, not just the one being shown, so
looking around is local. The rail shows a way back while they are off
on their own, and the next thing the DM presents snaps every screen
back to it.

## No storage

There is no database. The only state in a session is which scene is up
and which of its pictures, and losing that on a restart costs one
click. Persisting it bought a schema, a file on disk and a class, and
paid for none of them.

The command log lives in memory, which is all undo needs. `campaign.json`
is read at startup, validated, and held; a file that fails validation
never starts a server. Edit it and restart.

## Running

```
npm install
npm run dev
```

The server prints two URLs and two secrets:

```
DM        http://localhost:5173/#dm?room=table&key=<generated>
Players   http://<lan-ip>:5173/#play?room=table
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

## Writing a campaign

`campaigns/session-two` is the campaign the server loads by default:
nine scenes broken out of `source.md`, which sits beside it unchanged
so the JSON can always be checked against what was written. Pictures
go in a campaign's `assets/` directory and are named by filename.
`campaigns/starter` is an empty example to copy.

Entries hold the markdown they were authored in, exactly as written.
The inspector renders four things from it — pipe tables, blockquotes,
`**bold**` and `*italic*` — and passes everything else through. The
text in the file is the record; nothing reflows or rewrites it.

```json
{
  "schemaVersion": 5,
  "id": "mynight",
  "title": "Session Two",
  "rootScene": "ruts",
  "scenes": [
    {
      "id": "ruts",
      "name": "One — The Ruts",
      "description": "The road east out of town.",
      "images": [
        { "id": "open",   "name": "the open country", "file": "ruts.jpg" },
        { "id": "farm",   "name": "the empty farm",   "file": "farm.jpg" },
        { "id": "ambush", "name": "the ambush",       "file": "ambush.jpg" }
      ],
      "entries": [
        { "style": "read", "label": "Opening", "text": "You find the tracks before…" },
        { "label": "If they ask", "text": "Barthen has had eleven days of it." }
      ],
      "scenes": [
        { "id": "farmyard", "name": "The first farm", "images": ["farm.jpg"] }
      ]
    }
  ]
}
```

Everything optional is optional. An image may be a bare filename
instead of an object, and so may an entry be a bare string: both are
expanded, and an image with no name is called after its own file. Ids
are generated where they are not given, so a scene you will never link
to does not need one typed out.

`scenes` nests, one to one with the Places panel it is rendered by: a
scene holds scenes, which hold scenes. A scene's own picture is its
establishing shot and the scenes inside it are the beats that follow,
one picture each. The sidebar lists the top level and each card opens
what is directly inside it.

An entry with `"style": "read"` is boxed and set at the largest reading
size in the app. That is the part you say out loud. Everything else is
a plain block under it — a reminder, a name, a line you might need.

The validator refuses a file rather than starting a server on it, and
warns about the things that will run but are probably a mistake: a
scene with no pictures, an image that is not on disk.

## The kit

Every panel is assembled from the templates in
`packages/web/src/ui/kit.tsx`. No panel builds a box, a button, a menu,
a search field, a hint or an empty state of its own. If something does
not fit, the template changes and every panel changes with it.

    Card    one entity, one box, the same slots in the same order
    Acts    a row of controls
    Action  a button. One shape; danger and on are colour, not variants
    Chip    a small on/off button
    Sticky  a panel header that stays put while the panel scrolls
    Find    a search field, built on Sticky
    Field   somewhere to type
    Hint    a line of guidance
    Empty   nothing here yet, said in one voice

A card's slots are `title`, `tag`, `meta`, `body` and `acts`, and a card
fills every one its subject has data for. `meta` has no empty case on
purpose: a card with nothing to report says "no pictures" rather than
dropping the line and standing shorter than the card above it.

### A component declared inside a component is a new component

`Row` in the Scenes panel used to live inside `ScenesPanel`. That makes
it a fresh function on every render, which React reads as a different
kind of component, so the entire list was thrown away and rebuilt
whenever anything changed — including opening a group. Every card
remounted, and a card scrolls itself into view when it mounts selected,
so the sidebar jumped on every click. `Row` lives at module scope now
and takes what it needs as props.

## The top bar carries no trail

A scene is not a place inside another place any more, so there is
nowhere to be "inside" and no path back out of. The breadcrumbs went
with the idea. What is left in the bar is the one control that still
says something: what the room is looking at, and the way back to it.

## One tab

The left rail carries Scenes and nothing else, because there is one
thing to operate. A scene's pictures appear as one chip each on its
card: tapping one puts it on every screen in the room, and presents the
scene if it was not already up. That is the control the whole night
runs on, so it sits on the card rather than behind another click — read
a paragraph, tap the next picture, carry on reading.

A player sees the same chips, locked, so they can see which picture is
up and cannot change it.

## The stage shows the picture and does nothing else

No zoom, no pan, no viewport. What the DM is looking at is what the
room is looking at, and a picture you can shove around is a picture
somebody is fiddling with instead of listening. The image is centred
and letterboxed whole, by `object-fit`, at every window size.

A filename is the author's: `Icy Dwarven Fortress Hall.png` is a
perfectly good name for a picture and does not have to be renamed to be
served. Each path segment is URL-encoded and the separators are not, so
spaces survive and a subdirectory still works.

### Controls live on the left, reading lives on the right

The left side is where you operate on a thing. The right side is where
it is described. Every inspector screen reads in the same sequence:

    the picture that is up
    read-aloud
    the description
    everything else

### Seven type sizes and four gaps

Everything is named and everything sits on the scale:

    --t-label   0.68   eyebrows, dt, captions, small grey labels
    --t-ui      0.72   anything you click
    --t-body    0.80   hints, empties, toasts, secondary text
    --t-strong  0.82   names, titles, inputs
    --t-prose   0.86   reading text
    --t-read    0.94   read-aloud
    --t-title   1.02   the one heading size

    --g-1 .2   --g-2 .35   --g-3 .5   --g-4 .85

Three line heights, three radii, and one colour for a section heading.

## Tests

```
npm test
```

Boots a fresh server against a fresh database and drives it over the
wire: the DM puts a scene up, both roles see it, a player's attempt to
drive it is refused, and undo walks it back.
