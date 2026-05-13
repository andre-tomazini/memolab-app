import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import Navbar from "./components/layout/Navbar";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import EventGallery from "./pages/EventGallery";
import Users from "./pages/Users";
import EventForm from "./pages/EventForm";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import PublicGallery from "./pages/PublicGallery";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicPhoto from "./pages/PublicPhoto";
import MobileCapture from "./pages/MobileCapture";
import ShortLinkRedirect from "./pages/ShortLinkRedirect";

function TitleUpdater() {
  const location = useLocation();
  useEffect(() => {
    document.title = "memo.LAB";
  }, [location]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <TitleUpdater />
        <div className="min-h-screen flex flex-col font-sans">
          <Routes>
            {/* Public View Pages (No Navbar) */}
            <Route path="/p/:eventId/:photoId" element={<PublicPhoto />} />
            <Route path="/galeria" element={<PublicGallery />} />
            <Route path="/galeria/:eventId" element={<PublicGallery />} />
            <Route path="/galeria/:eventId/:photoId" element={<PublicGallery />} />
            <Route path="/capturamobile" element={<MobileCapture />} />
            <Route path="/capturamobile/:eventId" element={<MobileCapture />} />
            <Route path="/capture/:eventId" element={<MobileCapture />} />
            <Route path="/g/:eventId" element={<PublicGallery />} />
            <Route path="/g/:eventId/:photoId" element={<PublicGallery />} />
            <Route path="/login" element={<Login />} />

            {/* Admin/Dashboard Pages (With Navbar) */}
            <Route path="/settings" element={<ProtectedRoute><Navbar /><Settings /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><Navbar /><Users /></ProtectedRoute>} />
            <Route path="/events/new" element={<ProtectedRoute><Navbar /><EventForm /></ProtectedRoute>} />
            <Route path="/events/:eventId/edit" element={<ProtectedRoute><Navbar /><EventForm /></ProtectedRoute>} />
            <Route path="/event/:eventId" element={<ProtectedRoute><Navbar /><EventGallery /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Navbar /><Dashboard /></ProtectedRoute>} />
            <Route path="/" element={<><Navbar /><Home /></>} />

            {/* Catch-all for slug links: site.com/slug or site.com/shortcode */}
            <Route path="/:shortCode" element={<ShortLinkRedirect />} />
            <Route path="/:eventId/:photoId" element={<PublicGallery />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
