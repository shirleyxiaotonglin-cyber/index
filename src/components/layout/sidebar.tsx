"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Briefcase,
  Sparkles,
  UserCircle2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export type ProjectNav = { id: string; name: string };

const nav = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/projects", label: "项目", icon: Briefcase },
  { href: "/my", label: "我的任务", icon: UserCircle2 },
  { href: "/ai", label: "AI 控制中心", icon: Sparkles },
];

export function Sidebar({ projects }: { projects: ProjectNav[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card/40">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <FolderKanban className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Work Graph OS</div>
          <div className="text-[10px] text-muted-foreground">Task Ops</div>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-2">
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator className="my-2" />
        <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          项目
        </div>
        <div className="flex flex-col gap-0.5 px-1 pb-4">
          {projects.map((p) => {
            const href = `/project/${p.id}`;
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={p.id}
                href={href}
                className={cn(
                  "group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-sm",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{p.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60" />
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
