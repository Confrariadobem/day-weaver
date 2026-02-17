import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type Investment = Tables<"investments">;

export function useInvestments() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvestments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", user.id)
      .order("name");
    if (data) setInvestments(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchInvestments();
    if (!user) return;
    const ch = supabase
      .channel("investments-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `user_id=eq.${user.id}` }, fetchInvestments)
      .subscribe();
    const handleDataChanged = () => fetchInvestments();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => { supabase.removeChannel(ch); window.removeEventListener("lovable:data-changed", handleDataChanged); };
  }, [user, fetchInvestments]);

  return { investments, loading, refetch: fetchInvestments };
}

export function useInvestment(id: string | null) {
  const { user } = useAuth();
  const [investment, setInvestment] = useState<Investment | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    const [invRes, entRes] = await Promise.all([
      supabase.from("investments").select("*").eq("id", id).single(),
      supabase.from("financial_entries").select("*").eq("user_id", user.id).eq("investment_id", id).order("entry_date", { ascending: false }),
    ]);
    if (invRes.data) setInvestment(invRes.data);
    if (entRes.data) setEntries(entRes.data);
    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    fetchDetail();
    if (!user || !id) return;
    const ch = supabase
      .channel(`investment-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `id=eq.${id}` }, fetchDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries", filter: `investment_id=eq.${id}` }, fetchDetail)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, id, fetchDetail]);

  return { investment, entries, loading, refetch: fetchDetail };
}

export function useAddInvestment() {
  const { user } = useAuth();

  const addInvestment = async (data: {
    name: string;
    ticker?: string;
    type: string;
    quantity: number;
    purchase_price: number;
    current_price: number;
    purchase_date?: string;
    next_dividend_date?: string;
    dividend_amount?: number;
    notes?: string;
  }) => {
    if (!user) return null;
    const { data: result, error } = await supabase.from("investments").insert({
      user_id: user.id,
      name: data.name,
      ticker: data.ticker || null,
      type: data.type,
      quantity: data.quantity,
      purchase_price: data.purchase_price,
      current_price: data.current_price,
      purchase_date: data.purchase_date || null,
      next_dividend_date: data.next_dividend_date || null,
      dividend_amount: data.dividend_amount || 0,
      notes: data.notes || null,
    }).select("id").single();
    if (error) throw error;
    return result;
  };

  const updateInvestment = async (id: string, data: Partial<Investment>) => {
    const { error } = await supabase.from("investments").update(data).eq("id", id);
    if (error) throw error;
  };

  const deleteInvestment = async (id: string) => {
    const { error } = await supabase.from("investments").delete().eq("id", id);
    if (error) throw error;
  };

  return { addInvestment, updateInvestment, deleteInvestment };
}
