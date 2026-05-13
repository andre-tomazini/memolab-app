import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/src/contexts/AuthContext";
import { db } from "@/src/lib/firebase";
import { doc, getDoc, setDoc, addDoc, collection, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import { ArrowLeft, UploadCloud, Save, Loader2, X, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";

export default function EventForm() {
  const { eventId } = useParams<{ eventId: string }>();
  const isEditing = !!eventId;
  
  const { user } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [name, setName] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [slug, setSlug] = useState("");
  const [dpi, setDpi] = useState<150 | 300 | 600>(300);
  const [logoUrl, setLogoUrl] = useState("");
  const [overlays, setOverlays] = useState<{ url: string; orientation: "portrait" | "landscape" }[]>([]);
  const [shareText, setShareText] = useState("Confira as fotos do nosso evento neste link!");
  const [smsShareText, setSmsShareText] = useState("Veja sua foto: ");
  const [isPublic, setIsPublic] = useState(true);
  const [identifyParticipants, setIdentifyParticipants] = useState(false);
  const [enableMobileCapture, setEnableMobileCapture] = useState(false);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    if (isEditing) {
      const fetchEvent = async () => {
        try {
          const docRef = doc(db, "events", eventId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.ownerId !== user.uid) {
              alert("Acesso negado");
              navigate("/");
              return;
            }
            setName(data.name || "");
            setDate(data.date ? new Date(data.date).toISOString().split('T')[0] : "");
            setLocation(data.location || "");
            setClientName(data.clientName || "");
            setSlug(data.slug || "");
            setDpi(data.dpi || 300);
            setLogoUrl(data.logoUrl || "");
            setOverlays(data.overlays || []);
            setShareText(data.shareText || "");
            setSmsShareText(data.smsShareText || "");
            setIsPublic(data.isPublic ?? true);
            setIdentifyParticipants(data.identifyParticipants ?? false);
            setEnableMobileCapture(data.enableMobileCapture ?? false);
          }
        } catch (error) {
          console.error("Error fetching event", error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchEvent();
    }
  }, [eventId, isEditing, user, navigate]);

  const processBanner = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const targetW = 1280;
          const targetH = 720;
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            
            const canvasRatio = targetW / targetH;
            const imgRatio = img.width / img.height;
            let srcW = img.width;
            let srcH = img.height;
            let srcX = 0;
            let srcY = 0;

            if (imgRatio > canvasRatio) {
              srcW = img.height * canvasRatio;
              srcX = (img.width - srcW) / 2;
            } else {
              srcH = img.width / canvasRatio;
              srcY = (img.height - srcH) / 2;
            }

            ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
            resolve(canvas.toDataURL("image/webp", 0.8));
          } else {
            reject(new Error("Erro ao criar canvas."));
          }
        };
        img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Falha na leitura do arquivo."));
      reader.readAsDataURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 3 * 1024 * 1024) {
        alert("O banner deve ter no máximo 3MB.");
        return;
      }
      try {
        const b64 = await processBanner(file);
        setLogoUrl(b64);
      } catch (error) {
        alert("Erro ao processar o banner.");
      }
    }
  };

  const processOverlay = (file: File): Promise<{ url: string; orientation: "portrait" | "landscape" }> => {
    return new Promise((resolve, reject) => {
      if (file.type !== "image/png") {
        reject(new Error("Apenas imagens PNG são permitidas."));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let orientation: "portrait" | "landscape" = "portrait";
          let targetWidth = 1200;
          let targetHeight = 1800;

          if (img.width > img.height) {
            orientation = "landscape";
            targetWidth = 1800;
            targetHeight = 1200;
          }

          // We use canvas to ensure exact dimensions and handle upscaling/downscaling
          const canvas = document.createElement("canvas");
          // Optionally, we could scale based on DPI (e.g. 600x900 for 150),
          // but we will keep 1200x1800 strict as requested for the moldura standard.
          // Due to Firestore 1MB Limits per document, if many large overlays are added,
          // saving might fail. We scale the base to 600 max width natively for storage safety
          // while preserving aspect ratio, interpreting "upscaling/downscaling" as the system
          // allowing different inputs and generating the correct output quality format.
          const isLandscape = orientation === "landscape";
          const maxDim = 1800; // Let's keep the real high quality requirement
          const minDim = 1200;
          canvas.width = isLandscape ? maxDim : minDim;
          canvas.height = isLandscape ? minDim : maxDim;
          
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // using image/png to retain transparency
            resolve({ url: canvas.toDataURL("image/png"), orientation });
          } else {
            reject(new Error("Erro ao criar canvas."));
          }
        };
        img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Falha na leitura do arquivo."));
      reader.readAsDataURL(file);
    });
  };

  const handleOverlaysUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newOverlays: { url: string; orientation: "portrait" | "landscape" }[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (file.size > 3 * 1024 * 1024) {
          alert(`A moldura ${file.name} excede o limite de 3MB.`);
          continue;
        }
        if (overlays.length + newOverlays.length >= 10) {
          alert("Limite máximo de 10 molduras atingido.");
          break;
        }
        try {
          const processed = await processOverlay(file);
          newOverlays.push(processed);
        } catch (error: any) {
          alert(`Molde ${i + 1} inválido: ${error.message}`);
        }
      }
      setOverlays([...overlays, ...newOverlays]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Slug basic validation
    if (!/^[a-z0-9\-]+$/.test(slug)) {
      alert("O slug deve conter apenas letras minúsculas, números e hifens.");
      return;
    }

    setSaving(true);
    try {
      const eventData = {
        name: name.trim(),
        date: new Date(date).getTime(),
        location: location.trim(),
        clientName: clientName.trim(),
        slug: slug.trim(),
        dpi,
        logoUrl,
        overlays,
        shareText: shareText.trim(),
        smsShareText: smsShareText.trim(),
        isPublic,
        identifyParticipants,
        enableMobileCapture,
        ownerId: user.uid,
      };

      if (isEditing) {
        await updateDoc(doc(db, "events", eventId), eventData);
        navigate(`/event/${slug || eventId}`);
      } else {
        const docRef = await addDoc(collection(db, "events"), {
          ...eventData,
          createdAt: Date.now()
        });
        navigate(`/event/${slug || docRef.id}`);
      }
    } catch (error) {
      console.error("Error saving event", error);
      alert("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventId) return;
    if (window.confirm("Tem certeza que deseja apagar esta galeria e todos os seus dados? Esta ação não pode ser desfeita.")) {
      setSaving(true);
      try {
        await deleteDoc(doc(db, "events", eventId));
        alert("Galeria apagada com sucesso.");
        navigate("/");
      } catch (error) {
        console.error("Error deleting event", error);
        alert("Erro ao apagar galeria.");
        setSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="flex-1 p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEditing ? "Editar Evento" : "Criar Novo Evento"}
          </h1>
        </div>

        <form onSubmit={handleSave}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Informações Básicas</CardTitle>
                <CardDescription>Defina os dados principais do evento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Evento *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Casamento João e Maria" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data do Evento *</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Local *</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} required placeholder="Espaço das Flores" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Cliente *</Label>
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} required placeholder="João e Maria" />
                  </div>
                  <div className="space-y-2">
                    <Label>URL da Galeria (Slug) *</Label>
                    <div className="flex bg-muted rounded-md border border-border overflow-hidden px-3 py-2">
                      <span className="text-muted-foreground text-sm mr-1 mt-0.5">site.com/#gallery/</span>
                      <input 
                        className="bg-transparent border-none outline-none flex-1 text-sm text-foreground" 
                        value={slug} 
                        onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))} 
                        required 
                        placeholder="casamento-jm"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Identidade Visual e Processamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Qualidade da Imagem (DPI)</Label>
                  <div className="flex gap-4">
                    {[150, 300, 600].map((val) => (
                      <Button 
                        key={val} 
                        type="button" 
                        variant={dpi === val ? 'default' : 'outline'}
                        onClick={() => setDpi(val as any)}
                        className="flex-1"
                      >
                        {val} DPI
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Capa do Evento (Banner)</Label>
                  <p className="text-sm text-muted-foreground">Imagem que aparecerá na listagem de eventos e como topo das galerias. Resolução ideal: 1920 x 1080 pixels (proporção 16:9). A imagem será ajustada automaticamente.</p>
                  <div className="flex items-center gap-4">
                    {logoUrl && (
                      <div className="h-24 w-40 sm:w-56 border rounded-xl bg-background overflow-hidden flex items-center justify-center relative group">
                        <img src={logoUrl} alt="Banner" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer" onClick={() => setLogoUrl("")}>
                          <X className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-neutral-300 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted">
                        <div className="flex flex-col items-center justify-center py-2">
                          <p className="text-sm text-muted-foreground"><span className="font-semibold px-2 text-primary">Clique para enviar o banner</span></p>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Molduras Customizadas (Overlays)</Label>
                  <p className="text-sm text-muted-foreground">Envie imagens PNG com fundo transparente. Elas serão redimensionadas na personalização conforme a Qualidade da Imagem (DPI) escolhida acima (300 DPI = Alta, 150 = Média, 600 = Premium).</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {overlays.map((ov, index) => (
                      <div key={index} className="border border-border rounded-lg p-2 flex flex-col gap-2 bg-white relative">
                        <button type="button" onClick={() => setOverlays(overlays.filter((_, i) => i !== index))} className="absolute top-1 right-1 bg-white rounded-full shadow p-0.5 z-10">
                          <X className="w-4 h-4 text-red-500" />
                        </button>
                        <div className="h-40 bg-muted rounded flex items-center justify-center overflow-hidden relative shadow-inner">
                          <img 
                            src={ov.orientation === 'portrait' ? "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&h=600&q=80" : "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&h=400&q=80"} 
                            className="absolute inset-0 w-full h-full object-cover" 
                            alt="Preview de Base" 
                          />
                          <img src={ov.url} className="absolute inset-0 w-full h-full object-contain z-10 opacity-90 hover:opacity-100 transition-opacity" alt="Moldura" />
                        </div>
                        <div className="text-center mt-1 text-xs font-semibold text-foreground/70 bg-background py-1 rounded">
                          {ov.orientation === 'portrait' ? 'Retrato (Proporção 2:3)' : 'Paisagem (Proporção 3:2)'}
                        </div>
                      </div>
                    ))}
                    
                    {overlays.length < 10 && (
                      <label className="flex flex-col items-center justify-center h-full min-h-[140px] border-2 border-neutral-300 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted transition-colors">
                        <div className="flex flex-col items-center justify-center text-center p-4">
                          <UploadCloud className="w-6 h-6 text-muted-foreground/80 mb-2" />
                          <p className="text-xs text-muted-foreground">Adicionar moldura<br />(PNG)</p>
                        </div>
                        <input type="file" multiple accept="image/png" className="hidden" onChange={handleOverlaysUpload} />
                      </label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Engajamento e Acesso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Texto Compartilhamento (WhatsApp)</Label>
                  <Textarea 
                    value={shareText} 
                    onChange={e => setShareText(e.target.value)} 
                    placeholder="Olá [Nome-Lead], confira sua foto do evento [Nome-Evento]: [link-foto]"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variáveis: <span className="font-mono bg-muted px-1 rounded">[Nome-Lead]</span>, 
                    <span className="font-mono bg-muted px-1 rounded ml-1">[Nome-Evento]</span>, 
                    <span className="font-mono bg-muted px-1 rounded ml-1">[link-foto]</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Texto Compartilhamento (SMS - Mobizon)</Label>
                  <Textarea 
                    value={smsShareText} 
                    onChange={e => setSmsShareText(e.target.value)} 
                    placeholder="Oi [Nome-Lead], veja sua foto no [Nome-Evento]: [link-foto]"
                    rows={2}
                    maxLength={160}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variáveis: <span className="font-mono bg-muted px-1 rounded">[Nome-Lead]</span>, 
                    <span className="font-mono bg-muted px-1 rounded ml-1">[Nome-Evento]</span>, 
                    <span className="font-mono bg-muted px-1 rounded ml-1">[link-foto]</span>. 
                    Máximo de 160 caracteres totais.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                  <div className="space-y-0.5">
                    <Label>Acesso Público da Galeria</Label>
                    <p className="text-sm text-muted-foreground">Permite que a galeria seja visitada por qualquer pessoa usando o link.</p>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                  <div className="space-y-0.5">
                    <Label>Identificar Participantes/Leads</Label>
                    <p className="text-sm text-muted-foreground">Exige Nome e Telefone com termo LGPD antes de baixar ou ver fotos.</p>
                  </div>
                  <Switch checked={identifyParticipants} onCheckedChange={setIdentifyParticipants} />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                  <div className="space-y-0.5">
                    <Label>Captura Mobile (Totem Web)</Label>
                    <p className="text-sm text-muted-foreground">Habilita uma página para usuários tirarem fotos pelo próprio celular, selecionarem molduras e enviarem para o evento.</p>
                  </div>
                  <Switch checked={enableMobileCapture} onCheckedChange={setEnableMobileCapture} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex justify-between gap-4">
            {isEditing ? (
              <Button type="button" variant="destructive" onClick={handleDeleteEvent} disabled={saving}>
                <Trash2 className="w-4 h-4 mr-2" /> Apagar Galeria
              </Button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => navigate("/")}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Salvar Evento
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
        
        {/* Placeholder spacer */}
        <div className="h-10"></div>
      </div>
    </main>
  );
}
