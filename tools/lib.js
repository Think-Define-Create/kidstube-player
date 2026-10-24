/* Shared logic for the TV apps' content (Node 18+, no dependencies).
 * Used by tools/publish.js in this repo AND copied into /workspace/kidstube/tools/lib.js and
 * /workspace/learnearn/tools/lib.js by their build scripts, so the published data and the copy
 * bundled in each IPK are made the same way. */
'use strict';
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CH_RE = /^UC[A-Za-z0-9_-]{22}$/;
const PL_RE = /^[A-Za-z0-9_-]{10,}$/;
// Never allowed in the public repo / published data.
const SECRET_KEYS = ['unlockCode', 'adminPin', 'pin', 'code', 'youtubeApiKey', 'apiKey'];
// Keys the YouTube app takes from the published data (everything else stays packaged in the app).
const YT_KEYS = ['videosSectionTitle', 'maxVideosPerChannel', 'maxVideosPerRow', 'hideShorts', 'afterVideo', 'rows', 'videos', 'channels', 'playlists'];
const LEARN_KEYS = ['rewardMinutes', 'passScore', 'watchPercent', 'allowReshowCode', 'shuffleAnswers', 'lessons'];

function readJson(file) {
  const fs = require('fs');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(file + ' could not be read: ' + e.message); }
  try { return JSON.parse(text); }
  catch (e) {
    // Point at the line, which is what a hand edit usually gets wrong (missing comma / quote).
    const m = /position (\d+)/.exec(e.message);
    let where = '';
    if (m) { const pos = +m[1]; const line = text.slice(0, pos).split('\n').length; where = ` (around line ${line}: "${text.split('\n')[line - 1].trim().slice(0, 80)}")`; }
    throw new Error(file + ' is not valid JSON: ' + e.message + where + '. Common causes: a missing or extra comma, or a missing quote.');
  }
}

function findSecrets(obj) {
  const found = [];
  (function walk(o, p) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(k => {
      if (SECRET_KEYS.indexOf(k) !== -1) found.push(p + k);
      walk(o[k], p + k + '.');
    });
  })(obj, '');
  return found;
}

function pick(obj, keys) { const o = {}; keys.forEach(k => { if (obj[k] !== undefined) o[k] = obj[k]; }); return o; }

function validateYoutube(cfg) {
  const errors = [], warnings = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { errors: ['the file must be one { ... } object'], warnings };
  findSecrets(cfg).forEach(k => errors.push(`"${k}" must not be in this public file.`));
  ['videos', 'channels', 'playlists', 'rows'].forEach(k => { if (cfg[k] !== undefined && !Array.isArray(cfg[k])) errors.push(`"${k}" must be a list [ ... ].`); });
  if (errors.length) return { errors, warnings };
  const seenV = {}, seenC = {};
  (cfg.channels || []).forEach((c, i) => {
    if (!c || typeof c !== 'object') return errors.push(`channels[${i}] is not { "id": ..., "name": ..., "row": ... }.`);
    if (!CH_RE.test(c.id || '')) errors.push(`channels[${i}] ("${c.name || ''}") id "${c.id}" is not a channel ID (starts with UC, 24 characters). @handles are not accepted; see EDITING.md.`);
    else if (seenC[c.id]) warnings.push(`channel ${c.id} is listed twice.`);
    seenC[c.id] = 1;
    if (c.row !== undefined && typeof c.row !== 'string') errors.push(`channels[${i}].row must be text in quotes.`);
  });
  (cfg.videos || []).forEach((v, i) => {
    if (!v || typeof v !== 'object') return errors.push(`videos[${i}] is not { "id": ..., "title": ... }.`);
    if (!ID_RE.test(v.id || '')) errors.push(`videos[${i}] id "${v.id}" is not an 11-character video ID.`);
    else if (seenV[v.id]) warnings.push(`video ${v.id} is listed twice.`);
    seenV[v.id] = 1;
    if (v.row !== undefined && typeof v.row !== 'string') errors.push(`videos[${i}].row must be text in quotes.`);
    else if (v.row && cfg.rows && cfg.rows.indexOf(v.row) === -1) warnings.push(`video ${v.id} uses row "${v.row}", which is not in "rows"; it is added at the end.`);
  });
  (cfg.playlists || []).forEach((p, i) => { if (!p || !PL_RE.test(p.id || '')) errors.push(`playlists[${i}] id "${p && p.id}" looks wrong.`); });
  (cfg.rows || []).forEach((r, i) => { if (typeof r !== 'string') errors.push(`rows[${i}] must be text in quotes.`); });
  (cfg.channels || []).concat(cfg.playlists || []).forEach(c => { if (c && c.row && cfg.rows && cfg.rows.indexOf(c.row) === -1) warnings.push(`"${c.name}" uses row "${c.row}", which is not in "rows"; it is added at the end.`); });
  if (cfg.afterVideo !== undefined && ['grid', 'next'].indexOf(cfg.afterVideo) === -1) errors.push('afterVideo must be "grid" or "next".');
  ['maxVideosPerChannel', 'maxVideosPerRow'].forEach(k => { if (cfg[k] !== undefined && !(Number.isInteger(cfg[k]) && cfg[k] >= 1 && cfg[k] <= 200)) errors.push(`${k} must be a whole number from 1 to 200.`); });
  if (cfg.hideShorts !== undefined && typeof cfg.hideShorts !== 'boolean') errors.push('hideShorts must be true or false.');
  if (cfg.videosSectionTitle !== undefined && typeof cfg.videosSectionTitle !== 'string') errors.push('videosSectionTitle must be text in quotes.');
  if (!(cfg.videos || []).length && !(cfg.channels || []).length && !(cfg.playlists || []).length) errors.push('there are no videos, channels or playlists: the app would be empty.');
  return { errors, warnings };
}

function validateLearn(cfg) {
  const errors = [], warnings = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { errors: ['the file must be one { ... } object'], warnings };
  findSecrets(cfg).forEach(k => errors.push(`"${k}" must not be in this public file (the code and PIN stay inside the app).`));
  if (cfg.rewardMinutes !== undefined && !(Number.isInteger(cfg.rewardMinutes) && cfg.rewardMinutes >= 1 && cfg.rewardMinutes <= 600)) errors.push('rewardMinutes must be a whole number between 1 and 600.');
  if (cfg.passScore !== undefined && cfg.passScore !== 'all' && !(Number.isInteger(cfg.passScore) && cfg.passScore >= 1)) errors.push('passScore must be "all" or a whole number of questions (1 or more).');
  if (cfg.watchPercent !== undefined && !(typeof cfg.watchPercent === 'number' && cfg.watchPercent >= 10 && cfg.watchPercent <= 100)) errors.push('watchPercent must be a number from 10 to 100.');
  ['allowReshowCode', 'shuffleAnswers'].forEach(k => { if (cfg[k] !== undefined && typeof cfg[k] !== 'boolean') errors.push(k + ' must be true or false.'); });
  if (!Array.isArray(cfg.lessons) || !cfg.lessons.length) { errors.push('lessons must be a list with at least one lesson.'); return { errors, warnings }; }
  const seen = {};
  cfg.lessons.forEach((l, i) => {
    const at = `lessons[${i}]`;
    if (!l || typeof l !== 'object') { errors.push(at + ' is not an object.'); return; }
    if (!ID_RE.test(l.videoId || '')) errors.push(`${at}.videoId "${l.videoId}" is not an 11-character YouTube video ID.`);
    else if (seen[l.videoId]) errors.push(`${at}.videoId ${l.videoId} is used twice.`);
    seen[l.videoId] = true;
    if (!l.title || typeof l.title !== 'string') errors.push(at + '.title is missing.');
    const qs = l.questions;
    if (!Array.isArray(qs) || qs.length < 3 || qs.length > 5) { errors.push(`${at} ("${l.title || ''}") must have 3 to 5 questions.`); return; }
    qs.forEach((q, j) => {
      const qa = `${at}.questions[${j}]`;
      if (!q || typeof q !== 'object') { errors.push(qa + ' is not { "q": ..., "answers": [...], "correct": N }.'); return; }
      if (!q.q || typeof q.q !== 'string') errors.push(qa + '.q (the question text) is missing.');
      if (!Array.isArray(q.answers) || q.answers.length < 3 || q.answers.length > 4) errors.push(qa + '.answers must have 3 or 4 answers.');
      else {
        if (q.answers.some(a => typeof a !== 'string' || !a.trim())) errors.push(qa + '.answers has an empty answer.');
        if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.answers.length) errors.push(`${qa}.correct must be the position of the right answer counting from 0 (0..${q.answers.length - 1}).`);
      }
    });
    if (cfg.passScore !== undefined && cfg.passScore !== 'all' && cfg.passScore > qs.length) warnings.push(`${at} has only ${qs.length} questions but passScore is ${cfg.passScore}; the app will require all ${qs.length}.`);
    if (l.questionsConfirmed === false) warnings.push(`${at} "${l.title}": questions are marked as NOT confirmed against the video.`);
    const shown = [l.title, l.channel].concat(qs.map(q => q ? [q.q].concat(q.answers || []).join(' ') : '')).join(' ');
    const m = shown.match(/\b(kids?|parents?|parental)\b/i);
    if (m) warnings.push(`${at} shows the word "${m[0]}" on screen.`);
  });
  return { errors, warnings };
}

/* ---- YouTube resolution (same rules the app uses: RSS feed, no Shorts, valid IDs, embeddable) ---- */
function decode(s) { return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function parseRss(xml, hideShorts) {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (e.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const href = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    if (!id || !ID_RE.test(id)) continue;
    if (hideShorts && href.includes('/shorts/')) continue;
    out.push({ id, title: decode(title) });
  }
  return out;
}

async function fetchT(url, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 15000);
  try { return await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (kidstube-player publish)' } }); } finally { clearTimeout(t); }
}

/** oEmbed: 'ok' + title, 'blocked' (owner disallows embedding), 'gone', or 'unknown' (network). */
async function checkEmbed(id) {
  try {
    const r = await fetchT('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), 12000);
    if (r.status === 401 || r.status === 403) return { status: 'blocked' };
    if (r.status === 400 || r.status === 404) return { status: 'gone' };
    if (!r.ok) return { status: 'unknown', why: 'HTTP ' + r.status };
    const j = await r.json();
    return { status: 'ok', title: j.title, author: j.author_name };
  } catch (e) { return { status: 'unknown', why: e.message }; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/** Builds the snapshot { builtAt, sources: {'channel:UC..': [{id,title}]}, videoTitles: {id: title} }.
 * previous: an older snapshot to reuse for a channel whose feed can't be read right now.
 * opts.checkEmbeds (default true): drop channel videos whose owner blocks embedding. */
async function resolveYoutube(cfg, opts) {
  opts = opts || {};
  const log = opts.log || console.log, warnings = [];
  const hideShorts = cfg.hideShorts !== false;
  const max = cfg.maxVideosPerChannel || 15;
  const prev = (opts.previous && opts.previous.sources) || {};
  const snapshot = { builtAt: new Date().toISOString(), sources: {}, videoTitles: {} };
  const srcs = [...(cfg.playlists || []).map(p => ['playlist', p]), ...(cfg.channels || []).map(c => ['channel', c])];
  let okCount = 0;
  await pool(srcs, 4, async ([kind, s]) => {
    const key = `${kind}:${s.id}`;
    const url = `https://www.youtube.com/feeds/videos.xml?${kind === 'playlist' ? 'playlist_id' : 'channel_id'}=${s.id}`;
    let vids, lastErr;
    // YouTube's RSS endpoint often answers 404/500 for a moment; retry, then try the channel's
    // long-form uploads playlist (UULF..., which never contains Shorts) as a second source.
    const urls = [url, url, url];
    if (kind === 'channel') urls.push('https://www.youtube.com/feeds/videos.xml?playlist_id=UULF' + s.id.slice(2), 'https://www.youtube.com/feeds/videos.xml?playlist_id=UULF' + s.id.slice(2));
    for (let a = 0; a < urls.length && !vids; a++) {
      if (a) await new Promise(r => setTimeout(r, 1200 * a));
      try {
        const r = await fetchT(urls[a], 15000);
        if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 404 ? ' (if this keeps happening, check the ID)' : ''));
        vids = parseRss(await r.text(), hideShorts);
      } catch (e) { lastErr = e; }
    }
    if (!vids) {
      const e = lastErr;
      if (prev[key] && prev[key].length) { snapshot.sources[key] = prev[key]; warnings.push(`${kind} ${s.name || s.id}: feed failed (${e.message}); kept the ${prev[key].length} videos from the last publish.`); }
      else warnings.push(`${kind} ${s.name || s.id}: feed failed (${e.message}); this row will be empty until it works.`);
      return;
    }
    okCount++;
    if (opts.checkEmbeds !== false) {
      const checks = await pool(vids, 6, v => checkEmbed(v.id));
      const dropped = [];
      vids = vids.filter((v, i) => { const c = checks[i]; if (c.status === 'blocked' || c.status === 'gone') { dropped.push(v.id); return false; } return true; });
      if (dropped.length) log(`    ${s.name || s.id}: left out ${dropped.length} video(s) that can't be embedded: ${dropped.join(' ')}`);
    }
    vids = vids.slice(0, max);
    snapshot.sources[key] = vids;
    log(`  ${kind} ${s.name || s.id}: ${vids.length} videos`);
    if (!vids.length) warnings.push(`${kind} ${s.name || s.id} has no usable (non-Shorts, embeddable) videos in its feed.`);
  });
  const vchecks = await pool(cfg.videos || [], 6, v => checkEmbed(v.id));
  (cfg.videos || []).forEach((v, i) => {
    const c = vchecks[i];
    if (c.status === 'ok') { snapshot.videoTitles[v.id] = c.title; log(`  video ${v.id}: ${c.title}`); }
    else if (c.status === 'blocked') warnings.push(`Featured video ${v.id} does not allow embedding - it will not play on the TV.`);
    else if (c.status === 'gone') warnings.push(`Featured video ${v.id} was not found (deleted, private, or a wrong ID).`);
    else warnings.push(`Could not check Featured video ${v.id}: ${c.why}`);
  });
  return { snapshot, warnings, feedsOk: okCount, feedsTotal: srcs.length };
}

module.exports = { ID_RE, CH_RE, YT_KEYS, LEARN_KEYS, SECRET_KEYS, readJson, findSecrets, pick, validateYoutube, validateLearn, parseRss, checkEmbed, resolveYoutube };
