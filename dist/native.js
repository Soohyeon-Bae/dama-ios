// The website stays dependency-free. The bridge bundle exists only in the iOS build.
export const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
let bridgePromise;
function bridge() {
  if (!isNativeApp()) throw new Error('native-only');
  bridgePromise ||= import('./native-bridge.js');
  return bridgePromise;
}
export async function choosePhotos() { return (await bridge()).choosePhotos(); }
export async function scheduleReminder(options) { return (await bridge()).scheduleReminder(options); }
export async function cancelReminder(id) { return (await bridge()).cancelReminder(id); }
export async function pendingReminderIds() { return (await bridge()).pendingReminderIds(); }
export async function onReminderTap(callback) { return (await bridge()).onReminderTap(callback); }
export async function shareDocument(blob, filename) { return (await bridge()).shareDocument(blob, filename); }
