#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : def;
}

const INPUT = arg('in', './feed-data.json');
const OUTPUT = arg('out', './feed.xml');
const SITE_URL = arg('site', 'https://ubuntu-community-team.github.io/terra/');
const FEED_TITLE = arg('title', 'Ubuntu Planet Universe');
const FEED_DESC = arg('desc', 'Latest posts from Ubuntu Members');
const FEED_LANG = arg('lang', 'en');
const FEED_TTL = parseInt(arg('ttl', '60'), 10);     // mins
const LIMIT = parseInt(arg('limit', '100'), 10);     // max feed items

function xmlEscape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cdata(s = '') {
  // Wrap in CDATA, with safe split in case of "]]>" is in the text.
  return `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toRfc1123(dateISO) {
  // Handle ISO or anything date can parse
  const d = new Date(dateISO);
  if (isNaN(d)) return new Date().toUTCString();
  return d.toUTCString();
}

// 1) Load blog items
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// 2) Sort newest first
raw.sort((a, b) => new Date(b.date) - new Date(a.date));

// 3) Set items limit
const items = raw.slice(0, LIMIT);

// 4) Build RSS XML file
const selfHref = new URL(OUTPUT.endsWith('.xml') ? path.basename(OUTPUT) : 'feed.xml', SITE_URL + '/').href;

const header =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
  `  <channel>\n` +
  `    <title>${xmlEscape(FEED_TITLE)}</title>\n` +
  `    <link>${xmlEscape(SITE_URL)}</link>\n` +
  `    <description>${xmlEscape(FEED_DESC)}</description>\n` +
  `    <language>${xmlEscape(FEED_LANG)}</language>\n` +
  `    <generator>json-to-rss (GitHub Actions)</generator>\n` +
  `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
  `    <ttl>${FEED_TTL}</ttl>\n` +
  `    <atom:link href="${xmlEscape(selfHref)}" rel="self" type="application/rss+xml" />\n`;

const body = items.map((it) => {
  const title = xmlEscape(it.title || '(untitled)');
  const link = xmlEscape(it.link || '');
  const guid = xmlEscape(it.link || it.title || `${Date.now()}`);
  const pubDate = toRfc1123(it.date);
  const desc = cdata(it.contentHtml || it.snippet || '');
  const sourceTag = (it.sourceName || it.sourceUrl)
    ? `\n      <source url="${xmlEscape(it.sourceUrl || '')}">${xmlEscape(it.sourceName || '')}</source>`
    : '';
  let extras = '';
  if (it.author) {
    extras += `\n      <author>${xmlEscape(it.author)}</author>`;
  }
  if (Array.isArray(it.categories) && it.categories.length > 0) {
    extras += it.categories
      .map(c => `\n      <category>${xmlEscape(c)}</category>`)
      .join('');
  }
  if (it.imageUrl) {
    extras += `\n      <enclosure url="${xmlEscape(it.imageUrl)}" type="image/jpeg" />`;
  }
  return (
`    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${desc}</description>${sourceTag}
    </item>\n`
  );
}).join('');

const footer = `  </channel>\n</rss>\n`;

// 5) Write the xml file
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, header + body + footer, 'utf8');

console.log(`RSS written to ${OUTPUT}`);
