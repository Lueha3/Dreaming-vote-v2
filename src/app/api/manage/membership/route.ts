import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser, roleGate } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  const gate = roleGate(user, "staff");
  if (gate) return gate;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  // 탈퇴 행은 제외 — 탈퇴 시 membershipStatus가 'withdrawn'으로 바뀌므로
  // deletedAt 필터가 없으면 이름·연락처가 전부 비어 있는 유령 행이 목록에 섞인다.
  const where =
    status === "all"
      ? { deletedAt: null, membershipStatus: { not: "none" } }
      : { deletedAt: null, membershipStatus: "pending" };

  const raw = await prisma.user.findMany({
    where,
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      role: true,
      membershipStatus: true,
      realName: true,
      age: true,
      gender: true,
      dreamGroup: true,
      phone: true,
      membershipAppliedAt: true,
      membershipDecidedAt: true,
      membershipNote: true,
    },
    orderBy: { membershipAppliedAt: "asc" },
  });

  const isAdmin = hasAtLeast(user!.role, "admin");
  const items = raw.map(({ phone, ...rest }) => ({
    ...rest,
    membershipAppliedAt: rest.membershipAppliedAt?.toISOString() ?? null,
    membershipDecidedAt: rest.membershipDecidedAt?.toISOString() ?? null,
    ...(isAdmin ? { phone } : {}),
  }));

  return NextResponse.json({ ok: true, items });
}
