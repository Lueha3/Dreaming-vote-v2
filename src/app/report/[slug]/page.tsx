import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ReportCard } from "./ReportCard";

type Props = { params: Promise<{ slug: string }> | { slug: string } };

// generateMetadata와 페이지 본문이 같은 요청에서 각각 조회하던 것을 1회로 합친다.
// (getAuthUser도 cache()라 비공개 카드의 뷰어 판정이 자동 dedup된다.)
const getReport = cache((slug: string) =>
  prisma.report.findUnique({
    where: { shareSlug: slug },
    include: { user: { select: { nickname: true } } },
  }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = params instanceof Promise ? await params : params;
  const report = await getReport(slug);
  if (!report) return { title: "성향 카드를 찾을 수 없어요" };

  if (!report.isPublic) {
    const viewer = await getAuthUser();
    if (!viewer || viewer.dbUserId !== report.userId) {
      return { title: "비공개 성향 카드 — 동아리드림" };
    }
  }

  return {
    title: `"${report.catchphrase}" — 동아리드림`,
    openGraph: {
      title: report.catchphrase,
      description: "나와 닮은 성경 인물로 보는 나의 성향 카드",
      images: [`/api/og/${slug}`],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ReportPage({ params }: Props) {
  const { slug } = params instanceof Promise ? await params : params;

  const report = await getReport(slug);

  if (!report) notFound();

  // 비공개 성향 카드는 본인만 열람 가능
  if (!report.isPublic) {
    const viewer = await getAuthUser();
    if (!viewer || viewer.dbUserId !== report.userId) notFound();
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-10">
        <ReportCard report={report} />
      </main>
    </div>
  );
}
