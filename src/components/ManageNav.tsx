"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FEATURES } from "@/lib/features";

const TABS = [
  { href: "/manage", label: "멤버 역할", emoji: "🧑‍🤝‍🧑" },
  { href: "/manage/membership", label: "가입 신청", emoji: "📋" },
  { href: "/manage/members", label: "멤버관리", emoji: "👥" },
  { href: "/manage/announcements", label: "전체 공지", emoji: "📢" },
  { href: "/manage/clubs", label: "동아리 관리", emoji: "🎯" },
  { href: "/manage/reports", label: "신고", emoji: "🚨" },
  // 이번 주 질문은 광장 기능에 속한다 — 광장이 꺼져 있으면 관리 탭에서도 뺀다.
  ...(FEATURES.plaza ? [{ href: "/manage/icebreaker", label: "이번 주 질문", emoji: "💬" }] : []),
  { href: "/manage/stats", label: "운영 지표", emoji: "📊" },
  { href: "/manage/audit", label: "감사 로그", emoji: "🧾" },
];

export function ManageNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
      {TABS.map((t) => {
        // "/manage"는 정확히 일치할 때만 활성(다른 탭 경로에 매칭되지 않도록).
        const active =
          t.href === "/manage" ? pathname === "/manage" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
              active
                ? "bg-skyx/15 text-skyx-ink ring-1 ring-skyx/40"
                : "glass-soft text-ink-soft hover:text-ink"
            }`}
          >
            <span className="leading-none">{t.emoji}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
