#!/usr/bin/env node
/* Find a YouTube channel ID from an @handle or channel URL.
 * Usage: node tools/channel-id.js @MarkRober   (or https://www.youtube.com/@MarkRober) */
'use strict';
const arg = (process.argv[2] || '').trim();
if (!arg) { console.error('Usage: node tools/channel-id.js @handle'); process.exit(2); }
const url = /^https?:/.test(arg) ? arg : 'https://www.youtube.com/' + (arg[0] === '@' ? arg : '@' + arg);
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' } }).then(r => r.text()).then(html => {
  const id = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/) || html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) || html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/) || [])[1];
  const name = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '';
  if (!id) { console.error('No channel ID found at ' + url); process.exit(1); }
  console.log(`{ "id": "${id}", "name": "${name}", "row": "ROW NAME" }`);
}).catch(e => { console.error(e.message); process.exit(1); });
