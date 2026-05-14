import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Loader2 } from "lucide-react";

export default function ShortLinkRedirect() {
  const { shortCode } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    async function resolveShortLink() {
      if (!shortCode) return;
      
      try {
        // 1. Try resolving as short link first
        const docRef = doc(db, "shortLinks", shortCode);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.type === 'capture') {
            navigate(`/capturamobile/${data.eventId}`, { replace: true });
          } else if (data.type === 'gallery') {
            navigate(`/galeria/${data.eventId}`, { replace: true });
          } else {
            // Default to photo or check data.photoId
            if (data.photoId) {
              navigate(`/p/${data.eventId}/${data.photoId}`, { replace: true });
            } else {
              navigate(`/galeria/${data.eventId}`, { replace: true });
            }
          }
          return;
        }

        // 2. Try resolving as event slug
        const q = query(collection(db, "events"), where("slug", "==", shortCode.toLowerCase()), limit(1));
        const slugSnap = await getDocs(q);
        
        if (!slugSnap.empty) {
          const eventId = slugSnap.docs[0].id;
          navigate(`/galeria/${eventId}`, { replace: true });
          return;
        }

        setError(true);
      } catch (err) {
        console.error("Error resolving short link or slug:", err);
        setError(true);
      }
    }

    resolveShortLink();
  }, [shortCode, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <h1 className="text-2xl font-bold text-foreground/90 mb-2">Link não encontrado</h1>
        <p className="text-foreground/70">Este link expirou ou nunca existiu.</p>
        <button 
          onClick={() => navigate("/")}
          className="mt-6 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
      <p className="text-foreground/70">Redirecionando para sua foto...</p>
    </div>
  );
}
