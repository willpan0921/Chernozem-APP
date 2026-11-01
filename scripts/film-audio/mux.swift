// WHAT THIS FILE DOES
// Puts a sound track (an .m4a, already AAC) into a walkthrough film (.mp4)
// without re-encoding anything: AVFoundation copies the film's video
// samples and the sound's samples as they are ("passthrough"), so every
// frame of the film stays byte-for-byte the same. The new file has its
// index at the front (shouldOptimizeForNetworkUse), so a browser can
// start playing before the whole film has arrived.
//
//   swift mux.swift <film.mp4> <sound.m4a> <out.mp4>
//
// The film must have one video track and no sound; the sound must be as
// long as the film (narrate.py makes it so); it is cut to the film's
// length if it is longer.
//
// The export leaves out the m4a's note on the AAC encoder's lead-in (the
// iTunSMPB tag; AVFoundation does not write it into an .mp4, even when
// handed it), so addsmpb.mjs adds it afterwards. Without it Chrome plays
// the voice 44 ms late.
//
// WHO EDITS IT
// Nobody, normally.
import AVFoundation
import Foundation

let args = CommandLine.arguments
let film = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let sound = AVURLAsset(url: URL(fileURLWithPath: args[2]))
let outURL = URL(fileURLWithPath: args[3])

let videoTracks = film.tracks(withMediaType: .video)
let filmSound = film.tracks(withMediaType: .audio)
let soundTracks = sound.tracks(withMediaType: .audio)
guard videoTracks.count == 1, filmSound.isEmpty, soundTracks.count == 1 else {
  print("expected one video track and no sound in the film, one sound track in the m4a; got \(videoTracks.count), \(filmSound.count), \(soundTracks.count)")
  exit(1)
}
let filmLength = film.duration
let soundLength = sound.duration

let composition = AVMutableComposition()
let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try video.insertTimeRange(CMTimeRange(start: .zero, duration: filmLength), of: videoTracks[0], at: .zero)
video.preferredTransform = videoTracks[0].preferredTransform
let audio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try audio.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(soundLength, filmLength)), of: soundTracks[0], at: .zero)
audio.languageCode = "eng"
audio.extendedLanguageTag = "en"

try? FileManager.default.removeItem(at: outURL)
guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
  print("no passthrough export session")
  exit(1)
}
export.outputURL = outURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true
let done = DispatchGroup()
done.enter()
export.exportAsynchronously { done.leave() }
done.wait()
if export.status != .completed {
  print("export failed: \(export.status.rawValue) \(String(describing: export.error))")
  exit(1)
}
let made = AVURLAsset(url: outURL)
print("wrote \(args[3]): film \(CMTimeGetSeconds(filmLength)) s, sound \(CMTimeGetSeconds(soundLength)) s, result \(CMTimeGetSeconds(made.duration)) s, video tracks \(made.tracks(withMediaType: .video).count), sound tracks \(made.tracks(withMediaType: .audio).count)")
