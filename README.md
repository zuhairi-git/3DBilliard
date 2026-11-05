# 3D Billiard

Run `npm install` and `npm run dev` for development. For a production server, run
`npm run build` followed by `npm start` (port 3000, or the `PORT` environment variable).
The Node server serves the built game and its WebSocket multiplayer endpoint.
A static file host alone does not support online games.

## Play

- Practice controls both sides of a two-player game. Settings also offers a computer opponent.
- Eight-ball displays each player's solids/stripes assignment and remaining balls.
  The break leaves the table open. A legal pot after the break assigns groups.
  Pot your group before the eight, then call its pocket by tapping a pocket or using
  the control selector. Potting the eight early, into another pocket, or scratching on it loses.
  This is a friendly ruleset without called pockets or formal tournament break requirements.
- Aim by tapping or dragging on the felt. Double-tap/click the cue ball, or use **Lock aim**,
  then drag opposite the cue direction on the table and release to shoot. Power is shared
  with the bottom cue control. Every shot unlocks aim automatically.
- The dashed guide predicts the object ball's initial path and highlights an aligned pocket.
  It stops at another ball or a cushion; it does not predict subsequent banks or full-shot outcomes.
  **Shot guides** in Settings turns all guides on/off, defaults to on, and remembers the choice.
- The game saves locally every half second and when the page hides. Refresh restores an
  unfinished shot as well as the ball positions, players, turn, groups and scores.
- The camera ruler on the right zooms from 0.65× to 2.5×. Drag its marker, use +/−,
  or tap the magnification to return to the fitted table view. Zoom is remembered.
- The centred player panels show the assigned groups and a stack of numbered balls.
  Pocketed balls are bright; balls still on the table appear faint. Ball in hand and
  the winning player also have explicit banners.

## Profiles and online play

Open **Profile** to set your name, see your player ID and QR code, and accept invites.
The opponent opens the same game server and scans the QR, reads a QR photo, or enters
the ID. A phone's normal camera can also open the invite link. Both players must use
the same reachable server; use a network hostname/address rather than `localhost`
for another device. Camera scanning requires HTTPS or localhost; photo/ID entry works
when camera access is unavailable.

Player identities are stored in this browser. A private random token establishes the
public player ID; the invite exposes only the public ID. Clearing browser storage changes
the identity. The host runs the match simulation and the guest submits validated inputs.
Disconnects pause play. Reconnecting restores the last server snapshot for up to ten
minutes while the same server process stays running. A server restart clears online
rooms; local game snapshots remain in the browser. This is casual multiplayer, not an
anti-cheat or account system.

Online turns have a server-managed 30-second shot clock. Time pauses during the stroke,
ball motion and disconnects, and starts again when the table is ready. Timing out passes
the turn and gives the opponent ball in hand. Practice and computer games have no clock.

## Checks

`npm test` covers collisions, friction/spin, shot power, pocket approaches, containment,
rules, saved-state validation, cue clearance, aiming guides, QR decoding and two-client
online reconnection. `npm run build` includes TypeScript checking. Visual and touch/camera
review is manual.
