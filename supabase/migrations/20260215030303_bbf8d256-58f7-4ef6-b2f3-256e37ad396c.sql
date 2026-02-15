
-- Add icon and budget_amount to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon text DEFAULT '💼';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS budget_amount numeric DEFAULT 0;

-- Add language, currency, decimal_places to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt-BR';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
