"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import { FEATURES } from "@/lib/features";

const DISMISS_KEY = "onboarding-checklist-dismissed";

type Steps = {
  pushEnabled: boolean;
  personalityDone: boolean;
  clubJoined: boolean;
  firstEngagement: boolean;
};

const ALL_ITEMS = [
  { key: "personalityDone", label: "성격유형 고르기", href: "/start", emoji: "🧭" },
  { key: "clubJoined", label: "동아리 가입하기", href: "/clubs", emoji: "👥" },
  { key: "pushEnabled", label: "휴대폰 알림 켜기", href: "/my/profile", emoji: "🔔" },
  { key: "firstEngagement", label: "광장에 첫 글·댓글 남기기", href: "/prayer", emoji: "🗣" },
] as const satisfies readonly { key: keyof Steps; label: string; href: string; emoji: string }[];

// 꺼진 기능(성격유형·광장)의 항목은 체크리스트에서 아예 빼서 진행률에도 세지 않는다.
const ITEMS = ALL_ITEMS.filter((item) => {
  if (item.key === "personalityDone") return FEATURES.archetype;
  if (item.key === "firstEngagement") return FEATURES.plaza;
  return true;
});

/**
 * 새가족 체크리스트 — 홈 피드 상단에 진행률 카드로 노출.
 * 서버가 새가족 기간(A-1 window) + 4개 항목을 함께 판정해 내려주므로,
 * 클라는 받은 그대로 그리기만 한다. 전부 완료되거나 직접 닫으면 사라진다.
 */
export function OnboardingChecklist() {
  const [steps, setSteps] = useState<Steps | null>(null);
  const [dismissed, setDismissed] = useState(true); // localStorage 확인 전 깜빡임 방지

  useEffect(() => {
    fetchJson<{ ok: true; show: boolean; steps?: Steps }>("/api/my/onboarding")
      .then((d) => {
        if (d.show && d.steps) setSteps(d.steps);
      })
      .catch(() => {});
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!steps || dismissed) return null;

  const doneCount = ITEMS.filter((item) => steps[item.key]).length;
  if (doneCount === ITEMS.length) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-gold-ink">
          🌱 새가족 체크리스트 ({doneCount}/{ITEMS.length})
        </p>
        <button type="button" onClick={dismiss} className="text-xs text-ink-faint hover:text-ink">
          닫기
        </button>
      </div>
      <ul className="space-y-1.5">
        {ITEMS.map((item) =>
          steps[item.key] ? (
            <li
              key={item.key}
              className="flex items-center gap-2 rounded-xl border border-teal/25 bg-teal/[0.06] px-3 py-2 text-sm text-ink-soft"
            >
              <span aria-hidden>✅</span>
              <span className="line-through">{item.label}</span>
            </li>
          ) : (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-xl border border-white/90 bg-white/55 px-3 py-2 text-sm text-ink transition-all hover:bg-white/80"
              >
                <span aria-hidden>{item.emoji}</span>
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-ink-faint">하러 가기 →</span>
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
