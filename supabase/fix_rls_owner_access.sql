-- 修复：项目 owner 在未写入 project_members 时无法 SELECT projects/tasks，刷新后数据「消失」。
-- 在 Supabase SQL Editor 中执行一次即可。

-- 关键修复：避免 project_members 的 RLS 递归导致 500。
-- 用 SECURITY DEFINER 函数绕过 project_members 自身策略判断成员身份。
CREATE OR REPLACE FUNCTION public.is_project_member_rls(p_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_member_rls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member_rls(text) TO anon, authenticated, service_role;

-- projects：创建者可读自己的项目，或项目成员可读
DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
DROP POLICY IF EXISTS "projects_select_owner_or_member" ON public.projects;
CREATE POLICY "projects_select_owner_or_member"
  ON public.projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_project_member_rls(id)
  );

-- project_members：项目 owner 可查看该行（用于补全成员列表），或成员互见
DROP POLICY IF EXISTS "pm_select_same_project" ON public.project_members;
DROP POLICY IF EXISTS "pm_select_owner_or_member" ON public.project_members;
CREATE POLICY "pm_select_owner_or_member"
  ON public.project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()
    )
  );

-- tasks：项目 owner 或成员
DROP POLICY IF EXISTS "tasks_all_if_member" ON public.tasks;
DROP POLICY IF EXISTS "tasks_all_owner_or_member" ON public.tasks;
CREATE POLICY "tasks_all_owner_or_member"
  ON public.tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.is_project_member_rls(project_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.is_project_member_rls(project_id)
  );

-- task_relations
DROP POLICY IF EXISTS "tr_all_if_member" ON public.task_relations;
DROP POLICY IF EXISTS "tr_all_owner_or_member" ON public.task_relations;
CREATE POLICY "tr_all_owner_or_member"
  ON public.task_relations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_relations.from_task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member_rls(p.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_relations.from_task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member_rls(p.id))
    )
  );

-- task_comments
DROP POLICY IF EXISTS "tc_all_if_member" ON public.task_comments;
DROP POLICY IF EXISTS "tc_all_owner_or_member" ON public.task_comments;
CREATE POLICY "tc_all_owner_or_member"
  ON public.task_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_comments.task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member_rls(p.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_comments.task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member_rls(p.id))
    )
  );

-- ------------------------------------------------------------
-- project_members 补充修复：
-- 1) upsert(onConflict: project_id,user_id) 需要唯一约束
-- 2) select("user_id, profiles(display_name)") 需要 user_id -> profiles.id 外键
-- 3) owner 初始化自己为 owner 成员时，需要 INSERT / UPDATE policy
-- ------------------------------------------------------------

-- 唯一约束：保证 on_conflict=project_id,user_id 可用
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_members_project_id_user_id_key'
      AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_project_id_user_id_key
      UNIQUE (project_id, user_id);
  END IF;
END $$;

-- 若缺少到 profiles(id) 的外键，则补上，供 PostgREST / Supabase 嵌套查询使用
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_members_user_id_fkey_profiles'
      AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_user_id_fkey_profiles
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 若缺少到 projects(id) 的外键，则补上
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_members_project_id_fkey'
      AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- owner 或已有成员可新增成员；允许用户把自己加进自己拥有的项目
DROP POLICY IF EXISTS "pm_insert_owner_or_member" ON public.project_members;
CREATE POLICY "pm_insert_owner_or_member"
  ON public.project_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.owner_id = auth.uid()
    )
  );

-- owner 或已有成员可更新成员记录（upsert 冲突时会命中 UPDATE）
DROP POLICY IF EXISTS "pm_update_owner_or_member" ON public.project_members;
CREATE POLICY "pm_update_owner_or_member"
  ON public.project_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.owner_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- owner 可删除成员；成员可删除自己
DROP POLICY IF EXISTS "pm_delete_owner_or_self" ON public.project_members;
CREATE POLICY "pm_delete_owner_or_self"
  ON public.project_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.owner_id = auth.uid()
    )
  );
