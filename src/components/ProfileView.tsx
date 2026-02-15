import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Save } from "lucide-react";

export default function ProfileView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name || "");
      }
    });
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      display_name: displayName,
    } as any).eq("user_id", user.id);
    toast({ title: "Perfil salvo!" });
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Perfil</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Dados do Usuário
            </CardTitle>
            <CardDescription>Gerencie suas informações pessoais</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="mt-1" />
            </div>
            <div>
              <Label>Nome de Exibição</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <Button onClick={saveProfile} size="sm" className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
