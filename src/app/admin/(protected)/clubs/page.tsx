"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import { ClubCategoryIcon } from "@/components/icons";

type AdminClub = {
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

export default function AdminClubsPage() {
  const [items, setItems] = useState<AdminClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchJson<{ ok: true; items: AdminClub[] }>("/api/admin/clubs");
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
      {/* 헤더 */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">동아리 승인</h2>
        <p className="mt-1 text-sm text-zinc-500">
          유저가 개설한 동아리를 검토하고 노출 여부를 결정합니다.
        </p>
      </div>

      {/* 필터 탭 */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => setFilter("pending")}
          className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
            filter === "pending"
              ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40"
              : "bg-white/5 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          승인 대기
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
            filter === "all"
              ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40"
              : "bg-white/5 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          전체 ({items.length})
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-white/[0.07] bg-[#111111] p-5"
            >
              <div className="mb-3 h-4 w-32 rounded bg-white/5" />
              <div className="mb-2 h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-3/4 rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#111111] px-8 py-14 text-center">
          <p className="text-zinc-400">
            {filter === "pending" ? "승인 대기 중인 동아리가 없습니다." : "등록된 동아리가 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((club) => (
            <li
              key={club.id}
              className={`rounded-2xl border bg-[#111111] p-5 transition-all ${
                !club.isApproved
                  ? "border-amber-500/30 bg-amber-500/[0.03]"
                  : club.isActive
                    ? "border-emerald-500/25"
                    : "border-white/[0.07] opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* 이름 + 상태 */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                      <ClubCategoryIcon category={club.category} tone="inherit" className="h-4 w-4 shrink-0" />
                      {club.name}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
                      {club.category}
                    </span>
                    {!club.isApproved ? (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                        승인 대기
                      </span>
                    ) : club.isActive ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        노출 중
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-600/40 bg-zinc-700/20 px-2 py-0.5 text-xs font-medium text-zinc-400">
                        숨김
                      </span>
                    )}
                  </div>

                  {/* 카드뉴스 썸네일 */}
                  {club.images?.length > 0 && (
                    <div className="mb-3 flex gap-1.5">
                      {club.images.slice(0, 5).map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" key={i}
                          src={img.url}
                          alt={img.caption || `카드 ${i + 1}`}
                          className="h-14 w-14 rounded-lg object-cover border border-white/10"
                        />
                      ))}
                      {club.images.length > 5 && (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-zinc-400">
                          +{club.images.length - 5}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mb-2 line-clamp-2 text-sm text-zinc-400">{club.description}</p>

                  {/* 키워드 */}
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {club.tags
                      .split(/[,，、]/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 8)
                      .map((t, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400"
                        >
                          {t}
                        </span>
                      ))}
                  </div>

                  <p className="text-xs text-zinc-600">
                    개설자 {club.ownerNickname ?? "탈퇴한 멤버"} · 신청 {club.applicationCount}건 ·{" "}
                    {club.maxMembers ? `정원 ${club.maxMembers}명 · ` : ""}
                    {new Date(club.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </p>
                </div>

                {/* 액션 버튼 */}
                <div className="flex flex-col gap-2">
                  {!club.isApproved || !club.isActive ? (
                    <button
                      onClick={() => act(club.id, "approve")}
                      disabled={busyId === club.id}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      {busyId === club.id ? "처리 중..." : "승인"}
                    </button>
                  ) : null}
                  {club.isApproved && club.isActive ? (
                    <button
                      onClick={() => act(club.id, "reject")}
                      disabled={busyId === club.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-all hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                    >
                      {busyId === club.id ? "처리 중..." : "숨김"}
                    </button>
                  ) : (
                    <button
                      onClick={() => act(club.id, "reject")}
                      disabled={busyId === club.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-all hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
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
