"use strict";

function pad(n, len) {
  len = len || 2;
  n = String(Math.floor(n));
  while (n.length < len) n = "0" + n;
  return n;
}

function srtTime(sec) {
  var ms = Math.round((sec % 1) * 1000);
  var s = Math.floor(sec) % 60;
  var m = Math.floor(sec / 60) % 60;
  var h = Math.floor(sec / 3600);
  return pad(h) + ":" + pad(m) + ":" + pad(s) + "," + pad(ms, 3);
}

function vttTime(sec) {
  var ms = Math.round((sec % 1) * 1000);
  var s = Math.floor(sec) % 60;
  var m = Math.floor(sec / 60) % 60;
  var h = Math.floor(sec / 3600);
  return pad(h) + ":" + pad(m) + ":" + pad(s) + "." + pad(ms, 3);
}

function toSRT(segments) {
  return segments.map(function (seg, i) {
    return (i + 1) + "\n" + srtTime(seg.start) + " --> " + srtTime(seg.end) + "\n" + seg.text + "\n";
  }).join("\n");
}

function toVTT(segments) {
  var body = segments.map(function (seg) {
    return vttTime(seg.start) + " --> " + vttTime(seg.end) + "\n" + seg.text;
  }).join("\n\n");
  return "WEBVTT\n\n" + body + "\n";
}

function toJSON(segments) {
  return JSON.stringify({ segments: segments }, null, 2);
}

function toTXT(segments) {
  return segments.map(function (s) { return s.text; }).join("\n");
}

// Style presets referenced by the burn-in (FFmpeg/ASS) export.
var STYLE_PRESETS = {
  youtube:      { font: "Noto Sans Bengali", size: 46, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H64000000", bold: 1 },
  shorts:       { font: "Noto Sans Bengali", size: 56, primary: "&H0000E5FF", outline: "&H00101010", back: "&H00000000", bold: 1 },
  tiktok:       { font: "Noto Sans Bengali", size: 54, primary: "&H00FFFFFF", outline: "&H00202020", back: "&H00000000", bold: 1 },
  facebook:     { font: "Noto Sans Bengali", size: 44, primary: "&H00FFFFFF", outline: "&H00000000", back: "&H78000000", bold: 1 },
  podcast:      { font: "Noto Sans Bengali", size: 40, primary: "&H00E0E0E0", outline: "&H00000000", back: "&HA0000000", bold: 0 },
  documentary:  { font: "Noto Serif Bengali", size: 38, primary: "&H00F2F2F2", outline: "&H00000000", back: "&H00000000", bold: 0 }
};

/**
 * Builds an .ass subtitle file with per-word karaoke highlighting
 * (\k tags), which FFmpeg can burn directly into the video with the
 * `ass` filter. This is what powers "animated" karaoke-style captions
 * for the burned-in export path.
 */
function toASSKaraoke(segments, styleName) {
  var preset = STYLE_PRESETS[styleName] || STYLE_PRESETS.youtube;

  var header =
"[Script Info]\n" +
"ScriptType: v4.00+\n" +
"PlayResX: 1080\n" +
"PlayResY: 1920\n" +
"WrapStyle: 0\n\n" +
"[V4+ Styles]\n" +
"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n" +
"Style: Default," + preset.font + "," + preset.size + "," + preset.primary + ",&H000000FF," + preset.outline + "," + preset.back + "," + preset.bold + ",0,2,0,2,60,60,140\n\n" +
"[Events]\n" +
"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  var lines = segments.map(function (seg) {
    var text;
    if (seg.words && seg.words.length) {
      text = seg.words.map(function (w) {
        var cs = Math.max(1, Math.round((w.end - w.start) * 100)); // centiseconds
        return "{\\k" + cs + "}" + w.w;
      }).join(" ");
    } else {
      text = seg.text;
    }
    return "Dialogue: 0," + assTime(seg.start) + "," + assTime(seg.end) + ",Default,,0,0,0,,{\\fad(120,120)}" + text;
  });

  return header + lines.join("\n") + "\n";
}

function assTime(sec) {
  var cs = Math.round((sec % 1) * 100);
  var s = Math.floor(sec) % 60;
  var m = Math.floor(sec / 60) % 60;
  var h = Math.floor(sec / 3600);
  return h + ":" + pad(m) + ":" + pad(s) + "." + pad(cs);
}

module.exports = { toSRT: toSRT, toVTT: toVTT, toJSON: toJSON, toTXT: toTXT, toASSKaraoke: toASSKaraoke, STYLE_PRESETS: STYLE_PRESETS };
