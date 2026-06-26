# Voca Note

영단어/약어 검색 + 단어장 + 히스토리 웹앱입니다. 기본은 로컬 IndexedDB 기반이며, 필요하면 Supabase 또는 GitHub Gist로 동기화할 수 있습니다.

## 핵심 원칙

- **정확도 우선**: 최종 정답은 사용자가 저장한 `meaningKo` 입니다.
- 저장된 뜻이 없으면 사용자가 명시적으로 실행할 때 사전/검색 페이지의 텍스트를 조회해 앱 안에 표시합니다.
- 데이터 기본 저장소는 **IndexedDB(브라우저 로컬)** 입니다.
- 기기간 동기화는 선택 기능이며, 현재 **Supabase(Vercel 배포 권장)** 또는 **GitHub Gist(legacy)** 를 사용할 수 있습니다.

## 기능 요약

- 상단 고정 검색창 + **하이브리드 자동완성 (지연 0 로컬 + 실시간 Daum 뜻)**
  - 입력 즉시(0ms) 로컬 결과: 내 단어장/약어장(저장된 뜻) + 번들 영단어 사전(`public/wordlist.txt`, 빈도순 약 5만 단어, 인메모리 프리픽스 인덱스)
  - 곧이어 **Daum/네이버 사전 suggest(JSONP)** 결과가 한글 뜻과 함께 병합: `resil` → `resile 원래의 형태로 돌아가다…`, `resilient 회복력 있는…`, `resilience 탄성, 복원력, 탄력` (Alfred "Daum Search"/"Naver Search" 워크플로우와 동일한 엔드포인트)
  - 우선순위: 내 단어장 → 실시간 사전 뜻 → 오프라인 영단어 사전 (term 기준 중복 제거)
  - 우측 상단 **사전/검색 엔진 셀렉터로 Daum ↔ 네이버 전환** (자동완성·엔터 조회에 즉시 반영)
- 전자공학/통신 약어 데이터셋(`public/abbreviations.json`, OFDM·MIMO·LDPC·5G NR 등 약 120개) + 기존 학술 약어(AI/통계/바이오) → 검색 시 "학술 약어 추천"에 한글 뜻·도메인 태그와 함께 표시, "단어장 추가"로 즉시 저장
- **빠른 엔터 조회**: 사전 모드 Enter 시 suggest API로 한글 뜻을 ~150ms에 즉시 표시(느린 페이지 스크랩은 사전에 없는 희귀어 폴백으로만 사용)
- 좌측 상단 로고 클릭 시 메인(History)으로 리디렉션 + 앱 아이콘/파비콘(`public/icon.svg`)
- 상단에서 사전/검색 엔진(Daum/Naver) 선택 가능 (텍스트 조회·외부 링크용)
- 논문/전공서적 중심 학술 약어/단어 추천(LLM, NLP, RCT, PCA, resilience, robustness 등) + 단어장 즉시 추가
- 우선순위: 단어장(뜻 있음) > 약어장(도메인/기본의미 정렬) > 미정의 액션
- Enter 동작
  - 정의 존재: 상세 패널 열기
  - 정의 없음: 기본 사전 텍스트 조회 실행
- 뜻 저장 모달(`meaningKo` 필수, `notes/tags/favorite`)
- History는 **Enter/텍스트조회 실행 시점**에 기록(`lastSeenAt`, `seenCount`)
- 오타/미검색 시 주요 뜻 추출 실패를 감지해 “검색 결과가 없습니다” 안내 표시
- Wordbook 필터(최근/자주/즐겨찾기/태그/미정의)
- Abbrev 다의성 + 도메인 기반 정렬 + 기본 의미 고정
- Import/Export
  - CSV 파일/텍스트 붙여넣기 import
  - 미정의 항목 Review Queue 일괄 처리
  - Wordbook/Abbrev CSV export
  - 전체 JSON 백업/복원
- 단축키
  - `/`, `Esc`, `?`
  - `g h`, `g w`, `g a`, `g r`, `g s`
  - 입력 포커스 중 단축키 비활성화
- 테마: Light / Dark / System
- HashRouter 기반 라우팅
- 옵션 동기화
  - Supabase email OTP 로그인 + vault Pull/Push
  - GitHub Gist Pull/Push + LWW 병합 + tombstone 삭제 처리

## 기술 스택

- Vite + React + TypeScript
- React Router(HashRouter)
- IndexedDB: `idb`
- CSV: `papaparse`
- 테스트: Vitest
- 배포: Vercel 또는 GitHub Actions + GitHub Pages

## 로컬 실행

```bash
npm install
npm run dev
```

Supabase를 사용할 경우 `.env.example`을 참고해 `.env.local`에 아래 값을 넣을 수 있습니다.

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 테스트

```bash
npm run test
```

현재 테스트는 `normalize`, `CSV import/export`, `merge/tombstone(삭제 부활 방지)/history prune`, `shortcut sequence`, `자동완성 병합 빌더`, `wordlist 프리픽스 인덱스`, `Daum/네이버 suggest 파서`, `약어/ktword 데이터셋 파서`, `LLM JSON 임포트 파서`, `백업 검증`을 포함해 71개 케이스를 다룹니다.

## GitHub Pages 배포

1. 저장소 `Settings > Pages`에서 Source를 `GitHub Actions`로 설정합니다.
2. `main` 브랜치로 push 하면 `.github/workflows/deploy.yml`이 빌드/배포합니다.
3. 워크플로우는 자동으로 `VITE_BASE_PATH=/<repo-name>/`를 주입해 정적 경로를 맞춥니다.

## Supabase Sync 설정 방법

### (권장) 공용 프로젝트 1개 = 일반 사용자는 "이메일 로그인"만
배포 소유자가 Supabase 프로젝트 1개를 빌드에 넣어두면, **사용자는 URL/anon key를 몰라도 됩니다.**

1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 실행 → Authentication에서 Email OTP 활성화
2. `Project Settings > API`의 URL과 anon key를 **빌드 환경변수**로 등록:
   - 로컬: `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.example` 참고)
   - Vercel: Project Settings → Environment Variables 에 동일 등록 후 재배포
3. 그러면 앱 `Settings > Sync`에서 **URL/anon key 입력칸은 숨겨지고**, 사용자는 `로그인 이메일` → `인증 코드 보내기` → 받은 6자리 코드 입력만 하면 로그인·동기화됩니다.

> anon key는 클라이언트 노출용 공개 키이며 데이터는 RLS로 보호됩니다(빌드에 넣어도 안전).

### (개발/자체호스트) 직접 연결
환경변수를 안 넣었거나 `Settings > Sync`의 **"고급 (직접 Supabase 연결)"** 을 열면 `Project URL`·`anon key`를 직접 입력할 수 있습니다. 이후 `인증 코드 보내기` → OTP → `OTP 확인 후 연결` → `Sync now`.

### Supabase 동작 방식

- 브라우저는 로컬 IndexedDB를 먼저 사용합니다.
- Sync 시에만 Supabase `sync_vaults` 테이블의 JSON payload와 병합합니다.
- 충돌은 기존과 동일하게 `updatedAt` 기준 LWW 입니다.

## Gist Sync 설정 방법(BYOT, legacy)

1. GitHub에서 Personal Access Token 생성
- 권한: `gist` 읽기/쓰기
2. 앱 `Settings > Sync`
- `GitHub Gist Sync ON` 선택
- Token 입력
- `Create new private gist` 또는 `Connect existing gist`
- 필요 시 `이 기기 기억하기` 체크(로컬 저장)
3. `Sync now`로 Pull+Merge+Push 수행

### 병합 정책

- 키: `stableKey(term+type)`
- 충돌: `updatedAt` 기준 LWW(last-write-wins)
- 삭제: `deletedAt` tombstone 유지
- history: 최신 순으로 상한(2000) 유지

## 보안/개인정보

- 자동완성은 먼저 로컬(번들 사전 + 내 단어장)로 즉시 표시되고, 실시간 한글 뜻을 위해 **Daum/네이버 사전 suggest를 JSONP로 호출**합니다. 이 엔드포인트들은 CORS를 주지 않지만 `callback` 파라미터(JSONP)를 지원하므로 정적 호스팅에서도 동작합니다. JSONP는 해당 호스트의 스크립트를 실행하므로, CSP `script-src`는 `suggest.dic.daum.net`/`vsuggest.search.daum.net`/`ac-dict.naver.com`/`ac.search.naver.com` 네 호스트로만 한정했습니다(그 외에는 `'self'`, `object-src 'none'`). 입력한 검색어가 Daum/네이버로 전송되는 점에 유의하세요.
- GitHub API 호출은 `https://api.github.com`를 사용합니다.
- 텍스트 조회 시 직접 접근이 막히면 `https://r.jina.ai` 프록시를 사용할 수 있습니다. 이때 조회한 단어/페이지 내용이 제3자(jina)를 경유하므로, 명시적 “텍스트 조회” 동작에서만 호출됩니다.
- 토큰은 기본 `sessionStorage`, 선택 시 `localStorage`에 저장됩니다.
- 토큰/민감정보를 로그로 출력하지 않습니다.
- 앱 데이터는 브라우저 로컬 IndexedDB + 사용자가 지정한 Supabase 또는 GitHub Gist에 저장됩니다.

## 처음 사용자 가이드 / LLM 임포트 / ktword 용어해설

- **온보딩 코치마크 투어**: 첫 방문 시 화면을 어둡게 하고 실제 메뉴 위치(검색창·엔진 셀렉터·패널 네비·설정 등)를 하나씩 **스포트라이트로 하이라이트**하며 다음으로 이동. 작은 화면에서 안 보이는 대상은 자동 건너뜀. `Settings > 가이드 다시 보기`로 재실행.
- **LLM로 논문 단어 가져오기** (`Settings`): ① 제공되는 프롬프트를 복사해 ChatGPT·Claude에 논문/문단과 함께 붙여넣기 → ② 나온 JSON을 그대로 붙여넣고 "가져오기" → 뜻까지 자동 저장 후 Review 큐로 이동. 코드펜스(```)·앞뒤 잡설이 섞여도 JSON 배열만 뽑아 파싱.
- **ktword 용어해설**: [ktword.co.kr](http://www.ktword.co.kr/)의 정보통신/전자/물리/수학 용어를 `public/ktword.json`으로 번들(약 190개, 영문 표제어+한글뜻+원문 URL). 검색 시 "학술 약어 추천"에 뜨고 **"ktword 원문 ↗"** 링크로 상세 해설로 이동, "단어장 추가" 시 출처를 notes에 기록.
  - 수집: `node scripts/build-ktword.mjs "2,3,…,22" 1` (카테고리 목록의 링크 title에서 추출, r.jina.ai 경유, 요청 간 지연). 페이지 수를 늘리면 커버리지 확장.
  - 라이선스: ktword 고지 — "본 웹사이트 내 모든 저작물은 원출처를 밝히는 한 자유롭게 사용(상업화포함) 가능합니다". 모든 항목에 원문 URL을 남겨 출처를 표기합니다.

## 약어 데이터셋 업데이트 (전자/통신 등)

전자공학·통신 약어는 코드가 아니라 데이터 파일로 분리되어 있어 쉽게 추가/수정할 수 있습니다.

- 파일: `public/abbreviations.json`
- 형식: `[{ "abbr": "OFDM", "full": "Orthogonal Frequency Division Multiplexing", "ko": "직교 주파수 분할 다중화", "domains": ["comm", "wireless"] }, ...]`
- 항목을 추가/수정한 뒤 `main`에 push하면 GitHub Actions가 자동 배포하여 반영됩니다(앱은 시작 시 이 파일을 로드).
- 빌드 없이 "주기적 업데이트"가 필요하면, 이 JSON을 별도 URL(예: 깃 raw/Gist)에서 가져오도록 `loadAbbrevSeeds(url)` 호출 주소만 바꾸면 됩니다.
- 데이터셋 로드에 실패해도 코드에 내장된 기본 학술 약어(AI/통계/바이오)는 항상 동작합니다.

## Import CSV 컬럼

지원 컬럼(헤더 자동 감지):

- `term`
- `meaningKo`
- `type` (`word` | `abbr`)
- `fullExpansion`
- `domains`
- `tags`
- `notes`
- `favorite`

`plain text`는 줄바꿈 term 리스트로 처리하고 중복 제거합니다.

## 단축키 정책

- 기본값에서 `Cmd/Ctrl/Alt` 조합은 사용하지 않습니다.
- 브라우저/OS 기본 단축키 충돌을 피하기 위해 시퀀스 입력 방식을 사용합니다.
