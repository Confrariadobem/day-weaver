import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DateFormatType = "DD/MM/YYYY" | "YYYY/MM/DD";

interface DateFormatContextType {
  dateFormat: DateFormatType;
  setDateFormat: (f: DateFormatType) => void;
  /** Format a Date object to string according to user preference */
  formatDate: (d: Date | string) => string;
  /** Parse a masked string back to Date (or null if invalid) */
  parseDate: (s: string) => Date | null;
  /** Placeholder for inputs */
  placeholder: string;
  /** Mask regex parts for display */
  mask: string;
}

const DateFormatContext = createContext<DateFormatContextType>({
  dateFormat: "DD/MM/YYYY",
  setDateFormat: () => {},
  formatDate: () => "",
  parseDate: () => null,
  placeholder: "__/__/____",
  mask: "DD/MM/YYYY",
});

export const useDateFormat = () => useContext(DateFormatContext);

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dateFormat, setDateFormatState] = useState<DateFormatType>("DD/MM/YYYY");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("date_format")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const val = (data as any)?.date_format;
        if (val === "YYYY/MM/DD" || val === "DD/MM/YYYY") {
          setDateFormatState(val);
        }
      });
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.dateFormat) setDateFormatState(detail.dateFormat);
    };
    window.addEventListener("lovable:date-format-changed", handler);
    return () => window.removeEventListener("lovable:date-format-changed", handler);
  }, []);

  const setDateFormat = useCallback(
    async (f: DateFormatType) => {
      setDateFormatState(f);
      window.dispatchEvent(
        new CustomEvent("lovable:date-format-changed", { detail: { dateFormat: f } })
      );
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ date_format: f } as any)
        .eq("user_id", user.id);
    },
    [user]
  );

  const formatDate = useCallback(
    (d: Date | string) => {
      const date = typeof d === "string" ? new Date(d) : d;
      if (isNaN(date.getTime())) return "";
      const dd = pad(date.getDate());
      const mm = pad(date.getMonth() + 1);
      const yyyy = String(date.getFullYear());
      return dateFormat === "YYYY/MM/DD" ? `${yyyy}/${mm}/${dd}` : `${dd}/${mm}/${yyyy}`;
    },
    [dateFormat]
  );

  const parseDate = useCallback(
    (s: string): Date | null => {
      if (!s) return null;
      const parts = s.split("/");
      if (parts.length !== 3) return null;
      let day: number, month: number, year: number;
      if (dateFormat === "YYYY/MM/DD") {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100)
        return null;
      const date = new Date(year, month - 1, day);
      if (date.getDate() !== day || date.getMonth() !== month - 1) return null;
      return date;
    },
    [dateFormat]
  );

  const placeholder = dateFormat === "YYYY/MM/DD" ? "____/__/__" : "__/__/____";
  const mask = dateFormat;

  return (
    <DateFormatContext.Provider
      value={{ dateFormat, setDateFormat, formatDate, parseDate, placeholder, mask }}
    >
      {children}
    </DateFormatContext.Provider>
  );
}
