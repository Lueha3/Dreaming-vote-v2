"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * /start 첫 안내 처리 — 두 가지 일을 한다.
 * 1) 마운트 시 POST /api/my/start-seen으로 "안내를 봤다"를 기록한다. 홈(page.tsx)이
 *    이 기록을 보고 다음 로그인부터는 리다이렉트 없이 바로 메인을 보여준다.
 *    RSC 프리페치는 클라이언트 마운트를 일으키지 않으므로 프리페치로는 소모되지 않는다.
 * 2) 홈에서 안내로 온 경우(?welcome=1)에만 환영 배너를 보여준다. "다음에 할게요"로
 *    고르지 않고 넘어갈 길을 열어둔다(강제 관문이 아니라 1회 안내).
 *
 * "다음에 할게요"는 기록 완료를 기다린 뒤 이동한다 — 기록 커밋 전에 홈 RSC가 렌더되면
 * 플래그가 아직 null이라 다시 이곳으로 튕기기 때문(마운트 POST와의 레이스). 실패 시엔
 * 클릭에서 한 번 더 시도하고, 서버리스 콜드스타트 대비 3초 한도 후엔 그냥 이동한다.
 *
 * useSearchParams는 Suspense 경계 안에서만 쓴다 — /start의 정적 프리렌더 유지(page.tsx).
 */
export function StartWelcome() {
  const welcome = useSearchParams().get("welcome") === "1";
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const marked = useRef<Promise<boolean> | null>(null);

  // 미기록·실패 시에만 발사하는 멱등 기록 — 실패하면 다음 호출(클릭)에서 재시도한다.
  const ensureMarked = useCallback((): Promise<boolean> => {
    if (!marked.current) {
      marked.current = fetch("/api/my/start-seen", { method: "POST", keepalive: true })
        .then((r) => r.ok)
        .catch(() => false)
        .then((ok) => {
          if (!ok) marked.current = null;
          return ok;
        });
    }
    return marked.current;
  }, []);

  useEffect(() => {
    void ensureMarked();
  }, [ensureMarked]);

  const skip = async () => {
    setLeaving(true);
    await Promise.race([ensureMarked(), new Promise((r) => setTimeout(r, 3000))]);
    router.push("/");
  };

  if (!welcome) return null;

  return (
    <div className="glass-soft mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <p className="min-w-0 text-[13.5px] font-semibold leading-snug text-ink">
        🎉 가입을 환영해요!{" "}
        <span className="font-medium text-ink-soft">먼저 나에게 맞는 동아리를 찾아볼까요?</span>
      </p>
      <button
        type="button"
        onClick={skip}
        disabled={leaving}
        className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-ink-faint underline underline-offset-2 hover:text-ink disabled:opacity-60"
      >
        {leaving ? "이동 중…" : "다음에 할게요"}
      </button>
    </div>
  );
}
