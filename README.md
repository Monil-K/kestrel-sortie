# kestrel-sortie

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Monil-K/kestrel-sortie/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Monil-K/kestrel-sortie/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Kestrel Sortie** is a low-level flight game set over a windy archipelago: one turboprop strike
aircraft, a lit six-pack instrument panel, three kinds of sortie and no autopilot. Everything is
drawn in code — the island, the sea, the aircraft, the gauges and the radio chatter — from static
files that run offline in a desktop browser.

Fly the ridges through twelve gates against the clock, rake a fuel depot on the north cape with
the cannon, or join the pattern and land the aircraft on runway 36. Fuel, gear, flaps and damage
are yours to manage; the aircraft stalls if you pull too hard at low speed and the wings will
pick up a wingtip if you land crooked.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or serve the `game/` folder with any static file server. No build step, no network requests: the
game is `game/index.html` plus the ES modules beside it (three.js is vendored under
`game/vendor/`).

To produce the entry's dossier (what `main.ts` does for the grader):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Key | Action |
| --- | --- |
| `↑` `↓` | Pitch |
| `←` `→` | Roll |
| `Q` / `E` | Rudder |
| `W` / `S` | Throttle (or mouse wheel) |
| `C` | Cycle camera: cockpit, chase, flyby |
| `G` | Landing gear |
| `F` | Flaps |
| `Space` | Cannon |
| `B` | Wheel brakes |
| `P` | Pause |
| `R` | Fly again from the debrief |

Drag with the mouse to look around the cockpit.

## Layout

```
game/index.html        page, import map, title and debrief screens
game/src/main.js       game shell: cameras, mission state machine, fixed-step loop
game/src/flight.js     lift, drag, thrust, stall and ground handling
game/src/aircraft.js   the Kestrel, built from primitives, with its cockpit
game/src/panel.js      the instrument panel, drawn to a canvas and mapped onto the panel
game/src/hud.js        tapes, pitch ladder, target caret and warnings
game/src/terrain.js    the island height field, airfield, scenery
game/src/sky.js        sky dome, sea shader and light
game/src/missions.js   gates, depots and the landing trial
game/src/audio.js      synthesized engine, wind, cannon and warnings
game/src/input.js      keyboard and mouse controls
main.ts                copies game/ and screenshots/ to /output and writes the dossier
```

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
