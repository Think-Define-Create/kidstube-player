#!/usr/bin/env node
/* Publish the TV apps' lists to GitHub Pages.
 *   1. pulls GitHub (main AND gh-pages, so edits made on github.com / a phone are picked up)
 *   2. validates config/youtube.json and config/learn.json (stops with exit code 1 if broken)
 *   3. resolves each channel's latest non-Shorts, embeddable videos from YouTube RSS (here on the
 *      box, where CORS does not apply) and checks every Featured video / lesson video
 *   4. writes data/youtube.json + data/learn.json, commits, pushes to main and gh-pages
 *   5. waits until GitHub Pages serves the new files
 * Usage: tools/publish.sh [--dry-run] [--no-pull] [--no-push] [--no-wait] [--no-embed-check] [--force] [--previous FILE]
 * Needs GH_TOKEN_TDC_PLAYER (fine-grained token, Contents write on this repo) for the push. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lib.js');

const ROOT = path.join(__dirname, '..');
const PAGES = 'https://think-define-create.github.io/kidstube-player/';
const args = process.argv.slice(2);
const has = f => args.includes(f);
const DRY = has('--dry-run'), NOPULL = has('--no-pull') || DRY && !has('--pull'), NOPUSH = has('--no-push') || DRY;
const GIT_ID = ['-c', 'user.name=Think Define Create', '-c', 'user.email=think-define-create@users.noreply.github.com'];
const CRED = ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { echo username=x-access-token; echo password=$GH_TOKEN_TDC_PLAYER; }; f'];

function die(msg) { console.error('\nPUBLISH STOPPED: ' + msg + '\nNothing was published.'); process.exit(1); }
function git(a, opts) { return execFileSync('git', a, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {})).trim(); }
function gitTry(a) { try { return { ok: true, out: git(a) }; } catch (e) { return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).trim() }; } }
function stable(o) { return JSON.stringify(o, (k, v) => (k === 'publishedAt' || k === 'builtAt' || k === 'commit') ? undefined : v); }
function writeJson(rel, obj) { fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 1) + '\n'); }
function readPrev(rel) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { return null; } }

async function main() {
  // ---- 1. pull
  if (!NOPULL) {
    const dirty = git(['status', '--porcelain']);
    if (dirty) {
      console.log('Local changes found; committing them first so they are not lost:\n' + dirty);
      git(['add', '-A']);
      git([...GIT_ID, 'commit', '-q', '-m', 'Local edits before publish']);
    }
    console.log('Pulling from GitHub (main and gh-pages)...');
    const f = gitTry(['fetch', '-q', 'origin', 'main', 'gh-pages']);
    if (!f.ok) die('could not fetch from GitHub: ' + f.out);
    for (const br of ['origin/main', 'origin/gh-pages']) {
      const m = gitTry([...GIT_ID, 'merge', '-q', '--no-edit', br]);
      if (!m.ok) { gitTry(['merge', '--abort']); die(`edits on ${br} conflict with local edits. Fix by hand in ${ROOT} (git status), then run publish again.\n` + m.out); }
    }
  }

  // ---- 2. validate (nothing is written before this passes)
  let yt, learn;
  try { yt = L.readJson(path.join(ROOT, 'config/youtube.json')); learn = L.readJson(path.join(ROOT, 'config/learn.json')); }
  catch (e) { die(e.message); }
  const vy = L.validateYoutube(yt), vl = L.validateLearn(learn);
  vy.errors.forEach(e => console.error('ERROR config/youtube.json: ' + e));
  vl.errors.forEach(e => console.error('ERROR config/learn.json: ' + e));
  if (vy.errors.length || vl.errors.length) die('fix the errors above (see EDITING.md).');
  const warnings = vy.warnings.map(w => 'config/youtube.json: ' + w).concat(vl.warnings.map(w => 'config/learn.json: ' + w));
  console.log('Config OK: ' + (yt.channels || []).length + ' channels, ' + (yt.videos || []).length + ' Featured videos, ' + learn.lessons.length + ' lessons.');

  // ---- 3. resolve
  console.log('Reading YouTube feeds...');
  const prevYt = readPrev('data/youtube.json');
  let previous = prevYt && prevYt.snapshot;
  const pi = args.indexOf('--previous'); // --previous FILE: a snapshot ({sources}) to fall back on, e.g. for the first publish
  if (pi !== -1) { try { const j = JSON.parse(fs.readFileSync(args[pi + 1], 'utf8')); previous = j.snapshot || j; } catch (e) { die('--previous: ' + e.message); } }
  const r = await L.resolveYoutube(yt, { previous, checkEmbeds: !has('--no-embed-check') });
  warnings.push(...r.warnings);
  if (r.feedsTotal && !r.feedsOk && !has('--force')) die('no YouTube feed could be read (is the internet down?). Run again later, or use --force to publish the last saved videos.');
  const lchecks = await Promise.all(learn.lessons.map(l => L.checkEmbed(l.videoId)));
  learn.lessons.forEach((l, i) => {
    const c = lchecks[i];
    if (c.status === 'blocked') warnings.push(`lesson "${l.title}" (${l.videoId}) does not allow embedding - it will not play.`);
    else if (c.status === 'gone') warnings.push(`lesson "${l.title}" (${l.videoId}) was not found on YouTube.`);
    else if (c.status === 'unknown') warnings.push(`could not check lesson video ${l.videoId}: ${c.why}`);
  });

  const commit = gitTry(['rev-parse', '--short', 'HEAD']).out;
  const now = new Date().toISOString();
  const dataYt = { format: 1, app: 'youtube', publishedAt: now, commit, config: L.pick(yt, L.YT_KEYS), snapshot: r.snapshot };
  const dataLearn = { format: 1, app: 'learn', publishedAt: now, commit, config: L.pick(learn, L.LEARN_KEYS) };
  // Final safety check on exactly what will be published.
  if (L.findSecrets(dataLearn).length || L.findSecrets(dataYt).length) die('a secret key ended up in the output; refusing to publish.');
  if (L.validateYoutube(dataYt.config).errors.length || L.validateLearn(dataLearn.config).errors.length) die('output failed validation.');

  warnings.forEach(w => console.warn('WARNING: ' + w));
  const prevLearn = readPrev('data/learn.json');
  const changed = !prevYt || !prevLearn || stable(prevYt) !== stable(dataYt) || stable(prevLearn) !== stable(dataLearn);
  if (DRY) {
    fs.mkdirSync('/tmp/kidstube-publish-dry', { recursive: true });
    fs.writeFileSync('/tmp/kidstube-publish-dry/youtube.json', JSON.stringify(dataYt, null, 1));
    fs.writeFileSync('/tmp/kidstube-publish-dry/learn.json', JSON.stringify(dataLearn, null, 1));
    console.log('\nDry run: wrote /tmp/kidstube-publish-dry/{youtube,learn}.json. Nothing committed or pushed. Changed: ' + changed);
    return;
  }
  if (!changed && !has('--force')) console.log('\nData is unchanged since the last publish; nothing new to commit.');
  else {
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    writeJson('data/youtube.json', dataYt);
    writeJson('data/learn.json', dataLearn);
    git(['add', 'config', 'data']);
    const c = gitTry([...GIT_ID, 'commit', '-q', '-m', 'Publish TV lists ' + now.slice(0, 16).replace('T', ' ') + ' UTC']);
    if (!c.ok && !/nothing to commit/.test(c.out)) die('git commit failed: ' + c.out);
  }

  // ---- 4. push to both branches (gh-pages is what GitHub Pages serves)
  if (NOPUSH) { console.log('--no-push: committed locally only.'); return; }
  if (!process.env.GH_TOKEN_TDC_PLAYER) die('GH_TOKEN_TDC_PLAYER is not set, so it can\'t push. (Local commit kept.)');
  const ahead = gitTry(['rev-list', '--count', 'origin/gh-pages..HEAD']).out, aheadMain = gitTry(['rev-list', '--count', 'origin/main..HEAD']).out;
  if (ahead === '0' && aheadMain === '0') { console.log('GitHub already has this. Done.'); return; }
  console.log('Pushing to GitHub (main + gh-pages)...');
  const p = gitTry([...CRED, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:gh-pages']);
  if (!p.ok) die('push failed: ' + p.out.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@'));
  git(['fetch', '-q', 'origin', 'main', 'gh-pages']);
  console.log('Pushed ' + git(['rev-parse', '--short', 'HEAD']) + '.');

  // ---- 5. wait for GitHub Pages
  if (has('--no-wait')) return;
  process.stdout.write('Waiting for GitHub Pages to serve it');
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(PAGES + 'data/youtube.json?t=' + Date.now());
      if (res.ok) { const j = await res.json(); if (j.publishedAt === dataYt.publishedAt || (!changed && j.commit)) { console.log('\nLive: ' + PAGES + 'data/youtube.json and ' + PAGES + 'data/learn.json'); return; } }
    } catch (e) {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log('\nPushed, but Pages has not updated after 4 minutes. It usually catches up soon; check ' + PAGES + 'data/youtube.json');
}
main().catch(e => die(e.stack || e.message));
