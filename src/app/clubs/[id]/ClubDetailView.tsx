"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CLUB_CATEGORY_META } from "@/lib/clubCategories";
import { ClubCategoryIcon } from "@/components/icons";
import { ClubImageCarousel } from "@/components/ClubImageCarousel";
import { ClubLineupBoard } from "@/components/ClubLineupBoard";
import { ClubMeetingCalendar } from "@/components/ClubMeetingCalendar";
import { RoleBadge } from "@/components/RoleBadge";
import type { ClubDetailData } from "@/lib/clubDetail";

function splitTags(tags: string): string[] {
  return tags
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** createdAt 기준 "함께한 지" 라벨 — 죽어있던 createdAt 필드 활성화. */
function togetherLabel(createdAt: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  if (days <= 0) return "오늘부터";
  if (days < 30) return `${days}일째`;
  if (days < 365) return `${Math.floor(days / 30)}개월째`;
  return `${Math.floor(days / 365)}년째`;
}

/**
 * 동아리 상세 뷰 — 클라이언트(스크롤 헤더·신청 폼·갤러리 모달).
 * 데이터는 서버 컴포넌트(page)가 getClubDetail로 SSR해 props로 주입 → 클라 페치 워터폴 제거.
 * 모임 캘린더(ClubMeetingCalendar)는 멤버 게이팅·하단 위치라 기존대로 자체 로드(무변경 원칙).
 */
export function ClubDetailView({ initialData }: { initialData: ClubDetailData }) {
  const data = initialData;
  const { club, isOwner, isLoggedIn, membershipStatus } = data;

  const [scrolled, setScrolled] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const lineupRef = useRef<HTMLDivElement>(null);

  // 신청 폼 상태
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(data.myApplicationStatus);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`/api/clubs/${club.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: applyMessage.trim() || null }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus("pending");
        setApplyOpen(false);
        setApplyMessage("");
      } else {
        setApplyError(json.error ?? "신청에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } catch {
      setApplyError("네트워크 오류. 잠시 후 다시 시도해주세요.");
    }
    setApplying(false);
  }

  const tags = splitTags(club.tags);
  const pending = !club.isApproved || !club.isActive;
  const categoryGradient = CLUB_CATEGORY_META[club.category]?.gradient ?? "from-skyx/30 to-teal/15";
  const hasImages = club.images?.length > 0;

  // 정원·진행도 (maxMembers 있을 때만)
  const remaining = club.maxMembers != null ? Math.max(0, club.maxMembers - club.memberCount) : null;
  const fillPct =
    club.maxMembers != null && club.maxMembers > 0
      ? Math.min(100, Math.round((club.memberCount / club.maxMembers) * 100))
      : null;
  const nearlyFull = remaining != null && remaining > 0 && remaining <= 2;
  const isFull = remaining != null && remaining === 0;

  // 갤러리 — 히어로 첫 장 제외한 나머지
  const galleryImages = hasImages ? club.images.slice(1) : [];

  // 아바타 스택 — 앞 5명 + 나머지 +N
  const stackAvatars = club.lineup.slice(0, 5);
  const overflowCount = Math.max(0, club.lineup.length - stackAvatars.length);

  function scrollToLineup() {
    lineupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── 가입 CTA 렌더 ─────────────────────────────────────────── */
  function renderCta() {
    // 개설자 본인
    if (isOwner) {
      return (
        <div className="flex items-center gap-2">
          <Link
            href="/my/clubs"
            className="glass-card block flex-1 bg-white/80 px-5 py-3.5 text-center text-sm font-medium text-ink-soft transition-all hover:border-teal/40 hover:text-ink"
          >
            내가 개설한 동아리예요 · 신청 관리하기 →
          </Link>
          {!pending && (
            <Link
              href={`/prayer?category=${encodeURIComponent("동아리광고")}&club=${club.id}`}
              className="glass-card shrink-0 bg-white/80 px-4 py-3.5 text-center text-sm font-medium text-gold-ink transition-all hover:border-gold/40"
            >
              📣 광고하기
            </Link>
          )}
        </div>
      );
    }

    // 비로그인
    if (!isLoggedIn) {
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-xs text-ink-soft sm:block">함께하려면 로그인이 필요해요.</p>
          <Link
            href={`/login?next=/clubs/${club.id}`}
            className="btn-gold flex-1 rounded-xl px-6 py-3.5 text-center text-sm font-bold"
          >
            로그인하고 함께하기
          </Link>
        </div>
      );
    }

    // 신청 상태별
    if (status === "pending") {
      return (
        <div className="w-full rounded-xl border border-gold/40 bg-gold/10 px-5 py-3.5 text-center text-sm font-medium text-gold-ink">
          ⏳ 가입 신청 완료 — 승인 대기 중
        </div>
      );
    }
    if (status === "accepted") {
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-teal/35 bg-teal/10 px-5 py-3.5 text-center text-sm font-medium text-teal-ink">
            ✓ 함께하고 있는 동아리예요!
          </div>
          {!pending && (
            <Link
              href={`/prayer?category=${encodeURIComponent("동아리광고")}&club=${club.id}`}
              className="shrink-0 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3.5 text-center text-sm font-medium text-gold-ink transition-all hover:bg-gold/20"
            >
              📣 광고하기
            </Link>
          )}
        </div>
      );
    }

    // 멤버 승인 전
    if (membershipStatus !== "approved") {
      return (
        <Link
          href="/join"
          className="btn-gold block w-full rounded-xl px-6 py-3.5 text-center text-sm font-bold"
        >
          {membershipStatus === "pending"
            ? "청년부 승인 대기 중 · 현황 보기"
            : "동아리 신청 전 청년부 가입하기"}
        </Link>
      );
    }

    // null(첫 신청) 또는 rejected/left/removed(재신청) → 신청 가능
    return (
      <div className="w-full">
        {applyOpen ? (
          <div className="space-y-3 pt-2">
            <textarea
              value={applyMessage}
              onChange={(e) => setApplyMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="개설자에게 전할 한마디 (선택)"
              className="w-full rounded-xl border border-sky-line bg-white/80 px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            />
            {applyError && <p className="px-1 text-sm text-red-500">{applyError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setApplyOpen(false);
                  setApplyError(null);
                }}
                className="glass-soft w-1/3 rounded-xl px-5 py-3 text-sm font-medium text-ink-soft transition-all hover:bg-white hover:text-ink"
              >
                취소
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="btn-gold flex-1 rounded-xl px-6 py-3 text-sm font-bold shadow-md"
              >
                {applying ? "신청 중..." : "신청 보내기"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p
              className={`mb-2 text-center text-[11px] ${nearlyFull || isFull ? "font-semibold text-teal-ink" : "text-ink-soft"}`}
            >
              {isFull
                ? "라인업이 가득 찼지만 마음은 늘 열려 있어요"
                : nearlyFull
                  ? "함께할 자리가 곧 차요"
                  : club.memberCount > 0
                    ? `${club.memberCount}명이 함께하고 있어요`
                    : "첫 멤버가 되어보세요"}
            </p>
            <button
              onClick={() => setApplyOpen(true)}
              className="btn-gold block w-full rounded-xl px-6 py-3.5 text-sm font-bold shadow-[0_4px_14px_-4px_rgba(240,180,41,0.5)]"
            >
              {status ? "다시 함께하기" : "나도 함께하기"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-transparent pb-[120px]">
      {/* ① 스티키 헤더 — 스크롤 전에는 pointer-events-none으로 메인 Header 클릭 보장 */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "glass-card rounded-none border-t-0 border-x-0 shadow-sm"
            : "pointer-events-none bg-transparent border-transparent"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <div
            className={`flex-1 truncate text-lg font-bold text-ink transition-opacity duration-300 ${
              scrolled ? "opacity-100" : "opacity-0"
            }`}
          >
            {club.name}
          </div>
          {/* 스크롤 시 사회적 증거 칩 */}
          <span
            className={`glass-soft flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-soft transition-opacity duration-300 ${
              scrolled ? "opacity-100" : "opacity-0"
            }`}
          >
            🤝 {club.memberCount}
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl">
        {/* ② 풀블리드 히어로 + 이름·카테고리 오버레이 */}
        <div className="relative z-0 w-full">
          {hasImages ? (
            <>
              <ClubImageCarousel images={club.images} fullBleed showCaption={false} />
              {/* 이미지 영역과 동일 비율로 오버레이를 얹어 점 인디케이터 스트립을 침범하지 않음 */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[4/3] items-end sm:aspect-[16/9]">
                <div className="w-full bg-gradient-to-t from-ink/65 via-ink/15 to-transparent px-4 pb-6 pt-16">
                  <span className="glass-soft inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
                    <ClubCategoryIcon category={club.category} tone="inherit" className="h-3.5 w-3.5" />
                    {club.category}
                  </span>
                  <h1 className="mt-2 text-2xl font-bold leading-snug text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] sm:text-3xl">
                    {club.name}
                  </h1>
                </div>
              </div>
            </>
          ) : (
            <div className={`flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${categoryGradient}`}>
              <ClubCategoryIcon category={club.category} className="h-12 w-12" />
              <h1 className="px-6 text-center text-2xl font-bold text-ink sm:text-3xl">{club.name}</h1>
            </div>
          )}
        </div>

        <div className="relative z-10 px-4 pt-5">
          {/* ③ 환대 지표 바 (빛띠는 여기 1곳만) */}
          <div className="glass-card glass-ribbon relative mb-4 overflow-hidden bg-white/85 p-5 shadow-[0_4px_24px_-8px_rgba(74,144,194,0.4)]">
            <div className="grid grid-cols-3 divide-x divide-sky-line text-center">
              {/* 함께하는 사람 */}
              <div className="px-2">
                <div className="text-lg font-bold text-ink sm:text-xl">
                  🤝 {club.memberCount}
                  {club.maxMembers ? (
                    <span className="text-sm font-medium text-ink-faint">/{club.maxMembers}</span>
                  ) : null}
                </div>
                {fillPct != null && (
                  <div className="mx-auto mt-1.5 h-1.5 w-4/5 overflow-hidden rounded-full bg-sky-line/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-teal"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                )}
                <div className="mt-1 text-[11px] text-ink-faint">함께하는 사람</div>
              </div>

              {/* 함께한 지 */}
              <div className="px-2">
                <div className="text-lg font-bold text-ink sm:text-xl">
                  🌱 {togetherLabel(club.createdAt)}
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">함께한 지</div>
              </div>

              {/* 둘러봤어요 */}
              <div className="px-2">
                <div className="text-lg font-bold text-ink sm:text-xl">
                  {club.viewCount > 0 ? `👀 ${club.viewCount.toLocaleString()}` : "🌱 새 모임"}
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {club.viewCount > 0 ? "둘러봤어요" : "방금 열렸어요"}
                </div>
              </div>
            </div>
          </div>

          {/* ④ 함께하는 사람들 — 아바타 스택 (사회적 증거 미리보기) */}
          <button
            type="button"
            onClick={scrollToLineup}
            className="glass-soft mb-4 flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all hover:bg-white/80"
          >
            <div className="flex shrink-0 -space-x-2.5">
              {stackAvatars.map((m, i) => (
                <div key={i} className="relative">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-skyx/25 text-xs font-semibold text-skyx-ink ring-2 ring-white">
                      {(m.nickname ?? "익")[0]}
                    </div>
                  )}
                  {m.isOwner && (
                    <span className="absolute -right-0.5 -top-1 text-[11px] leading-none">👑</span>
                  )}
                </div>
              ))}
              {overflowCount > 0 && (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/15 text-[11px] font-bold text-teal-ink ring-2 ring-white">
                  +{overflowCount}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {club.memberCount > 0
                  ? `${club.ownerNickname ?? "개설자"}님과 ${club.memberCount}명이 함께해요`
                  : `${club.ownerNickname ?? "개설자"}님이 첫 자리를 지키고 있어요`}
              </p>
              <p className="text-[11px] text-ink-faint">여기 사람이 있어요! →</p>
            </div>
          </button>

          {/* ⑤ 우리 라인업 보드 (소개 위로 승격) */}
          <div ref={lineupRef} className="card-slide-in mb-6 scroll-mt-16">
            <ClubLineupBoard lineup={club.lineup} maxMembers={club.maxMembers} />
          </div>

          {/* ⑥ 동아리 이야기 (소개 + 태그 + 개설자) */}
          <div className="glass-card mb-6 bg-white/85 p-6 sm:p-8">
            {isOwner && pending && (
              <div className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-ink">
                {!club.isApproved
                  ? "관리자 승인을 기다리는 중이에요. 승인되면 다른 청년들에게 공개됩니다."
                  : "지금은 숨김 처리된 동아리예요."}
              </div>
            )}

            <p className="mb-3 text-xs font-medium text-teal-ink">이런 모임이에요</p>
            <div className="whitespace-pre-wrap text-[15px] leading-loose text-ink/90">
              {club.description}
            </div>

            {tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-teal/20 bg-teal/5 px-2.5 py-1 text-xs font-medium text-teal-ink"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-2 border-t border-sky-line pt-5 text-sm text-ink-soft">
              {club.ownerAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={club.ownerAvatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-skyx/25 text-xs text-skyx-ink">
                  {(club.ownerNickname ?? "익")[0]}
                </div>
              )}
              <span>개설자 {club.ownerNickname ?? "탈퇴한 멤버"}</span>
              <RoleBadge role="club_leader" size="sm" />
            </div>
          </div>

          {/* ⑦ 함께한 순간들 (갤러리) — 2장 이상일 때만 */}
          {galleryImages.length > 0 && (
            <div className="glass-card mb-6 bg-white/80 p-5">
              <h2 className="mb-3 text-base font-bold text-ink">📸 함께한 순간들</h2>
              <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                {galleryImages.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGalleryOpen(true)}
                    className="shrink-0 snap-start text-left transition-transform hover:scale-[1.02]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.caption || `사진 ${i + 2}`}
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-28 rounded-xl border border-sky-line object-cover"
                    />
                    {img.caption && (
                      <p className="mt-1 w-28 truncate text-[11px] text-ink-soft">{img.caption}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ⑧ 모임 일정 캘린더 (멤버 게이팅·다음모임 컴포넌트 내부 유지) */}
          <div className="relative z-10 mb-6">
            <ClubMeetingCalendar
              clubId={club.id}
              isMember={data.isMember}
              isOwner={isOwner}
              membershipStatus={membershipStatus}
            />
          </div>
        </div>
      </main>

      {/* 갤러리 풀뷰 모달 */}
      {galleryOpen && (
        <div
          className="modal-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 px-4 backdrop-blur-[2px]"
          onClick={() => setGalleryOpen(false)}
        >
          <div className="modal-pop-in w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setGalleryOpen(false)}
                aria-label="닫기"
                className="glass-soft flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink"
              >
                ✕
              </button>
            </div>
            <ClubImageCarousel images={club.images} showCaption />
          </div>
        </div>
      )}

      {/* ⑨ 하단 고정 CTA — 모바일 하단 탭바(64px) 위에 뜨도록 오프셋 */}
      <div
        className="fixed bottom-16 left-0 right-0 z-30 border-t border-white/40 bg-white/60 shadow-[0_-8px_20px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl sm:bottom-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-2xl px-4 py-3">{renderCta()}</div>
      </div>
    </div>
  );
}
