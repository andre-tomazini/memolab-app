import express from "express";
import path from "path";
import fs from "fs/promises";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let vite: any = null;

  // Helper to fetch Firestore doc via REST API (lightweight server-side fetch)
  async function getFirestoreDoc(collectionName: string, docId: string) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      const configStr = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configStr);
      const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/${collectionName}/${docId}?key=${config.apiKey}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.error(`Error fetching ${collectionName}/${docId}:`, e);
      return null;
    }
  }

  // Helper to fetch Event by Slug via REST runQuery
  async function getEventBySlug(slug: string) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      const configStr = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configStr);
      
      const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents:runQuery?key=${config.apiKey}`;
      
      const query = {
        structuredQuery: {
          from: [{ collectionId: "events" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "slug" },
              op: "EQUAL",
              value: { stringValue: slug }
            }
          },
          limit: 1
        }
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query)
      });

      if (!resp.ok) return null;
      const results = await resp.json();
      
      // runQuery returns an array of [{ document: { ... } }] or empty
      if (Array.isArray(results) && results[0]?.document) {
        const doc = results[0].document;
        // The rest of the code expects a format similar to getDoc, but doc already has fields
        return doc;
      }
      return null;
    } catch (e) {
      console.error(`Error fetching event by slug ${slug}:`, e);
      return null;
    }
  }

  // Helper to handle meta injection and serving HTML
  async function serveWithMeta(req: express.Request, res: express.Response, next: express.NextFunction, eventIdOrDoc?: any, photoId?: string) {
    let eventDoc = null;
    
    if (typeof eventIdOrDoc === 'string') {
      // 1. Try resolving by ID
      eventDoc = await getFirestoreDoc("events", eventIdOrDoc);
      // 2. If not found, try resolving by Slug
      if (!eventDoc) {
        eventDoc = await getEventBySlug(eventIdOrDoc);
      }
    } else if (eventIdOrDoc && typeof eventIdOrDoc === 'object') {
      eventDoc = eventIdOrDoc;
    }
    
    const fields = eventDoc?.fields || {};
    const eventName = fields.name?.stringValue || "";
    const clientName = fields.clientName?.stringValue || "";
    const dateVal = fields.date?.integerValue || fields.date?.doubleValue || 0;
    const logoUrl = fields.logoUrl?.stringValue || "";
    
    // Determine the OG image - shared photo or event logo
    let previewImage = logoUrl || "/og-image.png"; // Fallback to a default if exists
    if (photoId && eventDoc) {
      // Fetch the photo document to get its URL for the shared preview
      const eventId = eventDoc.name.split("/").pop(); // Extract actual ID from "projects/.../documents/events/ID"
      const photoDoc = await getFirestoreDoc(`events/${eventId}/photos`, photoId);
      if (photoDoc && photoDoc.fields?.dataUrl?.stringValue) {
        previewImage = photoDoc.fields.dataUrl.stringValue;
      }
    }

    // Requirement: Title must always be memo.LAB
    const title = "memo.LAB";
    const dateStr = dateVal ? new Date(Number(dateVal)).toLocaleDateString("pt-BR") : "";
    
    // Requirement: Preview description: Nome do Evento | Cliente | Data
    let description = "Plataforma de Fotolembrança Profissional";
    if (eventName) {
      description = `${eventName}${clientName ? " | " + clientName : ""}${dateStr ? " | " + dateStr : ""}`;
    }

    let htmlPath = process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "dist", "index.html")
      : path.join(process.cwd(), "index.html");

    try {
      let html = await fs.readFile(htmlPath, "utf-8");
      
      const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${previewImage}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${previewImage}">`;

      // Replace existing title or inject before </head>
      if (html.includes("<title>")) {
        html = html.replace(/<title>.*?<\/title>/, metaTags);
      } else {
        html = html.replace("</head>", `${metaTags}\n  </head>`);
      }

      if (process.env.NODE_ENV !== "production" && vite) {
        html = await vite.transformIndexHtml(req.originalUrl, html);
      }

      return res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      console.error("Error serving HTML with meta:", err);
      return next();
    }
  }

  // API Route: Send SMS via Mobizon
  app.post("/api/send-sms", async (req, res) => {
    try {
      const { apiKey, to, text, senderName } = req.body;
      
      if (!apiKey || !to || !text) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Format recipient: mobizon expects country code, e.g. BR 55...
      let recipient = to.replace(/\D/g, "");
      
      // Brazilian numbers: if 10 or 11 digits, assume missing 55 country code
      if (recipient.length === 10 || recipient.length === 11) {
        recipient = "55" + recipient;
      }

      const queryParams = new URLSearchParams({
        apiKey: apiKey,
        recipient: recipient,
        text: text,
        output: "json"
      });

      if (senderName) {
        queryParams.append("from", senderName);
      }

      console.log(`Sending SMS to ${recipient} via Mobizon...`);
      
      const response = await fetch(`https://api.mobizon.com.br/service/message/sendSmsMessage?${queryParams.toString()}`, {
        method: "GET"
      });

      const data = await response.json();
      console.log("Mobizon response:", data);
      
      if (data.code === 0 || data.code === "0") {
        return res.json({ success: true, data });
      } else {
        return res.status(400).json({ success: false, error: data.message || "Mobizon error code: " + data.code, data });
      }

    } catch (error) {
      console.error("SMS Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Public Event Gallery and Capture Routes
  app.get(["/galeria", "/galeria/:eventId", "/capturamobile", "/capturamobile/:eventId"], (req, res, next) => {
    const eventId = req.params.eventId;
    if (eventId) {
      serveWithMeta(req, res, next, eventId);
    } else {
      // Just serve the app, client-side will resolve the hash
      serveWithMeta(req, res, next, null);
    }
  });

  // Photo Share Route
  app.get(["/galeria/:eventId/:photoId", "/p/:eventId/:photoId"], (req, res, next) => {
    serveWithMeta(req, res, next, req.params.eventId, req.params.photoId);
  });

  // Short Link & Slug Resolver Route (Root)
  app.get("/:shortCode", async (req, res, next) => {
    const { shortCode } = req.params;
    // Basic validation to avoid catching system files or assets
    if (!shortCode || shortCode.length < 3 || shortCode.length > 64 || shortCode.includes(".")) {
      return next();
    }
    
    // 1. Try resolving as a short link first
    const shortDoc = await getFirestoreDoc("shortLinks", shortCode);
    if (shortDoc && shortDoc.fields?.eventId?.stringValue) {
      const pId = shortDoc.fields.photoId?.stringValue;
      return serveWithMeta(req, res, next, shortDoc.fields.eventId.stringValue, pId);
    }
    
    // 2. Try resolving as an event slug
    const eventBySlug = await getEventBySlug(shortCode);
    if (eventBySlug) {
      return serveWithMeta(req, res, next, eventBySlug);
    }

    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
