# 디자인 다듬기용 핸드오프 가이드 (claude.ai 등에 넘길 때)

이 앱은 **디자인이 한 곳(CSS 변수 + 공용 클래스)에 집중**되어 있어서, 로직(App.tsx 등)을 건드리지 않고도
색/그림자/타이포/간격/아이콘만 바꿔 전체 룩을 바꿀 수 있습니다. 그래서 **거대한 `App.tsx`는 넘기지 말고**,
아래 "디자인 파일"만 넘기는 것이 안전하고 효과적입니다.

## 1) 넘길 파일 (우선순위 순)

| 파일 | 무엇을 제어하나 | 꼭 넘기기 |
|---|---|---|
| `src/styles.css` | **디자인 토큰 전부** — 색(CSS 변수, light/dark), 그림자, `.btn` `.field` `.chip` `.kbd` `.icon-btn` `.surface` `.popover` `.glass` 등 공용 클래스 | ✅ 필수 |
| `tailwind.config.cjs` | Tailwind 테마(폰트/반경/색 확장) | ✅ |
| `index.html` | 폰트 로드, `theme-color`, 메타 | ✅ |
| `public/icon.svg` | 앱 아이콘/파비콘 | ✅ (아이콘 다듬을 때) |
| `src/components/Modal.tsx`, `EntryDetail.tsx`, `SpotlightTour.tsx` | 작고 독립적인 UI 컴포넌트(원하면 마크업까지 손봄) | 선택 |
| 스크린샷(light/dark, 데스크탑/모바일) | 현재 상태를 보여줌 | ✅ 강력추천 |

> ⚠️ **넘기지 말 것**: `src/App.tsx`(3,000줄, 로직 위험). 굳이 마크업까지 바꾸고 싶으면 위 작은 컴포넌트들만.

## 2) 절대 규칙 (클로드에게 반드시 전달)

- **클래스 이름을 바꾸지 말 것.** JSX가 `.btn .btn-primary .btn-ghost .field .chip .chip-brand .kbd .icon-btn .surface .popover .glass .app-shell` 에 의존합니다. **이름은 유지하고 스타일만** 바꿔야 깨지지 않습니다.
- **CSS 변수 구조 유지**(`--bg --surface --surface-soft --surface-strong --text --text-muted --brand --brand-strong --brand-soft --danger --border --ring --shadow-soft --shadow-pop`). 값은 바꿔도 됨, 키는 유지.
- **light/dark 둘 다** 유지(`:root` 와 `:root[data-theme='dark']`).
- 로직/상태/접근성 속성(aria, role, data-tour)은 건드리지 않기.
- 결과는 **파일 전체 내용**으로 받기(부분 수정본 말고 통째로 → 복붙 교체).

## 3) 복붙용 프롬프트 (claude.ai)

```
너는 시니어 프로덕트 디자이너 겸 프론트엔드 엔지니어야.
"Voca Note"라는 앱의 비주얼 디자인을 더 세련되고 모던하게 다듬어줘.

[앱 소개]
- 영어 논문/원서를 읽는 한국 대학원생이 모르는 영단어·약어를 빠르게 찾아 단어장에 모으는 웹앱.
- React + TypeScript + Tailwind. 테마는 CSS 변수 기반(light/dark/system).
- 무드: 미니멀·집중형(노션/리니어 느낌), 정보 밀도 높지만 차분하게. 학습 도구라 눈이 편해야 함.

[지금 첨부하는 파일]
- src/styles.css  (디자인 토큰 + 공용 클래스 전부)
- tailwind.config.cjs
- index.html
- public/icon.svg
- (스크린샷: light/dark, 데스크탑/모바일)

[해줄 것]
1. 색 팔레트(브랜드/표면/경계/텍스트)와 다크모드를 더 고급스럽게 재조정.
2. 그림자/반경/간격/타이포그래피 스케일을 일관되게 다듬기(특히 .surface, .popover, .btn, .field, .chip, .kbd).
3. 호버/포커스/전환(transition) 마이크로인터랙션 다듬기. 포커스 링은 접근성 유지.
4. public/icon.svg(앱 아이콘)도 더 세련되게 리디자인.
5. 폰트 제안이 있으면 index.html에 웹폰트 추가까지.

[지켜야 할 제약 — 매우 중요]
- 클래스 이름을 절대 바꾸지 마: .btn .btn-primary .btn-ghost .field .chip .chip-brand .kbd .icon-btn .surface .popover .glass .app-shell — 이름 유지, 스타일만 변경.
- CSS 변수 키 유지: --bg --surface --surface-soft --surface-strong --text --text-muted --brand --brand-strong --brand-soft --danger --border --ring --shadow-soft --shadow-pop (값은 변경 OK).
- light(:root)와 dark(:root[data-theme='dark']) 둘 다 유지.
- HTML 구조/클래스 조합/aria/role/data-* 속성은 바꾸지 마 (CSS와 토큰만).
- @tailwind base/components/utilities 지시문과 @layer components 구조 유지.

[출력 형식]
- 수정한 파일을 각각 "파일 전체 내용"으로 출력(부분 diff 말고). 내가 그대로 복붙해 교체할 거야.
- 맨 끝에 바뀐 점 요약 3~5줄.
```

## 4) 받은 결과 적용법

1. 클로드가 준 `src/styles.css`(및 `tailwind.config.cjs`, `index.html`, `public/icon.svg`) 전체 내용을 해당 파일에 그대로 덮어쓰기.
2. `npm run dev` 로 확인(라이트/다크/모바일 폭 모두).
3. 클래스 이름이 바뀌어 깨진 곳이 있으면, 그 클래스만 원래 이름으로 되돌리면 됩니다.
4. 문제 없으면 커밋 → 배포.

## 5) 스크린샷 뽑는 법

`npm run dev` 실행 후 브라우저에서: 메인(History)/단어장/검색 자동완성 펼친 상태/Settings/다크모드/모바일 폭(개발자도구) 각각 캡처해서 함께 첨부하면 품질이 크게 올라갑니다.
