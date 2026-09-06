"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import { ClubCategoryIcon } from "@/components/icons";

type ManageClub = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  maxMembers: number | null;
  isApproved: boolean;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  ownerNickname: string | null;
  applicationCount: number;
  images: { url: string; caption: string }[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul", // 전 표면 날짜 표시 일치(KST)
  });
}

type EventBoardStatus = { exists: boolean; clubId: string | null; name: string | null; memberCount: number };

export default function ManageClubsPage() {
  const [items, setItems] = useState<ManageClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const [eventBoard, setEventBoard] = useState<EventBoardStatus | null>(null);
  const [eventBoardBusy, setEventBoardBusy] = useState(false);

  useEffect(() => {
    load();
    loadEventBoard();
  }, []);

  async function loadEventBoard() {
    try {
      const data = await fetchJson<{ ok: true } & EventBoardStatus>("/api/manage/events/setup");
      setEventBoard(data);
    } catch {
      /* ignore */
    }
  }

  async function setupEventBoard() {
    setEventBoardBusy(true);
    try {
      await fetchJson("/api/manage/events/setup", { method: "POST" });
      await loadEventBoard();
    } catch {
      /* ignore */
    } finally {
      setEventBoardBusy(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await fetchJson<{ ok: true; items: ManageClub[] }>("/api/admin/clubs");
      setItems(data.items ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await fetchJson(`/api/admin/clubs/${id}/${action}`, { method: "POST" });
      await load();
    } catch {
      /* ignore */
    }
    setBusyId(null);
  }

  const pendingCount = items.filter((i) => !i.isApproved).length;
  const visible = filter === "pending" ? items.filter((i) => !i.isApproved) : items;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        유저가 개설한 동아리를 검토하고 노출 여부를 결정합니다.
      </p>

      {/* 청년부 전체 행사 보드 — 시스템 동아리 설정 */}
      <div className="glass-card mb-5 p-4">
        <p className="mb-1 text-sm font-semibold text-ink">📅 청년부 전체 행사 보드</p>
        {eventBoard?.exists ? (
          <>
            <p className="mb-3 text-xs leading-relaxed text-ink-soft">
              운영 중이에요. 승인 멤버 {eventBoard.memberCount}명이 자동으로 참여하고 있어요.
              모임은 동아리 상세 페이지에서 등록해요.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/clubs/${eventBoard.clubId}`}
                className="glass-soft rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
              >
                보드 열기 →
              </a>
              <button
                onClick={setupEventBoard}
                disabled={eventBoardBusy}
                className="glass-soft rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
              >
                {eventBoardBusy ? "동기화 중…" : "승인 멤버 다시 동기화"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-ink-soft">
              아직 만들어지지 않았어요. 만들면 승인 멤버 전원이 자동으로 참여하고, 홈 화면
              &apos;다가오는 모임&apos;에 전체 행사가 함께 표시돼요.
            </p>
            <button
              onClick={setupEventBoard}
              disabled={eventBoardBusy}
              className="btn-gold rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {eventBoardBusy ? "만드는 중…" : "만들기"}
            </button>
          </>
        )}
      </div>

      {/* 필터 */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => setFilter("pending")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            filter === "pending"
              ? "bg-gold/15 text-gold-ink ring-1 ring-gold/40"
              : "glass-soft text-ink-soft hover:text-ink"
          }`}
        >
          승인 대기
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 text-xs text-gold-ink">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            filter === "all"
              ? "bg-skyx/15 text-skyx-ink ring-1 ring-skyx/40"
              : "glass-soft text-ink-soft hover:text-ink"
          }`}
        >
          전체 ({items.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="glass-card animate-pulse p-5">
              <div className="mb-3 h-4 w-32 rounded bg-ink/5" />
              <div className="mb-2 h-3 w-full rounded bg-ink/5" />
              <div className="h-3 w-3/4 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center text-sm text-ink-soft">
          {filter === "pending"
            ? "승인 대기 중인 동아리가 없어요."
            : "등록된 동아리가 없어요."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((club) => (
            <li
              key={club.id}
              className={`glass-card p-5 transition-all ${
                !club.isApproved
                  ? "ring-1 ring-gold/30"
                  : club.isActive
                    ? ""
                    : "opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                      <ClubCategoryIcon category={club.category} className="h-4 w-4 shrink-0" />
                      {club.name}
                    </span>
                    <span className="rounded-full border border-sky-line bg-white/60 px-2 py-0.5 text-xs text-ink-soft">
                      {club.category}
                    </span>
                    {!club.isApproved ? (
                      <span className="rounded-full border border-gold/35 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold-ink">
                        승인 대기
                      </span>
                    ) : club.isActive ? (
                      <span className="rounded-full border border-teal/35 bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal-ink">
                        노출 중
                      </span>
                    ) : (
                      <span className="glass-soft rounded-full px-2 py-0.5 text-xs font-medium text-ink-faint">
                        숨김
                      </span>
                    )}
                  </div>

                  {club.images?.length > 0 && (
                    <div className="mb-3 flex gap-1.5">
                      {club.images.slice(0, 5).map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" key={i}
                          src={img.url}
                          alt={img.caption || `카드 ${i + 1}`}
                          className="h-14 w-14 rounded-lg border border-sky-line object-cover"
                        />
                      ))}
                      {club.images.length > 5 && (
                        <div className="glass-soft flex h-14 w-14 items-center justify-center rounded-lg text-xs text-ink-faint">
                          +{club.images.length - 5}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mb-2 line-clamp-2 text-sm text-ink-soft">{club.description}</p>

                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {club.tags
                      .split(/[,，、]/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 8)
                      .map((t, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-skyx/25 bg-skyx/10 px-2 py-0.5 text-xs text-skyx-ink"
                        >
                          {t}
                        </span>
                      ))}
                  </div>

                  <p className="text-xs text-ink-faint">
                    개설자 {club.ownerNickname ?? "탈퇴한 멤버"} · 신청 {club.applicationCount}건 ·{" "}
                    {club.maxMembers ? `정원 ${club.maxMembers}명 · ` : ""}
                    {fmtDate(club.createdAt)}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {!club.isApproved || !club.isActive ? (
                    <button
                      onClick={() => act(club.id, "approve")}
                      disabled={busyId === club.id}
                      className="rounded-full border border-teal/40 bg-teal/10 px-3 py-1.5 text-xs font-medium text-teal-ink transition-all hover:bg-teal/20 disabled:opacity-50"
                    >
                      {busyId === club.id ? "처리 중…" : "승인"}
                    </button>
                  ) : null}
                  {club.isApproved && club.isActive ? (
                    <button
                      onClick={() => act(club.id, "reject")}
                      disabled={busyId === club.id}
                      className="glass-soft rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft transition-all hover:text-red-600 disabled:opacity-50"
                    >
                      {busyId === club.id ? "처리 중…" : "숨김"}
                    </button>
                  ) : (
                    <button
                      onClick={() => act(club.id, "reject")}
                      disabled={busyId === club.id}
                      className="glass-soft rounded-full px-3 py-1.5 text-xs font-medium text-ink-faint transition-all hover:text-red-600 disabled:opacity-50"
                    >
                      반려
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
