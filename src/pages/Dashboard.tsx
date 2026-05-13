import { useAuth } from "@/src/contexts/AuthContext";
import { db } from "@/src/lib/firebase";
import { collection, query, where, addDoc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Plus, Calendar, ArrowRight, Image as ImageIcon, Pencil, QrCode, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/src/components/ui/dialog";
import { generateShortCaptureLink } from "@/src/lib/shareUtils";

interface EventItem {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  date?: number;
  watermarkText?: string;
  enableMobileCapture?: boolean;
  createdAt: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [quotaError, setQuotaError] = useState(false);
  const [selectedMobileCapture, setSelectedMobileCapture] = useState<EventItem | null>(null);
  const [shortUrl, setShortUrl] = useState<string>("");

  const handleCopyMobileLink = () => {
    if (!shortUrl) return;
    navigator.clipboard.writeText(shortUrl);
    toast.success('Link de Captura copiado!');
  };

  useEffect(() => {
    async function prepareShortUrl() {
        if (selectedMobileCapture) {
            const url = await generateShortCaptureLink(selectedMobileCapture.id);
            setShortUrl(url);
        } else {
            setShortUrl("");
        }
    }
    prepareShortUrl();
  }, [selectedMobileCapture]);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, "events"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EventItem[];
      
      docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setEvents(docs);
      setQuotaError(false);
    }, (error: any) => {
      if (error.message?.includes("Quota exceeded")) {
        setQuotaError(true);
      } else {
        console.error("Error fetching events", error);
      }
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Gerencie seus eventos e galerias de fotos</p>
        </div>
        <Button onClick={() => navigate('/events/new')} className="gap-2 shrink-0 shadow-lg rounded-xl h-12 px-6" size="lg">
          <Plus className="w-5 h-5" />
          Novo Evento
        </Button>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b border-border/60 pb-3">
          <Calendar className="w-5 h-5 text-primary" />
          Eventos Recentes
        </h2>
        
        {quotaError ? (
          <div className="p-12 bg-destructive/5 border border-destructive/20 rounded-3xl text-center">
            <p className="text-destructive font-bold text-lg mb-2">
              Cota Diária Atingida
            </p>
            <p className="text-destructive/80 text-sm">
              A cota diária do Firebase foi atingida. Os dados serão restaurados amanhã.
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center p-20 bg-card rounded-[2.5rem] border-2 border-border border-dashed">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-2xl font-black tracking-tight text-foreground mb-3">Nenhum evento criado</h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">Comece agora criando seu primeiro evento de fotolembrança.</p>
            <Button onClick={() => navigate('/events/new')} variant="outline" className="rounded-xl h-12 px-8 font-bold border-2">Criar Primeiro Evento</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {events.map((ev) => (
              <Card key={ev.id} className="group hover:border-primary/50 hover:shadow-2xl transition-all cursor-pointer overflow-hidden flex flex-col bg-card rounded-[2rem] border-border/60 shadow-sm" onClick={() => navigate(`/event/${ev.slug || ev.id}`)}>
                {ev.logoUrl ? (
                  <div className="w-full h-48 bg-muted relative overflow-hidden">
                    <img src={ev.logoUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={ev.name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                      <span className="text-white font-bold text-sm flex items-center gap-2">Gerenciar Evento <ArrowRight className="w-4 h-4"/></span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-48 bg-muted flex flex-col items-center justify-center transition-colors group-hover:bg-muted/80">
                    <ImageIcon className="w-12 h-12 text-muted-foreground/20 mb-3" />
                  </div>
                )}
                <CardHeader className="pb-4 px-6 pt-6">
                  <CardTitle className="text-2xl font-black tracking-tight group-hover:text-primary transition-colors truncate" title={ev.name}>{ev.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 font-medium">
                    <Calendar className="w-4 h-4 text-primary" />
                    {ev.date ? new Date(ev.date).toLocaleDateString('pt-BR') : new Date(ev.createdAt).toLocaleDateString('pt-BR')}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0 flex justify-between items-center bg-muted/30 px-6 py-4 mt-auto border-t border-border/40">
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 transition-colors group-hover:text-primary">Acessar</span>
                  <div className="flex gap-2">
                    {ev.enableMobileCapture && (
                      <Button 
                        title="QR Code Captura Mobile"
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-10 w-10 rounded-full"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setSelectedMobileCapture(ev);
                        }}
                      >
                        <QrCode className="w-5 h-5" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-10 w-10 rounded-full"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        navigate(`/events/${ev.id}/edit`); 
                      }}
                    >
                      <Pencil className="w-5 h-5" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedMobileCapture} onOpenChange={(o) => (!o && setSelectedMobileCapture(null))}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-6 md:p-8 border-none bg-white shadow-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-3xl font-black tracking-tighter text-center text-foreground">Captura Mobile</DialogTitle>
            <DialogDescription className="text-center px-2 leading-relaxed font-medium text-muted-foreground">
              Seus convidados escaneiam para enviar fotos diretamente para a galeria do evento em tempo real.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center justify-center pt-6">
            <div className="p-6 bg-white rounded-[2rem] shadow-xl border-4 border-muted/5 flex items-center justify-center mb-8 transition-transform hover:scale-105 duration-500">
              {shortUrl ? (
                <QRCode 
                  value={shortUrl} 
                  size={180} 
                  level="H"
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                />
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
            </div>
            
            <div className="w-full">
              <Button 
                 variant="outline"
                 disabled={!shortUrl}
                 className="w-full h-16 rounded-[1.5rem] border-2 border-primary/20 hover:border-primary hover:bg-primary/5 font-black tracking-tight flex items-center justify-center gap-3 transition-all active:scale-95" 
                 onClick={handleCopyMobileLink}
               >
                 <Copy className="w-5 h-5 text-primary" />
                 Copiar Link de Captura
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
