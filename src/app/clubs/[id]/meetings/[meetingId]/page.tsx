"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClubImageUploader, type ClubImageItem } from "@/components/ClubImageUploader";
import { ClubImageCarousel } from "@/components/ClubImageCarousel";
import { RoleBadge } from "@/components/RoleBadge";
import { displayRoles, type Role } from "@/lib/roles";
import { isEdited } from "@/lib/time";

type PageProps = {
  params: Promise<{ id: string; meetingId: string }> | { id: string; meetingId: string };
};

type MeetingDetail = {
  id: string;
  title: string;
  meetsAt: string;
  place: string;
  items: string | null;
  fee: string | null;
  note: string | null;
};

type ReviewItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorNickname: string | null;
  authorAvatarUrl: string | null;
  authorRole: Role | null;
  canDelete: boolean;
  canEdit: boolean;
};

type ImageItem = { id: string; url: string; caption: string; canDelete: boolean };

type RsvpData = {
  myStatus: "going" | "maybe" | null;
  goingCount: number;
  maybeCount: number;
  going: { nickname: string | null; avatarUrl: string | null }[];
};

type DetailResponse = {
  ok: true;
  isOwner: boolean;
  isMember: boolean;
  meeting: MeetingDetail;
  reviews: ReviewItem[];
  images: ImageItem[];
  rsvp: RsvpData;
};

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function fmtReviewTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetingDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [ids, setIds] = useState<{ id: string; meetingId: string } | null>(null);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errState, setErrState] = useState<"notfound" | "member_only" | null>(null);

  // 후기 작성
  const [reviewText, setReviewText] = useState("");
  const [postingReview, setPostingReview] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editReviewText, setEditReviewText] = useState("");
  const [savingReviewEdit, setSavingReviewEdit] = useState(false);

  // 갤러리
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [pending, setPending] = useState<ClubImageItem[]>([]);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [savingImages, setSavingImages] = useState(false);
  const [imageErr, setImageErr] = useState<string | null>(null);

  // 개설자 수정/삭제
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ title: "", meetsAt: "", place: "", items: "", fee: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 참석(RSVP)
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [rsvpErr, setRsvpErr] = useState<string | null>(null);

  useEffect(() => {
    const resolve = async () => {
      const r = params instanceof Promise ? await params : params;
      setIds({ id: r.id, meetingId: r.meetingId });
    };
    resolve();
  }, [params]);

  async function load(id: string, meetingId: string, opts?: { silent?: boolean }) {
    try {
      const res = await fetch(`/api/clubs/${id}/meetings/${meetingId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setData(json);
        setErrState(null);
      } else if (json.code === "member_only") {
        setErrState("member_only");
      } else if (!opts?.silent) {
        // 이미 로드된 화면에서의 갱신(silent) 실패는 전체를 not-found로 갈아엎지 않는다.
        setErrState("notfound");
      }
    } catch {
      if (!opts?.silent) setErrState("notfound");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!ids) return;
    load(ids.id, ids.meetingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  async function setRsvp(status: "going" | "maybe" | "none") {
    if (!ids || rsvpBusy) return;
    setRsvpBusy(true);
    setRsvpErr(null);
    try {
      const res = await fetch(`/api/clubs/${ids.id}/meetings/${ids.meetingId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setRsvpErr(
          res.status === 429
            ? "요청이 잦아요. 잠시 후 다시 시도해주세요."
            : json?.error ?? "참석 표시에 실패했어요.",
        );
      } else {
        // 참석 카운트·아바타 갱신. silent — 갱신 실패해도 현재 화면을 유지(not-found로 안 바뀜).
        await load(ids.id, ids.meetingId, { silent: true });
      }
    } catch {
      setRsvpErr("네트워크 오류. 잠시 후 다시 시도해주세요.");
    }
    setRsvpBusy(false);
  }

  async function submitReview() {
    if (!ids || !reviewText.trim()) return;
    setPostingReview(true);
    setReviewErr(null);
    try {
      const res = await fetch(`/api/clubs/${ids.id}/meetings/${ids.meetingId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reviewText.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setReviewErr(json.error ?? "작성에 실패했어요.");
        return;
      }
      setReviewText("");
      await load(ids.id, ids.meetingId);
    } catch {
      setReviewErr("네트워크 오류. 잠시 후 다시 시도해주세요.");
    } finally {
      setPostingReview(false);
    }
  }

  async function deleteReview(reviewId: string) {
    if (!ids) return;
    setDeletingReviewId(reviewId);
    try {
      const res = await fetch(
        `/api/clubs/${ids.id}/meetings/${ids.meetingId}/reviews/${reviewId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (res.ok && json.ok) await load(ids.id, ids.meetingId);
    } catch {
      /* ignore */
    } finally {
      setDeletingReviewId(null);
    }
  }

  function startEditReview(r: ReviewItem) {
    setEditingReviewId(r.id);
    setEditReviewText(r.content);
  }

  async function saveReviewEdit(reviewId: string) {
    if (!ids || !editReviewText.trim()) return;
    setSavingReviewEdit(true);
    try {
      const res = await fetch(
        `/api/clubs/${ids.id}/meetings/${ids.meetingId}/reviews/${reviewId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editReviewText.trim() }),
        },
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        setEditingReviewId(null);
        await load(ids.id, ids.meetingId);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingReviewEdit(false);
    }
  }

  async function saveImages() {
    if (!ids || pending.length === 0) return;
    setSavingImages(true);
    setImageErr(null);
    try {
      const res = await fetch(`/api/clubs/${ids.id}/meetings/${ids.meetingId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: pending.map((p) => ({ url: p.url, caption: p.caption })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setImageErr(json.error ?? "사진 등록에 실패했어요.");
        return;
      }
      setPending([]);
      setUploaderOpen(false);
      setUploaderKey((k) => k + 1);
      await load(ids.id, ids.meetingId);
    } catch {
      setImageErr("네트워크 오류. 잠시 후 다시 시도해주세요.");
    } finally {
      setSavingImages(false);
    }
  }

  async function deleteImage(imageId: string) {
    if (!ids) return;
    try {
      const res = await fetch(
        `/api/clubs/${ids.id}/meetings/${ids.meetingId}/images/${imageId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        setLightbox(null);
        await load(ids.id, ids.meetingId);
      }
    } catch {
      /* ignore */
    }
  }

  function openEdit() {
    if (!data) return;
    const m = data.meeting;
    setEf({
      title: m.title,
      meetsAt: toLocalInput(m.meetsAt),
      place: m.place,
      items: m.items ?? "",
      fee: m.fee ?? "",
      note: m.note ?? "",
    });
    setEditErr(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!ids) return;
    if (!ef.meetsAt || !ef.place.trim()) {
      setEditErr("일시와 장소는 꼭 입력해주세요.");
      return;
    }
    setSavingEdit(true);
    setEditErr(null);
    try {
      const res = await fetch(`/api/clubs/${ids.id}/meetings/${ids.meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ef.title.trim() || "정기 모임",
          meetsAt: new Date(ef.meetsAt).toISOString(),
          place: ef.place.trim(),
          items: ef.items.trim() || null,
          fee: ef.fee.trim() || null,
          note: ef.note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setEditErr(json.error ?? "수정에 실패했어요.");
        return;
      }
      setEditing(false);
      await load(ids.id, ids.meetingId);
    } catch {
      setEditErr("네트워크 오류. 잠시 후 다시 시도해주세요.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMeeting() {
    if (!ids) return;
    try {
      const res = await fetch(`/api/clubs/${ids.id}/meetings/${ids.meetingId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.ok) router.push(`/clubs/${ids.id}`);
    } catch {
      /* ignore */
    }
  }

  const backHref = ids ? `/clubs/${ids.id}` : "/clubs";

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <main className="relative mx-auto max-w-2xl px-4 py-14">
          <div className="h-6 w-24 animate-pulse rounded bg-white/55" />
          <div className="glass-card mt-6 h-48 animate-pulse" />
        </main>
      </div>
    );
  }

  if (errState === "member_only") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div className="relative px-6 text-center">
          <div className="mb-5 text-5xl">🔒</div>
          <h2 className="mb-2 text-xl font-bold text-ink">멤버에게만 공개돼요</h2>
          <p className="mb-7 text-sm text-ink-soft">
            모임 일정·후기·사진은 동아리 멤버만 볼 수 있어요.
          </p>
          <Link href={backHref} className="btn-gold inline-block rounded-full px-6 py-3 text-sm">
            동아리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (errState === "notfound" || !data) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div className="relative px-6 text-center">
          <div className="mb-5 text-5xl">🔍</div>
          <h2 className="mb-2 text-xl font-bold text-ink">모임을 찾을 수 없어요</h2>
          <p className="mb-7 text-sm text-ink-soft">삭제되었거나 잘못된 주소일 수 있어요.</p>
          <Link href={backHref} className="btn-gold inline-block rounded-full px-6 py-3 text-sm">
            동아리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const { meeting, reviews, images, isOwner } = data;
  const isPast = new Date(meeting.meetsAt).getTime() < Date.now();

  return (
    <div className="relative min-h-screen overflow-hidden pb-16">
      <main className="relative mx-auto max-w-2xl px-4 py-8">
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between">
          <Link
            href={backHref}
            className="text-xs font-medium text-ink-faint transition-colors hover:text-skyx-ink"
          >
            ← 동아리로
          </Link>
          {isOwner && !editing && (
            <div className="flex gap-2">
              <button
                onClick={openEdit}
                className="glass-soft rounded-full px-3 py-1 text-xs text-ink-soft transition-colors hover:text-ink"
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 transition-colors hover:bg-red-100"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        {/* ① 일정 카드 */}
        {editing ? (
          <div className="glass-card glass-ribbon relative mb-6 space-y-3 overflow-hidden p-5 sm:p-6">
            <p className="text-sm font-bold text-ink">모임 공지 수정</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="모임명">
                <input
                  type="text"
                  value={ef.title}
                  onChange={(e) => setEf((s) => ({ ...s, title: e.target.value }))}
                  maxLength={60}
                  className={INPUT}
                />
              </Field>
              <Field label="일시 *">
                <input
                  type="datetime-local"
                  value={ef.meetsAt}
                  onChange={(e) => setEf((s) => ({ ...s, meetsAt: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field label="장소 *">
                <input
                  type="text"
                  value={ef.place}
                  onChange={(e) => setEf((s) => ({ ...s, place: e.target.value }))}
                  maxLength={100}
                  className={INPUT}
                />
              </Field>
              <Field label="회비">
                <input
                  type="text"
                  value={ef.fee}
                  onChange={(e) => setEf((s) => ({ ...s, fee: e.target.value }))}
                  maxLength={50}
                  className={INPUT}
                />
              </Field>
            </div>
            <Field label="준비물">
              <input
                type="text"
                value={ef.items}
                onChange={(e) => setEf((s) => ({ ...s, items: e.target.value }))}
                maxLength={200}
                className={INPUT}
              />
            </Field>
            <Field label="일정·안내">
              <textarea
                value={ef.note}
                onChange={(e) => setEf((s) => ({ ...s, note: e.target.value }))}
                rows={3}
                maxLength={1000}
                className={INPUT}
              />
            </Field>
            {editErr && <p className="text-xs text-red-500">{editErr}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="glass-soft rounded-full px-4 py-2 text-xs text-ink-soft hover:text-ink"
              >
                취소
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="btn-gold rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
              >
                {savingEdit ? "저장 중…" : "수정 저장"}
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-card glass-ribbon relative mb-6 overflow-hidden p-6 sm:p-7">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  isPast
                    ? "glass-soft text-ink-faint"
                    : "border border-teal/35 bg-teal/10 text-teal-ink"
                }`}
              >
                {isPast ? "지난 모임" : "예정된 모임"}
              </span>
            </div>
            <h1 className="mb-4 text-xl font-bold text-ink sm:text-2xl">{meeting.title}</h1>
            <dl className="space-y-2.5 text-sm">
              <InfoRow icon="🗓️" label="일시" value={fmtFull(meeting.meetsAt)} />
              <InfoRow icon="📍" label="장소" value={meeting.place} />
              {meeting.items && <InfoRow icon="🎒" label="준비물" value={meeting.items} />}
              {meeting.fee && <InfoRow icon="💰" label="회비" value={meeting.fee} />}
            </dl>
            {meeting.note && (
              <p className="mt-4 whitespace-pre-wrap border-t border-sky-line pt-4 text-sm leading-relaxed text-ink-soft">
                {meeting.note}
              </p>
            )}
          </div>
        )}

        {/* ①-b 참석 표시(RSVP) — 예정된 모임에서만 */}
        {!editing && !isPast && (
          <section className="glass-card mb-6 bg-white/80 p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">🙋 참석</h2>
              <span className="text-xs text-ink-faint">
                가요 {data.rsvp.goingCount}
                {data.rsvp.maybeCount > 0 ? ` · 아마도 ${data.rsvp.maybeCount}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              {(["going", "maybe", "none"] as const).map((s) => {
                // myStatus는 going|maybe|null만 — "none"과 절대 일치하지 않아 미응답 시 어떤 버튼도 강조 안 됨.
                const active = data.rsvp.myStatus === s;
                const label = s === "going" ? "🙌 가요" : s === "maybe" ? "🤔 아마도" : "🙅 안 가요";
                return (
                  <button
                    key={s}
                    onClick={() => setRsvp(s)}
                    disabled={rsvpBusy}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
                      active
                        ? "border-teal/50 bg-teal/15 text-teal-ink"
                        : "border-white/90 bg-white/60 text-ink-soft hover:bg-white/90 hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {data.rsvp.going.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {data.rsvp.going.map((g, i) =>
                  g.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" key={i}
                      src={g.avatarUrl}
                      alt=""
                      title={g.nickname ?? ""}
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-white"
                    />
                  ) : (
                    <div
                      key={i}
                      title={g.nickname ?? ""}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-skyx/25 text-[11px] text-skyx-ink ring-2 ring-white"
                    >
                      {(g.nickname ?? "?")[0]}
                    </div>
                  ),
                )}
                {data.rsvp.goingCount > data.rsvp.going.length && (
                  <span className="text-xs text-ink-faint">
                    +{data.rsvp.goingCount - data.rsvp.going.length}
                  </span>
                )}
              </div>
            )}
            {rsvpErr && <p className="mt-2 text-xs text-red-500">{rsvpErr}</p>}
          </section>
        )}

        {/* ② 갤러리 */}
        <section className="glass-card mb-6 bg-white/80 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">📸 함께한 사진</h2>
            <button
              onClick={() => setUploaderOpen((o) => !o)}
              className="glass-soft rounded-full px-3 py-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {uploaderOpen ? "닫기" : "+ 사진 올리기"}
            </button>
          </div>

          {uploaderOpen && (
            <div className="mb-4 space-y-3">
              <ClubImageUploader key={uploaderKey} onChange={setPending} maxImages={10} />
              {imageErr && <p className="text-xs text-red-500">{imageErr}</p>}
              <button
                onClick={saveImages}
                disabled={savingImages || pending.length === 0}
                className="btn-gold w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
              >
                {savingImages ? "올리는 중…" : `사진 ${pending.length}장 올리기`}
              </button>
            </div>
          )}

          {images.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">
              아직 사진이 없어요. 함께한 순간을 남겨보세요.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setLightbox(i)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-sky-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async" src={img.url}
                    alt={img.caption || `사진 ${i + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ③ 후기 댓글 */}
        <section className="glass-card bg-white/85 p-6 sm:p-7">
          <h2 className="mb-4 text-base font-bold text-ink">
            💬 모임 후기 <span className="text-sm font-medium text-ink-faint">{reviews.length}</span>
          </h2>

          {/* 작성 */}
          <div className="mb-5 space-y-2">
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="모임은 어땠나요? 함께한 소감을 남겨보세요."
              className="w-full resize-y rounded-xl border border-sky-line bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            />
            {reviewErr && <p className="text-xs text-red-500">{reviewErr}</p>}
            <div className="flex justify-end">
              <button
                onClick={submitReview}
                disabled={postingReview || !reviewText.trim()}
                className="btn-gold rounded-full px-5 py-2 text-xs font-bold disabled:opacity-40"
              >
                {postingReview ? "남기는 중…" : "후기 남기기"}
              </button>
            </div>
          </div>

          {/* 목록 */}
          {reviews.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">
              첫 후기를 남겨보세요 🙂
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="flex gap-2.5">
                  {r.authorAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={r.authorAvatarUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-skyx/25 text-xs text-skyx-ink">
                      {(r.authorNickname ?? "익")[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">
                        {r.authorNickname ?? "탈퇴한 멤버"}
                      </span>
                      {displayRoles(r.authorRole).map((role) => (
                        <RoleBadge key={role} role={role} size="sm" />
                      ))}
                      <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-faint">
                        {fmtReviewTime(r.createdAt)}
                      </span>
                      {isEdited(r.createdAt, r.updatedAt) && (
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-faint">· 수정됨</span>
                      )}
                    </div>
                    {editingReviewId === r.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editReviewText}
                          onChange={(e) => setEditReviewText(e.target.value)}
                          rows={2}
                          maxLength={1000}
                          autoFocus
                          className="w-full resize-y rounded-xl border border-sky-line bg-white/80 px-3 py-2 text-sm leading-relaxed text-ink focus:border-teal focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveReviewEdit(r.id)}
                            disabled={savingReviewEdit || !editReviewText.trim()}
                            className="btn-gold rounded-full px-3.5 py-1 text-xs disabled:opacity-40"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingReviewId(null)}
                            className="glass-soft rounded-full px-3.5 py-1 text-xs text-ink-soft hover:text-ink"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90">
                        {r.content}
                      </p>
                    )}
                  </div>
                  {editingReviewId !== r.id && (r.canEdit || r.canDelete) && (
                    <span className="flex shrink-0 items-center gap-2">
                      {r.canEdit && (
                        <button
                          onClick={() => startEditReview(r)}
                          className="text-[11px] text-ink-faint transition-colors hover:text-ink"
                        >
                          수정
                        </button>
                      )}
                      {r.canDelete && (
                        <button
                          onClick={() => deleteReview(r.id)}
                          disabled={deletingReviewId === r.id}
                          className="text-[11px] text-ink-faint transition-colors hover:text-red-500 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* 갤러리 라이트박스 */}
      {lightbox !== null && images[lightbox] && (
        <div
          className="modal-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 px-4 backdrop-blur-[2px]"
          onClick={() => setLightbox(null)}
        >
          <div className="modal-pop-in w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-between">
              {images[lightbox].canDelete ? (
                <button
                  onClick={() => deleteImage(images[lightbox].id)}
                  className="glass-soft rounded-full px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                >
                  사진 삭제
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={() => setLightbox(null)}
                aria-label="닫기"
                className="glass-soft flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink"
              >
                ✕
              </button>
            </div>
            <ClubImageCarousel
              images={images.map((im) => ({ url: im.url, caption: im.caption }))}
              showCaption
              initialIndex={lightbox}
            />
          </div>
        </div>
      )}

      {/* 모임 삭제 확인 */}
      {confirmDelete && (
        <div className="modal-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 px-4 backdrop-blur-[2px]">
          <div className="modal-pop-in glass-card w-full max-w-xs p-6 text-center" style={{ background: "rgba(255,255,255,.95)" }}>
            <p className="mb-1 text-sm font-bold text-ink">모임을 삭제할까요?</p>
            <p className="mb-5 text-xs text-ink-soft">후기·사진도 함께 사라지고 되돌릴 수 없어요.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="glass-soft flex-1 rounded-xl py-2.5 text-sm text-ink-soft hover:text-ink"
              >
                취소
              </button>
              <button
                onClick={deleteMeeting}
                className="flex-1 rounded-xl border border-red-300 bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-white/95 bg-white/75 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-ink-soft">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-faint">
        {icon} {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
