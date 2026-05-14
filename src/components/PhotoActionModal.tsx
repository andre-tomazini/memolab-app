import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Download, MessageCircle, MessageSquare, Printer, Trash2, Send, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/src/lib/firebase';
import { doc, deleteDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import { LeadCapture } from './LeadCapture';
import { formatMessage, generateShortLink, getStandardFilename } from '@/src/lib/shareUtils';
import { useEffect } from 'react';

interface PhotoItem {
  id: string;
  eventId: string;
  dataUrl: string;
  originalUrl?: string; // made optional safely
  createdAt: any;
}

interface PhotoActionModalProps {
  photo: PhotoItem | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  shareText?: string;
  smsShareText?: string;
  eventName?: string;
  eventDate?: number;
  ownerId?: string;
  isOwner?: boolean;
}

export default function PhotoActionModal({ 
  photo, 
  onClose, 
  onNext,
  onPrev,
  shareText, 
  smsShareText, 
  eventName, 
  eventDate, 
  ownerId, 
  isOwner 
}: PhotoActionModalProps) {
  const [showLeadCapture, setShowLeadCapture] = useState<'whatsapp' | 'sms' | null>(null);
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [shortLink, setShortLink] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setShortLink(null);
      return;
    }
    let isMounted = true;
    const fetchLink = async () => {
      try {
        const link = await generateShortLink(photo.eventId, photo.id);
        if (isMounted) setShortLink(link);
      } catch (err) {
        console.error("Error generating short link", err);
      }
    };
    fetchLink();
    return () => {
      isMounted = false;
    };
  }, [photo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photo) return;
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, onNext, onPrev, onClose]);

  if (!photo) return null;

  const getFilename = (isOriginal = false) => {
    const baseName = getStandardFilename(eventName || "Evento", eventDate || Date.now(), photo.id.slice(-4));
    if (isOriginal) return `original-${baseName}`;
    return baseName;
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLeadContinue = async (name: string, phone: string) => {
    setIsSendingMsg(true);
    const photoLink = await generateShortLink(photo.eventId, photo.id);
    const leadName = name || "Convidado";

    if (showLeadCapture === 'whatsapp') {
       const cleanedPhone = phone.replace(/\D/g, "");
       const finalMsg = formatMessage(shareText || "", leadName, eventName || "Evento", photoLink);
       
       // Log WhatsApp click
       try {
         await addDoc(collection(db, "events", photo.eventId, "messages"), {
           eventId: photo.eventId,
           photoId: photo.id,
           recipientName: name,
           recipientPhone: phone,
           method: "whatsapp",
           status: "clicked",
           messageText: finalMsg,
           createdAt: Date.now()
         });
       } catch (err) {
         console.error("Error logging whatsapp message:", err);
       }

       const text = encodeURIComponent(finalMsg);
       window.open(`https://api.whatsapp.com/send?phone=${cleanedPhone}&text=${text}`, '_blank');
       toast.success("WhatsApp preparado com sucesso!");
       setShowLeadCapture(null);
       setSuccessMessage("WhatsApp Preparado!");
       setTimeout(() => setSuccessMessage(null), 3000);
       setIsSendingMsg(false);
       return;
    }

    if (showLeadCapture === 'sms') {
      if (!ownerId) {
        alert("Não foi possível identificar o organizador do evento.");
        setIsSendingMsg(false);
        return;
      }
      try {
        const settingsDoc = await getDoc(doc(db, "settings", ownerId));
        const mobizon = settingsDoc.data()?.mobizon;
        
        if (!mobizon || !mobizon.apiKey) {
          alert("O criador deste evento não configurou o envio de SMS (Mobizon).");
          setIsSendingMsg(false);
          return;
        }

        const finalMsg = formatMessage(smsShareText || "", leadName, eventName || "Evento", photoLink);

        const resp = await fetch("/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: mobizon.apiKey,
            to: phone,
            text: finalMsg,
            senderName: mobizon.senderName
          })
        });

        const data = await resp.json();

        // Log SMS attempt
        try {
          await addDoc(collection(db, "events", photo.eventId, "messages"), {
            eventId: photo.eventId,
            photoId: photo.id,
            recipientName: name,
            recipientPhone: phone,
            method: "sms",
            status: data.success ? "sent" : "failed",
            messageText: finalMsg,
            error: data.success ? null : data.error,
            createdAt: Date.now()
          });
        } catch (err) {
          console.error("Error logging sms message:", err);
        }

        if (data.success) {
          toast.success("SMS enviado com sucesso!");
          setShowLeadCapture(null);
          setSuccessMessage("SMS Enviado com Sucesso!");
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          toast.error("Falha ao enviar: " + (data.error || "Erro desconhecido"));
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao enviar SMS via Mobizon.");
      } finally {
        setIsSendingMsg(false);
      }
    }
  };

  const printImage = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir Foto</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              @media print { @page { margin: 0; } body { margin: 0; } }
            </style>
          </head>
          <body>
            <img src="${photo.dataUrl}" onload="window.print();window.close()" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Tem certeza que deseja apagar esta foto? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, "events", photo.eventId, "photos", photo.id));
        onClose();
      } catch (err) {
        console.error(err);
        alert("Erro ao apagar");
      }
    }
  };

  return (
    <Dialog open={!!photo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[98vw] w-[98vw] max-w-[98vw] h-[98vh] flex flex-col p-0 overflow-hidden bg-black/95 backdrop-blur-xl border-none ring-0 [&>button]:text-white [&>button]:hover:bg-white/20 [&>button]:z-50 shadow-2xl">
        <div className="flex flex-col h-full bg-transparent">
          <DialogHeader className="p-3 text-center border-b border-white/5 bg-black/40">
            <DialogTitle className="text-lg font-light tracking-wide text-white/90">Visualizar Foto</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-6 p-2 md:p-6 items-center justify-center overflow-hidden relative">
            <div className="flex-1 flex items-center justify-center relative h-full w-full min-h-0 group">
              {onPrev && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onPrev(); }}
                  className="absolute left-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all opacity-0 group-hover:opacity-100 hidden md:block"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
              )}
              {onNext && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onNext(); }}
                  className="absolute right-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all opacity-0 group-hover:opacity-100 hidden md:block"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              )}
              
              {/* Mobile Navigation controls */}
              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 z-50 md:hidden">
                {onPrev && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="p-3 rounded-full bg-black/50 text-white active:bg-black/80"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}
                {onNext && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="p-3 rounded-full bg-black/50 text-white active:bg-black/80"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}
              </div>

              <img 
                src={photo.dataUrl} 
                alt="Foto" 
                className="max-h-full max-w-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-500 rounded-sm" 
              />
            </div>
            
            <div className="flex flex-col gap-3 w-full md:w-80 shrink-0 overflow-y-auto max-h-full p-6 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
              {successMessage ? (
                <div className="min-h-[250px] flex flex-col items-center justify-center bg-green-500/10 border border-green-500/20 rounded-3xl p-8 text-center animate-in zoom-in-95 duration-300">
                   <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
                   <h3 className="text-xl font-bold text-green-400 tracking-tight">{successMessage}</h3>
                </div>
              ) : showLeadCapture ? (
                 <LeadCapture 
                    eventId={photo.eventId} 
                    method={showLeadCapture} 
                    onBack={() => setShowLeadCapture(null)} 
                    onContinue={handleLeadContinue} 
                 />
              ) : (
                <>
                  <Button size="lg" onClick={() => downloadImage(photo.dataUrl, getFilename())} className="w-full justify-start gap-3 bg-primary hover:bg-primary/90 text-white border-none shadow-lg">
                    <Download className="w-5 h-5" />
                    Alta Resolução
                  </Button>
                  <Button size="lg" onClick={() => setShowLeadCapture('whatsapp')} className="w-full justify-start gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-white border-none shadow-lg">
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp
                  </Button>
                  <Button size="lg" onClick={() => setShowLeadCapture('sms')} className="w-full justify-start gap-3 bg-slate-700 hover:bg-slate-800 text-white border-none shadow-lg">
                    <MessageSquare className="w-5 h-5" />
                    Envio por SMS
                  </Button>
                  <Button size="lg" onClick={printImage} className="w-full justify-start gap-3 bg-slate-600 hover:bg-slate-700 text-white border-none shadow-lg">
                    <Printer className="w-5 h-5" />
                    Imprimir
                  </Button>
                  
                  {photo.originalUrl && (
                    <Button size="lg" variant="secondary" onClick={() => downloadImage(photo.originalUrl!, getFilename(true))} className="w-full justify-start gap-3 mt-4 bg-white/20 hover:bg-white/30 text-white border-none">
                      <Download className="w-5 h-5" />
                      Foto Original
                    </Button>
                  )}

                  {isOwner && (
                    <Button size="lg" variant="destructive" onClick={handleDelete} className="w-full justify-start gap-3 mt-4 bg-red-600/80 hover:bg-red-600 text-white border-none">
                      <Trash2 className="w-5 h-5" />
                      Apagar Foto
                    </Button>
                  )}

                  {shortLink && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 block">Link da Foto</label>
                      <div 
                        className="bg-white/5 px-4 py-3 rounded-xl border border-white/10 w-full flex items-center justify-between cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all group" 
                        onClick={() => {
                          navigator.clipboard.writeText(shortLink);
                          toast.success("Link copiado para a área de transferência!");
                        }}
                      >
                        <span className="text-sm font-medium text-white/80 truncate mr-3">
                           {shortLink.replace(/^https?:\/\//, '')}
                        </span>
                        <div className="h-8 w-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors shrink-0">
                           <Download className="w-4 h-4 text-white/60 group-hover:text-white rotate-[270deg]" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
