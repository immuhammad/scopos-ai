// Converts contract/mocks.ts (the source of truth) into app/seed/mocks.json.
// The mock consts are plain JS literals, so we slice them out, strip the few
// type annotations, defer the timestamp helpers to seed time, and eval.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'contract/mocks.ts'), 'utf8');

let body = src.slice(src.indexOf('export const FOUNDERS'));
body = body
  .replace(/export type[^\n]*\n/g, '')
  .replace(/: Founder\[\]/, '')
  .replace(/: Deal\[\]/, '')
  .replace(/export const/g, 'const')
  .replace(/const nowIso[^\n]*\n/, '')
  .replace(/const deadlineIn[^\n]*\n/, '')
  .replace(/\bnowIso\b/g, '"__NOW__"')
  .replace(/deadlineIn\((\d+(?:\.\d+)?)\)/g, '"__DEADLINE_$1__"');

const data = new Function(body + '\nreturn { FOUNDERS, DEALS, SOURCING_FEED };')();

if (data.FOUNDERS.length < 9 || data.DEALS.length < 8) {
  throw new Error(`unexpected counts: ${data.FOUNDERS.length} founders, ${data.DEALS.length} deals`);
}
const out = path.join(root, 'app/seed/mocks.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`wrote ${out}: ${data.FOUNDERS.length} founders, ${data.DEALS.length} deals, ${data.SOURCING_FEED.length} feed items`);
