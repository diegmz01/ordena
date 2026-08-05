"use client";

import { usePathname } from "next/navigation";
import { BranchHeader } from "@/components/branch-header";
import { StaffPresence } from "@/components/staff-presence";

export function BranchShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        {children}
      </div>
    );
  }

  return (
    <>
      <BranchHeader />
      <StaffPresence />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 sm:py-7">
        {children}
      </main>
    </>
  );
}
