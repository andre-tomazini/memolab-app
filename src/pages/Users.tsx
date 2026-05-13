import React, { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { db } from "@/src/lib/firebase";
import { collection, query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Loader2, ShieldAlert, Plus, Mail, IdCard } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AppUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: number;
}

export default function Users() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as AppUser[];
      
      docs.sort((a, b) => b.createdAt - a.createdAt);
      setUsers(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newName || !newEmail) return;

    setSubmitting(true);
    try {
      // In a real app, this would be a cloud function that creates the Firebase Auth user,
      // or we'd create the user via secondary app. Here we just create the document for
      // demonstrating the concept.
      const userId = "ext_" + Date.now();
      await setDoc(doc(db, "users", userId), {
        email: newEmail.trim().toLowerCase(),
        name: newName.trim(),
        role: "user",
        createdAt: Date.now()
      });
      
      setNewName("");
      setNewEmail("");
      alert("Usuário adicionado com sucesso! (Atenção: Apenas o registro do Firestore foi salvo. Para habilitar o login via Google para esta conta, o usuário apenas precisará logar com este e-mail.)");
    } catch (error) {
      console.error("Erro ao criar usuário", error);
      alert("Erro ao salvar o usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center space-y-4 p-6">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
        <p className="text-muted-foreground text-center">Você não tem permissão de administrador para visualizar esta página.</p>
        <Button onClick={() => navigate('/')}>Voltar para o Início</Button>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center p-6 bg-background h-full">
      <div className="w-full max-w-4xl space-y-8 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <IdCard className="w-6 h-6 text-muted-foreground" />
            Controle de Usuários Master
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie quem tem acesso à plataforma de eventos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Adicionar Conta</CardTitle>
              <CardDescription>Crie uma nova conta de usuário para utilizar a plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">Nome</label>
                  <Input 
                    placeholder="João da Silva" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">E-mail</label>
                  <Input 
                    type="email"
                    placeholder="joao@exemplo.com" 
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting || !newName || !newEmail}>
                  {submitting ? "Adicionando..." : "Adicionar Usuário"}
                  {!submitting && <Plus className="w-4 h-4 ml-2" />}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Usuários Adicionados ({users.length})</CardTitle>
              <CardDescription>Lista de contas na plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="text-center p-8 bg-background rounded-lg border border-border/50">
                  <p className="text-muted-foreground">Nenhum usuário foi criado ainda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => (
                    <div key={u.id} className="flex justify-between items-center p-4 bg-white border border-border rounded-lg">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{u.name}</span>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">{u.role}</span>
                        <span className="text-xs text-muted-foreground/80 mt-1">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
