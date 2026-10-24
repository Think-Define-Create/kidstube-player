/* Remote lists loader for the LG webOS TV apps (classic script, ES5 only: old Chromium ~v94).
 * Master copy: kidstube-player/tools/remote-data.js. The app build scripts copy it into app/js/.
 *
 * On launch, in parallel, with a cache-buster (?t=now) and a short timeout:
 *   - dataUrl   (data/<app>.json, written and checked by tools/publish.sh; holds resolved videos)
 *   - configUrl (config/<app>.json, the hand-edited file, so a github.com edit on the gh-pages
 *                branch shows up on the next launch even before publish runs)
 * Content used, best first:
 *   1. config file from GitHub Pages (if it parses AND passes the app's checks), with the videos
 *      snapshot from the data file
 *   2. data file from GitHub Pages
 *   3. last good copy saved in localStorage on this TV (unless the installed IPK is newer)
 *   4. copy bundled in the IPK at build time
 * Only whitelisted keys are taken from the network (never codes, PINs, player URL or API keys). */
(function (global) {
  'use strict';

  function getJson(url, timeoutMs, cb) {
    var done = false, x;
    function finish(err, val) { if (done) return; done = true; cb(err, val); }
    var timer = setTimeout(function () { try { x.abort(); } catch (e) {} finish(new Error('timeout')); }, timeoutMs + 200);
    try {
      x = new XMLHttpRequest();
      x.open('GET', url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + new Date().getTime(), true);
      x.timeout = timeoutMs;
      x.onload = function () {
        clearTimeout(timer);
        if (x.status < 200 || x.status >= 300) return finish(new Error('HTTP ' + x.status));
        var j;
        try { j = JSON.parse(x.responseText); } catch (e) { return finish(new Error('bad JSON')); }
        finish(null, j);
      };
      x.onerror = function () { clearTimeout(timer); finish(new Error('network/CORS error')); };
      x.ontimeout = function () { clearTimeout(timer); finish(new Error('timeout')); };
      x.send();
    } catch (e) { clearTimeout(timer); finish(e); }
  }

  function pick(obj, keys) {
    var o = {};
    for (var i = 0; i < keys.length; i++) if (obj && obj[keys[i]] !== undefined) o[keys[i]] = obj[keys[i]];
    return o;
  }

  function readStore(key) {
    try { var v = localStorage.getItem(key); v = v ? JSON.parse(v) : null; return v && v.config ? v : null; } catch (e) { return null; }
  }
  function writeStore(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function time(s) { var t = s ? Date.parse(s) : NaN; return isNaN(t) ? 0 : t; }

  /** opts: { dataUrl, configUrl, storageKey, timeoutMs, keys[], validate(config) -> '' or error text,
   *          bundled: { publishedAt, config, snapshot } }
   *  cb({ config, snapshot, via: 'live'|'cache'|'bundled', configFrom, publishedAt, report[] }) */
  function load(opts, cb) {
    var report = [], res = {}, pending = 0, finished = false;
    var timeoutMs = opts.timeoutMs || 5000;
    var validate = opts.validate || function () { return ''; };
    function check(c) { try { return validate(c) || ''; } catch (e) { return e.message || 'invalid'; } }

    function done() {
      if (finished) return; finished = true;
      var data = res.data, raw = res.config, base = null, via, cfgFrom;
      if (data) {
        var why = (!data.config || typeof data.config !== 'object') ? 'no config' : check(data.config);
        if (why) { report.push('data file rejected: ' + why); data = null; }
      }
      if (raw) {
        var why2 = check(raw);
        if (why2) { report.push('config file rejected: ' + why2); raw = null; }
      }
      if (data) { base = data; via = 'live'; }
      else {
        var saved = readStore(opts.storageKey), b = opts.bundled || null;
        // Last good copy, unless the installed app was built after that copy was saved.
        if (saved && (!b || time(saved.savedAt) >= time(b.publishedAt))) { base = saved; via = 'cache'; }
        else if (b) { base = b; via = 'bundled'; }
        else if (saved) { base = saved; via = 'cache'; }
      }
      var config = base ? pick(base.config, opts.keys) : {};
      cfgFrom = via;
      if (raw) { config = pick(raw, opts.keys); cfgFrom = 'live-config'; if (!data) via = 'live'; }
      var out = { config: config, snapshot: base ? base.snapshot || null : null, publishedAt: base ? base.publishedAt || '' : '',
        via: via || 'none', configFrom: cfgFrom || 'none', report: report };
      if (via === 'live') writeStore(opts.storageKey, { savedAt: new Date().toISOString(), publishedAt: out.publishedAt, config: config, snapshot: out.snapshot });
      report.push('using ' + out.via + ' (lists from ' + out.configFrom + ', published ' + (out.publishedAt || '?') + ')');
      cb(out);
    }

    function fetchOne(name, url) {
      if (!url) return;
      pending++;
      getJson(url, timeoutMs, function (err, j) {
        if (err) report.push(name + ' file: ' + err.message); else res[name] = j;
        if (--pending === 0) done();
      });
    }
    fetchOne('data', opts.dataUrl);
    fetchOne('config', opts.configUrl);
    if (!pending) done();
  }

  global.RemoteData = { load: load, getJson: getJson, pick: pick };
})(window);
