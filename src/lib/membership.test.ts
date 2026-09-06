import { describe, it, expect } from "vitest";
import {
  NICKNAME_RE,
  getGroup,
  buildNickname,
  normalizePhone,
} from "@/lib/membership";

describe("getGroup — 나이→집단", () => {
  it("러비아 20~26", () => {
    expect(getGroup(20)).toBe("러비아");
    expect(getGroup(26)).toBe("러비아");
  });
  it("유디코 27~33", () => {
    expect(getGroup(27)).toBe("유디코");
    expect(getGroup(33)).toBe("유디코");
  });
  it("엘리온 34세~", () => {
    expect(getGroup(34)).toBe("엘리온");
    expect(getGroup(60)).toBe("엘리온");
  });
  it("범위 밖은 null", () => {
    expect(getGroup(19)).toBeNull();
    expect(getGroup(0)).toBeNull();
  });
});

describe("buildNickname — 집단-나이-이름", () => {
  it("정상 생성", () => {
    expect(buildNickname(25, "홍길동")).toBe("러비아-25-홍길동");
    expect(buildNickname(30, "김철수")).toBe("유디코-30-김철수");
    expect(buildNickname(40, "박엘리")).toBe("엘리온-40-박엘리");
  });
  it("이름 공백 트림", () => {
    expect(buildNickname(22, "  이영희  ")).toBe("러비아-22-이영희");
  });
  it("나이 범위 밖·빈 이름은 null", () => {
    expect(buildNickname(19, "홍길동")).toBeNull();
    expect(buildNickname(25, "")).toBeNull();
    expect(buildNickname(25, "   ")).toBeNull();
  });
});

describe("NICKNAME_RE — 활동 닉네임 형식", () => {
  it("올바른 형식 매칭 + 캡처 그룹", () => {
    const m = "러비아-25-홍길동".match(NICKNAME_RE);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("러비아");
    expect(m?.[2]).toBe("25");
    expect(m?.[3]).toBe("홍길동");
    expect(NICKNAME_RE.test("유디코-30-김")).toBe(true);
    expect(NICKNAME_RE.test("엘리온-40-박엘리")).toBe(true);
  });
  it("형식 위반은 거부", () => {
    expect(NICKNAME_RE.test("철수")).toBe(false); // 형식 없음(구글 이름 폴백)
    expect(NICKNAME_RE.test("외계-25-홍길동")).toBe(false); // 잘못된 집단
    expect(NICKNAME_RE.test("러비아-5-홍길동")).toBe(false); // 나이 1자리
    expect(NICKNAME_RE.test("러비아-25-")).toBe(false); // 이름 없음
  });
});

describe("normalizePhone", () => {
  it("하이픈 형식으로 정규화", () => {
    expect(normalizePhone("010-1234-5678")).toBe("010-1234-5678");
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("010 1234 5678")).toBe("010-1234-5678");
  });
  it("10자리(011 등)도 처리", () => {
    expect(normalizePhone("0111234567")).toBe("011-123-4567");
  });
  it("휴대폰 형식이 아니면 null", () => {
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizePhone("010-12-34")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
  });
});
