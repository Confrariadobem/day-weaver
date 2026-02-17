
-- Tabela de Investimentos
CREATE TABLE public.investments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  ticker text,
  type text NOT NULL DEFAULT 'stock', -- stock, crypto, fixed_income, fund, real_estate
  purchase_date date,
  purchase_price numeric DEFAULT 0,
  quantity numeric DEFAULT 0,
  current_price numeric DEFAULT 0,
  next_dividend_date date,
  dividend_amount numeric DEFAULT 0,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own investments"
  ON public.investments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_investments_updated_at
  BEFORE UPDATE ON public.investments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Campos de recorrência em financial_entries
ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS recurrence_type text, -- daily, weekly, biweekly, monthly, quarterly, semiannual, annual
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS investment_id uuid REFERENCES public.investments(id) ON DELETE SET NULL;
