/* Snapshot excerpt from express@4.21.2, MIT licensed. See README.md. */
"use strict";

exports.isAbsolute = function (path) {
  if ("/" === path[0]) return true;
  if (":" === path[1] && ("\\" === path[2] || "/" === path[2])) return true;
  if ("\\\\" === path.substring(0, 2)) return true;
  return false;
};

exports.normalizeTypes = function (types, normalizeType) {
  var ret = [];
  for (var i = 0; i < types.length; ++i) {
    ret.push(normalizeType(types[i]));
  }
  return ret;
};

function acceptParams(str) {
  var parts = str.split(/ *; */);
  var ret = { value: parts[0], quality: 1, params: {} };
  for (var i = 1; i < parts.length; ++i) {
    var pms = parts[i].split(/ *= */);
    if ("q" === pms[0]) ret.quality = parseFloat(pms[1]);
    else ret.params[pms[0]] = pms[1];
  }
  return ret;
}
