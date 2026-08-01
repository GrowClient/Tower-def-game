# Soundtrack

`theme.ogg` + `theme.mp3` — the same 90-second loop in two formats. Chrome and
Firefox take the OGG, Safari the MP3; `src/audio/music.ts` tries them in that
order, so one pair of files covers every browser without sniffing user agents.

## How this loop was made

The source was 2:07 and written to loop at its own end, so cutting it at 1:30
would have clicked every time round. Instead the four seconds AFTER the cut are
faded down over the first four seconds of the track:

- the file **ends** on the audio at 1:30
- the file **begins** with the audio that followed 1:30, fading into the real
  opening

So the seam is the one point in the track where the music genuinely continues
into itself. Rebuild it with:

```
ffmpeg -i source.mp3 -filter_complex "
  [0:a]atrim=0:90,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=4[body];
  [0:a]atrim=90:94,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=4[tail];
  [body][tail]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]
" -map "[out]" -ar 44100 theme.wav
```

`TRACK_SECONDS` in `music.ts` must match the length — MP3 decodes ~40ms longer
than it should because encoders pad the file, and `loopEnd` is clamped to the
real musical length so that padding is never played at the seam.

## Replacing it

Drop in a new pair with the same names. The game works with neither: the player
fetches in the background and stays silent if they are missing, so a build with
no soundtrack is a quiet game rather than a broken one.

- **60–120 seconds**, ending where the loop restarts. No fade out.
- **Around −14 LUFS.** The current track measures −14.8, which is right: combat
  SFX play on top, and music that fights the game is music players mute.
- **96–128 kbps.** Higher only makes the download bigger.
- It has to be **yours**, or licensed for commercial use — the web game portals
  ask you to confirm that.
