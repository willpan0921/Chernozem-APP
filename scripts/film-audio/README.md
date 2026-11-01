# The walkthrough films' sound

The Methodology page's two walkthrough films (`public/site/film/field-walkthrough.mp4`, `atlas-walkthrough.mp4`) carry a narrated voice that walks through every step, over quiet music, with English captions (`*.vtt`). The picture is the recording made from the real app; these tools only add the sound, without touching a frame.

- **The words** are in `narration.json` (one line per step). The full script with its times is in `docs/narration/` (one file per film): use it to re-record the narration in another voice, for example your own, keeping each line inside its window.
- **The voice** is Apple's Siri voice "Nora", read on a Mac by `voice.swift`. Apple licenses its voices for personal, non-commercial projects. That fits Chernozem while it is free; if Chernozem is ever sold, re-record the narration (for example in your own voice) from the script.
- **The music** is composed from scratch by `narrate.py` (soft pad chords, a sparse bell line, a low bass, a gentle reverb), so it has no licence question. It is turned down 9 dB whenever the voice speaks.

## Making the films again

On a Mac with Python 3 (`python3 -m pip install --user numpy scipy`), Node and Swift (Xcode's command-line tools):

1. Make a work folder anywhere outside the repo and copy this folder into it as `tools/`.
2. Put the silent films into `orig/` beside it, from git (the last commit before the sound): `git show 934d3cd:public/site/film/field-walkthrough.mp4 > orig/field-walkthrough.mp4`, and the same for `atlas-walkthrough.mp4`.
3. Run `bash tools/make-films.sh`. The results land in `out/`: copy `out/*.mp4` and `out/*.vtt` into `public/site/film/`.
4. Run `npm test`: `src/site/components/walkthroughFiles.test.js` checks that each film has its picture and its sound, the right length, and captions that stay inside the film.

If a film is ever re-recorded, its steps move: update `field-events.json` or `atlas-events.json` (the times of the film's own captions) and `narration.json`, then run the steps above. `narrate.py fit <film>` checks that every line fits its step before anything is written.

`addsmpb.mjs` writes the note about the AAC encoder's short lead-in that Apple's export drops; without it Chrome plays the voice 44 ms late.
