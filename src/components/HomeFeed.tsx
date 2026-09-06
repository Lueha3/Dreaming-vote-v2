"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/time";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { HomeClubCarousel } from "@/components/HomeClubCarousel";
import { HomeSectionHeader } from "@/components/HomeSectionHeader";
import { RoleBadge } from "@/components/RoleBadge";
import { NewcomerBadge } from "@/components/NewcomerBadge";
import { displayRoles } from "@/lib/roles";
import { triggerHaptic } from "@/lib/haptics";
import type { FeedData } from "@/lib/feed";
import { FEATURES } from "@/lib/features";

type Feed = FeedData;

// 홈 본문 상태: 로딩 → (비로그인 | 가입유도 | 승인대기 | 승인멤버 피드)
// page.tsx(서버)가 이 View를 직접 계산해 initial prop으로 주입한다(클라 페치 워터폴 제거).
export type HomeView =
  | { kind: "loading" }
  | { kind: "loggedOut" }
  | { kind: "apply" } // 미가입(none) · 반려(rejected)
  | { kind: "pending" }
  | { kind: "approved"; feed: Feed };

type PlazaPost = FeedData["recentPosts"][number];

const PLAZA_EMOJI: Record<string, string> = {
  일상: "☀️",
  기도해주세요: "🙏",
  동아리광고: "📣",
};

/** 반응 이모지 — 공감은 빨간 하트(❤️), 기도는 🙏, 환영 글은 👋. */
function reactionFace(category: string, systemType: string | null): string {
  if (systemType === "welcome") return "👋";
  if (category === "기도해주세요") return "🙏";
  return "❤️";
}

/** 소셜 프루프 문구 — 'N명이 공감해요 / 기도했어요 / 환영해요'. */
function reactionVerb(category: string, systemType: string | null): string {
  if (systemType === "welcome") return "명이 환영해요";
  if (category === "기도해주세요") return "명이 기도했어요";
  return "명이 공감해요";
}

function plazaLink(category: string, id: string): string {
  return `/prayer?category=${encodeURIComponent(category)}#${id}`;
}

function fmtMeeting(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** KST 날짜 기준 D-day 라벨 — 시간이 아니라 '달력 날짜' 차이로 계산. */
function dDayLabel(iso: string): string {
  const DAY_MS = 86_400_000;
  const kstDay = (t: number) => Math.floor((t + 9 * 60 * 60 * 1000) / DAY_MS);
  const diff = kstDay(new Date(iso).getTime()) - kstDay(Date.now());
  if (diff <= 0) return "오늘";
  if (diff === 1) return "내일";
  return `D-${diff}`;
}

/** 임박도별 D-day 칩 색 — 오늘=골드 채움(가장 강조), 내일=골드 아웃라인, 이후=틸 아웃라인. */
function dDayChipClass(label: string): string {
  if (label === "오늘") return "border-transparent bg-gold text-[#3A2A02]";
  if (label === "내일") return "border-gold/45 bg-gold/10 text-gold-ink";
  return "border-teal/40 bg-teal/[0.06] text-teal-ink";
}

/** 모임 리스트 날짜 스택 — '7.24' + 'FRI'(KST). */
function fmtDateStack(iso: string): { md: string; dow: string } {
  const d = new Date(iso);
  const md = d
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })
    .replace(/\s/g, "")
    .replace(/\.$/, "");
  const dow = d
    .toLocaleDateString("en-US", { timeZone: "Asia/Seoul", weekday: "short" })
    .toUpperCase();
  return { md, dow };
}

/** 시각만 — '오후 09:49'(KST). */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 광장 아바타 — 사진 있으면 원형 이미지, 없으면 이니셜 원. */
function PlazaAvatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-skyx/25 font-bold text-skyx-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {name[0]}
    </span>
  );
}

/** 작성자명 옆 배지 묶음 — 시스템(새가족/생일)·응답됨·새가족·역할. 익명 글은 신원 배지 억제. */
function PlazaBadges({ post }: { post: PlazaPost }) {
  const roles = post.isAnonymous ? [] : displayRoles(post.authorRole);
  return (
    <>
      {post.systemType === "welcome" && (
        <span className="shrink-0 rounded-full bg-gradient-to-r from-gold/25 to-gold/10 px-1.5 py-0.5 text-[9px] font-extrabold text-gold-ink">
          🎉 새가족
        </span>
      )}
      {post.systemType === "birthday" && (
        <span className="shrink-0 rounded-full bg-gradient-to-r from-gold/25 to-gold/10 px-1.5 py-0.5 text-[9px] font-extrabold text-gold-ink">
          🎂 생일
        </span>
      )}
      {!post.systemType && post.isNewcomer && <NewcomerBadge size="sm" />}
      {!post.systemType && roles.map((r) => <RoleBadge key={r} role={r} size="sm" />)}
      {post.isAnswered && (
        <span className="shrink-0 rounded-full bg-teal/15 px-1.5 py-0.5 text-[9px] font-extrabold text-teal-ink">
          🌿 응답됨
        </span>
      )}
    </>
  );
}

/** 소셜 프루프 — 'N명이 공감해요/기도했어요' + 댓글 수. 공감은 빨간 하트(❤️). */
function PlazaProof({ post, className }: { post: PlazaPost; className?: string }) {
  if (post.reactionCount === 0 && post.commentCount === 0) return null;
  return (
    <p className={`flex items-center gap-2 text-[11px] font-bold ${className ?? ""}`}>
      {post.reactionCount > 0 && (
        <span className="text-ink-soft">
          <span aria-hidden>{reactionFace(post.category, post.systemType)}</span>{" "}
          <span className="tabular-nums">{post.reactionCount}</span>
          {reactionVerb(post.category, post.systemType)}
        </span>
      )}
      {post.commentCount > 0 && (
        <span className="rounded-full bg-skyx/12 px-2 py-0.5 tabular-nums text-skyx-ink">
          💬 {post.commentCount}
        </span>
      )}
    </p>
  );
}

/**
 * 광장 소식 카드 스택 — 위에서부터 겹겹이 쌓인 카드를 세로로 쓸어 넘긴다.
 * 위치·높이·그림자·리본 opacity는 rAF 스프링 루프가 DOM에 직접 써(리렌더 없이) 60fps로 제어한다.
 *  - 진입: .plaza-deal 로 카드가 순차로 툭툭 떨어져 쌓인다(CSS keyframes plazaDealIn).
 *  - 드래그: 세로로 쓸면 스프링(탄성 K/감쇠 C)으로 쫀득하게 따라오고 손 떼면 가장 가까운 카드에 안착.
 *  - 탭: 포커스 안 된 카드를 탭하면 그 카드로 포커스 이동, 이미 포커스된 카드를 탭하면 게시글로 이동.
 * prefers-reduced-motion이면 스프링·진입 모션을 끄고 즉시 이동한다.
 */
function PlazaStack({ posts }: { posts: PlazaPost[] }) {
  const router = useRouter();
  const N = posts.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const key = posts.map((p) => p.id).join(",");

  // 컴팩트 헤더 높이 / 포커스 카드 높이 / 겹침 여분 / 카드 1장당 드래그 픽셀.
  const PEEK = 56;
  const EXP = 216;
  const STAGE_H = (N - 1) * PEEK + EXP + 4;

  useEffect(() => {
    const stage = stageRef.current;
    const cards = cardRefs.current.slice(0, N).filter(Boolean) as HTMLDivElement[];
    if (!stage || cards.length !== N || N === 0) return;

    const UNDER = 14;
    const DRAG_PX = 130;
    const K = 150; // 탄성
    const C = 13; // 감쇠(임계감쇠보다 낮춰 살짝 튕기는 '쫀득함')
    const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bodies = cards.map((c) => c.querySelector<HTMLElement>("[data-body]"));
    const previews = cards.map((c) => c.querySelector<HTMLElement>("[data-preview]"));
    const ribbons = cards.map((c) => c.querySelector<HTMLElement>("[data-ribbon]"));

    let f = 0;
    let v = 0;
    let target = 0;
    let dragging = false;
    let running = false;
    let last = 0;
    let raf = 0;

    function render() {
      const fi = Math.round(clamp(f, 0, N - 1));
      for (let i = 0; i < N; i++) {
        const e = 1 - Math.min(Math.abs(i - f), 1); // 펼침 정도 0~1
        const y = i * PEEK + clamp(i - f, 0, 1) * (EXP - PEEK); // 겹겹이 캐스케이드 위치
        const h = PEEK + e * (EXP - PEEK) + (i < N - 1 ? UNDER : 0);
        const card = cards[i];
        card.style.transform = `translateY(${y.toFixed(2)}px)`;
        card.style.height = `${h.toFixed(2)}px`;
        card.style.boxShadow =
          e > 0.5
            ? "0 -16px 32px -16px rgba(30,60,95,.35), 0 18px 40px -18px rgba(46,90,130,.4)"
            : "0 -16px 32px -16px rgba(30,60,95,.35), 0 2px 10px -6px rgba(30,60,95,.12)";
        if (bodies[i]) bodies[i]!.style.opacity = e.toFixed(3);
        if (previews[i]) previews[i]!.style.opacity = (1 - e).toFixed(3);
        if (ribbons[i]) ribbons[i]!.style.opacity = e.toFixed(3);
        const dot = dotRefs.current[i];
        if (dot) dot.className = "plaza-dot" + (i === fi ? " on" : "");
      }
    }

    function loop(now: number) {
      const dt = Math.min(32, now - last) / 1000;
      last = now;
      if (dragging) {
        f += (target - f) * Math.min(1, dt * 28); // 드래그 중엔 즉답성 있게 따라붙기
        v = 0;
      } else {
        const a = K * (target - f) - C * v;
        v += a * dt;
        f += v * dt;
        if (Math.abs(v) < 0.015 && Math.abs(target - f) < 0.0015) {
          f = target;
          v = 0;
        }
      }
      render();
      if (!dragging && v === 0 && f === target) {
        running = false;
        return; // 안착하면 루프 정지(배터리 절약) — 다음 조작 때 kick으로 재개
      }
      raf = requestAnimationFrame(loop);
    }
    function kick() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function settle(next: number) {
      target = clamp(next, 0, N - 1);
      if (reduced) {
        f = target;
        v = 0;
        render();
      } else kick();
    }

    // ── 드래그 + 탭 ──────────────────────────────────────────
    let startY = 0;
    let startX = 0;
    let startF = 0;
    let startT = 0;
    let moved = 0;
    let lastY = 0;
    let lastT = 0;
    let vel = 0;
    let tapCard: HTMLElement | null = null;

    function onDown(ev: PointerEvent) {
      dragging = true;
      stage!.classList.add("plaza-dragging");
      // setPointerCapture 이후엔 이벤트 target이 stage로 바뀌므로 눌린 카드를 지금 기억.
      tapCard = (ev.target as HTMLElement | null)?.closest?.(".plaza-card") as HTMLElement | null;
      stage!.setPointerCapture(ev.pointerId);
      startY = lastY = ev.clientY;
      startX = ev.clientX;
      startF = f;
      startT = lastT = performance.now();
      moved = 0;
      vel = 0;
      kick();
    }
    function onMove(ev: PointerEvent) {
      if (!dragging) return;
      const dy = ev.clientY - startY;
      moved = Math.max(moved, Math.abs(dy), Math.abs(ev.clientX - startX));
      const now = performance.now();
      if (now - lastT > 4) {
        vel = (ev.clientY - lastY) / (now - lastT);
        lastY = ev.clientY;
        lastT = now;
      }
      let raw = startF - dy / DRAG_PX; // 위로 쓸면 다음 카드
      if (raw < 0) raw *= 0.35; // 양끝 러버밴드
      else if (raw > N - 1) raw = N - 1 + (raw - (N - 1)) * 0.35;
      target = raw;
    }
    function onUp(ev: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      stage!.classList.remove("plaza-dragging");
      const quick = performance.now() - startT < 350;
      if (moved < 8 && quick && tapCard) {
        const idx = Number(tapCard.dataset.i);
        const focused = Math.round(clamp(target, 0, N - 1));
        if (idx === focused && Math.abs(target - idx) < 0.05) {
          triggerHaptic();
          router.push(plazaLink(posts[idx].category, posts[idx].id)); // 이미 포커스 → 이동
          return;
        }
        triggerHaptic();
        settle(idx);
        return;
      }
      const flicked = target - (vel * 90) / DRAG_PX * 3; // 플릭 관성 보정
      settle(Math.round(flicked));
    }

    let wheelT = 0;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const now = performance.now();
      if (now - wheelT < 260) return;
      wheelT = now;
      settle(Math.round(target) + (ev.deltaY > 0 ? 1 : -1));
    }

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });

    render();
    // 진입 애니메이션이 끝나면 .plaza-deal 제거(스프링 transform과 충돌 방지).
    const dealT = window.setTimeout(() => {
      cards.forEach((c) => c.classList.remove("plaza-deal"));
    }, N * 90 + 700);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(dealT);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
    };
    // key(글 목록)가 바뀔 때만 재설정. posts/router는 그 안에서 안정적으로 참조.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, N]);

  return (
    <div className="px-1">
      <div ref={stageRef} className="plaza-stage relative" style={{ height: STAGE_H }}>
        {posts.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            data-i={i}
            role="button"
            tabIndex={0}
            aria-label={`${p.authorName}님의 광장 글 보기`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                triggerHaptic();
                router.push(plazaLink(p.category, p.id));
              }
            }}
            className="plaza-card plaza-deal absolute inset-x-0 top-0 overflow-hidden rounded-[18px] border border-white/95 bg-white/[0.92]"
            style={{ zIndex: i + 1 }}
          >
            <span data-ribbon aria-hidden className="plaza-ribbon" />
            <div className="plaza-inner px-3.5" style={{ animationDelay: `${i * 90}ms` }}>
              {/* 헤더 — 컴팩트 상태에서도 항상 보이는 부분 */}
              <div className="flex h-14 items-center gap-2.5">
                <PlazaAvatar url={p.avatarUrl} name={p.authorName} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <b className="min-w-0 truncate text-[12.5px] font-extrabold text-ink">
                      {p.authorName}
                    </b>
                    <PlazaBadges post={p} />
                  </span>
                  <span
                    data-preview
                    className="mt-0.5 block truncate text-[11px] text-ink-faint"
                  >
                    {!p.systemType && `${PLAZA_EMOJI[p.category] ?? "💬"} `}
                    {p.snippet}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">{timeAgo(p.createdAt)}</span>
              </div>
              {/* 본문 — 포커스된 카드에서만 펼쳐진다(opacity는 스프링이 제어) */}
              <div data-body className="overflow-hidden">
                <p className="line-clamp-3 text-[14px] leading-relaxed text-ink">
                  {!p.systemType && (
                    <span className="mr-1" aria-hidden>
                      {PLAZA_EMOJI[p.category] ?? "💬"}
                    </span>
                  )}
                  {p.snippet}
                </p>
                {p.imageUrl && (
                  <span className="relative mt-2.5 block h-[78px] overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {p.imageCount > 1 && (
                      <span className="absolute right-2 top-1.5 rounded-full bg-[#0A1622]/45 px-2 py-0.5 text-[9.5px] font-bold text-white backdrop-blur-sm">
                        ⧉ {p.imageCount}
                      </span>
                    )}
                  </span>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <PlazaProof post={p} />
                  <span className="ml-auto shrink-0 text-[10.5px] font-bold text-skyx-ink">
                    보러 가기 →
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {N > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {posts.map((p, i) => (
            <span
              key={p.id}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              className="plaza-dot"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 홈 본문 — '오늘의 청년부' 피드 우선 화면의 동적 영역.
 * 홈(/)을 정적으로 유지하기 위해 클라에서 쿠키 확인 후 /api/feed를 페치하고,
 * 게이트 상태(비로그인/미가입/대기/승인)별로 안내 또는 활동 피드를 렌더한다.
 *   - 비로그인(쿠키 없음/401)           → 로그인·가입 유도 카드
 *   - 미가입·반려(403 membership_required) → 가입 신청 유도 카드
 *   - 승인 대기(403, status=pending)      → 대기 안내 카드
 *   - 승인 멤버(200)                      → (성향카드 미작성 시) 만들기 CTA + 활동 피드
 */
export function HomeFeed({ initial }: { initial?: HomeView }) {
  const [view, setView] = useState<HomeView>(initial ?? { kind: "loading" });

  useEffect(() => {
    // 서버(page.tsx)가 초기 뷰를 주입했으면 클라 페치를 생략 — 하이드레이션 후 재페치 워터폴 제거.
    if (initial && initial.kind !== "loading") return;

    // 인증 쿠키가 없으면 비로그인 — 서버 왕복 없이 즉시 확정.
    if (!/sb-[a-z0-9-]+-auth-token/i.test(document.cookie)) {
      setView({ kind: "loggedOut" });
      return;
    }

    let alive = true;
    fetch("/api/feed", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j?.ok) setView({ kind: "approved", feed: j as Feed });
          else setView({ kind: "loggedOut" });
          return;
        }
        if (r.status === 403) {
          // membershipGate가 membershipStatus를 함께 내려준다(none/pending/rejected).
          const j = await r.json().catch(() => null);
          setView({ kind: j?.membershipStatus === "pending" ? "pending" : "apply" });
          return;
        }
        // 401 등(토큰 만료 포함) — 비로그인 취급.
        setView({ kind: "loggedOut" });
      })
      .catch(() => {
        if (alive) setView({ kind: "loggedOut" });
      });
    return () => {
      alive = false;
    };
  }, [initial]);

  if (view.kind === "loading") return null;
  // 1) 비로그인 — 기존과 동일하게 로그인·가입 유도 카드.
  if (view.kind === "loggedOut") return <WelcomeCard />;
  // 2) 로그인했지만 미승인(미가입·반려·승인대기) — 피드를 블러(블라인드)로 가리고 안내 문구 노출.
  if (view.kind === "apply") return <BlindFeed variant="apply" />;
  if (view.kind === "pending") return <BlindFeed variant="pending" />;

  // 승인 멤버
  const {
    upcomingMeetings,
    recentClubs,
    recentClubsTotal,
    recentPosts,
    hasPersonalityReport,
    prompt,
  } = view.feed;
  const feedEmpty = !upcomingMeetings.length && !recentClubs.length && !recentPosts.length;
  const nextMeeting = upcomingMeetings[0] ?? null;

  return (
    <div className="mt-5 space-y-4">
      {/* 대문 — '새로 생긴 동아리' 캐러셀(올리브영식). 최신 개설이 첫 슬라이드. */}
      {recentClubs.length > 0 && (
        <HomeClubCarousel clubs={recentClubs} total={recentClubsTotal} />
      )}

      {/* 오늘의 브리핑 — 캐러셀 아래 대표 카드(이번 주 질문 > 다음 모임).
          캐러셀이 없으면(빈 상태) 이 카드가 홈의 히어로 역할을 그대로 이어받는다. */}
      {prompt ? (
        <Link
          href="/prayer"
          onClick={() => triggerHaptic()}
          className="glass-card glass-ribbon card-glow press relative block overflow-hidden p-5"
        >
          {/* 앰비언트 글로우 — 카드에 컬러 텍스처를 입힌다(콘텐츠 뒤, 클릭 방해 없음) */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-gold/25 blur-2xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-32 rounded-full bg-teal/20 blur-2xl"
          />
          <p className="relative text-[10px] font-extrabold uppercase tracking-[0.13em] text-gold-ink">
            Weekly Question · 이번 주 질문
          </p>
          <p className="relative mt-2 text-[19px] font-extrabold leading-snug tracking-tight text-ink">
            {prompt.question}
          </p>
          <div className="relative mt-3.5 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-soft">
              {prompt.answerCount > 0 ? `${prompt.answerCount}명이 답했어요` : "첫 번째로 답해볼까요?"}
            </span>
            <span className="btn-gold shrink-0 rounded-full px-4 py-1.5 text-xs font-bold">
              나도 답하기 →
            </span>
          </div>
        </Link>
      ) : nextMeeting ? (
        <Link
          href={`/clubs/${nextMeeting.clubId}/meetings/${nextMeeting.id}`}
          onClick={() => triggerHaptic()}
          className="glass-card glass-ribbon card-glow press relative block overflow-hidden p-5"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-skyx/25 blur-2xl"
          />
          <p className="relative text-[10px] font-extrabold uppercase tracking-[0.13em] text-teal-ink">
            Next Meeting · 다음 모임
          </p>
          <p className="relative mt-2 text-[19px] font-extrabold leading-snug tracking-tight text-ink">
            {nextMeeting.title}
          </p>
          <div className="relative mt-3.5 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-ink-soft">
              {nextMeeting.clubName} · {fmtMeeting(nextMeeting.meetsAt)}
            </span>
            <span className="shrink-0 rounded-full border border-teal/40 bg-teal/15 px-3 py-1 text-xs font-bold text-teal-ink">
              {dDayLabel(nextMeeting.meetsAt)}
            </span>
          </div>
        </Link>
      ) : null}

      {/* 새가족 체크리스트 — 새가족 기간에만 서버 판정으로 노출 */}
      <OnboardingChecklist />

      {/* 다가오는 내 동아리 모임 — 날짜 스택 + 헤어라인 리스트(임박도별 D-day 칩) */}
      {upcomingMeetings.length > 0 && (
        <section>
          <HomeSectionHeader kicker="Upcoming" title="다가오는 모임" className="mb-2.5 px-1" />
          <div className="glass-card px-4">
            <ul>
              {upcomingMeetings.map((m, idx) => {
                const label = dDayLabel(m.meetsAt);
                const { md, dow } = fmtDateStack(m.meetsAt);
                return (
                  <li key={m.id} className={idx > 0 ? "border-t border-sky-line/70" : ""}>
                    <Link
                      href={`/clubs/${m.clubId}/meetings/${m.id}`}
                      onClick={() => triggerHaptic()}
                      className="press flex items-center gap-3 py-3"
                    >
                      <span className="w-11 shrink-0 text-center">
                        <span className="block text-[16px] font-extrabold leading-none text-skyx-deep tabular-nums">
                          {md}
                        </span>
                        <span className="mt-1 block text-[8.5px] font-extrabold uppercase tracking-[0.12em] text-ink-faint">
                          {dow}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-ink">{m.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                          {m.clubName} · {fmtTime(m.meetsAt)}
                          {m.place ? ` · ${m.place}` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold tabular-nums ${dDayChipClass(label)}`}
                      >
                        {label}
                      </span>
                      <span aria-hidden className="text-base text-ink-faint/60">
                        ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* 광장 소식 — 위에서부터 겹겹이 쌓이는 카드 스택. 쓸어 넘기면 스프링으로 따라오고,
          탭하면 그 글이 포커싱된다(다시 탭하면 게시글로 이동). 응답된 글은 스택 안에서 🌿 배지로. */}
      {recentPosts.length > 0 && (
        <section>
          <HomeSectionHeader
            kicker="Plaza"
            title="광장 소식"
            actionHref="/prayer"
            actionLabel="광장 가기"
            className="mb-2.5 px-1"
          />
          <PlazaStack posts={recentPosts} />
        </section>
      )}

      {/* 성향 카드 미작성 멤버 — 다음 스텝 유도(피드 아래). 성격유형 기능이 켜져 있을 때만. */}
      {FEATURES.archetype && !hasPersonalityReport && <CreateCardCTA />}

      {/* 피드가 비었을 때의 부드러운 빈 상태(성격유형이 꺼져 있으면 카드 보유 여부와 무관) */}
      {feedEmpty && (hasPersonalityReport || !FEATURES.archetype) && <EmptyFeed />}
    </div>
  );
}

/* ── 게이트 상태별 안내 카드 ─────────────────────────────────────────────── */

// 승인 직후 '다음 스텝' 유도 — 성향 카드 만들기.
function CreateCardCTA() {
  return (
    <div className="glass-card glass-ribbon card-glow relative overflow-hidden px-6 py-7 text-center">
      <div className="mb-2 text-3xl" aria-hidden>
        🎉
      </div>
      <p className="mb-1 text-base font-bold text-ink">가입을 환영해요!</p>
      <p className="mb-5 text-sm leading-relaxed text-ink-soft">
        이제 성격유형을 골라 나에게 꼭 맞는 동아리를 찾아보세요.
      </p>
      <Link
        href="/start"
        className="btn-gold btn-glow inline-block rounded-full px-6 py-3 text-sm font-bold"
      >
        🧭 성격유형 고르기 →
      </Link>
    </div>
  );
}

// 비로그인 — 로그인/가입 유도.
function WelcomeCard() {
  return (
    <div className="glass-card mt-8 px-6 py-8 text-center">
      <div className="mb-3 text-3xl" aria-hidden>
        ⛪
      </div>
      <p className="mb-1.5 text-base font-bold text-ink">우리 청년부 소식을 받아보세요</p>
      <p className="mb-6 text-sm leading-relaxed text-ink-soft">
        새로 생긴 동아리와 모임 소식이 여기 모여요.
        <br />
        로그인하고 함께해요!
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/login"
          className="glass-soft rounded-full px-5 py-2.5 text-sm font-semibold text-skyx-ink"
        >
          로그인
        </Link>
        {/* 비로그인 상태 — 가입 신청도 구글 로그인이 선행조건이므로 /login을 거쳐
            로그인 완료 후 /join 폼으로 돌아온다(next). 로그인 유저용 BlindFeed의 버튼은 /join 직행. */}
        <Link
          href="/login?next=/join"
          className="btn-gold rounded-full px-5 py-2.5 text-sm font-bold"
        >
          가입 신청하기 →
        </Link>
      </div>
    </div>
  );
}

/**
 * 미승인(미가입·반려·승인대기) 로그인 유저용 '블라인드 피드'.
 * 실제 피드 데이터는 게이트로 막혀 받지 못하므로, 더미 카드를 블러 처리해
 * "여기 소식이 모인다"는 미리보기만 보여주고 그 위에 상태별 안내를 띄운다.
 *   - pending : "가입 승인 대기중!" (이미 신청, 승인 대기)
 *   - apply   : 미가입·반려 — 가입 신청 버튼을 함께 노출
 */
function BlindFeed({ variant }: { variant: "pending" | "apply" }) {
  return (
    <div className="relative mt-8">
      {/* 블러 처리된 더미 피드 — 읽을 수 없게 가린 미리보기(접근성/포커스에서 제외) */}
      <div
        aria-hidden
        className="space-y-3 select-none blur-[6px] pointer-events-none"
      >
        <FeedSkeletonCard accent="teal" lines={2} />
        <FeedSkeletonCard accent="sky" lines={1} />
        <FeedSkeletonCard accent="gold" lines={2} />
      </div>

      {/* 안내 오버레이 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 text-4xl" aria-hidden>
          {variant === "pending" ? "⏳" : "✋"}
        </div>
        {variant === "pending" ? (
          <>
            <p className="mb-1.5 text-xl font-extrabold text-ink">가입 승인 대기중!</p>
            <p className="text-sm leading-relaxed text-ink-soft">
              운영진의 승인을 기다리는 중이에요.
              <br />
              승인되면 청년부 소식을 모두 볼 수 있어요.
            </p>
          </>
        ) : (
          <>
            <p className="mb-1.5 text-xl font-extrabold text-ink">청년부 가입하고 함께해요</p>
            <p className="mb-5 text-sm leading-relaxed text-ink-soft">
              가입 승인 후 청년부 소식과 모임을 모두 볼 수 있어요.
            </p>
            <Link
              href="/join"
              className="btn-gold btn-glow inline-block rounded-full px-6 py-3 text-sm font-bold"
            >
              가입 신청하기 →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// 블라인드 피드용 더미 카드 — 실제 콘텐츠 대신 모양만 흉내내 블러로 가린다.
function FeedSkeletonCard({
  accent,
  lines,
}: {
  accent: "teal" | "sky" | "gold";
  lines: number;
}) {
  const dot =
    accent === "teal" ? "bg-teal/60" : accent === "sky" ? "bg-skyx/60" : "bg-gold-deep/60";
  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="h-3 w-24 rounded-full bg-ink/15" />
      </div>
      <div className="space-y-2">
        <span className="block h-3.5 w-full rounded-full bg-ink/10" />
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} className="block h-3.5 w-4/5 rounded-full bg-ink/10" />
        ))}
      </div>
    </div>
  );
}

// 승인 멤버지만 아직 피드에 보여줄 소식이 없을 때.
function EmptyFeed() {
  return (
    <div className="glass-card px-6 py-8 text-center">
      <p className="mb-4 text-sm leading-relaxed text-ink-soft">
        아직 새로운 소식이 없어요.
        <br />
        동아리를 둘러보며 첫 활동을 시작해볼까요?
      </p>
      <Link
        href="/clubs"
        className="glass-soft inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-skyx-ink"
      >
        동아리 둘러보기 →
      </Link>
    </div>
  );
}
