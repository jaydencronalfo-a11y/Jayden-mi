'use strict';
/**
 * JAYDEN XMD — channelManager
 * Auto-follow WhatsApp channels (newsletters). Safe, rate-limited, one pass per session.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'channels.json');
const DEFAULT_JID  = process.env.NEWSLETTER_JID || '120363412168087937@newsletter';
const DEFAULT_LINK = process.env.WA_CHANNEL     || 'https://whatsapp.com/channel/0029Vb91nBiKAwEc9gWwxH3e';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}
function save(cfg) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2)); } catch {}
}
function getChannelCfg() {
  const cfg = load() || {};
  if (!Array.isArray(cfg.channels)) cfg.channels = [];
  if (!cfg.channels.includes(DEFAULT_JID)) cfg.channels.unshift(DEFAULT_JID);
  cfg.link = cfg.link || DEFAULT_LINK;
  return cfg;
}
function saveChannelCfg(cfg) { save(cfg); return cfg; }

async function follow(conn, jid) {
  try {
    await conn.newsletterFollow(jid);
    return true;
  } catch (e) {
    // fallback: resolve via invite code from the channel link
    try {
      const m = /channel\/([A-Za-z0-9_-]+)/.exec(DEFAULT_LINK);
      if (m && jid === DEFAULT_JID && conn.newsletterMetadata) {
        const meta = await conn.newsletterMetadata('invite', m[1]);
        if (meta?.id) { await conn.newsletterFollow(meta.id); return true; }
      }
    } catch {}
    return false;
  }
}

async function addChannel(conn, jid) {
  const cfg = getChannelCfg();
  if (jid && !cfg.channels.includes(jid)) { cfg.channels.push(jid); saveChannelCfg(cfg); }
  return follow(conn, jid);
}

async function followAllOn(conn) {
  const cfg = getChannelCfg();
  let ok = 0;
  for (const jid of cfg.channels) {
    if (await follow(conn, jid)) ok++;
    await sleep(2500);
  }
  return { ok, total: cfg.channels.length };
}

async function applyChannelToAll(getActiveSockets) {
  const socks = (typeof getActiveSockets === 'function' ? getActiveSockets() : []) || [];
  let ok = 0;
  for (const s of socks) { const r = await followAllOn(s.conn || s); ok += r.ok; await sleep(3000); }
  return { sockets: socks.length, followed: ok };
}

async function reactPostOnAll(getActiveSockets, postLink, emoji) {
  const socks = (typeof getActiveSockets === 'function' ? getActiveSockets() : []) || [];
  const emojis = Array.isArray(emoji) ? emoji : [emoji || '🔥'];
  const m = /channel\/([A-Za-z0-9_-]+)\/(\d+)/.exec(postLink || '');
  if (!m) return { ok: 0, error: 'Invalid post link' };
  let ok = 0;
  for (const s of socks) {
    const c = s.conn || s;
    try {
      const meta = await c.newsletterMetadata('invite', m[1]);
      await c.newsletterReactMessage(meta.id, m[2], emojis[Math.floor(Math.random() * emojis.length)]);
      ok++;
    } catch {}
    await sleep(3000);
  }
  return { ok, total: socks.length };
}

module.exports = { addChannel, followAllOn, getChannelCfg, saveChannelCfg, applyChannelToAll, reactPostOnAll, follow };
