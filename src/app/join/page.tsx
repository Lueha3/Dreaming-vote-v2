"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildNickname, getGroup, normalizePhone } from "@/lib/membership";

type Membership = {
  membershipStatus: "none" | "pending" | "approved" | "rejected";
  nickname: string | null;
  realName: string | null;
  age: number | null;
  gender: string | null;
  dreamGroup: string | null;
  phone: string | null;
  membershipAppliedAt: string | null;
  membershipNote: string | null;
};

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const searchParams = useSearchParams();
  // 헤더의 일반 '로그인' 버튼으로 들어와 OAuth 콜백이 미가입 상태를 감지해 붙인 플래그.
  // /api/auth/callback/route.ts에서 next==='/' && status가 none/rejected일 때만 ?welcome=1로 이리 보낸다.
  const justLoggedIn = searchParams.get("welcome") === "1";

  const [loading, setLoading] = useState(true);
  const [notLoggedIn, setNotLoggedIn] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [editing, setEditing] = useState(false);

  // 폼 상태
  const [realName, setRealName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"남" | "여" | null>(null);
  const [dreamGroup, setDreamGroup] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNum = parseInt(age, 10);
  const group = !isNaN(ageNum) ? getGroup(ageNum) : null;
  // 신청한 이름·나이로 자동 생성될 활동 닉네임 (집단-나이-이름)
  const nicknamePreview =
    group && realName.trim() ? buildNickname(ageNum, realName) : null;

  useEffect(() => {
    fetch("/api/membership", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) {
          setNotLoggedIn(true);
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (json?.ok) {
          const m: Membership = json.membership;
          setMembership(m);
          if (m.realName) setRealName(m.realName);
          if (m.age) setAge(String(m.age));
          if (m.gender === "남" || m.gender === "여") setGender(m.gender);
          if (m.dreamGroup) setDreamGroup(m.dreamGroup);
          if (m.phone) setPhone(m.phone);
        }
      })
      .catch(() => {
        /* 조회 실패 시 빈 폼으로 시작 — 제출 성공 처리에서 상태를 직접 구성한다 */
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/membership/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: realName.trim(),
          age: ageNum,
          gender,
          dreamGroup: dreamGroup.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        // 제출한 값(서버 정규화 포함)으로 상태를 직접 구성 — 초기 조회 실패/이전 값과 무관하게 대기 화면이 뜬다
        setMembership((m) => ({
          membershipStatus: "pending",
          nickname: m?.nickname ?? null,
          realName: realName.trim(),
          age: ageNum,
          gender,
          dreamGroup: dreamGroup.trim(),
          phone: normalizePhone(phone.trim()) ?? phone.trim(),
          membershipAppliedAt: m?.membershipAppliedAt ?? new Date().toISOString(),
          membershipNote: null,
        }));
        setEditing(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(json.error ?? "제출에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } catch {
      setError("네트워크 오류. 잠시 후 다시 시도해주세요.");
    }
    setSubmitting(false);
  }

  /* ── 로딩 ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
      </div>
    );
  }

  /* ── 비로그인 ─────────────────────────────────────────── */
  if (notLoggedIn) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 text-center">
        <div className="glass-card max-w-sm p-8">
          <div className="mb-4 text-4xl">⛪</div>
          <h1 className="mb-2 text-xl font-bold text-ink">꿈꾸는교회 청년부 가입</h1>
          <p className="mb-6 text-sm leading-relaxed text-ink-soft">
            먼저 구글로 로그인한 뒤,
            <br />
            가입 신청서를 작성해주세요.
          </p>
          <Link
            href="/login?next=/join"
            className="btn-gold inline-block rounded-full px-6 py-3 text-sm btn-glow"
          >
            로그인하고 가입 신청하기
          </Link>
        </div>
      </div>
    );
  }

  const status = membership?.membershipStatus ?? "none";

  /* ── 승인 완료 ─────────────────────────────────────────── */
  if (status === "approved") {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 text-center">
        <div className="glass-card max-w-sm p-8">
          <div className="mb-4 text-4xl">🎉</div>
          <h1 className="mb-2 text-xl font-bold text-ink">이미 승인된 멤버예요!</h1>
          <p className="mb-6 text-sm text-ink-soft">
            동아리와 모임에 자유롭게 참여할 수 있어요.
          </p>
          <Link href="/clubs" className="btn-gold inline-block rounded-full px-6 py-3 text-sm btn-glow">
            동아리 둘러보기 →
          </Link>
        </div>
      </div>
    );
  }

  /* ── 승인 대기 ─────────────────────────────────────────── */
  if (status === "pending" && !editing) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-8 text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <h1 className="mb-2 text-xl font-bold text-ink">가입 신청 완료!</h1>
          <p className="mb-6 text-sm leading-relaxed text-ink-soft">
            관리자가 신청 내용을 확인하고 있어요.
            <br />
            승인되면 모든 활동에 참여할 수 있어요.
          </p>

          <div className="glass-soft mb-6 space-y-2 rounded-xl p-4 text-left text-sm">
            <Row label="이름" value={membership?.realName} />
            <Row label="나이" value={membership?.age ? `${membership.age}세` : null} />
            <Row label="성별" value={membership?.gender} />
            <Row label="꿈터" value={membership?.dreamGroup} />
            <Row label="전화번호" value={membership?.phone} />
            <div className="border-t border-sky-line pt-2">
              <Row
                label="승인 시 닉네임"
                value={
                  membership?.realName && membership?.age
                    ? buildNickname(membership.age, membership.realName)
                    : null
                }
              />
            </div>
          </div>

          <p className="mb-5 text-xs leading-relaxed text-ink-soft">
            닉네임(집단-나이-이름)은 위 정보로 자동 설정되며, 승인 후에는 변경이 까다로워요.
            <br />
            <span className="font-semibold text-gold-ink">잘못 입력했다면 지금 수정해주세요.</span>
          </p>

          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            제출 정보 수정하기
          </button>
        </div>
      </div>
    );
  }

  /* ── 신청 폼 (none / rejected / pending 수정) ──────────── */
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="mb-2 text-2xl font-bold text-ink">
          <span className="gradient-text">청년부 가입 신청</span>
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-soft">
          꿈꾸는교회 청년부 멤버 확인을 위한 정보예요.
          <br />
          관리자 승인 후 모든 활동에 참여할 수 있어요.
        </p>

        {status === "rejected" && (
          <div className="mb-6 rounded-xl border border-red-300/60 bg-red-500/[0.07] px-4 py-3 text-sm text-red-500">
            이전 신청이 승인되지 않았어요.
            {membership?.membershipNote && (
              <span className="mt-1 block text-xs">사유: {membership.membershipNote}</span>
            )}
            <span className="mt-1 block text-xs text-ink-soft">
              내용을 확인하고 다시 신청할 수 있어요.
            </span>
          </div>
        )}

        {status === "none" && justLoggedIn && (
          <div className="mb-6 rounded-xl border border-teal/35 bg-teal/[0.08] px-4 py-3 text-sm text-teal-ink">
            로그인됐어요! 아직 청년부 가입 전이에요.
            <span className="mt-1 block text-xs text-ink-soft">
              아래 정보를 입력하고 가입을 신청해주세요.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="glass-card space-y-4 p-5">
            {/* 이름 */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-soft">이름</label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="예: 이정현"
                maxLength={20}
                className="w-full rounded-xl border border-white/95 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
            </div>

            {/* 나이 */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-soft">
                나이 <span className="text-ink-faint">(20세 이상)</span>
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={20}
                max={99}
                placeholder="예: 26"
                className="w-full rounded-xl border border-white/95 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
              {age && (
                <div className="mt-2">
                  {group ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                        group === "러비아"
                          ? "border-skyx/40 bg-skyx/20 text-skyx-ink"
                          : group === "유디코"
                            ? "border-teal/35 bg-teal/15 text-teal-ink"
                            : "border-gold/40 bg-gold/15 text-gold-ink"
                      }`}
                    >
                      ✓ {group} 소속
                    </span>
                  ) : (
                    <span className="text-xs text-red-500">청년부는 20세 이상부터 신청할 수 있어요.</span>
                  )}
                </div>
              )}
            </div>

            {/* 성별 */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-soft">성별</label>
              <div className="flex gap-2">
                {(["남", "여"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      gender === g
                        ? "border-gold/60 bg-gold/15 text-gold-ink"
                        : "border-white/95 bg-white/55 text-ink-soft hover:bg-white/80"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* 꿈터 */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-soft">소속 꿈터 이름</label>
              <input
                type="text"
                value={dreamGroup}
                onChange={(e) => setDreamGroup(e.target.value)}
                placeholder="예: 사랑꿈터"
                maxLength={30}
                className="w-full rounded-xl border border-white/95 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-soft">전화번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                maxLength={20}
                className="w-full rounded-xl border border-white/95 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] text-ink-faint">
                멤버 확인 용도로만 사용하고, 다른 멤버에게 공개되지 않아요.
              </p>
            </div>
          </div>

          {/* 활동 닉네임 미리보기 — 신청 정보(이름·나이)로 자동 생성 */}
          <div
            className={`rounded-xl border px-4 py-3.5 text-center transition-all ${
              nicknamePreview ? "border-teal/40 bg-teal/[0.07]" : "border-sky-line bg-white/55"
            }`}
          >
            <p className="mb-1 text-[11px] uppercase tracking-widest text-ink-faint">
              활동 닉네임 미리보기
            </p>
            <p className={`text-lg font-bold ${nicknamePreview ? "text-ink" : "text-ink-faint"}`}>
              {nicknamePreview ?? "집단-나이-이름"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              가입이 승인되면 이 닉네임이 자동으로 설정돼요.
              <br />
              <span className="font-semibold text-gold-ink">
                ⚠️ 닉네임은 나중에 변경이 까다로우니, 이름과 나이를 정확히 입력해주세요!
              </span>
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-red-300/60 bg-red-500/[0.08] px-4 py-3 text-xs text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              submitting || !realName.trim() || !group || !gender || !dreamGroup.trim() || !phone.trim()
            }
            className="btn-gold w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40 btn-glow"
          >
            {submitting ? "제출 중..." : status === "pending" ? "수정해서 다시 제출" : "가입 신청하기"}
          </button>

          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="block w-full text-center text-xs text-ink-faint transition-colors hover:text-ink"
            >
              취소하고 돌아가기
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-faint">{label}</span>
      <span className="font-medium text-ink">{value ?? "-"}</span>
    </div>
  );
}
