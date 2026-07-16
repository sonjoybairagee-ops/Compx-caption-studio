"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");
var crypto = require("crypto");
var { spawn } = require("child_process");
var { extractAudio } = require("./ffmpeg");

// API-based transcription option
var USE_API = process.env.USE_WHISPER_API === "true";
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Common Bangla filler / hesitation words removed by "Auto Cleanup".
var FILLERS = ["আ", "আঁ", "উম", "উমম", "মানে", "তো", "এই", "ইয়ে", "হ্যাঁ মানে"];

var LANG_MAP = { bn: "bn", en: "en", banglish: "bn" }; // banglish transcribed with bn model, mixed script kept as-is

function tmpFile(ext) {
  return path.join(os.tmpdir(), "bcs_" + crypto.randomBytes(6).toString("hex") + "." + ext);
}

/**
 * Runs server/lib/whisper_transcribe.py, which wraps faster-whisper and
 * prints word-level segment JSON to stdout. Requires Python 3 + the
 * `faster-whisper` package to be installed locally (see server/README).
 */
function runWhisper(wavPath, langCode, modelSize) {
  return new Promise(function (resolve, reject) {
    var scriptPath = path.join(__dirname, "whisper_transcribe.py");
    var py = spawn("python3", [scriptPath, "--audio", wavPath, "--lang", langCode, "--model", modelSize]);

    var stdout = "";
    var stderr = "";
    py.stdout.on("data", function (d) { stdout += d.toString(); });
    py.stderr.on("data", function (d) { stderr += d.toString(); });

    py.on("error", function (err) {
      reject(new Error("Python চালানো যায়নি (python3 ও faster-whisper ইনস্টল আছে কিনা দেখুন): " + err.message));
    });

    py.on("close", function (code) {
      if (code !== 0) {
        reject(new Error("Whisper প্রসেস ব্যর্থ হয়েছে: " + stderr.slice(-2000)));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error("Whisper আউটপুট পার্স করা যায়নি: " + e.message));
      }
    });
  });
}

function cleanFillers(text) {
  var pattern = new RegExp("(^|\\s)(" + FILLERS.join("|") + ")(?=\\s|$)", "g");
  return text.replace(pattern, " ").replace(/\s{2,}/g, " ").trim();
}

// Breaks a long line into shorter, readable chunks (~42 chars/line, 2 lines max)
// mirroring the "Auto Line Break" feature described in the product spec.
function autoLineBreak(text, maxChars) {
  maxChars = maxChars || 24;
  var words = text.split(/\s+/).filter(Boolean);
  var lines = [];
  var current = "";
  words.forEach(function (w) {
    if ((current + " " + w).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  });
  if (current) lines.push(current);
  return lines.join("\n");
}

/**
 * Transcribe using OpenAI Whisper API (cloud-based, simple)
 */
async function transcribeWithAPI(audioPath, opts) {
  var FormData = require("form-data");
  var https = require("https");
  
  return new Promise((resolve, reject) => {
    if (!OPENAI_API_KEY) {
      return reject(new Error("OpenAI API key not configured. Set OPENAI_API_KEY environment variable."));
    }

    var form = new FormData();
    form.append("file", fs.createReadStream(audioPath));
    form.append("model", "whisper-1");
    form.append("language", opts.language || "bn");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");

    var options = {
      hostname: "api.openai.com",
      path: "/v1/audio/transcriptions",
      method: "POST",
      headers: {
        ...form.getHeaders(),
        "Authorization": "Bearer " + OPENAI_API_KEY
      }
    };

    var req = https.request(options, (res) => {
      var data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          var result = JSON.parse(data);
          
          if (result.error) {
            return reject(new Error("OpenAI API Error: " + result.error.message));
          }

          // Convert API format to our format
          var segments = (result.words || []).map(w => ({
            start: w.start,
            end: w.end,
            text: w.word,
            words: [{ w: w.word, start: w.start, end: w.end }]
          }));

          resolve({ segments: segments });
        } catch (e) {
          reject(new Error("Failed to parse API response: " + e.message));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error("API request failed: " + err.message));
    });

    form.pipe(req);
  });
}

/**
 * Full pipeline with API option
 */
async function transcribe(opts) {
  var wavPath = tmpFile("wav");
  await extractAudio(opts.sourcePath, wavPath);

  var result;
  
  try {
    if (USE_API) {
      // Use OpenAI API (no local Python needed!)
      result = await transcribeWithAPI(wavPath, opts);
    } else {
      // Use local faster-whisper
      var langCode = LANG_MAP[opts.language] || "bn";
      result = await runWhisper(wavPath, langCode, opts.model || "medium");
    }
  } finally {
    try { fs.unlinkSync(wavPath); } catch (e) {}
  }

  var segments = (result.segments || []).map(function (seg) {
    var text = seg.text.trim();
    if (opts.autoCleanup) text = cleanFillers(text);
    if (opts.autoLineBreak) text = autoLineBreak(text);
    return {
      start: seg.start,
      end: seg.end,
      text: text,
      words: opts.wordTimestamps ? (seg.words || []) : []
    };
  });

  return { segments: segments };
}

module.exports = { transcribe: transcribe, cleanFillers: cleanFillers, autoLineBreak: autoLineBreak };
