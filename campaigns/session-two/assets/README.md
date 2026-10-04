# Pictures for Session Two

Drop the image files in this directory, keeping their names exactly as
they are below. `campaign.json` already names all thirteen and attaches
them to the scenes that use them, so nothing else needs editing — the
chips appear on the cards the moment the files are here.

    Misty Mountain Outpost Gate at Dawn.png      Barthen       the palisade

    Snowy Road to the Mountain Valley.png        One           the open country
    Abandoned Snowy Mountain Homestead.png       One           the first farm
    Orc Ambush in the Snowy Mountain Pass.png    One           the orcs come up
    Bloodstained Snowy Mountain Battlefield.png  One           after the ambush
                                                 Two           the man on the road

    Snowy Mountain Mining Excavation.png         Three         the dig from the ridge
    Frozen Ruins Beneath Icespire.png            Three         what they broke into

    Icy Dwarven Fortress Hall.png                Four          the hall below

    Ancient Dwarven Forge Cathedral.png          Five          the standing room
    Basilisk in the Subterranean Quarry.png      Five          what comes forward

    Serrin Opens the Ancient Rune Gate.png       Six           both hands on it
    Warrior Beyond the Frostbound Gate.png       Six           he steps through

    Collapsing Dwarven Gate in the Snowstorm.png Seven         the ceiling comes down

The battlefield is listed twice on purpose: it is the end of the ambush
and it is the arrival of the man in white, who is already standing in
it. One file, two scenes.

Eight — Axeholm has no picture yet. Add one by listing it in that
scene's `images` in `campaign.json`.

To check the campaign once the files are in:

    npm run lint:campaign

It warns for any picture it cannot find, and for any scene with none.
