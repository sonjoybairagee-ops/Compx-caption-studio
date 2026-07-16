"use strict";
var express = require("express");
var cors = require("cors");
var path = require("path");
var fs = require("fs");
var os = require("os");
var crypto = require("crypto");

var { transcribe } = require("./lib/transcribe");
var caption = require("./lib/caption");
var { burnSubtitles } = require("./lib/ffmpeg");

var PORT = process.env.BCS_PORT || 5177;
var OUTPUT_DIR = path.join(os.homedir(), "BanglaCaptionStudio", "exports");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

var app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", function (req, res) {
  res.json({ ok: true, service: "bangla-caption-studio", version: "1.0.0" });
});

app.post("/api/transcribe", async function (req, res) {
  var body = req.body || {};
  if (!body.sourcePath) return res.status(400).json({ error: "sourcePath প্রয়োজন" });

  try {
    var result = await transcribe({
      sourcePath: body.sourcePath,
      language: body.language || "bn",
      model: body.model || "medium",
      wordTimestamps: !!body.wordTimestamps,
      autoCleanup: !!body.autoCleanup,
      autoLineBreak: !!body.autoLineBreak
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (!segments.length) return res.status(400).json({ error: "segments খালি" });
    var filePath = outFile(ext);
    fs.writeFileSync(filePath, formatter(segments), "utf8");
    res.json({ path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.post("/api/export/burn", async function (req, res) {
  try {
    var body = req.body || {};
    var segments = body.segments || [];
    if (!body.sourcePath) return res.status(400).json({ error: "sourcePath প্রয়োজন" });
    if (!segments.length) return res.status(400).json({ error: "segments খালি" });

    var assPath = outFile("ass");
    fs.writeFileSync(assPath, caption.toASSKaraoke(segments, body.style || "youtube"), "utf8");

    var outPath = outFile("mp4");
    await burnSubtitles(body.sourcePath, assPath, outPath);

    res.json({ path: outPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "127.0.0.1", function () {
  console.log("Bangla Caption Studio backend running → http://127.0.0.1:" + PORT);
  console.log("Exports saved to: " + OUTPUT_DIR);
});
