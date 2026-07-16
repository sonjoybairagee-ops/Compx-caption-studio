"use strict";
var { spawn } = require("child_process");

function run(bin, args) {
  return new Promise(function (resolve, reject) {
    var proc = spawn(bin, args);
    var stderr = "";
    proc.stderr.on("data", function (d) { stderr += d.toString(); });
    proc.on("error", function (err) {
      reject(new Error(bin + " চালানো যায়নি — FFmpeg ইনস্টল আছে ও PATH-এ আছে কিনা দেখুন. (" + err.message + ")"));
    });
    proc.on("close", function (code) {
      if (code !== 0) reject(new Error(bin + " ব্যর্থ হয়েছে:\n" + stderr.slice(-2000)));
      else resolve();
    });
  });
}

/** Extracts mono 16kHz WAV audio from any video/audio source — the format faster-whisper expects. */
function extractAudio(sourcePath, outWavPath) {
  return run("ffmpeg", [
    "-y", "-i", sourcePath,
    "-vn", "-ac", "1", "-ar", "16000",
    "-acodec", "pcm_s16le",
    outWavPath
  ]);
}

/**
 * Burns an .ass subtitle file (with karaoke \k tags) into the source video.
 * NOTE: this operates on a single source media file, not a full multi-clip
 * Premiere sequence render. For a complete edited sequence, export the
 * sequence from Premiere first, then run the resulting file through this
 * endpoint.
 */
function burnSubtitles(sourcePath, assPath, outPath) {
  // ffmpeg's ass filter needs escaped path separators/colons on Windows.
  var escapedAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\\\:");
  return run("ffmpeg", [
    "-y", "-i", sourcePath,
    "-vf", "ass=" + escapedAss,
    "-c:a", "copy",
    outPath
  ]);
}

module.exports = { extractAudio: extractAudio, burnSubtitles: burnSubtitles };
