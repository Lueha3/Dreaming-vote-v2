"use client";

import { useEffect, useRef, useState } from "react";

export type CarouselStep = {
  /** 실제 화면 사진. content가 있으면 생략 가능. */
  src?: string;
  alt?: string;
  /** 사진 대신 직접 그린 화면(예: 완성 모습 타일). 사진이 낡을 일이 없는 것은 이쪽이 낫다. */
  content?: React.ReactNode;
  /**
   * 단계 배지 문구. 기본은 순번(1, 2, 3…)이지만, 사진 안에 "1.클릭"처럼 번호가 찍혀 있으면
   * 그 번호에 맞춰야 한다 — 배지가 2인데 사진이 1이라고 하면 초보자는 어느 쪽을 믿을지 모른다.
   */
  badge?: string;
  /** 슬라이드 위에 크게 뜨는 한 줄 지시문. "무엇을 누르는지"가 사진과 같은 화면에 함께 보인다. */
  title: React.ReactNode;
  /** 보조 설명 — 왜 그런지, 안 보이면 어떻게 하는지. */
  sub?: React.ReactNode;
};

/**
 * 단계별 따라하기 캐러셀 — 설명서 전용.
 *
 * 글로만 된 4단계는 "화면 아래 오른쪽 ··· 버튼"이 어디인지 모르는 사람에게 소용이 없다.
 * 그래서 슬라이드 하나가 곧 한 단계고, 지시문을 사진 '위'에 붙여 "무엇을(글) → 어디를(사진)"이
 * 한 화면에 같이 들어오게 한다. 사진이 세로로 긴 아이폰 스크린샷이라 높이를 잡아두고
 * object-contain으로 넣는다(ClubImageCarousel은 가로 사진용이라 비율이 안 맞는다).
 *
 * 넘기기: 손가락 스와이프(snap-x) · 화살표 · 점 · 키보드(←/→) · '다음 단계 →' 버튼 전부 지원.
 * 현재 위치는 스크롤 이벤트에서 역산하므로 어느 방법으로 넘겨도 지시문·점·카운터가 함께 따라온다.
 *
 * 양 끝에서 버튼을 disabled로 만들거나 떼어내지 않는다 — 방금 누른 버튼이 사라지면 키보드·
 * 스크린리더 초점이 body로 떨어진다. 대신 aria-disabled로 표시만 하고 누르면 아무 일도 안 하며,
 * 마지막 칸의 '다음 단계'는 '처음으로'로 바뀌어 항상 누를 게 남아 있다.
 */
export function StepCarousel({
  steps,
  label = "단계별 안내",
}: {
  steps: CarouselStep[];
  label?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  // 리사이즈 재스냅용 거울 — 관찰자 콜백은 렌더 밖에서 "지금 몇 번째인지"만 알면 된다.
  // 렌더 중에 ref를 쓰면 안 되므로(react-hooks/refs) 커밋 뒤 effect에서 동기화한다.
  // 스크롤 위치에서 역산하지 않는 이유: 화면 회전으로 폭이 줄면 브라우저가 scrollLeft를
  // 새 최대치로 잘라 버려, 마지막 슬라이드에 있던 사람이 엉뚱한 칸으로 스냅된다.
  const currentRef = useRef(0);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  // 진행 중인 스무스 스크롤의 목적지. 도착 전에 또 누르면 current(아직 옛 칸)가 아니라
  // 이 값 기준으로 한 칸 더 간다 — 연타가 중간에 씹히지 않게.
  const targetRef = useRef<number | null>(null);

  const total = steps.length;

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el || total === 0) return;
    const clamped = Math.max(0, Math.min(total - 1, i));
    targetRef.current = clamped;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: clamped * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }
  const step = (delta: number) => goTo((targetRef.current ?? current) + delta);

  // 스와이프로 넘긴 경우에도 상태를 따라오게 — 슬라이드 폭 단위로 반올림.
  // iOS는 끝에서 튕길 때 scrollLeft가 음수·최대치 초과로 잠깐 벗어나므로 반드시 범위 안으로 자른다
  // (안 자르면 steps[-1]·steps[total]을 읽어 화면이 통째로 죽는다).
  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (targetRef.current === i) targetRef.current = null;
    if (i !== current) setCurrent(i);
  }

  // 화면 회전·리사이즈로 슬라이드 폭이 바뀌면 현재 슬라이드에 다시 스냅(어정쩡하게 걸친 채 남지 않게).
  //
  // 관찰자는 한 번만 만들고, 폭이 '실제로 바뀐' 때만 움직인다. 처음엔 이 effect가 [current]에
  // 묶여 있었는데, 그러면 점을 눌러 여러 칸을 건너뛰는 도중 onScroll이 중간 칸으로 current를
  // 바꾸는 순간 effect가 다시 돌고 → 새 관찰자가 observe() 직후 콜백을 한 번 쏘고 → 그 콜백이
  // 중간 칸으로 scrollTo 해서 진행 중이던 스무스 스크롤을 끊어버렸다(4→1로 가다 3에서 멈춤).
  // 폭 비교 없이 observe 초기 콜백에서 그대로 스냅하는 것도 같은 문제를 만든다.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w === 0 || w === lastWidth) return;
      lastWidth = w;
      el.scrollTo({ left: currentRef.current * w });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (total === 0) return null;

  const active = steps[current];
  const atStart = current === 0;
  const atEnd = current === total - 1;
  const badgeOf = (i: number) => steps[i].badge ?? String(i + 1);

  const arrowCls =
    "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-2xl text-ink shadow-[0_4px_14px_-4px_rgba(74,144,194,.45)] backdrop-blur-sm transition-all hover:bg-white aria-disabled:opacity-30 aria-disabled:hover:bg-white/85";

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/90 bg-white/55"
      role="region"
      aria-roledescription="단계별 안내"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      }}
    >
      {/* 지시문 — 사진보다 먼저 읽히도록 위에. 슬라이드가 바뀌면 배지+지시문을 한 덩어리로 낭독. */}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4" aria-live="polite" aria-atomic="true">
        <span className="mt-0.5 flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-deep px-2 text-sm font-extrabold text-[#3A2A02]">
          {badgeOf(current)}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-snug text-ink">{active.title}</p>
          {active.sub && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{active.sub}</p>}
        </div>
      </div>

      {/* 사진 트랙 — 세로 스크린샷이라 높이를 고정하고 가운데 정렬 */}
      <div className="relative bg-gradient-to-br from-skyx/25 to-teal/10">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex h-[440px] w-full flex-none snap-center items-center justify-center p-3 sm:h-[520px]"
              aria-hidden={i !== current}
            >
              {s.content ? (
                s.content
              ) : (
                // 네 장 합쳐 100KB대라 전부 미리 받는다 — lazy로 두면 넘길 때마다 빈 칸이 먼저 보인다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.src}
                  alt={s.alt ?? ""}
                  decoding="async"
                  draggable={false}
                  className="h-full w-auto max-w-full rounded-xl border border-white/90 object-contain shadow-[0_10px_30px_-14px_rgba(74,144,194,.5)]"
                />
              )}
            </div>
          ))}
        </div>

        {/* 카운터 — 시각용. 낭독은 위 지시문 블록이 맡는다. */}
        <div
          className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-xs font-semibold text-ink-soft backdrop-blur-sm"
          aria-hidden
        >
          {current + 1} / {total}
        </div>

        {/* 화살표 — 끝에서는 흐리게만, 비활성화·제거는 하지 않는다(초점이 body로 떨어진다) */}
        <button
          type="button"
          onClick={() => { if (!atStart) step(-1); }}
          aria-disabled={atStart}
          aria-label="이전 화면"
          className={`${arrowCls} left-2`}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => { if (!atEnd) step(1); }}
          aria-disabled={atEnd}
          aria-label="다음 화면"
          className={`${arrowCls} right-2`}
        >
          ›
        </button>
      </div>

      {/* 점 + 다음 버튼 — 초보자는 화살표보다 "다음 단계 →" 글자 버튼을 훨씬 잘 찾는다 */}
      <div className="flex items-center justify-between gap-3 border-t border-sky-line bg-white/50 px-2 py-1.5">
        <div className="flex items-center" aria-label="화면 이동">
          {steps.map((_, i) => (
            // 점은 8px지만 손가락이 닿는 영역은 p-2 패딩으로 24px 이상 확보
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 화면으로 이동`}
              aria-current={i === current ? "true" : undefined}
              onClick={() => goTo(i)}
              className="flex items-center p-2"
            >
              <span
                className={`block rounded-full transition-all ${
                  i === current ? "h-2 w-6 bg-skyx-deep" : "h-2 w-2 bg-skyx-deep/45 hover:bg-skyx-deep/70"
                }`}
              />
            </button>
          ))}
        </div>
        {/* 버튼은 하나를 끝까지 유지하고 글자·동작만 바꾼다. 마지막 칸에서 다른 버튼으로
            갈아끼우면 방금 누른 버튼이 DOM에서 사라져 초점이 body로 떨어진다(키보드·스크린리더). */}
        <span className="flex items-center gap-2">
          {atEnd && (
            <span className="rounded-full border border-teal/35 bg-teal/10 px-3 py-1.5 text-xs font-bold text-teal-ink">
              🎉 완료!
            </span>
          )}
          <button
            type="button"
            onClick={() => (atEnd ? goTo(0) : step(1))}
            className={
              atEnd
                ? "glass-soft rounded-full px-3.5 py-1.5 text-xs font-bold text-ink-soft hover:text-ink"
                : "btn-gold rounded-full px-4 py-1.5 text-xs font-bold"
            }
          >
            {atEnd ? "처음으로 ↺" : "다음 단계 →"}
          </button>
        </span>
      </div>
    </div>
  );
}
