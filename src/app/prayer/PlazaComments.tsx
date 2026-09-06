"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchJson } from "@/lib/http";
import { RoleBadge } from "@/components/RoleBadge";
import { NewcomerBadge } from "@/components/NewcomerBadge";
import { ReportButton } from "@/components/ReportButton";
import { useProfilePeek } from "@/components/ProfilePeek";
import { displayRoles, type Role } from "@/lib/roles";
import { timeAgo, isEdited } from "@/lib/time";

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: Role | null;
  isNewcomer: boolean;
  isMine: boolean;
  canDelete: boolean;
  canEdit: boolean;
  likeCount: number;
  iLiked: boolean;
};

type TopComment = CommentItem & { replies: CommentItem[] };

type ListResponse = { ok: true; items: TopComment[]; loggedIn: boolean };

/**
 * 최상위 댓글과 답글이 서로 다른 깊이에 있어, 한 건을 고치려면 어느 쪽인지 알아야 한다.
 * parentId가 있으면 그 부모의 replies 안에서, 없으면 최상위에서 찾아 patch를 적용한다.
 * (수정·좋아요 낙관적 갱신이 같은 자리를 짚도록 한 곳에 모아둔다.)
 */
function patchComment(
  items: TopComment[],
  id: string,
  parentId: string | undefined,
  patch: (c: CommentItem) => CommentItem,
): TopComment[] {
  return items.map((p) => {
    if (parentId) {
      if (p.id !== parentId) return p;
      return { ...p, replies: p.replies.map((r) => (r.id === id ? patch(r) : r)) };
    }
    // 최상위는 replies를 함께 들고 있으므로 patch 결과를 덮어씌워 replies가 날아가지 않게 한다.
    return p.id === id ? { ...p, ...patch(p) } : p;
  });
}

/** 엔터 = 줄바꿈만, 전송은 버튼으로만 — textarea + form이므로 Enter가 자동 submit하지 않는다. */
function CommentComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  submitLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        maxLength={500}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 resize-none rounded-2xl border border-white/95 bg-white/70 px-4 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled}
        className="btn-gold shrink-0 rounded-full px-4 py-2 text-xs disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function CommentRow({
  comment,
  loggedIn,
  onDelete,
  onEdit,
  onReply,
  onToggleLike,
}: {
  comment: CommentItem;
  loggedIn: boolean;
  onDelete: () => void;
  onEdit: (content: string) => void;
  onReply?: () => void;
  onToggleLike: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const { open: openPeek } = useProfilePeek();

  const canReport = loggedIn && !comment.isMine;
  const hasMoreActions = comment.canEdit || canReport || comment.canDelete;

  // 외부 클릭 시 ⋯ 메뉴 닫기 (PlazaPostCard·Header 햄버거와 동일한 패턴)
  useEffect(() => {
    if (!moreOpen) return;
    function handle(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [moreOpen]);

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => openPeek(comment.authorId)}
        aria-label={`${comment.authorName} 프로필 보기`}
        className="mt-0.5 shrink-0"
      >
        {comment.authorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={comment.authorAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-skyx/20 text-[10px] text-skyx-ink">
            {comment.authorName[0]}
          </div>
        )}
      </button>
      <div className="min-w-0 flex-1">
        {/* ⋯는 wrap 컨테이너 '밖'에 둔다 — 안에 두면 닉네임·배지가 길 때 함께 밀려
            혼자 다음 줄로 떨어진다(PlazaPostCard 헤더와 같은 구조). */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-ink">{comment.authorName}</span>
            {displayRoles(comment.authorRole).map((r) => (
              <RoleBadge key={r} role={r} size="sm" />
            ))}
            {comment.isNewcomer && <NewcomerBadge size="sm" />}
            <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">
              · {timeAgo(comment.createdAt)}
            </span>
            {isEdited(comment.createdAt, comment.updatedAt) && (
              <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">· 수정됨</span>
            )}
          </div>
          {hasMoreActions && (
            <div className="relative shrink-0" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-label="댓글 더보기"
                aria-haspopup="true"
                aria-expanded={moreOpen}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-white/70 hover:text-ink"
              >
                ⋯
              </button>
              {moreOpen && (
                <div
                  className="glass-card absolute right-0 top-[calc(100%+0.25rem)] z-10 w-36 overflow-hidden p-1.5"
                  style={{ background: "rgba(255,255,255,.96)" }}
                >
                  {comment.canEdit && !editing && (
                    <button
                      onClick={() => { setMoreOpen(false); setEditContent(comment.content); setEditing(true); }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-ink-soft hover:bg-white/80 hover:text-ink"
                    >
                      ✏️ 수정
                    </button>
                  )}
                  {canReport && !reported && (
                    <button
                      onClick={() => { setMoreOpen(false); setReportOpen(true); }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-ink-soft hover:bg-white/80 hover:text-ink"
                    >
                      🚨 신고
                    </button>
                  )}
                  {comment.canDelete && (
                    <button
                      onClick={() => { setMoreOpen(false); setConfirmDelete(true); }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50"
                    >
                      🗑 삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={2}
              maxLength={500}
              autoFocus
              className="w-full resize-none rounded-xl border border-white/95 bg-white/70 px-3 py-2 text-sm leading-relaxed text-ink focus:border-teal focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { onEdit(editContent); setEditing(false); }}
                disabled={!editContent.trim()}
                className="btn-gold rounded-full px-3.5 py-1 text-xs disabled:opacity-40"
              >
                저장
              </button>
              <button
                onClick={() => setEditing(false)}
                className="glass-soft rounded-full px-3.5 py-1 text-xs text-ink-soft hover:text-ink"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
            {comment.content}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={onToggleLike}
            disabled={!loggedIn}
            aria-pressed={comment.iLiked}
            aria-label={comment.iLiked ? "좋아요 취소" : "좋아요"}
            /* -my-1.5 py-1.5 — 손가락이 닿는 영역만 위아래로 넓히고 줄 높이는 그대로 둔다.
               text-xs 글자 높이(약 16px)만으로는 모바일에서 정확히 겨누기 어렵다. */
            className={`-my-1.5 flex items-center gap-1 py-1.5 text-xs transition-colors disabled:opacity-40 ${
              comment.iLiked ? "text-rose-500" : "text-ink-faint hover:text-rose-400"
            }`}
          >
            <span aria-hidden>{comment.iLiked ? "❤️" : "🤍"}</span>
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>
          {onReply && (
            <button onClick={onReply} className="text-xs text-ink-faint transition-colors hover:text-skyx-ink">
              답글
            </button>
          )}
          {/* 접수 확인 — ReportButton은 제출 직후 걷히므로 자체 '신고 접수됨'을 띄우지 못한다.
              이게 없으면 신고가 들어갔는지 알 길이 없어 같은 글을 또 신고하게 된다. */}
          {reported && <span className="text-xs text-ink-faint">신고 접수됨</span>}
        </div>

        {/* 삭제 확인 — ⋯ 메뉴의 '삭제'로 진입. 메뉴 클릭 한 번에 바로 지워지지 않게 한 단계 둔다. */}
        {confirmDelete && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            <span className="text-ink-soft">삭제할까요?</span>
            <button
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              className="font-medium text-red-500 hover:text-red-400"
            >
              예
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-ink-faint hover:text-ink">
              취소
            </button>
          </div>
        )}

        {/* 신고 — ⋯ 메뉴의 '신고'로 진입 */}
        {reportOpen && (
          <ReportButton
            targetType="comment"
            targetId={comment.id}
            forceOpen
            onSubmitted={() => setReported(true)}
            onClose={() => setReportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 광장 글 댓글 — 펼침 시 마운트되어 목록을 로드한다. 답글(대댓글)은 단일 깊이로 부모 아래 표시.
 * 작성/삭제 후 onCountChange로 부모의 댓글 수 배지를 동기화.
 */
export function PlazaComments({
  postId,
  loggedIn,
  onCountChange,
}: {
  postId: string;
  loggedIn: boolean;
  onCountChange: (delta: number) => void;
}) {
  const [items, setItems] = useState<TopComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needJoin, setNeedJoin] = useState(false);
  // 좋아요 요청이 떠 있는 댓글 id — 렌더에 쓰이지 않으므로 state가 아니라 ref다.
  const likingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<ListResponse>(`/api/prayers/${postId}/comments`);
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    setNeedJoin(false);
    try {
      await fetchJson(`/api/prayers/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      setContent("");
      onCountChange(1);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "membership_required") setNeedJoin(true);
      setError(err instanceof Error ? err.message : "댓글을 올리지 못했어요.");
    }
    setPosting(false);
  }

  async function handleReply(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    const text = replyContent.trim();
    if (!text || replyPosting) return;
    setReplyPosting(true);
    setError(null);
    setNeedJoin(false);
    try {
      await fetchJson(`/api/prayers/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId }),
      });
      setReplyContent("");
      setReplyingTo(null);
      onCountChange(1);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "membership_required") setNeedJoin(true);
      setError(err instanceof Error ? err.message : "답글을 올리지 못했어요.");
    }
    setReplyPosting(false);
  }

  async function editComment(c: CommentItem, content: string, parentId?: string) {
    const trimmed = content.trim();
    const prev = c.content;
    // 낙관적 갱신 — 실패 시 원복
    setItems((items) => patchComment(items, c.id, parentId, (x) => ({ ...x, content: trimmed })));
    try {
      await fetchJson(`/api/prayers/${postId}/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      await load();
    } catch (err) {
      setItems((items) => patchComment(items, c.id, parentId, (x) => ({ ...x, content: prev })));
      setError(err instanceof Error ? err.message : "댓글을 수정하지 못했어요.");
    }
  }

  /**
   * 좋아요 토글 — 탭 즉시 하트가 반응하도록 낙관적으로 바꾸고, 서버가 준 확정값으로 덮는다.
   * 서버 응답을 그대로 쓰므로 다른 사람이 그 사이 누른 개수도 함께 맞춰진다.
   *
   * 같은 댓글의 요청이 겹치면 무시한다. 연타로 POST가 두 번 날아가면 "생성"과 "삭제"가
   * 각각 자기 시점의 확정값을 들고 돌아오는데, 응답이 도착 순서를 보장하지 않아 늦게 온
   * 옛 응답이 최신 상태를 덮어쓸 수 있다(하트가 눌린 채로 남거나 그 반대).
   */
  async function toggleLike(c: CommentItem, parentId?: string) {
    if (likingRef.current.has(c.id)) return;
    likingRef.current.add(c.id);
    const next = !c.iLiked;
    setItems((items) =>
      patchComment(items, c.id, parentId, (x) => ({
        ...x,
        iLiked: next,
        likeCount: Math.max(0, x.likeCount + (next ? 1 : -1)),
      })),
    );
    try {
      const res = await fetchJson<{ ok: true; iLiked: boolean; likeCount: number }>(
        `/api/prayers/${postId}/comments/${c.id}/like`,
        { method: "POST" },
      );
      setItems((items) =>
        patchComment(items, c.id, parentId, (x) => ({
          ...x,
          iLiked: res.iLiked,
          likeCount: res.likeCount,
        })),
      );
    } catch (err) {
      setItems((items) =>
        patchComment(items, c.id, parentId, (x) => ({
          ...x,
          iLiked: c.iLiked,
          likeCount: c.likeCount,
        })),
      );
      setError(err instanceof Error ? err.message : "좋아요를 처리하지 못했어요.");
    } finally {
      likingRef.current.delete(c.id);
    }
  }

  async function remove(c: CommentItem & { replies?: CommentItem[] }, parentId?: string) {
    const delta = -(1 + (c.replies?.length ?? 0));
    // 낙관적 제거 — 부모 삭제 시 그 아래 답글도 함께 사라진다.
    setItems((prev) => {
      if (parentId) {
        return prev.map((p) =>
          p.id === parentId ? { ...p, replies: p.replies.filter((r) => r.id !== c.id) } : p,
        );
      }
      return prev.filter((x) => x.id !== c.id);
    });
    onCountChange(delta);
    try {
      await fetchJson(`/api/prayers/${postId}/comments/${c.id}`, { method: "DELETE" });
    } catch {
      onCountChange(-delta);
      await load(); // 실패 시 원복
    }
  }

  function startReply(commentId: string) {
    setReplyingTo((prev) => (prev === commentId ? null : commentId));
    setReplyContent("");
  }

  return (
    <div className="mt-3 space-y-3 border-t border-sky-line pt-3">
      {loading ? (
        <p className="text-xs text-ink-faint">댓글을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-faint">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id}>
              <CommentRow
                comment={c}
                loggedIn={loggedIn}
                onDelete={() => remove(c)}
                onEdit={(content) => editComment(c, content)}
                onReply={loggedIn ? () => startReply(c.id) : undefined}
                onToggleLike={() => toggleLike(c)}
              />

              {c.replies.length > 0 && (
                <ul className="mt-2 ml-8 space-y-2.5 border-l border-sky-line pl-3">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <CommentRow
                        comment={r}
                        loggedIn={loggedIn}
                        onDelete={() => remove(r, c.id)}
                        onEdit={(content) => editComment(r, content, c.id)}
                        onToggleLike={() => toggleLike(r, c.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {replyingTo === c.id && (
                <div className="mt-2 ml-8">
                  <CommentComposer
                    value={replyContent}
                    onChange={setReplyContent}
                    onSubmit={(e) => handleReply(e, c.id)}
                    disabled={!replyContent.trim() || replyPosting}
                    placeholder="답글 달기..."
                    submitLabel={replyPosting ? "..." : "등록"}
                    autoFocus
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {loggedIn && (
        <CommentComposer
          value={content}
          onChange={setContent}
          onSubmit={handlePost}
          disabled={!content.trim() || posting}
          placeholder="댓글 달기..."
          submitLabel={posting ? "..." : "등록"}
        />
      )}
      {error && (
        <p className="text-xs text-red-500">
          {error}
          {needJoin && (
            <a href="/join" className="ml-1.5 font-semibold text-gold-ink underline underline-offset-2">
              가입 신청하러 가기 →
            </a>
          )}
        </p>
      )}
    </div>
  );
}
