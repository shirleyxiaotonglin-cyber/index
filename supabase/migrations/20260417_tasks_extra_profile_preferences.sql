-- 流程图持久化：任务 extra（flowOrder / parallelGroup 等）
-- 工作区偏好：profiles.preferences（当前项目、视图、日程筛选等）
-- 在 Supabase SQL Editor 执行一次，或合并进现有迁移。

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tasks.extra IS 'Workgraph: flowOrder, parallelGroup, parallelWithTaskId';
COMMENT ON COLUMN public.profiles.preferences IS 'Workgraph: view, currentProjectId, workspaceTab, schedule filters';
