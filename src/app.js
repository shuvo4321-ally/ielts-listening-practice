(function () {
'use strict';
var DATA = window.LAB;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function idk(k) { return String(k).replace(/[^a-zA-Z0-9]/g, '-'); }

/* ================================================================ storage */
var KEY = 'ielts-listening-lab-v2';
function fresh() { return { settings: { voice: '', rate: 1 }, test: { ans: {}, played: {}, replayed: {}, submitted: false }, pat: {}, tech: {} }; }
var S = (function () {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw), f = fresh();
      return { settings: Object.assign(f.settings, o.settings || {}), test: Object.assign(f.test, o.test || {}), pat: o.pat || {}, tech: o.tech || {} };
    }
  } catch (e) {}
  return fresh();
})();
var saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150); }

/* ================================================================ speech */
var TTS = {
  ok: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
  voices: [], token: 0, cur: null,
  load: function () {
    if (!this.ok) return;
    try { this.voices = speechSynthesis.getVoices().filter(function (v) { return /^en([-_]|$)/i.test(v.lang); }); } catch (e) { this.voices = []; }
  },
  ranked: function () {
    function pri(l) { return /GB|UK/i.test(l) ? 0 : /AU/i.test(l) ? 1 : /NZ|IE|ZA/i.test(l) ? 2 : /CA/i.test(l) ? 3 : /US/i.test(l) ? 4 : 5; }
    return this.voices.slice().sort(function (a, b) { return pri(a.lang) - pri(b.lang); });
  },
  cast: function (speakers) {
    var r = this.ranked(), pref = null;
    for (var i = 0; i < r.length; i++) if (r[i].voiceURI === S.settings.voice) pref = r[i];
    var list = pref ? [pref].concat(r.filter(function (v) { return v !== pref; })) : r;
    var pitches = [1, 0.84, 1.16, 0.94], out = {};
    speakers.forEach(function (s, j) { out[s] = { voice: list.length ? list[j % list.length] : null, pitch: list.length > j ? 1 : pitches[j % pitches.length] }; });
    return out;
  },
  split: function (t) {
    var m = t.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [t];
    return m.map(function (x) { return x.trim(); }).filter(Boolean);
  },
  play: function (lines, opt) {
    opt = opt || {};
    if (!this.ok) { if (opt.onEnd) opt.onEnd(false); return false; }
    this.stop();
    var my = ++this.token, self = this, order = [];
    lines.forEach(function (l) { if (l.s && order.indexOf(l.s) < 0) order.push(l.s); });
    if (order.indexOf('N') > 0) order = ['N'].concat(order.filter(function (x) { return x !== 'N'; }));
    var cast = this.cast(order), chunks = [];
    lines.forEach(function (l, i) {
      if (l.p) chunks.push({ pause: l.p, i: i });
      else self.split(l.t).forEach(function (t) { chunks.push({ t: t, s: l.s, i: i }); });
    });
    var k = 0;
    function step() {
      if (my !== self.token) return;
      if (k >= chunks.length) { self.cur = null; if (opt.onEnd) opt.onEnd(true); return; }
      var c = chunks[k++];
      if (opt.onProgress) opt.onProgress(c.i, k / chunks.length);
      if (c.pause) { setTimeout(step, c.pause); return; }
      var u = new SpeechSynthesisUtterance(c.t), v = cast[c.s], done = false;
      if (v && v.voice) { u.voice = v.voice; u.lang = v.voice.lang; } else u.lang = 'en-GB';
      u.pitch = v ? v.pitch : 1;
      u.rate = opt.rate || 1;
      function fin() { if (done) return; done = true; step(); }
      u.onend = fin; u.onerror = fin;
      self.cur = u;
      try { speechSynthesis.speak(u); } catch (e) { fin(); }
    }
    setTimeout(step, 80);
    return true;
  },
  stop: function () { this.token++; this.cur = null; if (this.ok) { try { speechSynthesis.cancel(); } catch (e) {} } }
};
if (TTS.ok) {
  TTS.load();
  var onVoices = function () { TTS.load(); renderVoicePanel(); updateVoiceChip(); };
  try { speechSynthesis.addEventListener('voiceschanged', onVoices); } catch (e) { speechSynthesis.onvoiceschanged = onVoices; }
}
function currentVoiceName() {
  var r = TTS.ranked(); if (!r.length) return '';
  for (var i = 0; i < r.length; i++) if (r[i].voiceURI === S.settings.voice) return r[i].name + ' (' + r[i].lang + ')';
  return r[0].name + ' (' + r[0].lang + ')';
}

/* ================================================================ maps */
function pin(L, x, y) { return '<g class="m-pin"><rect x="' + (x - 17) + '" y="' + (y - 13) + '" width="34" height="26" rx="5"/><text x="' + x + '" y="' + (y + 5) + '">' + L + '</text></g>'; }
function compass(x, y) { return '<g class="m-compass"><path d="M' + x + ',' + (y - 14) + ' L' + (x + 6) + ',' + (y + 4) + ' L' + x + ',' + y + ' L' + (x - 6) + ',' + (y + 4) + ' Z"/><text x="' + x + '" y="' + (y + 18) + '">N</text></g>'; }
var MAPS = {
  FARM: '<svg viewBox="0 0 600 430" class="map" role="img" aria-label="Map of Hillside City Farm with locations A to H">' +
    '<rect x="20" y="20" width="560" height="370" rx="12" class="m-ground"/>' +
    '<path d="M300 384 V220 M258 180 H62 M342 180 H536 M300 138 V64" class="m-path"/>' +
    '<circle cx="300" cy="180" r="42" class="m-yard"/><text x="300" y="185" class="m-lab">Main yard</text>' +
    '<rect x="246" y="28" width="108" height="36" rx="4" class="m-land"/><text x="300" y="51" class="m-lab">Large barn</text>' +
    '<ellipse cx="472" cy="292" rx="58" ry="30" class="m-water"/><text x="472" y="297" class="m-lab">Pond</text>' +
    '<rect x="281" y="382" width="38" height="14" rx="3" class="m-gate"/><text x="300" y="416" class="m-lab">Entrance</text>' +
    pin('A', 222, 340) + pin('B', 378, 340) + pin('C', 150, 232) + pin('D', 112, 124) +
    pin('E', 214, 46) + pin('F', 430, 124) + pin('G', 560, 180) + pin('H', 380, 240) + compass(556, 52) + '</svg>',
  PARK: '<svg viewBox="0 0 520 380" class="map" role="img" aria-label="Map of a park with locations A to E">' +
    '<rect x="20" y="20" width="480" height="320" rx="12" class="m-ground"/>' +
    '<path d="M260 334 V44" class="m-path"/>' +
    '<rect x="244" y="332" width="32" height="14" rx="3" class="m-gate"/><text x="260" y="368" class="m-lab">Main gate</text>' +
    '<rect x="118" y="262" width="92" height="40" rx="5" class="m-land"/><text x="164" y="287" class="m-lab">Café</text>' +
    pin('A', 356, 282) + pin('B', 164, 170) + pin('C', 164, 62) + pin('D', 356, 62) + pin('E', 356, 170) + compass(476, 52) + '</svg>'
};

/* ================================================================ answers + marking */
function store(ns) {
  if (ns === 'T') return S.test.ans;
  if (!S.pat[ns]) S.pat[ns] = { ans: {}, opened: {} };
  if (!S.pat[ns].opened) S.pat[ns].opened = {};
  return S.pat[ns].ans;
}
function qkey(q) { return Array.isArray(q.n) ? q.n.join('-') : String(q.n); }
function qlabel(q) { return Array.isArray(q.n) ? q.n.join('–') : String(q.n); }
function getA(ns, n) { return store(ns)[n]; }
function setA(ns, n, v) { store(ns)[n] = v; save(); refreshFold(ns, n); }

function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:!?"'()]+|[\s,;:!?"'()]+$/g, '').replace(/\.$/, '');
}
function lev(a, b) {
  var m = a.length, n = b.length, d = [], i, j;
  for (i = 0; i <= m; i++) d[i] = [i];
  for (j = 0; j <= n; j++) d[0][j] = j;
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function overLimit(v, lim) {
  if (!lim) return false;
  var toks = v.split(' ').filter(Boolean);
  var words = toks.filter(function (t) { return /[a-z]/.test(t); }).length, nums = toks.length - words;
  return lim.num ? (words > lim.w || nums > 1) : toks.length > lim.w;
}
function mark(q, val) {
  if (q.type === 'gap') {
    var v = norm(val);
    if (!v) return { st: 'blank', got: 0, max: 1 };
    var cmp = q.code ? function (s) { return s.replace(/[\s-]/g, ''); } : function (s) { return s; };
    var alts = q.ans.map(norm), i;
    for (i = 0; i < alts.length; i++) if (cmp(alts[i]) === cmp(v)) return (!q.code && overLimit(v, q.lim)) ? { st: 'extra', got: 0, max: 1 } : { st: 'ok', got: 1, max: 1 };
    if (!q.code) for (i = 0; i < alts.length; i++) if ((' ' + v + ' ').indexOf(' ' + alts[i] + ' ') >= 0) return { st: 'extra', got: 0, max: 1 };
    var vv = cmp(v), best = 99, longest = 0;
    alts.forEach(function (a) { best = Math.min(best, lev(cmp(a), vv)); longest = Math.max(longest, a.length); });
    return best <= (longest >= 7 ? 2 : 1) ? { st: 'close', got: 0, max: 1 } : { st: 'wrong', got: 0, max: 1 };
  }
  if (q.type === 'mcq' || q.type === 'select') {
    if (!val) return { st: 'blank', got: 0, max: 1 };
    return val === q.ans ? { st: 'ok', got: 1, max: 1 } : { st: 'wrong', got: 0, max: 1 };
  }
  if (q.type === 'multi') {
    var arr = Array.isArray(val) ? val : [];
    if (!arr.length) return { st: 'blank', got: 0, max: 2 };
    if (arr.length > 2) return { st: 'toomany', got: 0, max: 2 };
    var got = arr.filter(function (x) { return q.ans.indexOf(x) >= 0; }).length;
    return { st: got === 2 ? 'ok' : got === 1 ? 'part' : 'wrong', got: got, max: 2 };
  }
  return { st: 'wrong', got: 0, max: 1 };
}
var MSG = {
  ok: 'Correct.', wrong: 'Not correct.', blank: '',
  close: 'Very close. Check the spelling: in the exam this is marked wrong.',
  extra: 'The right word is there, but the extra words break the word limit or repeat a printed word. Marked wrong in the exam.',
  part: 'One of the two letters is correct: 1 mark out of 2.',
  toomany: 'More than two letters chosen. In the exam this scores zero.'
};
function rcls(st) { return st === 'ok' ? 'r-ok' : (st === 'part' || st === 'close' || st === 'extra') ? 'r-mid' : 'r-bad'; }
function rsym(st) { return st === 'ok' ? '✓' : st === 'part' ? '½' : st === 'close' ? '≈' : '✗'; }
function shown(q, val) {
  if (q.type === 'multi') return (Array.isArray(val) && val.length) ? val.slice().sort().join(', ') : '';
  return val == null ? '' : String(val);
}
function mainAnswer(q) {
  if (q.type === 'multi') return q.ans.join(' and ') + '  (either order)';
  if (q.type === 'gap') return q.ans[0];
  if (q.type === 'mcq') return q.ans + '  ·  ' + q.opts[q.ans];
  if (q._opts && q._opts[q.ans]) return q.ans + '  ·  ' + q._opts[q.ans];
  return q.ans;
}

/* ================================================================ question rendering */
var QIDX = {};
function slot(ns, n) {
  var v = getA(ns, n) || '', id = 'in-' + idk(ns + '-' + n);
  return '<span class="slot"><label class="qn" for="' + id + '">' + n + '</label><input id="' + id + '" class="gap" data-ns="' + ns +
    '" data-n="' + n + '" value="' + esc(v) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></span>';
}
function fillSlots(text, ns) { return esc(text).replace(/\[\[(\d+)\]\]/g, function (_, n) { return slot(ns, +n); }); }
function boldCaps(s) { return esc(s).replace(/([A-Z][A-Z0-9\/\-]*(?:\s+[A-Z0-9\/\-]+){1,})/g, '<b>$1</b>'); }

function foldHTML(q, ns) {
  var k = qkey(q);
  QIDX[ns + '|' + k] = q;
  return '<details class="ans" data-ns="' + ns + '" data-qk="' + k + '"><summary><span class="qn">' + (Array.isArray(q.n) ? 'Q ' : 'Q ') + qlabel(q) +
    '</span><span class="peek">Show answer</span><span class="res"></span></summary><div class="abody"></div></details>';
}
function ansBody(q, ns) {
  var val = getA(ns, qkey(q)), r = mark(q, val);
  var also = (q.type === 'gap' && q.ans.length > 1) ? '<span class="alsos">also accepted: ' + esc(q.ans.slice(1).join(' · ')) + '</span>' : '';
  var yours = r.st === 'blank' ? '<p class="yours">You have not answered this one yet.</p>' :
    '<p class="yours ' + rcls(r.st) + '">' + rsym(r.st) + ' Your answer: <span class="mono">' + esc(shown(q, val)) + '</span>' + (r.st === 'ok' ? '. Correct.' : '. ' + MSG[r.st]) + '</p>';
  return '<span class="abig">' + esc(mainAnswer(q)) + '</span>' + also + yours +
    '<span class="wt">Why</span><p>' + esc(q.why) + '</p>' +
    (ns === 'T' && q.pat ? '<button type="button" class="linkbtn" data-go="' + q.pat + '">Pattern ' + q.pat.slice(1) + ': ' + esc(patTitle(q.pat)) + ' →</button>' : '');
}
function setBadge(d, q, ns) {
  var r = mark(q, getA(ns, qkey(q))), b = $('.res', d);
  if (!b) return;
  if (r.st === 'blank') { b.textContent = ''; b.className = 'res'; return; }
  b.textContent = rsym(r.st) + ' ' + r.got + '/' + r.max; b.className = 'res ' + rcls(r.st);
}
function fillFold(d) {
  var ns = d.dataset.ns, q = QIDX[ns + '|' + d.dataset.qk]; if (!q) return;
  $('.abody', d).innerHTML = ansBody(q, ns);
  setBadge(d, q, ns);
  $('.peek', d).textContent = d.open ? 'Hide answer' : 'Show answer';
}
function refreshFold(ns, n) {
  var d = $('details.ans[data-ns="' + ns + '"][data-qk="' + n + '"]');
  if (d && (d.open || (ns === 'T' && S.test.submitted))) fillFold(d);
}
document.addEventListener('toggle', function (e) {
  var d = e.target;
  if (!d.classList || !d.classList.contains('ans')) return;
  $('.peek', d).textContent = d.open ? 'Hide answer' : 'Show answer';
  if (!d.open) return;
  fillFold(d);
  var ns = d.dataset.ns;
  if (S.pat[ns] && ns !== 'T') { S.pat[ns].opened[d.dataset.qk] = true; save(); markTocDone(ns); }
}, true);

function qMCQ(q, ns) {
  var k = qkey(q), v = getA(ns, k), name = 'r-' + idk(ns + '-' + k);
  return '<div class="qblock"><p class="stem"><span class="qn">' + k + '</span>' + esc(q.stem) + '</p><div class="opts">' +
    Object.keys(q.opts).map(function (L) {
      var id = name + '-' + L;
      return '<label class="opt" for="' + id + '"><input type="radio" id="' + id + '" name="' + name + '" value="' + L + '" data-ns="' + ns + '" data-n="' + k + '"' +
        (v === L ? ' checked' : '') + '><span class="L">' + L + '</span><span>' + esc(q.opts[L]) + '</span></label>';
    }).join('') + '</div><div class="afolds">' + foldHTML(q, ns) + '</div></div>';
}
function qMulti(q, ns) {
  var k = qkey(q), v = getA(ns, k) || [], name = 'c-' + idk(ns + '-' + k);
  return '<div class="qblock"><p class="stem"><span class="qn">' + qlabel(q) + '</span>' + esc(q.stem) + '</p><div class="opts">' +
    Object.keys(q.opts).map(function (L) {
      var id = name + '-' + L;
      return '<label class="opt" for="' + id + '"><input type="checkbox" id="' + id + '" value="' + L + '" data-ns="' + ns + '" data-n="' + k + '"' +
        (v.indexOf(L) >= 0 ? ' checked' : '') + '><span class="L">' + L + '</span><span>' + esc(q.opts[L]) + '</span></label>';
    }).join('') + '</div><p class="hint2" id="hint-' + name + '"></p><div class="afolds">' + foldHTML(q, ns) + '</div></div>';
}
function qShort(q, ns) {
  return '<div class="qblock"><p class="stem"><span class="qn">' + q.n + '</span>' + esc(q.stem) + '</p><div style="padding-left:24px">' + slot(ns, q.n) +
    '</div><div class="afolds">' + foldHTML(q, ns) + '</div></div>';
}
function qSelect(q, ns, letters) {
  var v = getA(ns, q.n) || '', id = 's-' + idk(ns + '-' + q.n);
  return '<div class="sel"><label for="' + id + '"><span class="qn">' + q.n + '</span>' + esc(q.label) + '</label><select id="' + id + '" data-ns="' + ns +
    '" data-n="' + q.n + '"><option value="">–</option>' + letters.map(function (L) { return '<option' + (v === L ? ' selected' : '') + '>' + L + '</option>'; }).join('') +
    '</select></div>';
}
function rangeOf(g) {
  if (g.range) return g.range;
  var nums = []; g.qs.forEach(function (q) { nums = nums.concat(Array.isArray(q.n) ? q.n : [q.n]); });
  return nums.length > 1 ? nums[0] + '–' + nums[nums.length - 1] : String(nums[0]);
}
function groupHTML(g, ns) {
  var h = '<div class="group"><div class="ginstr"><div class="grange">Questions ' + esc(rangeOf(g)) + '</div><p>' + esc(g.instr) + '</p>' +
    (g.limit ? '<p class="lim">' + boldCaps(g.limit) + '</p>' : '') + '</div>';
  var body = '', foldsAfter = true;
  if (g.layout === 'form') {
    body = '<div class="qsheet"><div class="st">' + esc(g.title) + '</div><dl class="form">' +
      g.rows.map(function (r) { return '<div class="frow"><dt>' + esc(r[0]) + '</dt><dd>' + fillSlots(r[1], ns) + '</dd></div>'; }).join('') + '</dl></div>';
  } else if (g.layout === 'notes') {
    body = '<div class="qsheet">' + (g.title ? '<div class="st">' + esc(g.title) + '</div>' : '') +
      g.notes.map(function (x) { return x.h ? '<h4>' + esc(x.h) + '</h4>' : '<p class="np">' + fillSlots(x.t, ns) + '</p>'; }).join('') + '</div>';
  } else if (g.layout === 'gaps') {
    body = '<div class="qsheet"><ul class="gaps">' + g.items.map(function (i) { return '<li>' + fillSlots(i, ns) + '</li>'; }).join('') + '</ul></div>';
  } else if (g.layout === 'flow') {
    body = '<ol class="flow">' + g.items.map(function (i) { return '<li>' + fillSlots(i, ns) + '</li>'; }).join('') + '</ol>';
  } else if (g.layout === 'table') {
    body = '<div class="tablewrap"><table class="qt"><tr>' + g.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
      g.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + fillSlots(c, ns) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
  } else if (g.layout === 'short') {
    body = g.qs.map(function (q) { return qShort(q, ns); }).join(''); foldsAfter = false;
  } else if (g.layout === 'mcq' || g.layout === 'multi') {
    body = g.qs.map(function (q) { return q.type === 'multi' ? qMulti(q, ns) : qMCQ(q, ns); }).join(''); foldsAfter = false;
  } else if (g.layout === 'map') {
    body = '<div class="mapwrap">' + MAPS[g.map] + '</div><div class="sels">' + g.qs.map(function (q) { return qSelect(q, ns, g.letters); }).join('') + '</div>';
  } else if (g.layout === 'match') {
    var letters = Object.keys(g.opts);
    g.qs.forEach(function (q) { q._opts = g.opts; });
    body = '<div class="optbox"><div class="obt">' + esc(g.optTitle || 'Options') + '</div>' +
      letters.map(function (L) { return '<div><b>' + L + '</b>' + esc(g.opts[L]) + '</div>'; }).join('') + '</div>' +
      '<div class="sels">' + g.qs.map(function (q) { return qSelect(q, ns, letters); }).join('') + '</div>';
  }
  if (foldsAfter) body += '<div class="afolds">' + g.qs.map(function (q) { return foldHTML(q, ns); }).join('') + '</div>';
  return h + body + '</div>';
}

/* ================================================================ transcript */
function transcriptHTML(lines, speakers, qs, para) {
  var marks = [];
  qs.forEach(function (q) {
    (q.ev || []).forEach(function (t) { marks.push({ t: t, c: 'ev', n: qlabel(q) }); });
    (q.trap || []).forEach(function (t) { marks.push({ t: t, c: 'trap', n: qlabel(q) }); });
  });
  (para || []).forEach(function (t) { marks.push({ t: t, c: 'para', n: '' }); });
  marks.sort(function (a, b) { return b.t.length - a.t.length; });
  return '<div class="tx">' + lines.filter(function (l) { return !l.p; }).map(function (l) {
    var h = esc(l.t), ranges = [];
    marks.forEach(function (m) {
      var em = esc(m.t), at = h.indexOf(em);
      if (at < 0) return;
      var end = at + em.length;
      for (var i = 0; i < ranges.length; i++) if (at < ranges[i].e && end > ranges[i].s) return;
      ranges.push({ s: at, e: end, c: m.c, n: m.n });
    });
    ranges.sort(function (a, b) { return a.s - b.s; });
    var out = '', pos = 0;
    ranges.forEach(function (r) {
      out += h.slice(pos, r.s) + '<mark class="' + r.c + '">' + h.slice(r.s, r.e) + (r.n ? '<sup>' + r.n + '</sup>' : '') + '</mark>';
      pos = r.e;
    });
    return '<p><span class="spk">' + esc(speakers[l.s] || l.s) + '</span><span>' + out + h.slice(pos) + '</span></p>';
  }).join('') + '</div>';
}
var LEGEND = '<p class="legend"><span><mark class="ev">yellow</mark> answers the question</span><span><mark class="para">green</mark> reworded link</span><span><mark class="trap">pink</mark> the trap</span><span class="faint">Small numbers show the question.</span></p>';
function txFold(id, lines, speakers, qs, para, label) {
  return '<details class="fold" id="' + id + '"><summary>' + esc(label || 'Transcript') + ' <span class="hint">open after you listen</span></summary><div class="foldbody">' +
    LEGEND + transcriptHTML(lines, speakers, qs, para) + '</div></details>';
}
function getFold(notes, label) {
  return '<details class="fold get"><summary>' + esc(label) + '</summary><div class="foldbody"><ol class="notice">' +
    notes.map(function (x) { return '<li><b>' + esc(x.b) + '</b> ' + esc(x.t) + '</li>'; }).join('') + '</ol></div></details>';
}

/* ================================================================ player */
var activeReset = null;
function playerHTML(id, label) {
  return '<div class="player" id="pl-' + id + '" data-state="idle"><button class="pbtn" type="button" id="pl-' + id + '-btn"><span class="pico" aria-hidden="true"></span><span class="ptxt">' +
    esc(label) + '</span></button><div class="pbody"><div class="tape" aria-hidden="true"><div class="tfill" id="pl-' + id + '-fill"></div></div><div class="pmeta" id="pl-' + id + '-meta"></div></div></div>';
}
function bindPlayer(id, lines, o) {
  var root = $('#pl-' + id); if (!root) return;
  var btn = $('#pl-' + id + '-btn'), fill = $('#pl-' + id + '-fill'), meta = $('#pl-' + id + '-meta'), txt = $('.ptxt', btn);
  var exam = o.mode === 'exam';
  function idle() {
    root.dataset.state = 'idle'; btn.disabled = false; txt.textContent = o.label;
    meta.innerHTML = exam ? 'Exam mode: this recording plays <b>once</b>. Read the questions first.' :
      'Replay as often as you like. Speed ' + String(S.settings.rate || 1) + '× (change it under Voice).';
  }
  function played() {
    root.dataset.state = 'played'; btn.disabled = true; txt.textContent = 'Played'; fill.style.width = '100%';
    meta.innerHTML = 'Played once. <button type="button" class="linkbtn" id="pl-' + id + '-again">Audio failed? Play again</button> <span class="faint">(noted in your results)</span>';
    $('#pl-' + id + '-again').addEventListener('click', function () { if (o.onReplay) o.onReplay(); start(); });
  }
  function reset() { if (root.dataset.state === 'playing') { if (exam) played(); else { idle(); fill.style.width = '0%'; } } }
  function start() {
    if (!TTS.ok) { meta.textContent = 'This browser cannot read text aloud. Open the transcript to study the script instead.'; return; }
    if (activeReset && activeReset !== reset) activeReset();
    activeReset = reset;
    root.dataset.state = 'playing'; txt.textContent = exam ? 'Playing…' : 'Stop'; btn.disabled = exam; fill.style.width = '0%';
    meta.textContent = exam ? 'Playing once. Answer as you listen.' : 'Playing · ' + (currentVoiceName() || 'browser voice');
    TTS.play(lines, {
      rate: exam ? 1 : (S.settings.rate || 1),
      onProgress: function (i, frac) { fill.style.width = Math.round(frac * 100) + '%'; },
      onEnd: function (ok) {
        if (activeReset === reset) activeReset = null;
        if (exam) { if (o.onPlayed) o.onPlayed(); played(); } else { idle(); fill.style.width = ok ? '100%' : '0%'; }
      }
    });
  }
  btn.addEventListener('click', function () {
    if (root.dataset.state === 'playing') { if (!exam) { TTS.stop(); activeReset = null; idle(); } return; }
    start();
  });
  if (exam && o.playedAlready) played(); else idle();
  if (!TTS.ok) meta.textContent = 'This browser cannot read text aloud. Open the transcript to study the script instead.';
}

/* ================================================================ input wiring */
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.classList && t.classList.contains('gap')) setA(t.dataset.ns, t.dataset.n, t.value);
});
document.addEventListener('change', function (e) {
  var t = e.target, ns = t.dataset && t.dataset.ns;
  if (!ns) return;
  if (t.type === 'radio' || t.tagName === 'SELECT') setA(ns, t.dataset.n, t.value);
  else if (t.type === 'checkbox') {
    var boxes = $$('input[type=checkbox][data-ns="' + ns + '"][data-n="' + t.dataset.n + '"]');
    var vals = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    var hint = $('#hint-' + idk('c-' + ns + '-' + t.dataset.n));
    if (vals.length > 2) {
      t.checked = false; vals = vals.filter(function (v) { return v !== t.value; });
      if (hint) hint.textContent = 'Choose TWO only. Untick one first: three letters score zero in the exam.';
    } else if (hint) hint.textContent = '';
    setA(ns, t.dataset.n, vals);
  }
});
document.addEventListener('click', function (e) {
  var g = e.target.closest && e.target.closest('[data-go]');
  if (g) { e.preventDefault(); go(g.dataset.go, g.dataset.to); }
});

/* ================================================================ router */
var VIEW = $('#view');
function patTitle(id) { for (var i = 0; i < DATA.PATTERNS.length; i++) if (DATA.PATTERNS[i].id === id) return DATA.PATTERNS[i].title; return ''; }
function go(name, to) {
  TTS.stop(); activeReset = null;
  var view = name || 'start', target = to;
  if (/^p\d+$/.test(view)) { target = 'pat-' + view; view = 'patterns'; }
  try { history.replaceState(null, '', '#' + (target && /^pat-/.test(target) ? target.slice(4) : view)); } catch (e) {}
  $$('.tabs a').forEach(function (a) { var on = a.dataset.go === view; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  QIDX = {};
  if (view === 'technique') viewTechnique();
  else if (view === 'test') viewTest();
  else if (view === 'patterns') viewPatterns();
  else if (view === 'toolkit') VIEW.innerHTML = $('#tpl-toolkit').innerHTML;
  else { view = 'start'; viewStart(); }
  var el = target && document.getElementById(target);
  if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 30);
  else window.scrollTo(0, 0);
}

/* ================================================================ progress helpers */
function patCount(p) { var n = 0; p.groups.forEach(function (g) { g.qs.forEach(function () { n++; }); }); return n; }
function patDone(p) {
  var st = S.pat[p.id]; if (!st || !st.opened) return false;
  return Object.keys(st.opened).length >= patCount(p) || st.all === true;
}
function markTocDone(id) {
  var p = null; DATA.PATTERNS.forEach(function (x) { if (x.id === id) p = x; });
  if (!p || !patDone(p)) return;
  var b = $('.minitoc button[data-to="pat-' + id + '"]'); if (b) b.classList.add('done');
}
function testScore() {
  var got = 0, per = {};
  DATA.TEST.parts.forEach(function (p) {
    per[p.n] = { g: 0, m: 0 };
    p.groups.forEach(function (g) { g.qs.forEach(function (q) { var r = mark(q, getA('T', qkey(q))); got += r.got; per[p.n].g += r.got; per[p.n].m += r.max; }); });
  });
  return { got: got, per: per };
}
function band(n) {
  var t = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4]];
  for (var i = 0; i < t.length; i++) if (n >= t[i][0]) return t[i][1].toFixed(1);
  return 'below 4';
}
var PART_NAMES = { 1: 'Part 1 · Everyday conversation', 2: 'Part 2 · Everyday monologue', 3: 'Part 3 · Academic discussion', 4: 'Part 4 · Lecture', 0: 'All parts' };

/* ================================================================ contents (cover) */
function viewStart() {
  var tocPat = [1, 2, 3, 4, 0].map(function (part) {
    return '<div class="grp">' + PART_NAMES[part] + '</div>' + DATA.PATTERNS.filter(function (p) { return p.part === part; }).map(function (p) {
      return '<button type="button" data-go="patterns" data-to="pat-' + p.id + '"><span class="n">PATTERN ' + p.id.slice(1) + '</span><span class="t">' + esc(p.title) +
        ' <span class="cc">· ' + esc(p.tag) + '</span></span><span class="st">' + (patDone(p) ? '✓ done' : '') + '</span></button>';
    }).join('');
  }).join('');
  var ts = S.test.submitted ? testScore() : null;
  VIEW.innerHTML = '<div class="sheetpage"><div class="cover"><div class="bar"></div><div class="tag">ACADEMIC &amp; GENERAL TRAINING · FROM BASICS TO BAND 9</div>' +
    '<h1>IELTS Listening<br>Pattern Walkthrough</h1><div class="sub">A complete test, 24 patterns, and every answer explained, with the recordings read aloud.</div>' +
    '<ul><li>This is a walkthrough, not just a mock test. Every answer sits <b>directly under its question</b>, folded until you tap it.</li>' +
    '<li>Each pattern gives you the technique, the recording, the transcript with the important parts highlighted, what you should take from it, then the questions with the answer and reason underneath.</li>' +
    '<li><b>Part 1</b> is the listening technique. <b>Part 2</b> is a complete test that plays once, like the exam. <b>Part 3</b> is the 24 patterns. <b>Part 4</b> is the toolkit.</li>' +
    '<li>All recordings are original and are read aloud by your browser\'s own voices. Your answers are saved in this browser only.</li></ul></div>' +
    '<div class="audiocheck"><div class="ac-t"><b>Check your audio first.</b> <span class="ac-v" id="st-voice-name">Loading voices…</span></div>' +
    '<button type="button" class="ghost sm" id="st-voice-test">Play a test sentence</button></div>' +
    '<div class="toc"><h2>Contents</h2>' +
    '<div class="grp">Part 1 · Listening technique</div>' +
    '<button type="button" data-go="technique"><span class="n">1.1–1.10</span><span class="t">How the test works, reading time, the five steps, prediction, signposts, letters and numbers, rewording, distractors, word limits</span><span class="st"></span></button>' +
    '<div class="grp">Part 2 · A complete listening test</div>' +
    [1, 2, 3, 4].map(function (n) {
      var p = DATA.TEST.parts[n - 1];
      return '<button type="button" data-go="test" data-to="exam-' + n + '"><span class="n">PART ' + n + '</span><span class="t">' + esc(p.context) + ' <span class="cc">· ' + esc(p.kind) + '</span></span><span class="st">' +
        (S.test.played[n] ? '✓ played' : '') + '</span></button>';
    }).join('') +
    (ts ? '<p class="small" style="margin:6px 0 0">Your score: <b>' + ts.got + ' / 40</b> · band ' + band(ts.got) + '</p>' : '') +
    '<div class="grp">Part 3 · The 24 patterns</div>' + tocPat +
    '<div class="grp">Part 4 · Toolkit</div>' +
    '<button type="button" data-go="toolkit"><span class="n">4</span><span class="t">Letters, numbers, misspelled words, signposts, score to band</span><span class="st"></span></button>' +
    '</div></div>';
  $('#st-voice-test').addEventListener('click', testVoice);
  updateVoiceChip();
}

/* ================================================================ Part 1: technique */
function viewTechnique() {
  VIEW.innerHTML = $('#tpl-technique').innerHTML;
  var T = DATA.TECH;
  ['predict', 'sign', 'dict', 'lim'].forEach(function (k) { if (!S.tech[k]) S.tech[k] = {}; });
  function choiceDrill(mount, key, d) {
    $(mount).innerHTML = '<div class="drill">' + d.items.map(function (it, i) {
      var v = S.tech[key][i] || '', id = key + '-' + i;
      return '<div class="drow"><label for="' + id + '" class="dq">' + esc(it.t) + '</label><select id="' + id + '" data-dk="' + key + '" data-i="' + i + '">' +
        '<option value="">Choose…</option>' + d.options.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
        '</select><div class="dfb" id="' + id + '-fb"></div></div>';
    }).join('') + '</div>';
    function judge(i) {
      var v = S.tech[key][i], it = d.items[i], fb = $('#' + key + '-' + i + '-fb');
      if (!v) { fb.innerHTML = ''; fb.className = 'dfb'; return; }
      var ok = v === it.ans;
      fb.className = 'dfb ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = (ok ? '✓ ' : '✗ Answer: <b>' + esc(it.ans) + '</b>. ') + esc(it.why || '');
    }
    d.items.forEach(function (_, i) { judge(i); });
    $(mount).addEventListener('change', function (e) { var s = e.target; if (s.dataset.dk !== key) return; S.tech[key][s.dataset.i] = s.value; save(); judge(+s.dataset.i); });
  }
  choiceDrill('#m-predict', 'predict', T.predict);
  choiceDrill('#m-sign', 'sign', T.signposts);

  $('#m-dict').innerHTML = '<div class="drill">' + T.dictation.map(function (it, i) {
    return '<div class="drow dict"><button type="button" class="mini" data-say="' + i + '" aria-label="Play item ' + (i + 1) + '"><span class="pico" aria-hidden="true"></span></button>' +
      '<label for="dict-' + i + '" class="dq">' + (i + 1) + '. ' + esc(it.label) + '</label><input id="dict-' + i + '" class="gapish mono" value="' + esc(S.tech.dict[i] || '') +
      '" autocomplete="off" spellcheck="false" data-di="' + i + '"><button type="button" class="ghost sm" data-dcheck="' + i + '">Check</button><div class="dfb" id="dict-' + i + '-fb"></div></div>';
  }).join('') + '</div>';
  $('#m-dict').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.say != null) TTS.play([{ s: 'N', t: T.dictation[+b.dataset.say].say }], { rate: Math.min(S.settings.rate || 1, 1) });
    if (b.dataset.dcheck != null) {
      var i = +b.dataset.dcheck, it = T.dictation[i], r = mark({ type: 'gap', ans: it.ans, code: it.code }, S.tech.dict[i]), fb = $('#dict-' + i + '-fb');
      fb.className = 'dfb ' + (r.st === 'ok' ? 'ok' : r.st === 'close' ? 'warn' : 'bad');
      fb.innerHTML = (r.st === 'ok' ? '✓ ' : r.st === 'close' ? '≈ Close. Answer: <b>' + esc(it.ans[0]) + '</b>. ' : '✗ Answer: <b>' + esc(it.ans[0]) + '</b>. ') + esc(it.why);
    }
  });
  $('#m-dict').addEventListener('input', function (e) { var t = e.target; if (t.dataset.di != null) { S.tech.dict[t.dataset.di] = t.value; save(); } });

  var dd = T.distractor;
  $('#m-distr').innerHTML = '<div class="box rec"><span class="lab">The recording</span>' + playerHTML('distr', 'Play') +
    txFold('tx-distr', dd.lines, dd.speakers, [dd.q], [], 'Transcript') + '</div>' +
    '<div class="qsheet"><ul class="gaps"><li>The bus leaves at: ' + slot('tech-distr', 1) + '</li></ul></div><div class="afolds">' + foldHTML(dd.q, 'tech-distr') + '</div>';
  bindPlayer('distr', dd.lines, { mode: 'practice', label: 'Play' });

  var L = T.limits;
  $('#m-lim').innerHTML = '<p class="small">Instruction: <b>' + esc(L.rule) + '</b></p><div class="drill">' + L.items.map(function (it, i) {
    var v = S.tech.lim[i];
    return '<div class="drow"><span class="dq mono">' + esc(it.a) + '</span><div class="seg" role="group" aria-label="Is this answer acceptable?">' +
      '<button type="button" class="segb' + (v === 'y' ? ' on' : '') + '" data-li="' + i + '" data-v="y">Acceptable</button>' +
      '<button type="button" class="segb' + (v === 'n' ? ' on' : '') + '" data-li="' + i + '" data-v="n">Not acceptable</button></div><div class="dfb" id="lim-' + i + '-fb"></div></div>';
  }).join('') + '</div>';
  function judgeLim(i) {
    var v = S.tech.lim[i], it = L.items[i], fb = $('#lim-' + i + '-fb'); if (!v) return;
    var ok = (v === 'y') === it.ok; fb.className = 'dfb ' + (ok ? 'ok' : 'bad'); fb.innerHTML = (ok ? '✓ ' : '✗ ') + esc(it.why);
  }
  L.items.forEach(function (_, i) { judgeLim(i); });
  $('#m-lim').addEventListener('click', function (e) {
    var b = e.target.closest('[data-li]'); if (!b) return;
    var i = +b.dataset.li; S.tech.lim[i] = b.dataset.v; save();
    $$('[data-li="' + i + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
    judgeLim(i);
  });
}

/* ================================================================ Part 2: full test */
function viewTest() {
  var parts = DATA.TEST.parts, t = S.test, html = '<div class="sheetpage">';
  html += '<div class="partdiv"><div class="kick">Part 2</div><h1>A Complete Listening Test</h1><p>The whole Listening paper as it runs in the exam: four recordings, forty questions, each recording played once. ' +
    'The answer to every question is folded directly underneath it, and each part ends with its transcript and what it shows you.</p></div>';
  html += '<div class="box tech"><span class="lab">Two ways to use it</span><p><b>As a test:</b> play each part once, answer as you listen, leave the folds closed, and press <b>Mark the test</b> at the end for your score and band.</p>' +
    '<p><b>As a walkthrough:</b> after each part, open the answers, the transcript and the notes before moving on.</p></div>';
  html += '<div class="tablewrap"><table class="t"><tr><th>Part</th><th>Questions</th><th>What you hear</th><th>Question types</th></tr>' +
    '<tr><td class="k">1</td><td>1–10</td><td>Phone call to a leisure centre</td><td>Form completion</td></tr>' +
    '<tr><td class="k">2</td><td>11–20</td><td>Welcome talk at a city farm</td><td>Map labelling, multiple choice, choose TWO</td></tr>' +
    '<tr><td class="k">3</td><td>21–30</td><td>Two students discuss a project</td><td>Multiple choice, matching, choose TWO</td></tr>' +
    '<tr><td class="k">4</td><td>31–40</td><td>Lecture on bioluminescence</td><td>Note completion</td></tr></table></div>';
  if (t.submitted) {
    var sc = testScore(), miss = {};
    parts.forEach(function (p) { p.groups.forEach(function (g) { g.qs.forEach(function (q) { var r = mark(q, getA('T', qkey(q))); if (r.got < r.max && q.pat) miss[q.pat] = (miss[q.pat] || 0) + (r.max - r.got); }); }); });
    var top = Object.keys(miss).sort(function (a, b) { return miss[b] - miss[a]; }).slice(0, 3);
    var rep = Object.keys(t.replayed || {}).filter(function (k) { return t.replayed[k]; });
    html += '<div class="result" id="result"><div class="rscore"><div class="big">' + sc.got + '<span>/40</span></div><div>Band <b>' + band(sc.got) + '</b> <span class="faint small">indicative</span></div></div>' +
      [1, 2, 3, 4].map(function (n) { var x = sc.per[n]; return '<div class="rp"><span>Part ' + n + '</span><div class="rbar"><i style="width:' + Math.round(x.g / x.m * 100) + '%"></i></div><span class="mono">' + x.g + '/' + x.m + '</span></div>'; }).join('') +
      (top.length ? '<div><p style="margin:0 0 8px"><b>Drill these first.</b> Your lost marks cluster here:</p>' + top.map(function (id) {
        return '<button type="button" class="chipbtn" data-go="' + id + '">Pattern ' + id.slice(1) + ' · ' + esc(patTitle(id)) + ' <span class="mono">−' + miss[id] + '</span></button>';
      }).join('') + '</div>' : '<p style="margin:0"><b>Full marks.</b></p>') +
      (rep.length ? '<p class="small faint" style="margin:0">Replayed: Part ' + rep.join(', ') + '. In the real exam each part plays only once.</p>' : '') +
      '<div class="actions" style="margin:0"><button type="button" class="ghost sm" id="retake">Take the test again</button><span id="retake-confirm"></span></div></div>';
  }
  html += '<div class="jump">' + [1, 2, 3, 4].map(function (n) { return '<button type="button" data-jump="exam-' + n + '">Part ' + n + (t.played[n] ? ' ✓' : '') + '</button>'; }).join('') + '</div>';
  parts.forEach(function (p) {
    var allq = []; p.groups.forEach(function (g) { allq = allq.concat(g.qs); });
    var first = allq[0], lastq = allq[allq.length - 1];
    var fromN = Array.isArray(first.n) ? first.n[0] : first.n, toN = Array.isArray(lastq.n) ? lastq.n[lastq.n.length - 1] : lastq.n;
    html += '<section class="exam" id="exam-' + p.n + '"><p class="eh">LISTENING PART ' + p.n + '</p><p class="es">Questions ' + fromN + '–' + toN + ' · ' + esc(p.context) + '</p>' +
      playerHTML('part' + p.n, 'Play Part ' + p.n + ' (once)') + p.groups.map(function (g) { return groupHTML(g, 'T'); }).join('') + '</section>' +
      '<h3>Part ' + p.n + ': the recording, and what it shows you</h3>' +
      txFold('tx-part' + p.n, p.lines, p.speakers, allq, p.para, 'Transcript of Part ' + p.n) +
      getFold(p.get || [], 'What Part ' + p.n + ' shows you');
  });
  html += t.submitted ? '' : '<div class="actions"><button type="button" class="primary" id="markit">Mark the test</button></div><div id="markconfirm"></div>';
  html += '</div>';
  VIEW.innerHTML = html;
  parts.forEach(function (p) {
    bindPlayer('part' + p.n, p.lines, {
      mode: 'exam', label: 'Play Part ' + p.n + ' (once)', playedAlready: !!t.played[p.n],
      onPlayed: function () { S.test.played[p.n] = true; save(); var j = $('[data-jump="exam-' + p.n + '"]'); if (j) j.textContent = 'Part ' + p.n + ' ✓'; },
      onReplay: function () { S.test.replayed[p.n] = true; save(); }
    });
  });
  $$('[data-jump]').forEach(function (b) { b.addEventListener('click', function () { var el = document.getElementById(b.dataset.jump); if (el) el.scrollIntoView({ block: 'start' }); }); });
  if (t.submitted) {
    $$('#view details.ans').forEach(function (d) { var q = QIDX[d.dataset.ns + '|' + d.dataset.qk]; if (q) setBadge(d, q, 'T'); });
    $$('#view .exam input, #view .exam select').forEach(function (el) { el.disabled = true; });
    var rt = $('#retake');
    if (rt) rt.addEventListener('click', function () {
      $('#retake-confirm').innerHTML = ' Clear all 40 answers? <button type="button" class="danger sm" id="retake-yes">Clear and restart</button> <button type="button" class="ghost sm" id="retake-no">Keep them</button>';
      $('#retake-yes').addEventListener('click', function () { S.test = fresh().test; save(); go('test'); });
      $('#retake-no').addEventListener('click', function () { $('#retake-confirm').innerHTML = ''; });
    });
  }
  var mk = $('#markit');
  if (mk) mk.addEventListener('click', function () {
    var blank = 0;
    parts.forEach(function (p) { p.groups.forEach(function (g) { g.qs.forEach(function (q) { var r = mark(q, getA('T', qkey(q))); if (r.st === 'blank') blank += r.max; }); }); });
    $('#markconfirm').innerHTML = '<div class="confirm">' + (blank ? '<b>' + blank + ' answer' + (blank > 1 ? 's are' : ' is') + ' blank.</b> In the exam you would guess: a blank always scores zero. ' : 'All 40 answered. ') +
      '<button type="button" class="primary sm" id="mark-yes">Mark the test</button> <button type="button" class="ghost sm" id="mark-no">Keep going</button></div>';
    $('#mark-yes').addEventListener('click', function () { TTS.stop(); S.test.submitted = true; save(); go('test', 'result'); });
    $('#mark-no').addEventListener('click', function () { $('#markconfirm').innerHTML = ''; });
  });
}

/* ================================================================ Part 3: patterns */
function patternHTML(p) {
  var allq = []; p.groups.forEach(function (g) { allq = allq.concat(g.qs); });
  return '<section class="pat" id="pat-' + p.id + '"><div><span class="pnum">PATTERN ' + p.id.slice(1) + '</span><span class="ptype">' + esc(PART_NAMES[p.part].split(' · ')[0]) + ' · ' + esc(p.tag) + '</span></div>' +
    '<div class="ptitle">' + esc(p.title) + '</div>' +
    '<div class="box tech"><span class="lab">Technique</span><p>' + p.tech + '</p></div>' +
    '<div class="box rec"><span class="lab">The recording</span>' + playerHTML('pat-' + p.id, 'Play') +
    txFold('tx-' + p.id, p.lines, p.speakers, allq, p.para, 'Transcript, with the important parts highlighted') + '</div>' +
    getFold(p.get, 'What you should get from this recording') +
    p.groups.map(function (g) { return groupHTML(g, p.id); }).join('') +
    '<div class="actions"><button type="button" class="ghost sm" data-showall="' + p.id + '">Show all answers</button><button type="button" class="ghost sm" data-clear="' + p.id + '">Clear my answers</button></div>' +
    '<div class="box same"><span class="lab">Same pattern next time</span><p>' + esc(p.same) + '</p></div></section>';
}
function viewPatterns() {
  var mini = [1, 2, 3, 4, 0].map(function (part) {
    return '<span class="lbl2">' + PART_NAMES[part] + '</span>' + DATA.PATTERNS.filter(function (p) { return p.part === part; }).map(function (p) {
      return '<button type="button" data-go="patterns" data-to="pat-' + p.id + '" title="' + esc(p.title) + '"' + (patDone(p) ? ' class="done"' : '') + '>' + p.id.slice(1) + '</button>';
    }).join('');
  }).join('');
  VIEW.innerHTML = '<div class="sheetpage"><div class="partdiv"><div class="kick">Part 3</div><h1>The 24 Patterns</h1>' +
    '<p>Every pattern: the technique, the recording, the transcript with the important lines marked, what you should be taking from it, then the questions with the answers folded directly underneath.</p></div>' +
    '<div class="minitoc">' + mini + '</div>' +
    DATA.PATTERNS.map(patternHTML).join('') + '</div>';
  DATA.PATTERNS.forEach(function (p) { bindPlayer('pat-' + p.id, p.lines, { mode: 'practice', label: 'Play' }); });
  $$('[data-showall]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.showall, sec = $('#pat-' + id);
      store(id); S.pat[id].all = true; save();
      $$('details', sec).forEach(function (d) { d.open = true; });
      markTocDone(id);
    });
  });
  $$('[data-clear]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.clear; S.pat[id] = { ans: {}, opened: {} }; save();
      go('patterns', 'pat-' + id);
    });
  });
}

/* ================================================================ voice panel */
function renderVoicePanel() {
  var r = TTS.ranked(), sel = $('#voicesel'), note = $('#voicenote');
  if (!TTS.ok) { note.textContent = 'This browser cannot read text aloud. Try Chrome, Edge or Safari.'; sel.disabled = true; return; }
  note.textContent = !r.length ? 'No English voices found yet. They usually appear a moment after the page loads.' :
    r.length + ' English voice' + (r.length > 1 ? 's' : '') + ' on this device. British and Australian voices are listed first. With fewer voices than speakers, the pitch changes to tell speakers apart.';
  sel.innerHTML = '<option value="">Automatic (best match)</option>' + r.map(function (v) {
    return '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === S.settings.voice ? ' selected' : '') + '>' + esc(v.name + ' · ' + v.lang) + '</option>';
  }).join('');
  $('#ratesel').value = String(S.settings.rate || 1);
}
function updateVoiceChip() { var c = $('#st-voice-name'); if (c) c.textContent = !TTS.ok ? 'Not available in this browser' : (currentVoiceName() || 'Loading voices…'); }
function testVoice() { TTS.play([{ s: 'N', t: 'This is how the recordings will sound. The number is oh seven nine four six. The name is spelled T, H, O, R, N, L, E, Y.' }], { rate: S.settings.rate || 1 }); }
$('#voicebtn').addEventListener('click', function () { var p = $('#voicepanel'), open = p.hidden; p.hidden = !open; this.setAttribute('aria-expanded', String(open)); if (open) renderVoicePanel(); });
$('#voicesel').addEventListener('change', function () { S.settings.voice = this.value; save(); updateVoiceChip(); });
$('#ratesel').addEventListener('change', function () { S.settings.rate = parseFloat(this.value) || 1; save(); });
$('#voicetest').addEventListener('click', testVoice);
$('#voiceclose').addEventListener('click', function () { $('#voicepanel').hidden = true; $('#voicebtn').setAttribute('aria-expanded', 'false'); });

/* ================================================================ boot */
var h0 = (location.hash || '').replace('#', '');
if (/^p\d+$/.test(h0)) go(h0);
else go(/^(start|technique|test|patterns|toolkit)$/.test(h0) ? h0 : 'start');
})();
