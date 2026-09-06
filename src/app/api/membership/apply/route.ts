import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { GENDERS, normalizePhone } from "@/lib/membership";
import { createAdminNotification } from "@/lib/notifications";

const applySchema = z.object({
  realName: z
    .string()
    .trim()
    .min(2, "이름을 입력해주세요.")
    .max(20, "이름이 너무 깁니다."),
  age: z
    .number()
    .int()
    .min(20, "청년부는 20세 이상부터 신청할 수 있어요.")
    .max(99, "나이를 다시 확인해주세요."),
  gender: z.enum(GENDERS),
  dreamGroup: z
    .string()
    .trim()
    .min(1, "소속 꿈터 이름을 입력해주세요.")
    .max(30, "꿈터 이름이 너무 깁니다."),
  phone: z.string().trim().min(9, "전화번호를 입력해주세요.").max(20),
});

/**
 * POST /api/membership/apply
 * 가입신청 제출 — none/rejected → pending. pending 중에는 정보 수정(재제출) 허용.
 * 이미 approved면 거부.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`membership-apply:${ip}`, { windowMs: 60_000, max: 5 })) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.membershipStatus === "approved") {
    return NextResponse.json(
      { ok: false, error: "이미 승인된 멤버예요." },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return NextResponse.json(
      { ok: false, error: first ?? "입력값을 확인해주세요.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "전화번호 형식을 확인해주세요. (예: 010-1234-5678)" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.dbUserId },
    data: {
      realName: parsed.data.realName,
      age: parsed.data.age,
      gender: parsed.data.gender,
      dreamGroup: parsed.data.dreamGroup,
      phone,
      membershipStatus: "pending",
      membershipAppliedAt: new Date(),
      membershipDecidedAt: null,
      membershipNote: null,
    },
  });

  // 운영진에게 새 가입 신청 알림 (best-effort — PII 없이 닉네임만 노출)
  try {
    await createAdminNotification({
      type: "admin_membership_applied",
      title: "새 가입 신청이 도착했어요",
      body: `${user.nickname ?? "새 신청자"}님이 가입을 신청했어요.`,
      link: "/manage/membership",
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
