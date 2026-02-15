import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Moon, Sun, Save, Globe, CalendarDays, Clock, Bell } from "lucide-react";

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "Libra (£)" },
];

const DECIMAL_OPTIONS = [
  { value: "0", label: "0 casas" },
  { value: "2", label: "2 casas" },
  { value: "3", label: "3 casas" },
  { value: "4", label: "4 casas" },
];

const WEEK_STARTS = [
  { value: "sunday", label: "Domingo" },
  { value: "monday", label: "Segunda-feira" },
];

const TIME_FORMATS = [
  { value: "24h", label: "24 horas (14:00)" },
  { value: "12h", label: "12 horas (2:00 PM)" },
];

const DEFAULT_VIEWS = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "today", label: "Diário" },
  { value: "3days", label: "3 Dias" },
];

const SLOT_DURATIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
];

const REMINDER_OPTIONS = [
  { value: "0", label: "No momento" },
  { value: "5", label: "5 minutos antes" },
  { value: "10", label: "10 minutos antes" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
];

export default function PreferencesView() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [language, setLanguage] = useState("pt-BR");
  const [currency, setCurrency] = useState("BRL");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [weekStart, setWeekStart] = useState("sunday");
  const [timeFormat, setTimeFormat] = useState("24h");
  const [defaultView, setDefaultView] = useState("monthly");
  const [slotDuration, setSlotDuration] = useState("60");
  const [defaultReminder, setDefaultReminder] = useState("15");
  const [showWeekNumbers, setShowWeekNumbers] = useState(true);
  const [showFinancials, setShowFinancials] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setLanguage((data as any).language || "pt-BR");
        setCurrency((data as any).currency || "BRL");
        setDecimalPlaces(String((data as any).decimal_places ?? 2));
      }
    });
  }, [user]);

  const savePrefs = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      language,
      currency,
      decimal_places: parseInt(decimalPlaces),
      theme_preference: theme,
    } as any).eq("user_id", user.id);
    toast({ title: "Preferências salvas!" });
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Preferências</h1>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Aparência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Modo Escuro</Label>
              <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
            </div>
          </CardContent>
        </Card>

        {/* Language & Currency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" /> Idioma e Moeda
            </CardTitle>
            <CardDescription>Configure o idioma e formato monetário</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Moeda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Casas Decimais</Label>
              <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DECIMAL_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" /> Calendário
            </CardTitle>
            <CardDescription>Configurações do calendário e agenda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Início da semana</Label>
              <Select value={weekStart} onValueChange={setWeekStart}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEK_STARTS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Formato de hora</Label>
              <Select value={timeFormat} onValueChange={setTimeFormat}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_FORMATS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Visão padrão</Label>
              <Select value={defaultView} onValueChange={setDefaultView}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_VIEWS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Intervalo de horários (agenda)</Label>
              <Select value={slotDuration} onValueChange={setSlotDuration}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_DURATIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Mostrar números das semanas</Label>
                <Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Mostrar resumo financeiro</Label>
                <Switch checked={showFinancials} onCheckedChange={setShowFinancials} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Mostrar tarefas concluídas</Label>
                <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reminders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Lembretes
            </CardTitle>
            <CardDescription>Configurações padrão de notificações</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Lembrete padrão para novos eventos</Label>
              <Select value={defaultReminder} onValueChange={setDefaultReminder}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button onClick={savePrefs} className="gap-2">
          <Save className="h-4 w-4" /> Salvar Preferências
        </Button>
      </div>
    </div>
  );
}
