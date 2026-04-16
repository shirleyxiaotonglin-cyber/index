-- 修复：项目 owner 在未写入 project_members 时无法 SELECT projects/tasks，刷新后数据「消失」。
-- 在 Supabase SQL Editor 中执行一次即可。

-- projects：创建者可读自己的项目，或项目成员可读
DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
CREATE POLICY "projects_select_owner_or_member"
  ON public.projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_project_member(id)
  );

-- project_members：项目 owner 可查看该行（用于补全成员列表），或成员互见
DROP POLICY IF EXISTS "pm_select_same_project" ON public.project_members;
CREATE POLICY "pm_select_owner_or_member"
  ON public.project_members FOR SELECT
  USING (
    public.is_project_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()
    )
  );

-- tasks：项目 owner 或成员
DROP POLICY IF EXISTS "tasks_all_if_member" ON public.tasks;
CREATE POLICY "tasks_all_owner_or_member"
  ON public.tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.is_project_member(project_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.is_project_member(project_id)
  );

-- task_relations
DROP POLICY IF EXISTS "tr_all_if_member" ON public.task_relations;
CREATE POLICY "tr_all_owner_or_member"
  ON public.task_relations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_relations.from_task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_relations.from_task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id))
    )
  );

-- task_comments
DROP POLICY IF EXISTS "tc_all_if_member" ON public.task_comments;
CREATE POLICY "tc_all_owner_or_member"
  ON public.task_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_comments.task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = task_comments.task_id
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id))
    )
  );
