import { Camera, MediaTypeSelection } from '@capacitor/camera';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const extension = type => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[type] || 'jpg';
function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

export async function choosePhotos() {
  let chosen;
  try {
    chosen = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: true,
      limit: 20,
      includeMetadata: true,
      quality: 100
    });
  } catch (error) {
    if (/cancel/i.test(String(error?.message || '')) || error?.code === 'OS-PLUG-CAMR-0006') return [];
    throw error;
  }
  const files = [];
  for (const [index, photo] of (chosen.results || []).entries()) {
    let bytes;
    try {
      // The URI is full resolution. Camera's thumbnail is too small for OCR.
      if (!photo.uri) throw new Error('missing-image-uri');
      const result = await Filesystem.readFile({ path: photo.uri });
      const binary = atob(result.data);
      bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    } catch (readError) {
      if (!photo.webPath) throw readError;
      const response = await fetch(photo.webPath);
      if (!response.ok) throw new Error(`image-fetch-${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    // Check the actual bytes: HEIC/HEIF must never be mislabeled as JPEG.
    const type = imageType(bytes);
    if (!imageTypes.has(type)) throw new Error('unsupported-image-format');
    const created = photo.metadata?.creationDate;
    const capturedAt = typeof created === 'number' ? (created < 1e12 ? created * 1000 : created) : Date.parse(created || '');
    const name = `스크린샷_${Date.now()}_${index + 1}.${extension(type)}`;
    files.push(new File([bytes], name, { type, lastModified: Number.isFinite(capturedAt) ? capturedAt : Date.now() }));
  }
  return files;
}

export async function scheduleReminder({ id, title, at, itemId, prompt = true }) {
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && prompt) permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('notification-permission-denied');
  await LocalNotifications.schedule({ notifications: [{
    id, title: '담아 · 다가오는 일정', body: title,
    schedule: { at: new Date(at) }, extra: { itemId }
  }] });
}

export async function cancelReminder(id) {
  if (Number.isInteger(id) && id > 0) await LocalNotifications.cancel({ notifications: [{ id }] });
}

export async function pendingReminderIds() {
  const result = await LocalNotifications.getPending();
  return new Set((result.notifications || []).map(notification => notification.id));
}

export async function onReminderTap(callback) {
  return LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const itemId = event.notification?.extra?.itemId;
    if (typeof itemId === 'string') callback(itemId);
  });
}

export async function shareDocument(blob, filename) {
  const safeName = String(filename).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0,120);
  const result = await Filesystem.writeFile({
    path: safeName,
    directory: Directory.Cache,
    data: await blob.text(),
    encoding: Encoding.UTF8
  });
  await Share.share({ title: safeName, files: [result.uri], dialogTitle: '파일 저장 또는 공유' });
}
