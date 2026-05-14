import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { db } from "@/src/lib/firebase";
import { collection, getDocs, query, orderBy, limit, getDoc, doc, addDoc, startAfter } from "firebase/firestore";
import { Loader2, Download, Share2, X, Camera, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEvent } from "@/src/lib/useEvent";
import { handleFirestoreError, OperationType } from "@/src/lib/firestoreUtils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import { generateShortLink, generateShortCaptureLink, generateShortGalleryLink } from "@/src/lib/shareUtils";

interface PhotoItem {
  id: string;
  dataUrl: string;
  createdAt: number;
}

export default function PublicGallery() {
  const { eventId: pathEventId, photoId: pathPhotoId } = useParams<{ eventId: string; photoId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve eventId and photoId synchronously from path or hash
  const resolved = (() => {
    let eid = pathEventId;
    let pid = pathPhotoId;
    if (!eid && location.hash) {
      const hash = location.hash.replace("#", "");
      if (hash) {
        const parts = hash.split("/");
        eid = parts[0];
        if (!pid && parts[1]) pid = parts[1];
      }
    }
    return { eid, pid };
  })();

  const eventId = resolved.eid;
  const photoId = resolved.pid;

  const { eventData, loading, quotaError } = useEvent(eventId);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  
  // Infinite scroll / pagination states
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  // Identification flow state
  const [step, setStep] = useState<'gallery' | 'identify'>('gallery');
  const [participant, setParticipant] = useState<any>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState<string | undefined>("+55");
  const [submittingParticipant, setSubmittingParticipant] = useState(false);

  useEffect(() => {
    async function loadPhotos() {
        if (!eventData && !loading) {
          // If event not found by the hook, try resolving as a short link
          if (eventId) {
            try {
              const shortDoc = await getDoc(doc(db, "shortLinks", eventId));
              if (shortDoc.exists()) {
                const data = shortDoc.data();
                if (data.type === 'capture') {
                  navigate(`/capturamobile/#${data.eventId}`, { replace: true });
                } else if (data.type === 'gallery') {
                  navigate(`/galeria/#${data.eventId}`, { replace: true });
                } else if (data.photoId) {
                  navigate(`/galeria/#${data.eventId}/${data.photoId}`, { replace: true });
                }
                return;
              }
            } catch (e) {
              console.error("Short link resolution error:", e);
            }
          }
          return;
        }
        
        if (!eventData) return;
        
        // Handle participant identification
        let guestId: string | null = null;
        try {
          guestId = localStorage.getItem(`guest_${eventData.id}`);
        } catch (e) {
          console.warn("LocalStorage access denied");
        }

        if (eventData.identifyParticipants && !guestId && !participant) {
            setStep('identify');
            return;
        }

        if (guestId && !participant) {
           const pSnap = await getDoc(doc(db, "events", eventData.id, "participants", guestId));
           if (pSnap.exists()) setParticipant(pSnap.data());
           else setStep('identify');
        }

        // Skip isPublic check for loading photos if they have the link
        setPhotosLoading(true);
        try {
            const photosQuery = query(
              collection(db, "events", eventData.id, "photos"), 
              orderBy("createdAt", "desc"), 
              limit(PAGE_SIZE)
            );
            const snap = await getDocs(photosQuery);
            const loadedPhotos = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((p: any) => !p.moderationStatus || p.moderationStatus === 'approved') as PhotoItem[];
            setPhotos(loadedPhotos);
            
            if (snap.docs.length > 0) {
              setLastVisible(snap.docs[snap.docs.length - 1]);
              setHasMore(snap.docs.length === PAGE_SIZE);
            } else {
              setHasMore(false);
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.LIST, `events/${eventData.id}/photos`);
        } finally {
            setPhotosLoading(false);
        }
    }
    loadPhotos();
  }, [eventData?.id, loading, eventId, navigate]);

  const loadMorePhotos = async () => {
    if (!eventData || !lastVisible || !hasMore || loadingMore) return;
    
    setLoadingMore(true);
    try {
      const photosQuery = query(
        collection(db, "events", eventData.id, "photos"), 
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(photosQuery);
      const loadedPhotos = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((p: any) => !p.moderationStatus || p.moderationStatus === 'approved') as PhotoItem[];
      
      setPhotos(prev => [...prev, ...loadedPhotos]);
      
      if (snap.docs.length > 0) {
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error loading more photos:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Update selected photo when URL changes
  useEffect(() => {
    async function handlePhotoSelection() {
      if (!photoId) {
        if (selectedPhoto) setSelectedPhoto(null);
        return;
      }
      
      const target = photos.find(p => p.id === photoId);
      if (target) {
        if (target.id !== selectedPhoto?.id) {
          setSelectedPhoto(target);
        }
      } else if (eventData?.id && (!selectedPhoto || selectedPhoto.id !== photoId) && !photosLoading) {
        // Direct fetch if not in the recent 200
        try {
          const docSnap = await getDoc(doc(db, "events", eventData.id, "photos", photoId));
          if (docSnap.exists()) {
             setSelectedPhoto({ id: docSnap.id, ...docSnap.data() } as PhotoItem);
          }
        } catch (e) {
          console.error("Error fetching specific photo:", e);
        }
      }
    }
    handlePhotoSelection();
  }, [photoId, photos, selectedPhoto, eventData?.id, photosLoading]);

  const handleParticipantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventData || !formName || !formPhone) return;

    setSubmittingParticipant(true);
    try {
      const participantId = `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await addDoc(collection(db, "events", eventData.id, "participants"), {
        eventId: eventData.id,
        userId: participantId,
        name: formName,
        phone: formPhone,
        lgpdAgreed: true,
        createdAt: Date.now()
      });
      
      setParticipant({ userId: participantId, name: formName, phone: formPhone });
      try {
        localStorage.setItem(`guest_${eventData.id}`, participantId);
      } catch (e) {
        console.warn("LocalStorage write denied");
      }
      setStep('gallery');
    } catch (error) {
      console.error("Error saving participant", error);
    } finally {
      setSubmittingParticipant(false);
    }
  };

  const handleDownload = async (photo: PhotoItem) => {
    try {
      const response = await fetch(photo.dataUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `photo-${photo.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Download iniciado!");
    } catch (err) {
      toast.error("Erro ao baixar foto.");
    }
  };

  const handleShare = async (photo: PhotoItem) => {
    const shareUrl = await generateShortLink(eventData!.id, photo.id);
    if (navigator.share) {
      navigator.share({
        title: 'memo.LAB - Foto do Evento',
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiado para a área de transferência!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-zinc-950 space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
          </div>
        </div>
        <span className="text-zinc-500 font-black text-xs uppercase tracking-[0.3em]">memo.LAB</span>
      </div>
    );
  }

  if (quotaError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
        <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-6">
          <X className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">Limite de Acesso Atingido</h2>
        <p className="text-zinc-400 max-w-md mb-8 font-medium">As consultas diárias gratuitas foram esgotadas. O acesso retornará em breve.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl px-8 border-white/10 hover:bg-white/5 h-14 font-black uppercase text-xs tracking-widest">
          Voltar ao Início
        </Button>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
        <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6">
          <X className="w-10 h-10 text-zinc-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">Evento não encontrado</h2>
        <p className="text-zinc-400 max-w-md mb-8 font-medium">Verifique o link ou entre em contato com a organização.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl px-8 border-white/10 hover:bg-white/5 h-14 font-black uppercase text-xs tracking-widest">
          Voltar ao Início
        </Button>
      </div>
    );
  }

  // identification logic removed or modified if needed
  // ... but for now, just removing the isPublic check block below
  
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col font-sans text-white selection:bg-primary selection:text-white">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[150px] rounded-full" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-24 flex items-center px-6 md:px-12 bg-black/40 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="font-black text-2xl tracking-tighter text-white group-hover:text-primary transition-colors">
              memo<span className="text-primary/70 group-hover:text-white">.LAB</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {eventData.enableMobileCapture && (
              <Button 
                onClick={() => navigate(`/capturamobile/#${eventData.slug || eventData.id}`)}
                className="hidden sm:flex h-12 rounded-full px-6 bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20"
              >
                <Camera className="w-4 h-4 mr-2" /> Capturar Foto
              </Button>
            )}
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <span className="text-[10px] font-black text-primary">{photos.length}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 md:px-12">
        <div className="max-w-7xl mx-auto w-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-8"
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 border border-white/5">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                Galeria Permanente
              </div>
              <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white uppercase leading-none break-words max-w-3xl">
                {eventData.name}
              </h1>
              <div className="flex flex-wrap items-center gap-6 text-zinc-400 font-bold text-sm tracking-tight uppercase">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">CLIENTE</span>
                  <span className="text-white">{eventData.clientName || 'Particular'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">DATA</span>
                  <span className="text-white">
                    {eventData.date ? new Date(eventData.date).toLocaleDateString("pt-BR") : "---"}
                  </span>
                </div>
              </div>
            </div>

            {eventData.logoUrl && (
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 2 }}
                className="relative hidden md:block"
              >
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-3xl" />
                <img 
                  src={eventData.logoUrl} 
                  alt="Logo" 
                  className="w-32 h-32 rounded-3xl object-cover border-2 border-white/10 shadow-2xl relative z-10 p-1 bg-zinc-900"
                />
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Gallery Grid */}
      <main className="flex-1 px-4 md:px-12 pb-32">
        <div className="max-w-7xl mx-auto w-full">
          {photosLoading ? (
            <div className="py-32 flex justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
            </div>
          ) : photos.length === 0 ? (
            <div className="py-32 text-center bg-white/2 rounded-[3.5rem] border border-white/5 flex flex-col items-center">
              <div className="w-24 h-24 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/5">
                <ImageIcon className="w-10 h-10 text-zinc-700" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">O palco está vazio</h3>
              <p className="text-zinc-500 max-w-sm font-medium">As fotos deste evento aparecerão aqui assim que forem registradas.</p>
            </div>
          ) : (
            <div className="space-y-12">
              <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 md:gap-6 space-y-4 md:space-y-6">
                {photos.map((photo, i) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative group cursor-pointer break-inside-avoid"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-[1.5rem] md:rounded-[2.5rem] blur-xl scale-95" />
                    <div className="relative overflow-hidden rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 bg-zinc-900 group-hover:border-primary/30 transition-all duration-500 shadow-xl shadow-black/50">
                      <img 
                        src={photo.dataUrl} 
                        alt="Foto do evento"
                        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-[10px] font-black uppercase tracking-widest bg-primary px-3 py-1.5 rounded-full">memo.LAB</span>
                          <div className="flex gap-2">
                             <button 
                              onClick={(e) => { e.stopPropagation(); handleDownload(photo); }}
                              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
                             >
                                <Download className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              {hasMore && (
                <div className="flex justify-center pt-8">
                  <Button
                    onClick={loadMorePhotos}
                    disabled={loadingMore}
                    variant="outline"
                    className="h-14 rounded-full px-10 border-white/10 bg-white/5 text-white font-bold tracking-widest uppercase hover:bg-white/10 transition-colors"
                  >
                    {loadingMore ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : null}
                    Carregar mais fotos
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox / Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 bg-black/95 backdrop-blur-2xl"
          >
            <button 
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-8 right-8 z-[110] w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <motion.div 
              layoutId={selectedPhoto.id}
              className="relative max-w-full max-h-full flex flex-col items-center gap-8"
            >
              <img 
                src={selectedPhoto.dataUrl} 
                className="max-w-[100dvw] max-h-[80dvh] md:max-h-[75dvh] object-contain rounded-2xl shadow-2xl shadow-primary/10"
                alt="Selected"
              />
              
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button 
                  onClick={() => handleDownload(selectedPhoto)}
                  className="h-16 rounded-2xl px-10 bg-white text-black hover:bg-zinc-200 font-black tracking-tight"
                >
                  <Download className="w-5 h-5 mr-3" /> BAIXAR IMAGEM
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleShare(selectedPhoto)}
                  className="h-16 rounded-2xl px-10 border-white/10 bg-white/5 text-white font-black tracking-tight"
                >
                  <Share2 className="w-5 h-5 mr-3" /> COMPARTILHAR
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-20 px-8 border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto w-full flex flex-col items-center text-center space-y-12">
          <div className="space-y-4">
            <span className="font-black text-4xl tracking-tighter text-white">
              memo<span className="text-primary/70">.LAB</span>
            </span>
            <p className="text-zinc-500 font-medium tracking-tight uppercase text-xs">
              © {new Date().getFullYear()} Plataforma Profissional de Fotolembrança
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
            <a href="#" className="hover:text-primary transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
            <a href="#" className="hover:text-primary transition-colors">Suporte</a>
            <a href="https://memolab.art" target="_blank" className="hover:text-primary transition-colors">Website</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
