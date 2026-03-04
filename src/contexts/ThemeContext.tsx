import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

export type ThemeMode = "soul" | "dark" | "zen" | "ocean";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "soul",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("planmaster-theme");
    // Migrate old "dusk" to "dark"
    if (stored === "dusk") {
      localStorage.setItem("planmaster-theme", "dark");
      return "dark";
    }
    if (stored && ["soul", "dark", "zen", "ocean"].includes(stored)) return stored as ThemeMode;
    return "soul";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("soul", "dark-theme", "dusk", "zen", "ocean", "light", "dark");
    if (theme === "dark") {
      root.classList.add("dark-theme", "dark");
    } else if (theme === "zen" || theme === "ocean") {
      root.classList.add(theme, "dark");
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    const labels: Record<ThemeMode, string> = { soul: "Soul", dark: "Dark", zen: "Zen", ocean: "Ocean" };
    toast({ title: `Modo ${labels[t]} aplicado!` });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      localStorage.setItem("planmaster-theme", t);
    }, 1000);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
