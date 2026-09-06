"use client";

import { useState } from "react";
import { findArchetype, type BibleArchetype } from "@/lib/bibleArchetypes";
import { ArchetypeModal } from "@/app/components/ArchetypeTags";
import { ArchetypeMedal, LineupDefs } from "./ArchetypeMedal";
import { displayRoles, roleBadge, type Role } from "@/lib/roles";
import { FEATURES } from "@/lib/features";

export type LineupMember = {
  nickname: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  role: Role | null; // 전역 등급(운영진/관리자). 동아리장은 isOwner로 파생
  archetype: string | null; // 인물형 label (예: "누가형") | null(성향 카드 없음)
};

/**
 * 동아리 '우리 라인업' 보드.
 * 멤버를 대표 인물형 메달로 보여주고(클릭 시 인물 이야기 모달),
 * 빈자리는 '함께할 자리'로 따뜻하게 표현한다. (모집·필터·경쟁 톤 없음)
 */
export function ClubLineupBoard({
  lineup,
  maxMembers,
}: {
  lineup: LineupMember[];
  maxMembers: number | null;
}) {
  const [open, setOpen] = useState<BibleArchetype | null>(null);

  const filled = lineup.length;
  const remaining = maxMembers == null ? 2 : Math.max(0, maxMembers - filled);
  const emptyCount = Math.min(remaining, 3);
  const isFull = maxMembers != null && remaining === 0;

  return (
    <section className="glass-card glass-ribbon relative overflow-hidden p-6 sm:p-7">
      <LineupDefs />

      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-ink">라인업</h2>
        <span className="glass-soft rounded-full px-2.5 py-0.5 text-[11px] text-teal-ink">
          함께 세워가요
        </span>
      </div>
      <p className="mb-5 text-xs text-ink-faint">서로 다른 우리지만, 한 팀이 되어볼까요?</p>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {lineup.map((m, i) => {
          // 성격유형 기능이 꺼져 있으면 인물형 메달 대신 프로필 사진·닉네임으로 보여준다(모달 없음).
          const arch = FEATURES.archetype && m.archetype ? findArchetype(m.archetype) : undefined;
          const clickable = !!arch;
          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={() => arch && setOpen(arch)}
              className={`group relative rounded-2xl border border-white/95 bg-white/60 px-1.5 pb-2 pt-3 text-center transition-all ${
                clickable ? "hover:-translate-y-1 hover:bg-white/85 hover:shadow-[0_14px_28px_-12px_rgba(74,144,194,.5)]" : "cursor-default"
              }`}
            >
              <span
                className="absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-full"
                style={{ background: "linear-gradient(90deg,#F0B429,#35C3B4)" }}
                aria-hidden
              />
              <div className="mx-auto flex justify-center">
                {FEATURES.archetype ? (
                  <ArchetypeMedal label={m.archetype} size={56} />
                ) : m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-skyx/20 text-lg text-skyx-ink">
                    {m.nickname?.[0] ?? "?"}
                  </div>
                )}
              </div>
              {FEATURES.archetype ? (
                <>
                  <div className="mt-1 truncate text-[12px] font-bold text-ink">
                    {arch ? arch.label : "함께하는 중"}
                  </div>
                  <div className="truncate text-[10px] text-ink-faint">
                    {arch ? arch.type.replace(/.*\s/, "") : "성향 카드 준비 중"}
                  </div>
                </>
              ) : (
                <div className="mt-1 truncate text-[12px] font-bold text-ink">{m.nickname ?? "탈퇴한 멤버"}</div>
              )}
              <div className="mt-1 flex items-center justify-center gap-0.5 truncate text-[9.5px] text-ink-soft">
                {displayRoles(m.role, { isClubLeader: m.isOwner }).map((r) => (
                  <span key={r} className="leading-none" title={roleBadge(r)?.label}>
                    {roleBadge(r)?.emoji}
                  </span>
                ))}
                {/* 메달 모드에선 이름이 여기 한 번만 나오고, 사진 모드에선 위에 이미 나왔으니 생략 */}
                {FEATURES.archetype && <span className="truncate">{m.nickname ?? "탈퇴한 멤버"}</span>}
              </div>
            </button>
          );
        })}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="rounded-2xl border-[1.5px] border-dashed border-sky-line bg-white/35 px-1.5 pb-2 pt-3 text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-sky-line bg-white/40 text-xl text-ink-faint">
              🕊️
            </div>
            <div className="mt-1 text-[12px] font-bold text-ink-soft">함께할 자리</div>
            <div className="text-[10px] text-ink-faint">기다리고 있어요</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/85 bg-gradient-to-r from-gold/10 to-teal/10 px-4 py-3 text-[11.5px] leading-relaxed text-ink">
        💛 {isFull
          ? "라인업이 가득 찼어요 — 모두가 한 몸으로 세워가는 중이에요."
          : FEATURES.archetype
            ? "당신이 어떤 유형이든 상관 없어요. 이 빈자리는 모두의 자리예요."
            : "누구든 환영이에요. 이 빈자리는 모두의 자리예요."}
      </div>

      {open && <ArchetypeModal archetype={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
