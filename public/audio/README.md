# Soundtrack

Drop the theme here as **`theme.ogg`** and **`theme.mp3`** (same music, two
formats — Chrome and Firefox take the OGG, Safari the MP3).

The game works fine with neither: `src/audio/music.ts` fetches them in the
background and stays silent if they are missing, so a build without music is a
quiet game rather than a broken one.

What the track should be:

- **60–120 seconds**, written so the end runs straight back into the start.
  Do not fade out.
- **Peaking around −14 dB.** Combat SFX play on top of this, and music that
  fights the game is music players mute.
- **96–128 kbps** is plenty. Higher just makes the download bigger.
- It has to be **yours**, or licensed for commercial use. The web game portals
  ask you to confirm that, and a copyright claim on a portal is a real problem.

Looping is sample-accurate — the file is decoded to a raw buffer, so there is
no encoder gap at the seam the way an `<audio loop>` tag would give you.
