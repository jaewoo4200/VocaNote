# VocaNote — macOS 네이티브 앱

검색·사전·단어장을 **Swift로 직접 구현한** 초경량 메뉴바 검색 오버레이(Alfred/Spotlight 스타일).
웹뷰 래퍼가 아니라 from-scratch 네이티브입니다. Xcode 없이 **CLT + `swiftc`** 로 빌드.

## 빌드 & 실행
```bash
cd macos
./build.sh            # VocaNote.app 생성 (아이콘 + 데이터 번들 포함)
open VocaNote.app
```
- 메뉴바에 책 아이콘, **⌥Space** 로 검색 패널 토글.
- 타이핑 → 로컬 결과 즉시 + Daum/네이버 한글 뜻(잠시 뒤).

## 단축키
| 키 | 동작 |
|---|---|
| **⌥Space** | 검색 패널 열기/닫기 (전역) |
| **↑ / ↓** | 결과 선택 이동 |
| **↵ Enter** | 선택 항목 단어장 저장 |
| **esc** | 패널 닫기 |
| 바깥 클릭 | 패널 닫기 |

## 기능
- **즉시 로컬 자동완성** — 번들된 빈도순 영단어(5만) 프리픽스 검색
- **라이브 사전 뜻** — Daum/네이버 suggest를 URLSession으로 직접 호출(네이티브라 CORS/JSONP 불필요), 한글 뜻 표시. 우측 세그먼트로 엔진 전환.
- **전자/통신 약어 + ktword 용어집** — 번들 JSON, 한글뜻·원문 링크
- **내 단어장** — `+`(또는 Enter)로 저장 → `Application Support/VocaNote/wordbook.json`, 다음 검색부터 우선 노출
- **메뉴바 전용**(Dock 없음), 떠있는 패널(모든 Space/풀스크린 위)

## 구조 (Sources/)
- `main.swift` — 앱 진입, NSPanel 오버레이, ⌥Space 전역핫키(Carbon), 메뉴바, 키보드 모니터
- `SearchView.swift` — SwiftUI 검색 UI (선택 하이라이트, 출처칩, 푸터 힌트)
- `SearchViewModel.swift` — 결과 병합(단어장→약어/ktword→라이브→로컬)·디바운스·키보드 선택
- `Suggest.swift` — Daum/네이버 라이브 사전(JSON 파싱)
- `Wordlist.swift` / `Abbrev.swift` / `Wordbook.swift` — 로컬 데이터
- `Models.swift` — 공용 타입
- 데이터: `Resources/{wordlist.txt, abbreviations.json, ktword.json}` → 번들
- 아이콘: `icon/make-icons.sh` → `AppIcon.icns`

## 설정 (main.swift 상단)
- `kHotKeyKeyCode` / `kHotKeyModifiers` — 단축키(기본 ⌥Space)
- `kPanelWidth` / `kPanelHeight` — 패널 크기

## 다음 단계 후보
- 검색어 하이라이트, 발음기호/품사, 최근 검색 기록
- 단어장 브라우저(저장 목록 보기/삭제/복습)
- 로그인 동기화(웹앱의 Supabase 재사용 — URLSession)
- 로그인 시 자동 실행(SMAppService), 단축키 설정 UI
- 배포용 Developer ID 서명 + 공증($99/년)
