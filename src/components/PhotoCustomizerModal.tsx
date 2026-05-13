import React, { useState, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/src/components/ui/button';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Download, MessageCircle, MessageSquare, Printer, Check, ChevronRight, Loader2, Frame, Settings2, Share2, ArrowLeft, Send } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Input } from '@/src/components/ui/input';
import { LeadCapture } from './LeadCapture';
import { toast } from 'sonner';
import { formatMessage, generateShortLink } from '@/src/lib/shareUtils';

interface Overlay {
  url: string;
  orientation: string;
}

interface PhotoCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  overlays: Overlay[];
  eventData: {
    id?: string;
    name: string;
    shareText?: string;
    smsShareText?: string;
    ownerId?: string;
    dpi?: number;
  } | null;
  onSave?: (finalImage: string, originalImage: string) => Promise<string | void>;
}

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

  // We enforce the actual overlay aspect ratio
  const overlayAspect = overlayInfo.width / overlayInfo.height;
  
  let baseH = 1800;
  if (dpiNumber === 150) {
    baseH = 900;
  } else if (dpiNumber === 600) {
    baseH = 3600;
  }

  // Calculate finalDim based on base height and exact overlay aspect
  let w = Math.round(baseH * overlayAspect);
  let h = baseH;

  // Let's cap the maximum dimension to something reasonable based on dpi
  if (overlayInfo.width > overlayInfo.height) { // Landscape
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
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    finalDim.w,
    finalDim.h
  );

  ctx.drawImage(overlayInfo, 0, 0, finalDim.w, finalDim.h);
  
  // Dynamic compression to stay under ~850KB Base64 limits for Firestore
  let quality = 0.95;
  let finalDataUrl = canvas.toDataURL('image/jpeg', quality);
  while (finalDataUrl.length > 850000 && quality > 0.1) {
    quality -= 0.1;
    finalDataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return finalDataUrl;
}

export default function PhotoCustomizerModal({ isOpen, onClose, imageUrl, overlays, eventData, onSave }: PhotoCustomizerModalProps) {
  const [step, setStep] = useState<'SELECT_OVERLAY' | 'ADJUST' | 'SHARE'>('SELECT_OVERLAY');
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [overlayAspect, setOverlayAspect] = useState<number>(2 / 3);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [savedPhotoId, setSavedPhotoId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [showLeadCapture, setShowLeadCapture] = useState<'whatsapp' | 'sms' | null>(null);
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  useEffect(() => {
    if (isOpen && imageUrl) {
      setStep('SELECT_OVERLAY');
      setFinalImage(null);
      setZoom(1);
      setRotation(0);
      setCrop({ x: 0, y: 0 });
      
      const img = new Image();
      img.onload = () => {
        const orient = img.width > img.height ? 'landscape' : 'portrait';
        setImageOrientation(orient);
        const bestMatch = overlays.find(o => o.orientation === orient) || overlays[0];
        if (bestMatch) {
          setSelectedOverlay(bestMatch);
        }
      };
      if (imageUrl.startsWith('http')) {
        img.setAttribute('crossOrigin', 'anonymous');
      }
      img.src = imageUrl;
    }
  }, [isOpen, imageUrl, overlays]);

  useEffect(() => {
    if (selectedOverlay) {
      const img = new Image();
      img.onload = () => {
        setOverlayAspect(img.width / img.height);
      };
      if (selectedOverlay.url.startsWith('http')) {
        img.setAttribute('crossOrigin', 'anonymous');
      }
      img.src = selectedOverlay.url;
    }
  }, [selectedOverlay]);

  const onCropComplete = useCallback((croppedArea: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleFinishAdjustment = async () => {
    if (!imageUrl || !selectedOverlay || !croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const finalImgStr = await getFinalCanvas(
        imageUrl,
        croppedAreaPixels,
        rotation,
        selectedOverlay.url,
        eventData?.dpi
      );
      if (onSave) {
        const id = await onSave(finalImgStr, imageUrl);
        if (typeof id === 'string') {
           setSavedPhotoId(id);
        }
      }
      setFinalImage(finalImgStr);
      setStep('SHARE');
    } catch (e) {
      console.error(e);
      alert('Erro ao processar a imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!finalImage) return;
    const link = document.createElement('url');
    const a = document.createElement('a');
    a.href = finalImage;
    a.download = `foto-${Date.now()}.jpg`;
    a.click();
  };

  const handleLeadContinue = async (name: string, phone: string) => {
    if (!finalImage) return;

    let photoLink = `${window.location.origin}/g/${eventData?.id || ''}`;
    if (savedPhotoId && eventData?.id) {
       photoLink = await generateShortLink(eventData.id, savedPhotoId);
    }

    if (showLeadCapture === 'whatsapp') {
       // Only letters and numbers for the phone
       const cleanedPhone = phone.replace(/\D/g, "");
       const finalMsg = formatMessage(eventData?.shareText || "", name, eventData?.name || "Evento", photoLink);
       const text = encodeURIComponent(finalMsg);
       window.open(`https://api.whatsapp.com/send?phone=${cleanedPhone}&text=${text}`, '_blank');
       setShowLeadCapture(null);
       return;
    }

    if (showLeadCapture === 'sms') {
      if (!eventData?.ownerId) {
        alert("Não foi possível identificar o organizador do evento.");
        return;
      }
      setIsSendingMsg(true);
      try {
        const settingsDoc = await getDoc(doc(db, "settings", eventData.ownerId));
        const mobizon = settingsDoc.data()?.mobizon;
        
        if (!mobizon || !mobizon.apiKey) {
          alert("O criador deste evento não configurou o envio de SMS (Mobizon).");
          setIsSendingMsg(false);
          return;
        }

        const message = formatMessage(eventData?.smsShareText || "", name, eventData?.name || "Evento", photoLink);

        const resp = await fetch("/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: mobizon.apiKey,
            to: phone,
            text: message,
            senderName: mobizon.senderName
          })
        });

        const data = await resp.json();
        if (data.success) {
          toast.success("SMS enviado com sucesso!");
          setShowLeadCapture(null);
        } else {
          toast.error("Falha ao enviar: " + (data.error || JSON.stringify(data)));
        }
      } catch (err) {
        console.error(err);
        toast.error("Erro ao enviar SMS via Mobizon.");
      } finally {
        setIsSendingMsg(false);
      }
    }
  };

  const printImage = () => {
    if (!finalImage) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir Foto</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              @media print {
                @page { margin: 0; }
                body { margin: 0; }
              }
            </style>
          </head>
          <body>
            <img src="${finalImage}" onload="window.print();window.close()" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (!isOpen || !imageUrl) return null;

  const stepsConfig = [
    { id: 'SELECT_OVERLAY', label: 'Moldura', icon: Frame },
    { id: 'ADJUST', label: 'Enquadramento', icon: Settings2 },
    { id: 'SHARE', label: 'Foto Pronta', icon: Share2 }
  ];
  const currentStepIndex = stepsConfig.findIndex(s => s.id === step);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-stretch justify-start overflow-hidden">
      {/* Stepper / Progress Header */}
      <header className="h-20 bg-white border-b flex items-center justify-between px-8 shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} title="Cancelar e Sair">
            <ArrowLeft className="w-5 h-5 text-foreground/70" />
          </Button>
          <div className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-600 truncate max-w-xs md:max-w-md">
            {eventData?.name ? `Personalizando: ${eventData.name}` : 'Personalização'}
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-6">
          {stepsConfig.map((s, i) => {
            const isActive = s.id === step;
            const isPast = i < currentStepIndex;
            const Icon = s.icon;
            return (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm ${isActive ? 'bg-primary text-white' : isPast ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground/80'}`}>
                    {isPast ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className={`font-bold text-lg hidden xl:block ${isActive ? 'text-primary' : isPast ? 'text-green-600' : 'text-muted-foreground/80'}`}>
                      {s.label}
                    </div>
                  </div>
                </div>
                {i < stepsConfig.length - 1 && (
                  <div className={`w-12 h-1 rounded-full ${isPast ? 'bg-green-500' : 'bg-muted'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        
        <div className="w-32 flex justify-end">
          {step === 'SHARE' && (
            <Button variant="default" onClick={onClose} className="font-semibold px-6">
              Próxima Foto
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-background flex">
        {step === 'SELECT_OVERLAY' && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Image Preview - big area */}
            <div className="flex-[3] flex justify-center items-center p-6 md:p-12 bg-muted border-r border-border shadow-inner">
              <img src={imageUrl} alt="Base" className="max-h-full max-w-full rounded-xl shadow-xl object-contain bg-white" />
            </div>
            
            {/* Overlay List - sidebar */}
            <div className="flex-[1] w-full md:min-w-[420px] md:max-w-[500px] bg-white p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground/90">Escolha a Moldura</h2>
                  <p className="text-muted-foreground mt-1">Selecione uma das opções para aplicar a sua foto.</p>
                </div>
                
                {overlays.length === 0 && (
                  <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
                    Nenhuma moldura disponível neste evento.
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {overlays.map((ov, i) => {
                    const isBestMatch = ov.orientation === imageOrientation;
                    const isSelected = selectedOverlay === ov;

                    return (
                      <div 
                        key={i} 
                        className={`relative rounded-xl border-2 cursor-pointer transition-all overflow-hidden bg-white shadow-sm hover:shadow-md ${isSelected ? 'border-primary ring-4 ring-primary/20' : 'border-border hover:border-blue-300'}`}
                        onClick={() => setSelectedOverlay(ov)}
                      >
                        <div className="aspect-[2/3] w-full bg-muted/50 relative items-center justify-center flex p-2">
                          <img src={ov.url} className="h-full w-full object-contain drop-shadow-md" alt="Moldura" />
                        </div>
                        <div className="p-3 bg-white text-sm font-semibold text-center border-t text-neutral-700">
                          {ov.orientation === 'portrait' ? 'Retrato' : 'Paisagem'}
                        </div>
                        
                        {isBestMatch && (
                          <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded shadow-sm">
                            Melhor Escolha
                          </div>
                        )}
                        
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-1 shadow-md">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-8 mt-8 border-t border-border">
                <Button onClick={() => setStep('ADJUST')} disabled={!selectedOverlay} size="lg" className="w-full text-lg h-14 bg-foreground hover:bg-foreground/90 text-white">
                  Avançar <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'ADJUST' && selectedOverlay && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="flex-1 relative bg-foreground overflow-hidden flex items-center justify-center p-4 md:p-8">
              <div 
                className="relative shadow-2xl bg-white flex items-center justify-center shrink-0" 
                style={{ 
                  aspectRatio: overlayAspect,
                  height: '100%',
                  maxHeight: '100%',
                  maxWidth: '100%'
                }}
              >
                <div className="absolute inset-0">
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    aspect={overlayAspect}
                    onCropChange={setCrop}
                    onRotationChange={setRotation}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                    showGrid={false}
                    objectFit="contain"
                    classes={{
                      containerClassName: '!bg-transparent',
                      mediaClassName: '!opacity-100', 
                      cropAreaClassName: '!border-0 !shadow-none' 
                    }}
                  />
                </div>
                <img 
                  src={selectedOverlay.url} 
                  className="absolute inset-0 w-full h-full z-10 pointer-events-none object-contain" 
                  style={{ objectFit: 'contain' }}
                  alt="Overlay"
                />
              </div>
            </div>

            <div className="w-full md:w-[420px] bg-white border-l p-6 md:p-8 flex flex-col justify-between shrink-0 overflow-y-auto">
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-foreground/90">Ajustar Enquadramento</h2>
                  <p className="text-muted-foreground mt-1">Mova a foto usando o mouse/touch, e use os controles para zoom ou rotação.</p>
                </div>

                <div className="space-y-6">
                  <div className="bg-background p-6 rounded-xl border border-border">
                    <label className="text-sm font-semibold text-foreground/90 flex items-center gap-2 mb-4">
                      <ZoomIn className="w-5 h-5 text-primary" /> Nível de Zoom
                    </label>
                    <div className="flex items-center gap-4">
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}>
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <input 
                        type="range" 
                        value={zoom} 
                        min={0.1} 
                        max={3} 
                        step={0.05} 
                        onChange={(e) => setZoom(Number(e.target.value))} 
                        className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary" 
                      />
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-background p-6 rounded-xl border border-border">
                    <label className="text-sm font-semibold text-foreground/90 flex items-center gap-2 mb-4">
                      <RotateCw className="w-5 h-5 text-primary" /> Rotação da Imagem
                    </label>
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1 h-12 bg-white" onClick={() => setRotation(r => r - 90)}>
                        <RotateCcw className="w-5 h-5 mr-2 text-foreground/70" /> Esquerda
                      </Button>
                      <Button variant="outline" className="flex-1 h-12 bg-white" onClick={() => setRotation(r => r + 90)}>
                        <RotateCw className="w-5 h-5 mr-2 text-foreground/70" /> Direita
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-8 mt-8 border-t border-border flex flex-col gap-4 shrink-0">
                <Button onClick={handleFinishAdjustment} disabled={isProcessing} size="lg" className="w-full text-lg h-14 bg-green-600 hover:bg-green-700 shadow-sm text-white">
                  {isProcessing ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : <Check className="w-6 h-6 mr-3" />}
                  Concluir Edição
                </Button>
                <Button variant="outline" onClick={() => setStep('SELECT_OVERLAY')} className="w-full h-14 text-foreground/70 font-semibold border-neutral-300">
                  Voltar para Molduras
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'SHARE' && finalImage && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            <div className="flex-[3] flex justify-center items-center p-6 md:p-12 bg-muted border-r border-border">
              <div className="shadow-2xl rounded-2xl overflow-hidden ring-8 ring-white">
                <img src={finalImage} alt="Resultado Final" className="max-h-[70vh] max-w-full object-contain w-auto" />
              </div>
            </div>

            <div className="flex-[1] w-full md:min-w-[420px] md:max-w-[500px] bg-white p-6 md:p-10 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-green-600 mb-2">Sua Foto está Pronta!</h2>
                  <p className="text-lg text-foreground/70 font-medium">Como o visitante deseja receber a foto?</p>
                </div>

                <div className="flex flex-col gap-4">
                  {showLeadCapture ? (
                     <LeadCapture 
                        eventId={eventData?.id} 
                        method={showLeadCapture} 
                        onBack={() => setShowLeadCapture(null)} 
                        onContinue={handleLeadContinue} 
                     />
                  ) : (
                    <>
                      <Button size="lg" onClick={downloadImage} className="w-full justify-start gap-4 h-16 text-lg bg-primary hover:bg-primary/90 shadow-sm">
                        <Download className="w-6 h-6 opacity-80" /> Alta Resolução
                      </Button>
                      <Button size="lg" onClick={() => setShowLeadCapture('whatsapp')} className="w-full justify-start gap-4 h-16 text-lg bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-sm">
                        <MessageCircle className="w-6 h-6 opacity-80" /> Enviar por WhatsApp
                      </Button>
                      <Button size="lg" variant="outline" onClick={() => setShowLeadCapture('sms')} className="w-full justify-start gap-4 h-16 text-lg border-2 border-border hover:bg-background text-neutral-700">
                        <MessageSquare className="w-6 h-6 text-muted-foreground" /> Enviar por SMS
                      </Button>
                      <Button size="lg" variant="outline" onClick={printImage} className="w-full justify-start gap-4 h-16 text-lg border-2 border-border hover:bg-background text-neutral-700">
                        <Printer className="w-6 h-6 text-muted-foreground" /> Imprimir Foto
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-8 mt-8 border-t border-border">
                <Button variant="default" onClick={onClose} size="lg" className="w-full text-lg h-16 bg-foreground hover:bg-foreground/90 text-white shadow-md">
                  Próxima Foto / Finalizar
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
