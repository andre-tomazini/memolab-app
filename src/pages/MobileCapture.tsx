import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Loader2, Camera, Upload, Check, Printer, ChevronRight, RotateCcw, RotateCw, ZoomIn, ZoomOut, Download, X, SwitchCamera, FileText, ArrowLeft, Heart, Zap, ZapOff } from 'lucide-react';
import Cropper from 'react-easy-crop';
import Webcam from 'react-webcam';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// Add custom styles for the phone input to match the UI
const phoneInputStyles = `
  .custom-phone-input .PhoneInputInput {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.125rem;
    outline: none;
    width: 100%;
  }
  .custom-phone-input .PhoneInputCountrySelect {
    background: #09090b;
    color: white;
  }
  .custom-phone-input .PhoneInputCountryIcon {
    background-color: transparent;
  }
`;

import { useEvent, EventItem } from '@/src/lib/useEvent';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    if (url.startsWith('http')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function getFinalCanvas(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  rotation: number = 0,
  overlaySrc: string,
  dpiNumber: number = 300
): Promise<string> {
  const image = await createImage(imageSrc);
  const overlayInfo = await createImage(overlaySrc);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const rotSize = rotateSize(image.width, image.height, rotation);
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotSize.width;
  rotCanvas.height = rotSize.height;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) return '';

  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate(getRadianAngle(rotation));
  rotCtx.translate(-image.width / 2, -image.height / 2);
  rotCtx.drawImage(image, 0, 0);

  const overlayAspect = overlayInfo.width / overlayInfo.height;
  
  let baseH = 1800;
  if (dpiNumber === 150) baseH = 900;
  else if (dpiNumber === 600) baseH = 3600;

  let w = Math.round(baseH * overlayAspect);
  let h = baseH;

  if (overlayInfo.width > overlayInfo.height) {
     w = baseH;
     h = Math.round(baseH / overlayAspect);
  }

  const finalDim = { w, h };
  canvas.width = finalDim.w;
  canvas.height = finalDim.h;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, finalDim.w, finalDim.h);

  ctx.drawImage(
    rotCanvas,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, finalDim.w, finalDim.h
  );

  ctx.drawImage(overlayInfo, 0, 0, finalDim.w, finalDim.h);
  
  let quality = 0.95;
  let finalDataUrl = canvas.toDataURL('image/jpeg', quality);
  while (finalDataUrl.length > 850000 && quality > 0.1) {
    quality -= 0.1;
    finalDataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return finalDataUrl;
}

export default function MobileCapture() {
    const { eventId: pathEventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Resolve eventId synchronously from path or hash
    const resolved = (() => {
        let eid = pathEventId;
        if (!eid && location.hash) {
            eid = location.hash.replace("#", "").split("/")[0];
        }
        return eid;
    })();
    const eventId = resolved;
  
  const { eventData, loading, quotaError, setEventData } = useEvent(eventId);
  const [step, setStep] = useState<'WELCOME' | 'IDENTIFY' | 'CAPTURE' | 'FRAME' | 'ADJUST' | 'PREVIEW' | 'SUCCESS'>('WELCOME');
  
  // Identify State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | undefined>('+55');
  const [lgpdAgreed, setLgpdAgreed] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // Capture State
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isFlashOn, setIsFlashOn] = useState(false);

  // Add effect to manage flash (torch)
  useEffect(() => {
    if (step === 'CAPTURE' && isTakingPhoto && webcamRef.current) {
      const stream = webcamRef.current.video?.srcObject as MediaStream;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          track.applyConstraints({
            advanced: [{ torch: isFlashOn }]
          } as any).catch(e => console.log("Torch error:", e));
        }
      }
    }
  }, [isFlashOn, step, isTakingPhoto, facingMode]);
  
  // Frame State
  const [selectedOverlay, setSelectedOverlay] = useState<{ url: string; orientation: string } | null>(null);
  const [overlayAspect, setOverlayAspect] = useState<number>(2/3);
  
  // Crop State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  
  // Preview State
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && eventData) {
        // Try to restore participant from localStorage
        try {
          const savedId = localStorage.getItem(`guest_${eventData.id}`);
          if (savedId) {
            setParticipantId(savedId);
          }
        } catch (e) {
          console.warn("LocalStorage access denied");
        }
    }
  }, [loading, eventData]);

  useEffect(() => {
    if (step === 'SUCCESS') {
      setCountdown(15);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            resetFlow();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const resetFlow = () => {
    setStep('WELCOME');
    setName('');
    setPhone('');
    setLgpdAgreed(false);
    setParticipantId(null);
    setImageUrl(null);
    setSelectedOverlay(null);
    setFinalImage(null);
  };

  const handleIdentifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone || !eventData) return;
    if (!lgpdAgreed) {
      alert("Você precisa concordar com os termos para prosseguir.");
      return;
    }
    setIsProcessing(true);
    try {
      // Register participant
      const participantIdResult = `guest_mc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await addDoc(collection(db, "events", eventData.id, "participants"), {
        eventId: eventData.id,
        userId: participantIdResult, 
        name,
        phone,
        lgpdAgreed: true,
        createdAt: Date.now()
      });
      setParticipantId(participantIdResult);
      try {
        localStorage.setItem(`guest_${eventData.id}`, participantIdResult);
      } catch (e) {
        console.warn("LocalStorage write denied");
      }
      setStep('CAPTURE');
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCaptureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      
      // Basic image orientation detection based on reading natural dimensions
      const img = new Image();
      img.onload = () => {
         const orientation = img.width > img.height ? 'landscape' : 'portrait';
         if (eventData?.overlays) {
            // Sort to put compatible orientations first
            const sortedOverlays = [...eventData.overlays].sort((a, b) => {
               if (a.orientation === orientation && b.orientation !== orientation) return -1;
               if (b.orientation === orientation && a.orientation !== orientation) return 1;
               return 0;
            });
            // Update the eventData locally to reflect sorted (or store in a state)
            // For simplicity, we just keep them all shown, but the top ones are compatible.
            setEventData({ ...eventData, overlays: sortedOverlays });
         }
         setStep('FRAME');
      };
      img.src = url;
    }
  };

  const handleWebcamCapture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setImageUrl(imageSrc);
        const img = new Image();
        img.onload = () => {
           const orientation = img.width > img.height ? 'landscape' : 'portrait';
           if (eventData?.overlays) {
              const sortedOverlays = [...eventData.overlays].sort((a, b) => {
                 if (a.orientation === orientation && b.orientation !== orientation) return -1;
                 if (b.orientation === orientation && a.orientation !== orientation) return 1;
                 return 0;
              });
              setEventData({ ...eventData, overlays: sortedOverlays });
           }
           setIsTakingPhoto(false);
           setStep('FRAME');
        };
        img.src = imageSrc;
      }
    }
  }, [webcamRef, eventData, setEventData]);

  const handleSelectFrame = async (overlay: { url: string; orientation: string }) => {
    setSelectedOverlay(overlay);
    const imgInfo = await createImage(overlay.url);
    setOverlayAspect(imgInfo.width / imgInfo.height);
    setStep('ADJUST');
  };

  const generatePreview = async () => {
    if (!imageUrl || !croppedAreaPixels || !selectedOverlay || !eventData) return;
    setIsProcessing(true);
    try {
      const final = await getFinalCanvas(
        imageUrl,
        croppedAreaPixels,
        rotation,
        selectedOverlay.url,
        eventData.dpi || 300
      );
      setFinalImage(final);
      setStep('PREVIEW');
    } catch (err) {
      console.error(err);
      alert('Erro ao processar imagem');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendToPrint = async () => {
    if (!finalImage || !eventData) return;
    setIsProcessing(true);
    try {
      let currentUser = auth.currentUser;
      const uploaderId = currentUser ? currentUser.uid : 'anonymous';
      await addDoc(collection(db, "events", eventData.id, "photos"), {
        eventId: eventData.id,
        uploaderId: uploaderId, 
        dataUrl: finalImage,
        createdAt: Date.now(),
        participantId: participantId || '',
        printStatus: 'pending',
        moderationStatus: 'pending',
        source: 'mobile'
      });
      setStep('SUCCESS');
    } catch (err: any) {
      console.error("Firestore create error:", err);
      if (err.code) console.error("Code:", err.code);
      if (err.message) console.error("Message:", err.message);
      alert(`Erro ao enviar foto para impressão: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!finalImage) return;
    const link = document.createElement("a");
    link.href = finalImage;
    link.download = `mobile-${Date.now()}.jpg`;
    link.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-zinc-950 space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
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
        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">Limite Atingido</h2>
        <p className="text-zinc-400 max-w-md mb-8 font-medium">As consultas diárias gratuitas foram esgotadas. Tente novamente amanhã.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl px-8 border-white/10 hover:bg-white/5 h-14 font-black uppercase text-xs tracking-widest text-white">
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
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl px-8 border-white/10 hover:bg-white/5 h-14 font-black uppercase text-xs tracking-widest text-white">
          Voltar ao Início
        </Button>
      </div>
    );
  }

  if (!eventData.enableMobileCapture) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
        <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6">
          <ZapOff className="w-10 h-10 text-zinc-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">Captura Não Ativa</h2>
        <p className="text-zinc-400 max-w-md mb-8 font-medium">A captura mobile não está habilitada para este evento.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl px-8 border-white/10 hover:bg-white/5 h-14 font-black uppercase text-xs tracking-widest text-white">
          Voltar ao Início
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-white relative overflow-hidden flex items-center justify-center p-0 md:p-6 lg:p-12">
      <style>{phoneInputStyles}</style>
      {/* Background decoration for desktop */}
      <AnimatePresence>
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none hidden md:block">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
          {eventData.logoUrl && (
            <img 
              src={eventData.logoUrl} 
              className="absolute inset-0 w-full h-full object-cover opacity-5 blur-3xl scale-150" 
              alt="bg"
            />
          )}
        </div>
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full h-[100dvh] md:h-[85vh] md:max-w-[440px] md:aspect-[9/19.5] bg-zinc-900 md:rounded-[3rem] md:border-[8px] md:border-zinc-800 shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col z-10 md:shadow-2xl md:ring-1 md:ring-white/10"
      >
        <div className="flex-1 flex flex-col relative overflow-y-auto overflow-x-hidden scrollbar-hide">
          
          <Dialog open={isPrivacyOpen} onOpenChange={setIsPrivacyOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-8 border-none bg-zinc-900 text-white">
          <DialogHeader className="mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight text-white">Política de Privacidade</DialogTitle>
            <DialogDescription className="text-sm font-medium text-zinc-400">
              Termos de uso e processamento de dados do evento.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-black/40 p-6 rounded-2xl border border-zinc-800">
            <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {eventData.lgpdText || "Ao prosseguir, você concorda que seus dados sejam utilizados para a finalidade de entrega das fotos deste evento via WhatsApp/SMS."}
            </p>
          </div>
          <Button onClick={() => setIsPrivacyOpen(false)} className="w-full h-12 rounded-xl mt-4">
            Entendi e concordo
          </Button>
        </DialogContent>
      </Dialog>

          <AnimatePresence mode="wait">
            {step === 'WELCOME' && (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center p-8 space-y-10"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full scale-150 animate-pulse" />
                  {eventData.logoUrl ? (
                    <img src={eventData.logoUrl} className="w-48 h-48 rounded-full border-4 border-white/10 object-cover shadow-2xl relative z-10" alt="Evento" />
                  ) : (
                    <div className="w-40 h-40 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center relative z-10">
                      <Camera className="w-16 h-16 text-zinc-600" />
                    </div>
                  )}
                </div>
                
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-black tracking-tighter text-white leading-tight uppercase">
                    {eventData.name}
                  </h1>
                  <p className="text-zinc-400 text-lg font-medium px-4">
                    Transforme seu momento em uma lembrança eterna.
                  </p>
                </div>
                
                <div className="w-full pt-8">
                  <Button 
                    onClick={() => setStep('CAPTURE')} 
                    className="w-full h-16 text-lg rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] hover:scale-[1.02] transition-all bg-primary hover:bg-primary/90 font-black tracking-tight text-white"
                  >
                    COMEÇAR <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-zinc-500 text-xs font-bold tracking-widest uppercase opacity-40 pt-4">
                  Powered by memo<span className="text-primary/70">.LAB</span>
                </div>
              </motion.div>
            )}

            {step === 'IDENTIFY' && (
              <motion.div 
                key="identify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col p-8 pt-12 text-white"
              >
                <div className="mb-10 text-white">
                  <button onClick={resetFlow} className="mb-6 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase text-white">Falta pouco!</h2>
                  <p className="text-zinc-400 text-base font-medium leading-relaxed">
                    Identifique-se para garantirmos que sua foto chegue até você.
                  </p>
                </div>

                <form onSubmit={handleIdentifySubmit} className="space-y-8 flex-1 flex flex-col">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs font-black uppercase tracking-widest ml-1">Seu Nome</Label>
                      <Input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                        placeholder="Como quer ser chamado?"
                        className="bg-zinc-950 border-white/5 h-14 text-lg rounded-2xl focus:ring-primary/50 focus:border-primary/50 text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs font-black uppercase tracking-widest ml-1">WhatsApp</Label>
                      <PhoneInput
                        international
                        defaultCountry="BR"
                        value={phone}
                        onChange={setPhone}
                        className="flex h-14 w-full rounded-2xl border border-white/5 bg-zinc-950 px-4 py-2 text-lg text-white ring-offset-zinc-950 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all custom-phone-input"
                        style={{
                          '--PhoneInputCountryFlag-height': '1.5em'
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 p-5 bg-white/5 rounded-2xl border border-white/5 group active:bg-white/10 transition-colors">
                    <div className="relative flex items-center pt-1">
                      <input 
                        type="checkbox" 
                        id="lgpd" 
                        checked={lgpdAgreed} 
                        onChange={e => setLgpdAgreed(e.target.checked)} 
                        className="w-6 h-6 rounded-lg border-zinc-700 bg-zinc-800 text-primary focus:ring-primary/50 transition-all cursor-pointer"
                      />
                    </div>
                    <label htmlFor="lgpd" className="text-[11px] text-zinc-400 leading-relaxed cursor-pointer select-none font-medium">
                      Estou ciente e concordo com a{' '}
                      <button 
                        type="button" 
                        onClick={() => setIsPrivacyOpen(true)}
                        className="text-primary font-bold hover:underline"
                      >
                         Política de Privacidade
                      </button> de uso de dados para entrega de fotos.
                    </label>
                  </div>
                  
                  <div className="mt-auto pt-8">
                    <Button 
                      type="submit" 
                      disabled={isProcessing || !lgpdAgreed || !name || !phone} 
                      className="w-full h-16 text-lg rounded-2xl font-black tracking-tight shadow-xl disabled:opacity-30 transition-all text-white"
                    >
                      {isProcessing ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : 'AVANÇAR'}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 'CAPTURE' && !isTakingPhoto && (
              <motion.div 
                key="capture-choice"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center p-8 space-y-6"
              >
                <div className="text-center mb-12 text-white">
                  <h2 className="text-3xl font-black tracking-tighter mb-3 uppercase">Crie sua Foto</h2>
                  <p className="text-zinc-400 text-base font-medium">Escolha como deseja enviar sua lembrança.</p>
                </div>
                
                <div className="w-full space-y-6">
                  <button 
                    onClick={() => setIsTakingPhoto(true)} 
                    className="w-full flex flex-col items-center justify-center p-10 bg-zinc-950 border-2 border-white/5 rounded-[2.5rem] active:scale-95 hover:border-primary/40 transition-all group"
                  >
                    <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                      <Camera className="w-10 h-10 text-primary" />
                    </div>
                    <span className="font-black text-xl tracking-tight uppercase text-white">Tirar Agora</span>
                    <span className="text-zinc-500 text-xs mt-1 font-bold tracking-widest uppercase">Usar Câmera</span>
                  </button>
                  
                  <label className="w-full flex flex-col items-center justify-center p-10 bg-zinc-950 border-2 border-white/5 rounded-[2.5rem] active:scale-95 hover:border-primary/40 transition-all group cursor-pointer text-white">
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform text-white/40 group-hover:text-white transition-colors">
                      <Upload className="w-10 h-10" />
                    </div>
                    <span className="font-black text-xl tracking-tight uppercase text-white">Galeria</span>
                    <span className="text-zinc-500 text-xs mt-1 font-bold tracking-widest uppercase">Escolher Arquivo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCaptureFile} />
                  </label>
                </div>
                
                <button 
                  onClick={() => setStep('IDENTIFY')}
                  className="mt-8 text-zinc-500 hover:text-white transition-colors font-black text-xs uppercase tracking-[0.2em]"
                >
                  VOLTAR
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {step === 'CAPTURE' && isTakingPhoto && (
             <div className="flex-1 flex flex-col bg-black relative">
                {/* @ts-ignore */}
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  mirrored={facingMode === "user"}
                  videoConstraints={{ 
                    facingMode, 
                    aspectRatio: 3/4,
                    ...(isFlashOn && facingMode === "environment" ? { advanced: [{ torch: true }] as any[] } : {})
                  } as MediaTrackConstraints}
                  className="w-full flex-1 object-cover"
                />
                <div className="absolute top-8 left-0 right-0 z-10 flex justify-between px-8 text-white">
                   <Button variant="outline" size="icon" className="bg-black/40 backdrop-blur-md border-white/10 text-white rounded-2xl h-12 w-12" onClick={() => setIsTakingPhoto(false)}>
                      <X className="w-6 h-6" />
                   </Button>
                   <div className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 flex items-center">
                     Sorria! 📸
                   </div>
                </div>
                <div className="absolute bottom-12 w-full flex justify-center items-center gap-12 px-10">
                   <div className="flex flex-col items-center gap-4">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-2xl h-14 w-14 bg-black/20 backdrop-blur-sm" onClick={() => setFacingMode(prev => prev === "user" ? "environment" : "user")}>
                        <SwitchCamera className="w-8 h-8 text-white" />
                    </Button>
                    {facingMode === "environment" && (
                      <Button variant="ghost" size="icon" className={`text-white rounded-2xl h-14 w-14 backdrop-blur-sm ${isFlashOn ? 'bg-primary/50' : 'bg-black/20'}`} onClick={() => setIsFlashOn(!isFlashOn)}>
                        {isFlashOn ? <Zap className="w-8 h-8 text-yellow-400 fill-yellow-400" /> : <ZapOff className="w-8 h-8 text-white" />}
                      </Button>
                    )}
                   </div>
                   
                   <div className="relative">
                     <div className="absolute inset-0 bg-white/20 blur-xl rounded-full scale-125 animate-pulse" />
                     <button 
                        onClick={handleWebcamCapture}
                        className="w-24 h-24 rounded-full bg-white ring-[6px] ring-white/30 border-[6px] border-black transition-all active:scale-90 relative z-10"
                     />
                   </div>
                   
                   <div className="w-16 h-16" />
                </div>
             </div>
          )}

          <AnimatePresence mode="wait">

            {step === 'FRAME' && (
              <motion.div 
                key="frame"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col p-8"
              >
                <div className="mb-8 text-white">
                  <button onClick={() => setStep('CAPTURE')} className="mb-6 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase text-white">Escolha a Moldura</h2>
                  <p className="text-zinc-400 text-base font-medium">Toque para ver como sua foto ficará.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-6 overflow-y-auto pb-10 pr-2 custom-scrollbar">
                  {eventData.overlays && eventData.overlays.length > 0 ? (
                    eventData.overlays.map((ov, idx) => (
                      <motion.div 
                        key={idx} 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelectFrame(ov)} 
                        className="relative border-4 border-white/5 rounded-3xl overflow-hidden aspect-[2/3] cursor-pointer hover:border-primary transition-all group bg-zinc-950 shadow-xl"
                      >
                         <img src={imageUrl!} className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[1px]" alt="Base" />
                         <img src={ov.url} className="absolute inset-0 w-full h-full object-contain z-10 p-1" alt={`Moldura ${idx}`} />
                         <div className="absolute bottom-2 right-2 z-20">
                           <div className="bg-primary p-1.5 rounded-full shadow-lg">
                             <Check className="w-3 h-3 text-white" />
                           </div>
                         </div>
                      </motion.div>
                    ))
                  ) : (
                      <div className="col-span-2 text-center p-12 bg-zinc-950 border-2 border-dashed border-white/10 rounded-[2.5rem] text-white">
                        <p className="text-zinc-500 mb-6 font-medium text-white">Este evento não possui molduras customizadas.</p>
                        <Button onClick={() => handleSelectFrame({ url: '', orientation: 'portrait' })} className="h-14 px-8 rounded-2xl font-black text-white">PROSSEGUIR ASSIM MESMO</Button>
                      </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 'ADJUST' && (
              <motion.div 
                key="adjust"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col bg-black h-full"
              >
                <div className="flex-1 relative">
                  <Cropper
                    image={imageUrl!}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    aspect={overlayAspect}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onRotationChange={setRotation}
                    onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                    style={{
                      containerStyle: { backgroundColor: '#000' },
                      cropAreaStyle: { border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 0 0 9999em rgba(0,0,0,0.85)' }
                    }}
                  />
                  {selectedOverlay?.url && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                        <div style={{ aspectRatio: overlayAspect, width: '100%', maxHeight: '100%' }} className="relative z-10">
                          <img src={selectedOverlay.url} className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-80" alt="Overlay" />
                        </div>
                    </div>
                  )}
                  <div className="absolute top-8 left-8 z-20">
                     <Button variant="outline" size="icon" className="bg-black/50 backdrop-blur-md border-white/10 text-white rounded-2xl h-12 w-12" onClick={() => setStep('FRAME')}>
                        <ArrowLeft className="w-6 h-6 text-white" />
                     </Button>
                  </div>
                </div>
                
                <div className="bg-zinc-900 p-8 space-y-8 pb-safe shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border-t border-white/5 rounded-t-[3rem]">
                     <div className="space-y-6">
                       <div className="space-y-3">
                         <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                           <span>Zoom</span>
                           <span className="text-primary">{Math.round(zoom * 100)}%</span>
                         </div>
                         <div className="flex items-center gap-4">
                           <ZoomOut className="w-5 h-5 text-zinc-600 hover:text-white cursor-pointer" onClick={() => setZoom(Math.max(1, zoom - 0.1))} />
                           <input type="range" className="w-full accent-primary h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
                           <ZoomIn className="w-5 h-5 text-zinc-600 hover:text-white cursor-pointer" onClick={() => setZoom(Math.min(3, zoom + 0.1))} />
                         </div>
                       </div>
                       
                       <div className="space-y-3">
                         <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                           <span>Rotação</span>
                           <span className="text-primary">{rotation}°</span>
                         </div>
                         <div className="flex items-center gap-4">
                           <RotateCcw className="w-5 h-5 text-zinc-600 hover:text-white cursor-pointer" onClick={() => setRotation(rotation - 1)} />
                           <input type="range" className="w-full accent-primary h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" min={-180} max={180} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
                           <RotateCw className="w-5 h-5 text-zinc-600 hover:text-white cursor-pointer" onClick={() => setRotation(rotation + 1)} />
                         </div>
                       </div>
                     </div>
                     
                     <Button 
                        onClick={generatePreview} 
                        disabled={isProcessing} 
                        className="w-full h-16 rounded-2xl font-black text-lg tracking-tight shadow-xl text-white"
                      >
                       {isProcessing ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : 'FINALIZAR FOTO'}
                     </Button>
                </div>
              </motion.div>
            )}

            {step === 'PREVIEW' && finalImage && (
               <motion.div 
                 key="preview"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 1.1 }}
                 className="flex-1 flex flex-col items-center justify-center p-8 text-center"
               >
                  <h2 className="text-3xl font-black tracking-tighter mb-8 uppercase text-white">Resultado Final</h2>
                  
                  <div className="relative w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)] mb-10 border-4 border-white/10 ring-8 ring-primary/5">
                     <img src={finalImage} alt="Final" className="w-full h-auto object-contain" />
                     <div className="absolute inset-x-0 bottom-0 py-4 bg-black/40 backdrop-blur-md border-t border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Amostra Digital</p>
                     </div>
                  </div>

                  <div className="w-full space-y-4">
                    <Button 
                      onClick={handleSendToPrint} 
                      disabled={isProcessing} 
                      className="w-full h-16 text-lg rounded-2xl bg-white text-black hover:bg-zinc-200 font-black tracking-tight shadow-xl"
                    >
                      {isProcessing ? <Loader2 className="w-6 h-6 animate-spin text-black" /> : <><Printer className="w-6 h-6 mr-3 text-black"/> IMPRIMIR AGORA</>}
                    </Button>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        variant="outline" 
                        onClick={downloadImage} 
                        className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold"
                      >
                        <Download className="w-5 h-5 mr-1" /> SALVAR
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setStep('FRAME')} 
                        className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold"
                      >
                        <RotateCcw className="w-5 h-5 mr-1" /> REFAZER
                      </Button>
                    </div>
                  </div>
               </motion.div>
            )}

            {step === 'SUCCESS' && (
               <motion.div 
                 key="success"
                 initial={{ opacity: 0, y: 30 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="flex-1 flex flex-col items-center justify-center p-10 text-center"
               >
                 <div className="relative mb-10 text-white">
                   <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="w-32 h-32 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.4)]"
                   >
                     <Check className="w-16 h-16 text-black stroke-[3px]" />
                   </motion.div>
                   <motion.div 
                     animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                     transition={{ duration: 2, repeat: Infinity }}
                     className="absolute inset-0 bg-green-500 rounded-full blur-2xl -z-10"
                   />
                 </div>

                 <h2 className="text-4xl font-black tracking-tighter mb-4 uppercase text-white">Sucesso!</h2>
                 <p className="text-zinc-400 text-lg font-medium mb-12 leading-relaxed">
                   Sua lembrança foi enviada para a estação e será impressa em instantes. 💖
                 </p>

                 <div className="w-full space-y-6 text-white text-center">
                   <Button onClick={resetFlow} className="w-full h-16 text-lg rounded-2xl font-black tracking-tight shadow-xl bg-white text-black hover:bg-zinc-200">
                      NOVA FOTO
                   </Button>
                   <div className="flex flex-col items-center gap-2">
                     <p className="text-[10px] text-zinc-500 font-bold tracking-[0.3em] uppercase">Retornando ao início</p>
                     <div className="w-full max-w-[120px] h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-white/5 p-0.5">
                        <motion.div 
                          initial={{ width: "100%" }}
                          animate={{ width: "0%" }}
                          transition={{ duration: 15, ease: "linear" }}
                          className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                        />
                     </div>
                   </div>
                 </div>
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Additional UI for desktop */}
      <div className="hidden lg:flex fixed bottom-12 right-12 flex-col items-end space-y-2 opacity-30 select-none text-white text-right">
        <p className="font-black text-4xl tracking-tighter">memo<span className="text-primary">.LAB</span></p>
        <p className="text-xs font-bold tracking-[0.2em] uppercase">Visualizador de Totem Mobile</p>
      </div>
    </div>
  );
}
