import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface TourStep {
  /** CSS selector of the element to highlight. Omit for a centered welcome/closing card. */
  target?: string;
  icon: string;
  title: string;
  body: JSX.Element;
}

interface SpotlightTourProps {
  onClose: () => void;
}

const STEPS: TourStep[] = [
  {
    icon: '👋',
    title: 'Voca Note 둘러보기',
    body: (
      <p>
        논문·원서를 읽다 모르는 <b>영단어/약어</b>를 빠르게 찾아 단어장에 모으는 앱이에요. 주요 위치를
        하나씩 짚어 드릴게요.
      </p>
    )
  },
  {
    target: '[data-tour="search"]',
    icon: '⚡',
    title: '검색은 지연 없이',
    body: (
      <p>
        입력 즉시 내 단어장 + 사전 추천이 뜨고, 곧이어 <b>Daum·네이버</b> 한국어 뜻이 따라붙어요.{' '}
        <kbd className="kbd">/</kbd> 로 포커스, <kbd className="kbd">Enter</kbd> 로 상세 조회.
      </p>
    )
  },
  {
    target: '[data-tour="engines"]',
    icon: '🔀',
    title: '사전/검색 엔진 전환',
    body: (
      <p>
        여기서 사전·검색 엔진을 <b>Daum ↔ 네이버</b>로 바꿀 수 있어요. 자동완성과 엔터 조회에 바로
        반영됩니다. (작은 화면에서는 Settings에서 변경)
      </p>
    )
  },
  {
    target: '[data-tour="nav"]',
    icon: '🗂️',
    title: '패널 이동 & 단축키',
    body: (
      <p>
        History · Wordbook · Abbrev · Review · Settings. 단축키 <kbd className="kbd">g</kbd>{' '}
        <kbd className="kbd">w</kbd> (단어장), <kbd className="kbd">g</kbd> <kbd className="kbd">r</kbd>{' '}
        (리뷰) 처럼 <kbd className="kbd">g</kbd> + 첫 글자로 이동해요.
      </p>
    )
  },
  {
    target: '[data-tour="settings"]',
    icon: '🤖',
    title: '설정: LLM 임포트 · 동기화',
    body: (
      <p>
        Settings에서 <b>LLM로 논문 단어 가져오기</b>(프롬프트 복사 → JSON 붙여넣기), 기기 간{' '}
        <b>동기화</b>, 테마, 사전 엔진을 설정할 수 있어요.
      </p>
    )
  },
  {
    icon: '🎉',
    title: '준비 끝!',
    body: (
      <p>
        좌측 상단 로고를 누르면 홈으로 돌아오고, <kbd className="kbd">?</kbd> 로 단축키 도움말을 볼 수
        있어요. 이 가이드는 <b>Settings → 가이드 다시 보기</b>에서 다시 열 수 있습니다.
      </p>
    )
  }
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const TOOLTIP_W = 340;

function resolveTarget(selector?: string): HTMLElement | null {
  if (!selector) {
    return null;
  }
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    els.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
}

/**
 * Coachmark / spotlight tour: dims the page, cuts a highlight "hole" over the
 * target element (via a large box-shadow), and anchors a tooltip beside it.
 * Steps whose target isn't present (e.g. hidden on mobile) are auto-skipped.
 */
export function SpotlightTour({ onClose }: SpotlightTourProps): JSX.Element | null {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[index];

  const findStep = useCallback((from: number, dir: 1 | -1): number => {
    let i = from;
    while (i >= 0 && i < STEPS.length) {
      if (!STEPS[i].target || resolveTarget(STEPS[i].target)) {
        return i;
      }
      i += dir;
    }
    return -1;
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      const next = findStep(index + dir, dir);
      if (next < 0) {
        if (dir === 1) {
          onClose();
        }
        return;
      }
      setIndex(next);
    },
    [findStep, index, onClose]
  );

  // Measure the target (and keep it in sync on scroll/resize).
  useLayoutEffect(() => {
    const measure = () => {
      const el = resolveTarget(step?.target);
      if (!el) {
        setBox(null);
        return;
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step?.target]);

  // If the very first resolved step differs (e.g. a hidden target), snap to it.
  useEffect(() => {
    const first = findStep(0, 1);
    if (first > 0) {
      setIndex(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tooltipRef.current?.focus();
  }, [index]);

  if (!step) {
    return null;
  }

  const isLast = findStep(index + 1, 1) < 0;
  const isFirst = findStep(index - 1, -1) < 0;

  // Tooltip placement: below the target if there's room, else above; centered
  // when there's no target.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let tipStyle: React.CSSProperties;
  if (box) {
    const below = box.top + box.height + 12 + 180 < vh;
    const top = below ? box.top + box.height + PAD + 10 : Math.max(12, box.top - PAD - 200);
    const left = Math.min(Math.max(12, box.left + box.width / 2 - TOOLTIP_W / 2), vw - TOOLTIP_W - 12);
    tipStyle = { top, left, width: TOOLTIP_W };
  } else {
    tipStyle = { top: vh / 2 - 120, left: vw / 2 - TOOLTIP_W / 2, width: TOOLTIP_W };
  }

  return (
    <div
      className="fixed inset-0 z-[60]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Dim + spotlight hole (or full dim when no target). */}
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(8,12,22,0.62)',
            outline: '2px solid var(--brand)',
            outlineOffset: '2px'
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'rgba(8,12,22,0.62)' }} />
      )}

      {/* Click-catcher to advance (outside tooltip). */}
      <button
        type="button"
        aria-label="다음"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={() => go(1)}
      />

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        tabIndex={-1}
        className="surface popover absolute rounded-2xl p-4 outline-none"
        style={tipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{step.icon}</span>
          <h3 className="text-sm font-semibold">{step.title}</h3>
        </div>
        <div className="mt-2 text-sm leading-relaxed">{step.body}</div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === index ? 'bg-[color:var(--brand)]' : 'bg-[color:var(--border)]'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
              건너뛰기
            </button>
            {!isFirst ? (
              <button type="button" className="btn btn-ghost text-xs" onClick={() => go(-1)}>
                이전
              </button>
            ) : null}
            <button type="button" className="btn btn-primary text-xs" onClick={() => go(1)}>
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
