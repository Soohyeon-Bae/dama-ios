import { readFileSync } from 'node:fs';

const { devices = {} } = JSON.parse(readFileSync(0, 'utf8'));
const candidates = Object.entries(devices).flatMap(([runtime, entries]) => {
  if (!/\.iOS-\d+/.test(runtime) || !Array.isArray(entries)) return [];
  const version = (runtime.match(/\.iOS-(\d+)(?:-(\d+))?/) || []).slice(1).map(Number);
  if (version[0] < 15) return [];
  return entries.filter(device => device.isAvailable !== false && /^iPhone\b/.test(device.name || '') && device.udid)
    .map(device => ({ ...device, version }));
});

candidates.sort((a, b) =>
  (b.version[0] - a.version[0]) ||
  ((b.version[1] || 0) - (a.version[1] || 0)) ||
  (Number(b.state === 'Booted') - Number(a.state === 'Booted')) ||
  a.name.localeCompare(b.name)
);

if (!candidates.length) {
  console.error('No available iPhone simulator with iOS 15 or newer');
  process.exit(1);
}
process.stdout.write(`${candidates[0].udid} ${candidates[0].state || 'Shutdown'}`);
