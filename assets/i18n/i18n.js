/* brp homepage — language layer (EN source, KO / TR / DE translations)
 *
 * The page itself is written in English. This script watches the rendered page and swaps
 * English text for the selected language, using the dictionaries in assets/i18n/<code>.js.
 * It hooks into the site's own language menu (EN · KO · TR · DE): whatever code the menu
 * shows is applied. The choice is remembered (localStorage) and can be forced with ?lang=tr.
 *
 * To add or fix a translation, edit assets/i18n/ko.js, tr.js or de.js:
 * the key is the exact English text on the page, the value is the translation.
 */
(function () {
  'use strict';
  var CODES = ['EN', 'KO', 'TR', 'DE'];
  var HTML_LANG = { EN: 'en', KO: 'ko', TR: 'tr', DE: 'de' };
  var STORE = 'brp-lang';
  var ATTRS = ['aria-label', 'alt', 'title', 'placeholder'];
  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^\/]*$/, '') : 'assets/i18n/';
  })();

  window.BRP_I18N = window.BRP_I18N || {};
  var lang = 'EN';          // language currently applied
  var dict = null;          // dictionary for `lang`
  var orig = new WeakMap(); // text node -> English source
  var shown = new WeakMap(); // text node -> value we last wrote
  var busy = false;

  // ---------- dictionary loading (plain <script>, so it also works from file://)
  function load(code, cb) {
    var k = code.toLowerCase();
    if (code === 'EN') return cb({});
    if (window.BRP_I18N[k]) return cb(window.BRP_I18N[k]);
    var s = document.createElement('script');
    s.src = base + k + '.js';
    s.onload = function () { cb(window.BRP_I18N[k] || {}); };
    s.onerror = function () { cb({}); };
    document.head.appendChild(s);
  }

  // ---------- string translation
  var COUNT = {
    KO: function (n) { return '제품 ' + n + '개'; },
    TR: function (n) { return n + ' ürün'; },
    DE: function (n) { return n + (n === 1 ? ' Produkt' : ' Produkte'); }
  };
  var BACK = {
    KO: function (x) { return '← ' + x; },
    TR: function (x) { return '← ' + x; },
    DE: function (x) { return 'Zurück zu ' + x; }
  };
  function tr(s) {
    if (!dict) return null;
    if (Object.prototype.hasOwnProperty.call(dict, s)) return dict[s];
    var m;
    if ((m = /^(\d+) products?$/.exec(s)) && COUNT[lang]) return COUNT[lang](+m[1]);
    if ((m = /^Back to (.+)$/.exec(s)) && BACK[lang]) return BACK[lang](dict[m[1]] || m[1]);
    if ((m = /^Cutting wheel (\S+) · θ (\d+)°$/.exec(s)) && dict['Cutting wheel {t} · θ {a}°'])
      return dict['Cutting wheel {t} · θ {a}°'].replace('{t}', m[1]).replace('{a}', m[2]);
    if ((m = /^· (.+)$/.exec(s))) { var r = tr(m[1]); return r == null ? null : '· ' + r; }
    if ((m = /^([A-Z][A-Za-z ]{1,24}): (.+)$/.exec(s)) && dict[m[1]] != null)
      return dict[m[1]] + ': ' + (dict[m[2]] != null ? dict[m[2]] : m[2]);
    return null;
  }

  function skip(node) {
    for (var e = node.parentNode; e && e.nodeType === 1; e = e.parentNode) {
      var t = e.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return true;
      if (e.hasAttribute && e.hasAttribute('data-no-i18n')) return true;
    }
    return false;
  }

  function doText(node) {
    var v = node.nodeValue;
    if (!v || !/[A-Za-z]/.test(v) && !orig.has(node)) return;
    if (shown.get(node) !== v) { orig.set(node, v); } // fresh text from the page
    var src = orig.get(node);
    var out = src;
    if (lang !== 'EN') {
      var core = src.trim();
      if (core) {
        var t = tr(core);
        if (t != null) out = src.replace(core, t);
      }
    }
    if (out !== v) node.nodeValue = out;
    shown.set(node, out);
    // names and e-mail stay in English casing (Turkish uppercase would turn i into İ)
    var pe = node.parentNode;
    if (pe && pe.nodeType === 1 && out === src && /@|\bbrp\b/i.test(src)) pe.setAttribute('lang', 'en');
  }

  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var key = 'data-i18n-' + a, cur = el.getAttribute(a);
      var last = el.getAttribute(key + '-shown');
      if (last !== cur) el.setAttribute(key, cur);
      var src = el.getAttribute(key);
      var out = src;
      if (lang !== 'EN') { var t = tr(src.trim()); if (t != null) out = t; }
      if (out !== cur) el.setAttribute(a, out);
      el.setAttribute(key + '-shown', out);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skip(root)) doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
      doAttrs(root);
      if (root.tagName === 'IFRAME') hookFrame(root);
    }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (!skip(n)) doText(n); }
      else if (n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') {
        doAttrs(n);
        if (n.tagName === 'IFRAME') hookFrame(n);
      }
    }
  }

  // 3D viewers are same-origin pages: translate their small UI (reset button, labels)
  function hookFrame(f) {
    if (f.__brpI18n) { applyFrame(f); return; }
    f.__brpI18n = true;
    f.addEventListener('load', function () { applyFrame(f); });
    applyFrame(f);
  }
  function applyFrame(f) {
    try {
      var d = f.contentDocument;
      if (!d || !d.body) return;
      var b = d.getElementById('reset');
      if (b) {
        if (!b.__src) b.__src = b.textContent;
        var t = lang !== 'EN' ? tr(b.__src) : null;
        b.textContent = t != null ? t : b.__src;
      }
      d.documentElement.lang = HTML_LANG[lang];
    } catch (e) { /* cross-origin: leave as is */ }
  }

  function applyAll() {
    busy = true;
    try { walk(document.body); } finally { busy = false; }
    document.documentElement.lang = HTML_LANG[lang];
  }

  // ---------- the site's language menu
  function langButton() {
    var b = document.querySelector('[data-i18n-langbtn]');
    if (b) return b;
    b = document.querySelector('button[aria-label="Change language"]');
    if (b) b.setAttribute('data-i18n-langbtn', '');
    return b;
  }
  function menuCode() {
    var b = langButton();
    if (!b) return null;
    var spans = b.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var c = (spans[i].textContent || '').trim();
      if (CODES.indexOf(c) >= 0) return c;
    }
    return null;
  }
  function pickInMenu(code) {
    var b = langButton();
    if (!b) return false;
    b.click();
    var host = b.parentNode || document;
    var opts = host.querySelectorAll('button');
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] === b) continue;
      var s = opts[i].querySelector('span');
      if (s && s.textContent.trim() === code) { opts[i].click(); return true; }
    }
    return false;
  }

  var pending = null;     // language whose dictionary is loading
  function setLang(code) {
    if (CODES.indexOf(code) < 0) code = 'EN';
    try { localStorage.setItem(STORE, code); } catch (e) {}
    if (code === pending) return;
    if (code === lang && !pending) return;
    pending = code;
    load(code, function (d) {
      if (pending !== code) return; // a newer choice won
      pending = null;
      lang = code; dict = code === 'EN' ? null : d;
      applyAll();
    });
  }

  // ---------- start
  var wanted = null;
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q) wanted = q.toUpperCase();
    else wanted = localStorage.getItem(STORE);
  } catch (e) {}
  if (CODES.indexOf(wanted) < 0) wanted = null;
  var synced = false;

  var mo = new MutationObserver(function (list) {
    if (busy) return;
    var code = menuCode();
    if (code && !synced && wanted && wanted !== code) {
      synced = true;
      if (pickInMenu(wanted)) return; // the menu re-renders; we'll pick it up next round
    }
    if (code) synced = true;
    if (code && code !== (pending || lang)) { setLang(code); return; }
    if (lang === 'EN') return;
    busy = true;
    try {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'characterData') { if (!skip(r.target)) doText(r.target); }
        else if (r.type === 'attributes') { doAttrs(r.target); }
        else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      }
    } finally { busy = false; }
  });
  function start() {
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var code = menuCode();
    if (code) { synced = true; if (wanted && wanted !== code) pickInMenu(wanted); else setLang(code); }
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
