import Link from "next/link";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ChurchLineArt } from "@/components/ChurchLineArt";

/**
 * 방문자용 홈 — 비로그인/미가입/반려/승인대기 상태에서 홈(/)에 노출.
 * 승인 멤버는 이 컴포넌트 대신 기존 피드 홈을 본다(page.tsx에서 분기).
 * 광고성 소개(스토리·시연·기능 나열)는 싣지 않는다 — 히어로 + 가입 CTA + 푸터만.
 *  - visitor: 비로그인 → 가입 CTA가 /login?next=/join
 *  - apply:   로그인 + 미가입(none)·반려(rejected) → 가입 CTA가 /join
 *  - pending: 승인 대기 → CTA 대신 대기 안내
 */
export type ShowcaseStatus = "visitor" | "apply" | "pending";

function GoldStar({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden>
      <path
        d="M13 1c1.4 7.4 3.4 9.4 11 11-7.6 1.6-9.6 3.6-11 11-1.4-7.4-3.4-9.4-11-11 7.6-1.6 9.6-3.6 11-11Z"
        fill={fill}
      />
    </svg>
  );
}

function JoinCta({ status }: { status: ShowcaseStatus }) {
  if (status === "pending") {
    return (
      <span className="glass-soft inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-skyx-ink">
        ⏳ 승인 대기중 — 곧 만나요!
      </span>
    );
  }
  return (
    <Link
      href={status === "visitor" ? "/login?next=/join" : "/join"}
      className="btn-gold btn-glow rounded-full px-7 py-3.5 text-base font-bold"
    >
      가입 신청하기 →
    </Link>
  );
}

export function HomeShowcase({ status }: { status: ShowcaseStatus }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <AnnouncementBanner />
        {status === "pending" && (
          <div className="glass-card mb-2 flex items-center gap-3 px-5 py-3.5 text-sm text-ink">
            <span aria-hidden>⏳</span>
            <span>
              <b>가입 승인을 기다리는 중이에요.</b>{" "}
              <span className="text-ink-soft">운영진이 확인하면 알림으로 알려드릴게요.</span>
            </span>
          </div>
        )}
      </div>

      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section
        className="relative grid flex-1 place-items-center overflow-clip px-6 pb-12 pt-10 text-center"
        style={{ minHeight: "max(480px, 62svh)" }}
      >
        {/* 앰비언트: 글로우·구름·별 */}
        <span className="sky-glow" style={{ width: 420, height: 420, left: -120, top: -80, background: "rgba(127,189,228,.5)" }} aria-hidden />
        <span className="sky-glow" style={{ width: 380, height: 380, right: -100, top: "30%", background: "rgba(240,180,41,.22)" }} aria-hidden />
        <span className="sky-glow" style={{ width: 340, height: 340, left: "14%", bottom: -120, background: "rgba(53,195,180,.2)" }} aria-hidden />
        <span className="sky-cloud" style={{ width: 190, height: 64, left: "6%", top: "18%" }} aria-hidden />
        <span className="sky-cloud" style={{ width: 150, height: 52, right: "9%", top: "12%", animationDelay: "-6s" }} aria-hidden />
        <span className="sky-cloud" style={{ width: 230, height: 70, right: "16%", bottom: "16%", animationDelay: "-11s" }} aria-hidden />
        <span className="sky-star" style={{ left: "19%", top: "30%" }} aria-hidden>
          <GoldStar size={22} fill="#F0B429" />
        </span>
        <span className="sky-star" style={{ right: "22%", top: "24%", animationDelay: "-2.4s" }} aria-hidden>
          <GoldStar size={14} fill="#D99B0B" />
        </span>
        <span className="sky-star" style={{ right: "31%", bottom: "26%", animationDelay: "-3.8s" }} aria-hidden>
          <GoldStar size={11} fill="#FFFFFF" />
        </span>

        <div className="relative z-[1]">
          <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-skyx-ink shadow-[0_8px_24px_-8px_rgba(74,144,194,.22)]">
            <span
              className="h-[7px] w-[7px] rounded-full bg-teal"
              style={{ boxShadow: "0 0 0 4px rgba(53,195,180,.18), 0 0 10px rgba(53,195,180,.7)" }}
            />
            꿈꾸는교회 청년부
          </span>
          <h1 className="mb-2 mt-6 text-[clamp(44px,8.6vw,84px)] font-black leading-[1.1] tracking-[-0.035em] text-ink">
            오늘의,
            <br />
            <em className="not-italic gradient-text">청년부.</em>
          </h1>
          <p className="mx-auto mt-4 max-w-[30em] text-[clamp(16px,2.4vw,19px)] font-medium leading-[1.8] text-ink-soft">
            동아리, 모임, 새 소식까지.
            <br />
            우리 청년부 이야기가 여기 모여요.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <JoinCta status={status} />
            {status === "visitor" && (
              <Link
                href="/login"
                className="glass-soft inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-skyx-ink transition-transform hover:-translate-y-0.5"
              >
                이미 멤버예요 · 로그인
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── 푸터: 교회 라인아트 ────────────────────────────────── */}
      <footer className="px-6 pb-8 pt-6">
        <div className="flex justify-center" aria-hidden>
          <ChurchLineArt />
        </div>
        <p className="pt-6 text-center text-[12.5px] font-medium text-ink/55">
          Dreaming Church <span className="mx-1 text-ink/30">·</span> 꿈꾸는교회 청년부{" "}
          <span className="mx-1 text-ink/30">·</span> 동아리드림
        </p>
      </footer>
    </div>
  );
}
