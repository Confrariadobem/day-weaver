
-- Create financial_accounts table
CREATE TABLE public.financial_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank_account',
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  credit_limit NUMERIC,
  closing_day INTEGER,
  due_day INTEGER,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_account_type CHECK (type IN ('bank_account', 'credit_card', 'investment', 'wallet', 'cash', 'crypto'))
);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own accounts"
ON public.financial_accounts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add columns to financial_entries
ALTER TABLE public.financial_entries
ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id),
ADD COLUMN is_paid BOOLEAN DEFAULT false,
ADD COLUMN payment_date DATE,
ADD COLUMN payment_method TEXT;

-- Trigger for updated_at
CREATE TRIGGER update_financial_accounts_updated_at
BEFORE UPDATE ON public.financial_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
