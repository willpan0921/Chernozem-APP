// WHAT THIS FILE DOES
// Reads narration lines aloud with a macOS voice (by default the Siri
// natural voice "Nora") and saves each line as its own sound file, the way
// $S/voice/render.swift does for one line, but for a whole list in one go.
//
//   swift -swift-version 5 voice.swift jobs.json
//
// Run it like that, through "swift": a program compiled with swiftc is not
// offered the Siri voices (it silently gets a default 22 kHz voice; then
// narrate.py stops, since it checks the voice and the sample rate).
//
// jobs.json is a list of lines:
//   [{ "id": "field-03", "text": "Every clear pass is read.", "rate": 0.5,
//      "out": "/path/field-03" }, ...]
// For each line it writes <out>.caf (48 kHz, to listen to), <out>.f32
// (the same samples as raw 32-bit floats, for the mixing script) and
// <out>.words.json (where each word starts, in samples, for the captions),
// and prints one JSON line: { id, seconds, sampleRate, peak, rate, voice }.
// "rate" is AVSpeechUtterance.rate (0.5 is the voice's normal speed).
//
// The voice hands its sound back through a callback that only runs while
// the main run loop turns, so the program turns it until each line is done.
//
// WHO EDITS IT
// Nobody, normally: the narration's words live in narration.json.
import AVFoundation
import Foundation

struct Job: Decodable {
  let id: String
  let text: String
  let rate: Float?
  let out: String
  let voice: String?
}

let jobsData = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let jobs = try JSONDecoder().decode([Job].self, from: jobsData)
let synth = AVSpeechSynthesizer()

for job in jobs {
  let utterance = AVSpeechUtterance(string: job.text)
  utterance.voice = AVSpeechSynthesisVoice(identifier: job.voice ?? "com.apple.siri.natural.Nora")
  if let rate = job.rate { utterance.rate = rate }
  var file: AVAudioFile? = nil
  var samples: [Float] = []
  var sampleRate: Double = 0
  var bytesPerFrame = 4
  var finished = false
  // Where each word starts in the sound (the voice reports it as a byte
  // offset into its 32-bit stream), so the captions can be split exactly.
  var words: [[String: Any]] = []
  try? FileManager.default.removeItem(atPath: job.out + ".caf")
  synth.write(utterance, toBufferCallback: { buffer in
    guard let pcm = buffer as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 { finished = true; return }
    if file == nil {
      sampleRate = pcm.format.sampleRate
      bytesPerFrame = Int(pcm.format.streamDescription.pointee.mBytesPerFrame)
      file = try? AVAudioFile(forWriting: URL(fileURLWithPath: job.out + ".caf"), settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
    }
    try? file?.write(from: pcm)
    let n = Int(pcm.frameLength)
    if let ch = pcm.floatChannelData {
      samples.append(contentsOf: UnsafeBufferPointer(start: ch[0], count: n))
    } else if let ch = pcm.int16ChannelData {
      for i in 0..<n { samples.append(Float(ch[0][i]) / 32768) }
    }
  }, toMarkerCallback: { markers in
    for m in markers where m.mark == .word {
      words.append(["byte": m.byteSampleOffset, "loc": m.textRange.location, "len": m.textRange.length])
    }
  })
  let deadline = Date().addingTimeInterval(120)
  while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
  file = nil
  let raw = samples.withUnsafeBufferPointer { Data(buffer: $0) }
  try raw.write(to: URL(fileURLWithPath: job.out + ".f32"))
  let wordList = words.map { w -> [String: Any] in
    var x = w
    x["sample"] = (w["byte"] as! Int) / max(bytesPerFrame, 1)
    return x
  }
  let wordsJSON = try JSONSerialization.data(withJSONObject: ["text": job.text, "bytesPerFrame": bytesPerFrame, "words": wordList], options: [.sortedKeys])
  try wordsJSON.write(to: URL(fileURLWithPath: job.out + ".words.json"))
  let peak = samples.reduce(Float(0)) { max($0, abs($1)) }
  let seconds = sampleRate > 0 ? Double(samples.count) / sampleRate : 0
  let line: [String: Any] = ["id": job.id, "seconds": seconds, "sampleRate": sampleRate, "peak": peak, "rate": utterance.rate, "voice": utterance.voice?.identifier ?? "nil", "finished": finished]
  let json = try JSONSerialization.data(withJSONObject: line, options: [.sortedKeys])
  print(String(data: json, encoding: .utf8)!)
  fflush(stdout)
}
