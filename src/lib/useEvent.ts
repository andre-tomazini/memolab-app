import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from './firestoreUtils';

export interface EventItem {
  id: string;
  name: string;
  date: number;
  location: string;
  clientName: string;
  slug: string;
  dpi: number;
  logoUrl: string;
  overlays: { url: string; orientation: string }[];
  shareText: string;
  smsShareText: string;
  isPublic: boolean;
  identifyParticipants: boolean;
  enableMobileCapture?: boolean;
  ownerId: string;
  watermarkText?: string;
  createdAt: number;
  lgpdText?: string;
}

export function useEvent(eventId: string | undefined) {
  const [eventData, setEventData] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaError, setQuotaError] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchEvent() {
      if (!eventId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setQuotaError(false);
      try {
        let evData: EventItem | null = null;
        const eventIdParam = eventId;

        // 1. Try directly by ID
        try {
          const docSnap = await getDoc(doc(db, "events", eventIdParam));
          if (docSnap.exists()) {
            evData = { id: docSnap.id, ...docSnap.data() } as EventItem;
          }
        } catch (err) {
          // Silent catch for direct ID lookup permission or not found
        }

        // 2. Try slug lookup if ID lookup didn't find anything
        if (!evData) {
          const slugLower = eventIdParam.toLowerCase();
          
          if (user) {
            // Try looking for user's own event first
            const qOwn = query(
              collection(db, "events"), 
              where("slug", "==", slugLower),
              where("ownerId", "==", user.uid),
              limit(1)
            );
            try {
              const ownSnap = await getDocs(qOwn);
              if (!ownSnap.empty) {
                evData = { id: ownSnap.docs[0].id, ...ownSnap.docs[0].data() } as EventItem;
              }
            } catch (err) {
              console.warn("Permission denied for own event query");
            }
          }

          if (!evData) {
            // Try looking for event by slug (publicly accessible)
            try {
              const qSlug = query(
                collection(db, "events"), 
                where("slug", "==", slugLower),
                limit(1)
              );
              const slugSnap = await getDocs(qSlug);
              
              if (!slugSnap.empty) {
                evData = { id: slugSnap.docs[0].id, ...slugSnap.docs[0].data() } as EventItem;
              }
            } catch (err) {
              console.error("Error fetching public event by slug:", err);
              // Handle permission error specifically if it happens
              if (err instanceof Error && err.message.includes('permission')) {
                 handleFirestoreError(err, OperationType.LIST, "events");
              }
            }
          }
        }

        if (evData && evData.ownerId) {
          // Fetch settings for lgpdText
          try {
            const settingsSnap = await getDoc(doc(db, "settings", evData.ownerId));
            if (settingsSnap.exists()) {
              evData.lgpdText = settingsSnap.data().lgpdText;
            }
          } catch (e) {
            console.error("Error fetching settings for lgpdText", e);
          }
        }

        setEventData(evData);
      } catch (error: any) {
        if (error.isQuota) {
          setQuotaError(true);
        }
        console.error("Error fetching event hook:", error);
        setEventData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [eventId, user?.uid]);

  return { eventData, loading, quotaError, setEventData };
}
