import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProjectWorkspace } from "./project-workspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });

  if (!project) {
    return (
      <div className="p-6 text-sm text-muted-foreground">项目不存在或已删除。</div>
    );
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载工作区…</div>}>
      <ProjectWorkspace projectId={project.id} projectName={project.name} />
    </Suspense>
  );
}
