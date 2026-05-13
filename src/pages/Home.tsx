import { useAuth } from "@/src/contexts/AuthContext";
import { auth } from "@/src/lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { LogIn, ArrowRight, Printer, QrCode, Smartphone, Share2, ShieldCheck, Users, Zap, Layout, Clock, Database, Camera, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/dashboard');
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const features = [
    {
      icon: <Camera className="w-10 h-10 text-primary" />,
      title: "Fotografia Profissional",
      description: "Nossa solução é perfeita para fotógrafos. Receba e processe fotos de câmeras profissionais em tempo real."
    },
    {
      icon: <Printer className="w-10 h-10 text-primary" />,
      title: "Impressão de Alta Qualidade",
      description: "Gerencie filas de impressão para fotos profissionais ou capturas mobile, com suporte a diversas impressoras térmicas."
    },
    {
      icon: <QrCode className="w-10 h-10 text-primary" />,
      title: "Captura via QR Code",
      description: "Além das fotos profissionais, permita que convidados enviem suas próprias fotos via link direto ou QR Code."
    },
    {
      icon: <Share2 className="w-10 h-10 text-primary" />,
      title: "WhatsApp & SMS",
      description: "Envio instantâneo de fotos editadas diretamente para o celular do convidado via links curtos e ágeis."
    },
    {
      icon: <ShieldCheck className="w-10 h-10 text-primary" />,
      title: "Moderação em Tempo Real",
      description: "Aprove ou rejeite fotos antes que elas apareçam na galeria pública ou entrem na fila de impressão."
    },
    {
      icon: <Users className="w-10 h-10 text-primary" />,
      title: "Captação de Leads",
      description: "Colete nomes e contatos de quem interage com as fotos, criando uma base valiosa para marketing pós-evento."
    }
  ];

  const stats = [
    { label: "Fotos Processadas", value: "500k+" },
    { label: "Eventos Realizados", value: "2.4k+" },
    { label: "Compartilhamentos", value: "1.2M" },
    { label: "Satisfação", value: "99.8%" }
  ];

  return (
    <div className="flex-1 bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-20 md:pt-40 md:pb-32">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-primary/5 [mask-image:radial-gradient(ellipse_at_center,black_70%,transparent_100%)] -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center rounded-full px-4 py-1 text-sm font-bold bg-primary/10 text-primary mb-6 uppercase tracking-widest ring-1 ring-inset ring-primary/20">
              A revolução da fotolembrança
            </span>
            <h1 className="text-5xl md:text-8xl font-black text-foreground tracking-tighter mb-8 leading-[0.9]">
              memo<span className="text-primary font-light">LAB</span>
            </h1>
            <p className="max-w-3xl mx-auto text-xl md:text-2xl text-muted-foreground leading-relaxed mb-12">
              Transforme seu evento com uma solução de fotolembrança dinâmica, ágil e inteligente. 
              Sem cabines fixas, com total liberdade para capturar e imprimir.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {user ? (
                <Button 
                  size="lg" 
                  className="rounded-2xl h-16 px-10 text-lg font-black tracking-tight gap-3 shadow-2xl"
                  onClick={() => navigate('/dashboard')}
                >
                  Acessar Dashboard <ArrowRight className="w-6 h-6" />
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  className="rounded-2xl h-16 px-10 text-lg font-black tracking-tight gap-3 shadow-2xl"
                  onClick={handleLogin}
                >
                  <LogIn className="w-6 h-6" /> Entrar no Sistema
                </Button>
              )}
              <Button 
                variant="outline" 
                size="lg" 
                className="rounded-2xl h-16 px-10 text-lg font-bold border-2"
                onClick={() => {
                  const el = document.getElementById('features');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Conhecer Recursos
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter">Tudo que você precisa em um só lugar</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Nossa plataforma foi construída pensando em agilidade e escala para fotógrafos e produtores de eventos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -5 }}
                className="p-10 bg-white rounded-[2.5rem] border border-border/60 shadow-sm hover:shadow-xl transition-all"
              >
                <div className="mb-6 p-4 bg-primary/5 w-fit rounded-3xl">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-4">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 border-y border-border/40 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-10">
              <h2 className="text-5xl font-black tracking-tighter leading-[0.95]">
                Diga adeus às cabines fixas e <span className="text-primary">filas intermináveis</span>.
              </h2>
              
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="h-12 w-12 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Velocidade Extrema</h4>
                    <p className="text-muted-foreground italic">Redução de 80% no tempo de entrega das fotos comparado a métodos tradicionais.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="h-12 w-12 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Dados em tempo real</h4>
                    <p className="text-muted-foreground italic">Monitore cada envio e download enquanto o evento acontece.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="h-12 w-12 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Mobile First</h4>
                    <p className="text-muted-foreground italic">Interface otimizada para o convidado usar sem precisar baixar nenhum aplicativo.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-primary aspect-square rounded-[4rem] rotate-3 opacity-10 absolute inset-0 -z-10" />
              <div className="grid grid-cols-2 gap-4 p-4">
                {stats.map((stat, i) => (
                  <div key={i} className="bg-white p-10 rounded-[2.5rem] border border-border shadow-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-4xl font-black tracking-tighter text-primary">{stat.value}</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-2">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter">Preço Transparente</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tudo o que você precisa para seu evento, sem taxas ocultas ou limites abusivos.
            </p>
          </div>
          
          <div className="max-w-md mx-auto">
             <div className="p-12 bg-muted/30 rounded-[3rem] border-2 border-primary/20 text-center relative group hover:border-primary/40 transition-all duration-500">
               <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-white px-6 py-2 rounded-full text-sm font-black tracking-widest uppercase shadow-xl">
                 Uso Ilimitado
               </div>
               <span className="text-muted-foreground font-bold block mb-4 uppercase tracking-widest text-xs">Por Evento</span>
               <div className="flex items-center justify-center gap-1 mb-8">
                 <span className="text-3xl font-bold align-top mt-1">R$</span>
                 <span className="text-7xl font-black tracking-tighter">499</span>
               </div>
               <ul className="space-y-4 mb-10 text-left max-w-[220px] mx-auto">
                 <li className="flex items-center gap-3 font-medium text-muted-foreground">
                   <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                   Fotos Ilimitadas
                 </li>
                 <li className="flex items-center gap-3 font-medium text-muted-foreground">
                   <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                   Captura via QR Code
                 </li>
                 <li className="flex items-center gap-3 font-medium text-muted-foreground">
                   <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                   Impressão Ilimitada
                 </li>
                 <li className="flex items-center gap-3 font-medium text-muted-foreground">
                   <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                   Suporte Prioritário
                 </li>
               </ul>
               <Button 
                className="w-full h-16 rounded-2xl font-black text-lg tracking-tight shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                onClick={() => window.open('https://wa.me/5541996760099', '_blank')}
               >
                 Entre em contato
               </Button>
             </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-primary p-12 md:p-20 rounded-[3rem] text-center text-primary-foreground shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full -ml-32 -mb-32 blur-3xl" />
            
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-none">Pronto para elevar o nível do seu próximo evento?</h2>
            <p className="text-xl md:text-2xl text-primary-foreground/80 mb-12 max-w-2xl mx-auto">
              Junte-se a centenas de fotógrafos que já estão lucrando mais com o memo.LAB.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {!user && (
                <Button 
                  onClick={handleLogin}
                  size="lg" 
                  variant="secondary" 
                  className="rounded-2xl h-16 px-12 text-lg font-black tracking-tight gap-3 hover:scale-105 transition-transform"
                >
                  Começar Agora <ArrowRight className="w-6 h-6" />
                </Button>
              )}
              <Button 
                onClick={() => window.open('https://wa.me/5541996760099', '_blank')}
                size="lg" 
                variant="outline" 
                className="rounded-2xl h-16 px-12 text-lg font-black tracking-tight gap-3 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              >
                Entre em contato
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded-md">
              <Clock className="h-4 w-4" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">memo<span className="font-light text-primary">.LAB</span></span>
          </div>
          <p className="text-muted-foreground text-sm">© 2026 memo.LAB. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <a href="#" className="text-sm font-medium hover:text-primary">Termos</a>
            <a href="#" className="text-sm font-medium hover:text-primary">Privacidade</a>
            <a href="#" className="text-sm font-medium hover:text-primary">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
