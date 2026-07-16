"use strict";
require('dotenv').config(); // Load .env file

var express = require("express");
var cors = require("cors");
var path = require("path");
var fs = require("fs");
var os = require("os");
var crypto = require("crypto");
var { spawn } = require("child_process");

var { transcribe } = require("./lib/transcribe");
var caption = require("./lib/caption");
var { burnSubtitles } = require("./lib/ffmpeg");

var PORT = process.env.BCS_PORT || 5177;
var OUTPUT_DIR = path.join(os.homedir(), "BanglaCaptionStudio", "exports");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

var USE_API = process.env.USE_WHISPER_API === "true";
var API_KEY = process.env.OPENAI_API_KEY || "";

var app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Dependency checks
var depsStatus = {
  python: false,
  whisper: false,
  ffmpeg: false,
  lastCheck: null
};

async function checkPython() {
  return new Promise((resolve) => {
    var proc = spawn("python", ["--version"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function checkWhisper() {
  return new Promise((resolve) => {
    var proc = spawn("python", ["-c", "import faster_whisper"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function checkFFmpeg() {
  return new Promise((resolve) => {
    var proc = spawn("ffmpeg", ["-version"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function checkAllDependencies() {
  depsStatus.python = await checkPython();
  depsStatus.whisper = await checkWhisper();
  depsStatus.ffmpeg = await checkFFmpeg();
  depsStatus.lastCheck = new Date().toISOString();
  return depsStatus;
}

// Check dependencies on startup
checkAllDependencies().then((status) => {
  console.log("Dependency Check:");
  
  if (USE_API) {
    console.log("  Mode: API (OpenAI Whisper)");
    console.log("  OpenAI API:", API_KEY ? "✓ Configured" : "✗ Not configured");
    console.log("  Python:", status.python ? "✓" : "⚠️ (not needed in API mode)");
    console.log("  Faster-Whisper:", status.whisper ? "✓" : "⚠️ (not needed in API mode)");
    console.log("  FFmpeg:", status.ffmpeg ? "✓" : "✗ (Install FFmpeg and add to PATH)");
  } else {
    console.log("  Mode: Local (faster-whisper)");
    console.log("  Python:", status.python ? "✓" : "✗ (Install Python 3.9+)");
    console.log("  Faster-Whisper:", status.whisper ? "✓" : "✗ (Run: pip install faster-whisper)");
    console.log("  FFmpeg:", status.ffmpeg ? "✓" : "✗ (Install FFmpeg and add to PATH)");
  }
});

app.get("/api/health", function (req, res) {
  res.json({ 
    ok: true, 
    service: "bangla-caption-studio", 
    version: "1.6.0",
    mode: USE_API ? "api" : "local",
    dependencies: depsStatus
  });
});

app.get("/api/check-deps", async function (req, res) {
  var status = await checkAllDependencies();
  res.json(status);
});

app.post("/api/transcribe", async function (req, res) {
  var body = req.body || {};
  
  // Validation
  if (!body.sourcePath) {
    return res.status(400).json({ error: "sourcePath প্রয়োজন" });
  }
  
  // Sanitize path (prevent path traversal)
  var sourcePath = path.normalize(body.sourcePath);
  if (!fs.existsSync(sourcePath)) {
    return res.status(400).json({ error: "ফাইল খুঁজে পাওয়া যায়নি: " + sourcePath });
  }

  // Check dependencies
  if (USE_API) {
    // API mode - only need FFmpeg
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      return res.status(500).json({ 
        error: "OpenAI API key not configured. Please set OPENAI_API_KEY in server/.env file.",
        code: "API_KEY_NOT_CONFIGURED"
      });
    }
    if (!depsStatus.ffmpeg) {
      return res.status(500).json({ 
        error: "FFmpeg ইনস্টল করা নেই। FFmpeg ডাউনলোড করে PATH-এ যোগ করুন।",
        code: "FFMPEG_NOT_FOUND"
      });
    }
  } else {
    // Local mode - need all dependencies
    if (!depsStatus.python) {
      return res.status(500).json({ 
        error: "Python ইনস্টল করা নেই। Python 3.9+ ইনস্টল করুন।",
        code: "PYTHON_NOT_FOUND"
      });
    }
    if (!depsStatus.whisper) {
      return res.status(500).json({ 
        error: "faster-whisper ইনস্টল করা নেই। চালান: pip install faster-whisper",
        code: "WHISPER_NOT_FOUND"
      });
    }
    if (!depsStatus.ffmpeg) {
      return res.status(500).json({ 
        error: "FFmpeg ইনস্টল করা নেই। FFmpeg ডাউনলোড করে PATH-এ যোগ করুন।",
        code: "FFMPEG_NOT_FOUND"
      });
    }
  }

  try {
    var result = await transcribe({
      sourcePath: sourcePath,
      language: body.language || "bn",
      model: body.model || "medium",
      wordTimestamps: !!body.wordTimestamps,
      autoCleanup: !!body.autoCleanup,
      autoLineBreak: !!body.autoLineBreak
    });
    res.json(result);
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ 
      error: err.message,
      code: "TRANSCRIPTION_ERROR"
    });
  }
});

function outFile(ext) {
  return path.join(OUTPUT_DIR, "caption_" + crypto.randomBytes(4).toString("hex") + "." + ext);
}

app.post("/api/export/srt", function (req, res) { doExport(req, res, "srt", caption.toSRT); });
app.post("/api/export/vtt", function (req, res) { doExport(req, res, "vtt", caption.toVTT); });
app.post("/api/export/json", function (req, res) { doExport(req, res, "json", caption.toJSON); });
app.post("/api/export/txt", function (req, res) { doExport(req, res, "txt", caption.toTXT); });

function doExport(req, res, ext, formatter) {
  try {
    var segments = (req.body && req.body.segments) || [];
    if (!segments.length) {
      return res.status(400).json({ error: "segments খালি" });
    }
    var filePath = outFile(ext);
    fs.writeFileSync(filePath, formatter(segments), "utf8");
    res.json({ path: filePath, format: ext });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: err.message, code: "EXPORT_ERROR" });
  }
}

app.post("/api/export/burn", async function (req, res) {
  try {
    var body = req.body || {};
    var segments = body.segments || [];
    
    if (!body.sourcePath) {
      return res.status(400).json({ error: "sourcePath প্রয়োজন" });
    }
    if (!segments.length) {
      return res.status(400).json({ error: "segments খালি" });
    }
    
    // Check FFmpeg
    if (!depsStatus.ffmpeg) {
      return res.status(500).json({ 
        error: "FFmpeg ইনস্টল করা নেই। FFmpeg ডাউনলোড করে PATH-এ যোগ করুন।",
        code: "FFMPEG_NOT_FOUND"
      });
    }

    var sourcePath = path.normalize(body.sourcePath);
    if (!fs.existsSync(sourcePath)) {
      return res.status(400).json({ error: "সোর্স ফাইল খুঁজে পাওয়া যায়নি" });
    }

    var assPath = outFile("ass");
    fs.writeFileSync(assPath, caption.toASSKaraoke(segments, body.style || "youtube"), "utf8");

    var outPath = outFile("mp4");
    await burnSubtitles(sourcePath, assPath, outPath);

    // Cleanup ASS file
    try { fs.unlinkSync(assPath); } catch (e) {}

    res.json({ path: outPath, format: "mp4" });
  } catch (err) {
    console.error("Burn-in error:", err);
    res.status(500).json({ error: err.message, code: "BURNIN_ERROR" });
  }
});

app.listen(PORT, "127.0.0.1", function () {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║   Bangla Caption Studio Backend v1.6.0                ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("→ Server: http://127.0.0.1:" + PORT);
  console.log("→ Mode: " + (USE_API ? "API (OpenAI Whisper)" : "Local (faster-whisper)"));
  console.log("→ Exports: " + OUTPUT_DIR);
  console.log("\nReady to accept requests from CEP extension...\n");
});
