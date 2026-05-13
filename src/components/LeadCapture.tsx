import React, { useState } from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Send, ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { useEffect } from 'react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface LeadCaptureProps {
  eventId: string | undefined;
  method: 'whatsapp' | 'sms';
  onBack: () => void;
  onContinue: (name: string, phone: string) => Promise<void>;
}

export function LeadCapture({ eventId, method, onBack, onContinue }: LeadCaptureProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | undefined>('+55');
  const [dataSharingConsent, setDataSharingConsent] = useState(true);
  const [commercialConsent, setCommercialConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [lgpdText, setLgpdText] = useState('');

  useEffect(() => {
    async function fetchLgpdText() {
      if (!eventId) return;
      try {
        const eventSnap = await getDoc(doc(db, 'events', eventId));
        if (eventSnap.exists()) {
          setLgpdText(eventSnap.data().lgpdText || 'Ao prosseguir, você concorda que seus dados sejam utilizados para a finalidade de entrega das fotos deste evento via WhatsApp/SMS.');
        }
      } catch (err) {
        console.error("Error fetching event for LGPD:", err);
      }
    }
    fetchLgpdText();
  }, [eventId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phone) {
      toast.error("Por favor, preencha o número de telefone.");
      return;
    }

    if (!dataSharingConsent) {
      toast.error("Para continuar, você precisa aceitar os termos de compartilhamento de fotos.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (eventId) {
        try {
          await addDoc(collection(db, `events/${eventId}/leads`), {
              eventId,
              name: name.trim(),
              phone,
              method,
              dataSharingConsent,
              commercialConsent,
              createdAt: Date.now()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `events/${eventId}/leads`);
        }
      }
      await onContinue(name.trim(), phone);
    } catch (err) {
      console.error("Error saving lead:", err);
      toast.error("Erro ao validar seus dados.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      if (!phone) {
        toast.error("Telefone é obrigatório mesmo ao pular identificação.");
        setIsSubmitting(false);
        return;
      }

      if (!dataSharingConsent) {
        toast.error("Para receber a foto, você precisa autorizar o processamento dos dados.");
        setIsSubmitting(false);
        return;
      }

       if (eventId) {
         await addDoc(collection(db, `events/${eventId}/leads`), {
           eventId,
           name: '',
           phone,
           method,
           dataSharingConsent,
           commercialConsent,
           createdAt: Date.now()
         });
       }

       await onContinue('', phone);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 bg-white rounded-3xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 rounded-full hover:bg-muted">
           <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="space-y-0.5">
          <span className="font-black text-xl tracking-tight text-foreground">Identificação</span>
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            <ShieldCheck className="w-3 h-3 text-primary" /> Conformidade LGPD
          </div>
        </div>
      </div>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-bold text-foreground">Nome Completo</Label>
          <Input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Ex: João Silva" 
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-bold text-foreground">WhatsApp / Telefone *</Label>
          <PhoneInput
            international
            defaultCountry="BR"
            value={phone}
            onChange={setPhone}
            className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            style={{
              '--PhoneInputCountryFlag-height': '1.2em'
            } as React.CSSProperties}
          />
        </div>
      </div>

      <div className="bg-muted/30 p-4 rounded-2xl space-y-4 border border-border/40">
        <div className="flex items-start space-x-3">
          <Checkbox 
            id="dataSharingConsent" 
            checked={dataSharingConsent} 
            onCheckedChange={(v) => setDataSharingConsent(v === true)}
            className="mt-1 rounded-md border-2"
          />
          <Label 
            htmlFor="dataSharingConsent" 
            className="text-xs leading-relaxed font-medium text-muted-foreground cursor-pointer select-none"
          >
            Ao informar os seus dados, você concorda com a nossa{' '}
            <button 
              type="button" 
              onClick={() => setIsPrivacyOpen(true)}
              className="text-primary font-bold hover:underline"
            >
              Política de Privacidade
            </button>. <span className="text-primary font-bold">*</span>
          </Label>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox 
            id="commercialConsent" 
            checked={commercialConsent} 
            onCheckedChange={(v) => setCommercialConsent(v === true)}
            className="mt-1 rounded-md border-2"
          />
          <Label 
            htmlFor="commercialConsent" 
            className="text-xs leading-relaxed font-medium text-muted-foreground cursor-pointer select-none"
          >
            Aceito receber contatos comerciais e novidades.
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-4">
        <Button type="submit" disabled={isSubmitting} className="h-14 bg-primary hover:bg-primary/90 w-full text-lg font-black tracking-tight rounded-2xl shadow-lg transition-all active:scale-95">
          {isSubmitting ? "Processando..." : <><Send className="w-5 h-5 mr-3" /> Receber Foto</>}
        </Button>

        <button 
          type="button" 
          disabled={isSubmitting} 
          onClick={handleSkip} 
          className="text-xs font-bold text-muted-foreground/60 hover:text-primary transition-colors py-2 flex items-center justify-center gap-1"
        >
          Já me identifiquei nesta sessão
        </button>
      </div>

      <Dialog open={isPrivacyOpen} onOpenChange={setIsPrivacyOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
          <DialogHeader className="mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight">Política de Privacidade</DialogTitle>
            <DialogDescription className="text-sm font-medium">
              Termos de uso e processamento de dados do evento.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 p-6 rounded-2xl border border-border/40">
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {lgpdText}
            </p>
          </div>
          <Button onClick={() => setIsPrivacyOpen(false)} className="w-full h-12 rounded-xl mt-4">
            Entendi e concordo
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}
