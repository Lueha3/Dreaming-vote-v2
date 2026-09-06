import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { hasAdminAreaAccess } from "@/lib/manageAuth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 운영진 이상(role 기반)만 접근. 미인가는 안내 화면으로.
  if (!(await hasAdminAreaAccess("staff"))) {
    redirect("/admin/login");
  }
  // 프롬프트 관리는 관리자 이상만 메뉴 노출.
  const showPrompts = await hasAdminAreaAccess("admin");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              Admin
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-sm font-semibold text-white">동아리드림</span>
          </div>

          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/admin/stats"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              통계
            </Link>
            <Link
              href="/admin/members"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              멤버 승인
            </Link>
            {showPrompts && (
              <Link
                href="/admin/prompts"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                프롬프트 관리
              </Link>
            )}
            <Link
              href="/admin/clubs"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              동아리 승인
            </Link>
            <span className="text-zinc-700">|</span>
            <AdminLogoutButton />
            <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs">
              ← 홈
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
    </div>
  );
}
