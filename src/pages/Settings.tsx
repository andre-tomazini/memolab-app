import React, { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { db } from "@/src/lib/firebase";
import { doc, getDoc, setDoc, query, collection, collectionGroup, where, getCountFromServer, getDocs, limit } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { MessageSquare, Save, Settings as SettingsIcon, Send, Info, Activity, ShieldAlert, Cpu } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"sms" | "lgpd" | "about">("sms");
  const [lgpdText, setLgpdText] = useState("");

  // SMS Settings
  const [apiKey, setApiKey] = useState("");
  const [senderName, setSenderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);

  // About Settings
  const [stats, setStats] = useState({ events: 0, photos: 0, storage: 'Calculando...' });
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "settings", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.mobizon) {
            setApiKey(data.mobizon.apiKey || "");
            setSenderName(data.mobizon.senderName || "");
          }
          setLgpdText(data.lgpdText || "Ao prosseguir, você concorda que seus dados sejam utilizados para a finalidade de entrega das fotos deste evento.");
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== "about") return;
    let isMounted = true;
    const fetchStats = async () => {
      if (!isMounted) return;
      setLoadingStats(true);
      try {
        const evQuery = isAdmin 
          ? collection(db, "events") 
          : query(collection(db, "events"), where("ownerId", "==", user.uid));
        
        const evCountSnap = await getCountFromServer(evQuery);
        const eventCount = evCountSnap.data().count;

        if (isAdmin) {
          try {
            const pCountSnap = await getCountFromServer(collectionGroup(db, "photos"));
            const photosCount = pCountSnap.data().count;
            if (isMounted) {
              setStats({
                events: eventCount,
                photos: photosCount,
                storage: `~${(photosCount * 1.5).toFixed(1)} MB`
              });
            }
          } catch(e) {
            console.warn("Could not fetch photos count for admin", e);
            if (isMounted) {
              setStats({ events: eventCount, photos: 0, storage: "N/A" });
            }
          }
        } else {
          try {
             // To prevent massive quota waste we limit the query to most recent events
             const maxEventsToCount = 10;
             const evQueryLimited = query(collection(db, "events"), where("ownerId", "==", user.uid), limit(maxEventsToCount));
             const evSnap = await getDocs(evQueryLimited);
             let pCount = 0;
             for (const d of evSnap.docs) {
               const c = await getCountFromServer(collection(db, "events", d.id, "photos"));
               pCount += c.data().count;
             }
             if (isMounted) {
               setStats({
                 events: eventCount,
                 photos: pCount,
                 storage: `~${(pCount * 1.5).toFixed(1)} MB${eventCount > maxEventsToCount ? '+' : ''}`
               });
             }
          } catch(e) {
            if (isMounted) {
              setStats({ events: eventCount, photos: 0, storage: "N/A" });
            }
          }
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    };
    fetchStats();
    
    return () => { isMounted = false; };
  }, [user, isAdmin, activeTab]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSuccessMsg("");
    try {
        const docRef = doc(db, "settings", user.uid);
        await setDoc(docRef, {
            mobizon: {
                apiKey,
                senderName
            },
            lgpdText,
            updatedAt: Date.now()
        }, { merge: true });
        setSuccessMsg("Configurações salvas com sucesso!");
        setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
        console.error("Error saving settings:", err);
    } finally {
        setSaving(false);
    }
  };

  const handleTestSMS = async () => {
    if (!apiKey) {
      toast.error("Salve a Chave de API primeiro.");
      return;
    }
    if (!testPhone) {
      toast.error("Informe um número de telefone de teste.");
      return;
    }
    setTestSending(true);
    try {
      const resp = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          to: testPhone,
          text: "Este é um teste da API Mobizon integrada ao seu aplicativo de Eventos!",
          senderName
        })
      });
      const data = await resp.json();
      if (data.success) {
        toast.success("SMS enviado com sucesso!");
      } else {
        toast.error("Falha ao enviar: " + (data.error || JSON.stringify(data)));
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao conectar com o serviço.");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center p-6 bg-background h-full">
      <div className="w-full max-w-4xl mt-8">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-6 text-foreground/90">
          <SettingsIcon className="w-6 h-6" /> Configurações Globais
        </h1>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tabs Sidebar */}
          <div className="w-full md:w-64 shrink-0 flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab("sms")}
              className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "sms" 
                  ? "bg-white border text-primary border-l-4 border-l-primary shadow-sm border-y-neutral-200 border-r-neutral-200" 
                  : "text-foreground/70 hover:bg-border/50 hover:text-foreground"
              }`}
            >
                <MessageSquare className="w-4 h-4" />
                API SMS (Mobizon)
            </button>
            <button 
              onClick={() => setActiveTab("lgpd")}
              className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "lgpd" 
                   ? "bg-white border text-primary border-l-4 border-l-primary shadow-sm border-y-neutral-200 border-r-neutral-200" 
                  : "text-foreground/70 hover:bg-border/50 hover:text-foreground"
              }`}
            >
                <ShieldAlert className="w-4 h-4" />
                LGPD
            </button>
            <button 
              onClick={() => setActiveTab("about")}
              className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "about" 
                  ? "bg-white border text-primary border-l-4 border-l-primary shadow-sm border-y-neutral-200 border-r-neutral-200" 
                  : "text-foreground/70 hover:bg-border/50 hover:text-foreground"
              }`}
            >
                <Info className="w-4 h-4" />
                Sobre e Uso
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 space-y-6">
            {activeTab === "sms" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Configuração da API SMS (Mobizon)</CardTitle>
                    <CardDescription>
                      Configure a integração com a Mobizon para enviar SMS aos participantes que concordaram com os termos LGPD.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loading ? (
                        <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Chave de API (Mobizon)</label>
                                <Input 
                                    type="password" 
                                    placeholder="Insira sua API Key" 
                                    value={apiKey} 
                                    onChange={e => setApiKey(e.target.value)} 
                                />
                                <p className="text-xs text-muted-foreground">
                                    Você pode obter sua chave de API no painel da Mobizon.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nome do Remetente (Opcional)</label>
                                <Input 
                                    type="text" 
                                    placeholder="Ex: MeuEvento" 
                                    value={senderName} 
                                    onChange={e => setSenderName(e.target.value)} 
                                    maxLength={11}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Deve estar previamente aprovado na sua conta Mobizon. Máximo de 11 caracteres.
                                </p>
                            </div>
                        </>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between items-center border-t py-4">
                     {successMsg ? <span className="text-sm text-green-600 font-medium">{successMsg}</span> : <span />}
                     <Button onClick={handleSave} disabled={loading || saving} className="gap-2">
                        <Save className="w-4 h-4" />
                        {saving ? "Salvando..." : "Salvar Configurações"}
                     </Button>
                  </CardFooter>
                </Card>

                {!loading && <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Testar envio de SMS</CardTitle>
                    <CardDescription>Envie um SMS para verificar se as configurações estão corretas.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input 
                        type="tel" 
                        placeholder="Número com DDD (ex: 5511999999999)" 
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                    />
                  </CardContent>
                  <CardFooter>
                    <Button variant="secondary" onClick={handleTestSMS} disabled={testSending || loading}>
                       <Send className="w-4 h-4 mr-2" />
                       {testSending ? "Enviando..." : "Enviar Teste"}
                    </Button>
                  </CardFooter>
                </Card>}
              </>
            )}

            {activeTab === "lgpd" && (
              <Card>
                <CardHeader>
                  <CardTitle>Configurações de LGPD</CardTitle>
                  <CardDescription>
                    Configure o texto de consentimento que será exibido aos participantes na captura de leads e nos rodapés públicos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                      <label className="text-sm font-medium">Texto de Consentimento / Termos</label>
                      <textarea 
                        className="w-full min-h-[150px] p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        placeholder="Insira o texto dos termos de proteção de dados..."
                        value={lgpdText}
                        onChange={e => setLgpdText(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Este texto aparecerá nos formulários de captura e nos rodapés das galerias.
                      </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between items-center border-t py-4">
                   {successMsg ? <span className="text-sm text-green-600 font-medium">{successMsg}</span> : <span />}
                   <Button onClick={handleSave} disabled={loading || saving} className="gap-2">
                      <Save className="w-4 h-4" />
                      {saving ? "Salvando..." : "Salvar Configurações"}
                   </Button>
                </CardFooter>
              </Card>
            )}

            {activeTab === "about" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" /> Dashboard de Uso {isAdmin ? "(Administrador)" : ""}
                    </CardTitle>
                    <CardDescription>
                      Estatísticas gerais de uso no sistema.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingStats ? (
                      <div className="flex justify-center p-8">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-background p-4 rounded-lg border border-border/50 flex flex-col items-center text-center">
                          <span className="text-sm text-muted-foreground font-medium">Eventos</span>
                          <span className="text-3xl font-bold text-foreground/90 mt-2">{stats.events}</span>
                        </div>
                        <div className="bg-background p-4 rounded-lg border border-border/50 flex flex-col items-center text-center">
                          <span className="text-sm text-muted-foreground font-medium">Fotos</span>
                          <span className="text-3xl font-bold text-foreground/90 mt-2">{stats.photos}</span>
                        </div>
                        <div className="bg-background p-4 rounded-lg border border-border/50 flex flex-col items-center text-center">
                          <span className="text-sm text-muted-foreground font-medium">Armazenamento (Aprox.)</span>
                          <span className="text-xl font-bold text-foreground/90 mt-2 flex items-center h-full pb-1">{stats.storage}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-foreground/70" /> Sobre o Sistema
                    </CardTitle>
                    <CardDescription>
                      Informações de versão e build atuais.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-foreground/70">Versão do Sistema</span>
                      <span className="text-sm font-medium">1.2.0</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-foreground/70">Última Build Publicada</span>
                      <span className="text-sm font-medium">08 de Maio de 2026</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-foreground/70">Motor de Renderização</span>
                      <span className="text-sm font-medium">React + Vite + Firebase</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
