"use strict";
var FormData = require("form-data");
var https = require("https");
var textUtils = require("./textUtils");

var OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Words are grouped into a caption "segment" whenever the gap to the next
// word is bigger than this (a natural pause), or the running segment gets
// too long — mirrors how a real sentence-level ASR segment normally looks.
var PAUSE_GAP_SEC = 0.6;
var MAX_SEGMENT_SEC = 7;
var MAX_SEGMENT_CHARS = 90;

/**
 * Calls OpenAI's Whisper API with an in-memory audio buffer (no disk I/O —
 * safe to run inside a Vercel serverless function). Returns the raw
 * verbose_json response.
 */
function callWhisperAPI(buffer, filename, language) {
  return new Promise(function (resolve, reject) {
    if (!OPENAI_API_KEY) {
      return reject(new Error("OPENAI_API_KEY সেট করা নেই। Vercel project settings-এ environment variable যোগ করুন।"));
    }

    var form = new FormData();
    form.append("file", buffer, { filename: filename || "audio.mp3" });
    form.append("model", "whisper-1");
    if (language) form.append("language", language === "banglish" ? "bn" : language);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");

    var options = {
      hostname: "api.openai.com",
      path: "/v1/audio/transcriptions",
      method: "POST",
      headers: Object.assign({}, form.getHeaders(), {
        Authorization: "Bearer " + OPENAI_API_KEY
      })
    };

    var req = https.request(options, function (res) {
      var data = "";
      res.on("data", function (chunk) { data += chunk; });
      res.on("end", function () {
        try {
          var result = JSON.parse(data);
          if (result.error) {
            return reject(new Error("OpenAI API Error: " + result.error.message));
          }
          resolve(result);
        } catch (e) {
          reject(new Error("OpenAI response পার্স করা যায়নি: " + e.message));
        }
      });
    });

    req.on("error", function (err) {
      reject(new Error("OpenAI API request ব্যর্থ হয়েছে: " + err.message));
    });

    form.pipe(req);
  });
}

/**
 * Buckets a flat list of {word,start,end} into readable multi-word caption
 * segments. Used when the API only gives us word-level timestamps and not
 * pre-grouped sentence segments (this happens with timestamp_granularities
 * set to "word" — OpenAI does not always also return grouped segments).
 */
function bucketWordsIntoSegments(words) {
  var segments = [];
  var current = null;

  words.forEach(function (w) {
    var word = w.word != null ? w.word : w.w;
    var start = w.start;
    var end = w.end;

    if (!current) {
      current = { start: start, end: end, text: word, words: [{ w: word, start: start, end: end }] };
      return;
    }

    var gap = start - current.end;
    var wouldBeText = current.text + " " + word;
    var tooLong = (end - current.start) > MAX_SEGMENT_SEC || wouldBeText.length > MAX_SEGMENT_CHARS;

    if (gap > PAUSE_GAP_SEC || tooLong) {
      segments.push(current);
      current = { start: start, end: end, text: word, words: [{ w: word, start: start, end: end }] };
    } else {
      current.text = wouldBeText;
      current.end = end;
      current.words.push({ w: word, start: start, end: end });
    }
  });

  if (current) segments.push(current);
  return segments;
}

/**
 * Main entry point used by the /api/transcribe route.
 * opts: { language, wordTimestamps, autoCleanup, autoLineBreak }
 */
async function transcribeCloud(buffer, filename, opts) {
  opts = opts || {};
  var apiResult = await callWhisperAPI(buffer, filename, opts.language);

  var segments;
  if (apiResult.segments && apiResult.segments.length) {
    // API gave us proper sentence-level segments — attach words that fall
    // in each segment's time range (if word timestamps were returned).
    var flatWords = apiResult.words || [];
    segments = apiResult.segments.map(function (seg) {
      var segWords = flatWords.filter(function (w) {
        return w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05;
      }).map(function (w) { return { w: w.word, start: w.start, end: w.end }; });
      return { start: seg.start, end: seg.end, text: seg.text.trim(), words: segWords };
    });
  } else if (apiResult.words && apiResult.words.length) {
    segments = bucketWordsIntoSegments(apiResult.words);
  } else {
    // Last resort: no timestamps at all, just the plain text as one segment.
    segments = [{ start: 0, end: 0, text: (apiResult.text || "").trim(), words: [] }];
  }

  segments = segments.map(function (seg) {
    var text = seg.text;
    if (opts.autoCleanup) text = textUtils.cleanFillers(text);
    if (opts.autoLineBreak) text = textUtils.autoLineBreak(text);
    return {
      start: seg.start,
      end: seg.end,
      text: text,
      words: opts.wordTimestamps ? seg.words : []
    };
  });

  return { segments: segments };
}

module.exports = { transcribeCloud: transcribeCloud };
