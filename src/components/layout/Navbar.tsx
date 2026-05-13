import { useAuth } from "@/src/contexts/AuthContext";
import { auth } from "@/src/lib/firebase";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { Button } from "@/src/components/ui/button";
import { LogOut, Home as HomeIcon, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { MemoLabIcon } from "@/src/components/MemoLabIcon";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header className="border-b border-border bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(user ? '/dashboard' : '/')}>
            <MemoLabIcon className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-tight text-foreground">memo<span className="font-light text-primary">.LAB</span></span>
          </div>
          {user && (
            <nav className="hidden sm:flex gap-4">
               <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="font-bold gap-2">
                 <HomeIcon className="w-4 h-4" />
                 Meus Eventos
               </Button>
               {isAdmin && (
                 <Button variant="ghost" size="sm" onClick={() => navigate('/users')} className="gap-2">
                   Usuários
                 </Button>
               )}
               <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="gap-2">
                 <Settings className="w-4 h-4" />
                 Configurações
               </Button>
            </nav>
          )}
        </div>

        <div>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-foreground/70 hidden sm:inline-block">
                Olá, {user.displayName || user.email?.split('@')[0] || "Usuário"}
              </span>
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src={user.photoURL || undefined} alt="Avatar" />
                <AvatarFallback>{(user.displayName?.charAt(0) || user.email?.charAt(0) || "U").toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline-block">Sair</span>
              </Button>
            </div>
          ) : (
            <Button onClick={() => navigate('/login')}>
              Entrar
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
