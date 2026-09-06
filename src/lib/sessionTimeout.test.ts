import { describe, expect, it } from "vitest";

import {
  ELEVATED_IDLE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  evaluateSessionTimeout,
  isElevatedPath,
} from "./sessionTimeout";

const NOW = 1_800_000_000_000;

function evaluate(lastActive: string | null | undefined) {
  return evaluateSessionTimeout({ lastActive, now: NOW });
}

describe("evaluateSessionTimeout", () => {
  it("방금 활동한 세션은 통과하고 두 마감시각을 함께 돌려준다", () => {
    const lastActive = NOW - 60_000;
    expect(evaluate(String(lastActive))).toEqual({
      status: "ok",
      idleDeadline: lastActive + IDLE_TIMEOUT_MS,
      elevatedDeadline: lastActive + ELEVATED_IDLE_TIMEOUT_MS,
    });
  });

  it("유휴 7일이 되면 끊는다", () => {
    expect(evaluate(String(NOW - IDLE_TIMEOUT_MS))).toEqual({ status: "timeout" });
  });

  it("한계 1ms 전까지는 살아있다", () => {
    expect(evaluate(String(NOW - IDLE_TIMEOUT_MS + 1)).status).toBe("ok");
  });

  it("운영 기준(30분)을 넘겨도 세션 자체는 끊지 않는다 — 재인증은 호출부가 판단", () => {
    // 30분과 7일 사이 → status는 ok, 다만 elevatedDeadline이 이미 지나 있다.
    const lastActive = NOW - 2 * 60 * 60 * 1000; // 2시간 전
    const verdict = evaluate(String(lastActive));
    expect(verdict.status).toBe("ok");
    if (verdict.status !== "ok") throw new Error("unreachable");
    expect(verdict.elevatedDeadline).toBeLessThan(NOW);
    expect(verdict.idleDeadline).toBeGreaterThan(NOW);
  });

  it("앱을 닫아둔 채 7일이 지난 경우도 같은 시계로 끊긴다", () => {
    // 앱을 닫으면 heartbeat가 멈출 뿐이라, '무활동'과 '앱 종료'가 같은 판정으로 수렴한다.
    expect(evaluate(String(NOW - 8 * 24 * 60 * 60 * 1000))).toEqual({ status: "timeout" });
  });

  it("쿠키가 없으면(정책 시행 전 세션) 끊지 않고 새로 심는다", () => {
    expect(evaluate(undefined).status).toBe("seed");
    expect(evaluate(null).status).toBe("seed");
  });

  it("깨진 타임스탬프는 만료가 아니라 시드로 처리한다", () => {
    for (const bad of ["", " ", "abc", "-1", "1.5", "1e12", "99999999999999999999"]) {
      expect(evaluate(bad).status).toBe("seed");
    }
  });

  it("서버 시계가 어긋나 미래 시각이 들어와도 끊지 않는다", () => {
    expect(evaluate(String(NOW + 60_000)).status).toBe("ok");
  });
});

describe("isElevatedPath — PII가 뜨는 운영 화면만 30분 기준", () => {
  it("운영·관리 화면과 그 API를 잡는다", () => {
    for (const p of [
      "/manage",
      "/manage/members",
      "/manage/membership",
      "/admin",
      "/admin/clubs",
      "/api/manage/x",
      "/api/admin/y",
    ]) {
      expect(isElevatedPath(p), p).toBe(true);
    }
  });

  it("일반 화면은 잡지 않는다", () => {
    for (const p of ["/", "/prayer", "/clubs", "/my/profile", "/support", "/api/prayers"]) {
      expect(isElevatedPath(p), p).toBe(false);
    }
  });

  it("/admin/login은 제외 — 재인증 목적지가 다시 재인증을 요구하면 맴돈다", () => {
    expect(isElevatedPath("/admin/login")).toBe(false);
  });

  it("이름만 비슷한 경로에 걸리지 않는다", () => {
    expect(isElevatedPath("/management")).toBe(false);
    expect(isElevatedPath("/administrator")).toBe(false);
  });
});
