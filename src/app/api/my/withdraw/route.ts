import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createAdminNotification } from "@/lib/notifications";
import { withdrawUser } from "@/lib/withdrawal";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`withdraw:${ip}`, { windowMs: 60_000, max: 5 })) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  // PII 파기 + 툼스톤 — 상세 규칙과 DB CHECK 제약은 lib/withdrawal.ts 참고.
  //
  // 실패 시 스택을 남기고 JSON으로 응답한다 — 잡지 않으면 Next가 HTML 500을 반환해
  // 클라이언트의 fetchJson이 파싱 단계에서 터지고, 진짜 원인이 화면에도 로그에도 안 남는다.
  try {
    await withdrawUser(user.dbUserId);
  } catch (e) {
    console.error(`[withdraw] 실패 userId=${user.dbUserId}`, e);
    return NextResponse.json(
      { ok: false, error: "탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  console.log(`[withdraw] userId=${user.dbUserId} supabaseId=${user.supabaseId}`);

  // 운영진에게 탈퇴 공유 (best-effort — 익명화 전에 확보한 닉네임만 사용, 실명/연락처 없음)
  try {
    await createAdminNotification(
      {
        type: "admin_member_withdrawn",
        title: "회원 탈퇴 — 자진",
        body: `${user.nickname ?? "한 멤버"}님이 스스로 탈퇴했어요.`,
        link: "/manage/members",
      },
      user.dbUserId,
    );
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
