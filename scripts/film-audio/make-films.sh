#!/bin/bash
# WHAT THIS FILE DOES
# Makes both narrated walkthrough films from scratch, in order:
#   1. narrate.py build   the voice, the music, the mix (.wav, .m4a),
#                         the captions (.vtt) and the narration script
#   2. mux.swift          the sound into the original film, video untouched
#   3. addsmpb.mjs        the AAC lead-in note, so Chrome lines up too
# The originals are the silent films as they were in git (orig/); the
# results go to out/: <film>-walkthrough.mp4 and <film>-walkthrough.vtt,
# ready for public/site/film/.
#
#   bash make-films.sh
#
# WHO EDITS IT
# Nobody, normally: the words are in narration.json.
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
W="$(dirname "$T")"
mkdir -p "$W/out" "$W/exported"
for f in field atlas; do
  python3 "$T/narrate.py" build "$f" | grep -v '^ *[0-9]* [0-9]:'
  # (mux.swift's own warnings about older AVFoundation calls are left out;
  # a failure still stops this script.)
  swift -swift-version 5 "$T/mux.swift" "$W/orig/$f-walkthrough.mp4" "$W/mix/$f-walkthrough.m4a" "$W/exported/$f-walkthrough.mp4" 2>/dev/null
  node "$T/addsmpb.mjs" "$W/exported/$f-walkthrough.mp4" "$W/mix/$f-walkthrough.m4a" "$W/out/$f-walkthrough.mp4"
  cp "$W/mix/$f-walkthrough.vtt" "$W/out/$f-walkthrough.vtt"
done
ls -l "$W/out"
