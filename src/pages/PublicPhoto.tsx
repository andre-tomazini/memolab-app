import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "@/src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { getStandardFilename } from "@/src/lib/shareUtils";

import { useEvent } from "@/src/lib/useEvent";
import { handleFirestoreError, OperationType } from "@/src/lib/firestoreUtils";

interface PhotoItem {
  id: string;
  dataUrl: string;
}

export default function PublicPhoto() {
  const { eventId, photoId } = useParams<{ eventId: string; photoId: string }>();
  
  const { eventData, loading, quotaError } = useEvent(eventId);
  const [photo, setPhoto] = useState<PhotoItem | null>(null);
  const [photosLoading, setPhotosLoading] = useState(true);

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

  return (
    <div className="min-h-[100dvh] bg-neutral-50/50 flex flex-col items-center justify-between py-6 sm:py-10 px-4 font-sans">
      {/* Header */}
      <div className="w-full flex justify-between items-center max-w-5xl mx-auto mb-6 sm:mb-10 shrink-0">
        <Link to="/">
          <span className="font-bold text-xl sm:text-2xl tracking-tight text-neutral-900 hover:opacity-70 transition-opacity">
            memo<span className="font-light text-primary">LAB</span>
          </span>
        </Link>
        <Link to={`/g/${eventId}`}>
          <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50 rounded-full text-xs font-medium px-4">
            Voltar à Galeria
          </Button>
        </Link>
      </div>

      {/* Photo Stage */}
      <div className="flex-1 w-full max-w-4xl mx-auto flex items-center justify-center min-h-0 relative">
        <div className="bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-xl shadow-black/5 border border-neutral-200/60 flex flex-col items-center transition-all">
          <img 
            src={photo.dataUrl} 
            alt={`Foto de ${eventData.name}`} 
            className="max-w-full max-h-[60vh] sm:max-h-[70vh] object-contain rounded-lg" 
          />
          <div className="mt-3 sm:mt-4 mb-1 w-full px-2 sm:px-4 flex justify-between items-center opacity-30">
             <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-900">memo.LAB</span>
             <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-900 truncate max-w-[150px] text-right">{eventData.name}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm mx-auto shrink-0 flex flex-col items-center mt-8 sm:mt-10 space-y-5">
        <div className="text-center space-y-1 w-full">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">{eventData.name}</h2>
          <p className="text-sm text-neutral-500 font-medium">
             {eventData.date ? new Date(eventData.date).toLocaleDateString() : ""}
          </p>
        </div>
        
        <Button 
          size="lg" 
          onClick={downloadImage} 
          className="w-full justify-center gap-3 bg-neutral-900 hover:bg-black text-white h-14 sm:h-16 rounded-xl sm:rounded-2xl text-[15px] font-medium shadow-lg shadow-neutral-900/10 transition-all active:scale-[0.98]"
        >
          <Download className="w-5 h-5" />
          Baixar Imagem
        </Button>
      </div>

      {eventData.lgpdText && (
        <footer className="w-full max-w-md mx-auto mt-10 shrink-0">
           <p className="text-[10px] sm:text-xs text-neutral-400 text-center leading-relaxed">
              {eventData.lgpdText}
           </p>
        </footer>
      )}
    </div>
  );
}
