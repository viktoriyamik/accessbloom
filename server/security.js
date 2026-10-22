import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';

const blockedSuffixes = ['.localhost', '.local', '.internal', '.home', '.test', '.invalid', '.onion'];
export function privateIP(ip) {
  if (!ip || net.isIP(ip) === 0) return true;
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateIP(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v) || v.startsWith('2001:db8:');
  }
  const a = ip.split('.').map(Number);
  return a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 || a[0] === 169 && a[1] === 254 ||
    a[0] === 172 && a[1] >= 16 && a[1] <= 31 || a[0] === 192 && a[1] === 168 ||
    a[0] === 100 && a[1] >= 64 && a[1] <= 127 || a[0] === 192 && a[1] === 0 ||
    a[0] === 198 && (a[1] === 18 || a[1] === 19) || a[0] === 198 && a[1] === 51 && a[2] === 100 ||
    a[0] === 203 && a[1] === 0 && a[2] === 113 || a[0] === 192 && a[1] === 0 && a[2] === 2;
}
export function parseAllowed(raw = '') { return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 1800) throw new Error('Enter a shorter http(s) URL.');
  let url; try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid website URL (including https://).'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80','443'].includes(url.port)) throw new Error('Only public HTTP/HTTPS URLs on standard ports are supported.');
  if (url.hostname.length > 253 || blockedSuffixes.some(s => url.hostname.endsWith(s)) || url.hostname === 'localhost' || net.isIP(url.hostname)) throw new Error('Local and IP-address targets are not allowed.');
  url.hash = '';
  return url;
}
export async function verifyExternal(value, allowed = null) {
  const url = normalizeUrl(value);
  if (allowed && !allowed.includes(url.hostname.toLowerCase())) throw new Error('This domain is not on the approved scanning list.');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(x => privateIP(x.address))) throw new Error('Target resolves to a restricted IP address.');
  return url;
}
export function authorized(req, secret) {
  if (!secret || secret.length < 24) return false;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i,'') || '';
  const a=Buffer.from(token), b=Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
export function safeJSON(value) {return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e');}
