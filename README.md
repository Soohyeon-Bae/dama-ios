# 담아

기기에서 스크린샷을 읽고 일정 또는 블록 페이지로 정리하는 웹 앱입니다.

- 캘린더 중심 / 수집함 중심 화면 전환
- Tesseract.js 6.0.1 한국어·영어 OCR, 같은 출처에서 제공하는 프로그램과 언어 모델
- 여러 날짜 중 하나를 선택하는 대표 일정, 저장 전 원문 확인
- 선택한 여러 이미지로 페이지 만들기, 제목·글·목록·체크 블록
- IndexedDB에 원본 Blob, 첨부일시, OCR 원문과 편집 내용 저장
- JSON 백업/복원, ICS 일정 내보내기

`dist/`를 정적 HTTP 서버로 제공하면 됩니다. 예: `py -m http.server 8877 --directory dist`.

사용자 파일은 서버에 업로드하지 않습니다. 브라우저 사이트 데이터를 지우면 저장한 내용이 사라지므로 백업이 필요합니다. 브라우저를 닫은 상태의 자체 알림과 여러 기기 동기화는 포함되지 않습니다. OCR 결과와 제안 날짜는 저장 전 사용자가 확인합니다.

외부 라이브러리는 `dist/vendor/NOTICE.txt` 참조. 사용자 제공 샘플 원본은 배포 소스에 포함하지 않았습니다. 화면 예시 이미지는 가상의 내용입니다.

## iPhone 앱 준비

이 저장소는 기존 웹 화면을 Capacitor 8의 iOS 앱 안에서 실행하도록 준비했습니다. 웹 배포용 원본은 `dist/`이고, `npm run build`가 iOS용 `www/`를 생성합니다. 앱에서 사진 보관함의 스크린샷을 여러 장 선택하고, 저장한 일정에서 알림 시간을 직접 지정할 수 있습니다. 알림 권한은 알림 저장 버튼을 누를 때만 요청합니다.

```sh
npm ci
npm run check
npm run build
npx cap add ios
npx cap sync ios
node scripts/prepare-ios.mjs
```

`ios/`는 생성물이라 Git에 넣지 않습니다. Mac이 없는 Windows에서는 위 명령으로 iOS 프로젝트까지 준비하고, `codemagic.yaml`의 `ios-unsigned` 작업으로 Mac의 Xcode 컴파일을 확인합니다. 서명하지 않은 결과는 iPhone에 설치할 수 없습니다. Mac의 Xcode와 무료 Apple 계정으로 본인 iPhone에 시험 설치할 수 있으며, App Store 제출에는 Apple Developer Program 가입과 앱 서명·실기기 점검이 필요합니다. 현재 `io.dama.memories`는 빌드용 임시 식별자입니다.

결제 전 확인은 `node tests/run.mjs`로 날짜·제목 제안과 알림 오류 처리를 검사하고, Codemagic의 같은 작업에서 서명 없는 기기용 빌드와 iOS 시뮬레이터 설치·실행을 확인합니다. 시뮬레이터 첫 화면은 `simulator-launch.png` 아티팩트에 저장됩니다. 이 검사는 사진 보관함 선택과 알림이 실제 iPhone에서 도착하는지까지 증명하지 않으므로, 배포 전에는 실기기 테스트가 필요합니다.

웹 주소의 IndexedDB 데이터는 설치형 앱에 자동으로 옮겨지지 않습니다. 웹 설정의 **백업 파일 저장**으로 JSON을 만든 뒤 iPhone의 파일 앱에 보관하고, 설치형 앱의 **백업 불러오기**로 가져와야 합니다. 가져온 일정의 알림은 다시 설정해야 합니다. iOS의 사진 원본 읽기, OCR Worker/WASM, 파일 가져오기·공유, 저장 지속성, 알림 전달은 서명된 iPhone 빌드로 검증해야 합니다.
