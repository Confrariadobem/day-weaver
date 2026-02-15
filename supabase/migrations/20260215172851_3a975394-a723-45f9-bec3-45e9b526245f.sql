
-- Add responsible field to projects
ALTER TABLE public.projects ADD COLUMN responsible text;

-- Create project_resources table for resource allocation
CREATE TABLE public.project_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_resources ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can manage resources for their own projects
CREATE POLICY "Users manage own project resources"
  ON public.project_resources
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_resources.project_id AND projects.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_resources.project_id AND projects.user_id = auth.uid())
  );
