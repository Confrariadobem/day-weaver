import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCryptoPrices() {
  const [prices, setPrices] = useState<{
    btcUsd: number; btcBrl: number; ethUsd: number; ethBrl: number;
    usdBrl: number; loading: boolean; lastUpdated: Date | null;
  }>({
    btcUsd: 0, btcBrl: 0, ethUsd: 0, ethBrl: 0,
    usdBrl: 0, loading: true, lastUpdated: null,
  });

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,brl"
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const btcUsd = data.bitcoin?.usd || 0;
      const btcBrl = data.bitcoin?.brl || 0;
      const ethUsd = data.ethereum?.usd || 0;
      const ethBrl = data.ethereum?.brl || 0;
      const usdBrl = btcBrl > 0 && btcUsd > 0 ? btcBrl / btcUsd : 5.5;
      setPrices({
        btcUsd, btcBrl, ethUsd, ethBrl, usdBrl,
        loading: false, lastUpdated: new Date(),
      });
    } catch {
      setPrices(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const convertToBrl = (usdValue: number) => usdValue * prices.usdBrl;
  const convertToUsd = (brlValue: number) => prices.usdBrl > 0 ? brlValue / prices.usdBrl : 0;
  const convertToBtc = (brlValue: number) => prices.btcBrl > 0 ? brlValue / prices.btcBrl : 0;

  return { ...prices, convertToBrl, convertToUsd, convertToBtc, refetch: fetchPrices };
}
