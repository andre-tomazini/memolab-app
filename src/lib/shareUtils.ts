import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const formatMessage = (template: string, leadName: string, eventName: string, photoLink: string) => {
  let msg = template || "";
  
  if (!msg) {
    return photoLink;
  }

  // Robust replacement for case-insensitive tags
  msg = msg.replace(/\[Nome-?Lead[\])\}]?/gi, leadName || "Convidado");
  msg = msg.replace(/\[Nome-?Evento[\])\}]?/gi, eventName || "Evento");
  msg = msg.replace(/\[Nome-?Convidado[\])\}]?/gi, leadName || "Convidado");
  msg = msg.replace(/\[Evento[\])\}]?/gi, eventName || "Evento");
  msg = msg.replace(/\[Lead[\])\}]?/gi, leadName || "Convidado");
  
  // Replace [link-foto] case-insensitively, optionally catching trailing brackets or partial matches
  msg = msg.replace(/\[link-?foto[^\]\s]*[\])\}]?/gi, photoLink);

  return msg;
};

export const getStandardFilename = (eventName: string, eventDate: number, index: string | number) => {
  const date = new Date(eventDate);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  
  // Clean event name from special characters and spaces
  const cleanEventName = eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const indexStr = String(index).padStart(4, '0');
  
  return `${dd}${mm}${yy}-${cleanEventName}-${indexStr}.jpg`;
};

export const generateShortLink = async (eventId: string, photoId: string) => {
  // Generate a 5-char code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
      await setDoc(doc(db, "shortLinks", code), {
          type: 'photo',
          eventId,
          photoId,
          createdAt: Date.now()
      });
      return `${window.location.origin}/${code}`;
  } catch (err) {
      console.error("Error creating short link:", err);
      // Fallback to full link
      return `${window.location.origin}/galeria/${eventId}/${photoId}`;
  }
};

export const generateShortCaptureLink = async (eventId: string) => {
  // Generate a 5-char code with 'C' prefix to distinguish or just random
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'C'; // Start with C for Capture
  for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
      await setDoc(doc(db, "shortLinks", code), {
          type: 'capture',
          eventId,
          createdAt: Date.now()
      });
      return `${window.location.origin}/${code}`;
  } catch (err) {
      console.error("Error creating short capture link:", err);
      return `${window.location.origin}/capturamobile/${eventId}`;
  }
};

export const generateShortGalleryLink = async (eventId: string) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'G'; // G for Gallery
  for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
      await setDoc(doc(db, "shortLinks", code), {
          type: 'gallery',
          eventId,
          createdAt: Date.now()
      });
      return `${window.location.origin}/${code}`;
  } catch (err) {
      console.error("Error creating short gallery link:", err);
      return `${window.location.origin}/galeria/${eventId}`;
  }
};
