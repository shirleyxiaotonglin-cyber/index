import {
  PrismaClient,
  GlobalRole,
  ProjectRole,
  TaskStatus,
  TaskPriority,
  TaskRelationKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** 面向「游戏本地化音频管理 PM」的虚拟项目（演示数据） */
const PROJECTS = [
  {
    id: "seed-loc-audio-1",
    name: "《暗影之章》第二章 — 中文配音与口型",
    description: "剧情过场 VO、NPC 线、与过场动画口型时间轴对齐；对接音频外包与叙事团队。",
  },
  {
    id: "seed-loc-audio-2",
    name: "竞技场 S7 — 英/日/韩语音同步发行",
    description: "赛季播报、英雄语音包多语言版本对齐同一里程碑；协调各语区录音棚排期。",
  },
  {
    id: "seed-loc-audio-3",
    name: "旁白与系统语音 — Casting 与管线",
    description: "主菜单/教程旁白选角、合同与交付规范；Wwise 工程与字幕时间码管线。",
  },
  {
    id: "seed-loc-audio-4",
    name: "音频 LQA 与平台合规（PS5 / Xbox / PC）",
    description: "响度与 True Peak、平台格式检查、多语言混音母带验收清单。",
  },
] as const;

async function clearProjectData(projectId: string) {
  await prisma.taskRelation.deleteMany({ where: { projectId } });
  await prisma.comment.deleteMany({ where: { task: { projectId } } });
  for (;;) {
    const deleted = await prisma.task.deleteMany({
      where: {
        projectId,
        children: { none: {} },
      },
    });
    if (deleted.count === 0) break;
  }
}

async function main() {
  /** 旧版单项目 seed 清理（避免库里残留「产品迭代」演示项目） */
  const legacyId = "seed-project-1";
  const legacy = await prisma.project.findUnique({ where: { id: legacyId } });
  if (legacy) {
    await clearProjectData(legacyId);
    await prisma.projectMember.deleteMany({ where: { projectId: legacyId } });
    await prisma.project.delete({ where: { id: legacyId } });
  }

  const demoAdminPass = await bcrypt.hash("123456", 10);
  const secondaryPass = await bcrypt.hash("demo123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "435236356@qq.com" },
    update: { name: "演示账号", passwordHash: demoAdminPass },
    create: {
      email: "435236356@qq.com",
      name: "演示账号",
      passwordHash: demoAdminPass,
      globalRole: GlobalRole.ADMIN,
      aiPermissionLevel: 3,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@demo.com" },
    update: { name: "外包与录音统筹" },
    create: {
      email: "manager@demo.com",
      name: "外包与录音统筹",
      passwordHash: secondaryPass,
      globalRole: GlobalRole.MANAGER,
      aiPermissionLevel: 2,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: "member@demo.com" },
    update: { name: "音频技术 / Wwise" },
    create: {
      email: "member@demo.com",
      name: "音频技术 / Wwise",
      passwordHash: secondaryPass,
      globalRole: GlobalRole.MEMBER,
      aiPermissionLevel: 1,
    },
  });

  for (const p of PROJECTS) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: { name: p.name, description: p.description },
      create: {
        id: p.id,
        name: p.name,
        description: p.description,
      },
    });
    await clearProjectData(p.id);
    await prisma.projectMember.deleteMany({ where: { projectId: p.id } });
    await prisma.projectMember.createMany({
      data: [
        { projectId: p.id, userId: admin.id, role: ProjectRole.ADMIN },
        { projectId: p.id, userId: manager.id, role: ProjectRole.MANAGER },
        { projectId: p.id, userId: member.id, role: ProjectRole.MEMBER },
      ],
    });
  }

  const p1 = PROJECTS[0].id;
  const p2 = PROJECTS[1].id;
  const p3 = PROJECTS[2].id;
  const p4 = PROJECTS[3].id;

  const root1 = await prisma.task.create({
    data: {
      title: "第二章过场 VO 全量录制与初混",
      description: "含反派线 12 场；需与过场动画锁定版对齐。",
      projectId: p1,
      status: TaskStatus.doing,
      priority: TaskPriority.P0,
      assigneeId: manager.id,
      createdById: admin.id,
      startTime: new Date(),
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      estimatedHours: 120,
      actualHours: 40,
      tags: ["VO", "过场", "中文"],
      collaborators: {
        create: [
          { userId: member.id, responsibility: "Wwise 工程接入与时间码导出" },
          { userId: admin.id, responsibility: "剧本终稿与术语表对齐" },
        ],
      },
    },
  });

  const child1 = await prisma.task.create({
    data: {
      title: "口型时间轴（lip-sync）锁定",
      projectId: p1,
      parentId: root1.id,
      status: TaskStatus.blocked,
      priority: TaskPriority.P1,
      assigneeId: member.id,
      createdById: manager.id,
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      estimatedHours: 24,
      tags: ["口型", "动画"],
    },
  });

  await prisma.task.create({
    data: {
      title: "反派角色 Casting 复审与合同",
      projectId: p1,
      parentId: root1.id,
      status: TaskStatus.review,
      priority: TaskPriority.P1,
      assigneeId: admin.id,
      createdById: manager.id,
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedHours: 8,
      tags: ["Casting", "法务"],
    },
  });

  const arena = await prisma.task.create({
    data: {
      title: "S7 英雄语音包 — 三语录音排期冻结",
      description: "英日韩同一内容锁；避免版本漂移。",
      projectId: p2,
      status: TaskStatus.doing,
      priority: TaskPriority.P0,
      assigneeId: manager.id,
      createdById: admin.id,
      startTime: new Date(),
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      estimatedHours: 80,
      actualHours: 20,
      tags: ["赛季", "多语言"],
      collaborators: {
        create: [{ userId: member.id, responsibility: "各语区文件命名与批次导入" }],
      },
    },
  });

  const jpSlot = await prisma.task.create({
    data: {
      title: "日服录音棚档期确认（阻塞项）",
      projectId: p2,
      parentId: arena.id,
      status: TaskStatus.blocked,
      priority: TaskPriority.P1,
      assigneeId: manager.id,
      createdById: admin.id,
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      estimatedHours: 4,
      tags: ["排期", "外包"],
    },
  });

  const casting = await prisma.task.create({
    data: {
      title: "教程旁白选角短名单与试音评审",
      projectId: p3,
      status: TaskStatus.todo,
      priority: TaskPriority.P1,
      assigneeId: admin.id,
      createdById: manager.id,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedHours: 16,
      tags: ["旁白", "Casting"],
    },
  });

  await prisma.task.create({
    data: {
      title: "字幕与 VO 时间码管线文档 v2",
      projectId: p3,
      parentId: casting.id,
      status: TaskStatus.doing,
      priority: TaskPriority.P2,
      assigneeId: member.id,
      createdById: admin.id,
      estimatedHours: 12,
      tags: ["管线", "文档"],
    },
  });

  const lqa = await prisma.task.create({
    data: {
      title: "主机平台响度与 True Peak 批检",
      projectId: p4,
      status: TaskStatus.doing,
      priority: TaskPriority.P0,
      assigneeId: member.id,
      createdById: admin.id,
      deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      estimatedHours: 32,
      actualHours: 8,
      tags: ["LQA", "合规"],
    },
  });

  const lqaChild = await prisma.task.create({
    data: {
      title: "多语言母带抽检（英德法）",
      projectId: p4,
      parentId: lqa.id,
      status: TaskStatus.todo,
      priority: TaskPriority.P2,
      assigneeId: manager.id,
      createdById: member.id,
      estimatedHours: 16,
      tags: ["母带", "抽检"],
    },
  });

  await prisma.taskRelation.createMany({
    data: [
      {
        projectId: p1,
        fromTaskId: child1.id,
        toTaskId: root1.id,
        kind: TaskRelationKind.DEPENDS_ON,
      },
      {
        projectId: p2,
        fromTaskId: jpSlot.id,
        toTaskId: arena.id,
        kind: TaskRelationKind.BLOCKS,
      },
      {
        projectId: p2,
        fromTaskId: arena.id,
        toTaskId: jpSlot.id,
        kind: TaskRelationKind.RELATED,
      },
      {
        projectId: p4,
        fromTaskId: lqaChild.id,
        toTaskId: lqa.id,
        kind: TaskRelationKind.DEPENDS_ON,
      },
    ],
  });

  await prisma.taskHistory.createMany({
    data: [
      {
        taskId: root1.id,
        userId: admin.id,
        action: "create",
        field: "title",
        newValue: root1.title,
      },
      {
        taskId: child1.id,
        userId: member.id,
        action: "status",
        field: "status",
        oldValue: "todo",
        newValue: "blocked",
      },
    ],
  });

  console.log("Seed OK（游戏本地化音频 PM 虚拟项目）.");
  console.log("演示登录: 435236356@qq.com / 123456");
  console.log("其它 seed 用户: manager@demo.com、member@demo.com / demo123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
