<div align="center">

<img src="docs/icon.png" width="120" alt="VocaNote" />

# VocaNote · 보카노트

**논문·원서를 읽다 만난 영단어·약어를 0초 만에 찾아 단어장에 모으는 앱**
맥에선 ⌥Space 스포트라이트, 웹·폰에선 브라우저 — **한 계정으로 자동 동기화**.

<img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-black?logo=apple&logoColor=white">
<img alt="Universal" src="https://img.shields.io/badge/Universal-arm64%20%2B%20Intel-1f6feb">
<img alt="SwiftUI" src="https://img.shields.io/badge/SwiftUI-native-fa7343?logo=swift&logoColor=white">
<img alt="Web" src="https://img.shields.io/badge/Web-React%20%2B%20Vite-61dafb?logo=react&logoColor=white">
<img alt="Download" src="https://img.shields.io/badge/download-2.1MB-2ea44f">

[**⬇︎ 맥 앱 다운로드**](https://github.com/jaewoo4200/VocaNote/releases/latest) ·
[**🌐 웹앱 열기**](https://voca.ljw.app) ·
[사용법](#-사용법) · [빌드](#-빌드-개발자)

</div>

---

## ✨ VocaNote란?

전자·통신 전공(EE/comm) 대학원생이 **영어 논문을 빠르게 읽기 위해** 만든 도구예요.

- **딜레이 0 검색** — `ap`만 쳐도 `ap…` 단어가 즉시. 번들된 빈도순 영단어(5만) 로컬 인덱스라 네트워크를 안 기다립니다.
- **한글 뜻 바로** — 이어서 **다음/네이버 사전**의 한글 뜻이 붙어요. (`resil` → resile 원래 형태로 돌아가다 · resilient 회복력 있는 · resilience 탄성/복원력)
- **전자·통신 약어 + ktword 용어집** — OFDM·MIMO·LDPC·5G NR … 한글뜻·도메인·원문 링크까지.
- **내 단어장** — ↵ 한 번이면 저장. **플래시카드 복습**도.
- **어디서나 동기화** — 맥에서 저장한 단어가 폰·웹 복습 큐에 그대로.

---

## 🖥️ 맥 앱

Alfred/Spotlight 스타일의 **메뉴바 전용 검색 오버레이**. 웹뷰 래퍼가 아니라 SwiftUI로 만든 네이티브 앱이라 가볍고(≈2MB) 빠릅니다.

### 🚀 설치

1. [**Releases**](https://github.com/jaewoo4200/VocaNote/releases/latest) 에서 `VocaNote-x.y.z.zip` 다운로드 → 압축 해제
2. `VocaNote.app` 을 **응용 프로그램** 폴더로 이동(선택)
3. **첫 실행** — 앱이 공증(notarize)되지 않아서 macOS가 막아요. 둘 중 하나:
   - `VocaNote.app` **우클릭 → 열기 → 열기** (한 번만 하면 이후엔 그냥 실행)
   - 또는 터미널에서 격리 속성 제거:
     ```bash
     xattr -dr com.apple.quarantine /Applications/VocaNote.app
     ```
4. 실행하면 **Dock이 아니라 메뉴바(오른쪽 위)** 에 📖 아이콘이 떠요. **⌥Space** 로 검색창 호출!

> 요구사항: **macOS 14(Sonoma)+**, Apple Silicon·Intel 모두 지원(유니버설).

### ⌨️ 사용법

| 단축키 | 동작 |
|---|---|
| **⌥ Space** | 어디서나 검색창 열기/닫기 |
| 타이핑 | 로컬 즉시 자동완성 + 다음/네이버 한글 뜻 |
| **↑ / ↓** | 결과 하이라이트 이동 |
| **↵ Enter** | 선택 단어를 단어장에 저장 |
| **esc** | 닫기 |
| **⌃⌥ Space** | 다른 앱(PDF·브라우저)에서 **드래그한 단어를 바로 조회** |
| **⌘L** | 내 단어장 (목록·삭제·플래시카드 복습) |
| **⌘,** | 설정 (단축키 변경·로그인·자동실행) |

- 검색창 상단 아이콘으로 **단어장/설정/사용법** 바로 이동 · 📌 로 **창 고정**
- 결과 행에서 🔊 **발음** · 📄 **복사** · ➕ **저장**
- 첫 실행 시 **사용법 튜토리얼** (설정 → "사용법 다시 보기"로 재실행)

---

## 🌐 웹앱

브라우저·모바일에선 **[voca.ljw.app](https://voca.ljw.app)** — 설치 없이 바로. 기본은 브라우저 로컬(IndexedDB) 저장, 로그인하면 동기화.

---

## 🔄 동기화 (맥 ↔ 웹 ↔ 폰)

같은 이메일로 로그인하면 단어장이 자동으로 한 곳에 모여요.

1. 맥: **설정(⌘,) → 동기화** · 웹: **Settings → Sync**
2. 이메일 입력 → **코드 받기** → 메일로 온 **8자리 코드** 입력 → 확인
3. 이후 저장/삭제 시 자동 업로드, 열 때/포커스 시 자동 다운로드

> 이메일 OTP(비밀번호 없음) 기반. 토큰은 맥에선 **키체인**, 웹에선 세션 저장소에 보관돼요. 데이터는 Supabase RLS로 사용자별 격리됩니다.

---

## 🔧 빌드 (개발자)

### 웹
```bash
npm install
npm run dev       # 개발 서버
npm run test      # 테스트(71 케이스)
npm run build     # 프로덕션 빌드
```

### 맥 앱 (Xcode 불필요 — CLT + swiftc)
```bash
cd macos
./build.sh        # VocaNote.app 빌드 후 실행 (개발용, arm64)
./release.sh      # 유니버설(.app + .zip) 배포 빌드
```

동기화를 쓰려면 리포 루트 `.env.local` 에 Supabase 값을 넣으면 빌드가 자동 주입합니다(커밋 안 됨):
```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```
> anon key는 클라이언트 노출용 **공개 키**로 바이너리 임베드는 안전합니다(데이터는 RLS 보호). service_role 키는 절대 넣지 마세요.

---

## 🛠️ 기술 스택

- **맥**: Swift · SwiftUI + AppKit(NSPanel 오버레이) · Carbon 전역 단축키 · Keychain · URLSession · `swiftc`(Xcode 없이)
- **웹**: Vite + React + TypeScript · IndexedDB(`idb`) · PapaParse · Vitest
- **동기화/배포**: Supabase(이메일 OTP·`sync_vaults`·RLS) · Vercel

---

## ⚠️ 알려진 한계

| 항목 | 내용 |
|---|---|
| 공증 | Developer ID 미공증 → 첫 실행 시 우클릭 열기(위 설치 3번) 필요 |
| 라이브 뜻 | 입력한 단어가 다음/네이버로 전송됨(로컬 결과는 오프라인) |
| 공용 백엔드 | 동기화는 소유자의 Supabase 프로젝트를 공유(사용자별 RLS 격리) |

---

## 🙏 크레딧 / 라이선스

- 만든이 **Jaewoo Lee** · 사전 뜻 출처 [다음](https://dic.daum.net)/[네이버](https://dict.naver.com) · 용어집 [ktword](http://www.ktword.co.kr)(원출처 표기 조건 자유 이용)
- README 구성은 [ClaudeUsage](https://github.com/jaewoo4200/ClaudeUsage) 를 참고했어요.
- 개인 학습용 프로젝트입니다.
