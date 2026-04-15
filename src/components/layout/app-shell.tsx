"use client";

import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects");
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ projects: { id: string; name: string }[] }>;
    },
  });

  const projects = data?.projects ?? [];

  return (
    <div className="app-shell flex h-screen flex-row overflow-hidden">
      <Sidebar projects={projects} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
