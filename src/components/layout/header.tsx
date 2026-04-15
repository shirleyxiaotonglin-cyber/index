"use client";

import { signOut, useSession } from "next-auth/react";
import { Search, Bell, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function Header() {
  const { data: session } = useSession();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await fetch("/api/notifications?unread=1");
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ notifications: { id: string; title: string; body: string | null }[] }>;
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.notifications?.length ?? 0;

  useEffect(() => {
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ["notifications"] }), 60000);
    return () => clearInterval(id);
  }, [qc]);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索任务、项目…（后续可接全局搜索 API）"
          className="h-9 pl-9"
          disabled
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              通知
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-xs font-normal text-primary"
                  onClick={() => markAll.mutate()}
                >
                  全部已读
                </button>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(data?.notifications?.length ?? 0) === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">暂无未读</div>
            ) : (
              data?.notifications.map((n) => (
                <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                  <span className="text-xs font-medium">{n.title}</span>
                  {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="h-9 gap-2 px-2">
              <span className="max-w-[140px] truncate text-sm">
                {session?.user?.name || session?.user?.email || "用户"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>账号</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
