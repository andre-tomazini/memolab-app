import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "@/src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { Download, MessageCircle, ArrowLeft, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/src/components/ui/card";
import { formatMessage, generateShortLink, getStandardFilename } from "@/src/lib/shareUtils";
import { collection, query, orderBy, getDocs, where, limit, addDoc } from "firebase/firestore";

import { useEvent } from "@/src/lib/useEvent";
import { handleFirestoreError, OperationType } from "@/src/lib/firestoreUtils";

interface PhotoItem {
  id: string;
  dataUrl: string;
}

export default function PublicPhoto() {
  const { eventId, photoId } = useParams<{ eventId: string; photoId: string }>();
  const navigate = useNavigate();
  
  const { eventData, loading, quotaError } = useEvent(eventId);
  const [photo, setPhoto] = useState<PhotoItem | null>(null);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [shortLink, setShortLink] = useState<string | null>(null);

  useEffect(() => {
    async function loadPhoto() {
      if (!eventData || !photoId) return;
      setPhotosLoading(true);
      try {
        const photoDoc = await getDoc(doc(db, "events", eventData.id, "photos", photoId));
        if (photoDoc.exists()) {
          const data = photoDoc.data() as any;
          if (!data.moderationStatus || data.moderationStatus === 'approved') {
            setPhoto({ id: photoDoc.id, ...data } as PhotoItem);
            
            // Generate short link for copying
            const sLink = await generateShortLink(eventData.id, photoDoc.id);
            setShortLink(sLink);
          } else {
            setPhoto(null);
          }
        } else {
          setPhoto(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `events/${eventData.id}/photos/${photoId}`);
      } finally {
        setPhotosLoading(false);
      }
    }
    loadPhoto();
  }, [eventData, photoId]);

  if (loading || photosLoading) {
    return (
      <div className="flex-1 min-h-screen flex justify-center items-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (quotaError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-background h-full">
        <h2 className="text-xl font-bold text-red-600 mb-2">Limite de Acesso Atingido</h2>
        <p className="text-foreground/70 max-w-md mb-6">Esta aplicação atingiu o limite de consultas gratuitas diárias do Firebase. O acesso será restaurado automaticamente amanhã.</p>
        <Link to="/">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    );
  }

  if (!eventData || !photo) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-background h-full">
        <h2 className="text-xl font-semibold text-foreground/90 mb-2">Foto não encontrada</h2>
        <p className="text-muted-foreground mb-6">A foto pode ter sido removida ou o link é inválido.</p>
        <Link to="/">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    );
  }

  const downloadImage = () => {
    if (!eventData || !photo) return;
    const filename = getStandardFilename(eventData.name, eventData.date, photo.id.slice(-4));
    
    const link = document.createElement("a");
    link.href = photo.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareWhatsApp = async () => {
    if (!eventData || !photo) return;
    const photoLink = await generateShortLink(eventData.id, photo.id);
    const finalMsg = formatMessage(eventData.shareText || "", "Convidado", eventData.name, photoLink);

    // Log WhatsApp click
    try {
      await addDoc(collection(db, "events", eventData.id, "messages"), {
        eventId: eventData.id,
        photoId: photo.id,
        recipientName: "Convidado",
        method: "whatsapp",
        status: "clicked",
        messageText: finalMsg,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Error logging whatsapp message from public page:", err);
    }

    const text = encodeURIComponent(finalMsg);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    toast.success("WhatsApp preparado com sucesso!");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-12 font-sans text-foreground">
      {/* Navbar / Header */}
      <header className="w-full bg-card border-b border-border h-16 flex items-center justify-between px-4 sm:px-8 shrink-0 z-30">
        <div className="flex z-30">
          <Link to="/">
            <span className="font-bold text-xl tracking-tight text-foreground hover:opacity-80 transition-opacity">memo<span className="font-light text-primary">LAB</span></span>
          </Link>
        </div>
        <div className="z-30">
          <Link to={`/g/${eventId}`}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <span className="hidden sm:inline">Ver Galeria Completa</span>
              <span className="sm:hidden">Galeria</span>
              <ArrowLeft className="w-4 h-4 sm:hidden" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Header Area (Compact) */}
      <div className="w-full relative z-10 flex flex-col items-center justify-center text-center pb-6 border-b border-border bg-card mb-8">
        {eventData.logoUrl ? (
          <div className="w-full h-32 sm:h-48 md:h-56 relative overflow-hidden mb-6">
            <img 
              src={eventData.logoUrl} 
              alt="Capa do Evento" 
              className="w-full h-full object-cover" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4 sm:p-8 text-left">
              <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-1 drop-shadow-md">
                    {eventData.name}
                  </h1>
                  <p className="text-white/90 font-medium text-xs sm:text-sm flex items-center gap-2 drop-shadow">
                    {eventData.date ? new Date(eventData.date).toLocaleDateString() : ""}
                    {eventData.date && eventData.location && <span className="w-1 h-1 rounded-full bg-white/60" />}
                    {eventData.location}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-10 pb-4 px-4 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
              {eventData.name}
            </h1>
            <p className="text-muted-foreground font-medium text-sm flex items-center justify-center gap-2">
              {eventData.date ? new Date(eventData.date).toLocaleDateString() : ""}
              {eventData.date && eventData.location && <span className="w-1 h-1 rounded-full bg-border" />}
              {eventData.location}
            </p>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="w-full max-w-6xl mx-auto px-4 flex-1 flex flex-col items-center">

        {/* Photo Card */}
        <div className="w-full max-w-5xl bg-card shadow-2xl border border-border/40 rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row mb-12">
          
          {/* Left: Image Container */}
          <div className="flex-1 bg-neutral-50 relative flex items-center justify-center min-h-[50vh] p-6 sm:p-12 backdrop-blur-sm">
             <div className="bg-white p-2 pb-10 sm:p-4 sm:pb-14 rounded shadow-2xl border border-neutral-100 flex flex-col items-center">
               <img src={photo.dataUrl} alt="Sua foto do evento" className="max-h-[70vh] w-auto object-contain rounded-sm" />
               <div className="mt-4 sm:mt-6 w-full px-4 flex justify-between items-center opacity-30">
                  <span className="text-[10px] font-bold tracking-tighter uppercase">memo.LAB • PHOTO</span>
                  <span className="text-[10px] font-bold tracking-tighter uppercase">{eventData.name}</span>
               </div>
             </div>
          </div>

          {/* Right: Actions */}
          <div className="w-full md:w-[400px] flex flex-col justify-between p-8 sm:p-12 border-l border-border/40 bg-card">
             <div className="flex-1 flex flex-col justify-center">
                <div className="mb-10">
                   <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                      Sua Lembrança
                   </div>
                   <h3 className="font-bold text-3xl text-foreground tracking-tight">Pronta para brilhar!</h3>
                   <p className="text-muted-foreground mt-4 leading-relaxed text-lg">Guarde este momento para sempre. Baixe agora ou compartilhe com quem você ama.</p>
                </div>

                <div className="grid gap-4">
                  <Button size="lg" onClick={downloadImage} className="w-full justify-center gap-3 bg-primary hover:bg-primary/90 text-primary-foreground h-16 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
                    <Download className="w-6 h-6" />
                    Baixar Foto
                  </Button>
                  
                  <Button size="lg" onClick={shareWhatsApp} className="w-full justify-center gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-white h-16 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
                    <MessageCircle className="w-6 h-6" />
                    Enviar WhatsApp
                  </Button>
                </div>
             </div>

             <div className="mt-12 pt-8 border-t border-border/50">
                <label className="text-xs font-black text-foreground/40 uppercase tracking-[0.2em] mb-3 block">Link da Foto</label>
                <div 
                  className="bg-muted/30 px-5 py-4 rounded-2xl border border-border/60 w-full flex items-center justify-between cursor-pointer hover:border-primary/50 transition-all group" 
                  onClick={() => {
                    navigator.clipboard.writeText(shortLink || window.location.href);
                    toast.success("Link copiado para a área de transferência!");
                  }}
                >
                  <span className="text-sm font-medium text-muted-foreground truncate mr-4">
                     {(shortLink || window.location.href).split('://')[1]}
                  </span>
                  <div className="h-8 w-8 rounded-lg bg-white border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors">
                     <Download className="w-4 h-4 text-muted-foreground group-hover:text-white rotate-[270deg]" />
                  </div>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      {eventData.lgpdText && (
        <footer className="w-full max-w-5xl mx-auto px-4 mt-8 pt-6 border-t border-border/40">
           <p className="text-[10px] text-muted-foreground/40 text-center leading-relaxed italic">
              {eventData.lgpdText}
           </p>
        </footer>
      )}
    </div>
  );
}
