import { Suspense } from "react";

import { PromptSection } from "@/app/components/PromptSection";
import { StartWelcome } from "./StartWelcome";

export const metadata = {
  title: "성격유형 고르기 — 동아리드림",
};

/**
 * 성격유형 고르기 전용 화면. 기존에 홈(/)에 인라인돼 있던 PromptSection(MBTI 선택 →
 * 성향 카드 생성 상태머신)을 이 라우트로 이전. 홈은 '오늘의 청년부' 피드 우선으로 비우고,
 * 이 진입점은 헤더 메뉴 '🧭 성격유형 고르기' + 가입 승인 알림/홈 CTA로 유도한다.
 * 승인 후 최초 진입 시엔 홈이 이곳(?welcome=1)으로 1회 안내한다 — StartWelcome 참고.
 * 서버 데이터 페치가 없어 정적(○)으로 프리렌더된다(useSearchParams는 Suspense 안).
 */
export default function StartPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-12">
        <Suspense fallback={null}>
          <StartWelcome />
        </Suspense>
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-[28px] sm:text-[34px] font-extrabold tracking-tight leading-[1.3] text-ink">
            나에게 꼭 맞는{" "}
            <em className="not-italic gradient-text whitespace-nowrap">동아리</em>를 찾아보세요
          </h1>
          <p className="text-[15px] font-medium text-ink-soft">
            성격유형을 고르면 성향 카드와 어울리는 동아리를 추천해드려요.
          </p>
        </div>

        <PromptSection />
      </main>
    </div>
  );
}
