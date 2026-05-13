import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/src/contexts/AuthContext";
import { db } from "@/src/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp, where, getDocs, limit, orderBy, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft, ImagePlus, Loader2, Image as ImageIcon, Download, FileSpreadsheet, Share2 } from "lucide-react";
import { Card } from "@/src/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Label } from "@/src/components/ui/label";
import { Checkbox } from "@/src/components/ui/checkbox";
import PhotoCustomizerModal from "@/src/components/PhotoCustomizerModal";
import PhotoActionModal from "@/src/components/PhotoActionModal";
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { getStandardFilename, formatMessage, generateShortLink, generateShortCaptureLink, generateShortGalleryLink } from "@/src/lib/shareUtils";
import { useEvent, EventItem } from "@/src/lib/useEvent";
import { handleFirestoreError, OperationType } from "@/src/lib/firestoreUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
import { Printer, MessageCircle, DownloadCloud, Smartphone, Trash2, CheckCircle2, Ban, History, Link as LinkIcon, QrCode, Send } from "lucide-react";
import { toast } from "sonner";

interface PhotoItem {
  id: string;
  eventId: string;
  uploaderId: string;
  dataUrl: string;
  originalUrl?: string;
  createdAt: number;
  printStatus?: 'pending' | 'printed';
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  printedAt?: number;
  participantId?: string;
  source?: 'desktop' | 'mobile';
}

interface LeadItem {
  id: string;
  name: string;
  phone: string;
  method: string;
  dataSharingConsent?: boolean;
  commercialConsent?: boolean;
  createdAt: number;
  source?: string;
}

interface MessageLogItem {
  id: string;
  photoId?: string;
  recipientName: string;
  recipientPhone: string;
  method: 'whatsapp' | 'sms';
  status: string;
  messageText: string;
  createdAt: number;
}

import * as faceapi from '@vladmandic/face-api';

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

export default function EventGallery() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { eventData, loading, quotaError } = useEvent(eventId);
  const isOwner = user?.uid && eventData?.ownerId ? user.uid === eventData.ownerId : false;
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [messages, setMessages] = useState<MessageLogItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [participant, setParticipant] = useState<any>(null);
  
  // Download state
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState<string | undefined>("+55");
  const [formLgpd, setFormLgpd] = useState(false);
  const [formCommercialConsent, setFormCommercialConsent] = useState(false);
  const [submittingParticipant, setSubmittingParticipant] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false); // Added state

  // Customizer and upload queue state
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [showFramingChoiceModal, setShowFramingChoiceModal] = useState(false);
  const [currentFileB64, setCurrentFileB64] = useState<string | null>(null);

  const [isAIFraming, setIsAIFraming] = useState(false);
  const [aiFramingProgress, setAiFramingProgress] = useState({ current: 0, total: 0 });

  const startAIFraming = async (files: File[]) => {
    setIsAIFraming(true);
    setAiFramingProgress({ current: 0, total: files.length });
    
    // 1. Load FaceAPI models
    try {
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    } catch (e) {
      console.error("Error loading FaceAPI models", e);
      toast.error("Erro ao carregar IA de detecção de rostos.");
      setIsAIFraming(false);
      return;
    }

    let aIProcessedCount = 0;
    let manualFallbackFiles: File[] = [];

    const targetOverlay = eventData?.overlays?.[0];
    
    if (!targetOverlay) {
      toast.error("Nenhuma moldura configurada para o evento.");
      setIsAIFraming(false);
      return;
    }

    let overlayImg;
    let targetAspect = 2 / 3;
    try {
      overlayImg = await createImage(targetOverlay.url);
      targetAspect = overlayImg.width / overlayImg.height;
    } catch (e) {
      console.error("Failed to load overlay image", e);
      toast.error("Erro ao carregar moldura do evento.");
      setIsAIFraming(false);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      setAiFramingProgress({ current: i + 1, total: files.length });
      const file = files[i];
      
      try {
        const b64 = await compressFileToBase64(file);
        const img = await createImage(b64);
        
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions());
        
        if (detections.length === 0) {
          manualFallbackFiles.push(file);
          continue;
        }

        let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
        detections.forEach(d => {
          const box = d.box;
          if (box.x < minX) minX = box.x;
          if (box.y < minY) minY = box.y;
          if (box.x + box.width > maxX) maxX = box.x + box.width;
          if (box.y + box.height > maxY) maxY = box.y + box.height;
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const faceBoxWidth = maxX - minX;
        const faceBoxHeight = maxY - minY;

        // Crop margin factor
        const margin = 1.6; 
        
        let cropW = faceBoxWidth * margin;
        let cropH = faceBoxHeight * margin;
        
        if (cropW / cropH > targetAspect) {
          cropH = cropW / targetAspect;
        } else {
          cropW = cropH * targetAspect;
        }

        // Apply a minimum crop size just in case the face is very small
        const minCropSize = Math.max(img.width, img.height) * 0.3;
        if (cropW < minCropSize) {
           cropW = minCropSize;
           cropH = cropW / targetAspect;
        }

        let cropX = centerX - cropW / 2;
        let cropY = centerY - cropH / 2;

        if (cropX < 0) cropX = 0;
        if (cropY < 0) cropY = 0;
        if (cropX + cropW > img.width) {
             cropX = img.width - cropW;
             if (cropX < 0) {
                cropX = 0;
                cropW = img.width;
                cropH = cropW / targetAspect;
             }
        }
        if (cropY + cropH > img.height) {
             cropY = img.height - cropH;
             if (cropY < 0) {
                cropY = 0;
                cropH = img.height;
                cropW = cropH * targetAspect;
             }
        }

        const canvas = document.createElement("canvas");
        const baseH = eventData?.dpi === 150 ? 900 : eventData?.dpi === 600 ? 3600 : 1800;
        let finalW = Math.round(baseH * targetAspect);
        let finalH = baseH;

        if (overlayImg.width > overlayImg.height) {
           finalW = baseH;
           finalH = Math.round(baseH / targetAspect);
        }

        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas 2D");
        
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, finalW, finalH);

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);
        ctx.drawImage(overlayImg, 0, 0, finalW, finalH);

        let quality = 0.95;
        let finalDataUrl = canvas.toDataURL('image/jpeg', quality);
        while (finalDataUrl.length > 850000 && quality > 0.1) {
          quality -= 0.1;
          finalDataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const docData: any = {
           eventId: eventData.id,
           uploaderId: user?.uid || "guest",
           dataUrl: finalDataUrl,
           createdAt: Date.now(),
           source: 'desktop'
        };
        await addDoc(collection(db, "events", eventData.id, "photos"), docData);

        aIProcessedCount++;

      } catch (e) {
        console.error("Error processing file via AI", e);
        manualFallbackFiles.push(file);
      }
    }
    
    setIsAIFraming(false);
    toast.success(`${aIProcessedCount} fotos enquadradas automaticamente${manualFallbackFiles.length > 0 ? `, ${manualFallbackFiles.length} enviadas p/ manual` : ''}.`);
    
    if (manualFallbackFiles.length > 0) {
      setUploadQueue(q => [...q, ...manualFallbackFiles]); 
    }
  };
  
  // Viewing photo state
  const [viewingPhoto, setViewingPhoto] = useState<PhotoItem | null>(null);

  const [participantMap, setParticipantMap] = useState<Record<string, any>>({});
  
  const [shortGalleryLink, setShortGalleryLink] = useState<string | null>(null);
  const [shortCaptureLink, setShortCaptureLink] = useState<string | null>(null);
  const [isGeneratingLinks, setIsGeneratingLinks] = useState(false);

  const handlePrepareShare = async () => {
    if (!eventData || isGeneratingLinks) return;
    if (shortGalleryLink && shortCaptureLink) return; // already generated

    setIsGeneratingLinks(true);
    try {
      const [gLink, cLink] = await Promise.all([
        generateShortGalleryLink(eventData.id),
        generateShortCaptureLink(eventData.id)
      ]);
      setShortGalleryLink(gLink);
      setShortCaptureLink(cLink);
    } catch (err) {
      console.error("Error generating links", err);
    } finally {
      setIsGeneratingLinks(false);
    }
  };

  const compressFileToBase64 = async (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          const MAX_DIM = 2400;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject("No ctx");
          ctx.drawImage(img, 0, 0, width, height);
          
          let quality = 0.9;
          let res = canvas.toDataURL("image/jpeg", quality);
          while (res.length > 350000 && quality > 0.1) {
            quality -= 0.1;
            res = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(res);
        };
        img.onerror = () => reject("Image load error");
        if (e.target?.result) img.src = e.target.result as string;
      };
      reader.onerror = () => reject("File read error");
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    if (uploadQueue.length > 0 && !currentFileB64) {
      const file = uploadQueue[0];
      compressFileToBase64(file).then(b64 => {
        setCurrentFileB64(b64);
      }).catch(err => {
        console.error(err);
        setUploadQueue(q => q.slice(1));
      });
    }
  }, [uploadQueue, currentFileB64]);
  
  useEffect(() => {
    if (!eventData) return;

    let unsubscribePhotos: (() => void) | undefined;
    let unsubscribeParticipant: (() => void) | undefined;

    // Listen to photos
    const q = query(
      collection(db, "events", eventData.id, "photos"), 
      orderBy("createdAt", "desc"),
      limit(200) // limit to avoid massive reads
    );
    unsubscribePhotos = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as PhotoItem[];
      
      setPhotos(docs);
    }, (err: any) => {
      handleFirestoreError(err, OperationType.LIST, `events/${eventData.id}/photos`);
    });

    // Listen to participant status
    const localGuestId = localStorage.getItem(`guest_${eventData.id}`);

    let unsubscribeParticipantMap: (() => void) | undefined;
    if (isOwner) {
      // Owner needs participant map to see names in print queue
      const mapQ = query(collection(db, "events", eventData.id, "participants"));
      unsubscribeParticipantMap = onSnapshot(mapQ, (snapshot) => {
        const map: Record<string, any> = {};
        snapshot.docs.forEach(doc => {
          map[doc.id] = doc.data();
        });
        setParticipantMap(map);
      });
    } else if (user) {
      const pq = query(collection(db, "events", eventData.id, "participants"), where("userId", "==", user.uid));
      unsubscribeParticipant = onSnapshot(pq, (snapshot) => {
        if (!snapshot.empty) setParticipant(snapshot.docs[0].data());
        else setParticipant(null);
      }, (err) => handleFirestoreError(err, OperationType.GET, `events/${eventData.id}/participants`));
    } else if (localGuestId) {
      const pq = query(collection(db, "events", eventData.id, "participants"), where("userId", "==", localGuestId));
      unsubscribeParticipant = onSnapshot(pq, (snapshot) => {
        if (!snapshot.empty) setParticipant(snapshot.docs[0].data());
        else setParticipant(null);
      }, (error) => {
        console.error("Error fetching guest participant", error);
        setParticipant({ userId: localGuestId, name: "Guest", phone: "Hidden" });
      });
    }

    return () => {
      if (unsubscribePhotos) unsubscribePhotos();
      if (unsubscribeParticipant) unsubscribeParticipant();
      if (unsubscribeParticipantMap) unsubscribeParticipantMap();
    };
  }, [eventData?.id, user?.uid]);

  useEffect(() => {
    if (!eventData || !isOwner) return;

    setLoadingLeads(true);
    const q = query(
      collection(db, "events", eventData.id, "leads"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as LeadItem[];
      setLeads(docs);
      setLoadingLeads(false);
    }, (err) => {
      console.error(err);
      setLoadingLeads(false);
    });

    return () => unsubscribe();
  }, [eventData?.id, isOwner]);

  useEffect(() => {
    if (!eventData || !isOwner) return;

    setLoadingMessages(true);
    const q = query(
      collection(db, "events", eventData.id, "messages"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as MessageLogItem[];
      setMessages(docs);
      setLoadingMessages(false);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [eventData?.id, isOwner]);


  const processImageWithWatermark = (file: File, watermarkText?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject("Could not get canvas context");
            return;
          }

          // Resize properties
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          // Draw original image
          ctx.drawImage(img, 0, 0, width, height);

          // Draw watermark
          if (watermarkText) {
            ctx.font = "bold 32px sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            
            // Add slight shadow for better visibility on light images
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            ctx.fillText(watermarkText, width - 20, height - 20);
          }

          // Returns data URL reduced quality jpeg to save Firestore space
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          resolve(dataUrl);
        };
        img.onerror = () => reject("Image load error");
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.onerror = () => reject("File read error");
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!user || !eventData || user.uid !== eventData.ownerId) return;
    
    // Check 15MB limit
    const validFiles = Array.from(files).filter(f => f.size <= 15 * 1024 * 1024);
    if (validFiles.length < files.length) {
      alert("Algumas imagens excedem o tamanho máximo de 15MB e foram ignoradas.");
    }
    if (validFiles.length === 0) return;

    // If event has overlays, ask the user about framing choice
    if (eventData.overlays && eventData.overlays.length > 0) {
      setPendingUploadFiles(validFiles);
      setShowFramingChoiceModal(true);
      return;
    }

    // Otherwise standard upload
    setUploading(true);
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        if (!file.type.startsWith("image/")) continue;
        
        const dataUrl = await processImageWithWatermark(file, eventData.watermarkText);
        
        // originalUrl is the raw one for downloading original if desired
        // We MUST compress it to fit under Firestore 1MB document size limit
        const originalUrl = await compressFileToBase64(file);
        
        const docData: any = {
          eventId: eventData.id,
          uploaderId: user.uid,
          dataUrl,
          createdAt: Date.now(),
          moderationStatus: 'approved',
          source: 'desktop'
        };
        
        // If combined length is safe, save original inside the same document
        if (dataUrl.length + originalUrl.length < 950000) {
          docData.originalUrl = originalUrl;
        }

        await addDoc(collection(db, "events", eventData.id, "photos"), docData);
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setUploading(false);
      setIsDragActive(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const triggerDownload = (photo: PhotoItem) => {
    if (!eventData) return;
    const filename = getStandardFilename(eventData.name, eventData.date, photo.id.slice(-4));
    
    // Actually, "triggerDownload" is meant to just download the raw photo if no customizer
    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePhotoAction = (photo: PhotoItem) => {
    if (!isOwner && eventData?.identifyParticipants && !participant) {
      setSelectedPhoto(photo);
      setIsModalOpen(true);
      return;
    }
    
    setViewingPhoto(photo);
  };

  const handleNextPhoto = useCallback(() => {
    if (!viewingPhoto || photos.length <= 1) return;
    const currentIndex = photos.findIndex(p => p.id === viewingPhoto.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % photos.length;
    setViewingPhoto(photos[nextIndex]);
  }, [viewingPhoto, photos]);

  const handlePrevPhoto = useCallback(() => {
    if (!viewingPhoto || photos.length <= 1) return;
    const currentIndex = photos.findIndex(p => p.id === viewingPhoto.id);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + photos.length) % photos.length;
    setViewingPhoto(photos[prevIndex]);
  }, [viewingPhoto, photos]);

  const handleParticipantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventData || !formName || !formPhone || !formLgpd) return;

    setSubmittingParticipant(true);
    try {
      const guestId = user ? user.uid : `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await addDoc(collection(db, "events", eventData.id, "participants"), {
        eventId: eventData.id,
        userId: guestId,
        name: formName,
        phone: formPhone,
        lgpdAgreed: true,
        commercialConsent: formCommercialConsent,
        createdAt: Date.now()
      });
      
      setParticipant({ userId: guestId, name: formName, phone: formPhone, commercialConsent: formCommercialConsent });
      if (!user) localStorage.setItem(`guest_${eventData.id}`, guestId);
      setIsModalOpen(false);
      
      if (selectedPhoto) {
        setViewingPhoto(selectedPhoto);
        setSelectedPhoto(null);
      }
    } catch (error) {
      console.error("Error saving participant", error);
    } finally {
      setSubmittingParticipant(false);
    }
  };

  const [isExportingLeads, setIsExportingLeads] = useState(false);
  const handleExportLeads = async () => {
    if (!eventData) return;
    setIsExportingLeads(true);
    try {
      const leadsRef = collection(db, "events", eventData.id, "leads");
      const snap = await getDocs(leadsRef);
      if (snap.empty) {
        alert("Não há leads registrados para este evento ainda.");
        setIsExportingLeads(false);
        return;
      }
      
      const leads = snap.docs.map(d => {
        const data = d.data();
        return {
          "Data de Inclusão": new Date(data.createdAt).toLocaleString(),
          "Nome do Lead": data.name || "N/A",
          "Telefone": data.phone || "N/A",
          "Canal de Envio": data.method === "whatsapp" ? "WhatsApp" : data.method === "sms" ? "SMS" : "N/A",
        };
      });

      const ws = XLSX.utils.aoa_to_sheet([
        ["Relatório de Leads Capturados"],
        [],
        ["Nome do Evento:", eventData.name],
        ["Data do Evento:", eventData.date ? new Date(eventData.date).toLocaleDateString() : "-"],
        ["Local:", eventData.location || "-"],
        ["Data da Exportação:", new Date().toLocaleString()],
        [],
      ]);

      XLSX.utils.sheet_add_json(ws, leads, { origin: "A8" });

      const wscols = [
        { wch: 20 },
        { wch: 30 },
        { wch: 20 },
        { wch: 20 }
      ];
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      saveAs(blob, `leads-${eventData.id}.xlsx`);
    } catch (error) {
      console.error("Error exporting leads:", error);
      alert("Erro ao exportar leads.");
    } finally {
      setIsExportingLeads(false);
    }
  };

  const [isExportingEvent, setIsExportingEvent] = useState(false);
  const handleExportEvent = async () => {
    if (!eventData) return;
    setIsExportingEvent(true);
    try {
      const zip = new JSZip();
      
      // 1. Fetch leads and generate Excel
      const leadsRef = collection(db, "events", eventData.id, "leads");
      const leadsSnap = await getDocs(leadsRef);
      
      const leadsData = leadsSnap.docs.map(d => {
        const data = d.data();
        return {
          "Data de Inclusão": new Date(data.createdAt).toLocaleString(),
          "Nome do Lead": data.name || "N/A",
          "Telefone": data.phone || "N/A",
          "Canal de Envio": data.method === "whatsapp" ? "WhatsApp" : data.method === "sms" ? "SMS" : "N/A",
        };
      });

      const ws = XLSX.utils.aoa_to_sheet([
        ["Relatório de Leads Capturados"],
        [],
        ["Nome do Evento:", eventData.name],
        ["Data do Evento:", eventData.date ? new Date(eventData.date).toLocaleDateString() : "-"],
        ["Local:", eventData.location || "-"],
        ["Data da Exportação:", new Date().toLocaleString()],
        [],
      ]);

      XLSX.utils.sheet_add_json(ws, leadsData, { origin: "A8" });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file("leads.xlsx", wbout);

      // 2. Add photos
      const fotosFolder = zip.folder("fotos");
      if (fotosFolder) {
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const filename = getStandardFilename(eventData.name, eventData.date, i + 1);
          
          // dataUrl is base64
          const base64Data = photo.dataUrl.split(',')[1];
          fotosFolder.file(filename, base64Data, { base64: true });
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `evento-${eventData.id}.zip`);
    } catch (error) {
      console.error("Error exporting event:", error);
      alert("Erro ao exportar evento.");
    } finally {
      setIsExportingEvent(false);
    }
  };

  const logMessage = async (photo: PhotoItem, method: 'whatsapp' | 'sms', recipientName: string, recipientPhone: string, messageText: string) => {
    if (!eventData) return;
    try {
      await addDoc(collection(db, "events", eventData.id, "messages"), {
        photoId: photo.id,
        recipientName,
        recipientPhone,
        method,
        status: 'sent', // Since we open the app, we assume intent to send
        messageText,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Error logging message:", err);
    }
  };

  const handleWhatsAppPrintShare = async (photo: PhotoItem) => {
     const participant = participantMap[photo.participantId || ''];
     if (!participant?.phone) return alert("Telefone não encontrado");
     
     const photoLink = await generateShortLink(eventData!.id, photo.id);
     const finalMsg = formatMessage(eventData?.shareText || "", participant.name || "Convidado", eventData?.name || "Evento", photoLink);
     
     const num = participant.phone.replace(/\D/g, '');
     window.open(`https://wa.me/${num}?text=${encodeURIComponent(finalMsg)}`, '_blank');
     
     await logMessage(photo, 'whatsapp', participant.name || 'Convidado', participant.phone, finalMsg);
     toast.success("WhatsApp preparado com sucesso!");
  };

  const handleSMSPrintShare = async (photo: PhotoItem) => {
     const participant = participantMap[photo.participantId || ''];
     if (!participant?.phone) return alert("Telefone não encontrado");
     
     const photoLink = await generateShortLink(eventData!.id, photo.id);
     const finalMsg = formatMessage(eventData?.smsShareText || "", participant.name || "Convidado", eventData?.name || "Evento", photoLink);
     
     const num = participant.phone.replace(/\D/g, '');
     // Use ; separator for iOS if needed, but ?body= is standard
     window.open(`sms:${num}?body=${encodeURIComponent(finalMsg)}`, '_self');
     
     await logMessage(photo, 'sms', participant.name || 'Convidado', participant.phone, finalMsg);
     toast.success("SMS preparado com sucesso!");
  };

  const handlePrintQueue = async (photo: PhotoItem) => {
    try {
      await updateDoc(doc(db, "events", eventData!.id, "photos", photo.id), {
         printStatus: 'printed',
         printedAt: Date.now()
      });
      const printWindow = window.open('', '_blank');
      if (printWindow) {
         printWindow.document.write(`<img src="${photo.dataUrl}" style="width:100%;height:auto;"/>`);
         printWindow.document.close();
         printWindow.focus();
         printWindow.print();
      }
    } catch(err) {
       console.error("Error updating print status", err);
       alert("Erro ao enviar para impressão");
    }
  };

  const handleModerationDelete = async (photo: PhotoItem) => {
    if (!confirm("Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteDoc(doc(db, "events", eventData!.id, "photos", photo.id));
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir foto");
    }
  };

  const handleApprovePhoto = async (photo: PhotoItem) => {
    try {
      await updateDoc(doc(db, "events", eventData!.id, "photos", photo.id), {
        moderationStatus: 'approved'
      });
      
      // Aggregate lead info to the event if we have a participant
      if (photo.participantId && participantMap[photo.participantId]) {
        const pData = participantMap[photo.participantId];
        await addDoc(collection(db, "events", eventData!.id, "leads"), {
           eventId: eventData!.id,
           name: pData.name,
           phone: pData.phone,
           method: photo.source === 'mobile' ? 'mobile-capture' : 'desktop-upload',
           createdAt: Date.now()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao aprovar foto");
    }
  };

  const handleRejectPhoto = async (photo: PhotoItem) => {
    try {
      await updateDoc(doc(db, "events", eventData!.id, "photos", photo.id), {
        moderationStatus: 'rejected'
      });
    } catch (err) {
      console.error(err);
      alert("Erro ao rejeitar foto");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (quotaError) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center space-y-4 p-6 text-center">
        <h2 className="text-xl font-bold text-red-600">Limite de Acesso Atingido</h2>
        <p className="text-foreground/70 max-w-md">
          Esta aplicação atingiu o limite de consultas gratuitas diárias do Firebase. 
          O acesso será restaurado automaticamente amanhã.
        </p>
        <Button onClick={() => navigate("/")} variant="outline">Voltar para Home</Button>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center space-y-4">
        <p className="text-muted-foreground">Evento não encontrado.</p>
        <Button onClick={() => navigate("/")} variant="outline">Ir para Home</Button>
      </div>
    );
  }

  return (
    <main className="flex-1 p-0 md:p-6 bg-background h-full flex flex-col">
      {eventData.logoUrl && (
        <div className="w-full h-48 md:h-64 lg:h-80 bg-foreground md:mb-6 md:rounded-xl overflow-hidden shadow-md shrink-0">
          <img src={eventData.logoUrl} className="w-full h-full object-cover" alt="Banner do Evento" />
        </div>
      )}
      <div className="max-w-6xl w-full mx-auto p-6 md:p-0 space-y-6 flex-1">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{eventData.name}</h1>
            {eventData.date && (
              <p className="text-sm text-muted-foreground">
                {new Date(eventData.date).toLocaleDateString()} • {eventData.location}
              </p>
            )}
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <Dialog onOpenChange={(open) => open && handlePrepareShare()}>
                <DialogTrigger
                  render={
                    <Button variant="outline" className="gap-2 bg-card hover:bg-muted font-bold text-xs uppercase tracking-widest border-border/60">
                      <Share2 className="w-4 h-4 text-primary" />
                      <span className="hidden sm:inline">Compartilhar</span>
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tighter text-left">Compartilhar Evento</DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2 text-left">
                      Use os links abaixo para que seus convidados acessem a galeria ou capturem novas fotos.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-6 py-6">
                    <div className="space-y-3">
                       <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">Link da Galeria Pública</Label>
                       <div className="flex items-center gap-2">
                          <Button 
                            className="w-full h-14 rounded-xl shadow-lg font-black tracking-tight flex items-center justify-center gap-3"
                            onClick={() => {
                              navigator.clipboard.writeText(shortGalleryLink || "");
                              toast.success("Link da Galeria copiado!");
                            }}
                          >
                             <LinkIcon className="w-5 h-5 text-white" />
                             COPIAR LINK DA GALERIA
                          </Button>
                       </div>
                    </div>

                    <div className="space-y-3">
                       <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">Link de Captura (Mobile)</Label>
                       <div className="flex items-center gap-2">
                          <Button 
                            className="w-full h-14 rounded-xl shadow-lg font-black tracking-tight flex items-center justify-center gap-3 bg-primary hover:bg-primary/90"
                            onClick={() => {
                              navigator.clipboard.writeText(shortCaptureLink || "");
                              toast.success("Link de Captura copiado!");
                            }}
                          >
                             <Smartphone className="w-5 h-5 text-white" />
                             COPIAR LINK DE CAPTURA
                          </Button>
                       </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-6 bg-primary/5 rounded-3xl border border-primary/10">
                       <div className="bg-white p-3 rounded-2xl shadow-xl mb-4 transition-all duration-300">
                          {isGeneratingLinks ? (
                            <div className="w-32 h-32 flex items-center justify-center">
                              <Loader2 className="w-8 h-8 animate-spin text-primary/20" />
                            </div>
                          ) : (
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortCaptureLink || "")}`} 
                              alt="QR Code de Captura" 
                              className="w-32 h-32"
                            />
                          )}
                       </div>
                       <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">QR CODE DE CAPTURA</span>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" disabled={isExportingLeads} onClick={handleExportLeads} className="gap-2">
                {isExportingLeads ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-primary" />}
                <span className="hidden sm:inline">Exportar Leads</span>
              </Button>
              <Button variant="outline" disabled={isExportingEvent} onClick={handleExportEvent} className="gap-2">
                {isExportingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-primary" />}
                <span className="hidden sm:inline">Exportar Evento</span>
              </Button>
              <Button variant="outline" onClick={() => navigate(`/events/${eventData.id}/edit`)}>
                Editar Evento
              </Button>
            </div>
          )}
        </div>

        <Tabs defaultValue="gallery" className="w-full">
          {isOwner && (
            <TabsList className="mb-4">
              <TabsTrigger value="gallery">Galeria de Fotos</TabsTrigger>
              <TabsTrigger value="print" className="relative">
                Fila & Moderação
                {photos.filter(p => p.moderationStatus === 'pending').length > 0 && (
                   <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                      {photos.filter(p => p.moderationStatus === 'pending').length}
                   </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="leads">Leads Gerados</TabsTrigger>
              <TabsTrigger value="messages">Mensagens</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="gallery" className="mt-0">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className={`w-full ${isOwner ? 'md:w-2/3' : ''} order-2 md:order-1`}>
                {photos.filter(p => !p.moderationStatus || p.moderationStatus === 'approved').length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center bg-white rounded-xl border border-border">
                    <ImageIcon className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">Nenhuma foto aprovada ainda.</p>
                    {isOwner && <p className="text-sm text-muted-foreground/80 mt-1">Faça upload ou aprove fotos na aba de Moderação!</p>}
                  </div>
                ) : (
                  <div className="columns-2 md:columns-3 gap-4 space-y-4">
                    {photos.filter(p => !p.moderationStatus || p.moderationStatus === 'approved').map(photo => (
                      <div 
                        key={photo.id} 
                        className="break-inside-avoid relative group rounded-lg overflow-hidden border border-border bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handlePhotoAction(photo)}
                      >
                        <img 
                          src={photo.dataUrl} 
                          alt="Gallery Item" 
                          className="w-full h-auto object-cover"
                          loading="lazy"
                        />
                        {photo.source === 'mobile' && (
                          <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 shadow-sm" title="Enviado remotamente">
                             <Smartphone className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="gap-2 pointer-events-none"
                          >
                            <Download className="w-4 h-4" />
                            Ver / Baixar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isOwner && (
                <div className="w-full md:w-1/3 order-1 md:order-2 sticky top-6">
                  <div 
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors shadow-sm
                      ${isDragActive ? "border-primary/100 bg-primary/10" : "border-neutral-300 bg-white"}
                      ${uploading ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-background"}
                    `}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => document.getElementById('photo-upload')?.click()}
                  >
                    <input 
                      type="file" 
                      id="photo-upload" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={onFileInputChange}
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-primary/100" />
                        <p className="text-foreground/70 font-medium">Processando e enviando fotos...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="bg-blue-100 text-primary p-4 rounded-full mb-2">
                          <ImagePlus className="w-8 h-8" />
                        </div>
                        <p className="font-semibold text-foreground/90 text-lg">Upload de Fotos</p>
                        <p className="text-sm text-muted-foreground">Clique ou arraste as fotos aqui.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          {isOwner && (
            <>
              <TabsContent value="print" className="mt-0 space-y-6">
                 <div className="bg-white rounded-xl border border-border overflow-hidden">
                   <div className="px-6 py-4 border-b border-border bg-muted/20">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                         <History className="w-5 h-5 text-primary" /> Aguardando Moderação
                      </h3>
                   </div>
                   <div className="overflow-x-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Foto</TableHead>
                           <TableHead>Participante</TableHead>
                           <TableHead>Envio</TableHead>
                           <TableHead className="text-right">Ações</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                          {photos.filter(p => p.moderationStatus === 'pending').length === 0 ? (
                             <TableRow>
                                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                                  Nenhuma foto pendente de aprovação.
                                </TableCell>
                             </TableRow>
                          ) : (
                             photos.filter(p => p.moderationStatus === 'pending').map(photo => {
                                const participant = participantMap[photo.participantId || ''];
                                return (
                                   <TableRow key={photo.id}>
                                      <TableCell>
                                         <img 
                                     src={photo.dataUrl} 
                                     alt="Thumbnail" 
                                     className="w-16 h-16 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity" 
                                     onClick={() => setViewingPhoto(photo)}
                                   />
                                      </TableCell>
                                      <TableCell>
                                         <div className="font-medium text-foreground">{participant?.name || 'Desconhecido'}</div>
                                         <div className="text-xs text-muted-foreground">{participant?.phone || '-'}</div>
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                         {new Date(photo.createdAt).toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right">
                                         <div className="flex items-center gap-2 justify-end">
                                            <Button size="sm" className="gap-1 bg-green-500 hover:bg-green-600" onClick={() => handleApprovePhoto(photo)}>
                                               <CheckCircle2 className="w-4 h-4" /> Aprovar
                                            </Button>
                                            <Button size="icon" variant="outline" className="text-red-500 hover:text-red-600" onClick={() => handleRejectPhoto(photo)}>
                                               <Ban className="w-4 h-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => handleModerationDelete(photo)}>
                                               <Trash2 className="w-4 h-4 text-muted-foreground" />
                                            </Button>
                                         </div>
                                      </TableCell>
                                   </TableRow>
                                );
                             })
                          )}
                       </TableBody>
                     </Table>
                   </div>
                 </div>

                 <div className="bg-white rounded-xl border border-border overflow-hidden">
                   <div className="px-6 py-4 border-b border-border bg-muted/20">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                         <Printer className="w-5 h-5 text-primary" /> Fila de Impressão (Aprovados)
                      </h3>
                   </div>
                   <div className="overflow-x-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Foto</TableHead>
                           <TableHead>Participante</TableHead>
                           <TableHead>Envio</TableHead>
                           <TableHead>Status / Impresso</TableHead>
                           <TableHead className="text-right">Ações</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {photos.filter(p => p.printStatus && (p.moderationStatus === 'approved' || !p.moderationStatus)).length === 0 && (
                           <TableRow>
                             <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                               Nenhuma foto na fila de impressão.
                             </TableCell>
                           </TableRow>
                         )}
                         {photos.filter(p => p.printStatus && (p.moderationStatus === 'approved' || !p.moderationStatus)).map(photo => {
                            const participant = participantMap[photo.participantId || ''];
                            const isPrinted = photo.printStatus === 'printed';
                            return (
                              <TableRow key={photo.id}>
                                <TableCell>
                                  <img src={photo.dataUrl} 
                                     alt="Thumbnail" 
                                     className="w-16 h-16 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity" 
                                     onClick={() => setViewingPhoto(photo)}
                                   />
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-foreground">{participant?.name || 'Desconhecido'}</div>
                                    <div className="text-xs text-muted-foreground">{participant?.phone || '-'}</div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {new Date(photo.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                   <div className="flex flex-col items-start gap-1">
                                     <Badge variant={isPrinted ? 'default' : 'secondary'} className={isPrinted ? 'bg-green-500 hover:bg-green-600' : ''}>
                                        {isPrinted ? 'Enviado para Impressora' : 'Aguardando Impressão'}
                                     </Badge>
                                     {isPrinted && photo.printedAt && (
                                        <span className="text-xs text-muted-foreground">{new Date(photo.printedAt).toLocaleTimeString()}</span>
                                     )}
                                   </div>
                                </TableCell>
                                <TableCell className="text-right">
                                   <div className="flex items-center gap-2 justify-end">
                                     <Button size="icon" variant="outline" title="WhatsApp" onClick={() => handleWhatsAppPrintShare(photo)}>
                                        <MessageCircle className="w-4 h-4 text-green-500" />
                                     </Button>
                                     <Button size="icon" variant="outline" title="SMS" onClick={() => handleSMSPrintShare(photo)}>
                                        <MessageCircle className="w-4 h-4 text-primary" />
                                     </Button>
                                     <Button size="icon" variant="outline" title="Download" onClick={() => {
                                          const link = document.createElement("a");
                                          link.href = photo.dataUrl;
                                          link.download = `foto-${Date.now()}.jpg`;
                                          link.click();
                                     }}>
                                        <DownloadCloud className="w-4 h-4" />
                                     </Button>
                                     <Button size="sm" className="gap-1 ml-2" variant={isPrinted ? "secondary" : "default"} onClick={() => handlePrintQueue(photo)}>
                                        <Printer className="w-4 h-4" /> Imprimir
                                     </Button>
                                     <Button size="icon" variant="destructive" className="ml-2" title="Excluir" onClick={() => handleModerationDelete(photo)}>
                                        <Trash2 className="w-4 h-4" />
                                     </Button>
                                   </div>
                                </TableCell>
                              </TableRow>
                            );
                         })}
                       </TableBody>
                     </Table>
                   </div>
                 </div>
              </TabsContent>
              <TabsContent value="leads" className="mt-0 bg-white rounded-xl border border-border overflow-hidden">
                  <div className="p-6 border-b border-border bg-muted/20">
                     <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                           <MessageCircle className="w-5 h-5 text-primary" /> Leads Gerados
                        </h3>
                        <Button variant="outline" size="sm" onClick={handleExportLeads} className="gap-2">
                           <FileSpreadsheet className="w-4 h-4" /> Exportar
                        </Button>
                     </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data / Hora</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Compartilhamento</TableHead>
                          <TableHead>Comercial</TableHead>
                          <TableHead>Origem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingLeads ? (
                           <TableRow>
                              <TableCell colSpan={4} className="text-center py-10">
                                 <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                              </TableCell>
                           </TableRow>
                        ) : leads.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                               Nenhum lead registrado ainda.
                            </TableCell>
                          </TableRow>
                        ) : (
                          leads.map(lead => (
                            <TableRow key={lead.id}>
                              <TableCell className="text-sm font-medium">
                                 {new Date(lead.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell>{lead.name || '-'}</TableCell>
                              <TableCell>{lead.phone || '-'}</TableCell>
                              <TableCell>
                                 <Badge variant={lead.dataSharingConsent ? "default" : "secondary"} className="text-[10px]">
                                    {lead.dataSharingConsent ? "Sim" : "Não"}
                                 </Badge>
                              </TableCell>
                              <TableCell>
                                 <Badge variant={lead.commercialConsent ? "default" : "secondary"} className="text-[10px]">
                                    {lead.commercialConsent ? "Sim" : "Não"}
                                 </Badge>
                              </TableCell>
                              <TableCell>
                                 <Badge variant="outline" className="capitalize">
                                    {lead.method?.replace('-', ' ') || 'Indefinido'}
                                 </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
              </TabsContent>
              <TabsContent value="messages" className="mt-0 bg-white rounded-xl border border-border overflow-hidden">
                  <div className="p-6 border-b border-border bg-muted/20">
                      <div className="flex items-center justify-between">
                         <h3 className="font-bold text-lg flex items-center gap-2">
                            <Send className="w-5 h-5 text-primary" /> Relatório de Mensagens
                         </h3>
                      </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data / Hora</TableHead>
                          <TableHead>Destinatário</TableHead>
                          <TableHead>Canal</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Mensagem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingMessages ? (
                           <TableRow>
                              <TableCell colSpan={5} className="text-center py-10">
                                 <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                              </TableCell>
                           </TableRow>
                        ) : messages.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                               Nenhuma mensagem enviada ainda.
                            </TableCell>
                          </TableRow>
                        ) : (
                          messages.map(msg => (
                            <TableRow key={msg.id}>
                              <TableCell className="text-sm font-medium whitespace-nowrap">
                                 {new Date(msg.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                 <div className="font-medium">{msg.recipientName || '-'}</div>
                                 <div className="text-xs text-muted-foreground">{msg.recipientPhone || '-'}</div>
                              </TableCell>
                              <TableCell>
                                 <Badge variant="outline" className={`capitalize flex items-center gap-1 w-fit ${msg.method === 'whatsapp' ? 'text-green-600 bg-green-50' : 'text-slate-600 bg-slate-50'}`}>
                                    {msg.method === 'whatsapp' ? <MessageCircle className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                                    {msg.method}
                                 </Badge>
                              </TableCell>
                              <TableCell>
                                 <Badge variant={msg.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize">
                                    {msg.status}
                                 </Badge>
                              </TableCell>
                              <TableCell className="max-w-[300px]">
                                 <p className="text-xs text-muted-foreground line-clamp-2" title={msg.messageText}>
                                    {msg.messageText}
                                 </p>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleParticipantSubmit}>
            <DialogHeader>
              <DialogTitle>Informações Necessárias</DialogTitle>
              <DialogDescription>
                Para baixar fotos deste evento, precisamos de algumas informações para fins de contato e consentimento (LGPD).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input 
                  id="name" 
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Seu nome"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                <PhoneInput
                  id="phone"
                  international
                  defaultCountry="BR"
                  value={formPhone}
                  onChange={setFormPhone}
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                  style={{
                    '--PhoneInputCountryFlag-height': '1.2em'
                  } as React.CSSProperties}
                />
              </div>
              <div className="space-y-4 pt-2">
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="lgpd" 
                    checked={formLgpd}
                    onCheckedChange={(checked) => setFormLgpd(checked as boolean)}
                    required 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label 
                      htmlFor="lgpd" 
                      className="text-sm font-normal text-foreground/70 leading-tight"
                    >
                      Ao informar meus dados, concordo com a{' '}
                      <button 
                        type="button" 
                        onClick={() => setIsPrivacyOpen(true)}
                        className="text-primary font-bold hover:underline"
                      >
                        Política de Privacidade
                      </button>.
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="commercial" 
                    checked={formCommercialConsent}
                    onCheckedChange={(checked) => setFormCommercialConsent(checked as boolean)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label 
                      htmlFor="commercial" 
                      className="text-sm font-normal text-foreground/70 leading-tight"
                    >
                      Aceito receber contatos comerciais e novidades.
                    </Label>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submittingParticipant || !formLgpd || !formName || !formPhone}>
                {submittingParticipant ? "Salvando..." : "Salvar e Baixar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPrivacyOpen} onOpenChange={setIsPrivacyOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-black tracking-tight">Política de Privacidade</DialogTitle>
            <DialogDescription className="text-sm font-medium">
              Termos de uso e processamento de dados do evento.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 p-6 rounded-2xl border border-border/40">
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {eventData.lgpdText || "Ao prosseguir, você concorda que seus dados sejam utilizados para a finalidade de entrega das fotos deste evento via WhatsApp/SMS."}
            </p>
          </div>
          <Button onClick={() => setIsPrivacyOpen(false)} className="w-full h-12 rounded-xl mt-4">
            Fechar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={isAIFraming} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm w-11/12 rounded-xl border-0 p-8 flex flex-col items-center gap-6 shadow-2xl">
          <div className="animate-spin text-primary">
            <Loader2 className="w-10 h-10" />
          </div>
          <div className="text-center">
            <DialogTitle className="text-xl font-black tracking-tight mb-2">Processando IA...</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {aiFramingProgress.current === 0 
                ? "Carregando modelos de visão computacional..."
                : `Analisando e enquadrando foto ${aiFramingProgress.current} de ${aiFramingProgress.total}`}
            </p>
          </div>
          {aiFramingProgress.total > 0 && (
             <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden mt-2">
                <div 
                   className="bg-primary h-full transition-all duration-300"
                   style={{ width: `${(aiFramingProgress.current / aiFramingProgress.total) * 100}%` }}
                />
             </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={showFramingChoiceModal} onOpenChange={setShowFramingChoiceModal}>
        <DialogContent className="max-w-md w-11/12 rounded-xl border-0 p-6 flex flex-col gap-6 shadow-2xl">
          <DialogTitle className="text-xl font-black text-center tracking-tight">
            Como deseja enquadrar as fotos?
          </DialogTitle>
          <div className="flex flex-col gap-4">
            <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center border-2 hover:border-primary hover:bg-primary/5 transition-all text-foreground"
                onClick={() => {
                    startAIFraming(pendingUploadFiles);
                    setShowFramingChoiceModal(false);
                    setPendingUploadFiles([]);
                }}
            >
                <div className="flex items-center gap-2 font-bold mb-1">
                    <span className="text-xl">🤖</span> Enquadramento Automático por IA
                </div>
                <span className="text-xs text-muted-foreground font-medium">Detecta rostos e centraliza</span>
            </Button>

            <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center border-2 hover:border-primary hover:bg-primary/5 transition-all text-foreground"
                onClick={() => {
                    setUploadQueue(pendingUploadFiles);
                    setShowFramingChoiceModal(false);
                    setPendingUploadFiles([]);
                }}
            >
                <div className="flex items-center gap-2 font-bold mb-1">
                    <span className="text-xl">✋</span> Enquadramento Manual
                </div>
                <span className="text-xs text-muted-foreground font-medium">Abre o editor de recorte como visualizado hoje</span>
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setShowFramingChoiceModal(false)} className="mx-auto rounded-full font-bold">Cancelar Upload</Button>
        </DialogContent>
      </Dialog>

      <PhotoCustomizerModal
        isOpen={!!currentFileB64}
        onClose={() => {
          setCurrentFileB64(null);
          setUploadQueue(q => q.slice(1));
        }}
        imageUrl={currentFileB64}
        overlays={eventData.overlays || []}
        eventData={eventData}
        onSave={async (finalB64, originalB64) => {
          const docData: any = {
            eventId: eventData.id,
            uploaderId: user?.uid || "guest",
            dataUrl: finalB64,
            createdAt: Date.now(),
            source: 'desktop'
          };
          if (finalB64.length + originalB64.length < 950000) {
            docData.originalUrl = originalB64;
          }
          const savedDoc = await addDoc(collection(db, "events", eventData.id, "photos"), docData);
          return savedDoc.id;
        }}
      />

      <PhotoActionModal
        photo={viewingPhoto}
        onClose={() => setViewingPhoto(null)}
        onNext={handleNextPhoto}
        onPrev={handlePrevPhoto}
        shareText={eventData.shareText}
        smsShareText={eventData.smsShareText}
        eventName={eventData.name}
        eventDate={eventData.date}
        ownerId={eventData.ownerId}
        isOwner={isOwner}
      />
    </main>
  );
}
