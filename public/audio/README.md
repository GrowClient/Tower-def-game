# Soundtrack

`theme.ogg` + `theme.mp3` — the same 2:07 track in two formats. Chrome and
Firefox take the OGG, Safari the MP3; `src/audio/music.ts` tries them in that
order, so one pair of files covers every browser without sniffing user agents.

## The file is not edited.

Two attempts to improve the loop point were made and both were rejected by the
person who wrote the music, which settled the question:

1. **A crossfade baked into the file.** The track was cut at 1:30 and the four
   seconds after the cut were faded down over the opening bars, so the file
   genuinely continued into itself. It looped perfectly and it permanently
   muddied the intro — the part every player hears first and most often.
2. **A crossfade scheduled at playback.** The file stayed intact, but the ending
   was still ramped away under the returning intro. Softer, and still an edit to
   an ending the composer had written to land.

So: the track is transcoded and nothing else. It plays whole, from the first
sample to the last, and then again. It was written as a loop; the composer's
seam is the right one.

```
ffmpeg -i source.mp3 -ar 44100 -ac 2 theme.wav
ffmpeg -i theme.wav -c:a libvorbis  -q:a 3    theme.ogg
ffmpeg -i theme.wav -c:a libmp3lame -b:a 112k theme.mp3
```

The single exception is `loopEnd`, and it is not an edit: MP3 encoders PAD a
file, so the shipped MP3 decodes ~40ms longer than the recording and a naive
loop replays silence that was never played. `TRACK_SECONDS` in `music.ts` is the
decoded length of the **WAV**, so both formats loop on the music rather than on
whatever the encoder appended. Update it whenever the track is replaced.

## Replacing it

Drop in a new pair with the same names and update `TRACK_SECONDS`. The game
works with neither: the player fetches in the background and stays silent if
they are missing, so a build with no soundtrack is a quiet game rather than a
broken one.

- **Any length**, but it has to **loop on its own** — the end runs straight
  into the start with nothing in between, so it should resolve into its own
  opening rather than fading out.
- **Around −14 LUFS.** The current track measures −14.8, which is right: combat
  SFX play on top, and music that fights the game is music players mute.
- **96–128 kbps.** Higher only makes the download bigger.
- It has to be **yours**, or licensed for commercial use — the web game portals
  ask you to confirm that.
