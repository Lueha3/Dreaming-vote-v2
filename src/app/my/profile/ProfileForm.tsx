"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { ApiError, fetchJson } from "@/lib/http";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { BirthdayField } from "@/components/BirthdayField";
import { FEATURES } from "@/lib/features";

/**
 * 프로필 수정 폼 (프로필 사진 전용) — 클라이언트.
 * 초기값(supabaseId·아바타·닉네임·멤버십)은 서버 컴포넌트에서 getAuthUser로 받아 주입.
 * 닉네임은 가입 신청서에 종속이라 읽기 전용.
 */
export function ProfileForm({
  supabaseId,
  initialAvatar,
  nickname,
  membershipStatus,
  initialBirthMonth,
  initialBirthDay,
}: {
  supabaseId: string;
  initialAvatar: string | null;
  nickname: string | null;
  membershipStatus: string;
  initialBirthMonth: number | null;
  initialBirthDay: number | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentAvatar] = useState<string | null>(initialAvatar);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialAvatar);
  const [avatarFile, setAvatarFile] = useState<File | Blob | null>(null);
  const [avatarExt, setAvatarExt] = useState("jpg");

  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("사진은 20MB 이하만 업로드 가능합니다.");
      return;
    }
    setError(null);
    setAvatarPreview(URL.createObjectURL(file));
    setCompressing(true);
    try {
      // 프로필 사진은 아바타(작은 원형 표시)일 뿐이라 300KB로 충분히 압축한다.
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 512,
        initialQuality: 0.85,
        useWebWorker: true,
        fileType: "image/webp" as const,
      });
      setAvatarFile(compressed);
      setAvatarExt("webp");
      setAvatarPreview(URL.createObjectURL(compressed));
    } catch (err) {
      console.error("이미지 압축 실패:", err);
      setError("사진 압축에 실패했습니다. 다른 사진으로 시도해주세요.");
      setAvatarPreview(currentAvatar);
    } finally {
      setCompressing(false);
    }
  }

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarFile) return null;
    const supabase = createClient();
    const path = `${supabaseId}.${avatarExt}`;
    const contentType = avatarFile.type || "image/webp";
    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, cacheControl: "3600", contentType });
    if (error || !data) {
      // 원인 진단용 — Supabase Storage가 반환한 실제 사유를 콘솔에 남긴다.
      console.error("아바타 업로드 실패:", error);
      setError(
        `사진 업로드에 실패했습니다.${error?.message ? ` (${error.message})` : ""} 다시 시도해주세요.`,
      );
      return null;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(data.path);
    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!avatarFile) return;
    setError(null);
    setSaving(true);

    // 실패 사유는 uploadAvatar 내부에서 이미 구체적으로 setError 처리함.
    const newAvatarUrl = await uploadAvatar();
    if (!newAvatarUrl) {
      setSaving(false);
      return;
    }

    // Supabase 메타데이터 + Prisma 양쪽 동기화
    const supabase = createClient();
    const { error: supaErr } = await supabase.auth.updateUser({
      data: { avatar_url: newAvatarUrl },
    });
    if (supaErr) {
      setError("저장에 실패했습니다.");
      setSaving(false);
      return;
    }

    await fetch("/api/my/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: newAvatarUrl }),
    });

    setSuccess(true);
    setSaving(false);
    router.refresh();
    setTimeout(() => router.push("/my"), 1500);
  }

  async function handleWithdraw() {
    if (withdrawConfirm !== "탈퇴") return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await fetchJson("/api/my/withdraw", { method: "POST" });
      setWithdrawn(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      // 풀 리로드로 이동 — 클라 라우터 push만으로는 같은 "/"에 마운트된 HomeFeed의
      // useState(initial)이 갱신되지 않아 탈퇴 후에도 이전 피드가 남을 수 있다.
      // 탈퇴 완료 문구를 잠깐 보여준 뒤 이동.
      setTimeout(() => {
        window.location.href = "/";
      }, 1800);
    } catch (err) {
      // 서버가 준 이유를 그대로 보여준다 — 예전엔 429(요청 과다)든 500이든 같은 문구라
      // 사용자도 운영진도 무엇 때문에 막혔는지 알 수 없었다.
      setWithdrawError(
        err instanceof ApiError && err.message
          ? err.message
          : "탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
      setWithdrawing(false);
    }
  }

  const displayAvatar = avatarPreview ?? currentAvatar;

  if (success)
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <div>
          <div className="mb-4 text-4xl">✅</div>
          <p className="text-lg font-bold text-ink">저장됐습니다!</p>
          <p className="mt-2 text-sm text-ink-soft">잠시 후 이동합니다...</p>
        </div>
      </div>
    );

  if (withdrawn)
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <div>
          <div className="mb-4 text-4xl">👋</div>
          <p className="text-lg font-bold text-ink">탈퇴가 완료됐어요</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            언제든 다시 로그인해서 즉시 재가입할 수 있어요.
            <br />
            그동안 함께해줘서 고마워요!
          </p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-12">
      <div className="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 프로필 사진 */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/90 transition-all hover:border-teal/60"
            >
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt="프로필" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-skyx/25 text-3xl">
                  👤
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
                <span className="text-xs font-semibold text-ink">변경</span>
              </div>
            </button>
            <p className="text-xs text-ink-faint">
              {compressing ? "사진 압축 중..." : "클릭해서 사진 변경 · JPG·PNG·WebP · 자동으로 300KB 이하로 압축돼요"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* 휴대폰 푸시 알림 켜기/끄기 */}
          <PushNotificationToggle />

          {/* 생일 등록 — 생일 당일 광장에 축하 카드를 올리는 기능이라, 광장이 꺼져 있으면 등록할 이유가 없다 */}
          {FEATURES.plaza && (
            <BirthdayField initialMonth={initialBirthMonth} initialDay={initialBirthDay} />
          )}

          {/* 활동 닉네임 — 읽기 전용 (가입 신청 폼에 종속) */}
          <div className="glass-card p-5">
            <p className="mb-2 text-xs font-semibold text-ink">
              활동 닉네임 <span className="font-normal text-ink-faint">(집단-나이-이름)</span>
            </p>
            <p className={`text-lg font-bold ${nickname ? "text-ink" : "text-ink-faint"}`}>
              {nickname ?? "가입 승인 후 자동 설정돼요"}
            </p>
            <p className="mt-2.5 border-t border-sky-line pt-2.5 text-xs leading-relaxed text-ink-soft">
              닉네임은 청년부 가입 신청서의 이름·나이로 자동 설정되고, 변경이 까다로워요.
              {nickname
                ? " 수정이 필요하면 관리자에게 문의해주세요."
                : " 신청서를 작성할 때 이름과 나이를 정확히 입력해주세요!"}
            </p>
            {membershipStatus !== "approved" && (
              <Link
                href="/join"
                className="mt-3 inline-block text-xs font-semibold text-gold-ink underline underline-offset-2"
              >
                {membershipStatus === "pending" ? "가입 신청 현황 보기 →" : "청년부 가입 신청하기 →"}
              </Link>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-red-300/60 bg-red-500/[0.08] px-4 py-3 text-xs text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!avatarFile || saving || compressing}
            className="btn-gold btn-glow w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? "저장 중..." : "사진 저장하기"}
          </button>
        </form>

        {/* 회원 탈퇴 */}
        <div className="mt-12 border-t border-sky-line pt-8">
          {!withdrawOpen ? (
            <button
              onClick={() => setWithdrawOpen(true)}
              className="text-xs text-ink-faint hover:text-red-500 transition-colors"
            >
              회원 탈퇴
            </button>
          ) : (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-red-600 mb-1">정말 탈퇴하시겠어요?</p>
                <ul className="text-xs text-red-500 space-y-1 list-disc list-inside leading-relaxed">
                  <li>프로필·가입 정보(실명·연락처 등)가 즉시 삭제됩니다.</li>
                  <li>개설한 동아리는 자동으로 비공개 처리됩니다.</li>
                  <li className="text-ink-soft">언제든 다시 로그인해서 즉시 재가입할 수 있어요.</li>
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-red-500">
                  확인을 위해 아래 칸에 <strong>탈퇴</strong>를 입력해주세요.
                </p>
                <input
                  value={withdrawConfirm}
                  onChange={(e) => setWithdrawConfirm(e.target.value)}
                  placeholder="탈퇴"
                  className="w-full rounded-xl border border-red-200 bg-white/80 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-red-400 focus:outline-none"
                  autoFocus
                />
              </div>
              {withdrawError && (
                <p className="text-xs text-red-600">{withdrawError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawConfirm !== "탈퇴" || withdrawing}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-40"
                >
                  {withdrawing ? "처리 중..." : "탈퇴 확인"}
                </button>
                <button
                  onClick={() => { setWithdrawOpen(false); setWithdrawConfirm(""); setWithdrawError(null); }}
                  className="glass-soft rounded-xl px-4 py-2.5 text-sm text-ink-soft hover:bg-white/90 hover:text-ink"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
