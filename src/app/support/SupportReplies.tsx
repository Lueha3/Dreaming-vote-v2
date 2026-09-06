"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import { timeAgo } from "@/lib/time";
import type { SupportReplyItem } from "./types";

type ListResponse = { ok: true; items: SupportReplyItem[] };

/**
 * 고객센터 답글 스레드 — 펼침 시 마운트되어 목록을 로드한다.
 * 광장 댓글(PlazaComments)과 달리 답글은 운영진만 작성하고, 대댓글·수정 기능이 없다
 * (요구사항: "답글은 운영진에 한해서 달 수 있어야해" — 회원 간 댓글 개념 자체가 없다).
 */
export function SupportReplies({
  ticketId,
  isStaff,
  onCountChange,
}: {
  ticketId: string;
  isStaff: boolean;
  onCountChange: (delta: number) => void;
}) {
  const [items, setItems] = useState<SupportReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<ListResponse>(`/api/support/${ticketId}/replies`);
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await fetchJson(`/api/support/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      setContent("");
      onCountChange(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "답글을 올리지 못했어요.");
    }
    setPosting(false);
  }

  async function remove(replyId: string) {
    setItems((prev) => prev.filter((r) => r.id !== replyId));
    onCountChange(-1);
    try {
      await fetchJson(`/api/support/${ticketId}/replies/${replyId}`, { method: "DELETE" });
    } catch {
      onCountChange(1);
      await load(); // 실패 시 원복
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-sky-line pt-3">
      {loading ? (
        <p className="text-xs text-ink-faint">답글을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-faint">
          {isStaff ? "아직 답글이 없어요. 첫 답글을 남겨보세요." : "아직 운영진 답글이 없어요."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border border-skyx/25 bg-skyx/[0.06] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="rounded-full bg-skyx/20 px-2 py-0.5 text-[10px] font-bold text-skyx-ink">
                    🎧 {r.staffName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">
                    · {timeAgo(r.createdAt)}
                  </span>
                </div>
                {r.canDelete && (
                  <button
                    onClick={() => remove(r.id)}
                    className="shrink-0 text-xs text-ink-faint transition-colors hover:text-red-500"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {r.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* 답글 작성 — 운영진만. 회원은 문의에 회신을 달 수 없다(새 문의를 새로 남긴다). */}
      {isStaff && (
        <form onSubmit={handlePost} className="flex items-end gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="운영진 답글 달기..."
            className="min-w-0 flex-1 resize-none rounded-2xl border border-white/95 bg-white/70 px-4 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={!content.trim() || posting}
            className="btn-gold shrink-0 rounded-full px-4 py-2 text-xs disabled:opacity-40"
          >
            {posting ? "..." : "답글"}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
