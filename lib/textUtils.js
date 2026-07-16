"use strict";

// Common Bangla filler / hesitation words removed by "Auto Cleanup".
var FILLERS = ["আ", "আঁ", "উম", "উমম", "মানে", "তো", "এই", "ইয়ে", "হ্যাঁ মানে"];

function cleanFillers(text) {
  var pattern = new RegExp("(^|\\s)(" + FILLERS.join("|") + ")(?=\\s|$)", "g");
  return text.replace(pattern, " ").replace(/\s{2,}/g, " ").trim();
}

// Breaks a long line into shorter, readable chunks (~24 chars/line by default).
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

module.exports = { cleanFillers: cleanFillers, autoLineBreak: autoLineBreak };
