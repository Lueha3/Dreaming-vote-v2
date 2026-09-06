"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchJson } from "@/lib/http";
import { CLUB_CATEGORY_META } from "@/lib/clubCategories";
import { MonthlyRecapBanner } from "@/components/MonthlyRecap";
import { PlazaImageUploader } from "./PlazaImageUploader";
import { PlazaPostCard } from "./PlazaPostCard";
import { CATEGORIES, CATEGORY_META, type Category, type PlazaPost } from "./types";

type ListResponse = { ok: true; items: PlazaPost[]; loggedIn: boolean };

type IcebreakerPrompt = { id: string; question: string; answerCount: number };
type IcebreakerResponse = { ok: true; prompt: IcebreakerPrompt | null };

type EligibleClub = { id: string; name: string; category: string };

type MyClubsResponse = {
  ok: true;
  owned: { id: string; name: string; category: string; isApproved: boolean; isActive: boolean }[];
  applied: {
    status: string;
    clubId: string;
    clubName: string;
    category: string;
    clubVisible: boolean;
  }[];
};

export default function PlazaPage() {
  const [category, setCategory] = useState<Category>("일상");
  const [items, setItems] = useState<PlazaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  // 목록이 권한으로 막힌 상태 — "글이 없어요"(빈 목록)와 구분해서 안내해야 오해가 없다.
  const [gated, setGated] = useState<"login" | "join" | null>(null);

  // 작성 폼
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needJoin, setNeedJoin] = useState(false);

  // 이번 주 아이스브레이커 질문 — 광장 상단 고정 카드 + "답변하기" 태깅
  const [prompt, setPrompt] = useState<IcebreakerPrompt | null>(null);
  const [answeringPrompt, setAnsweringPrompt] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // 동아리광고 — 내 동아리 목록 + 선택
  const [myClubs, setMyClubs] = useState<EligibleClub[]>([]);
  const [myClubsLoaded, setMyClubsLoaded] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState("");

  const isPrayer = category === "기도해주세요";
  const isClubAd = category === "동아리광고";

  // 카테고리 전환 시 작성 폼의 카테고리-종속 상태(이미지·익명·동아리 선택)는 초기화한다(내용은 유지).
  function switchCategory(c: Category) {
    if (c === category) return;
    setCategory(c);
    setImages([]);
    setIsAnonymous(false);
    setUploadingImages(false);
    setUploaderKey((k) => k + 1);
    setError(null);
    setNeedJoin(false);
    setSelectedClubId("");
    setAnsweringPrompt(false);
  }

  // 목록 페치 실패에도 로그인 UI가 어긋나지 않도록 쿠키로 초기 힌트만 시드(서버가 최종 집행).
  useEffect(() => {
    if (/sb-[a-z0-9-]+-auth-token/i.test(document.cookie)) setLoggedIn(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<ListResponse>(`/api/prayers?category=${encodeURIComponent(category)}`);
      setItems(data.items ?? []);
      setLoggedIn(data.loggedIn);
      setGated(null);
    } catch (err) {
      setItems([]);
      // 광장은 승인 멤버 전용 — 401(비로그인)과 membership_required(미승인)를 구분해 안내한다.
      if (err instanceof ApiError && err.code === "membership_required") setGated("join");
      else if (err instanceof ApiError && err.status === 401) setGated("login");
      else setGated(null);
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchJson<IcebreakerResponse>("/api/icebreaker/current")
      .then((data) => setPrompt(data.prompt))
      .catch(() => setPrompt(null));
  }, []);

  function startAnswering() {
    if (category !== "일상") switchCategory("일상");
    setAnsweringPrompt(true);
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  // 알림/동아리 딥링크(/prayer?category=..&club=..)로 진입 시 탭·동아리를 미리 선택해둔다.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("category");
    if (c && (CATEGORIES as readonly string[]).includes(c)) setCategory(c as Category);
    const clubParam = sp.get("club");
    if (clubParam) setSelectedClubId(clubParam);
  }, []);

  // 동아리광고 탭을 열면 내가 속한(개설·승인 가입) 공개 동아리 목록을 한 번만 불러온다.
  useEffect(() => {
    if (!isClubAd || !loggedIn || myClubsLoaded) return;
    (async () => {
      try {
        const data = await fetchJson<MyClubsResponse>("/api/my/clubs");
        const eligible: EligibleClub[] = [
          ...data.owned
            .filter((c) => c.isApproved && c.isActive)
            .map((c) => ({ id: c.id, name: c.name, category: c.category })),
          ...data.applied
            .filter((a) => a.status === "accepted" && a.clubVisible)
            .map((a) => ({ id: a.clubId, name: a.clubName, category: a.category })),
        ];
        setMyClubs(eligible);
        setSelectedClubId((prev) => (eligible.some((c) => c.id === prev) ? prev : ""));
      } catch {
        setMyClubs([]);
      }
      setMyClubsLoaded(true);
    })();
  }, [isClubAd, loggedIn, myClubsLoaded]);

  // 로드 완료 후 URL 해시(#<글id>)가 가리키는 글로 1회 스크롤(해당 글이 현재 목록에 있을 때).
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (loading || scrolledRef.current) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      scrolledRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, items]);

  /** 게이트(미승인) 등 API 에러를 작성 폼 영역에 안내 */
  function surfaceApiError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.code === "membership_required") {
      setNeedJoin(true);
      setError(err.message);
    } else {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if ((!text && images.length === 0) || posting) return;
    if (isClubAd && !selectedClubId) return;
    setPosting(true);
    setError(null);
    setNeedJoin(false);
    try {
      await fetchJson("/api/prayers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          content: text,
          isAnonymous: isPrayer ? isAnonymous : false,
          images,
          clubId: isClubAd ? selectedClubId : undefined,
          promptId: answeringPrompt ? prompt?.id : undefined,
        }),
      });
      setContent("");
      setIsAnonymous(false);
      setImages([]);
      setSelectedClubId("");
      setUploaderKey((k) => k + 1); // 업로더 리셋
      if (answeringPrompt && prompt) {
        setPrompt({ ...prompt, answerCount: prompt.answerCount + 1 });
        setAnsweringPrompt(false);
      }
      await load();
    } catch (err) {
      surfaceApiError(err, "올리지 못했어요. 다시 시도해주세요.");
    }
    setPosting(false);
  }

  async function react(post: PlazaPost) {
    // 낙관적 토글
    setItems((prev) =>
      prev.map((x) =>
        x.id === post.id
          ? { ...x, iReacted: !x.iReacted, reactionCount: x.reactionCount + (x.iReacted ? -1 : 1) }
          : x,
      ),
    );
    try {
      const data = await fetchJson<{ ok: true; iReacted: boolean; reactionCount: number }>(
        `/api/prayers/${post.id}/pray`,
        { method: "POST" },
      );
      setItems((prev) =>
        prev.map((x) =>
          x.id === post.id ? { ...x, iReacted: data.iReacted, reactionCount: data.reactionCount } : x,
        ),
      );
    } catch (err) {
      await load(); // 원복
      surfaceApiError(err, "잠시 후 다시 시도해주세요.");
    }
  }

  async function removePost(post: PlazaPost) {
    setItems((prev) => prev.filter((x) => x.id !== post.id));
    try {
      await fetchJson(`/api/prayers/${post.id}`, { method: "DELETE" });
    } catch {
      await load(); // 실패 시 원복
    }
  }

  async function editPost(post: PlazaPost, content: string, images: string[]) {
    const trimmed = content.trim();
    const prevContent = post.content;
    const prevImages = post.images;
    // 낙관적 갱신 — 실패 시 원복
    setItems((items) =>
      items.map((x) => (x.id === post.id ? { ...x, content: trimmed, images } : x)),
    );
    try {
      await fetchJson(`/api/prayers/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, images }),
      });
      await load();
    } catch (err) {
      setItems((items) =>
        items.map((x) => (x.id === post.id ? { ...x, content: prevContent, images: prevImages } : x)),
      );
      surfaceApiError(err, "수정에 실패했어요. 다시 시도해주세요.");
    }
  }

  async function markAnswered(post: PlazaPost, note: string) {
    try {
      await fetchJson(`/api/prayers/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAnswered: true, answeredNote: note.trim() || undefined }),
      });
      await load();
    } catch (err) {
      surfaceApiError(err, "응답 표시에 실패했어요. 다시 시도해주세요.");
    }
  }

  function commentDelta(postId: string, delta: number) {
    setItems((prev) =>
      prev.map((x) => (x.id === postId ? { ...x, commentCount: Math.max(0, x.commentCount + delta) } : x)),
    );
  }

  const meta = CATEGORY_META[category];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-10">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">🗣 광장</h1>
          <p className="mt-1 text-sm text-ink-soft">일상을 나누고, 기도제목을 올리고, 동아리를 알려요.</p>
        </div>

        {/* 월간 리캡 — 로그인/승인 멤버가 아니면 조용히 아무것도 보여주지 않는다. */}
        <MonthlyRecapBanner />

        {/* 카테고리 탭 */}
        <div className="mb-5 flex gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => switchCategory(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                category === c
                  ? "bg-skyx/25 text-skyx-ink ring-1 ring-skyx/40"
                  : "glass-soft text-ink-soft hover:bg-white/90 hover:text-ink"
              }`}
            >
              {CATEGORY_META[c].emoji} {c}
            </button>
          ))}
        </div>

        {/* 이번 주 질문 — 일상 탭에서만 고정 노출 */}
        {category === "일상" && prompt && (
          <div className="glass-card mb-5 border border-gold/30 bg-gold/5 p-4">
            <p className="mb-1 text-[11px] font-medium text-gold-ink">💬 이번 주 질문</p>
            <p className="mb-2.5 text-sm font-semibold text-ink">{prompt.question}</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-faint">답변 {prompt.answerCount}개</span>
              {loggedIn && !answeringPrompt && (
                <button
                  type="button"
                  onClick={startAnswering}
                  className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-ink transition-colors hover:bg-gold/20"
                >
                  답변하기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 작성 폼 */}
        {loggedIn ? (
          <form onSubmit={handlePost} className="glass-card mb-6 p-4">
            {answeringPrompt && prompt && (
              <div className="mb-2.5 flex items-center justify-between rounded-lg bg-gold/10 px-3 py-1.5 text-xs text-gold-ink">
                <span>💬 &quot;{prompt.question}&quot;에 답하는 중</span>
                <button
                  type="button"
                  onClick={() => setAnsweringPrompt(false)}
                  className="text-ink-faint hover:text-ink"
                >
                  취소
                </button>
              </div>
            )}
            <textarea
              ref={composerRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={answeringPrompt ? "이 질문에 대한 답을 나눠보세요..." : meta.placeholder}
              className="w-full resize-none rounded-xl border border-white/95 bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            />

            {/* 동아리광고 — 광고할 동아리 선택 */}
            {isClubAd && (
              <div className="mt-3">
                {!myClubsLoaded ? (
                  <p className="text-xs text-ink-faint">내 동아리를 불러오는 중...</p>
                ) : myClubs.length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    가입한 동아리가 있어야 광고할 수 있어요.{" "}
                    <Link href="/clubs" className="font-semibold text-gold-ink underline underline-offset-2">
                      동아리 둘러보기 →
                    </Link>
                  </p>
                ) : (
                  <select
                    value={selectedClubId}
                    onChange={(e) => setSelectedClubId(e.target.value)}
                    className="w-full rounded-xl border border-white/95 bg-white/70 px-4 py-2.5 text-sm text-ink focus:border-teal focus:outline-none"
                  >
                    <option value="">광고할 동아리를 선택하세요</option>
                    {myClubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {CLUB_CATEGORY_META[c.category]?.emoji ?? ""} {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* 이미지 업로더 */}
            <div className="mt-3">
              <PlazaImageUploader
                key={uploaderKey}
                onChange={setImages}
                onUploadingChange={setUploadingImages}
                maxImages={5}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              {isPrayer ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="h-4 w-4 rounded border-sky-line bg-white/70 accent-teal"
                  />
                  익명으로 올리기
                </label>
              ) : (
                <span className="text-xs text-ink-faint">사진은 최대 5장 · 자동 압축돼요</span>
              )}
              <button
                type="submit"
                disabled={
                  (!content.trim() && images.length === 0) ||
                  posting ||
                  uploadingImages ||
                  (isClubAd && !selectedClubId)
                }
                className="btn-gold rounded-xl px-5 py-2 text-sm disabled:opacity-40"
              >
                {uploadingImages ? "사진 올리는 중..." : posting ? "올리는 중..." : "올리기"}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-500">
                {error}
                {needJoin && (
                  <Link href="/join" className="ml-1.5 font-semibold text-gold-ink underline underline-offset-2">
                    가입 신청하러 가기 →
                  </Link>
                )}
              </p>
            )}
          </form>
        ) : (
          <div className="glass-card mb-6 p-5 text-center">
            <p className="mb-3 text-sm text-ink-soft">글을 나누려면 로그인이 필요해요.</p>
            <Link href="/login?next=/prayer" className="btn-gold inline-block rounded-full px-6 py-2.5 text-sm">
              로그인하기
            </Link>
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/55" />
            ))}
          </div>
        ) : gated ? (
          <div className="glass-card px-8 py-14 text-center">
            <div className="mb-3 text-4xl">🔒</div>
            <p className="mb-1.5 text-sm font-semibold text-ink">
              {gated === "login"
                ? "로그인하면 광장을 볼 수 있어요."
                : "가입 승인 후 광장을 볼 수 있어요."}
            </p>
            <p className="text-xs leading-relaxed text-ink-soft">
              멤버들이 나눈 이야기는 청년부 멤버에게만 보여요.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="glass-card px-8 py-14 text-center">
            <div className="mb-3 text-4xl">{meta.emoji}</div>
            <p className="text-sm text-ink-soft">{meta.empty}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((post) => (
              <PlazaPostCard
                key={post.id}
                post={post}
                loggedIn={loggedIn}
                onReact={react}
                onDelete={removePost}
                onAnswered={markAnswered}
                onEdit={editPost}
                onCommentDelta={commentDelta}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
