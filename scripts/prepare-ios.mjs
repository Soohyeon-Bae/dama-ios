import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'ios', 'App', 'App');
const plistPath = join(appDir, 'Info.plist');
const projectPath = join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let plist = await readFile(plistPath, 'utf8');
const descriptions = {
  NSCameraUsageDescription: '스크린샷을 담기 위해 카메라를 사용할 수 있어요.',
  NSPhotoLibraryUsageDescription: '스크린샷을 선택해 일정과 페이지로 정리합니다.',
  NSPhotoLibraryAddUsageDescription: '선택한 스크린샷을 사진 보관함에 저장할 때 사용합니다.'
};
for (const [key, value] of Object.entries(descriptions)) {
  if (!plist.includes(`<key>${key}</key>`)) {
    plist = plist.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
  }
}
await writeFile(plistPath, plist);

// The Filesystem plugin reads file timestamps while sharing backups.
// Xcode must copy this privacy manifest into the app bundle.
const privacyPath = join(appDir, 'PrivacyInfo.xcprivacy');
const privacy = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
`;
await writeFile(privacyPath, privacy);

let project = await readFile(projectPath, 'utf8');
if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  const insert = (marker, line) => {
    if (!project.includes(marker)) throw new Error(`Xcode project template changed: ${marker}`);
    project = project.replace(marker, `${line}\n${marker}`);
  };
  insert('/* End PBXBuildFile section */', '\t\tDAAA00000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = DAAA00000000000000000002 /* PrivacyInfo.xcprivacy */; };');
  insert('/* End PBXFileReference section */', '\t\tDAAA00000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };');
  const groupMarker = '\t\t\t\t504EC3131FED79650016851F /* Info.plist */,';
  const resourcesMarker = '\t\t\t\t2FAD9763203C412B000D30F8 /* config.xml in Resources */,';
  if (!project.includes(groupMarker) || !project.includes(resourcesMarker)) throw new Error('Xcode project groups changed');
  project = project.replace(groupMarker, `${groupMarker}\n\t\t\t\tDAAA00000000000000000002 /* PrivacyInfo.xcprivacy */,`);
  project = project.replace(resourcesMarker, `${resourcesMarker}\n\t\t\t\tDAAA00000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,`);
  await writeFile(projectPath, project);
}
console.log('Added iOS photo permission descriptions and privacy manifest');
