"use strict";
require("dotenv").config(); // harmless locally; on Vercel, env vars come from the dashboard

var express = require("express");
var cors = require("cors");
var multer = require("multer");

var caption = require("./lib/caption");
var { transcribeCloud } = require("./lib/transcribeCloud");

var PORT = process.env.BCS_PORT || 5177;

var app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" })); // small JSON bodies only (segments, not media)

// In-memory upload only — Vercel's filesystem is read-only outside /tmp,
// and we don't need to persist the audio anywhere; it's forwarded straight
// to OpenAI and then discarded.
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

app.get("/api/health", function (req, res) {
  res.json({
    ok: true,
    service: "bangla-caption-studio",
    version: "2.0.0",
    mode: "cloud",
    whisperConfigured: !!process.env.OPENAI_API_KEY
  });
});

/**
 * Expects multipart/form-data:
 *   audio            - the extracted audio file (small clip, not full video)
 *   language          - "bn" | "en" | "banglish"
 *   wordTimestamps    - "true"/"false"
 *   autoCleanup       - "true"/"false"
 *   autoLineBreak     - "true"/"false"
 */
app.post("/api/transcribe", upload.single("audio"), async function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "অডিও ফাইল পাওয়া যায়নি (multipart field name: 'audio')।" });
    }
    var body = req.body || {};
    var result = await transcribeCloud(req.file.buffer, req.file.originalname, {
      language: body.language || "bn",
      wordTimestamps: body.wordTimestamps === "true" || body.wordTimestamps === true,
      autoCleanup: body.autoCleanup === "true" || body.autoCleanup === true,
      autoLineBreak: body.autoLineBreak === "true" || body.autoLineBreak === true
    });
    res.json(result);
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: err.message, code: "TRANSCRIPTION_ERROR" });
  }
});

// Export endpoints just return formatted TEXT CONTENT (not a file path —
// a serverless function has no persistent disk to hand a path back to).
// The extension writes this content to a local file itself.
function doExport(req, res, ext, formatter) {
  try {
    var segments = (req.body && req.body.segments) || [];
    if (!segments.length) {
      return res.status(400).json({ error: "segments খালি" });
    }
    res.json({ content: formatter(segments), format: ext });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: err.message, code: "EXPORT_ERROR" });
  }
}

app.post("/api/export/srt", function (req, res) { doExport(req, res, "srt", caption.toSRT); });
app.post("/api/export/vtt", function (req, res) { doExport(req, res, "vtt", caption.toVTT); });
app.post("/api/export/json", function (req, res) { doExport(req, res, "json", caption.toJSON); });
app.post("/api/export/txt", function (req, res) { doExport(req, res, "txt", caption.toTXT); });

// NOTE: Burn-in (rendering captions into the actual video with FFmpeg) is no
// longer a server route. Uploading a whole video to a serverless function
// and burning subtitles there would be slow, likely hit Vercel's execution
// time/body-size limits, and cost money per request. It now runs entirely
// on the user's own machine using the FFmpeg bundled with the extension —
// see client/js/main.js `burnInExport()`.

// When this file runs locally (`node server.js`), start a normal HTTP
// listener. On Vercel, the platform imports `app` via module.exports below
// and never calls .listen() itself.
if (require.main === module) {
  app.listen(PORT, function () {
    console.log("Bangla Caption Studio — cloud API (local test mode)");
    console.log("→ http://localhost:" + PORT);
    console.log("→ OPENAI_API_KEY configured:", !!process.env.OPENAI_API_KEY);
  });
}

module.exports = app;
