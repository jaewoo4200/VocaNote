# VocaNote — macOS 앱(전역 단축키 스포트라이트 오버레이) 확장 plan

> 목표: 단축키를 누르면 화면에 떠서 바로 검색하는 Alfred/Raycast/Spotlight 스타일 앱. 기존 React 웹앱 코드를 최대한 재사용.
> (웹 리서치 2025–2026 기준 종합)

## 0. TL;DR

- **가능하다.** 기존 React/Vite 앱을 **Tauri v2**로 감싸 **전역 단축키로 소환되는 떠있는 검색 패널**로 만든다.
- **"위젯처럼 떠있기"**의 진짜 답은 **WidgetKit 위젯이 아니다** — 위젯은 실시간 텍스트 입력/검색이 **구조적으로 불가능**(OS 스냅샷 + 버튼/토글만). "위젯"은 잘해야 "앱 여는 타일". 실시간 검색은 **떠있는 NSPanel 오버레이**로 구현한다.
- **프레임워크: Tauri v2 추천** (~5–10MB, 저메모리, 기존 코드 거의 그대로, 전역 핫키에 **접근성 권한 불필요**). Electron은 더 쉽지만 80–150MB. 네이티브 Swift는 최고 제어지만 검색 로직 재작성.
- **배포:** 나만 쓰면 $0(경고 1회 감수), 친구 공유·자동업데이트 하려면 **Apple Developer $99/년(공증)** 필요.
- **가장 큰 리스크 1개:** WKWebView에서 daum/naver **JSONP + CSP**가 막힐 수 있음 → **Phase 0 스파이크로 먼저 검증**.

## 1. 두 가지 "떠있는" 모드 (둘 다 같은 패널로 구현 가능)

1. **소환형 스포트라이트** (기본): 전역 단축키 → 화면 중앙에 패널이 뜨고 검색창 자동 포커스 → Esc/포커스 잃으면 사라짐. (Alfred/Raycast 방식)
2. **상시 떠있는 미니창** (선택): 핀 고정해서 항상 위에 떠 있는 작은 창. ("위젯 느낌")

→ 둘 다 **frameless + always-on-top + non-activating NSPanel** 하나로 처리. 1번을 먼저, 2번은 토글 옵션으로.

## 2. 프레임워크 비교

| | Tauri v2 (추천) | Electron | 네이티브 Swift + WKWebView |
|---|---|---|---|
| 기존 React 재사용 | ✅ 거의 그대로 | ✅ 그대로 | ⚠️ 셸만, 검색 로직 재작성 시 큼 |
| 설치 크기 / RAM | ~5–10MB / 30–50MB | 80–150MB / 150–300MB | 최소 |
| 비활성 패널(포커스 안 뺏김·풀스크린 위) | `tauri-nspanel`(커뮤니티 crate) | `type:'panel'` 옵션 하나로(문서 풍부) | 완전 제어(직접 NSPanel) |
| 전역 핫키 | 플러그인(Carbon, 접근성 권한 X) | globalShortcut(동일) | 직접 |
| 러닝커브 | Rust 글루 소량 | 가장 쉬움(JS) | Swift/AppKit 필요 |
| 참고 | Raycast는 둘 다 버리고 네이티브 택함(비활성 패널이 가장 까다로운 부분이라는 신호) | 알려진 `type:'panel'` 포커스 버그(#45892) 테스트 필요 | 웹코드 재사용 최소 |

**결론:** VocaNote의 "가볍고 즉각적" 철학엔 **Tauri v2**가 맞음. Electron은 "빨리 되게"가 최우선이면 대안.

## 3. 아키텍처 & 재사용 전략

- **같은 레포에 Tauri 추가**: `src-tauri/`를 현재 VocaNote 레포에 넣으면 **`src/` React 코드를 100% 공유**. 같은 `npm run build`가 웹(Vercel)과 데스크탑(Tauri) 둘 다에 쓰임. 코드 중복 없음.
- **프론트 자산은 로컬 번들 권장** (배포 URL 로드보다): 오프라인 동작·즉시 실행·로컬 우선 철학에 맞음. 라이브 사전(JSONP)만 네트워크.
  - Vite `base`를 Tauri 빌드 시 `'./'`(상대)로. HashRouter라 라우팅은 문제 없음. `public/`의 wordlist/ktword/abbreviations/icon도 그대로 번들.
- **데스크탑 ↔ 웹 데이터 연결**: 데스크탑 WKWebView의 IndexedDB와 웹(ljw.app)의 IndexedDB는 **별개 저장소**. 이걸 잇는 답이 이미 있음 → **Supabase 로그인 동기화**. (데스크탑에서도 같은 계정 로그인 → 단어장 공유)
- **창은 1개**(오버레이 패널). 검색창 자동 포커스는 이미 구현됨.

## 4. 구현 컴포넌트 (Tauri v2)

- `tauri-plugin-global-shortcut` — 전역 핫키(예: ⌥Space, 재바인드 가능). Carbon `RegisterEventHotKey` 기반이라 **접근성 권한 프롬프트 없음**.
- `tauri-nspanel` (git, branch `v2.1`) — **비활성 NSPanel**: 포커스 안 뺏김, 풀스크린 위 표시, 모든 Space, blur 시 숨김. (핵심 난이도 부분 — ahkohd/tauri-macos-spotlight-example 설정 따라가기)
- `tauri-plugin-autostart` — 로그인 시 자동 실행.
- `ActivationPolicy::Accessory` (`tauri.conf.json` macOS `activationPolicy: "accessory"`) — Dock 아이콘 없이 **메뉴바 전용 앱**.
- 창 설정: `decorations:false, transparent:true(+ macos-private-api), alwaysOnTop:true, skipTaskbar:true, visibleOnAllWorkspaces:true, resizable:false, show:false`.
- **메뉴바 트레이 아이콘**(열기/설정/종료), show 시 화면 중앙 배치, blur/Esc 시 hide, 핫키 **debounce**(누름 반복 깜빡임 방지), 단일 인스턴스.

## 5. 이 앱 특유의 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| **JSONP + CSP** (daum/naver `<script>` 주입이 WKWebView에서 막힐 수 있음; 앱 meta CSP + Tauri CSP 이중 적용) | Phase 0에서 **먼저 검증**. 앱 CSP `script-src`에 4개 suggest 호스트 유지 + Tauri `tauri.conf.json`의 CSP를 `null`로 두어 meta에 위임. 그래도 막히면 **라이브 사전 fetch를 Rust(http 플러그인)로 이전**해 JSONP 자체를 우회. |
| 데스크탑↔웹 저장소 분리 | Supabase 로그인 동기화로 통합(이미 구현) |
| 외부 사전 링크 | `shell open`으로 기본 브라우저에서 열기 |
| `transparent:true` = `macos-private-api` 필요 → **Mac App Store 배포 불가** | 우린 직접 배포(.dmg)라 무관 |
| 핫키가 시스템/타앱과 충돌 or 앞 앱이 키 소비 | 비충돌 기본값 + 사용자 재바인드 |

## 6. 단계별 Plan

- **Phase 0 — 스파이크 (~0.5–1일, 리스크 조기 제거):** Tauri v2 프로젝트 생성 → 현재 `dist` 로드 → WKWebView에서 **검색·로컬 자동완성·JSONP 라이브 사전·IndexedDB**가 실제로 되는지 확인. (여기서 JSONP/CSP만 통과하면 나머진 쉬움)
- **Phase 1 — MVP 오버레이 (~2–3일):** 전역 단축키 → 중앙 패널 소환 + 자동 포커스 + Esc/blur 숨김, 메뉴바 트레이, `accessory` 정책. "단축키로 떠서 검색된다"까지.
- **Phase 2 — 다듬기:** `tauri-nspanel` 비활성 패널(풀스크린 위·포커스 유지), 자동시작, 핫키 재바인드 설정 UI, 투명/블러 룩, 창 위치·크기 기억, 상시 미니창 토글.
- **Phase 3 — 배포:** 개인용 ad-hoc 서명(무료, macOS Sequoia는 "설정 > 개인정보 보호 > 확인 없이 열기" 1회 필요) → 친구 공유 시 **$99 공증 + DMG** + (선택) 자동업데이트(Tauri updater, minisign 키 **백업 필수**).
- **Phase 4 — 선택:** 작은 WidgetKit/Control 위젯은 순수 "VocaNote 열기" 단축 타일로만.

## 7. 전제 / 비용

- 개발: **Rust 툴체인 + Xcode Command Line Tools** 설치 필요(맥).
- 비용: **개인용 $0**, **친구 공유/자동업데이트 $99/년**(Apple Developer, 공증).
- 러닝커브: Rust 글루 소량(대부분은 설정 + 기존 React 그대로).

## 8. 결정 사항 (2026-06-23)

- **프레임워크: 네이티브 Swift** (택함). 시점: **웹/로그인(A 이메일 배포 + B 구글) 마무리 후** 착수.
- ⚠️ 참고(착수 시 재확인): "네이티브 Swift"는 두 갈래 —
  - **(a) Swift 셸 + `WKWebView`**: 기존 React UI를 그대로 띄우고, 오버레이(NSPanel)·전역 핫키·메뉴바만 Swift로. **웹 코드 재사용 최대**, 구현 빠름. ← 착수 시 이걸 권장.
  - **(b) SwiftUI 완전 네이티브**: 검색 UI/로직을 Swift로 재작성. 최고 네이티브 감성이지만 자동완성/사전연동/단어장(IndexedDB) 로직을 전부 다시 만들어야 함(공수 큼, 웹과 이중 유지보수).
  - → 대부분의 이득(단축키 오버레이)은 (a)로 충분. (b)는 "완전 네이티브"가 목적일 때만.
- 착수 시 확정할 것: 자산(로컬 번들 권장) · 배포 범위(나만 $0 / 친구 공유 $99 공증) · 기본 단축키(예 ⌥Space) · 데이터는 Supabase 로그인으로 웹과 동기화.

### 네이티브 Swift 경로 요약 (착수 시)
- 오버레이: `NSPanel(styleMask: .nonactivatingPanel)` + `.floating` 레벨 + collectionBehavior(모든 Space·풀스크린 위) + resignKey 시 숨김. (초기 styleMask에 nonactivating 지정, 나중에 토글 금지)
- 전역 핫키: Carbon `RegisterEventHotKey` (접근성 권한 불필요) 또는 `KeyboardShortcuts`(Sindre) 패키지.
- 메뉴바 전용: `Info.plist`에 `LSUIElement=true` + `NSApp.setActivationPolicy(.accessory)`.
- 로그인 시 자동 실행: `SMAppService`(ServiceManagement).
- 배포: Developer ID 서명 + `notarytool` 공증 + DMG.
- (a) 경로면 `WKWebView`에 빌드된 `dist` 로드 — JSONP/CSP 동작을 초기에 스파이크 검증.

## 참고 출처
- Tauri global-shortcut: https://v2.tauri.app/plugin/global-shortcut/
- Tauri macOS 서명/공증: https://v2.tauri.app/distribute/sign/macos/
- Tauri updater: https://v2.tauri.app/plugin/updater/
- 비활성 패널 예제(ahkohd): tauri-nspanel / tauri-macos-spotlight-example
- WidgetKit 상호작용 한계: https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- Control widgets: https://developer.apple.com/documentation/WidgetKit/Creating-controls-to-perform-actions-across-the-system
