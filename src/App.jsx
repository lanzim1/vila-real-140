import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import emailjs from "@emailjs/browser";
import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc,
  getDocs, query, where, writeBatch, getDoc
} from "firebase/firestore";
// ── EmailJS ──
const EJS_PUBLIC   = "miqPVueWYbnAe6ijd";
const EJS_SERVICE  = "service_h0a4utj";
const EJS_TEMPLATE = "template_yzl1x2m";
const EJS_TEMPLATE_CONFIRMACAO = "template_d8f6dzq";
emailjs.init(EJS_PUBLIC);

const MOCK_MORADORES = [
  { nome: "Carlos Mendes",  unidade: "Apto 101", email: "carlos@email.com",   telefone: "(85) 99123-0001" },
  { nome: "Fernanda Lima",  unidade: "Apto 102", email: "fernanda@email.com", telefone: "(85) 99123-0002" },
  { nome: "Roberto Alves",  unidade: "Apto 201", email: "roberto@email.com",  telefone: "(85) 99123-0003" },
  { nome: "Juliana Costa",  unidade: "Apto 202", email: "juliana@email.com",  telefone: "(85) 99123-0004" },
  { nome: "Marcos Souza",   unidade: "Apto 301", email: "marcos@email.com",   telefone: "(85) 99123-0005" },
  { nome: "Patrícia Nunes", unidade: "Apto 302", email: "patricia@email.com", telefone: "(85) 99123-0006" },
];

const VISITANTE_EMAIL = "visitante@vilareal140-ddf4d.firebaseapp.com";
const VISITANTE_SENHA = "VisualizarVR140";

// ── Admin do MySindi (dono do negócio) ──
const ADMIN_EMAIL = "comercial.mysindi@gmail.com";
const modoAdmin = typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("admin") === "1";

// ── Multi-tenant ──
// Cada condomínio é identificado por um condominioId. Coleções "globais"
// como condominios/usuarios não levam o filtro; as demais sempre filtram.
const PLANOS = {
  cortesia:  { nome:"Cortesia",  limite: 9999, preco: 0,   precoAnual: 0,    cor:"#6B7A9E" },
  basico:    { nome:"Básico",    limite: 20,   preco: 79,  precoAnual: 790,  cor:"#22A26B" },
  padrao:    { nome:"Padrão",    limite: 50,   preco: 149, precoAnual: 1490, cor:"#4B72C4" },
  avancado:  { nome:"Avançado",  limite: 100,  preco: 249, precoAnual: 2490, cor:"#1E3A72" },
};

// Hierarquia de planos (nível de acesso). Cortesia tem acesso total (uso interno).
const NIVEL_PLANO = { basico: 1, padrao: 2, avancado: 3, cortesia: 99 };

// Plano mínimo exigido por cada recurso/aba.
const RECURSO_PLANO = {
  // Básico (essencial)
  dashboard:  "basico",
  moradores:  "basico",
  cobrancas:  "basico",
  despesas:   "basico",
  config:     "basico",
  // Padrão (gestão completa)
  servicos:   "padrao",
  reservas:   "padrao",
  acessos:    "padrao",
  historico:  "padrao",
  emailAuto:  "padrao",
  dashAnual:  "padrao",
  prestacao:  "padrao",
  multaJuros: "padrao",
  cobrancaExtra: "padrao",
  fluxoCaixa: "padrao",
  ocorrencias: "avancado",
  enquetes: "avancado",
  // Avançado (premium — a construir)
  comunicados:"avancado",
  entregas:   "avancado",
  fundoReserva:"avancado",
  documentos: "avancado",
  agenda:     "avancado",
};

// Verifica se um plano tem acesso a um recurso
const temAcesso = (plano, recurso) => {
  const nivelPlano = NIVEL_PLANO[plano] ?? 0;
  const recursoMin = RECURSO_PLANO[recurso] || "basico";
  const nivelRecurso = NIVEL_PLANO[recursoMin] ?? 1;
  return nivelPlano >= nivelRecurso;
};

const modoVisitante = typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("visualizar") === "1";

const portalMoradorId = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("morador")
  : null;

// condomínio passado no link do morador/visitante (ex: ?cond=vilareal140&morador=ID)
const condParam = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("cond")
  : null;

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const mesLabel = (m) => {
  const [y, mo] = m.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(mo) - 1]}/${y}`;
};

// ── Hook de detecção de mobile ──
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

// ── Design System — baseado em Residencial Aurora (condo-care-reborn) ──
// OKLCH convertido para HEX; Space Grotesk + DM Sans
const D = {
  // Backgrounds
  bgApp:       "#FAFAFA",   // fundo neutro e clean
  bgCard:      "#FFFFFF",   // cards

  // Text
  text:        "#0F172A",   // texto principal (slate-900)
  textSec:     "#64748B",   // texto secundário (slate-500)
  textMut:     "#94A3B8",   // texto mais suave (slate-400)

  // Brand
  primary:     "#1A2E40",   // navy — botões primários, títulos
  primaryFg:   "#F8FAFC",   // texto sobre o primary
  accent:      "#1A2E40",   // ativo, gráficos, links (mesmo navy do design)
  secondary:   "#F1F5F9",   // fundo claro para selos/tints (slate-100)
  muted:       "#F8FAFC",   // fundo claro (slate-50)

  // Semantic
  success:     "#10B981",   // verde (emerald-500)
  successBg:   "#ECFDF5",   // emerald-50
  warning:     "#D97706",   // âmbar (amber-600)
  warningBg:   "#FFFBEB",   // amber-50
  danger:      "#DC2626",   // vermelho (red-600)
  dangerBg:    "#FEF2F2",   // red-50

  // UI
  border:      "#E2E8F0",   // slate-200
  ring:        "#1A2E40",

  // Sidebar (retonalizada para o novo navy, mantendo estrutura escura)
  sidebar:     "#1A2E40",   // navy do design
  sidebarHov:  "#24384D",   // navy um pouco mais claro
  sidebarAct:  "rgba(148,163,184,0.18)",
  sidebarActBdr:"#CBD5E1",  // indicador de ativo (slate-300)
  sidebarFg:   "#E2E8F0",   // texto claro na sidebar
  sidebarBdr:  "#2A3A4A",   // borda da sidebar

  // Deprecated (mantidos para compatibilidade de código legado)
  gold:        "#D97706",
  primaryDk:   "#12212E",

  // Shadows (neutras, mais suaves — estilo do design novo)
  shadow:    "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.06)",
  shadowMd:  "0 4px 6px -1px rgba(15,23,42,.1), 0 2px 4px -1px rgba(15,23,42,.06)",

  // Radius (--radius: 0.75rem = 12px)
  radius:    12,
  radiusSm:  8,
  radiusXl:  16,

  // Fontes
  fontDisplay: "'Space Grotesk', sans-serif",
  fontBody:    "'DM Sans', sans-serif",
};

// ── Toast ──
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const bg = type === "error" ? D.danger : D.primary;
  return (
    <div style={{ position:"fixed", bottom:88, right:16, left:16, background:bg, color:"#fff", padding:"14px 18px", borderRadius:12, fontSize:14, zIndex:9999, boxShadow:D.shadowMd, display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ width:22, height:22, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:700 }}>{type==="error"?"✕":"✓"}</span>
      <span style={{ flex:1, lineHeight:1.5 }}>{msg}</span>
      <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", cursor:"pointer", fontSize:16, borderRadius:6, width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
    </div>
  );
};

// ── Modal ──
const Modal = ({ title, onClose, children, isMobile }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:1000, display:"flex", alignItems: isMobile?"flex-end":"center", justifyContent:"center" }}>
    <div style={{ background:"#fff", borderRadius: isMobile?"20px 20px 0 0":D.radius, width:"100%", maxWidth: isMobile?"100%":520, maxHeight: isMobile?"92vh":"90vh", overflow:"auto", boxShadow:D.shadowMd }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px 16px", borderBottom:`1px solid ${D.border}`, position:"sticky", top:0, background:"#fff", zIndex:1 }}>
        <span style={{ fontSize:16, color:D.text, fontWeight:700, letterSpacing:"-.3px" }}>{title}</span>
        <button onClick={onClose} style={{ background:"#F1F5F9", border:"none", cursor:"pointer", color:D.textSec, width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>×</button>
      </div>
      <div style={{ padding:"20px 24px 28px" }}>{children}</div>
    </div>
  </div>
);

// ── Badge ──
const Badge = ({ status }) => {
  const map = {
    pago:     { label:"Pago",     bg:"#DCFCE7", color:"#166534", dot:"#22C55E" },
    pendente: { label:"Pendente", bg:"#FEF9C3", color:"#854D0E", dot:"#EAB308" },
    atrasado: { label:"Atrasado", bg:"#FEE2E2", color:"#991B1B", dot:"#EF4444" },
  };
  const s = map[status] || map.pendente;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:12, fontWeight:600, background:s.bg, color:s.color }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
};


// ── Tela de upgrade (recurso bloqueado pelo plano) ──
const UpgradeCard = ({ recurso, planoNecessario, isMobile }) => {
  const p = PLANOS[planoNecessario] || {};
  const descricoes = {
    servicos:    "Registre e acompanhe manutenções, com controle de custos de material e mão de obra.",
    reservas:    "Permita que moradores reservem churrasqueira, salão de festas e outras áreas comuns, com aprovação do síndico.",
    acessos:     "Controle a entrada e saída de visitantes e prestadores de serviço.",
    historico:   "Acompanhe todo o histórico de ações do condomínio para total transparência.",
    comunicados: "Publique avisos e comunicados para todos os moradores de uma vez.",
    entregas:    "Registre encomendas e notifique os moradores automaticamente.",
    fundoReserva:"Separe automaticamente uma parte da arrecadação para o fundo de reserva.",
    documentos:  "Guarde documentos importantes com alerta de vencimento (alvará, seguro, etc.).",
    agenda:      "Organize eventos, manutenções e assembleias em um calendário do condomínio.",
    multaJuros:  "Cobre automaticamente multa e juros sobre cobranças em atraso.",
    cobrancaExtra:"Crie cobranças extras e rateios além da taxa mensal (obras, contas, fundos).",
    fluxoCaixa:  "Acompanhe o saldo real do condomínio mês a mês, com entradas e saídas.",
    ocorrencias: "Receba e acompanhe reclamações e solicitações dos moradores pelo portal.",
    enquetes:    "Crie votações e enquetes para os moradores decidirem pelo portal.",
  };
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding: isMobile?"20px":"40px" }}>
      <div style={{ background:D.bgCard, borderRadius:D.radiusXl, border:`1px solid ${D.border}`, boxShadow:D.shadow, padding: isMobile?"32px 24px":"48px 40px", maxWidth:460, textAlign:"center" }}>
        <div style={{ width:64, height:64, borderRadius:16, background:D.secondary, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:30 }}>🔒</div>
        <div style={{ display:"inline-block", background: p.cor||D.accent, color:"#fff", fontSize:12, fontWeight:700, padding:"4px 14px", borderRadius:20, marginBottom:16, fontFamily:D.fontBody }}>
          Plano {p.nome}
        </div>
        <h2 style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.text, margin:"0 0 12px", letterSpacing:"-0.02em" }}>
          Recurso disponível no plano {p.nome}
        </h2>
        <p style={{ fontFamily:D.fontBody, fontSize:14, color:D.textSec, lineHeight:1.6, margin:"0 0 24px" }}>
          {descricoes[recurso] || "Este recurso está disponível em um plano superior."}
        </p>
        <div style={{ background:D.muted, borderRadius:D.radius, padding:"16px 20px", marginBottom:24 }}>
          <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginBottom:4 }}>Faça upgrade por</div>
          <div style={{ fontFamily:D.fontDisplay, fontSize:28, fontWeight:700, color:D.text, letterSpacing:"-0.02em" }}>
            R$ {p.preco}<span style={{ fontSize:15, color:D.textSec, fontWeight:400 }}>/mês</span>
          </div>
        </div>
        <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ display:"inline-block", padding:"13px 32px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:15, fontWeight:700, textDecoration:"none", fontFamily:D.fontBody, boxShadow:`0 4px 16px rgba(30,58,114,0.3)` }}>
          Fazer upgrade →
        </a>
        <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, margin:"16px 0 0" }}>
          Fale conosco: comercial.mysindi@gmail.com · (85) 99653-2638
        </p>
      </div>
    </div>
  );
};

// ── Top Bar ──
const TopBar = ({ title, user, readOnly, nPendentes, moradores, onBuscar, onConfig, onPlano }) => {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const prefixo = user?.email ? user.email.split("@")[0] : "Usuário";
  const nome = prefixo.charAt(0).toUpperCase() + prefixo.slice(1);
  const papel = readOnly ? "Visitante" : "Síndico";
  const inicial = nome.charAt(0).toUpperCase();

  const termo = q.trim().toLowerCase();
  const resultados = termo && moradores ? moradores.filter(m =>
    (m.nome||"").toLowerCase().includes(termo) || (m.unidade||"").toLowerCase().includes(termo)
  ).slice(0,6) : [];

  const selecionar = (m) => { setQ(""); onBuscar && onBuscar(m); };

  return (
    <div style={{ background:D.bgCard, borderBottom:`1px solid ${D.border}`, padding: isMobile?"12px 16px":"14px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, gap:12 }}>
      <div style={{ minWidth:0 }}>
        <h1 style={{ fontFamily:D.fontDisplay, fontSize: isMobile?17:20, fontWeight:600, color:D.text, margin:0, letterSpacing:"-0.02em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{title}</h1>
        {!isMobile && <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, margin:"2px 0 0", textTransform:"capitalize" }}>{hoje}</p>}
      </div>

      <div style={{ display:"flex", alignItems:"center", gap: isMobile?12:18, flexShrink:0 }}>
        {/* Busca de moradores (desktop) */}
        {!isMobile && onBuscar && (
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:D.muted, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, padding:"8px 12px", width:230 }}>
              <span style={{ fontSize:14, opacity:.6 }}>🔍</span>
              <input
                value={q}
                onChange={e=>setQ(e.target.value)}
                placeholder="Buscar morador ou unidade..."
                style={{ border:"none", background:"transparent", outline:"none", fontFamily:D.fontBody, fontSize:13, color:D.text, width:"100%" }}
              />
            </div>
            {termo && (
              <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, right:0, background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, boxShadow:D.shadowMd, overflow:"hidden", zIndex:50 }}>
                {resultados.length === 0 ? (
                  <div style={{ padding:"12px 14px", fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhum morador encontrado.</div>
                ) : resultados.map(m => (
                  <button key={m.id} onMouseDown={()=>selecionar(m)} style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", width:"100%", padding:"10px 14px", background:"transparent", border:"none", borderBottom:`1px solid ${D.border}`, cursor:"pointer", textAlign:"left" }}>
                    <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{m.unidade}</span>
                    <span style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.nome}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sino de notificações */}
        <div style={{ position:"relative", display:"flex", alignItems:"center" }} title={`${nPendentes||0} cobrança(s) pendente(s)`}>
          <span style={{ fontSize:19, opacity:.8 }}>🔔</span>
          {nPendentes > 0 && (
            <span style={{ position:"absolute", top:-6, right:-8, background:D.danger, color:"#fff", fontFamily:D.fontBody, fontSize:10, fontWeight:700, minWidth:16, height:16, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", border:`2px solid ${D.bgCard}` }}>{nPendentes > 99 ? "99+" : nPendentes}</span>
          )}
        </div>

        {/* Perfil + menu */}
        <div style={{ position:"relative" }}>
          <button onClick={()=>setMenuAberto(v=>!v)} style={{ display:"flex", alignItems:"center", gap:10, background:"none", border:"none", cursor:"pointer", padding:"4px 6px 4px 4px", borderRadius:D.radiusSm, fontFamily:D.fontBody }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:D.primary, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, flexShrink:0 }}>{inicial}</div>
            {!isMobile && (
              <div style={{ lineHeight:1.25, textAlign:"left" }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, maxWidth:140, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{nome}</div>
                <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec }}>{papel}</div>
              </div>
            )}
            {!isMobile && <span style={{ fontSize:10, color:D.textMut, transform: menuAberto?"rotate(180deg)":"none", transition:"transform .15s" }}>▼</span>}
          </button>

          {menuAberto && (
            <>
              {/* overlay para fechar ao clicar fora */}
              <div onClick={()=>setMenuAberto(false)} style={{ position:"fixed", inset:0, zIndex:200 }} />
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:250, background:D.bgCard, borderRadius:D.radius, border:`1px solid ${D.border}`, boxShadow:D.shadowMd, zIndex:201, overflow:"hidden" }}>
                {/* Cabeçalho do menu */}
                <div style={{ padding:"14px 16px", borderBottom:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:11 }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", background:D.primary, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, flexShrink:0 }}>{inicial}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{papel}</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{user?.email}</div>
                  </div>
                </div>

                {/* Opções */}
                <div style={{ padding:6 }}>
                  {!readOnly && onPlano && (
                    <button onClick={()=>{ setMenuAberto(false); onPlano(); }} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 12px", background:"none", border:"none", borderRadius:D.radiusSm, cursor:"pointer", fontFamily:D.fontBody, fontSize:14, color:D.text, textAlign:"left" }}>
                      <span style={{ fontSize:16 }}>💳</span> Meu plano
                    </button>
                  )}
                  {!readOnly && onConfig && (
                    <button onClick={()=>{ setMenuAberto(false); onConfig(); }} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 12px", background:"none", border:"none", borderRadius:D.radiusSm, cursor:"pointer", fontFamily:D.fontBody, fontSize:14, color:D.text, textAlign:"left" }}>
                      <span style={{ fontSize:16 }}>⚙️</span> Configurações
                    </button>
                  )}
                  <a href="https://wa.me/5585996532638" target="_blank" rel="noopener noreferrer" onClick={()=>setMenuAberto(false)} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 12px", background:"none", border:"none", borderRadius:D.radiusSm, cursor:"pointer", fontFamily:D.fontBody, fontSize:14, color:D.text, textAlign:"left", textDecoration:"none", boxSizing:"border-box" }}>
                    <span style={{ fontSize:16 }}>💬</span> Ajuda / Suporte
                  </a>
                  <div style={{ height:1, background:D.border, margin:"6px 8px" }} />
                  <button onClick={async ()=>{ setMenuAberto(false); await signOut(auth); if (readOnly) window.location.href = window.location.origin + window.location.pathname; }} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 12px", background:"none", border:"none", borderRadius:D.radiusSm, cursor:"pointer", fontFamily:D.fontBody, fontSize:14, color:D.danger, textAlign:"left" }}>
                    <span style={{ fontSize:16 }}>🚪</span> Sair
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Area Chart Animado ──
const AreaChart = ({ dadosMes, mesesLabel }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    let p = 0;
    const id = setInterval(() => {
      p += 0.035;
      if (p >= 1) { clearInterval(id); p = 1; }
      setProgress(p);
    }, 16);
    return () => clearInterval(id);
  }, [dadosMes.length]);

  const W = 600, H = 200;
  const PAD = { top:20, right:20, bottom:36, left:10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...dadosMes.map(d => Math.max(d.entrada, d.saida)), 1);
  const toX = (i) => PAD.left + (i / Math.max(dadosMes.length-1,1)) * cW;
  const toY = (v) => PAD.top + cH - (v / maxVal) * cH;

  const smoothPath = (pts) => {
    if (!pts.length) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i-1].x + pts[i].x) / 2;
      d += ` C ${cpx} ${pts[i-1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  };

  const ptsR = dadosMes.map((d,i) => ({ x:toX(i), y:toY(d.entrada) }));
  const ptsD = dadosMes.map((d,i) => ({ x:toX(i), y:toY(d.saida) }));
  const bottom = `L ${toX(dadosMes.length-1)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`;
  const clipW = cW * progress;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", display:"block" }}>
      <defs>
        <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={D.accent} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={D.accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0"/>
        </linearGradient>
        <clipPath id="anim">
          <rect x={PAD.left} y={0} width={clipW} height={H} />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t,i) => (
        <line key={i} x1={PAD.left} y1={PAD.top + cH*(1-t)} x2={PAD.left+cW} y2={PAD.top + cH*(1-t)} stroke={D.border} strokeWidth="1"/>
      ))}
      <g clipPath="url(#anim)">
        <path d={smoothPath(ptsR)+bottom} fill="url(#gR)" />
        <path d={smoothPath(ptsD)+bottom} fill="url(#gD)" />
        <path d={smoothPath(ptsR)} fill="none" stroke={D.accent} strokeWidth="2.5" strokeLinecap="round"/>
        <path d={smoothPath(ptsD)} fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
      </g>
      {dadosMes.map((d,i) => (
        <text key={i} x={toX(i)} y={H-8} textAnchor="middle" style={{ fontFamily:D.fontBody, fontSize:11, fill:D.textSec }}>{mesesLabel[i]}</text>
      ))}
    </svg>
  );
};

// ── Determina o plano pela faixa de tamanho ──
const planoPorTamanho = (numApt) => {
  const n = parseInt(numApt) || 0;
  if (n <= 20) return "basico";
  if (n <= 50) return "padrao";
  return "avancado";
};

// ── Gera um id de condomínio a partir do nome ──
const gerarCondId = (nome) => {
  const base = nome.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  return `${base}${Date.now().toString().slice(-5)}`;
};

// ── Login / Cadastro ──
const Login = ({ modoInicial = "login", onVoltar }) => {
  const [modo, setModo]   = useState(modoInicial); // "login" | "cadastro"
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [verPass, setVerPass] = useState(false);
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  // Campos do cadastro
  const [nomeSindico, setNomeSindico] = useState("");
  const [nomeCond, setNomeCond]       = useState("");
  const [numApt, setNumApt]           = useState("");

  // Contagem de falhas — cortesia de UX (a proteção real contra força bruta é do Firebase)
  const [falhas, setFalhas] = useState(0);
  const [esperarAte, setEsperarAte] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!esperarAte) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [esperarAte]);
  const segsRestantes = esperarAte > agora ? Math.ceil((esperarAte - agora) / 1000) : 0;

  // Traduz o código de erro do Firebase para uma mensagem clara
  const msgErroAuth = (e) => {
    switch (e?.code) {
      case "auth/too-many-requests":
        return "Muitas tentativas. Por segurança, o Firebase bloqueou este acesso temporariamente. Aguarde alguns minutos ou redefina sua senha.";
      case "auth/invalid-email":            return "E-mail inválido.";
      case "auth/weak-password":            return "Senha muito fraca (mínimo 6 caracteres).";
      case "auth/user-disabled":            return "Esta conta foi desativada. Fale com o suporte.";
      case "auth/network-request-failed":   return "Sem conexão. Verifique sua internet.";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":           return "E-mail ou senha incorretos.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":  return "";
      case "auth/popup-blocked":            return "O navegador bloqueou a janela do Google. Libere os pop-ups e tente de novo.";
      case "auth/account-exists-with-different-credential":
        return "Este e-mail já tem conta com senha. Entre com e-mail e senha.";
      case "auth/unauthorized-domain":
        return "Este domínio não está autorizado no Firebase (Authentication → Settings → Authorized domains).";
      case "auth/operation-not-allowed":
        return "Login com Google não está habilitado no Firebase.";
      default: return "Não foi possível entrar. Tente novamente.";
    }
  };

  const handleLogin = async () => {
    setErr("");
    if (segsRestantes > 0) return;
    if (!email || !pass) { setErr("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      setFalhas(0); setEsperarAte(0);
    } catch (e) {
      const n = falhas + 1;
      setFalhas(n);
      if (e?.code === "auth/too-many-requests") setErr(msgErroAuth(e));
      else if (n >= 5) { setEsperarAte(Date.now() + 30000); setErr("5 tentativas sem sucesso. Aguarde 30 segundos antes de tentar novamente."); }
      else setErr(msgErroAuth(e) + (n >= 3 ? ` (${n}ª tentativa)` : ""));
    } finally { setLoading(false); }
  };

  // ── Entrar com Google ──
  const handleGoogleLogin = async () => {
    setErr("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const u = await getDoc(doc(db, "usuarios", cred.user.uid));
      if (!u.exists()) {
        // Conta Google sem condomínio vinculado — não deixa o app em estado quebrado
        await signOut(auth);
        setErr('Nenhuma conta MySindi vinculada a este Google. Se você já é cliente, entre com e-mail e senha. Para começar, use "Criar conta".');
      }
      // Se existe, o onAuthStateChanged assume daqui
    } catch (e) {
      const m = msgErroAuth(e);
      if (m) setErr(m);
    } finally { setLoading(false); }
  };

  // ── Criar conta com Google (precisa dos dados do condomínio antes) ──
  const handleGoogleCadastro = async () => {
    setErr("");
    if (!nomeCond || !numApt) { setErr("Preencha o nome do condomínio e a quantidade de apartamentos antes de continuar com o Google."); return; }
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const uid = cred.user.uid;
      const emailG = cred.user.email || "";
      const nomeG = nomeSindico.trim() || cred.user.displayName || emailG.split("@")[0];
      const jaExiste = await getDoc(doc(db, "usuarios", uid));
      if (jaExiste.exists()) return; // já é cliente → entra normalmente

      const condId = gerarCondId(nomeCond);
      const plano = planoPorTamanho(numApt);
      // 1º o condomínio (a regra do vínculo exige que ele já exista e seja seu)
      await setDoc(doc(db, "condominios", condId), {
        nome: nomeCond.trim(), plano, numApartamentos: parseInt(numApt) || 0,
        taxa: 180, diaVencimento: 10,
        sindicoEmail: emailG, sindicoNome: nomeG, sindicoUid: uid,
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        ativo: true,
        trialAte: new Date(Date.now() + 14*24*60*60*1000).toLocaleDateString("pt-BR"),
        statusAssinatura: "trial", cicloCobranca: "mensal",
      });
      // 2º o vínculo usuário → condomínio
      await setDoc(doc(db, "usuarios", uid), {
        email: emailG, nome: nomeG, condominioId: condId, papel: "sindico",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
      });
    } catch (e) {
      const m = msgErroAuth(e);
      if (m) setErr(m);
      setLoading(false);
    }
  };

  const handleCadastro = async () => {
    setErr("");
    if (!nomeSindico || !email || !pass || !nomeCond || !numApt) {
      setErr("Preencha todos os campos."); return;
    }
    if (pass.length < 6) { setErr("A senha deve ter no mínimo 6 caracteres."); return; }
    setLoading(true);
    try {
      // 1. Cria a conta (faz login automático)
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const uid = cred.user.uid;
      const condId = gerarCondId(nomeCond);
      const plano = planoPorTamanho(numApt);

      // 2. Cria o condomínio PRIMEIRO (a regra do vínculo exige que ele já exista
      //    e tenha sindicoUid == você — impede alguém se vincular a condomínio alheio)
      await setDoc(doc(db, "condominios", condId), {
        nome: nomeCond.trim(),
        plano,
        numApartamentos: parseInt(numApt) || 0,
        taxa: 180,
        diaVencimento: 10,
        sindicoEmail: email.trim(),
        sindicoNome: nomeSindico.trim(),
        sindicoUid: uid,
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        ativo: true,
        trialAte: new Date(Date.now() + 14*24*60*60*1000).toLocaleDateString("pt-BR"),
        statusAssinatura: "trial",
        cicloCobranca: "mensal",
      });

      // 3. Vincula usuário → condomínio (o app relê com re-tentativa ao carregar)
      await setDoc(doc(db, "usuarios", uid), {
        email: email.trim(),
        nome: nomeSindico.trim(),
        condominioId: condId,
        papel: "sindico",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
      });
      // O onAuthStateChanged já vai detectar o login e carregar o condomínio
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setErr("Este e-mail já está cadastrado. Faça login.");
      else setErr(msgErroAuth(e));
      setLoading(false);
    }
  };

  const inputStyle = { width:"100%", padding:"12px 14px", border:`1.5px solid ${D.border}`, borderRadius:10, fontSize:15, color:D.text, outline:"none", boxSizing:"border-box", transition:"border .2s", fontFamily:D.fontBody };
  const labelStyle = { display:"block", fontSize:11, fontWeight:700, color:D.textSec, marginBottom:7, textTransform:"uppercase", letterSpacing:1 };

  return (
    <div style={{ minHeight:"100vh", background:D.sidebar, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontBody, padding:16, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(circle at 20% 20%, rgba(75,114,196,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(75,114,196,0.12) 0%, transparent 50%)`, pointerEvents:"none" }} />
      <div style={{ background:"#fff", borderRadius:20, padding:"40px 36px", width:"100%", maxWidth:430, boxShadow:"0 32px 80px rgba(0,0,0,0.4)", position:"relative", maxHeight:"94vh", overflowY:"auto" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:`linear-gradient(135deg, ${D.sidebarHov}, ${D.primaryDk})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:`0 8px 24px rgba(30,58,114,0.35)` }}>
            <span style={{ color:"#fff", fontFamily:D.fontDisplay, fontSize:20, fontWeight:700 }}>🏢</span>
          </div>
          <h1 style={{ fontFamily:D.fontDisplay, fontSize:23, color:D.text, margin:0, fontWeight:700, letterSpacing:"-0.02em" }}>
            {modo === "login" ? "Bem-vindo de volta" : "Criar conta grátis"}
          </h1>
          <p style={{ color:D.textSec, fontSize:13, margin:"6px 0 0" }}>
            {modo === "login" ? "Acesse o painel de gestão do seu condomínio" : "14 dias grátis · sem cartão de crédito"}
          </p>
        </div>

        {modo === "cadastro" && (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Seu nome</label>
              <input value={nomeSindico} onChange={e=>setNomeSindico(e.target.value)} placeholder="Ex: João Silva" style={inputStyle} onFocus={e=>e.target.style.borderColor=D.accent} onBlur={e=>e.target.style.borderColor=D.border} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Nome do condomínio</label>
              <input value={nomeCond} onChange={e=>setNomeCond(e.target.value)} placeholder="Ex: Residencial das Flores" style={inputStyle} onFocus={e=>e.target.style.borderColor=D.accent} onBlur={e=>e.target.style.borderColor=D.border} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Número de apartamentos</label>
              <input type="number" value={numApt} onChange={e=>setNumApt(e.target.value)} placeholder="Ex: 24" style={inputStyle} onFocus={e=>e.target.style.borderColor=D.accent} onBlur={e=>e.target.style.borderColor=D.border} />
              {numApt && (
                <p style={{ fontSize:11, color:D.accent, margin:"6px 0 0", fontWeight:600 }}>
                  Plano sugerido: {PLANOS[planoPorTamanho(numApt)].nome} (R$ {PLANOS[planoPorTamanho(numApt)].preco}/mês após o teste)
                </p>
              )}
            </div>
          </>
        )}

        <div style={{ marginBottom:14 }}>
          <label style={labelStyle}>E-mail</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(modo==="login"?handleLogin():handleCadastro())} placeholder="seu@email.com" style={inputStyle} onFocus={e=>e.target.style.borderColor=D.accent} onBlur={e=>e.target.style.borderColor=D.border} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Senha</label>
          <div style={{ position:"relative" }}>
            <input type={verPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(modo==="login"?handleLogin():handleCadastro())} placeholder={modo==="cadastro"?"Mínimo 6 caracteres":"••••••••"} style={{ ...inputStyle, paddingRight:44 }} onFocus={e=>e.target.style.borderColor=D.accent} onBlur={e=>e.target.style.borderColor=D.border} />
            <button type="button" onClick={()=>setVerPass(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:17, padding:4, lineHeight:1, color:D.textMut }}>
              {verPass?"🙈":"👁️"}
            </button>
          </div>
        </div>

        {err && <div style={{ background:D.dangerBg, color:"#991B1B", fontSize:13, padding:"10px 14px", borderRadius:8, marginBottom:16, textAlign:"center" }}>{err}</div>}

        <button onClick={modo==="login"?handleLogin:handleCadastro} disabled={loading || segsRestantes>0} style={{ width:"100%", padding:"14px", background: segsRestantes>0 ? D.textMut : `linear-gradient(135deg, ${D.sidebarHov}, ${D.primaryDk})`, color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor: (loading||segsRestantes>0)?"default":"pointer", opacity: loading?.75:1, letterSpacing:".3px", boxShadow: segsRestantes>0?"none":`0 4px 16px rgba(30,58,114,0.35)`, fontFamily:D.fontBody }}>
          {segsRestantes > 0 ? `Aguarde ${segsRestantes}s...` : loading ? (modo==="login"?"Verificando...":"Criando conta...") : (modo==="login"?"Entrar":"Criar conta grátis")}
        </button>

        {/* Separador */}
        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"18px 0" }}>
          <div style={{ flex:1, height:1, background:D.border }} />
          <span style={{ fontSize:12, color:D.textMut, fontFamily:D.fontBody }}>ou</span>
          <div style={{ flex:1, height:1, background:D.border }} />
        </div>

        {/* Google */}
        <button onClick={modo==="login"?handleGoogleLogin:handleGoogleCadastro} disabled={loading} style={{ width:"100%", padding:"13px", background:"#fff", color:"#3C4043", border:`1.5px solid ${D.border}`, borderRadius:10, fontSize:14.5, fontWeight:600, cursor: loading?"default":"pointer", opacity: loading?.75:1, fontFamily:D.fontBody, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink:0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {modo==="login" ? "Entrar com Google" : "Criar conta com Google"}
        </button>
        {modo==="cadastro" && (
          <p style={{ fontSize:11.5, color:D.textMut, textAlign:"center", margin:"8px 0 0", fontFamily:D.fontBody }}>
            Preencha o condomínio e a quantidade de apartamentos antes de usar o Google.
          </p>
        )}

        <div style={{ textAlign:"center", marginTop:20, paddingTop:20, borderTop:`1px solid ${D.border}` }}>
          {modo === "login" ? (
            <p style={{ fontSize:13, color:D.textSec, margin:0 }}>
              Ainda não tem conta?{" "}
              <button onClick={() => { setModo("cadastro"); setErr(""); }} style={{ background:"none", border:"none", color:D.accent, fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:D.fontBody }}>Criar conta grátis</button>
            </p>
          ) : (
            <p style={{ fontSize:13, color:D.textSec, margin:0 }}>
              Já tem conta?{" "}
              <button onClick={() => { setModo("login"); setErr(""); }} style={{ background:"none", border:"none", color:D.accent, fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:D.fontBody }}>Fazer login</button>
            </p>
          )}
          {onVoltar && (
            <button onClick={onVoltar} style={{ background:"none", border:"none", color:D.textMut, fontSize:12, cursor:"pointer", fontFamily:D.fontBody, marginTop:12 }}>← Voltar ao início</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Landing Page (MySindi) ──
const LandingPage = ({ onEntrar, onCadastrar }) => {
  const isMobile = useIsMobile();
  const [cicloAnual, setCicloAnual] = useState(false);

  const irParaPlanos = () => {
    const el = document.getElementById("planos");
    if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
  };

  const Logo = ({ light }) => (
    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
      <div style={{ width:34, height:34, borderRadius:9, background:`linear-gradient(135deg, ${D.sidebarHov}, ${D.primaryDk})`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:`0 2px 8px rgba(26,46,64,0.3)` }}>
        <span style={{ color:"#fff", fontSize:17 }}>🏢</span>
      </div>
      <span style={{ fontFamily:D.fontDisplay, fontSize:19, fontWeight:700, letterSpacing:"-0.02em", color: light ? "#fff" : D.text }}>
        My<span style={{ color: light ? "#93C5FD" : D.accent }}>Sindi</span>
      </span>
    </div>
  );

  const features = [
    { icon:"💰", titulo:"Cobranças automáticas", desc:"Taxas mensais, status de pagamento e lembretes por e-mail sem esforço." },
    { icon:"📊", titulo:"Dashboard financeiro", desc:"Caixa, receitas, despesas e inadimplência em tempo real." },
    { icon:"👥", titulo:"Gestão de moradores", desc:"Cadastro completo de unidades, com portal individual para cada morador." },
    { icon:"📅", titulo:"Reserva de áreas", desc:"Churrasqueira, salão e espaço gourmet com aprovação do síndico." },
    { icon:"🛎️", titulo:"Ocorrências e enquetes", desc:"O morador abre chamados e vota nas decisões direto pelo portal." },
    { icon:"📄", titulo:"Relatórios em PDF", desc:"Prestação de contas formal e comprovantes gerados automaticamente." },
  ];

  const planos = [
    { nome:"Básico",   preco:79,  precoAnual:790,  apt:"até 20 apartamentos",   destaque:false, resumo:"Para quem quer sair das planilhas.", recursos:["Cadastro de moradores","Cobranças e pagamentos","Portal do morador","Registro de despesas","Exportação para Excel","Comprovantes em PDF"] },
    { nome:"Padrão",   preco:149, precoAnual:1490, apt:"21 a 50 apartamentos",  destaque:true,  resumo:"O favorito dos síndicos.", recursos:["Tudo do Básico +","E-mails automáticos","Reserva de áreas","Controle de acessos","Serviços e manutenção","Multa e juros automáticos","Fluxo de caixa","Prestação de contas em PDF"] },
    { nome:"Avançado", preco:249, precoAnual:2490, apt:"51 a 100 apartamentos", destaque:false, resumo:"Gestão completa, do zero ao fim.", recursos:["Tudo do Padrão +","Comunicados e avisos","Ocorrências e enquetes","Controle de entregas","Fundo de reserva","Documentos e agenda","Suporte via WhatsApp"] },
  ];

  const btnPrimario = (extra={}) => ({ padding:"14px 28px", background:D.primary, border:"none", borderRadius:D.radius, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody, boxShadow:"0 8px 24px rgba(26,46,64,0.28)", ...extra });

  return (
    <div style={{ fontFamily:D.fontBody, background:D.bgApp, minHeight:"100vh" }}>

      {/* ── Header ── */}
      <header style={{ position:"sticky", top:0, zIndex:100, background:"rgba(255,255,255,0.85)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${D.border}`, padding: isMobile?"12px 16px":"14px 40px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <Logo />
        <div style={{ display:"flex", gap:isMobile?8:12, alignItems:"center" }}>
          {!isMobile && (
            <button onClick={irParaPlanos} style={{ padding:"9px 14px", background:"none", border:"none", color:D.textSec, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Planos</button>
          )}
          <button onClick={onEntrar} style={{ padding:isMobile?"8px 14px":"9px 18px", background:"none", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, color:D.text, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Entrar</button>
          <button onClick={onCadastrar} style={{ padding:isMobile?"8px 14px":"9px 18px", background:D.primary, border:"none", borderRadius:D.radiusSm, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(26,46,64,0.25)` }}>Começar grátis</button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ background:`linear-gradient(150deg, ${D.primaryDk} 0%, ${D.sidebar} 55%, #24384D 100%)`, color:"#fff", padding: isMobile?"44px 20px 52px":"76px 40px 88px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-90, right:-70, width:340, height:340, borderRadius:"50%", background:"rgba(16,185,129,0.14)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-110, left:-80, width:300, height:300, borderRadius:"50%", background:"rgba(148,163,184,0.10)", pointerEvents:"none" }} />

        <div style={{ maxWidth:1120, margin:"0 auto", position:"relative", display:"grid", gridTemplateColumns: isMobile?"1fr":"minmax(0,1.05fr) minmax(0,0.95fr)", gap: isMobile?32:48, alignItems:"center" }}>
          {/* Texto */}
          <div style={{ textAlign: isMobile?"center":"left", minWidth:0 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:20, padding:"6px 14px", fontSize:13, fontWeight:500, marginBottom:22 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:D.success, display:"inline-block" }} />
              14 dias grátis · sem cartão de crédito
            </div>
            <h1 style={{ fontFamily:D.fontDisplay, fontSize: isMobile?32:50, fontWeight:700, letterSpacing:"-0.035em", lineHeight:1.08, margin:"0 0 18px" }}>
              A gestão do seu condomínio,<br/>
              <span style={{ color:"#93C5FD" }}>simples e sem complicação.</span>
            </h1>
            <p style={{ fontSize: isMobile?16:18, opacity:.82, lineHeight:1.6, margin:"0 0 30px", maxWidth:520, marginLeft: isMobile?"auto":0, marginRight: isMobile?"auto":0 }}>
              Cobranças, moradores, reservas e finanças em um só lugar. Feito para síndicos que querem controle total sem dor de cabeça.
            </p>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent: isMobile?"center":"flex-start" }}>
              <button onClick={onCadastrar} style={{ padding:"14px 28px", background:"#fff", border:"none", borderRadius:D.radius, color:D.primary, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody, boxShadow:"0 10px 28px rgba(0,0,0,0.28)" }}>
                Começar teste grátis →
              </button>
              <button onClick={irParaPlanos} style={{ padding:"14px 28px", background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.28)", borderRadius:D.radius, color:"#fff", fontSize:16, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                Ver planos
              </button>
            </div>
            <div style={{ display:"flex", gap:isMobile?14:22, flexWrap:"wrap", justifyContent: isMobile?"center":"flex-start", marginTop:26, fontSize:13, opacity:.75 }}>
              <span>✓ Cancele quando quiser</span>
              <span>✓ Suporte em português</span>
              <span>✓ Pronto em minutos</span>
            </div>
          </div>

          {/* Preview do produto */}
          {!isMobile && (
            <div style={{ position:"relative", minWidth:0 }}>
              <div style={{ background:D.bgCard, borderRadius:D.radiusXl, boxShadow:"0 24px 60px rgba(0,0,0,0.35)", overflow:"hidden", transform:"perspective(1400px) rotateY(-7deg) rotateX(3deg)" }}>
                {/* topo do preview */}
                <div style={{ background:D.muted, borderBottom:`1px solid ${D.border}`, padding:"10px 14px", display:"flex", alignItems:"center", gap:6 }}>
                  {["#EF4444","#F59E0B","#10B981"].map((c,i) => <span key={i} style={{ width:9, height:9, borderRadius:"50%", background:c }} />)}
                  <span style={{ marginLeft:8, fontFamily:D.fontBody, fontSize:11, color:D.textMut }}>mysindi.app · Dashboard</span>
                </div>
                <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
                  {/* card escuro */}
                  <div style={{ background:D.primary, borderRadius:D.radius, padding:"16px 18px", color:"#fff", position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", top:-24, right:-24, width:90, height:90, borderRadius:"50%", background:"rgba(16,185,129,0.22)" }} />
                    <div style={{ position:"relative" }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:".8px", textTransform:"uppercase", opacity:.8 }}>Saldo em caixa</div>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:26, fontWeight:700, letterSpacing:"-0.03em", marginTop:4 }}>R$ 48.520,00</div>
                    </div>
                  </div>
                  {/* inadimplência */}
                  <div style={{ border:`1px solid ${D.border}`, borderRadius:D.radius, padding:"14px 16px" }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:".8px", textTransform:"uppercase", color:D.textSec, marginBottom:10 }}>Inadimplência</div>
                    <div style={{ display:"flex", gap:8 }}>
                      {[{n:38,l:"Em dia",c:D.success},{n:4,l:"Pendentes",c:D.warning},{n:2,l:"Atrasados",c:D.danger}].map((s,i) => (
                        <div key={i} style={{ flex:1, background:D.muted, borderRadius:D.radiusSm, padding:"10px 6px", textAlign:"center" }}>
                          <div style={{ fontFamily:D.fontDisplay, fontSize:17, fontWeight:700, color:s.c, lineHeight:1 }}>{s.n}</div>
                          <div style={{ fontSize:10, color:D.textSec, marginTop:3 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* linhas de cobrança */}
                  <div style={{ border:`1px solid ${D.border}`, borderRadius:D.radius, overflow:"hidden" }}>
                    {[{u:"Apto 301",n:"Maria Santos",v:"R$ 1.250",s:"Pago",c:D.success,b:D.successBg},{u:"Apto 112",n:"Carlos Pereira",v:"R$ 980",s:"Pago",c:D.success,b:D.successBg},{u:"Apto 505",n:"Ana Oliveira",v:"R$ 1.500",s:"Pendente",c:D.warning,b:D.warningBg}].map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom: i<2?`1px solid ${D.border}`:"none", gap:8 }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:D.fontDisplay, fontSize:12, fontWeight:600, color:D.text }}>{r.u}</div>
                          <div style={{ fontSize:11, color:D.textSec }}>{r.n}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                          <span style={{ fontSize:12, fontWeight:600, color:D.text }}>{r.v}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:r.c, background:r.b, padding:"3px 9px", borderRadius:10 }}>{r.s}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section style={{ padding: isMobile?"48px 20px":"76px 40px", maxWidth:1100, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:isMobile?32:48 }}>
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", color:D.accent, marginBottom:10 }}>Funcionalidades</div>
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?27:38, fontWeight:700, letterSpacing:"-0.03em", color:D.text, margin:"0 0 12px" }}>Tudo que você precisa,<br/>em um só lugar.</h2>
          <p style={{ fontSize:16, color:D.textSec, margin:0 }}>Uma plataforma completa para a gestão do seu condomínio.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(auto-fit,minmax(280px,1fr))", gap:16 }}>
          {features.map((f,i) => (
            <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"26px 24px", border:`1px solid ${D.border}`, boxShadow:D.shadow }}>
              <div style={{ width:46, height:46, borderRadius:12, background:D.secondary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:21, marginBottom:16 }}>{f.icon}</div>
              <h3 style={{ fontFamily:D.fontDisplay, fontSize:17, fontWeight:600, color:D.text, margin:"0 0 8px", letterSpacing:"-0.01em" }}>{f.titulo}</h3>
              <p style={{ fontSize:14, color:D.textSec, lineHeight:1.6, margin:0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" style={{ padding: isMobile?"48px 20px 56px":"76px 40px 88px", background:D.bgCard, borderTop:`1px solid ${D.border}`, borderBottom:`1px solid ${D.border}` }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:isMobile?30:44 }}>
            <div style={{ fontSize:12, fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", color:D.accent, marginBottom:10 }}>Planos</div>
            <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?27:38, fontWeight:700, letterSpacing:"-0.03em", color:D.text, margin:"0 0 12px" }}>Preço simples, sem surpresas.</h2>
            <p style={{ fontSize:16, color:D.textSec, margin:"0 0 26px" }}>Escolha pelo tamanho do condomínio. Cancele quando quiser.</p>

            {/* Seletor mensal/anual */}
            <div style={{ display:"inline-flex", background:D.muted, border:`1px solid ${D.border}`, borderRadius:30, padding:4 }}>
              <button onClick={()=>setCicloAnual(false)} style={{ padding:"9px 22px", borderRadius:24, border:"none", cursor:"pointer", fontFamily:D.fontBody, fontSize:14, fontWeight:600, background: !cicloAnual?D.bgCard:"transparent", color: !cicloAnual?D.text:D.textSec, boxShadow: !cicloAnual?D.shadow:"none" }}>Mensal</button>
              <button onClick={()=>setCicloAnual(true)} style={{ padding:"9px 22px", borderRadius:24, border:"none", cursor:"pointer", fontFamily:D.fontBody, fontSize:14, fontWeight:600, background: cicloAnual?D.bgCard:"transparent", color: cicloAnual?D.text:D.textSec, boxShadow: cicloAnual?D.shadow:"none", display:"flex", alignItems:"center", gap:8 }}>
                Anual <span style={{ background:D.successBg, color:D.success, fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:12 }}>-17%</span>
              </button>
            </div>
            {cicloAnual && (
              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.success, fontWeight:600, marginTop:12 }}>🎉 2 meses grátis no plano anual</div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(3,1fr)", gap: isMobile?16:20, alignItems:"start", paddingTop: isMobile?14:18 }}>
            {planos.map((p,i) => {
              const dest = p.destaque;
              return (
                <div key={i} style={{
                  background: dest?`linear-gradient(155deg, ${D.sidebar}, ${D.primaryDk})`:D.bgApp,
                  borderRadius:D.radiusXl, padding: dest?"34px 28px":"30px 26px",
                  border: dest?"none":`1px solid ${D.border}`,
                  position:"relative",
                  boxShadow: dest?"0 20px 48px rgba(26,46,64,0.32)":D.shadow,
                  transform: dest&&!isMobile?"scale(1.045)":"none",
                  zIndex: dest?2:1,
                }}>
                  {dest && (
                    <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:D.success, color:"#fff", fontSize:11, fontWeight:800, letterSpacing:".6px", padding:"6px 16px", borderRadius:20, whiteSpace:"nowrap", boxShadow:"0 4px 12px rgba(16,185,129,0.4)" }}>★ MAIS POPULAR</div>
                  )}
                  <h3 style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color: dest?"#fff":D.text, margin:"0 0 3px", letterSpacing:"-0.02em" }}>{p.nome}</h3>
                  <p style={{ fontSize:13, color: dest?"rgba(255,255,255,0.65)":D.textSec, margin:"0 0 2px" }}>{p.apt}</p>
                  <p style={{ fontSize:13, color: dest?"#93C5FD":D.accent, fontWeight:600, margin:"0 0 20px" }}>{p.resumo}</p>

                  <div style={{ marginBottom:22 }}>
                    {cicloAnual ? (
                      <>
                        <div style={{ fontSize:13, color: dest?"rgba(255,255,255,0.5)":D.textMut, textDecoration:"line-through", marginBottom:2 }}>R$ {p.preco*12}/ano</div>
                        <span style={{ fontFamily:D.fontDisplay, fontSize:40, fontWeight:700, color: dest?"#fff":D.text, letterSpacing:"-0.03em" }}>R$ {p.precoAnual}</span>
                        <span style={{ fontSize:15, color: dest?"rgba(255,255,255,0.7)":D.textSec }}>/ano</span>
                        <div style={{ fontSize:12, color: dest?"rgba(255,255,255,0.6)":D.textMut, marginTop:4 }}>equivale a R$ {Math.round(p.precoAnual/12)}/mês</div>
                      </>
                    ) : (
                      <>
                        <span style={{ fontFamily:D.fontDisplay, fontSize:40, fontWeight:700, color: dest?"#fff":D.text, letterSpacing:"-0.03em" }}>R$ {p.preco}</span>
                        <span style={{ fontSize:15, color: dest?"rgba(255,255,255,0.7)":D.textSec }}>/mês</span>
                        <div style={{ fontSize:12, color: dest?"rgba(255,255,255,0.6)":D.textMut, marginTop:4 }}>R$ {p.precoAnual} no plano anual · 2 meses grátis</div>
                      </>
                    )}
                  </div>

                  <button onClick={onCadastrar} style={{ width:"100%", padding:"13px", background: dest?"#fff":D.primary, color: dest?D.primary:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody, marginBottom:8, boxShadow: dest?"0 6px 18px rgba(0,0,0,0.25)":"none" }}>
                    Começar 14 dias grátis
                  </button>
                  <div style={{ textAlign:"center", fontSize:11, color: dest?"rgba(255,255,255,0.55)":D.textMut, marginBottom:22 }}>Sem cartão de crédito</div>

                  <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
                    {p.recursos.map((r,j) => (
                      <div key={j} style={{ display:"flex", alignItems:"flex-start", gap:10, fontSize:14, color: dest?"rgba(255,255,255,0.92)":D.text, lineHeight:1.4 }}>
                        <span style={{ color: dest?D.success:D.success, fontWeight:700, flexShrink:0 }}>✓</span>{r}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display:"flex", gap:isMobile?12:24, justifyContent:"center", flexWrap:"wrap", margin:"32px 0 0", fontSize:13, color:D.textSec }}>
            <span>✓ 14 dias grátis</span>
            <span>✓ Sem cartão de crédito</span>
            <span>✓ Cancele quando quiser</span>
            <span>✓ Suporte em português</span>
          </div>
          <p style={{ textAlign:"center", fontSize:13, color:D.textMut, margin:"14px 0 0" }}>
            Condomínios com mais de 100 apartamentos: <button onClick={onCadastrar} style={{ background:"none", border:"none", color:D.accent, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:D.fontBody, textDecoration:"underline" }}>fale conosco</button>
          </p>
        </div>
      </section>

      {/* ── Prova social ── */}
      <section style={{ padding: isMobile?"48px 20px":"72px 40px", maxWidth:1000, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:isMobile?30:44 }}>
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?26:34, fontWeight:700, letterSpacing:"-0.03em", color:D.text, margin:0 }}>Síndicos que confiam no MySindi</h2>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(3,1fr)", gap:16 }}>
          {[
            { nome:"Ricardo M.", cargo:"Síndico · 32 unidades", texto:"Reduzi o tempo que gastava com planilhas em 80%. As cobranças automáticas mudaram minha rotina." },
            { nome:"Ana Paula S.", cargo:"Síndica · 18 unidades", texto:"Os moradores adoraram o portal individual. Ficou tudo mais transparente e profissional." },
            { nome:"Carlos E.", cargo:"Síndico · 64 unidades", texto:"A prestação de contas em PDF impressiona na assembleia. Recomendo para qualquer condomínio." },
          ].map((d,i) => (
            <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"24px", border:`1px solid ${D.border}`, boxShadow:D.shadow }}>
              <div style={{ fontSize:15, marginBottom:12, color:D.warning, letterSpacing:2 }}>★★★★★</div>
              <p style={{ fontSize:14, color:D.text, lineHeight:1.6, margin:"0 0 16px" }}>"{d.texto}"</p>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:D.secondary, color:D.primary, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:14, fontWeight:700, flexShrink:0 }}>{d.nome.charAt(0)}</div>
                <div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{d.nome}</div>
                  <div style={{ fontSize:12, color:D.textSec }}>{d.cargo}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign:"center", fontSize:12, color:D.textMut, margin:"24px 0 0", fontStyle:"italic" }}>* Depoimentos ilustrativos</p>
      </section>

      {/* ── CTA final ── */}
      <section style={{ background:`linear-gradient(150deg, ${D.primaryDk}, ${D.sidebar} 60%, #24384D)`, color:"#fff", padding: isMobile?"52px 20px":"76px 40px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-70, left:"50%", transform:"translateX(-50%)", width:420, height:260, borderRadius:"50%", background:"rgba(16,185,129,0.12)", pointerEvents:"none" }} />
        <div style={{ position:"relative" }}>
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?27:38, fontWeight:700, letterSpacing:"-0.03em", margin:"0 0 14px" }}>Pronto para simplificar sua gestão?</h2>
          <p style={{ fontSize:17, opacity:.85, margin:"0 auto 28px", maxWidth:520 }}>Experimente grátis por 14 dias. Sem compromisso, sem cartão de crédito.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={onCadastrar} style={{ padding:"16px 36px", background:"#fff", border:"none", borderRadius:D.radius, color:D.primary, fontSize:17, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody, boxShadow:"0 10px 28px rgba(0,0,0,0.3)" }}>
              Criar minha conta grátis
            </button>
            <button onClick={onEntrar} style={{ padding:"16px 30px", background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.28)", borderRadius:D.radius, color:"#fff", fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
              Já sou cliente
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background:D.sidebar, color:"rgba(226,232,240,0.6)", padding: isMobile?"32px 20px":"40px", textAlign:"center", borderTop:`1px solid ${D.sidebarBdr}` }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo light /></div>
        <p style={{ fontSize:13, margin:"0 0 8px" }}>Gestão de condomínios simples e profissional.</p>
        <p style={{ fontSize:12, color:"rgba(226,232,240,0.4)", margin:0 }}>© {new Date().getFullYear()} MySindi · Todos os direitos reservados</p>
      </footer>
    </div>
  );
};

// ── Painel do Administrador (MySindi) ──
const AdminPanel = ({ onSair }) => {
  const isMobile = useIsMobile();
  const [condominios, setCondominios] = useState([]);
  const [gastos, setGastos]           = useState([]);
  const [carregando, setCarregando]   = useState(true);
  const [modalAcao, setModalAcao]     = useState(null); // { tipo, cond }
  const [novoGasto, setNovoGasto]     = useState({ descricao:"", valor:"", mes: (()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })() });
  const [confirmNome, setConfirmNome] = useState("");
  const [toast, setToast]             = useState(null);
  const [mesFiltro, setMesFiltro]     = useState((()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })());

  const showToast = (msg, type="success") => setToast({ msg, type });

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "condominios"), s => {
      setCondominios(s.docs.map(d => ({ id:d.id, ...d.data() })));
      setCarregando(false);
    });
    const u2 = onSnapshot(collection(db, "gastos_mysindi"), s => {
      setGastos(s.docs.map(d => ({ id:d.id, ...d.data() })));
    });
    return () => { u1(); u2(); };
  }, []);

  // ── Cálculo do status de cada condomínio ──
  const statusCond = (c) => {
    if (c.plano === "cortesia") return "cortesia";
    if (c.statusAssinatura === "ativo") return "ativo";
    if (c.statusAssinatura === "bloqueado") return "expirado";
    if (c.trialAte) {
      const [d,m,a] = c.trialAte.split("/").map(Number);
      const fim = new Date(a, m-1, d, 23,59,59);
      if (new Date() > fim) return "expirado";
      return "trial";
    }
    return "trial";
  };

  const precoPlano = (plano) => PLANOS[plano]?.preco || 0;
  // Valor mensal efetivo (anual dividido por 12)
  const mrrCond = (c) => {
    if (c.cicloCobranca === "anual") return (PLANOS[c.plano]?.precoAnual || 0) / 12;
    return precoPlano(c.plano);
  };

  // ── Métricas do negócio ──
  const ativos     = condominios.filter(c => statusCond(c) === "ativo");
  const emTrial    = condominios.filter(c => statusCond(c) === "trial");
  const expirados  = condominios.filter(c => statusCond(c) === "expirado");
  const cortesias  = condominios.filter(c => statusCond(c) === "cortesia");
  const clientesPagantes = ativos.length;
  const mrr        = ativos.reduce((s,c) => s + mrrCond(c), 0);
  const ticketMedio = clientesPagantes > 0 ? mrr / clientesPagantes : 0;
  const projecaoAnual = mrr * 12;

  // ── Financeiro do mês selecionado ──
  const gastosMes  = gastos.filter(g => g.mes === mesFiltro);
  const totalGastosMes = gastosMes.reduce((s,g) => s + (g.valor||0), 0);
  const receitaMes = mrr; // assinaturas ativas (recorrente)
  const lucroMes   = receitaMes - totalGastosMes;
  const margemLucro = receitaMes > 0 ? (lucroMes / receitaMes) * 100 : 0;

  // ── Ações ──
  const mudarStatus = async (cond, novoStatus) => {
    await setDoc(doc(db, "condominios", cond.id), { statusAssinatura: novoStatus }, { merge:true });
    showToast(novoStatus === "ativo" ? `${cond.nome} ativado!` : `${cond.nome} bloqueado.`, novoStatus === "ativo" ? "success" : "error");
    setModalAcao(null);
  };

  const mudarPlano = async (cond, novoPlano) => {
    await setDoc(doc(db, "condominios", cond.id), { plano: novoPlano }, { merge:true });
    showToast(`Plano de ${cond.nome} alterado para ${PLANOS[novoPlano].nome}.`);
    setModalAcao(null);
  };

  const mudarCiclo = async (cond, ciclo) => {
    await setDoc(doc(db, "condominios", cond.id), { cicloCobranca: ciclo }, { merge:true });
    showToast(`Cobrança de ${cond.nome} definida como ${ciclo}.`);
    setModalAcao(null);
  };

  const estenderTrial = async (cond, dias) => {
    const novaData = new Date(Date.now() + dias*24*60*60*1000).toLocaleDateString("pt-BR");
    await setDoc(doc(db, "condominios", cond.id), { trialAte: novaData, statusAssinatura: "trial" }, { merge:true });
    showToast(`Trial de ${cond.nome} estendido por ${dias} dias.`);
    setModalAcao(null);
  };

  const excluirCondominio = async (cond) => {
    // Apaga o condomínio e todos os dados vinculados
    const colecoes = ["moradores","cobrancas","despesas","servicos","logs","acessos","reservas","observacoes"];
    for (const col of colecoes) {
      const snap = await getDocs(query(collection(db, col), where("condominioId","==",cond.id)));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      if (snap.docs.length) await batch.commit();
    }
    // Apaga o vínculo do usuário
    if (cond.sindicoUid) {
      try { await deleteDoc(doc(db, "usuarios", cond.sindicoUid)); } catch(e){}
    }
    await deleteDoc(doc(db, "condominios", cond.id));
    showToast(`${cond.nome} e todos os dados foram excluídos.`, "error");
    setModalAcao(null);
    setConfirmNome("");
  };

  const addGasto = async () => {
    if (!novoGasto.descricao || !novoGasto.valor) { showToast("Preencha descrição e valor.", "error"); return; }
    await addDoc(collection(db, "gastos_mysindi"), {
      descricao: novoGasto.descricao.trim(),
      valor: parseFloat(novoGasto.valor) || 0,
      mes: novoGasto.mes,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
    });
    setNovoGasto({ descricao:"", valor:"", mes: mesFiltro });
    showToast("Gasto registrado!");
  };

  const removerGasto = async (id) => {
    await deleteDoc(doc(db, "gastos_mysindi", id));
    showToast("Gasto removido.", "error");
  };

  const mesLabelAdmin = (m) => {
    const [a,mo] = m.split("-");
    return `${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1]}/${a}`;
  };

  const mesesGasto = () => {
    const arr = [];
    const hoje = new Date();
    for (let i=0;i<12;i++){ const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1); arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); }
    return arr;
  };

  const badgeStatus = (st) => {
    const map = {
      cortesia:{ label:"Cortesia", bg:D.secondary, color:D.primary },
      ativo:   { label:"Ativo",    bg:D.successBg, color:D.success },
      trial:   { label:"Trial",    bg:D.warningBg, color:"#92400E" },
      expirado:{ label:"Expirado", bg:D.dangerBg,  color:D.danger },
    };
    const b = map[st] || map.trial;
    return <span style={{ background:b.bg, color:b.color, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, fontFamily:D.fontBody }}>{b.label}</span>;
  };

  const card = { background:D.bgCard, borderRadius:D.radius, border:`1px solid ${D.border}`, boxShadow:D.shadow };

  return (
    <div style={{ minHeight:"100vh", background:D.bgApp, fontFamily:D.fontBody }}>
      {toast && (()=>{ setTimeout(()=>setToast(null),3000); return (
        <div style={{ position:"fixed", bottom:20, right:20, left: isMobile?20:"auto", background: toast.type==="error"?D.danger:D.success, color:"#fff", padding:"14px 18px", borderRadius:12, fontSize:14, zIndex:9999, boxShadow:D.shadowMd, fontFamily:D.fontBody }}>{toast.msg}</div>
      );})()}

      {/* Header */}
      <header style={{ background:D.sidebar, color:"#fff", padding: isMobile?"16px 20px":"18px 40px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏢</div>
          <div>
            <div style={{ fontFamily:D.fontDisplay, fontSize:17, fontWeight:700, letterSpacing:"-0.02em" }}>My<span style={{ color:"#93C5FD" }}>Sindi</span> · Admin</div>
            <div style={{ fontSize:11, color:"rgba(226,232,245,0.5)" }}>Painel do administrador</div>
          </div>
        </div>
        <button onClick={onSair} style={{ padding:"9px 18px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:D.radiusSm, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Sair</button>
      </header>

      <div style={{ padding: isMobile?"20px 16px 40px":"28px 40px 60px", maxWidth:1200, margin:"0 auto" }}>

        {carregando ? (
          <div style={{ textAlign:"center", padding:60, color:D.textMut }}>Carregando dados...</div>
        ) : (
        <>
          {/* Métricas principais */}
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?20:24, fontWeight:700, color:D.text, margin:"0 0 16px", letterSpacing:"-0.02em" }}>Visão geral do negócio</h2>
          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap:14, marginBottom:24 }}>
            {[
              { label:"Receita mensal (MRR)", valor:`R$ ${mrr.toFixed(2).replace(".",",")}`, icon:"💰", cor:D.success, bg:D.successBg },
              { label:"Clientes pagantes", valor:clientesPagantes, icon:"✅", cor:D.primary, bg:D.secondary },
              { label:"Em teste grátis", valor:emTrial.length, icon:"✨", cor:D.warning, bg:D.warningBg },
              { label:"Projeção anual", valor:`R$ ${projecaoAnual.toFixed(0)}`, icon:"📈", cor:D.accent, bg:D.secondary },
            ].map((m,i)=>(
              <div key={i} style={{ ...card, padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:m.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{m.icon}</div>
                </div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:isMobile?18:22, fontWeight:700, color:m.cor, letterSpacing:"-0.02em" }}>{m.valor}</div>
                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Resumo de status */}
          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap:14, marginBottom:32 }}>
            {[
              { label:"Total de condomínios", valor:condominios.length, cor:D.text },
              { label:"Ativos", valor:ativos.length, cor:D.success },
              { label:"Expirados", valor:expirados.length, cor:D.danger },
              { label:"Cortesia", valor:cortesias.length, cor:D.textSec },
            ].map((m,i)=>(
              <div key={i} style={{ ...card, padding:"14px 18px", textAlign:"center" }}>
                <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color:m.cor }}>{m.valor}</div>
                <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec, marginTop:2 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Financeiro */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?20:24, fontWeight:700, color:D.text, margin:0, letterSpacing:"-0.02em" }}>Financeiro</h2>
            <select value={mesFiltro} onChange={e=>setMesFiltro(e.target.value)} style={{ padding:"8px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard, fontFamily:D.fontBody }}>
              {mesesGasto().map(m => <option key={m} value={m}>{mesLabelAdmin(m)}</option>)}
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(4,1fr)", gap:14, marginBottom:20 }}>
            {[
              { label:"Receita", valor:receitaMes, icon:"↑", cor:D.success },
              { label:"Gastos", valor:totalGastosMes, icon:"↓", cor:D.danger },
              { label:"Lucro", valor:lucroMes, icon:"=", cor: lucroMes>=0?D.success:D.danger },
              { label:"Margem", valor:null, texto:`${margemLucro.toFixed(1)}%`, icon:"%", cor:D.accent },
            ].map((m,i)=>(
              <div key={i} style={{ ...card, padding:"18px 20px" }}>
                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginBottom:6 }}>{m.label}</div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color:m.cor, letterSpacing:"-0.02em" }}>
                  {m.texto || `R$ ${m.valor.toFixed(2).replace(".",",")}`}
                </div>
              </div>
            ))}
          </div>

          {/* Registrar gastos */}
          <div style={{ ...card, padding: isMobile?18:24, marginBottom:32 }}>
            <h3 style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, margin:"0 0 14px", letterSpacing:"-0.02em" }}>Registrar gasto — {mesLabelAdmin(mesFiltro)}</h3>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
              <input value={novoGasto.descricao} onChange={e=>setNovoGasto(p=>({...p,descricao:e.target.value}))} placeholder="Descrição (ex: Firebase, Vercel...)" style={{ flex: isMobile?"1 1 100%":"2 1 200px", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
              <input type="number" value={novoGasto.valor} onChange={e=>setNovoGasto(p=>({...p,valor:e.target.value}))} placeholder="Valor (R$)" style={{ flex: isMobile?"1 1 100%":"1 1 100px", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
              <select value={novoGasto.mes} onChange={e=>setNovoGasto(p=>({...p,mes:e.target.value}))} style={{ flex: isMobile?"1 1 100%":"1 1 120px", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, background:"#fff" }}>
                {mesesGasto().map(m => <option key={m} value={m}>{mesLabelAdmin(m)}</option>)}
              </select>
              <button onClick={addGasto} style={{ flex: isMobile?"1 1 100%":"0 0 auto", padding:"10px 20px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>+ Adicionar</button>
            </div>
            {gastosMes.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {gastosMes.map(g => (
                  <div key={g.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:D.muted, borderRadius:D.radiusSm }}>
                    <span style={{ fontFamily:D.fontBody, fontSize:14, color:D.text }}>{g.descricao}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.danger }}>R$ {g.valor.toFixed(2).replace(".",",")}</span>
                      <button onClick={()=>removerGasto(g.id)} style={{ background:"none", border:"none", color:D.textMut, cursor:"pointer", fontSize:16 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"16px 0" }}>Nenhum gasto registrado neste mês.</div>
            )}
          </div>

          {/* Lista de condomínios */}
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:isMobile?20:24, fontWeight:700, color:D.text, margin:"0 0 16px", letterSpacing:"-0.02em" }}>Condomínios ({condominios.length})</h2>
          <div style={{ ...card, overflow:"hidden" }}>
            {condominios.length === 0 ? (
              <div style={{ padding:40, textAlign:"center", color:D.textMut, fontFamily:D.fontBody }}>Nenhum condomínio cadastrado ainda.</div>
            ) : isMobile ? (
              <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10 }}>
                {condominios.map(c => (
                  <div key={c.id} style={{ background:D.muted, borderRadius:D.radiusSm, padding:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div>
                        <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text }}>{c.nome}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{c.numApartamentos} apt · {PLANOS[c.plano]?.nome}</div>
                      </div>
                      {badgeStatus(statusCond(c))}
                    </div>
                    <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginBottom:10 }}>{c.sindicoEmail}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <button onClick={()=>setModalAcao({tipo:"gerenciar",cond:c})} style={{ padding:"6px 12px", background:D.primary, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Gerenciar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:D.muted }}>
                    {["Condomínio","Síndico","Plano","Status","MRR","Ações"].map(h=>(
                      <th key={h} style={{ padding:"12px 18px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {condominios.map(c => (
                    <tr key={c.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                      <td style={{ padding:"14px 18px" }}>
                        <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{c.nome}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut }}>{c.numApartamentos} apartamentos</div>
                      </td>
                      <td style={{ padding:"14px 18px", fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{c.sindicoEmail}</td>
                      <td style={{ padding:"14px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{PLANOS[c.plano]?.nome}</td>
                      <td style={{ padding:"14px 18px" }}>{badgeStatus(statusCond(c))}</td>
                      <td style={{ padding:"14px 18px", fontFamily:D.fontDisplay, fontSize:13, fontWeight:600, color: statusCond(c)==="ativo"?D.success:D.textMut }}>
                        {statusCond(c)==="ativo" ? `R$ ${precoPlano(c.plano)}` : "—"}
                      </td>
                      <td style={{ padding:"14px 18px" }}>
                        <button onClick={()=>setModalAcao({tipo:"gerenciar",cond:c})} style={{ padding:"6px 14px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Gerenciar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
        )}
      </div>

      {/* Modal de gerenciamento */}
      {modalAcao?.tipo === "gerenciar" && (() => {
        const c = modalAcao.cond;
        const st = statusCond(c);
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:1000, display:"flex", alignItems: isMobile?"flex-end":"center", justifyContent:"center", padding: isMobile?0:16 }} onClick={()=>setModalAcao(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius: isMobile?"20px 20px 0 0":D.radius, width:"100%", maxWidth:480, maxHeight:"90vh", overflow:"auto", boxShadow:D.shadowMd }}>
              <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${D.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:17, fontWeight:700, color:D.text, letterSpacing:"-0.02em" }}>{c.nome}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{c.sindicoEmail}</div>
                </div>
                <button onClick={()=>setModalAcao(null)} style={{ background:D.muted, border:"none", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, color:D.textSec }}>×</button>
              </div>
              <div style={{ padding:"20px 24px 28px" }}>
                {/* Status atual */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                  <span style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Status atual:</span>
                  {badgeStatus(st)}
                  {c.trialAte && st==="trial" && <span style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>até {c.trialAte}</span>}
                </div>

                {/* Ativar/Bloquear */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Assinatura</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button onClick={()=>mudarStatus(c,"ativo")} disabled={st==="cortesia"} style={{ flex:1, padding:"10px", background: st==="ativo"?D.success:D.successBg, color: st==="ativo"?"#fff":D.success, border:`1px solid ${D.success}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: st==="cortesia"?"not-allowed":"pointer", opacity: st==="cortesia"?.5:1, fontFamily:D.fontBody }}>✓ Ativar</button>
                    <button onClick={()=>mudarStatus(c,"bloqueado")} disabled={st==="cortesia"} style={{ flex:1, padding:"10px", background: st==="expirado"?D.danger:D.dangerBg, color: st==="expirado"?"#fff":D.danger, border:`1px solid ${D.danger}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: st==="cortesia"?"not-allowed":"pointer", opacity: st==="cortesia"?.5:1, fontFamily:D.fontBody }}>✕ Bloquear</button>
                  </div>
                  {st==="cortesia" && <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"8px 0 0" }}>Condomínio em cortesia não é afetado por bloqueios.</p>}
                </div>

                {/* Mudar plano */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Mudar plano</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {Object.keys(PLANOS).map(pk => (
                      <button key={pk} onClick={()=>mudarPlano(c,pk)} style={{ flex:"1 1 auto", padding:"8px 12px", background: c.plano===pk?D.primary:D.muted, color: c.plano===pk?"#fff":D.text, border:`1px solid ${c.plano===pk?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                        {PLANOS[pk].nome}<br/><span style={{ fontSize:10, opacity:.8 }}>R$ {PLANOS[pk].preco}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ciclo de cobrança */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Ciclo de cobrança</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>mudarCiclo(c,"mensal")} style={{ flex:1, padding:"9px", background: (c.cicloCobranca||"mensal")==="mensal"?D.primary:D.muted, color: (c.cicloCobranca||"mensal")==="mensal"?"#fff":D.text, border:`1px solid ${(c.cicloCobranca||"mensal")==="mensal"?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                      Mensal<br/><span style={{ fontSize:10, opacity:.8 }}>R$ {PLANOS[c.plano]?.preco}/mês</span>
                    </button>
                    <button onClick={()=>mudarCiclo(c,"anual")} style={{ flex:1, padding:"9px", background: c.cicloCobranca==="anual"?D.primary:D.muted, color: c.cicloCobranca==="anual"?"#fff":D.text, border:`1px solid ${c.cicloCobranca==="anual"?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                      Anual<br/><span style={{ fontSize:10, opacity:.8 }}>R$ {PLANOS[c.plano]?.precoAnual}/ano</span>
                    </button>
                  </div>
                </div>

                {/* Estender trial */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Estender teste grátis</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {[7,14,30].map(d => (
                      <button key={d} onClick={()=>estenderTrial(c,d)} style={{ flex:1, padding:"9px", background:D.warningBg, color:"#92400E", border:`1px solid ${D.warning}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>+{d} dias</button>
                    ))}
                  </div>
                </div>

                {/* Excluir */}
                <div style={{ borderTop:`1px solid ${D.border}`, paddingTop:20 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.danger, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Zona de perigo</div>
                  <button onClick={()=>setModalAcao({tipo:"excluir",cond:c})} style={{ width:"100%", padding:"10px", background:"#fff", color:D.danger, border:`1.5px solid ${D.danger}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>🗑️ Excluir condomínio permanentemente</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de confirmação de exclusão */}
      {modalAcao?.tipo === "excluir" && (() => {
        const c = modalAcao.cond;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.75)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#fff", borderRadius:D.radius, width:"100%", maxWidth:440, boxShadow:D.shadowMd, padding:"28px 26px" }}>
              <div style={{ fontSize:32, marginBottom:12, textAlign:"center" }}>⚠️</div>
              <h3 style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.text, margin:"0 0 10px", textAlign:"center", letterSpacing:"-0.02em" }}>Excluir {c.nome}?</h3>
              <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.6, margin:"0 0 18px", textAlign:"center" }}>
                Esta ação é <b>irreversível</b>. Todos os dados serão apagados permanentemente: moradores, cobranças, despesas, serviços, reservas e histórico.
              </p>
              <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, margin:"0 0 8px" }}>Digite <b>{c.nome}</b> para confirmar:</p>
              <input value={confirmNome} onChange={e=>setConfirmNome(e.target.value)} placeholder={c.nome} style={{ width:"100%", padding:"11px 14px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box", marginBottom:18 }} />
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>{setModalAcao({tipo:"gerenciar",cond:c}); setConfirmNome("");}} style={{ flex:1, padding:"11px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
                <button onClick={()=>excluirCondominio(c)} disabled={confirmNome !== c.nome} style={{ flex:1, padding:"11px", background: confirmNome===c.nome?D.danger:D.dangerBg, color: confirmNome===c.nome?"#fff":D.danger, border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor: confirmNome===c.nome?"pointer":"not-allowed", opacity: confirmNome===c.nome?1:.6, fontFamily:D.fontBody }}>Excluir</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ── App Principal ──
// ── Portal do Morador ──
function PortalMorador({ moradorId, db, taxa, mesLabel, mesAtual }) {
  const [morador, setMorador]     = useState(null);
  const [cobrancas, setCobrancas] = useState([]);
  const [reservasMor, setReservasMor] = useState([]);
  const [comunicadosMor, setComunicadosMor] = useState([]);
  const [condoConfig, setCondoConfig] = useState(null);
  const [extrasMor, setExtrasMor] = useState([]);
  const [pagExtrasMor, setPagExtrasMor] = useState([]);
  const [mesSel, setMesSel]       = useState(mesAtual());
  const [formReserva, setFormReserva] = useState({ area:"Churrasqueira", data:"", horario:"", observacao:"" });
  const [enviandoReserva, setEnviandoReserva] = useState(false);
  const [msgReserva, setMsgReserva] = useState("");
  const [ocorrenciasMor, setOcorrenciasMor] = useState([]);
  const [formOcorrencia, setFormOcorrencia] = useState({ titulo:"", categoria:"Manutenção", descricao:"" });
  const [enviandoOcorrencia, setEnviandoOcorrencia] = useState(false);
  const [msgOcorrencia, setMsgOcorrencia] = useState("");
  const [enquetesMor, setEnquetesMor] = useState([]);
  const [votosMor, setVotosMor] = useState([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!moradorId) return;
    const u1 = onSnapshot(doc(db, "moradores", moradorId), d => {
      if (d.exists()) setMorador({ id:d.id, ...d.data() });
    });
    const u2 = onSnapshot(
      query(collection(db, "cobrancas"), where("moradorId","==",moradorId)),
      s => setCobrancas(s.docs.map(d => d.data()).sort((a,b) => b.mes.localeCompare(a.mes)))
    );
    const u3 = onSnapshot(
      query(collection(db, "reservas"), where("moradorId","==",moradorId)),
      s => setReservasMor(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    return () => { u1(); u2(); u3(); };
  }, [moradorId]);

  // Comunicados do condomínio (carrega quando o morador é conhecido)
  useEffect(() => {
    if (!morador?.condominioId) return;
    const u = onSnapshot(
      query(collection(db, "comunicados"), where("condominioId","==",morador.condominioId)),
      s => setComunicadosMor(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (b.fixado?1:0)-(a.fixado?1:0) || b.timestamp - a.timestamp))
    );
    // Config do condomínio (dia de vencimento, multa/juros) para calcular encargos
    const u2 = onSnapshot(doc(db, "condominios", morador.condominioId), d => {
      if (d.exists()) setCondoConfig(d.data());
    });
    // Cobranças extras do condomínio e os pagamentos deste morador
    const u3e = onSnapshot(
      query(collection(db, "cobrancas_extras"), where("condominioId","==",morador.condominioId)),
      s => setExtrasMor(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    const u4e = onSnapshot(
      query(collection(db, "pag_extras"), where("condominioId","==",morador.condominioId)),
      s => setPagExtrasMor(s.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    // Ocorrências deste morador
    const u5e = onSnapshot(
      query(collection(db, "ocorrencias"), where("moradorId","==",moradorId)),
      s => setOcorrenciasMor(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    // Enquetes do condomínio e votos deste morador
    const u6e = onSnapshot(
      query(collection(db, "enquetes"), where("condominioId","==",morador.condominioId)),
      s => setEnquetesMor(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    const u7e = onSnapshot(
      query(collection(db, "votos"), where("moradorId","==",moradorId)),
      s => setVotosMor(s.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    return () => { u(); u2(); u3e(); u4e(); u5e(); u6e(); u7e(); };
  }, [morador?.condominioId]);

  const fazerReserva = async () => {
    if (!formReserva.data || !formReserva.horario) { setMsgReserva("Preencha a data e o horário."); return; }
    setEnviandoReserva(true);
    try {
      await addDoc(collection(db, "reservas"), {
        condominioId: morador.condominioId || null,
        moradorId, nome: morador.nome, unidade: morador.unidade,
        area: formReserva.area, data: formReserva.data, horario: formReserva.horario,
        observacao: formReserva.observacao || "",
        status: "pendente",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        timestamp: Date.now(),
        criadoPor: "morador",
      });
      setFormReserva({ area:"Churrasqueira", data:"", horario:"", observacao:"" });
      setMsgReserva("✅ Reserva solicitada! Aguarde aprovação do síndico.");
    } catch(e) {
      setMsgReserva("Erro ao solicitar reserva. Tente novamente.");
    } finally {
      setEnviandoReserva(false);
    }
  };

  const abrirOcorrencia = async () => {
    if (!formOcorrencia.titulo.trim() || !formOcorrencia.descricao.trim()) { setMsgOcorrencia("Preencha o título e a descrição."); return; }
    setEnviandoOcorrencia(true);
    try {
      await addDoc(collection(db, "ocorrencias"), {
        condominioId: morador.condominioId || null,
        moradorId, nome: morador.nome, unidade: morador.unidade,
        titulo: formOcorrencia.titulo.trim(),
        categoria: formOcorrencia.categoria,
        descricao: formOcorrencia.descricao.trim(),
        status: "aberta",
        respostaSindico: "",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        timestamp: Date.now(),
      });
      setFormOcorrencia({ titulo:"", categoria:"Manutenção", descricao:"" });
      setMsgOcorrencia("✅ Ocorrência registrada! O síndico irá avaliar.");
    } catch(e) {
      setMsgOcorrencia("Erro ao registrar. Tente novamente.");
    } finally {
      setEnviandoOcorrencia(false);
    }
  };

  const votarEnquete = async (enquete, opcao) => {
    if (enquete.status !== "aberta") return;
    try {
      await setDoc(doc(db, "votos", `${enquete.id}_${moradorId}`), {
        condominioId: morador.condominioId || null,
        enqueteId: enquete.id, moradorId, nome: morador.nome, unidade: morador.unidade,
        opcao, timestamp: Date.now(),
      });
    } catch(e) {}
  };

  if (!morador) return (
    <div style={{ minHeight:"100vh", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontFamily:D.fontBody }}>
      Carregando...
    </div>
  );  const cobMes    = cobrancas.find(c => c.mes === mesSel);
  const totalPago = cobrancas.filter(c => c.status === "pago").length;
  const meses     = [...new Set([mesAtual(), ...cobrancas.map(c => c.mes)])].sort().reverse();
  const statusCor = cobMes?.status === "pago" ? "#2E7D32" : cobMes?.status === "atrasado" ? "#B03A2E" : "#F57F17";

  // Taxa individual do morador (ou a padrão do condomínio)
  const taxaBase = (morador && morador.taxaCustom != null && !isNaN(morador.taxaCustom)) ? morador.taxaCustom : taxa;
  // Cálculo de encargos (mesma regra do sistema do síndico)
  const encargosPortal = (c) => {
    const semEnc = { valorBase: taxaBase, multa:0, juros:0, diasAtraso:0, valorTotal: taxaBase };
    if (!c || c.status !== "atrasado") return semEnc;
    if (!condoConfig?.cobrarMultaJuros) return semEnc;
    const dia = condoConfig.diaVencimento ?? 10;
    const [y,m] = c.mes.split("-").map(Number);
    const venc = new Date(y, m-1, dia); venc.setHours(0,0,0,0);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diasAtraso = Math.max(0, Math.floor((hoje - venc)/(1000*60*60*24)));
    if (diasAtraso <= 0) return semEnc;
    const multa = taxaBase * ((condoConfig.multaPercent ?? 2)/100);
    const juros = taxaBase * ((condoConfig.jurosPercentMes ?? 1)/100) * (diasAtraso/30);
    return { valorBase: taxaBase, multa, juros, diasAtraso, valorTotal: taxaBase + multa + juros };
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F0F4F8", fontFamily:D.fontBody }}>
      {/* Cabeçalho */}
      <div style={{ background:`linear-gradient(135deg, ${D.sidebar}, ${D.primary})`, padding: isMobile ? "24px 20px" : "32px 40px", color:"#fff" }}>
        <div style={{ fontSize:13, opacity:.7, marginBottom:6 }}>🏢 {morador.condominioNome || "Condomínio"}</div>
        <h1 style={{ fontFamily:D.fontDisplay, fontSize: isMobile?22:28, margin:"0 0 4px", fontWeight:700, letterSpacing:"-0.02em" }}>{morador.nome}</h1>
        <div style={{ fontSize:14, opacity:.85 }}>{morador.unidade}{morador.proprietario ? ` · Prop: ${morador.proprietario}` : ""}</div>
        {morador.email && <div style={{ fontSize:12, opacity:.7, marginTop:4 }}>📧 {morador.email}</div>}
      </div>

      <div style={{ padding: isMobile ? "20px 16px 40px" : "28px 40px 40px", maxWidth:640, margin:"0 auto" }}>

        {/* Situação do mês */}
        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#1E3A5F" }}>Situação do mês</span>
            <select value={mesSel} onChange={e=>setMesSel(e.target.value)} style={{ padding:"6px 10px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff" }}>
              {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          </div>
          {cobMes ? (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:D.muted, borderRadius:D.radius, padding:16, borderLeft:`4px solid ${statusCor}` }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:statusCor, textTransform:"capitalize" }}>{cobMes.status}</div>
                {(() => {
                  const enc = encargosPortal(cobMes);
                  if (enc.multa > 0 || enc.juros > 0) {
                    return (
                      <>
                        <div style={{ fontSize:13, color:"#6B7A8D", marginTop:4 }}>Taxa: R$ {enc.valorBase.toFixed(2).replace(".",",")} + multa R$ {enc.multa.toFixed(2).replace(".",",")} + juros R$ {enc.juros.toFixed(2).replace(".",",")} ({enc.diasAtraso} dias)</div>
                        <div style={{ fontSize:16, fontWeight:800, color:"#B03A2E", marginTop:4 }}>Total: R$ {enc.valorTotal.toFixed(2).replace(".",",")}</div>
                      </>
                    );
                  }
                  return <div style={{ fontSize:13, color:"#6B7A8D", marginTop:4 }}>Taxa: R$ {enc.valorBase.toFixed(2).replace(".",",")}</div>;
                })()}
                {cobMes.dataPagamento && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>Pago em {cobMes.dataPagamento}</div>}
                {cobMes.obs && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>📝 {cobMes.obs}</div>}
              </div>
              <div style={{ fontSize:40, opacity:.3 }}>{cobMes.status==="pago"?"✅":cobMes.status==="atrasado"?"🚨":"⏳"}</div>
            </div>
          ) : (
            <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:16 }}>Ainda não há cobranças lançadas para você neste mês.</div>
          )}
        </div>

        {/* Cobranças extras do morador */}
        {(() => {
          const extraPagaMor = (extraId) => pagExtrasMor.some(p => p.extraId === extraId && p.moradorId === moradorId);
          if (extrasMor.length === 0) return null;
          return (
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1E3A5F", marginBottom:14 }}>➕ Cobranças extras</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {extrasMor.map(extra => {
                  const pago = extraPagaMor(extra.id);
                  return (
                    <div key={extra.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background: pago?D.successBg:D.warningBg, borderRadius:D.radiusSm, borderLeft:`4px solid ${pago?D.success:D.warning}` }}>
                      <div>
                        <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:13 }}>{extra.descricao}</div>
                        <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>{mesLabel(extra.mes)}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:13, fontWeight:700, color: pago?D.success:"#B45309", textTransform:"capitalize" }}>{pago?"Pago":"Pendente"}</div>
                        <div style={{ fontSize:12, color:"#1E3A5F" }}>R$ {extra.valorUnitario.toFixed(2).replace(".",",")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Resumo geral */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
          {[
            { label:"Pagamentos em dia", valor: totalPago,                                         icon:"✅", cor:"#2E7D32" },
            { label:"Atrasados",         valor: cobrancas.filter(c=>c.status==="atrasado").length, icon:"🚨", cor:"#B03A2E" },
            { label:"Meses no sistema",  valor: cobrancas.length,                                  icon:"📋", cor:"#2E6DA4" },
          ].map((c,i) => (
            <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"14px 12px", boxShadow:D.shadow, border:`1px solid ${D.border}`, textAlign:"center", borderTop:`3px solid ${c.cor}` }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color:c.cor }}>{c.valor}</div>
              <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2, lineHeight:1.4 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Histórico */}
        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#1E3A5F", marginBottom:14 }}>📋 Histórico de pagamentos</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {cobrancas.map((c,i) => {
              const cor = c.status==="pago"?D.success:c.status==="atrasado"?D.danger:D.warning;
              const enc = encargosPortal(c);
              return (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background: c.status==="pago"?D.successBg:c.status==="atrasado"?D.dangerBg:D.warningBg, borderRadius:D.radiusSm, borderLeft:`4px solid ${cor}` }}>
                  <div>
                    <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:13 }}>{mesLabel(c.mes)}</div>
                    {c.dataPagamento && <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>Pago em {c.dataPagamento}</div>}
                    {(enc.multa > 0 || enc.juros > 0) && <div style={{ fontSize:11, color:"#B03A2E", marginTop:2 }}>+ multa/juros ({enc.diasAtraso}d)</div>}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:cor, textTransform:"capitalize" }}>{c.status}</div>
                    <div style={{ fontSize:12, color:"#1E3A5F" }}>R$ {enc.valorTotal.toFixed(2).replace(".",",")}</div>
                  </div>
                </div>
              );
            })}
            {cobrancas.length === 0 && <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:16 }}>Nenhum registro encontrado.</div>}
          </div>
        </div>

        {/* Comunicados do condomínio */}
        {comunicadosMor.length > 0 && (
          <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginTop:20 }}>
            <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:16, letterSpacing:"-0.02em" }}>📢 Comunicados</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {comunicadosMor.map(com => (
                <div key={com.id} style={{ background: com.fixado ? D.secondary : D.muted, borderRadius:D.radiusSm, padding:"14px 16px", borderLeft:`3px solid ${com.fixado ? D.accent : D.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    {com.fixado && <span style={{ background:D.bgCard, color:D.accent, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10, fontFamily:D.fontBody }}>📌 Fixado</span>}
                    <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{com.titulo}</span>
                  </div>
                  <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, lineHeight:1.6, margin:"0 0 6px", whiteSpace:"pre-wrap" }}>{com.mensagem}</p>
                  <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut }}>{com.data}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reservas */}
        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginTop:20 }}>
          <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:16, letterSpacing:"-0.02em" }}>📅 Reservar Churrasqueira</div>

          {/* Formulário */}
          <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16, padding:16, background:D.muted, borderRadius:D.radiusSm }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Área</label>
              <select value={formReserva.area} onChange={e=>setFormReserva(p=>({...p,area:e.target.value}))} style={{ display:"block", width:"100%", padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, background:"#fff", fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }}>
                <option value="Churrasqueira">🔥 Churrasqueira</option>
                <option value="Salão de Festas">🎉 Salão de Festas</option>
                <option value="Espaço Gourmet">🍽️ Espaço Gourmet</option>
              </select>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Data *</label>
                <input type="date" value={formReserva.data} onChange={e=>setFormReserva(p=>({...p,data:e.target.value}))} min={new Date().toISOString().split("T")[0]} style={{ display:"block", width:"100%", padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Horário *</label>
                <input value={formReserva.horario} onChange={e=>setFormReserva(p=>({...p,horario:e.target.value}))} placeholder="Ex: 14h às 22h" style={{ display:"block", width:"100%", padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Observação</label>
              <input value={formReserva.observacao} onChange={e=>setFormReserva(p=>({...p,observacao:e.target.value}))} placeholder="Nº de pessoas, ocasião..." style={{ display:"block", width:"100%", padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
            </div>
            {msgReserva && <div style={{ fontSize:12, color: msgReserva.startsWith("✅") ? D.success : D.danger, fontFamily:D.fontBody, fontWeight:500 }}>{msgReserva}</div>}
            <button onClick={fazerReserva} disabled={enviandoReserva} style={{ padding:"10px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: enviandoReserva?"default":"pointer", fontFamily:D.fontBody, opacity: enviandoReserva?.7:1 }}>
              {enviandoReserva ? "Enviando..." : "📅 Solicitar Reserva"}
            </button>
          </div>

          {/* Minhas reservas */}
          {reservasMor.length > 0 && (
            <div>
              <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Minhas reservas</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {reservasMor.map((r,i) => {
                  const cor = r.status==="aprovada"?D.success:r.status==="rejeitada"?D.danger:D.warning;
                  const bg  = r.status==="aprovada"?D.successBg:r.status==="rejeitada"?D.dangerBg:D.warningBg;
                  return (
                    <div key={i} style={{ background:bg, borderRadius:D.radiusSm, padding:"12px 14px", borderLeft:`3px solid ${cor}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>🔥 {r.area}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{r.data} · {r.horario}</div>
                        </div>
                        <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:cor, textTransform:"capitalize" }}>
                          {r.status==="aprovada"?"✅ Aprovada":r.status==="rejeitada"?"❌ Rejeitada":"⏳ Pendente"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ocorrências / Reclamações */}
        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginTop:20 }}>
          <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>🛎️ Abrir ocorrência</div>
          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginBottom:16 }}>Relate um problema ou solicitação ao síndico (vazamento, barulho, manutenção, etc.).</div>

          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Título *</label>
          <input value={formOcorrencia.titulo} onChange={e=>setFormOcorrencia(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Vazamento na garagem" style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, marginBottom:14 }} />

          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Categoria</label>
          <select value={formOcorrencia.categoria} onChange={e=>setFormOcorrencia(p=>({...p,categoria:e.target.value}))} style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text, marginBottom:14 }}>
            <option>Manutenção</option>
            <option>Barulho / Perturbação</option>
            <option>Limpeza</option>
            <option>Segurança</option>
            <option>Área comum</option>
            <option>Outra</option>
          </select>

          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição *</label>
          <textarea value={formOcorrencia.descricao} onChange={e=>setFormOcorrencia(p=>({...p,descricao:e.target.value}))} rows={3} placeholder="Descreva o que está acontecendo..." style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical", lineHeight:1.5, marginBottom:14 }} />

          {msgOcorrencia && <div style={{ fontFamily:D.fontBody, fontSize:13, color: msgOcorrencia.startsWith("✅")?D.success:D.danger, marginBottom:12 }}>{msgOcorrencia}</div>}

          <button onClick={abrirOcorrencia} disabled={enviandoOcorrencia} style={{ width:"100%", padding:"12px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:700, cursor: enviandoOcorrencia?"default":"pointer", opacity: enviandoOcorrencia?.7:1, fontFamily:D.fontBody }}>
            {enviandoOcorrencia ? "Enviando..." : "🛎️ Registrar ocorrência"}
          </button>

          {/* Minhas ocorrências */}
          {ocorrenciasMor.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Minhas ocorrências</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {ocorrenciasMor.map((o,i) => {
                  const cor = o.status==="resolvida"?D.success:o.status==="em_andamento"?D.accent:D.warning;
                  const bg  = o.status==="resolvida"?D.successBg:o.status==="em_andamento"?D.secondary:D.warningBg;
                  const rotulo = o.status==="resolvida"?"✅ Resolvida":o.status==="em_andamento"?"🔧 Em andamento":"🕒 Aberta";
                  return (
                    <div key={i} style={{ background:bg, borderRadius:D.radiusSm, padding:"12px 14px", borderLeft:`3px solid ${cor}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{o.titulo}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{o.categoria} · {o.criadoEm}</div>
                        </div>
                        <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:cor, whiteSpace:"nowrap" }}>{rotulo}</span>
                      </div>
                      {o.respostaSindico && (
                        <div style={{ marginTop:8, background:"#fff", borderRadius:D.radiusSm, padding:"8px 10px", fontFamily:D.fontBody, fontSize:12, color:D.text }}>
                          <b>Resposta do síndico:</b> {o.respostaSindico}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Enquetes / Votações */}
        {enquetesMor.length > 0 && (
          <div style={{ background:D.bgCard, borderRadius:D.radius, padding:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginTop:20 }}>
            <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>🗳️ Enquetes</div>
            <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginBottom:16 }}>Participe das votações do condomínio.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {enquetesMor.map(enq => {
                const meuVoto = votosMor.find(v => v.enqueteId === enq.id);
                const aberta = enq.status === "aberta";
                return (
                  <div key={enq.id} style={{ border:`1px solid ${D.border}`, borderRadius:D.radius, padding:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap" }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text }}>{enq.titulo}</div>
                        {enq.descricao && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{enq.descricao}</div>}
                      </div>
                      <span style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:600, color: aberta?D.success:D.textSec, background: aberta?D.successBg:D.muted, padding:"3px 10px", borderRadius:10, whiteSpace:"nowrap" }}>{aberta?"Aberta":"Encerrada"}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:14 }}>
                      {enq.opcoes.map((op,idx) => {
                        const escolhida = meuVoto?.opcao === op;
                        return (
                          <button key={idx} onClick={() => aberta && votarEnquete(enq, op)} disabled={!aberta} style={{
                            display:"flex", justifyContent:"space-between", alignItems:"center",
                            padding:"12px 14px", borderRadius:D.radiusSm, cursor: aberta?"pointer":"default",
                            border:`1.5px solid ${escolhida?D.primary:D.border}`,
                            background: escolhida?D.secondary:"#fff",
                            fontFamily:D.fontBody, fontSize:14, color:D.text, fontWeight: escolhida?600:400, textAlign:"left",
                          }}>
                            <span>{op}</span>
                            {escolhida && <span style={{ color:D.primary, fontWeight:700 }}>✓ Seu voto</span>}
                          </button>
                        );
                      })}
                    </div>
                    {aberta
                      ? <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:8 }}>{meuVoto ? "Você pode trocar seu voto enquanto estiver aberta." : "Toque em uma opção para votar."}</div>
                      : <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:8 }}>Votação encerrada.{meuVoto?` Seu voto: ${meuVoto.opcao}.`:" Você não votou."}</div>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [user, setUser]             = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authView, setAuthView]     = useState("landing"); // "landing" | "login" | "cadastro"
  const [condominioId, setCondominioId] = useState(null);
  const [condominio, setCondominio]   = useState(null); // { nome, plano, numApartamentos, ... }
  const [condCarregado, setCondCarregado] = useState(false);
  const [aba, setAba]               = useState("dashboard");
  const [moradores, setMoradores]   = useState([]);
  const [cobrancas, setCobrancas]   = useState([]);
  const [taxa, setTaxa]             = useState(180);
  const [diaVencimento, setDiaVencimento] = useState(10);
  const [cobrarMultaJuros, setCobrarMultaJuros] = useState(false);
  const [multaPercent, setMultaPercent]         = useState(2);
  const [jurosPercentMes, setJurosPercentMes]   = useState(1);
  const [marcoZero, setMarcoZero]               = useState(null);
  const [enviandoEmails, setEnviandoEmails] = useState(false);
  const [mesSel, setMesSel]         = useState(mesAtual);
  const [toast, setToast]           = useState(null);
  const [modal, setModal]           = useState(null);
  const [novoMorador, setNovoMorador] = useState({ nome:"", unidade:"", proprietario:"", email:"", telefone:"", tipo:"Proprietário", veiculos:"", pets:"", taxaCustom:"" });
  const [editMorador, setEditMorador] = useState(null); // { id, nome, unidade, email, telefone }
  const [pagForm, setPagForm]         = useState({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
  const [despesas, setDespesas]       = useState([]);
  const [novaDespesa, setNovaDespesa] = useState({ tipo:"agua", descricao:"", valor:"", mes: mesAtual(), arquivo:null, arquivoNome:"", recorrente:false });
  const [servicos, setServicos]       = useState([]);
  const [novoServico, setNovoServico] = useState({ titulo:"", descricao:"" });
  const [concluirForm, setConcluirForm] = useState({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" });
  const [obsMes, setObsMes]     = useState("");
  const [obsSalva, setObsSalva] = useState("");
  const [logs, setLogs]         = useState([]);
  const [acessos, setAcessos]   = useState([]);
  const [novoAcesso, setNovoAcesso] = useState({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" });
  const [reservas, setReservas] = useState([]);
  const [novaReserva, setNovaReserva] = useState({ area:"Churrasqueira", data:"", horario:"", observacao:"" });
  const [comunicados, setComunicados] = useState([]);
  const [novoComunicado, setNovoComunicado] = useState({ titulo:"", mensagem:"", fixado:false });
  const [documentos, setDocumentos] = useState([]);
  const [novoDocumento, setNovoDocumento] = useState({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"" });
  const [fundoMovs, setFundoMovs] = useState([]);
  const [novaMovFundo, setNovaMovFundo] = useState({ tipo:"aporte", valor:"", descricao:"", data:"" });
  const [cobrancasExtras, setCobrancasExtras] = useState([]);
  const [pagExtras, setPagExtras] = useState([]);
  const [novaCobExtra, setNovaCobExtra] = useState({ descricao:"", modo:"unidade", valor:"", mes: mesAtual() });
  const [receitas, setReceitas] = useState([]);
  const [novaReceita, setNovaReceita] = useState({ descricao:"", valor:"", categoria:"Outra", mes: mesAtual() });
  const [ocorrencias, setOcorrencias] = useState([]);
  const [filtroOcorrencia, setFiltroOcorrencia] = useState("todas");
  const [respostaOcorr, setRespostaOcorr] = useState("");
  const [enquetes, setEnquetes] = useState([]);
  const [votos, setVotos] = useState([]);
  const [novaEnquete, setNovaEnquete] = useState({ titulo:"", descricao:"", opcoes:["",""] });
  const [entregas, setEntregas] = useState([]);
  const [novaEntrega, setNovaEntrega] = useState({ moradorId:"", remetente:"", descricao:"", obs:"" });
  const [eventos, setEventos] = useState([]);
  const [novoEvento, setNovoEvento] = useState({ titulo:"", tipo:"Evento", data:"", hora:"", descricao:"" });
  const fileRef        = useRef();
  const fileRefDespesa = useRef();

  // ── Autenticação ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u && (modoVisitante || portalMoradorId)) {
        try { await signInWithEmailAndPassword(auth, VISITANTE_EMAIL, VISITANTE_SENHA); }
        catch (e) { setAuthChecked(true); }
        return;
      }
      setUser(u); setAuthChecked(true);
    });
    return unsub;
  }, []);

  const readOnly = user?.email === VISITANTE_EMAIL;

  // ── Status da assinatura (Fase 4a) ──
  // Retorna { estado, diasRestantes } onde estado ∈ 'cortesia'|'ativo'|'trial'|'expirado'
  const infoAssinatura = (() => {
    if (!condominio) return { estado:"trial", diasRestantes:0 };
    // Plano cortesia (ex: Vila Real) nunca expira
    if (condominio.plano === "cortesia") return { estado:"cortesia", diasRestantes:null };
    // Assinatura ativa (pagante)
    if (condominio.statusAssinatura === "ativo") return { estado:"ativo", diasRestantes:null };
    // Bloqueio manual
    if (condominio.statusAssinatura === "bloqueado") return { estado:"expirado", diasRestantes:0 };
    // Trial: calcula dias restantes a partir de trialAte (formato dd/mm/aaaa)
    if (condominio.trialAte) {
      const [d,m,a] = condominio.trialAte.split("/").map(Number);
      const fim = new Date(a, m-1, d, 23, 59, 59);
      const hoje = new Date();
      const diff = Math.ceil((fim - hoje) / (1000*60*60*24));
      if (diff < 0) return { estado:"expirado", diasRestantes:0 };
      return { estado:"trial", diasRestantes:diff };
    }
    return { estado:"trial", diasRestantes:0 };
  })();

  // Plano efetivo do condomínio (cortesia/basico/padrao/avancado)
  const planoAtual = condominio?.plano || "basico";
  // Atalho: este condomínio tem acesso a tal recurso?
  const podeUsar = (recurso) => temAcesso(planoAtual, recurso);

  // ── Carregar o condomínio vinculado ao usuário (multi-tenant) ──
  useEffect(() => {
    if (!user) { setCondCarregado(false); return; }

    // Modo visitante/morador: o condomínio vem do parâmetro ?cond= da URL
    if (readOnly && condParam) {
      setCondominioId(condParam);
      getDoc(doc(db, "condominios", condParam)).then(snap => {
        if (snap.exists()) setCondominio({ id:snap.id, ...snap.data() });
        setCondCarregado(true);
      }).catch(() => setCondCarregado(true));
      return;
    }

    // Síndico: busca o vínculo usuario → condominioId (com retry para contas recém-criadas)
    (async () => {
      const buscarVinculo = async (tentativas = 5) => {
        for (let i = 0; i < tentativas; i++) {
          try {
            const uSnap = await getDoc(doc(db, "usuarios", user.uid));
            if (uSnap.exists() && uSnap.data().condominioId) {
              const cId = uSnap.data().condominioId;
              setCondominioId(cId);
              const cSnap = await getDoc(doc(db, "condominios", cId));
              if (cSnap.exists()) setCondominio({ id:cSnap.id, ...cSnap.data() });
              return true;
            }
          } catch (e) {
            console.error("Erro ao carregar condomínio:", e);
          }
          // Aguarda antes de tentar de novo (conta recém-criada pode não ter propagado)
          if (i < tentativas - 1) await new Promise(r => setTimeout(r, 800));
        }
        return false;
      };

      const achou = await buscarVinculo();
      if (!achou) { setCondominioId(null); setCondominio(null); }
      setCondCarregado(true);
    })();
  }, [user, readOnly]);

  // ── Firestore listeners (filtrados por condomínio) ──
  useEffect(() => {
    if (!user || !condominioId) return;
    const byCond = (col) => query(collection(db, col), where("condominioId", "==", condominioId));

    const u1 = onSnapshot(byCond("moradores"), s => setMoradores(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u2 = onSnapshot(byCond("cobrancas"), s => setCobrancas(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u4 = onSnapshot(byCond("despesas"),  s => setDespesas(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u5 = onSnapshot(byCond("servicos"),  s => setServicos(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u7 = onSnapshot(byCond("logs"),      s => setLogs(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u8 = onSnapshot(byCond("acessos"),   s => setAcessos(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u9 = onSnapshot(byCond("reservas"),  s => setReservas(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u10 = onSnapshot(byCond("comunicados"), s => setComunicados(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (b.fixado?1:0)-(a.fixado?1:0) || b.timestamp - a.timestamp)));
    const u11 = onSnapshot(byCond("documentos"), s => setDocumentos(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u12 = onSnapshot(byCond("fundo_movs"), s => setFundoMovs(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u13 = onSnapshot(byCond("entregas"), s => setEntregas(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u14 = onSnapshot(byCond("eventos"), s => setEventos(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u15 = onSnapshot(byCond("cobrancas_extras"), s => setCobrancasExtras(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u16 = onSnapshot(byCond("pag_extras"), s => setPagExtras(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u17 = onSnapshot(byCond("receitas"), s => setReceitas(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u18 = onSnapshot(byCond("ocorrencias"), s => setOcorrencias(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u19 = onSnapshot(byCond("enquetes"), s => setEnquetes(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp)));
    const u20 = onSnapshot(byCond("votos"), s => setVotos(s.docs.map(d => ({ id:d.id, ...d.data() }))));

    // Config (taxa/dia de vencimento) vem do próprio documento do condomínio
    const u3 = onSnapshot(doc(db, "condominios", condominioId), d => {
      if (d.exists()) {
        const data = d.data();
        setCondominio({ id:d.id, ...data });
        setTaxa(data.taxa ?? 180);
        setDiaVencimento(data.diaVencimento ?? 10);
        setCobrarMultaJuros(data.cobrarMultaJuros ?? false);
        setMultaPercent(data.multaPercent ?? 2);
        setJurosPercentMes(data.jurosPercentMes ?? 1);
        setMarcoZero(data.marcoZero ?? null);
      }
    });
    // Observações: doc com id composto condominioId_mes
    const u6 = onSnapshot(doc(db, "observacoes", `${condominioId}_${mesSel}`), d => {
      const texto = d.exists() ? (d.data().texto || "") : "";
      setObsMes(texto); setObsSalva(texto);
    });

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); u11(); u12(); u13(); u14(); u15(); u16(); u17(); u18(); u19(); u20(); };
  }, [user, condominioId, mesSel]);

  // (Removido o auto-popular com MOCK_MORADORES — no multi-tenant cada
  //  condomínio cadastra seus próprios moradores via a página de setup.)


  const showToast = (msg, type="success") => setToast({ msg, type });

  const registrarLog = async (icone, descricao) => {
    try {
      await addDoc(collection(db, "logs"), {
        condominioId,
        icone,
        descricao,
        usuario: user?.email || "sistema",
        timestamp: Date.now(),
        dataHora: new Date().toLocaleString("pt-BR"),
      });
    } catch(e) { console.error("Erro ao registrar log:", e); }
  };

  const cobMes = cobrancas.filter(c => c.mes === mesSel);
  const pagos      = cobMes.filter(c => c.status === "pago").length;
  const pendentes  = cobMes.filter(c => c.status === "pendente").length;
  const atrasados  = cobMes.filter(c => c.status === "atrasado").length;
  const nPagos     = pendentes + atrasados;

  // Taxa individual do morador (taxaCustom) ou a taxa padrão do condomínio
  const taxaDoMorador = (moradorId) => {
    const m = moradores.find(x => x.id === moradorId);
    return (m && m.taxaCustom != null && !isNaN(m.taxaCustom)) ? m.taxaCustom : taxa;
  };
  // Soma o valor de um conjunto de cobranças respeitando a taxa de cada morador
  const somaCobrancas = (lista) => lista.reduce((s,c) => s + taxaDoMorador(c.moradorId), 0);

  // ── Multa e juros por atraso ──
  // Retorna { valorBase, multa, juros, diasAtraso, valorTotal }.
  // Só aplica encargos se: o plano permite, o síndico ativou, e a cobrança está atrasada.
  const encargosCobranca = (cob) => {
    const valorBase = taxaDoMorador(cob.moradorId);
    const semEncargos = { valorBase, multa:0, juros:0, diasAtraso:0, valorTotal: valorBase };
    if (!cob || cob.status !== "atrasado") return semEncargos;
    if (!podeUsar("multaJuros") || !cobrarMultaJuros) return semEncargos;
    const venc = dataVencimentoMes(cob.mes); venc.setHours(0,0,0,0);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diasAtraso = Math.max(0, Math.floor((hoje - venc) / (1000*60*60*24)));
    if (diasAtraso <= 0) return semEncargos;
    const multa = valorBase * (multaPercent/100);                       // multa única
    const juros = valorBase * (jurosPercentMes/100) * (diasAtraso/30);  // juros proporcional aos dias
    const valorTotal = valorBase + multa + juros;
    return { valorBase, multa, juros, diasAtraso, valorTotal };
  };

  // Categorias de despesa (ícone + rótulo)
  const CATS_DESPESA = {
    agua:{icon:"💧",label:"Água"}, luz:{icon:"⚡",label:"Luz"}, limpeza:{icon:"🧹",label:"Limpeza"},
    portaria:{icon:"🛡️",label:"Portaria / Segurança"}, elevador:{icon:"🛗",label:"Elevador"},
    jardinagem:{icon:"🌳",label:"Jardinagem"}, salario:{icon:"👷",label:"Zelador / Salário"},
    internet:{icon:"🌐",label:"Internet / Telefone"}, manutencao:{icon:"🔧",label:"Manutenção"},
    material:{icon:"📦",label:"Material"}, impostos:{icon:"🧾",label:"Impostos / Taxas"},
    outro:{icon:"📌",label:"Outra despesa"},
  };
  const despCat = (tipo) => CATS_DESPESA[tipo] || CATS_DESPESA.outro;

  // ── Exportação CSV (abre no Excel / Google Sheets) ──
  const exportarCSV = (nomeArquivo, colunas, linhas) => {
    // Escapa cada célula: usa ; como separador (padrão Excel BR) e aspas quando necessário
    const escapa = (v) => {
      const s = v == null ? "" : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const linhasCSV = [colunas, ...linhas].map(l => l.map(escapa).join(";"));
    // BOM (\uFEFF) garante que acentos apareçam certo no Excel
    const conteudo = "\uFEFF" + linhasCSV.join("\r\n");
    const blob = new Blob([conteudo], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Arquivo CSV baixado!");
  };

  const exportarMoradoresCSV = () => {
    const colunas = ["Unidade","Nome","Tipo","E-mail","Telefone","Veículos","Pets","Taxa individual"];
    const linhas = [...moradores]
      .sort((a,b) => (a.unidade||"").localeCompare(b.unidade||""))
      .map(m => [
        m.unidade||"", m.nome||"", m.tipo||"", m.email||"", m.telefone||"",
        m.veiculos||"", m.pets||"",
        m.taxaCustom != null ? `R$ ${Number(m.taxaCustom).toFixed(2).replace(".",",")}` : "(padrão)",
      ]);
    exportarCSV(`moradores_${condominio?.nome||"condominio"}`.replace(/\s+/g,"_"), colunas, linhas);
  };

  const exportarCobrancasCSV = () => {
    const colunas = ["Unidade","Morador","Mês","Valor base","Multa","Juros","Valor total","Status","Data pagamento"];
    const linhas = cobMes.map(cob => {
      const m = moradores.find(x => x.id === cob.moradorId);
      if (!m) return null;
      const enc = encargosCobranca(cob);
      return [
        m.unidade||"", m.nome||"", cob.mes||"",
        `R$ ${enc.valorBase.toFixed(2).replace(".",",")}`,
        `R$ ${enc.multa.toFixed(2).replace(".",",")}`,
        `R$ ${enc.juros.toFixed(2).replace(".",",")}`,
        `R$ ${enc.valorTotal.toFixed(2).replace(".",",")}`,
        cob.status||"", cob.dataPagamento||"",
      ];
    }).filter(Boolean);
    exportarCSV(`cobrancas_${mesSel}`, colunas, linhas);
  };

  const exportarDespesasCSV = () => {
    const colunas = ["Mês","Categoria","Descrição","Valor","Status","Recorrente"];
    const linhas = despesas
      .filter(d => d.mes === mesSel)
      .map(d => [
        d.mes||"", despCat(d.tipo).label, d.descricao||"",
        `R$ ${(d.valor||0).toFixed(2).replace(".",",")}`,
        d.status||"", d.recorrente ? "Sim" : "Não",
      ]);
    exportarCSV(`despesas_${mesSel}`, colunas, linhas);
  };

  const totalArrecadado = somaCobrancas(cobMes.filter(c => c.status === "pago"));
  const totalPendente   = somaCobrancas(cobMes.filter(c => c.status !== "pago"));

  const totalEntradas        = somaCobrancas(cobrancas.filter(c => c.status === "pago"));
  const totalSaidasDespesas  = despesas.filter(d => d.status === "pago").reduce((s,d) => s+(d.valor||0), 0);
  const totalSaidasServicos  = servicos.filter(s => s.status === "concluido").reduce((s,sv) => s+(sv.valorMaterial||0)+(sv.valorMaoDeObra||0), 0);
  const saldoCaixa = totalEntradas - totalSaidasDespesas - totalSaidasServicos;

  const garantirMes = async (mes) => {
    if (!condominioId) return;
    // Não gera cobranças para meses anteriores ao início da cobrança (marco zero)
    const mesInicio = marcoZero ? marcoZero.slice(0,7) : null; // ex: "2026-08"
    if (mesInicio && mes < mesInicio) return;
    const existentes = new Set(cobrancas.filter(c => c.mes === mes).map(c => c.moradorId));
    const batch = writeBatch(db); let mudou = false;
    moradores.forEach(m => {
      if (!existentes.has(m.id)) { batch.set(doc(db, "cobrancas", `${condominioId}_${m.id}_${mes}`), { condominioId, moradorId:m.id, mes, status:"pendente", comprovante:null, dataPagamento:null, obs:"" }); mudou=true; }
    });
    if (mudou) await batch.commit();
  };

  // ── Marcar vencidas como "atrasado" e corrigir as anteriores ao marco zero ──
  const atualizarAtrasados = async () => {
    if (!condominioId) return;
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const mz = marcoZero ? new Date(marcoZero + "T00:00:00") : null;
    const batch = writeBatch(db);
    let mudou = false;
    cobrancas.forEach(c => {
      if (c.status === "pago") return;
      const venc = dataVencimentoMes(c.mes);
      venc.setHours(0,0,0,0);
      const antesDoMarco = mz && venc < mz; // venceu antes do início da contagem
      const ref = doc(db, "cobrancas", c.id);
      if (antesDoMarco) {
        // Antes do marco zero não conta como atraso: garante "pendente"
        if (c.status === "atrasado") { batch.set(ref, { status:"pendente" }, { merge:true }); mudou = true; }
      } else if (c.status === "pendente" && hoje > venc) {
        // A partir do marco zero, marca atraso normalmente
        batch.set(ref, { status:"atrasado" }, { merge:true }); mudou = true;
      }
    });
    if (mudou) await batch.commit();
  };

  // ── Zerar atrasos: este mês limpo, contagem começa no mês que vem ──
  const zerarAtrasados = async () => {
    if (!condominioId) return;
    const hoje = new Date();
    const proxMesData = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1);
    const marcoStr = `${proxMesData.getFullYear()}-${String(proxMesData.getMonth()+1).padStart(2,"0")}-01`;
    const proxMesYM = `${proxMesData.getFullYear()}-${String(proxMesData.getMonth()+1).padStart(2,"0")}`;
    const mesAtualYM = mesAtual();
    // 1. Define o marco zero (NÃO altera o dia de vencimento)
    try { await setDoc(doc(db, "condominios", condominioId), { marcoZero: marcoStr }, { merge:true }); } catch(e) {}
    const mesInicio = marcoStr.slice(0,7); // ex: "2026-08" — 1º mês que será cobrado
    // 2. Remove cobranças NÃO pagas de meses anteriores ao início (junho, julho, etc.)
    let removidas = 0;
    for (const c of cobrancas) {
      if (c.mes < mesInicio && c.status !== "pago") {
        try { await deleteDoc(doc(db, "cobrancas", c.id)); removidas++; } catch(e) {}
      }
    }
    // 3. Qualquer atrasado remanescente (de agosto em diante, se houver) volta a pendente
    let n = 0;
    for (const c of cobrancas) {
      if (c.mes >= mesInicio && c.status === "atrasado") {
        try { await setDoc(doc(db, "cobrancas", c.id), { status:"pendente" }, { merge:true }); n++; } catch(e) {}
      }
    }
    // 4. Observação do mês atual
    try {
      await setDoc(doc(db, "observacoes", `${condominioId}_${mesAtualYM}`), {
        condominioId, mes: mesAtualYM,
        texto: `Início de operação: as cobranças começam em ${mesLabel(proxMesYM)}. Meses anteriores não são cobrados.`,
        atualizadoEm: new Date().toLocaleString("pt-BR"),
      }, { merge:true });
    } catch(e) {}
    registrarLog("🔄", `Cobranças anteriores removidas (${removidas}) — cobrança inicia em ${mesLabel(proxMesYM)}`);
    showToast(`Pronto! ${removidas} cobrança(s) anterior(es) removida(s). A cobrança começa em ${mesLabel(proxMesYM)}.`);
  };

  useEffect(() => {
    if (user && condominioId && moradores.length > 0) {
      garantirMes(mesSel);
      atualizarAtrasados();
    }
  }, [user, condominioId, moradores.length, cobrancas.length, diaVencimento, marcoZero]);

  const mudarMes = async (m) => {
    setMesSel(m);
    garantirMes(m);
    const snap = await getDoc(doc(db, "observacoes", `${condominioId}_${m}`));
    const texto = snap.exists() ? (snap.data().texto || "") : "";
    setObsMes(texto);
    setObsSalva(texto);
  };

  // ── Pagamentos ──
  // ── Gerar recibo de pagamento em PDF ──
  const gerarReciboPDF = (morador, dataPagamento, obs) => {
    const docPdf  = new jsPDF();
    const AZUL    = [30, 58, 95];
    const DOURADO = [201, 147, 58];
    const numRecibo = `${mesSel.replace("-","")}-${morador.id?.slice(0,6).toUpperCase() || "000000"}`;

    // Cabeçalho
    docPdf.setFillColor(...AZUL);
    docPdf.rect(0, 0, 210, 38, "F");
    docPdf.setTextColor(255,255,255);
    docPdf.setFontSize(18);
    docPdf.setFont("helvetica","bold");
    docPdf.text("Condomínio Vila Real 140", 14, 16);
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica","normal");
    docPdf.text("Recibo de Pagamento de Taxa Condominial", 14, 26);
    docPdf.setTextColor(...DOURADO);
    docPdf.text(`Nº ${numRecibo}`, 14, 33);

    // Corpo
    docPdf.setTextColor(30,30,30);
    let y = 52;
    docPdf.setFontSize(11);
    docPdf.setFont("helvetica","bold");
    docPdf.text("DADOS DO MORADOR", 14, y); y += 7;
    docPdf.setDrawColor(201,147,58);
    docPdf.setLineWidth(0.5);
    docPdf.line(14, y, 196, y); y += 8;

    const campos = [
      ["Nome",             morador.nome],
      ["Unidade",          morador.unidade],
      ["E-mail",           morador.email],
      ["Telefone",         morador.telefone || "—"],
    ];
    docPdf.setFont("helvetica","normal");
    docPdf.setFontSize(10);
    campos.forEach(([label, valor]) => {
      docPdf.setFont("helvetica","bold");   docPdf.text(`${label}:`, 14, y);
      docPdf.setFont("helvetica","normal"); docPdf.text(valor, 60, y);
      y += 8;
    });

    y += 6;
    docPdf.setFont("helvetica","bold");
    docPdf.setFontSize(11);
    docPdf.text("DADOS DO PAGAMENTO", 14, y); y += 7;
    docPdf.line(14, y, 196, y); y += 8;

    const pagCampos = [
      ["Referência",       mesLabelEmail(mesSel)],
      ["Valor pago",       `R$ ${taxa.toFixed(2).replace(".",",")}`],
      ["Data do pagamento",dataPagamento],
      ["Vencimento",       formatarDataBR(dataVencimentoMes(mesSel))],
      ["Observação",       obs || "—"],
    ];
    docPdf.setFontSize(10);
    pagCampos.forEach(([label, valor]) => {
      docPdf.setFont("helvetica","bold");   docPdf.text(`${label}:`, 14, y);
      docPdf.setFont("helvetica","normal"); docPdf.text(String(valor), 60, y);
      y += 8;
    });

    // Destaque do valor
    y += 6;
    docPdf.setFillColor(232,245,233);
    docPdf.roundedRect(14, y, 182, 18, 3, 3, "F");
    docPdf.setTextColor(46,125,50);
    docPdf.setFont("helvetica","bold");
    docPdf.setFontSize(13);
    docPdf.text(`Pagamento confirmado: R$ ${taxa.toFixed(2).replace(".",",")}`, 20, y+12);

    // Rodapé
    y += 36;
    docPdf.setTextColor(107,122,141);
    docPdf.setFont("helvetica","normal");
    docPdf.setFontSize(9);
    docPdf.line(14, y, 196, y); y += 6;
    docPdf.text(`Documento gerado automaticamente em ${new Date().toLocaleString("pt-BR")}`, 14, y); y += 5;
    docPdf.text("Condomínio Vila Real 140 — Sistema de Gestão Condominial", 14, y);

    docPdf.save(`recibo-${morador.unidade.replace(/\s/g,"-")}-${mesSel}.pdf`);
  };

  const registrarPagamento = (moradorId) => {
    const morador = moradores.find(m => m.id === moradorId);
    const dataPgto = new Date().toLocaleDateString("pt-BR");
    const salvar = async (base64="") => {
      await setDoc(doc(db, "cobrancas", `${condominioId}_${moradorId}_${mesSel}`), { condominioId, moradorId, mes:mesSel, status:"pago", dataPagamento:dataPgto, obs:pagForm.obs, comprovante:base64, arquivoNome:pagForm.arquivoNome }, { merge:true });
      setModal(null); setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
      showToast("Pagamento registrado! Recibo e e-mail enviados.");
      if (morador) {
        gerarReciboPDF(morador, dataPgto, pagForm.obs);
        registrarLog("✅", `Pagamento registrado: ${morador.nome} (${morador.unidade}) — ${mesLabel(mesSel)} — R$ ${taxa.toFixed(2).replace(".",",")}`);
        // Envia e-mail de confirmação
        try {
          await emailjs.send(EJS_SERVICE, EJS_TEMPLATE_CONFIRMACAO, {
            email_destino:  morador.email,
            nome_morador:   morador.nome,
            unidade:        morador.unidade,
            mes_referencia: mesLabelEmail(mesSel),
            valor:          taxa.toFixed(2).replace(".",","),
            data_pagamento: dataPgto,
            obs:            pagForm.obs ? `Observação: ${pagForm.obs}` : "",
            nome_condominio: condominio?.nome || "Condomínio",
          });
        } catch(e) {
          console.error("Erro ao enviar e-mail de confirmação:", e);
        }
      }
    };
    if (pagForm.arquivo) { const r=new FileReader(); r.onload=e=>salvar(e.target.result); r.readAsDataURL(pagForm.arquivo); } else salvar();
  };

  const estornarPagamento = async (moradorId) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const venc = dataVencimentoMes(mesSel); venc.setHours(0,0,0,0);
    const novoStatus = hoje > venc ? "atrasado" : "pendente";
    await setDoc(doc(db, "cobrancas", `${condominioId}_${moradorId}_${mesSel}`), { condominioId, moradorId, mes:mesSel, status:novoStatus, dataPagamento:null, obs:"", comprovante:null, arquivoNome:"" }, { merge:true });
    const m = moradores.find(x => x.id === moradorId);
    registrarLog("↩️", `Pagamento estornado: ${m?.nome || moradorId} (${m?.unidade || ""}) — ${mesLabel(mesSel)}`);
    setModal(null); showToast("Pagamento estornado.", "error");
  };

  // ── Moradores ──
  const adicionarMorador = async () => {
    if (!novoMorador.nome || !novoMorador.unidade || !novoMorador.email) { showToast("Preencha nome, unidade e e-mail.", "error"); return; }
    // taxaCustom: número se preenchido, null se vazio (usa a taxa padrão)
    const taxaCustom = novoMorador.taxaCustom !== "" && !isNaN(parseFloat(novoMorador.taxaCustom))
      ? parseFloat(novoMorador.taxaCustom) : null;
    const dados = { ...novoMorador, taxaCustom, condominioId };
    const ref = await addDoc(collection(db, "moradores"), dados);
    await setDoc(doc(db, "cobrancas", `${condominioId}_${ref.id}_${mesSel}`), { condominioId, moradorId:ref.id, mes:mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
    registrarLog("👤", `Morador cadastrado: ${novoMorador.nome} (${novoMorador.unidade})`);
    setNovoMorador({ nome:"", unidade:"", proprietario:"", email:"", telefone:"", tipo:"Proprietário", veiculos:"", pets:"", taxaCustom:"" }); setModal(null); showToast("Morador cadastrado!");
  };

  const removerMorador = async (id) => {
    await deleteDoc(doc(db, "moradores", id));
    const snap = await getDocs(query(collection(db, "cobrancas"), where("moradorId","==",id)));
    const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    registrarLog("🗑️", `Morador removido: ID ${id}`);
    showToast("Morador removido.", "error");
  };

  // Busca do topo: vai para a aba Moradores e abre o histórico do morador
  const abrirMoradorBusca = (m) => {
    setAba("moradores");
    setModal({ type:"historico", data:m });
  };

  const salvarEdicaoMorador = async () => {
    if (!editMorador.nome || !editMorador.unidade || !editMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const { id, ...dados } = editMorador;
    // Converte taxaCustom (string do input) para número ou null
    dados.taxaCustom = (dados.taxaCustom !== "" && dados.taxaCustom != null && !isNaN(parseFloat(dados.taxaCustom)))
      ? parseFloat(dados.taxaCustom) : null;
    await setDoc(doc(db, "moradores", id), dados, { merge:true });
    registrarLog("✏️", `Morador editado: ${editMorador.nome} (${editMorador.unidade})`);
    setEditMorador(null); setModal(null); showToast("Morador atualizado com sucesso!");
  };

  // ── Despesas ──
  const adicionarDespesa = () => {
    if (!novaDespesa.valor || !novaDespesa.mes) { showToast("Preencha o valor e o mês.", "error"); return; }
    // Monta a lista de meses: só o escolhido, ou até dezembro do mesmo ano se recorrente
    const mesesAlvo = [];
    if (novaDespesa.recorrente) {
      const [ano, mesNum] = novaDespesa.mes.split("-").map(Number);
      for (let mm = mesNum; mm <= 12; mm++) {
        mesesAlvo.push(`${ano}-${String(mm).padStart(2,"0")}`);
      }
    } else {
      mesesAlvo.push(novaDespesa.mes);
    }
    const salvar = async (base64="") => {
      for (const mesAlvo of mesesAlvo) {
        // O comprovante só é anexado ao mês original
        const comp = mesAlvo === novaDespesa.mes ? base64 : "";
        const nomeComp = mesAlvo === novaDespesa.mes ? novaDespesa.arquivoNome : "";
        await addDoc(collection(db, "despesas"), {
          condominioId, tipo:novaDespesa.tipo, descricao:novaDespesa.descricao,
          valor:parseFloat(novaDespesa.valor)||0, mes:mesAlvo, status:"pendente",
          dataPagamento:null, comprovante:comp, arquivoNome:nomeComp,
          recorrente: novaDespesa.recorrente || false,
        });
      }
      registrarLog("💧", `Despesa registrada: ${novaDespesa.descricao||novaDespesa.tipo} — R$ ${novaDespesa.valor}${novaDespesa.recorrente ? ` (recorrente, ${mesesAlvo.length} meses)` : ` (${mesLabel(novaDespesa.mes)})`}`);
      setNovaDespesa({ tipo:"agua", descricao:"", valor:"", mes:mesAtual(), arquivo:null, arquivoNome:"", recorrente:false }); setModal(null);
      showToast(novaDespesa.recorrente ? `Despesa lançada em ${mesesAlvo.length} meses!` : "Despesa registrada!");
    };
    if (novaDespesa.arquivo) { const r=new FileReader(); r.onload=e=>salvar(e.target.result); r.readAsDataURL(novaDespesa.arquivo); } else salvar();
  };

  const marcarDespesaPaga = async (id) => {
    const d = despesas.find(x=>x.id===id);
    await setDoc(doc(db,"despesas",id), { status:"pago", dataPagamento:new Date().toLocaleDateString("pt-BR") }, { merge:true });
    registrarLog("💰", `Despesa paga: ${d?.descricao||d?.tipo||id} — R$ ${d?.valor?.toFixed(2)||""}`);
    showToast("Despesa marcada como paga!");
  };
  const removerDespesa = async (id) => {
    const d = despesas.find(x=>x.id===id);
    await deleteDoc(doc(db,"despesas",id));
    registrarLog("🗑️", `Despesa removida: ${d?.descricao||d?.tipo||id}`);
    showToast("Despesa removida.","error");
  };

  // ── Serviços ──
  const adicionarServico = async () => {
    if (!novoServico.titulo) { showToast("Dê um título ao serviço.","error"); return; }
    await addDoc(collection(db,"servicos"), { condominioId, titulo:novoServico.titulo, descricao:novoServico.descricao, status:"pendente", dataAbertura:new Date().toLocaleDateString("pt-BR"), dataInicio:null, dataFim:null, valorMaterial:null, valorMaoDeObra:null, obsConclusao:"" });
    registrarLog("🔧", `Serviço registrado: ${novoServico.titulo}`);
    setNovoServico({ titulo:"", descricao:"" }); setModal(null); showToast("Serviço registrado!");
  };

  const concluirServico = async (id) => {
    const s = servicos.find(x=>x.id===id);
    await setDoc(doc(db,"servicos",id), { status:"concluido", dataInicio:concluirForm.dataInicio, dataFim:concluirForm.dataFim, valorMaterial:parseFloat(concluirForm.valorMaterial)||0, valorMaoDeObra:parseFloat(concluirForm.valorMaoDeObra)||0, obsConclusao:concluirForm.obs }, { merge:true });
    registrarLog("✅", `Serviço concluído: ${s?.titulo||id} — Total: R$ ${((parseFloat(concluirForm.valorMaterial)||0)+(parseFloat(concluirForm.valorMaoDeObra)||0)).toFixed(2).replace(".",",")}`);
    setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal(null); showToast("Serviço concluído!");
  };
  const reabrirServico = async (id) => {
    const s = servicos.find(x=>x.id===id);
    await setDoc(doc(db,"servicos",id), { status:"pendente" }, { merge:true });
    registrarLog("🔄", `Serviço reaberto: ${s?.titulo||id}`);
    showToast("Serviço reaberto.","error");
  };
  const removerServico = async (id) => {
    const s = servicos.find(x=>x.id===id);
    await deleteDoc(doc(db,"servicos",id));
    registrarLog("🗑️", `Serviço removido: ${s?.titulo||id}`);
    showToast("Serviço removido.","error");
  };

  // ── Controle de Acessos ──
  const registrarAcesso = async () => {
    if (!novoAcesso.nome || !novoAcesso.motivo) { showToast("Preencha pelo menos nome e motivo.", "error"); return; }
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString("pt-BR");
    const horaAgora = hoje.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
    await addDoc(collection(db, "acessos"), {
      condominioId,
      ...novoAcesso,
      dataEntrada: novoAcesso.dataEntrada || dataHoje,
      horaEntrada: novoAcesso.horaEntrada || horaAgora,
      timestamp: Date.now(),
    });
    registrarLog("🚪", `Acesso registrado: ${novoAcesso.nome}${novoAcesso.empresa ? ` (${novoAcesso.empresa})` : ""} — ${novoAcesso.motivo}`);
    setNovoAcesso({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" });
    setModal(null);
    showToast("Acesso registrado!");
  };

  const registrarSaida = async (id) => {
    const hora = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
    await setDoc(doc(db, "acessos", id), { horaSaida: hora }, { merge:true });
    showToast("Saída registrada!");
  };

  const removerAcesso = async (id) => {
    await deleteDoc(doc(db, "acessos", id));
    showToast("Registro removido.", "error");
  };

  // ── Reservas ──
  const solicitarReserva = async (moradorId, morador, form) => {
    if (!form.data || !form.horario) { showToast("Preencha a data e o horário.", "error"); return false; }
    // Verificar conflito de data
    const conflito = reservas.find(r => r.area === form.area && r.data === form.data && r.status === "aprovada");
    if (conflito) { showToast(`Já existe reserva aprovada para ${form.area} nessa data.`, "error"); return false; }
    await addDoc(collection(db, "reservas"), {
      condominioId,
      moradorId, nome: morador.nome, unidade: morador.unidade,
      area: form.area, data: form.data, horario: form.horario,
      observacao: form.observacao || "",
      status: "pendente",
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
      criadoPor: readOnly ? "morador" : "sindico",
    });
    registrarLog("📅", `Reserva solicitada: ${morador.nome} (${morador.unidade}) — ${form.area} em ${form.data}`);
    showToast("Reserva solicitada! Aguarde aprovação do síndico.");
    return true;
  };

  const aprovarReserva = async (id) => {
    const r = reservas.find(x => x.id === id);
    await setDoc(doc(db, "reservas", id), { status:"aprovada", aprovadaEm: new Date().toLocaleDateString("pt-BR") }, { merge:true });
    registrarLog("✅", `Reserva aprovada: ${r?.nome} (${r?.unidade}) — ${r?.area} em ${r?.data}`);
    showToast("Reserva aprovada!");
  };

  const rejeitarReserva = async (id) => {
    const r = reservas.find(x => x.id === id);
    await setDoc(doc(db, "reservas", id), { status:"rejeitada" }, { merge:true });
    registrarLog("❌", `Reserva rejeitada: ${r?.nome} (${r?.unidade}) — ${r?.area} em ${r?.data}`);
    showToast("Reserva rejeitada.", "error");
  };

  const removerReserva = async (id) => {
    await deleteDoc(doc(db, "reservas", id));
    showToast("Reserva removida.", "error");
  };

  // ── Comunicados ──
  const publicarComunicado = async () => {
    if (!novoComunicado.titulo.trim() || !novoComunicado.mensagem.trim()) {
      showToast("Preencha o título e a mensagem.", "error"); return;
    }
    await addDoc(collection(db, "comunicados"), {
      condominioId,
      titulo: novoComunicado.titulo.trim(),
      mensagem: novoComunicado.mensagem.trim(),
      fixado: novoComunicado.fixado || false,
      data: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("📢", `Comunicado publicado: ${novoComunicado.titulo.trim()}`);
    setNovoComunicado({ titulo:"", mensagem:"", fixado:false });
    setModal(null);
    showToast("Comunicado publicado!");
  };

  const alternarFixado = async (com) => {
    await setDoc(doc(db, "comunicados", com.id), { fixado: !com.fixado }, { merge:true });
    showToast(com.fixado ? "Comunicado desafixado." : "Comunicado fixado no topo.");
  };

  const removerComunicado = async (id) => {
    await deleteDoc(doc(db, "comunicados", id));
    showToast("Comunicado removido.", "error");
  };

  // ── Documentos ──
  const salvarDocumento = async () => {
    if (!novoDocumento.nome.trim()) { showToast("Informe o nome do documento.", "error"); return; }
    let base64 = null;
    if (novoDocumento.arquivo) {
      base64 = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(novoDocumento.arquivo);
      });
    }
    await addDoc(collection(db, "documentos"), {
      condominioId,
      nome: novoDocumento.nome.trim(),
      categoria: novoDocumento.categoria,
      vencimento: novoDocumento.vencimento || "",
      obs: novoDocumento.obs || "",
      arquivo: base64,
      arquivoNome: novoDocumento.arquivoNome || "",
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("📁", `Documento adicionado: ${novoDocumento.nome.trim()}`);
    setNovoDocumento({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"" });
    setModal(null);
    showToast("Documento salvo!");
  };

  const removerDocumento = async (id) => {
    await deleteDoc(doc(db, "documentos", id));
    showToast("Documento removido.", "error");
  };

  // ── Fundo de Reserva ──
  const registrarMovFundo = async () => {
    const valor = parseFloat(novaMovFundo.valor) || 0;
    if (valor <= 0) { showToast("Informe um valor válido.", "error"); return; }
    if (!novaMovFundo.descricao.trim()) { showToast("Informe uma descrição.", "error"); return; }
    await addDoc(collection(db, "fundo_movs"), {
      condominioId,
      tipo: novaMovFundo.tipo, // "aporte" | "retirada"
      valor,
      descricao: novaMovFundo.descricao.trim(),
      data: novaMovFundo.data || new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("🏦", `Fundo de reserva: ${novaMovFundo.tipo === "aporte" ? "aporte" : "retirada"} de R$ ${valor.toFixed(2).replace(".",",")} — ${novaMovFundo.descricao.trim()}`);
    setNovaMovFundo({ tipo:"aporte", valor:"", descricao:"", data:"" });
    setModal(null);
    showToast("Movimentação registrada!");
  };

  const removerMovFundo = async (id) => {
    await deleteDoc(doc(db, "fundo_movs", id));
    showToast("Movimentação removida.", "error");
  };

  const salvarPercentualFundo = async (pct) => {
    await setDoc(doc(db, "condominios", condominioId), { percentualFundo: pct }, { merge:true });
    showToast("Percentual do fundo atualizado!");
  };

  // ── Cobranças extras / rateios ──
  const criarCobrancaExtra = async () => {
    if (!novaCobExtra.descricao.trim()) { showToast("Informe a descrição da cobrança.", "error"); return; }
    const valorInformado = parseFloat(novaCobExtra.valor) || 0;
    if (valorInformado <= 0) { showToast("Informe um valor válido.", "error"); return; }
    const nUnidades = moradores.length;
    if (nUnidades === 0) { showToast("Cadastre moradores antes de criar uma cobrança.", "error"); return; }
    // modo "unidade": cada um paga o valor informado. modo "rateio": divide o total pelas unidades.
    const valorUnitario = novaCobExtra.modo === "rateio" ? (valorInformado / nUnidades) : valorInformado;
    await addDoc(collection(db, "cobrancas_extras"), {
      condominioId,
      descricao: novaCobExtra.descricao.trim(),
      modo: novaCobExtra.modo,
      valorInformado,
      valorUnitario,
      valorTotal: novaCobExtra.modo === "rateio" ? valorInformado : valorInformado * nUnidades,
      nUnidades,
      mes: novaCobExtra.mes,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("➕", `Cobrança extra criada: ${novaCobExtra.descricao.trim()} — R$ ${valorUnitario.toFixed(2).replace(".",",")}/unidade`);
    setNovaCobExtra({ descricao:"", modo:"unidade", valor:"", mes: mesAtual() });
    setModal(null);
    showToast("Cobrança extra criada!");
  };

  const removerCobrancaExtra = async (extra) => {
    // Remove a campanha e todos os registros de pagamento associados
    const pagos = pagExtras.filter(p => p.extraId === extra.id);
    for (const p of pagos) { try { await deleteDoc(doc(db, "pag_extras", p.id)); } catch(e){} }
    await deleteDoc(doc(db, "cobrancas_extras", extra.id));
    registrarLog("🗑️", `Cobrança extra removida: ${extra.descricao}`);
    showToast("Cobrança extra removida.", "error");
  };

  const extraPaga = (extraId, moradorId) => pagExtras.some(p => p.extraId === extraId && p.moradorId === moradorId);

  const marcarExtraPaga = async (extra, moradorId) => {
    await setDoc(doc(db, "pag_extras", `${extra.id}_${moradorId}`), {
      condominioId, extraId: extra.id, moradorId, status:"pago",
      dataPagamento: new Date().toLocaleDateString("pt-BR"), timestamp: Date.now(),
    });
    const m = moradores.find(x => x.id === moradorId);
    registrarLog("✅", `Pagou extra "${extra.descricao}": ${m?.nome || ""} (${m?.unidade || ""})`);
    showToast("Pagamento registrado!");
  };

  const estornarExtra = async (extra, moradorId) => {
    try { await deleteDoc(doc(db, "pag_extras", `${extra.id}_${moradorId}`)); } catch(e){}
    showToast("Pagamento estornado.", "error");
  };

  // ── Receitas avulsas (fluxo de caixa) ──
  const adicionarReceita = async () => {
    if (!novaReceita.descricao.trim()) { showToast("Informe a descrição da receita.", "error"); return; }
    const valor = parseFloat(novaReceita.valor) || 0;
    if (valor <= 0) { showToast("Informe um valor válido.", "error"); return; }
    await addDoc(collection(db, "receitas"), {
      condominioId,
      descricao: novaReceita.descricao.trim(),
      valor,
      categoria: novaReceita.categoria,
      mes: novaReceita.mes,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("💵", `Receita avulsa: ${novaReceita.descricao.trim()} — R$ ${valor.toFixed(2).replace(".",",")}`);
    setNovaReceita({ descricao:"", valor:"", categoria:"Outra", mes: mesSel });
    setModal(null);
    showToast("Receita registrada!");
  };

  const removerReceita = async (id) => {
    await deleteDoc(doc(db, "receitas", id));
    showToast("Receita removida.", "error");
  };

  // ── Ocorrências / reclamações ──
  const responderOcorrencia = async (id, resposta, novoStatus) => {
    await setDoc(doc(db, "ocorrencias", id), {
      respostaSindico: resposta || "",
      status: novoStatus,
      atualizadoEm: new Date().toLocaleString("pt-BR"),
    }, { merge:true });
    registrarLog("🛎️", `Ocorrência atualizada: ${novoStatus === "resolvida" ? "resolvida" : novoStatus === "em_andamento" ? "em andamento" : "reaberta"}`);
    setModal(null);
    showToast("Ocorrência atualizada!");
  };

  const removerOcorrencia = async (id) => {
    await deleteDoc(doc(db, "ocorrencias", id));
    showToast("Ocorrência removida.", "error");
  };

  // ── Enquetes / votações ──
  const criarEnquete = async () => {
    if (!novaEnquete.titulo.trim()) { showToast("Informe a pergunta da enquete.", "error"); return; }
    const opcoes = novaEnquete.opcoes.map(o => o.trim()).filter(Boolean);
    if (opcoes.length < 2) { showToast("Informe pelo menos 2 opções de voto.", "error"); return; }
    await addDoc(collection(db, "enquetes"), {
      condominioId,
      titulo: novaEnquete.titulo.trim(),
      descricao: novaEnquete.descricao.trim(),
      opcoes,
      status: "aberta",
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("🗳️", `Enquete criada: ${novaEnquete.titulo.trim()}`);
    setNovaEnquete({ titulo:"", descricao:"", opcoes:["",""] });
    setModal(null);
    showToast("Enquete criada!");
  };

  const encerrarEnquete = async (id, encerrar) => {
    await setDoc(doc(db, "enquetes", id), {
      status: encerrar ? "encerrada" : "aberta",
      encerradaEm: encerrar ? new Date().toLocaleDateString("pt-BR") : null,
    }, { merge:true });
    showToast(encerrar ? "Enquete encerrada." : "Enquete reaberta.");
  };

  const removerEnquete = async (enquete) => {
    // Remove a enquete e todos os votos associados
    const vs = votos.filter(v => v.enqueteId === enquete.id);
    for (const v of vs) { try { await deleteDoc(doc(db, "votos", v.id)); } catch(e){} }
    await deleteDoc(doc(db, "enquetes", enquete.id));
    registrarLog("🗑️", `Enquete removida: ${enquete.titulo}`);
    showToast("Enquete removida.", "error");
  };

  // Calcula o fluxo de caixa de um mês (entradas − saídas)
  const fluxoDoMes = (mes) => {
    const taxas = somaCobrancas(cobrancas.filter(c => c.mes === mes && c.status === "pago"));
    const extras = cobrancasExtras.filter(e => e.mes === mes).reduce((sum, e) => {
      const nPagos = pagExtras.filter(p => p.extraId === e.id).length;
      return sum + nPagos * (e.valorUnitario || 0);
    }, 0);
    const recAvulsas = receitas.filter(r => r.mes === mes).reduce((s,r) => s + (r.valor||0), 0);
    const entradas = taxas + extras + recAvulsas;
    const despesasPagas = despesas.filter(d => d.mes === mes && d.status === "pago").reduce((s,d) => s + (d.valor||0), 0);
    const servConcluidos = servicos.filter(s => {
      if (s.status !== "concluido" || !s.dataFim) return false;
      const p = s.dataFim.split("/");
      return p.length >= 3 && `${p[2]}-${p[1]}` === mes;
    }).reduce((s,sv) => s + (sv.valorMaterial||0) + (sv.valorMaoDeObra||0), 0);
    const saidas = despesasPagas + servConcluidos;
    return { taxas, extras, recAvulsas, entradas, despesasPagas, servConcluidos, saidas, resultado: entradas - saidas };
  };

  // ── Entregas / Encomendas ──
  const registrarEntrega = async () => {
    if (!novaEntrega.moradorId) { showToast("Selecione o morador destinatário.", "error"); return; }
    if (!novaEntrega.descricao.trim()) { showToast("Descreva a encomenda.", "error"); return; }
    const m = moradores.find(x => x.id === novaEntrega.moradorId);
    await addDoc(collection(db, "entregas"), {
      condominioId,
      moradorId: novaEntrega.moradorId,
      moradorNome: m?.nome || "",
      unidade: m?.unidade || "",
      remetente: novaEntrega.remetente.trim(),
      descricao: novaEntrega.descricao.trim(),
      obs: novaEntrega.obs.trim(),
      status: "aguardando", // aguardando | retirada
      dataChegada: new Date().toLocaleDateString("pt-BR"),
      horaChegada: new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }),
      dataRetirada: null,
      timestamp: Date.now(),
    });
    registrarLog("📦", `Encomenda recebida para ${m?.nome} (${m?.unidade})`);

    // Notifica o morador por e-mail, se o plano permite e há e-mail cadastrado
    if (podeUsar("emailAuto") && m?.email) {
      try {
        await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
          nome_morador:    m.nome,
          unidade:         m.unidade,
          mensagem:        `Chegou uma encomenda para você na portaria${novaEntrega.remetente ? " (remetente: "+novaEntrega.remetente.trim()+")" : ""}. Passe para retirar quando puder.`,
          detalhes:        `Unidade: ${m.unidade}`,
          nome_condominio: condominio?.nome || "Condomínio",
          assunto:         "Você recebeu uma encomenda",
          email_destino:   m.email,
        });
      } catch(e) { /* silencioso — o registro já foi feito */ }
    }

    setNovaEntrega({ moradorId:"", remetente:"", descricao:"", obs:"" });
    setModal(null);
    showToast("Encomenda registrada!" + (podeUsar("emailAuto") && m?.email ? " Morador notificado por e-mail." : ""));
  };

  const marcarRetirada = async (entrega) => {
    await setDoc(doc(db, "entregas", entrega.id), {
      status: "retirada",
      dataRetirada: new Date().toLocaleDateString("pt-BR"),
      horaRetirada: new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }),
    }, { merge:true });
    registrarLog("📦", `Encomenda retirada por ${entrega.moradorNome} (${entrega.unidade})`);
    showToast("Encomenda marcada como retirada!");
  };

  const removerEntrega = async (id) => {
    await deleteDoc(doc(db, "entregas", id));
    showToast("Registro removido.", "error");
  };

  // ── Agenda / Eventos ──
  const salvarEvento = async () => {
    if (!novoEvento.titulo.trim()) { showToast("Informe o título do evento.", "error"); return; }
    if (!novoEvento.data) { showToast("Informe a data do evento.", "error"); return; }
    await addDoc(collection(db, "eventos"), {
      condominioId,
      titulo: novoEvento.titulo.trim(),
      tipo: novoEvento.tipo,
      data: novoEvento.data,   // formato aaaa-mm-dd
      hora: novoEvento.hora || "",
      descricao: novoEvento.descricao.trim(),
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("🗓️", `Evento na agenda: ${novoEvento.titulo.trim()}`);
    setNovoEvento({ titulo:"", tipo:"Evento", data:"", hora:"", descricao:"" });
    setModal(null);
    showToast("Evento adicionado à agenda!");
  };

  const removerEvento = async (id) => {
    await deleteDoc(doc(db, "eventos", id));
    showToast("Evento removido.", "error");
  };

  // Calcula situação do vencimento de um documento
  const situacaoDoc = (venc) => {
    if (!venc) return { label:"Sem vencimento", cor:D.textMut, bg:D.muted, dias:null };
    const [a,m,d] = venc.split("-").map(Number);
    const fim = new Date(a, m-1, d);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dias = Math.ceil((fim - hoje) / (1000*60*60*24));
    if (dias < 0)  return { label:`Vencido há ${Math.abs(dias)} dia(s)`, cor:D.danger, bg:D.dangerBg, dias };
    if (dias === 0) return { label:"Vence hoje", cor:D.danger, bg:D.dangerBg, dias };
    if (dias <= 30) return { label:`Vence em ${dias} dia(s)`, cor:D.warning, bg:D.warningBg, dias };
    return { label:`Válido · vence ${new Date(a,m-1,d).toLocaleDateString("pt-BR")}`, cor:D.success, bg:D.successBg, dias };
  };

  const enviarLembretes = () => {
    const dev = cobMes.filter(c=>c.status!=="pago").map(c=>moradores.find(m=>m.id===c.moradorId)).filter(Boolean);
    if (!dev.length) { showToast("Todos já pagaram!"); return; }
    showToast(`📧 Lembretes para ${dev.length} morador(es): ${dev.map(d=>`${d.nome}`).join(", ")}`);
  };

  const salvarTaxa = async (v) => { await setDoc(doc(db,"condominios",condominioId), { taxa:v }, { merge:true }); showToast("Taxa atualizada!"); };

  const salvarObsMes = async () => {
    await setDoc(doc(db, "observacoes", `${condominioId}_${mesSel}`), { condominioId, texto: obsMes, mes: mesSel, atualizadoEm: new Date().toLocaleString("pt-BR") }, { merge:true });
    setObsSalva(obsMes);
    showToast("Observação salva!");
  };

  const salvarDiaVencimento = async (v) => {
    await setDoc(doc(db,"condominios",condominioId), { diaVencimento: parseInt(v) }, { merge:true });
    showToast("Dia de vencimento salvo!");
  };

  const salvarConfigMultaJuros = async (ativo, multa, juros) => {
    await setDoc(doc(db,"condominios",condominioId), {
      cobrarMultaJuros: ativo,
      multaPercent: parseFloat(multa) || 0,
      jurosPercentMes: parseFloat(juros) || 0,
    }, { merge:true });
    showToast("Configuração de multa/juros salva!");
  };

  // ── Envio de e-mails ──
  const dataVencimentoMes = (mes) => {
    const [y, m] = mes.split("-");
    return new Date(parseInt(y), parseInt(m)-1, diaVencimento);
  };

  const formatarDataBR = (date) =>
    `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`;

  const mesLabelEmail = (m) => {
    const [y, mo] = m.split("-");
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${meses[parseInt(mo) - 1]} de ${y}`;
  };

  const enviarEmailMorador = async (morador, assunto, mensagem) => {
    // Valor individual do morador + encargos se a cobrança do mês estiver atrasada
    const cob = cobrancas.find(c => c.moradorId === morador.id && c.mes === mesSel);
    const enc = cob ? encargosCobranca(cob) : { valorBase: taxaDoMorador(morador.id), multa:0, juros:0, valorTotal: taxaDoMorador(morador.id) };
    let linhaValor;
    if (enc.multa > 0 || enc.juros > 0) {
      linhaValor = `Valor: R$ ${enc.valorBase.toFixed(2).replace(".",",")}\nMulta + juros: R$ ${(enc.multa+enc.juros).toFixed(2).replace(".",",")}\nTotal a pagar: R$ ${enc.valorTotal.toFixed(2).replace(".",",")}`;
    } else {
      linhaValor = `Valor: R$ ${enc.valorBase.toFixed(2).replace(".",",")}`;
    }
    await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
      nome_morador:    morador.nome,
      unidade:         morador.unidade,
      mensagem,
      detalhes:        `Unidade: ${morador.unidade}\n${linhaValor}\nVencimento: ${formatarDataBR(dataVencimentoMes(mesSel))}`,
      nome_condominio: condominio?.nome || "Condomínio",
      assunto,
      email_destino:   morador.email,
    });
  };

  const dispararEmails = async (tipo) => {
    // tipo: "lembrete" (5 dias antes) ou "vencimento" (dia do vencimento)
    setEnviandoEmails(true);
    const chave = `${condominioId}_${mesSel}_${tipo}`;
    try {
      // Verifica se já foi enviado hoje
      const registroRef = doc(db, "emails_enviados", chave);
      const registro    = await getDoc(registroRef);
      if (registro.exists()) {
        const ultimoEnvio = registro.data().dataEnvio;
        const hoje        = new Date().toLocaleDateString("pt-BR");
        if (ultimoEnvio === hoje) {
          showToast(`E-mails de ${tipo==="lembrete"?"lembrete":"vencimento"} já foram enviados hoje.`);
          setEnviandoEmails(false);
          return;
        }
      }

      // Define quem recebe
      let destinatarios;
      if (tipo === "lembrete") {
        // 5 dias antes: envia pra TODOS os moradores do mês
        destinatarios = moradores;
      } else {
        // Dia do vencimento: pendentes E atrasados
        const naoPagaram = cobMes.filter(c => c.status === "pendente" || c.status === "atrasado").map(c => c.moradorId);
        destinatarios    = moradores.filter(m => naoPagaram.includes(m.id));
      }

      if (destinatarios.length === 0) {
        showToast("Nenhum e-mail para enviar — todos já pagaram! ✅");
        setEnviandoEmails(false);
        return;
      }

      const vencimento = formatarDataBR(dataVencimentoMes(mesSel));
      let enviados = 0;

      for (const m of destinatarios) {
        try {
          if (tipo === "lembrete") {
            await enviarEmailMorador(m,
              `Lembrete de Vencimento — ${mesLabelEmail(mesSel)}`,
              `Informamos que a taxa de condomínio referente a ${mesLabelEmail(mesSel)} vencerá em 5 dias (${vencimento}).\n\nPor favor, efetue o pagamento até a data de vencimento para evitar multas.`
            );
          } else {
            await enviarEmailMorador(m,
              `Vencimento Hoje — ${mesLabelEmail(mesSel)}`,
              `Informamos que a taxa de condomínio referente a ${mesLabelEmail(mesSel)} vence hoje (${vencimento}) e consta como pendente em nosso sistema.\n\nCaso já tenha efetuado o pagamento, desconsidere este e-mail.`
            );
          }
          enviados++;
          // Pequena pausa para não sobrecarregar o EmailJS
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`Erro ao enviar para ${m.email}:`, err);
        }
      }

      // Registra o envio no Firestore
      await setDoc(registroRef, {
        condominioId, tipo, mes: mesSel, dataEnvio: new Date().toLocaleDateString("pt-BR"),
        enviados, total: destinatarios.length
      });

      showToast(`✅ ${enviados} e-mail(s) enviado(s) com sucesso!`);
    } catch (err) {
      console.error("Erro no envio:", err);
      showToast("Erro ao enviar e-mails. Verifique o EmailJS.", "error");
    } finally {
      setEnviandoEmails(false);
    }
  };

  // ── Verificação automática ao abrir o app ──
  useEffect(() => {
    if (!user || readOnly || moradores.length === 0 || !diaVencimento) return;
    if (!podeUsar("emailAuto")) return; // e-mails automáticos são recurso do plano Padrão
    const hoje     = new Date();
    const venc     = dataVencimentoMes(mesSel);
    const diffDias = Math.round((venc - hoje) / (1000*60*60*24));

    if (diffDias === 5) {
      dispararEmails("lembrete");
    } else if (diffDias === 0) {
      dispararEmails("vencimento");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, moradores.length, diaVencimento, planoAtual]);

  const mesesDisponiveis = () => {
    const s = new Set(cobrancas.map(c=>c.mes)); s.add(mesAtual());
    return Array.from(s).sort().reverse();
  };

  // ── PDF ──
  const exportarPDF = () => {
    const docPdf = new jsPDF(); const X=14; const AZUL=[30,58,95]; let y=18;
    docPdf.setFontSize(17); docPdf.setTextColor(...AZUL);
    docPdf.text("Vila Real 140 — Relatório do Condomínio", X, y); y+=7;
    docPdf.setFontSize(10); docPdf.setTextColor(107,122,141);
    docPdf.text(`Período: ${mesLabel(mesSel)}  ·  Gerado em ${new Date().toLocaleDateString("pt-BR")}`, X, y); y+=10;
    if (obsSalva) {
      docPdf.setFontSize(10); docPdf.setTextColor(30,30,30);
      docPdf.setFont("helvetica","bold"); docPdf.text("Observações do mês:", X, y); y+=5;
      docPdf.setFont("helvetica","normal");
      const linhas = docPdf.splitTextToSize(obsSalva, 182);
      docPdf.text(linhas, X, y); y += linhas.length * 5 + 5;
    }
    docPdf.setFontSize(12.5); docPdf.setTextColor(...AZUL); docPdf.text("Resumo Financeiro", X, y); y+=5;
    autoTable(docPdf, { startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Indicador","Valor"]],
      body:[["Total de unidades",String(moradores.length)],["Pagamentos realizados",String(pagos)],["Pendentes",String(pendentes)],
            ["Arrecadado",`R$ ${totalArrecadado.toFixed(2).replace(".",",")}`],["A receber",`R$ ${totalPendente.toFixed(2).replace(".",",")}`],
            ["Total entradas",`R$ ${totalEntradas.toFixed(2).replace(".",",")}`],["Despesas pagas",`R$ ${totalSaidasDespesas.toFixed(2).replace(".",",")}`],
            ["Serviços",`R$ ${totalSaidasServicos.toFixed(2).replace(".",",")}`],["SALDO DE CAIXA",`R$ ${saldoCaixa.toFixed(2).replace(".",",")}`]],
    }); y=docPdf.lastAutoTable.finalY+12;
    docPdf.setFontSize(12.5); docPdf.setTextColor(...AZUL); docPdf.text(`Cobranças — ${mesLabel(mesSel)}`, X, y); y+=5;
    autoTable(docPdf, { startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Unidade","Morador","Status","Data Pgto"]],
      body: cobMes.map(c => { const m=moradores.find(x=>x.id===c.moradorId); return [m?.unidade||"—",m?.nome||"—",c.status==="pago"?"Pago":"Pendente",c.dataPagamento||"—"]; }),
    }); y=docPdf.lastAutoTable.finalY+12;
    if (y>250) { docPdf.addPage(); y=18; }
    docPdf.setFontSize(12.5); docPdf.setTextColor(...AZUL); docPdf.text(`Despesas — ${mesLabel(mesSel)}`, X, y); y+=5;
    autoTable(docPdf, { startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Tipo","Descrição","Valor","Status"]],
      body: despesas.filter(d=>d.mes===mesSel).map(d=>[despCat(d.tipo).label,d.descricao||"—",`R$ ${d.valor.toFixed(2).replace(".",",")}`,d.status==="pago"?"Pago":"Pendente"]),
    }); y=docPdf.lastAutoTable.finalY+12;
    if (y>230) { docPdf.addPage(); y=18; }
    docPdf.setFontSize(12.5); docPdf.setTextColor(...AZUL); docPdf.text("Serviços Concluídos", X, y); y+=5;
    autoTable(docPdf, { startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Serviço","Início","Fim","Material","Mão de obra","Total"]],
      body: servicos.filter(s=>s.status==="concluido").map(s=>[s.titulo,s.dataInicio||"—",s.dataFim||"—",`R$ ${(s.valorMaterial||0).toFixed(2).replace(".",",")}`,`R$ ${(s.valorMaoDeObra||0).toFixed(2).replace(".",",")}`,`R$ ${((s.valorMaterial||0)+(s.valorMaoDeObra||0)).toFixed(2).replace(".",",")}`]),
    });
    docPdf.save(`relatorio-vilareal-${mesSel}.pdf`); showToast("PDF gerado com sucesso!");
  };

  const exportarPrestacaoContas = () => {
    const docPdf = new jsPDF();
    const AZUL    = [30, 58, 95];
    const DOURADO = [201, 147, 58];
    const VERDE   = [46, 125, 50];
    const VERM    = [176, 58, 46];
    const W = 210;
    const X = 14;

    // Capa
    docPdf.setFillColor(...AZUL);
    docPdf.rect(0, 0, W, 80, "F");
    docPdf.setFillColor(...DOURADO);
    docPdf.rect(0, 80, W, 4, "F");
    docPdf.setTextColor(255,255,255);
    docPdf.setFont("helvetica","bold");
    docPdf.setFontSize(22);
    docPdf.text("Condominio Vila Real 140", W/2, 30, { align:"center" });
    docPdf.setFontSize(14);
    docPdf.setFont("helvetica","normal");
    docPdf.text("Prestacao de Contas", W/2, 42, { align:"center" });
    docPdf.setFontSize(18);
    docPdf.setFont("helvetica","bold");
    docPdf.setTextColor(...DOURADO);
    docPdf.text(mesLabelEmail(mesSel), W/2, 58, { align:"center" });
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica","normal");
    docPdf.setTextColor(200,220,255);
    docPdf.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, W/2, 70, { align:"center" });

    let y = 96;

    const secao = (titulo) => {
      if (y > 250) { docPdf.addPage(); y = 20; }
      docPdf.setFontSize(12); docPdf.setFont("helvetica","bold"); docPdf.setTextColor(...AZUL);
      docPdf.text(titulo, X, y); y += 5;
      docPdf.setDrawColor(...DOURADO); docPdf.setLineWidth(0.5);
      docPdf.line(X, y, W-14, y); y += 6;
    };

    // Resumo
    secao("1. Resumo Executivo");
    const inadimplentes = cobMes.filter(c => c.status !== "pago");
    const despMes = despesas.filter(d => d.mes === mesSel);
    const servMes = servicos.filter(s => {
      if (!s.dataFim) return false;
      const partes = s.dataFim.split("/");
      if (partes.length < 3) return false;
      return `${partes[2]}-${partes[1]}` === mesSel;
    });
    const totalServMes = servMes.reduce((s,sv)=>(sv.valorMaterial||0)+(sv.valorMaoDeObra||0)+s, 0);
    const totalDespMes = despMes.filter(d=>d.status==="pago").reduce((s,d)=>s+d.valor,0);
    autoTable(docPdf, {
      startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:10}, headStyles:{fillColor:AZUL},
      head:[["Indicador","Valor"]],
      body:[
        ["Unidades do condominio", String(moradores.length)],
        ["Pagamentos recebidos", `${pagos} unidades`],
        ["Inadimplentes", `${inadimplentes.length} unidades`],
        ["Taxa mensal", `R$ ${taxa.toFixed(2).replace(".",",")}`],
        ["Total arrecadado", `R$ ${totalArrecadado.toFixed(2).replace(".",",")}`],
        ["Total a receber", `R$ ${totalPendente.toFixed(2).replace(".",",")}`],
        ["Despesas pagas", `R$ ${totalDespMes.toFixed(2).replace(".",",")}`],
        ["Servicos realizados", `R$ ${totalServMes.toFixed(2).replace(".",",")}`],
        ["Saldo de caixa (geral)", `R$ ${saldoCaixa.toFixed(2).replace(".",",")}`],
      ],
      didParseCell: (data) => {
        if (data.row.index === 8) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = saldoCaixa >= 0 ? [232,245,233] : [255,235,238];
          data.cell.styles.textColor = saldoCaixa >= 0 ? VERDE : VERM;
        }
      }
    });
    y = docPdf.lastAutoTable.finalY + 14;

    // Receitas
    secao("2. Receitas - Pagamentos Recebidos");
    const pagosMes = cobMes.filter(c => c.status === "pago");
    autoTable(docPdf, {
      startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Unidade","Morador","Data Pgto","Valor"]],
      body: pagosMes.length ? pagosMes.map(c => {
        const m = moradores.find(x=>x.id===c.moradorId);
        return [m?.unidade||"", m?.nome||"", c.dataPagamento||"", `R$ ${taxa.toFixed(2).replace(".",",")}`];
      }) : [["","Nenhum pagamento registrado","",""]],
      foot:[[{ content:`Total: R$ ${totalArrecadado.toFixed(2).replace(".",",")}`, colSpan:4, styles:{halign:"right",fontStyle:"bold",fillColor:AZUL,textColor:[255,255,255]} }]],
    });
    y = docPdf.lastAutoTable.finalY + 14;

    // Inadimplentes
    secao("3. Inadimplencia");
    autoTable(docPdf, {
      startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:VERM},
      head:[["Unidade","Morador","Status","Valor em Aberto"]],
      body: inadimplentes.length ? inadimplentes.map(c => {
        const m = moradores.find(x=>x.id===c.moradorId);
        return [m?.unidade||"", m?.nome||"", c.status==="atrasado"?"Atrasado":"Pendente", `R$ ${taxa.toFixed(2).replace(".",",")}`];
      }) : [["","Todos os moradores pagaram!","",""]],
    });
    y = docPdf.lastAutoTable.finalY + 14;

    // Despesas
    secao("4. Despesas - Agua, Luz e Outros");
    autoTable(docPdf, {
      startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Tipo","Descricao","Status","Valor"]],
      body: despMes.length ? despMes.map(d=>[
        despCat(d.tipo).label,
        d.descricao||"",
        d.status==="pago"?"Pago":"Pendente",
        `R$ ${d.valor.toFixed(2).replace(".",",")}`,
      ]) : [["","Nenhuma despesa registrada","",""]],
      foot: despMes.length ? [[{ content:`Total: R$ ${despMes.reduce((s,d)=>s+d.valor,0).toFixed(2).replace(".",",")}`, colSpan:4, styles:{halign:"right",fontStyle:"bold",fillColor:AZUL,textColor:[255,255,255]} }]] : undefined,
    });
    y = docPdf.lastAutoTable.finalY + 14;

    // Servicos
    secao("5. Servicos e Manutencoes");
    autoTable(docPdf, {
      startY:y, margin:{left:X}, theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:AZUL},
      head:[["Servico","Inicio","Fim","Material","Mao de obra","Total"]],
      body: servMes.length ? servMes.map(s=>[
        s.titulo, s.dataInicio||"", s.dataFim||"",
        `R$ ${(s.valorMaterial||0).toFixed(2).replace(".",",")}`,
        `R$ ${(s.valorMaoDeObra||0).toFixed(2).replace(".",",")}`,
        `R$ ${((s.valorMaterial||0)+(s.valorMaoDeObra||0)).toFixed(2).replace(".",",")}`,
      ]) : [["","","","","","Nenhum servico concluido no mes"]],
      foot: servMes.length ? [[{ content:`Total: R$ ${totalServMes.toFixed(2).replace(".",",")}`, colSpan:6, styles:{halign:"right",fontStyle:"bold",fillColor:AZUL,textColor:[255,255,255]} }]] : undefined,
    });
    y = docPdf.lastAutoTable.finalY + 14;

    // Observacoes
    if (obsSalva) {
      secao("6. Observacoes do Mes");
      docPdf.setFontSize(10); docPdf.setFont("helvetica","normal"); docPdf.setTextColor(44,62,80);
      const linhasObs = docPdf.splitTextToSize(obsSalva, W-28);
      docPdf.text(linhasObs, X, y);
      y += linhasObs.length * 5 + 14;
    }

    // Assinatura
    if (y > 240) { docPdf.addPage(); y = 20; }
    y += 16;
    docPdf.setDrawColor(150,150,150); docPdf.setLineWidth(0.3);
    docPdf.line(X, y, 90, y);
    docPdf.setFontSize(9); docPdf.setFont("helvetica","normal"); docPdf.setTextColor(107,122,141);
    docPdf.text("Assinatura do Sindico", X, y+5);
    docPdf.text("Data: ___/___/______", X, y+12);

    // Rodape em todas as paginas
    const totalPags = docPdf.getNumberOfPages();
    for (let i=1; i<=totalPags; i++) {
      docPdf.setPage(i);
      docPdf.setFillColor(...AZUL);
      docPdf.rect(0, 287, W, 10, "F");
      docPdf.setFontSize(8); docPdf.setFont("helvetica","normal"); docPdf.setTextColor(255,255,255);
      docPdf.text(`Condominio Vila Real 140 - Prestacao de Contas - ${mesLabelEmail(mesSel)}`, X, 293);
      docPdf.text(`Pagina ${i} de ${totalPags}`, W-14, 293, { align:"right" });
    }

    docPdf.save(`prestacao-contas-vilareal-${mesSel}.pdf`);
    showToast("Prestacao de contas gerada!");
  };

  const [maisAberto, setMaisAberto] = useState(false);

  const navPrincipal = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças"  },
    { id:"moradores", icon:"👥", label:"Moradores"  },
    { id:"despesas",  icon:"💧", label:"Água/Luz"   },
    { id:"servicos",  icon:"🔧", label:"Serviços"   },
  ];
  const navSecundario = [
    { id:"reservas",    icon:"📅", label:"Reservas"    },
    { id:"acessos",     icon:"🚪", label:"Acessos"     },
    { id:"entregas",    icon:"📦", label:"Entregas"    },
    { id:"comunicados", icon:"📢", label:"Comunicados" },
    { id:"ocorrencias", icon:"🛎️", label:"Ocorrências" },
    { id:"enquetes",    icon:"🗳️", label:"Enquetes"    },
    { id:"documentos",  icon:"📁", label:"Documentos"  },
    { id:"fundoReserva",icon:"🏦", label:"Fundo"       },
    { id:"fluxoCaixa",  icon:"📈", label:"Fluxo de Caixa" },
    { id:"agenda",      icon:"🗓️", label:"Agenda"      },
    { id:"historico",   icon:"📋", label:"Histórico"   },
    ...(!readOnly ? [{ id:"config", icon:"⚙️", label:"Config."  }] : []),
  ];

  const navItems = [
    { id:"dashboard",   icon:"📊", label:"Dashboard"   },
    { id:"cobrancas",   icon:"💰", label:"Cobranças"   },
    { id:"moradores",   icon:"👥", label:"Moradores"   },
    { id:"despesas",    icon:"💧", label:"Água/Luz"    },
    { id:"servicos",    icon:"🔧", label:"Serviços"    },
    { id:"reservas",    icon:"📅", label:"Reservas"    },
    { id:"acessos",     icon:"🚪", label:"Acessos"     },
    { id:"entregas",    icon:"📦", label:"Entregas"    },
    { id:"comunicados", icon:"📢", label:"Comunicados" },
    { id:"ocorrencias", icon:"🛎️", label:"Ocorrências" },
    { id:"enquetes",    icon:"🗳️", label:"Enquetes"    },
    { id:"documentos",  icon:"📁", label:"Documentos"  },
    { id:"fundoReserva",icon:"🏦", label:"Fundo"       },
    { id:"fluxoCaixa",  icon:"📈", label:"Fluxo de Caixa" },
    { id:"agenda",      icon:"🗓️", label:"Agenda"      },
    { id:"historico",   icon:"📋", label:"Histórico"   },
    ...(!readOnly ? [{ id:"config", icon:"⚙️", label:"Config." }] : []),
  ];

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:D.fontBody }}>Carregando...</div>
  );

  if (modoVisitante && !user) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:D.fontBody, textAlign:"center", padding:24 }}>
      <div><div style={{ fontSize:36, marginBottom:10 }}>🔒</div>Link de visualização indisponível.<br/>Contate o síndico.</div>
    </div>
  );

  if (!user) {
    // Modo visitante entra direto no login; senão, mostra landing → login/cadastro
    if (authView === "landing" && !modoVisitante) {
      return <LandingPage onEntrar={() => setAuthView("login")} onCadastrar={() => setAuthView("cadastro")} />;
    }
    return <Login modoInicial={authView === "cadastro" ? "cadastro" : "login"} onVoltar={modoVisitante ? null : () => setAuthView("landing")} />;
  }

  // ── Painel do administrador (MySindi) ──
  // O admin vai direto ao painel ao logar (?admin=1 continua funcionando como atalho)
  if (user && user.email === ADMIN_EMAIL) {
    return <AdminPanel onSair={() => { signOut(auth); window.location.href = window.location.origin + window.location.pathname; }} />;
  }

  // ── Portal do morador (link individual) ──
  if (portalMoradorId && user) {
    return <PortalMorador moradorId={portalMoradorId} db={db} taxa={taxa} mesLabel={mesLabel} mesAtual={mesAtual} />;
  }

  // ── Carregando dados do condomínio ──
  if (!condCarregado) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody }}>
      Carregando condomínio...
    </div>
  );

  // ── Admin sem ?admin=1 na URL: oferece ir para o painel ──
  if (!condominioId && !readOnly && user.email === ADMIN_EMAIL) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody, padding:24 }}>
      <div style={{ background:"#fff", borderRadius:D.radius, padding:"36px 32px", maxWidth:440, textAlign:"center", boxShadow:D.shadowMd }}>
        <div style={{ width:60, height:60, borderRadius:16, background:`linear-gradient(135deg, ${D.sidebarHov}, ${D.primaryDk})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:28 }}>🏢</div>
        <h2 style={{ fontFamily:D.fontDisplay, color:D.text, fontSize:20, margin:"0 0 10px", letterSpacing:"-0.02em" }}>Bem-vindo, Admin</h2>
        <p style={{ fontFamily:D.fontBody, color:D.textSec, fontSize:14, lineHeight:1.6, margin:"0 0 20px" }}>
          Você está logado como administrador do MySindi. Acesse o painel para gerenciar todos os condomínios e ver as métricas do negócio.
        </p>
        <a href={`${window.location.origin}${window.location.pathname}?admin=1`} style={{ display:"inline-block", padding:"12px 28px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textDecoration:"none", marginBottom:12 }}>Abrir painel admin →</a>
        <br/>
        <button onClick={() => signOut(auth)} style={{ padding:"9px 20px", background:"none", color:D.textSec, border:"none", fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>Sair</button>
      </div>
    </div>
  );

  // ── Síndico autenticado mas sem condomínio vinculado ──
  if (!condominioId && !readOnly) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody, padding:24 }}>
      <div style={{ background:"#fff", borderRadius:D.radius, padding:"36px 32px", maxWidth:440, textAlign:"center", boxShadow:D.shadowMd }}>
        <div style={{ fontSize:40, marginBottom:14 }}>🏢</div>
        <h2 style={{ fontFamily:D.fontDisplay, color:D.text, fontSize:20, margin:"0 0 10px", letterSpacing:"-0.02em" }}>Conta sem condomínio</h2>
        <p style={{ fontFamily:D.fontBody, color:D.textSec, fontSize:14, lineHeight:1.6, margin:"0 0 20px" }}>
          Sua conta ainda não está vinculada a nenhum condomínio. Se você é o administrador, execute a página de migração/configuração para vincular seu condomínio.
        </p>
        <button onClick={() => signOut(auth)} style={{ padding:"11px 24px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Sair</button>
      </div>
    </div>
  );

  // ── Trial expirado — bloqueio de acesso (Fase 4a) ──
  if (!readOnly && condominioId && infoAssinatura.estado === "expirado") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody, padding:24 }}>
      <div style={{ background:"#fff", borderRadius:D.radiusXl, padding:"40px 34px", maxWidth:460, textAlign:"center", boxShadow:D.shadowMd }}>
        <div style={{ width:64, height:64, borderRadius:16, background:D.warningBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", fontSize:30 }}>⏰</div>
        <h2 style={{ fontFamily:D.fontDisplay, color:D.text, fontSize:22, margin:"0 0 10px", letterSpacing:"-0.02em" }}>Seu teste grátis expirou</h2>
        <p style={{ fontFamily:D.fontBody, color:D.textSec, fontSize:14, lineHeight:1.7, margin:"0 0 24px" }}>
          Esperamos que tenha gostado do MySindi! Para continuar gerenciando o <b>{condominio?.nome}</b> com todas as funcionalidades, ative sua assinatura.
        </p>
        <div style={{ background:D.muted, borderRadius:D.radius, padding:"18px 20px", marginBottom:24, textAlign:"left" }}>
          <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:8 }}>Seu plano</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.text }}>{PLANOS[condominio?.plano]?.nome || "Básico"}</div>
              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{condominio?.numApartamentos} apartamentos</div>
            </div>
            <div style={{ fontFamily:D.fontDisplay, fontSize:24, fontWeight:700, color:D.primary }}>
              R$ {PLANOS[condominio?.plano]?.preco || 79}<span style={{ fontSize:14, color:D.textSec, fontWeight:400 }}>/mês</span>
            </div>
          </div>
        </div>
        <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.7, margin:"0 0 20px" }}>
          Entre em contato para ativar sua assinatura:<br/>
          <a href="mailto:comercial.mysindi@gmail.com" style={{ color:D.accent, fontWeight:600, textDecoration:"none" }}>comercial.mysindi@gmail.com</a><br/>
          <a href="https://wa.me/5585996532638" target="_blank" rel="noopener noreferrer" style={{ color:D.success, fontWeight:600, textDecoration:"none" }}>WhatsApp: (85) 99653-2638</a>
        </p>
        <button onClick={() => signOut(auth)} style={{ padding:"11px 24px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Sair</button>
      </div>
    </div>
  );

  // ── helpers de estilo responsivo ──
  const h2size = isMobile ? 20 : 22;
  const pad    = isMobile ? "16px 16px 100px" : "24px 28px 40px"; // mantido por compatibilidade

  // ── Cobranças: renderiza cards no mobile, tabela no desktop ──
  const CobCard = ({ cob }) => {
    const m = moradores.find(x => x.id === cob.moradorId);
    if (!m) return null;
    const enc = encargosCobranca(cob);
    return (
      <div style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cob.status==="pago"?D.success:cob.status==="atrasado"?D.danger:D.warning}`, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <div>
            <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{m.unidade} — {m.nome}</div>
            <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>{m.email}</div>
          </div>
          <Badge status={cob.status} />
        </div>
        {/* Valor da cobrança (com encargos se houver) */}
        <div style={{ marginBottom:8 }}>
          {enc.multa > 0 || enc.juros > 0 ? (
            <div style={{ background:D.dangerBg, borderRadius:D.radiusSm, padding:"8px 12px" }}>
              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Taxa: R$ {enc.valorBase.toFixed(2).replace(".",",")} · multa R$ {enc.multa.toFixed(2).replace(".",",")} · juros R$ {enc.juros.toFixed(2).replace(".",",")} ({enc.diasAtraso}d)</div>
              <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:700, color:D.danger }}>Total: R$ {enc.valorTotal.toFixed(2).replace(".",",")}</div>
            </div>
          ) : (
            <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text }}>R$ {enc.valorBase.toFixed(2).replace(".",",")}</div>
          )}
        </div>
        {cob.dataPagamento && <div style={{ fontSize:12, color:"#9aa6b5", marginBottom:8 }}>Pago em {cob.dataPagamento}</div>}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {cob.status !== "pago" ? (
            !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"7px 14px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Registrar Pgto</button>
          ) : (
            <>
              {cob.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"7px 14px", background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>📄 Comprovante</button>}
              {!readOnly && <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"7px 14px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>↩ Estornar</button>}
            </>
          )}
        </div>
      </div>
    );
  };

  const DespCard = ({ d }) => (
    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${d.status==="pago"?D.success:D.danger}`, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{despCat(d.tipo).icon} {d.descricao || despCat(d.tipo).label}</div>
          <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>{mesLabel(d.mes)} · R$ {d.valor.toFixed(2).replace(".",",")}</div>
        </div>
        <Badge status={d.status} />
      </div>
      {d.dataPagamento && <div style={{ fontSize:12, color:"#9aa6b5", marginBottom:8 }}>Pago em {d.dataPagamento}</div>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {d.status !== "pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ padding:"7px 14px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Marcar Paga</button>}
        {d.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ padding:"7px 14px", background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
        {!readOnly && <button onClick={() => { if(window.confirm("Remover esta despesa?")) removerDespesa(d.id); }} style={{ padding:"7px 14px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", minHeight:"100vh", fontFamily:D.fontBody, background:"#F8FAFC" }}>

      {/* ── Sidebar (desktop) ── */}
      {!isMobile && (
        <aside style={{ width:240, background:D.sidebar, display:"flex", flexDirection:"column", flexShrink:0, borderRight:`1px solid ${D.sidebarBdr}` }}>
          {/* Logo */}
          <div style={{ padding:"22px 18px 18px", borderBottom:`1px solid ${D.sidebarBdr}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:9, background:D.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:`0 2px 8px rgba(75,114,196,0.4)` }}>
                <span style={{ color:"#fff", fontFamily:D.fontDisplay, fontSize:13, fontWeight:700 }}>{(condominio?.nome || "VR").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase()}</span>
              </div>
              <div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:14, color:D.sidebarFg, fontWeight:600, letterSpacing:"-0.02em", lineHeight:1.2 }}>{condominio?.nome || "Condomínio"}</div>
                <div style={{ fontFamily:D.fontBody, fontSize:11, color:"rgba(226,232,245,0.4)", marginTop:1 }}>Gestão Condominial</div>
              </div>
            </div>
          </div>
          {/* Nav */}
          <nav style={{ flex:1, padding:"8px 10px" }}>
            {navItems.map(n => {
              const bloqueado = !podeUsar(n.id);
              return (
              <button key={n.id} onClick={() => setAba(n.id)} style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 11px", background: aba===n.id ? D.sidebarAct : "transparent", border:"none", cursor:"pointer", color: aba===n.id ? "#fff" : "rgba(226,232,245,0.85)", fontFamily:D.fontBody, fontSize:13, fontWeight: aba===n.id ? 600 : 500, textAlign:"left", borderRadius:8, marginBottom:1, outline:"none", borderLeft: aba===n.id ? `2px solid ${D.sidebarActBdr}` : "2px solid transparent" }}>
                <span style={{ fontSize:15, minWidth:18, textAlign:"center", opacity: aba===n.id?1:.8 }}>{n.icon}</span>
                <span style={{ flex:1 }}>{n.label}</span>
                {bloqueado && <span style={{ fontSize:11, opacity:.6 }}>🔒</span>}
              </button>
              );
            })}
          </nav>
          {/* Bottom */}
          <div style={{ padding:"10px 10px 18px", borderTop:`1px solid ${D.sidebarBdr}` }}>
            <div style={{ background:"rgba(255,255,255,.05)", borderRadius:8, padding:"8px 11px" }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10, color:"rgba(226,232,245,0.35)", textTransform:"uppercase", letterSpacing:".8px", marginBottom:2 }}>Conta ativa</div>
              <div style={{ fontFamily:D.fontBody, fontSize:11, color:"rgba(226,232,245,0.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.email}</div>
            </div>
            {readOnly && (
              <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin + window.location.pathname; }} style={{ width:"100%", marginTop:8, padding:"8px 11px", background:"rgba(184,114,0,.15)", border:`1px solid rgba(184,114,0,.3)`, borderRadius:8, color:"#FCD34D", fontFamily:D.fontBody, fontSize:11.5, fontWeight:500, textAlign:"center", cursor:"pointer" }}>
                👁️ Modo Visualização — Sair
              </button>
            )}
          </div>
        </aside>
      )}

      {/* ── Barra de navegação inferior (mobile) ── */}
      {isMobile && (
        <>
          {/* Painel "Mais" */}
          {maisAberto && (
            <div style={{ position:"fixed", inset:0, zIndex:498 }} onClick={() => setMaisAberto(false)}>
              <div style={{ position:"absolute", bottom:68, left:0, right:0, background:D.sidebar, borderTop:`1px solid ${D.sidebarBdr}`, padding:"8px 12px 12px", boxShadow:"0 -8px 24px rgba(0,0,0,.3)" }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:8 }}>
                  {navSecundario.map(n => {
                    const bloqueado = !podeUsar(n.id);
                    return (
                    <button key={n.id} onClick={() => { setAba(n.id); setMaisAberto(false); }} style={{ background: aba===n.id ? D.sidebarAct : "transparent", border:"none", cursor:"pointer", padding:"10px 4px", display:"flex", flexDirection:"column", alignItems:"center", gap:4, color: aba===n.id ? "#fff" : "rgba(226,232,245,0.75)", borderRadius:10, fontFamily:D.fontBody, position:"relative" }}>
                      <span style={{ fontSize:20 }}>{n.icon}</span>
                      <span style={{ fontSize:10, fontWeight: aba===n.id?600:400 }}>{n.label}</span>
                      {bloqueado && <span style={{ position:"absolute", top:4, right:8, fontSize:10 }}>🔒</span>}
                    </button>
                    );
                  })}
                </div>
                <div style={{ borderTop:`1px solid ${D.sidebarBdr}`, paddingTop:8 }}>
                  {readOnly ? (
                    <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin+window.location.pathname; }} style={{ width:"100%", padding:"10px", background:"rgba(252,211,77,.1)", border:`1px solid rgba(252,211,77,.2)`, borderRadius:10, color:"#FCD34D", fontFamily:D.fontBody, fontSize:13, fontWeight:500, cursor:"pointer" }}>
                      👁️ Modo Visualização — Sair
                    </button>
                  ) : (
                    <button onClick={() => signOut(auth)} style={{ width:"100%", padding:"10px", background:"rgba(224,58,34,.12)", border:`1px solid rgba(224,58,34,.2)`, borderRadius:10, color:"#FCA5A5", fontFamily:D.fontBody, fontSize:13, fontWeight:500, cursor:"pointer" }}>
                      🚪 Sair do sistema
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Barra principal */}
          <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:D.sidebar, display:"flex", zIndex:499, boxShadow:`0 -1px 0 ${D.sidebarBdr}, 0 -4px 16px rgba(28,45,94,.4)`, paddingBottom:"env(safe-area-inset-bottom,0)", height:64 }}>
            {navPrincipal.map(n => (
              <button key={n.id} onClick={() => { setAba(n.id); setMaisAberto(false); }} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color: aba===n.id ? D.accent : "rgba(226,232,245,0.75)", borderTop: aba===n.id ? `2px solid ${D.accent}` : "2px solid transparent", fontFamily:D.fontBody }}>
                <span style={{ fontSize:19 }}>{n.icon}</span>
                <span style={{ fontSize:9.5, fontWeight: aba===n.id?600:400 }}>{n.label}</span>
              </button>
            ))}
            <button onClick={() => setMaisAberto(v=>!v)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color: maisAberto || navSecundario.some(n=>n.id===aba) ? D.accent : "rgba(226,232,245,0.75)", borderTop: maisAberto || navSecundario.some(n=>n.id===aba) ? `2px solid ${D.accent}` : "2px solid transparent", fontFamily:D.fontBody }}>
              <span style={{ fontSize:19 }}>⋯</span>
              <span style={{ fontSize:9.5, fontWeight: maisAberto?600:400 }}>Mais</span>
            </button>
          </nav>
        </>
      )}

      {/* ── Conteúdo ── */}
      <main style={{ flex:1, overflow:"auto", background:D.bgApp }}>
        {/* Faixa de aviso do trial */}
        {!readOnly && infoAssinatura.estado === "trial" && (
          <div style={{ background: infoAssinatura.diasRestantes <= 3 ? D.warningBg : D.secondary, borderBottom:`1px solid ${D.border}`, padding: isMobile?"10px 16px":"10px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontBody, fontSize:13, color: infoAssinatura.diasRestantes <= 3 ? "#92400E" : D.primary, fontWeight:500 }}>
              <span>{infoAssinatura.diasRestantes <= 3 ? "⏰" : "✨"}</span>
              <span>
                {infoAssinatura.diasRestantes === 0
                  ? "Seu teste grátis termina hoje!"
                  : `Teste grátis: ${infoAssinatura.diasRestantes} ${infoAssinatura.diasRestantes === 1 ? "dia restante" : "dias restantes"}`}
              </span>
            </div>
            <a href="mailto:comercial.mysindi@gmail.com" style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.accent, textDecoration:"none", whiteSpace:"nowrap" }}>Assinar agora →</a>
          </div>
        )}


        {/* ── Dashboard ── */}
        {aba === "dashboard" && (
          <div>
            <TopBar title="Visão Geral" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile ? "16px 14px 80px" : "24px 28px 40px" }}>

              {/* Setup wizard — condomínio novo sem moradores */}
              {!readOnly && moradores.length === 0 && (
                <div style={{ background:`linear-gradient(135deg, ${D.primary}, ${D.accent})`, borderRadius:D.radius, padding: isMobile?"24px 20px":"32px 36px", marginBottom:24, color:"#fff", boxShadow:`0 8px 32px rgba(30,58,114,0.3)` }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>👋</div>
                  <h2 style={{ fontFamily:D.fontDisplay, fontSize: isMobile?20:24, fontWeight:700, margin:"0 0 8px", letterSpacing:"-0.02em" }}>
                    Bem-vindo ao {condominio?.nome || "seu condomínio"}!
                  </h2>
                  <p style={{ fontFamily:D.fontBody, fontSize:14, opacity:.9, lineHeight:1.6, margin:"0 0 20px", maxWidth:520 }}>
                    Seu painel está pronto. Vamos configurar tudo em 3 passos rápidos para você começar a gerir as cobranças.
                  </p>
                  <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:520 }}>
                    {[
                      { n:1, titulo:"Cadastre os moradores", desc:"Adicione as unidades e os contatos de cada apartamento", aba:"moradores", feito: moradores.length > 0 },
                      { n:2, titulo:"Defina a taxa e o vencimento", desc:"Configure o valor mensal e o dia de vencimento", aba:"config", feito: false },
                      { n:3, titulo:"Comece a registrar pagamentos", desc:"Acompanhe quem pagou e envie lembretes automáticos", aba:"cobrancas", feito: false },
                    ].map(passo => (
                      <button key={passo.n} onClick={() => setAba(passo.aba)} style={{ display:"flex", alignItems:"center", gap:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:D.radiusSm, padding:"14px 16px", cursor:"pointer", textAlign:"left", color:"#fff", fontFamily:D.fontBody }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15, flexShrink:0 }}>{passo.n}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600 }}>{passo.titulo}</div>
                          <div style={{ fontSize:12, opacity:.8, marginTop:2 }}>{passo.desc}</div>
                        </div>
                        <span style={{ fontSize:18, opacity:.7 }}>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bloco A: Financeiro + Saldo + Inadimplência + Cobranças + Atividade ── */}
              {(() => {
                const mesesAno = Array.from({length:6}, (_,i) => { const d=new Date(); d.setMonth(d.getMonth()-5+i); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
                const labels6 = mesesAno.map(m => { const [,mo]=m.split("-"); return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1]; });
                const dados6 = mesesAno.map(m => { const f=fluxoDoMes(m); return { entrada:f.entradas, saida:f.saidas }; });
                const mesesCaixa = [...new Set([...cobrancas.map(c=>c.mes), ...despesas.map(d=>d.mes), ...receitas.map(r=>r.mes), ...cobrancasExtras.map(e=>e.mes)])].filter(Boolean);
                const saldoCaixaTotal = mesesCaixa.reduce((s,m)=> s + fluxoDoMes(m).resultado, 0);
                const fMes = fluxoDoMes(mesSel);
                const fmt = (v) => `R$ ${v.toFixed(2).replace(".",",")}`;
                const pctInadimpl = moradores.length ? Math.round((nPagos/moradores.length)*100) : 0;

                const chartCard = (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?"18px 16px":"22px 24px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Visão Geral Financeira</div>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:6, flexWrap:"wrap" }}>
                          <span style={{ fontFamily:D.fontDisplay, fontSize: isMobile?24:28, fontWeight:700, color:D.text, letterSpacing:"-0.03em" }}>{fmt(fMes.entradas)}</span>
                          <span style={{ fontFamily:D.fontBody, fontSize:14, color:D.textMut }}>/ {fmt(fMes.saidas)}</span>
                        </div>
                        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>Entradas / Saídas · {mesLabel(mesSel)}</div>
                      </div>
                      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}><div style={{ width:8, height:8, borderRadius:"50%", background:D.accent }} />Receita</div>
                        <div style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}><div style={{ width:8, height:8, borderRadius:"50%", background:D.warning }} />Despesa</div>
                      </div>
                    </div>
                    <AreaChart dadosMes={dados6} mesesLabel={labels6} />
                  </div>
                );

                const saldoCard = (
                  <div style={{ background:D.primary, borderRadius:D.radius, padding: isMobile?"18px 20px":"22px 24px", boxShadow:D.shadowMd, color:"#fff", position:"relative", overflow:"hidden", minWidth:0 }}>
                    <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"rgba(16,185,129,0.18)" }} />
                    <div style={{ position:"relative" }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".8px", opacity:.85 }}>Saldo em caixa</div>
                      <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?26:30, fontWeight:700, letterSpacing:"-0.03em", marginTop:8, color: saldoCaixaTotal<0?"#FCA5A5":"#fff" }}>{fmt(saldoCaixaTotal)}</div>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, opacity:.8, marginTop:4 }}>Acumulado de todos os meses</div>
                    </div>
                  </div>
                );

                const inadimplCard = (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?"18px 16px":"20px 22px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14, gap:8, flexWrap:"wrap" }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Inadimplência</div>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, color: nPagos>0?D.danger:D.success, fontWeight:600 }}>{pctInadimpl}% · {fmt(totalPendente)} a receber</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {[
                        { n:pagos,      label:"Em dia",    cor:D.success },
                        { n:pendentes,  label:"Pendentes", cor:D.warning },
                        { n:atrasados,  label:"Atrasados", cor:D.danger  },
                      ].map((s,i) => (
                        <div key={i} style={{ flex:1, background:D.muted, borderRadius:D.radiusSm, padding:"12px 10px", textAlign:"center", minWidth:0 }}>
                          <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:s.cor, lineHeight:1 }}>{s.n}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec, marginTop:4 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                const atividadeCard = (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?"18px 16px":"20px 22px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em", marginBottom:16 }}>Atividade recente</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {logs.slice(0,6).map((log,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                          <div style={{ width:34, height:34, borderRadius:9, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{log.icone}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:500, color:D.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.descricao}</div>
                            <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:2 }}>{log.dataHora}</div>
                          </div>
                        </div>
                      ))}
                      {logs.length === 0 && (
                        <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"20px 0" }}>Nenhuma atividade ainda.</div>
                      )}
                    </div>
                  </div>
                );

                const cobrancasCard = (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden", minWidth:0 }}>
                    <div style={{ padding: isMobile?"16px 16px 12px":"18px 24px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${D.border}` }}>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Cobranças recentes</div>
                      <button onClick={() => setAba("cobrancas")} style={{ fontFamily:D.fontBody, fontSize:13, color:D.accent, background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>Ver todas →</button>
                    </div>
                    {isMobile ? (
                      <div>
                        {cobMes.slice(0,5).map((cob,i) => {
                          const m = moradores.find(x=>x.id===cob.moradorId);
                          if (!m) return null;
                          return (
                            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom: i<Math.min(cobMes.length,5)-1?`1px solid ${D.border}`:"none", gap:12 }}>
                              <div style={{ minWidth:0, flex:1 }}>
                                <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.unidade}</div>
                                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.nome}</div>
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5, flexShrink:0 }}>
                                <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:700, color:D.text }}>R$ {taxaDoMorador(cob.moradorId).toFixed(2).replace(".",",")}</div>
                                <Badge status={cob.status} />
                              </div>
                            </div>
                          );
                        })}
                        {cobMes.length === 0 && <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"20px 0" }}>Nenhuma cobrança neste mês.</div>}
                      </div>
                    ) : (
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead>
                          <tr style={{ background:D.muted }}>
                            {["Unidade","Morador","Valor","Status"].map(h => (
                              <th key={h} style={{ padding:"10px 24px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cobMes.slice(0,5).map((cob,i) => {
                            const m = moradores.find(x=>x.id===cob.moradorId);
                            if (!m) return null;
                            return (
                              <tr key={i} style={{ borderBottom:`1px solid ${D.border}` }}>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontDisplay, fontSize:13, fontWeight:600, color:D.text }}>{m.unidade}</td>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{m.nome}</td>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>R$ {taxaDoMorador(cob.moradorId).toFixed(2).replace(".",",")}</td>
                                <td style={{ padding:"14px 24px" }}><Badge status={cob.status} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );

                // Card de Ocorrências recentes (só para quem tem o recurso Avançado)
                const statusOcorr = {
                  aberta:       { rotulo:"Aberta",       cor:D.warning, bg:D.warningBg },
                  em_andamento: { rotulo:"Em andamento", cor:D.accent,  bg:D.secondary },
                  resolvida:    { rotulo:"Resolvida",    cor:D.success,  bg:D.successBg },
                };
                const ocorrenciasCard = podeUsar("ocorrencias") ? (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden", minWidth:0 }}>
                    <div style={{ padding: isMobile?"16px 16px 12px":"18px 24px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${D.border}` }}>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Ocorrências recentes</div>
                      <button onClick={() => setAba("ocorrencias")} style={{ fontFamily:D.fontBody, fontSize:13, color:D.accent, background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>Ver todas →</button>
                    </div>
                    {ocorrencias.length === 0 ? (
                      <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"24px 16px" }}>Nenhuma ocorrência registrada.</div>
                    ) : isMobile ? (
                      <div>
                        {ocorrencias.slice(0,5).map((o,i) => {
                          const si = statusOcorr[o.status] || statusOcorr.aberta;
                          return (
                            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom: i<Math.min(ocorrencias.length,5)-1?`1px solid ${D.border}`:"none", gap:12 }}>
                              <div style={{ minWidth:0, flex:1 }}>
                                <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{o.titulo}</div>
                                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{o.unidade} · {o.categoria}</div>
                              </div>
                              <span style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:600, color:si.cor, background:si.bg, padding:"4px 10px", borderRadius:10, whiteSpace:"nowrap", flexShrink:0 }}>{si.rotulo}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead>
                          <tr style={{ background:D.muted }}>
                            {["Ocorrência","Unidade","Categoria","Status"].map(h => (
                              <th key={h} style={{ padding:"10px 24px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ocorrencias.slice(0,5).map((o,i) => {
                            const si = statusOcorr[o.status] || statusOcorr.aberta;
                            return (
                              <tr key={i} style={{ borderBottom:`1px solid ${D.border}` }}>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontDisplay, fontSize:13, fontWeight:600, color:D.text }}>{o.titulo}</td>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{o.unidade}</td>
                                <td style={{ padding:"14px 24px", fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{o.categoria}</td>
                                <td style={{ padding:"14px 24px" }}><span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:si.cor, background:si.bg, padding:"4px 12px", borderRadius:12, whiteSpace:"nowrap" }}>{si.rotulo}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null;

                if (isMobile) {
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {chartCard}{saldoCard}{inadimplCard}{cobrancasCard}{ocorrenciasCard}{atividadeCard}
                    </div>
                  );
                }
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"minmax(0,2fr) minmax(0,1fr)", gap:16, alignItems:"start" }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:16, minWidth:0 }}>
                      {chartCard}
                      {cobrancasCard}
                      {ocorrenciasCard}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:16, minWidth:0 }}>
                      {saldoCard}
                      {inadimplCard}
                      {atividadeCard}
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        )}


        {/* ── Cobranças ── */}
        {aba === "cobrancas" && (
          <div>
            <TopBar title="Cobranças" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Cobranças</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Registre pagamentos e comprovantes</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard }}>
                  {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                <button onClick={exportarCobrancasCSV} style={{ padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>⬇ Exportar CSV</button>
                {!readOnly && !isMobile && <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"9px 16px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>{enviandoEmails?"📧 Enviando...":"📧 Cobrar pendentes"}</button>}
              </div>
            </div>

            {/* ── Cobranças extras / rateios ── */}
            {podeUsar("cobrancaExtra") ? (
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, padding: isMobile?16:20, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: (cobrancasExtras.filter(e=>e.mes===mesSel).length ? 14 : 0), flexWrap:"wrap", gap:10 }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>➕ Cobranças extras — {mesLabel(mesSel)}</div>
                  {!readOnly && (
                    <button onClick={() => { setNovaCobExtra({ descricao:"", modo:"unidade", valor:"", mes: mesSel }); setModal({ type:"novaCobExtra" }); }} style={{ padding:"8px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>+ Nova cobrança extra</button>
                  )}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {cobrancasExtras.filter(e => e.mes === mesSel).map(extra => {
                    const pagosCount = moradores.filter(m => extraPaga(extra.id, m.id)).length;
                    return (
                      <div key={extra.id} style={{ background:D.muted, borderRadius:D.radiusSm, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                        <div style={{ flex:1, minWidth:180 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text }}>{extra.descricao}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>
                            R$ {extra.valorUnitario.toFixed(2).replace(".",",")}/unidade
                            {extra.modo === "rateio" && ` · rateio de R$ ${extra.valorInformado.toFixed(2).replace(".",",")} ÷ ${extra.nUnidades}`}
                          </div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color: pagosCount===moradores.length?D.success:D.textMut, marginTop:4, fontWeight:600 }}>
                            {pagosCount} de {moradores.length} pagaram
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          {!readOnly && <button onClick={() => setModal({ type:"gerenciarExtra", data:{ extraId: extra.id } })} style={{ padding:"7px 14px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Gerenciar</button>}
                          {!readOnly && <button onClick={() => { if(window.confirm(`Remover a cobrança extra "${extra.descricao}"? Isso apaga os registros de pagamento dela.`)) removerCobrancaExtra(extra); }} style={{ padding:"7px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>}
                        </div>
                      </div>
                    );
                  })}
                  {cobrancasExtras.filter(e => e.mes === mesSel).length === 0 && (
                    <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"12px 0" }}>Nenhuma cobrança extra neste mês.</div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background:D.muted, borderRadius:D.radius, padding:"14px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontSize:20 }}>🔒</span>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>Cobranças extras e rateios — plano Padrão</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Cobre taxas de obra, rateios de contas e fundos aprovados em assembleia.</div>
                </div>
                <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
              </div>
            )}

            {isMobile ? (
              <div>{cobMes.map((cob,i) => <CobCard key={i} cob={cob} />)}</div>
            ) : (
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden", marginTop:16 }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F8FAFC" }}>
                      {["Unidade","Morador","Valor","Status","Data Pgto","Ações"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${D.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cobMes.map((cob,i) => {
                      const m = moradores.find(x => x.id === cob.moradorId);
                      if (!m) return null;
                      const enc = encargosCobranca(cob);
                      return (
                        <tr key={i} style={{ borderBottom:`1px solid ${D.border}` }}>
                          <td style={{ padding:"13px 16px", fontWeight:600, color:D.text, fontSize:13 }}>{m.unidade}</td>
                          <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>{m.nome}</td>
                          <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>
                            {enc.multa > 0 || enc.juros > 0 ? (
                              <div>
                                <div style={{ fontWeight:700, color:D.danger }}>R$ {enc.valorTotal.toFixed(2).replace(".",",")}</div>
                                <div style={{ fontSize:11, color:D.textMut }}>base {enc.valorBase.toFixed(2).replace(".",",")} + enc. {(enc.multa+enc.juros).toFixed(2).replace(".",",")}</div>
                              </div>
                            ) : (
                              <span>R$ {enc.valorBase.toFixed(2).replace(".",",")}</span>
                            )}
                          </td>
                          <td style={{ padding:"13px 16px" }}><Badge status={cob.status} /></td>
                          <td style={{ padding:"13px 16px", fontSize:12, color:D.textSec, fontFamily:D.fontBody }}>{cob.dataPagamento || "—"}</td>
                          <td style={{ padding:"13px 16px" }}>
                            <div style={{ display:"flex", gap:8 }}>
                              {cob.status !== "pago" ? (
                                !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"5px 12px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>✓ Registrar Pgto</button>
                              ) : (
                                <>
                                  {cob.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"5px 12px", background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
                                  {!readOnly && <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"5px 12px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>↩ Estornar</button>}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── Moradores ── */}
        {aba === "moradores" && (
          <div>
            <TopBar title="Moradores" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ações */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{moradores.length} unidade{moradores.length!==1?"s":""} cadastrada{moradores.length!==1?"s":""}</div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard, fontFamily:D.fontBody }}>
                    {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                  </select>
                  <button onClick={exportarMoradoresCSV} style={{ padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                    ⬇ Exportar CSV
                  </button>
                  {!readOnly && (
                    <button onClick={() => setModal({ type:"novoMorador" })} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                      + Adicionar morador
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                {isMobile ? (
                  /* Mobile: cards */
                  <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10 }}>
                    {moradores.sort((a,b)=>a.unidade.localeCompare(b.unidade)).map(m => {
                      const cob = cobrancas.find(c=>c.moradorId===m.id&&c.mes===mesSel);
                      return (
                        <div key={m.id} style={{ background:D.muted, borderRadius:D.radiusSm, padding:14, borderLeft:`3px solid ${cob?.status==="pago"?D.success:cob?.status==="atrasado"?D.danger:D.warning}` }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                            <div>
                              <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{m.unidade}</div>
                              {m.proprietario && <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:1 }}>Prop: {m.proprietario}</div>}
                              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{m.nome}</div>
                            </div>
                            {cob && <Badge status={cob.status} />}
                          </div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.email}</div>
                          <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                            <button onClick={() => { setModal({ type:"historico", data:m }); }} style={{ padding:"5px 12px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>📋 Histórico</button>
                            <button onClick={() => { const link=`${window.location.origin}${window.location.pathname}?cond=${condominioId}&morador=${m.id}`; navigator.clipboard.writeText(link); showToast(`Link do ${m.unidade} copiado!`); }} style={{ padding:"5px 12px", background:"#F0FDFA", color:D.success, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🔗 Link</button>
                            {!readOnly && <>
                              <button onClick={() => { setEditMorador({id:m.id,nome:m.nome,unidade:m.unidade,proprietario:m.proprietario||"",email:m.email,telefone:m.telefone||"",tipo:m.tipo||"Proprietário",veiculos:m.veiculos||"",pets:m.pets||"",taxaCustom:m.taxaCustom!=null?String(m.taxaCustom):""}); setModal({type:"editarMorador"}); }} style={{ padding:"5px 12px", background:D.secondary, color:D.accent, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>✏️</button>
                              <button onClick={() => { if(window.confirm(`Remover ${m.nome}?`)) removerMorador(m.id); }} style={{ padding:"5px 12px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                            </>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Desktop: tabela */
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:D.muted }}>
                        {["Unidade","Morador","Contato","Status","Ações"].map(h => (
                          <th key={h} style={{ padding:"12px 20px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {moradores.sort((a,b)=>a.unidade.localeCompare(b.unidade)).map((m,i) => {
                        const cob = cobrancas.find(c=>c.moradorId===m.id&&c.mes===mesSel);
                        return (
                          <tr key={m.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                            <td style={{ padding:"14px 20px" }}>
                              <div style={{ fontFamily:D.fontDisplay, fontSize:13, fontWeight:600, color:D.text }}>{m.unidade}</div>
                              {m.proprietario && <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:2 }}>Prop: {m.proprietario}</div>}
                            </td>
                            <td style={{ padding:"14px 20px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{m.nome}</td>
                            <td style={{ padding:"14px 20px" }}>
                              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.email||"—"}</div>
                              {m.telefone && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>{m.telefone}</div>}
                            </td>
                            <td style={{ padding:"14px 20px" }}>{cob ? <Badge status={cob.status} /> : <span style={{ color:D.textMut, fontSize:12 }}>—</span>}</td>
                            <td style={{ padding:"14px 20px" }}>
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => setModal({ type:"historico", data:m })} style={{ padding:"5px 10px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>📋</button>
                                <button onClick={() => { const link=`${window.location.origin}${window.location.pathname}?cond=${condominioId}&morador=${m.id}`; navigator.clipboard.writeText(link); showToast(`Link do ${m.unidade} copiado!`); }} style={{ padding:"5px 10px", background:"#F0FDFA", color:D.success, border:`1px solid #BBF7D0`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🔗</button>
                                {!readOnly && <>
                                  <button onClick={() => { setEditMorador({id:m.id,nome:m.nome,unidade:m.unidade,proprietario:m.proprietario||"",email:m.email,telefone:m.telefone||"",tipo:m.tipo||"Proprietário",veiculos:m.veiculos||"",pets:m.pets||"",taxaCustom:m.taxaCustom!=null?String(m.taxaCustom):""}); setModal({type:"editarMorador"}); }} style={{ padding:"5px 10px", background:D.secondary, color:D.accent, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>✏️</button>
                                  <button onClick={() => { if(window.confirm(`Remover ${m.nome}?`)) removerMorador(m.id); }} style={{ padding:"5px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                                </>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {aba === "despesas" && (
          <div>
            <TopBar title="Água & Luz" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Água &amp; Luz</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Contas e despesas fixas</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <button onClick={exportarDespesasCSV} style={{ padding:"10px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody }}>⬇ Exportar CSV</button>
                {!readOnly && <button onClick={() => setModal({ type:"novaDespesa" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Nova</button>}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16 }}>
              {[
                { label:"Total Pago",     valor:`R$ ${despesas.filter(d=>d.status==="pago").reduce((s,d)=>s+d.valor,0).toFixed(2).replace(".",",")}`, icon:"✅", cor:"#2E7D32" },
                { label:"Total Pendente", valor:`R$ ${despesas.filter(d=>d.status!=="pago").reduce((s,d)=>s+d.valor,0).toFixed(2).replace(".",",")}`, icon:"⏳", cor:"#B03A2E" },
                { label:"Cadastradas",    valor: despesas.length,                                                                                      icon:"📋", cor:"#2E6DA4" },
              ].map((c,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:12, padding:"14px 14px 12px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${c.cor}` }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{c.icon}</div>
                  <div style={{ fontSize: isMobile ? 16 : 19, fontWeight:700, color:c.cor }}>{c.valor}</div>
                  <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {isMobile ? (
              <div>
                {[...despesas].sort((a,b)=>b.mes.localeCompare(a.mes)).map(d => <DespCard key={d.id} d={d} />)}
                {despesas.length === 0 && <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:24 }}>Nenhuma despesa cadastrada.</div>}
              </div>
            ) : (
              <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.06)", overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F8FAFC" }}>
                      {["Tipo","Descrição","Mês","Valor","Status","Data Pgto","Ações"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${D.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...despesas].sort((a,b)=>b.mes.localeCompare(a.mes)).map(d => (
                      <tr key={d.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                        <td style={{ padding:"13px 16px", fontSize:18 }}>{despCat(d.tipo).icon}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>{d.descricao||despCat(d.tipo).label}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, color:"#6B7A8D" }}>{mesLabel(d.mes)}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:"#1E3A5F" }}>R$ {d.valor.toFixed(2).replace(".",",")}</td>
                        <td style={{ padding:"13px 16px" }}><Badge status={d.status} /></td>
                        <td style={{ padding:"13px 16px", fontSize:12, color:D.textSec, fontFamily:D.fontBody }}>{d.dataPagamento||"—"}</td>
                        <td style={{ padding:"13px 16px" }}>
                          <div style={{ display:"flex", gap:8 }}>
                            {d.status!=="pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ padding:"5px 12px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>✓ Marcar Paga</button>}
                            {d.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ padding:"5px 12px", background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
                            {!readOnly && <button onClick={() => { if(window.confirm("Remover?")) removerDespesa(d.id); }} style={{ padding:"5px 12px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>Remover</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {despesas.length===0 && <tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:"#9aa6b5", fontSize:13 }}>Nenhuma despesa cadastrada.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── Serviços ── */}
        {/* Trava de plano: abas bloqueadas para planos inferiores */}
        {["servicos","reservas","acessos","historico","comunicados","documentos","fundoReserva","entregas","agenda","fluxoCaixa","ocorrencias","enquetes"].includes(aba) && !podeUsar(aba) && (
          <div>
            <TopBar title={{servicos:"Serviços & Manutenção",reservas:"Reservas",acessos:"Controle de Acessos",historico:"Histórico",comunicados:"Comunicados",documentos:"Documentos",fundoReserva:"Fundo de Reserva",entregas:"Controle de Entregas",agenda:"Agenda",fluxoCaixa:"Fluxo de Caixa",ocorrencias:"Ocorrências",enquetes:"Enquetes"}[aba]} user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <UpgradeCard recurso={aba} planoNecessario={RECURSO_PLANO[aba]} isMobile={isMobile} />
          </div>
        )}

        {aba === "servicos" && podeUsar("servicos") && (
          <div>
            <TopBar title="Serviços & Manutenção" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Serviços &amp; Manutenção</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Consertos e melhorias do condomínio</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novoServico" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Novo</button>}
            </div>

            <h3 style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, fontWeight:700, margin:"20px 0 10px", textTransform:"uppercase", letterSpacing:".8px", fontFamily:D.fontBody }}>🟡 Pendentes ({servicos.filter(s=>s.status==="pendente").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:12, marginBottom:8 }}>
              {servicos.filter(s=>s.status==="pendente").map(s => (
                <div key={s.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:18, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}` }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:8 }}>{s.descricao}</div>}
                  <div style={{ fontSize:11, color:D.textMut, fontFamily:D.fontBody }}>Aberto em {s.dataAbertura}</div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => { setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal({ type:"concluirServico", data:s }); }} style={{ padding:"7px 14px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Concluir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"7px 14px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="pendente").length===0 && <div style={{ color:"#9aa6b5", fontSize:13, padding:"4px 0" }}>Nenhum serviço pendente. 🎉</div>}
            </div>

            <h3 style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, fontWeight:700, margin:"24px 0 10px", textTransform:"uppercase", letterSpacing:".8px", fontFamily:D.fontBody }}>✅ Concluídos ({servicos.filter(s=>s.status==="concluido").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {servicos.filter(s=>s.status==="concluido").map(s => (
                <div key={s.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:18, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.success}` }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:8 }}>{s.descricao}</div>}
                  <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, lineHeight:1.8, fontFamily:D.fontBody, background:"#F0F4F8", borderRadius:8, padding:"10px 12px" }}>
                    <div>📅 Início: <b style={{color:"#1E3A5F"}}>{s.dataInicio||"—"}</b> · Fim: <b style={{color:"#1E3A5F"}}>{s.dataFim||"—"}</b></div>
                    <div>🧱 Material: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaterial||0).toFixed(2).replace(".",",")}</b></div>
                    <div>👷 Mão de obra: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaoDeObra||0).toFixed(2).replace(".",",")}</b></div>
                    <div>💰 Total: <b style={{color:D.warning}}>R$ {((s.valorMaterial||0)+(s.valorMaoDeObra||0)).toFixed(2).replace(".",",")}</b></div>
                    {s.obsConclusao && <div style={{marginTop:4}}>📝 {s.obsConclusao}</div>}
                  </div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => reabrirServico(s.id)} style={{ padding:"7px 14px", background:"#FFFBEB", color:"#92400E", border:"1px solid #FDE68A", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>↩ Reabrir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"7px 14px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="concluido").length===0 && <div style={{ color:"#9aa6b5", fontSize:13, padding:"4px 0" }}>Nenhum serviço concluído ainda.</div>}
            </div>
          </div>
          </div>
        )}

        {/* ── Reservas ── */}
        {aba === "reservas" && podeUsar("reservas") && (
          <div>
            <TopBar title="Reservas" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cards de resumo */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12, marginBottom:20 }}>
                {[
                  { label:"Aguardando aprovação", valor: reservas.filter(r=>r.status==="pendente").length,  icon:"⏳", cor:D.warning,  bg:D.warningBg  },
                  { label:"Aprovadas",             valor: reservas.filter(r=>r.status==="aprovada").length,  icon:"✅", cor:D.success,  bg:D.successBg  },
                  { label:"Rejeitadas",            valor: reservas.filter(r=>r.status==="rejeitada").length, icon:"❌", cor:D.danger,   bg:D.dangerBg   },
                ].map((c,i) => (
                  <div key={i} style={{ background:c.bg, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:c.cor, letterSpacing:"-0.02em" }}>{c.valor}</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:3 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Botão nova reserva (síndico) */}
              {!readOnly && (
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
                  <button onClick={() => { setNovaReserva({ area:"Churrasqueira", data:"", horario:"", observacao:"", moradorId:"", moradorNome:"" }); setModal({ type:"novaReservaSindico" }); }} style={{ padding:"9px 18px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                    + Nova Reserva
                  </button>
                </div>
              )}

              {/* Pendentes — precisam de aprovação */}
              {reservas.filter(r=>r.status==="pendente").length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>⏳ Aguardando aprovação</div>
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:D.muted }}>
                          {["Área","Morador","Data","Horário","Observação","Ações"].map(h => (
                            <th key={h} style={{ padding:"10px 18px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reservas.filter(r=>r.status==="pendente").map((r,i) => (
                          <tr key={r.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                            <td style={{ padding:"13px 18px" }}>
                              <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>🔥 {r.area}</div>
                              <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:2 }}>Solicitado em {r.criadoEm}</div>
                            </td>
                            <td style={{ padding:"13px 18px" }}>
                              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.nome}</div>
                              <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec }}>{r.unidade}</div>
                            </td>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.data}</td>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.horario}</td>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{r.observacao||"—"}</td>
                            <td style={{ padding:"13px 18px" }}>
                              {!readOnly && (
                                <div style={{ display:"flex", gap:8 }}>
                                  <button onClick={() => aprovarReserva(r.id)} style={{ padding:"6px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>✓ Aprovar</button>
                                  <button onClick={() => rejeitarReserva(r.id)} style={{ padding:"6px 14px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>✗ Rejeitar</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Histórico de reservas */}
              <div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>📋 Histórico de Reservas</div>
                {reservas.filter(r=>r.status!=="pendente").length === 0 ? (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:32, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhuma reserva aprovada ou rejeitada ainda.</div>
                  </div>
                ) : (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:D.muted }}>
                          {["Área","Morador","Data","Horário","Status","Ações"].map(h => (
                            <th key={h} style={{ padding:"10px 18px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reservas.filter(r=>r.status!=="pendente").map((r,i) => (
                          <tr key={r.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>🔥 {r.area}</td>
                            <td style={{ padding:"13px 18px" }}>
                              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.nome}</div>
                              <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec }}>{r.unidade}</div>
                            </td>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.data}</td>
                            <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.horario}</td>
                            <td style={{ padding:"13px 18px" }}>
                              <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:12, fontWeight:600, background: r.status==="aprovada"?D.successBg:D.dangerBg, color: r.status==="aprovada"?D.success:D.danger }}>
                                <span style={{ width:6, height:6, borderRadius:"50%", background: r.status==="aprovada"?D.success:D.danger }} />
                                {r.status==="aprovada"?"Aprovada":"Rejeitada"}
                              </span>
                            </td>
                            <td style={{ padding:"13px 18px" }}>
                              {!readOnly && (
                                <button onClick={() => { if(window.confirm("Remover esta reserva?")) removerReserva(r.id); }} style={{ padding:"5px 12px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Remover</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Acessos ── */}
        {aba === "acessos" && podeUsar("acessos") && (
          <div>
            <TopBar title="Controle de Acessos" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Controle de Acessos</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Visitantes e prestadores de serviço</p>
              </div>
              {!readOnly && (
                <button onClick={() => { setNovoAcesso({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" }); setModal({ type:"novoAcesso" }); }} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                  + Registrar Entrada
                </button>
              )}
            </div>

            {/* Cards de resumo */}
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap:12, marginBottom:20 }}>
              {[
                { label:"Total de acessos",  valor: acessos.length,                                   icon:"🚪", cor:"#1E3A5F" },
                { label:"Ainda no condomínio", valor: acessos.filter(a=>!a.horaSaida).length,          icon:"🟡", cor:"#F57F17" },
                { label:"Saíram",             valor: acessos.filter(a=>!!a.horaSaida).length,          icon:"✅", cor:"#2E7D32" },
              ].map((c,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:12, padding:"14px 14px 12px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${c.cor}` }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:c.cor }}>{c.valor}</div>
                  <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Lista de acessos */}
            {acessos.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:12, padding:40, textAlign:"center", boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🚪</div>
                <div style={{ color:D.textMut, fontSize:14, fontFamily:D.fontBody }}>Nenhum acesso registrado ainda.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {acessos.map((a) => (
                  <div key={a.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:18, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${a.horaSaida ? "#2E7D32" : "#F57F17"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                      <div>
                        <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{a.nome}</div>
                        {a.empresa && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>🏢 {a.empresa}</div>}
                        <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>📋 {a.motivo}</div>
                        {a.unidade && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>🏠 {a.unidade}</div>}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:12, color:"#1E3A5F", fontWeight:600 }}>{a.dataEntrada}</div>
                        <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>Entrada: {a.horaEntrada}</div>
                        {a.horaSaida
                          ? <div style={{ fontSize:12, color:"#2E7D32", marginTop:2, fontWeight:600 }}>Saída: {a.horaSaida}</div>
                          : <div style={{ fontSize:12, color:"#F57F17", marginTop:2, fontWeight:600 }}>No condomínio</div>
                        }
                      </div>
                    </div>
                    {!readOnly && (
                      <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                        {!a.horaSaida && (
                          <button onClick={() => registrarSaida(a.id)} style={{ padding:"6px 14px", background:"#DCFCE7", color:"#166534", border:"1px solid #86EFAC", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                            ✓ Registrar Saída
                          </button>
                        )}
                        <button onClick={() => { if(window.confirm("Remover este registro?")) removerAcesso(a.id); }} style={{ padding:"6px 14px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                          Remover
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── Comunicados ── */}
        {aba === "comunicados" && podeUsar("comunicados") && (
          <div>
            <TopBar title="Comunicados" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ação */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Avisos e comunicados publicados para todos os moradores</div>
                </div>
                {!readOnly && (
                  <button onClick={() => { setNovoComunicado({ titulo:"", mensagem:"", fixado:false }); setModal({ type:"novoComunicado" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                    + Novo comunicado
                  </button>
                )}
              </div>

              {/* Lista de comunicados */}
              {comunicados.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📢</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhum comunicado ainda</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Publique avisos para que todos os moradores vejam no portal individual.</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {comunicados.map(com => (
                    <div key={com.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"18px 20px", boxShadow:D.shadow, border:`1px solid ${com.fixado ? D.accent : D.border}`, borderLeft:`4px solid ${com.fixado ? D.accent : D.border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          {com.fixado && <span style={{ background:D.secondary, color:D.accent, fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:12, fontFamily:D.fontBody }}>📌 Fixado</span>}
                          <span style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{com.titulo}</span>
                        </div>
                        {!readOnly && (
                          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                            <button onClick={() => alternarFixado(com)} title={com.fixado?"Desafixar":"Fixar no topo"} style={{ padding:"5px 10px", background:D.muted, color:D.textSec, border:`1px solid ${D.border}`, borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>📌</button>
                            <button onClick={() => { if(window.confirm("Remover este comunicado?")) removerComunicado(com.id); }} style={{ padding:"5px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                          </div>
                        )}
                      </div>
                      <p style={{ fontFamily:D.fontBody, fontSize:14, color:D.text, lineHeight:1.6, margin:"0 0 10px", whiteSpace:"pre-wrap" }}>{com.mensagem}</p>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>Publicado em {com.data}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Documentos ── */}
        {aba === "documentos" && podeUsar("documentos") && (
          <div>
            <TopBar title="Documentos" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ação */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Documentos importantes do condomínio, com alerta de vencimento</div>
                {!readOnly && (
                  <button onClick={() => { setNovoDocumento({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"" }); setModal({ type:"novoDocumento" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                    + Novo documento
                  </button>
                )}
              </div>

              {/* Alertas de vencimento próximo */}
              {(() => {
                const vencendo = documentos.filter(d => { const s = situacaoDoc(d.vencimento); return s.dias !== null && s.dias <= 30; });
                if (vencendo.length === 0) return null;
                return (
                  <div style={{ background:D.warningBg, border:`1px solid ${D.warning}`, borderRadius:D.radius, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:22 }}>⚠️</span>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, color:"#92400E" }}>
                      <b>{vencendo.length} documento(s)</b> vencido(s) ou vencendo nos próximos 30 dias. Verifique a lista abaixo.
                    </div>
                  </div>
                );
              })()}

              {/* Lista de documentos */}
              {documentos.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📁</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhum documento cadastrado</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Guarde alvará, apólice de seguro, ART do elevador, contratos e outros documentos importantes.</div>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(auto-fill,minmax(320px,1fr))", gap:14 }}>
                  {documentos.map(docItem => {
                    const s = situacaoDoc(docItem.vencimento);
                    return (
                      <div key={docItem.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"18px 20px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:38, height:38, borderRadius:9, background:D.secondary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📄</div>
                            <div>
                              <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{docItem.nome}</div>
                              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{docItem.categoria}</div>
                            </div>
                          </div>
                          {!readOnly && (
                            <button onClick={() => { if(window.confirm("Remover este documento?")) removerDocumento(docItem.id); }} style={{ padding:"4px 8px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, cursor:"pointer", fontFamily:D.fontBody, flexShrink:0 }}>🗑️</button>
                          )}
                        </div>
                        <div style={{ display:"inline-block", background:s.bg, color:s.cor, fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:20, fontFamily:D.fontBody, marginBottom:10 }}>{s.label}</div>
                        {docItem.obs && <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.5, margin:"0 0 10px" }}>{docItem.obs}</p>}
                        {docItem.arquivo && (
                          <a href={docItem.arquivo} download={docItem.arquivoNome||docItem.nome} style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:13, color:D.accent, fontWeight:600, textDecoration:"none" }}>
                            📎 Baixar arquivo
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Fundo de Reserva ── */}
        {aba === "fundoReserva" && podeUsar("fundoReserva") && (() => {
          const totalAportes  = fundoMovs.filter(m=>m.tipo==="aporte").reduce((s,m)=>s+(m.valor||0),0);
          const totalRetiradas= fundoMovs.filter(m=>m.tipo==="retirada").reduce((s,m)=>s+(m.valor||0),0);
          const saldoFundo    = totalAportes - totalRetiradas;
          const pctFundo      = condominio?.percentualFundo ?? 10;
          const arrecadadoMes = totalArrecadado;
          const aporteSugerido= arrecadadoMes * (pctFundo/100);
          return (
          <div>
            <TopBar title="Fundo de Reserva" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Saldo do fundo — hero */}
              <div style={{ background:`linear-gradient(135deg, ${D.sidebar}, ${D.primary})`, borderRadius:D.radiusXl, padding: isMobile?"22px 20px":"28px 32px", marginBottom:20, color:"#fff", boxShadow:`0 8px 32px rgba(30,58,114,0.3)`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:-20, right:-10, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }} />
                <div style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"1px", opacity:.75, marginBottom:8 }}>🏦 Saldo do Fundo de Reserva</div>
                <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?30:38, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1, marginBottom:12 }}>R$ {saldoFundo.toFixed(2).replace(".",",")}</div>
                <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontSize:10, opacity:.6, textTransform:"uppercase", letterSpacing:".5px", fontFamily:D.fontBody }}>Total aportado</div>
                    <div style={{ fontSize:14, fontWeight:600, fontFamily:D.fontBody }}>R$ {totalAportes.toFixed(2).replace(".",",")}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, opacity:.6, textTransform:"uppercase", letterSpacing:".5px", fontFamily:D.fontBody }}>Total retirado</div>
                    <div style={{ fontSize:14, fontWeight:600, fontFamily:D.fontBody }}>R$ {totalRetiradas.toFixed(2).replace(".",",")}</div>
                  </div>
                </div>
              </div>

              {/* Configuração do percentual + aporte sugerido */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:14, marginBottom:20 }}>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"18px 20px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:10, letterSpacing:"-0.02em" }}>Percentual do fundo</div>
                  <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, margin:"0 0 12px", lineHeight:1.5 }}>Percentual da arrecadação mensal destinado ao fundo (comum: 10%).</p>
                  {!readOnly ? (
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <input type="number" min={0} max={100} defaultValue={pctFundo} id="pctFundoInput" style={{ width:90, padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:15, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
                      <span style={{ fontFamily:D.fontBody, fontSize:15, color:D.textSec }}>%</span>
                      <button onClick={()=>{ const v=parseFloat(document.getElementById("pctFundoInput").value)||0; salvarPercentualFundo(v); }} style={{ padding:"9px 16px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Salvar</button>
                    </div>
                  ) : (
                    <div style={{ fontFamily:D.fontDisplay, fontSize:24, fontWeight:700, color:D.text }}>{pctFundo}%</div>
                  )}
                </div>
                <div style={{ background:D.secondary, borderRadius:D.radius, padding:"18px 20px", border:`1px solid ${D.border}` }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:10, letterSpacing:"-0.02em" }}>Aporte sugerido do mês</div>
                  <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, margin:"0 0 8px", lineHeight:1.5 }}>{pctFundo}% de R$ {arrecadadoMes.toFixed(2).replace(".",",")} arrecadados em {mesLabel(mesSel)}:</p>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:24, fontWeight:700, color:D.primary, letterSpacing:"-0.02em" }}>R$ {aporteSugerido.toFixed(2).replace(".",",")}</div>
                  {!readOnly && (
                    <button onClick={()=>{ setNovaMovFundo({ tipo:"aporte", valor:aporteSugerido.toFixed(2), descricao:`Aporte de ${mesLabel(mesSel)}`, data:"" }); setModal({ type:"novaMovFundo" }); }} style={{ marginTop:12, padding:"8px 16px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Registrar este aporte</button>
                  )}
                </div>
              </div>

              {/* Botões de ação */}
              {!readOnly && (
                <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
                  <button onClick={()=>{ setNovaMovFundo({ tipo:"aporte", valor:"", descricao:"", data:"" }); setModal({ type:"novaMovFundo" }); }} style={{ padding:"10px 18px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>+ Aporte manual</button>
                  <button onClick={()=>{ setNovaMovFundo({ tipo:"retirada", valor:"", descricao:"", data:"" }); setModal({ type:"novaMovFundo" }); }} style={{ padding:"10px 18px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>− Retirada</button>
                </div>
              )}

              {/* Histórico de movimentações */}
              <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>Movimentações</div>
              {fundoMovs.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🏦</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma movimentação ainda</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Registre aportes mensais para construir o fundo de reserva do condomínio.</div>
                </div>
              ) : (
                <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                  {fundoMovs.map((m,i) => (
                    <div key={m.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom: i<fundoMovs.length-1?`1px solid ${D.border}`:"none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ width:36, height:36, borderRadius:9, background: m.tipo==="aporte"?D.successBg:D.dangerBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{m.tipo==="aporte"?"↑":"↓"}</div>
                        <div>
                          <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text }}>{m.descricao}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>{m.data}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:700, color: m.tipo==="aporte"?D.success:D.danger }}>
                          {m.tipo==="aporte"?"+":"−"} R$ {m.valor.toFixed(2).replace(".",",")}
                        </span>
                        {!readOnly && (
                          <button onClick={()=>{ if(window.confirm("Remover esta movimentação?")) removerMovFundo(m.id); }} style={{ background:"none", border:"none", color:D.textMut, cursor:"pointer", fontSize:16 }}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Entregas ── */}
        {aba === "entregas" && podeUsar("entregas") && (() => {
          const aguardando = entregas.filter(e => e.status === "aguardando");
          const retiradas  = entregas.filter(e => e.status === "retirada");
          return (
          <div>
            <TopBar title="Controle de Entregas" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ação */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Registre encomendas recebidas e notifique os moradores</div>
                {!readOnly && (
                  <button onClick={() => { setNovaEntrega({ moradorId:"", remetente:"", descricao:"", obs:"" }); setModal({ type:"novaEntrega" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                    + Registrar encomenda
                  </button>
                )}
              </div>

              {/* Cards de resumo */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
                <div style={{ background:D.warningBg, borderRadius:D.radius, padding:"16px 18px", border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>📦</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.warning, letterSpacing:"-0.02em" }}>{aguardando.length}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>Aguardando retirada</div>
                </div>
                <div style={{ background:D.successBg, borderRadius:D.radius, padding:"16px 18px", border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>✅</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.success, letterSpacing:"-0.02em" }}>{retiradas.length}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>Já retiradas</div>
                </div>
              </div>

              {/* Aguardando retirada */}
              {aguardando.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>📦 Aguardando retirada</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {aguardando.map(e => (
                      <div key={e.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`4px solid ${D.warning}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                          <div style={{ flex:1, minWidth:180 }}>
                            <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{e.descricao}</div>
                            <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginTop:3 }}>Para: <b>{e.moradorNome}</b> · {e.unidade}</div>
                            {e.remetente && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>Remetente: {e.remetente}</div>}
                            {e.obs && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>{e.obs}</div>}
                            <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:6 }}>Chegou em {e.dataChegada} às {e.horaChegada}</div>
                          </div>
                          {!readOnly && (
                            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                              <button onClick={() => marcarRetirada(e)} style={{ padding:"7px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>✓ Retirada</button>
                              <button onClick={() => { if(window.confirm("Remover este registro?")) removerEntrega(e.id); }} style={{ padding:"7px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de retiradas */}
              <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>✅ Já retiradas</div>
              {retiradas.length === 0 && aguardando.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma encomenda registrada</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Quando chegar uma encomenda, registre aqui e o morador será avisado.</div>
                </div>
              ) : retiradas.length === 0 ? (
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, padding:"12px 0" }}>Nenhuma encomenda retirada ainda.</div>
              ) : (
                <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                  {retiradas.map((e,i) => (
                    <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", borderBottom: i<retiradas.length-1?`1px solid ${D.border}`:"none", gap:12, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:160 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text }}>{e.descricao}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{e.moradorNome} · {e.unidade}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.success, fontWeight:600 }}>Retirada</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut }}>{e.dataRetirada}{e.horaRetirada?` às ${e.horaRetirada}`:""}</div>
                      </div>
                      {!readOnly && (
                        <button onClick={() => { if(window.confirm("Remover este registro?")) removerEntrega(e.id); }} style={{ background:"none", border:"none", color:D.textMut, cursor:"pointer", fontSize:16 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Enquetes (síndico) ── */}
        {aba === "enquetes" && podeUsar("enquetes") && (() => {
          const votosDaEnquete = (enqId) => votos.filter(v => v.enqueteId === enqId);
          return (
          <div>
            <TopBar title="Enquetes" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Crie votações para os moradores decidirem pelo portal</div>
                {!readOnly && (
                  <button onClick={() => { setNovaEnquete({ titulo:"", descricao:"", opcoes:["",""] }); setModal({ type:"novaEnquete" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Nova enquete</button>
                )}
              </div>

              {enquetes.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🗳️</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma enquete ainda</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Crie uma votação para os moradores decidirem juntos (obras, cores, datas de assembleia, etc.).</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {enquetes.map(enq => {
                    const vs = votosDaEnquete(enq.id);
                    const total = vs.length;
                    const aberta = enq.status === "aberta";
                    return (
                      <div key={enq.id} style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:"20px 22px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`4px solid ${aberta?D.success:D.textMut}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{enq.titulo}</div>
                            {enq.descricao && <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginTop:3 }}>{enq.descricao}</div>}
                            <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:4 }}>{total} voto{total!==1?"s":""} · {enq.criadoEm}</div>
                          </div>
                          <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color: aberta?D.success:D.textSec, background: aberta?D.successBg:D.muted, padding:"4px 12px", borderRadius:12, whiteSpace:"nowrap" }}>{aberta?"🟢 Aberta":"🔒 Encerrada"}</span>
                        </div>

                        {/* Resultados */}
                        <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:10 }}>
                          {enq.opcoes.map((op,idx) => {
                            const nOp = vs.filter(v => v.opcao === op).length;
                            const pct = total > 0 ? Math.round((nOp/total)*100) : 0;
                            return (
                              <div key={idx}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                                  <span style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, fontWeight:500 }}>{op}</span>
                                  <span style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, fontWeight:600 }}>{nOp} · {pct}%</span>
                                </div>
                                <div style={{ height:8, background:D.muted, borderRadius:4, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:`${pct}%`, background:D.accent, borderRadius:4, transition:"width .3s" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Quem votou (voto identificado) */}
                        {total > 0 && (
                          <details style={{ marginTop:14 }}>
                            <summary style={{ fontFamily:D.fontBody, fontSize:12, color:D.accent, cursor:"pointer", fontWeight:600 }}>Ver quem votou</summary>
                            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                              {vs.map((v,i) => (
                                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontFamily:D.fontBody, fontSize:12, color:D.textSec, padding:"4px 0", borderBottom:`1px solid ${D.border}` }}>
                                  <span>{v.unidade} · {v.nome}</span>
                                  <span style={{ fontWeight:600, color:D.text }}>{v.opcao}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {!readOnly && (
                          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
                            <button onClick={() => encerrarEnquete(enq.id, aberta)} style={{ padding:"7px 14px", background: aberta?D.warningBg:D.successBg, color: aberta?"#92400E":D.success, border:`1px solid ${aberta?"#FDE68A":"#86EFAC"}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>{aberta?"🔒 Encerrar":"🔓 Reabrir"}</button>
                            <button onClick={() => { if(window.confirm(`Remover a enquete "${enq.titulo}"? Os votos serão apagados.`)) removerEnquete(enq); }} style={{ padding:"7px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Ocorrências (síndico) ── */}
        {aba === "ocorrencias" && podeUsar("ocorrencias") && (() => {
          const statusInfo = {
            aberta:       { rotulo:"Aberta",       icon:"🕒", cor:D.warning, bg:D.warningBg },
            em_andamento: { rotulo:"Em andamento", icon:"🔧", cor:D.accent,  bg:D.secondary },
            resolvida:    { rotulo:"Resolvida",    icon:"✅", cor:D.success,  bg:D.successBg },
          };
          const filtradas = filtroOcorrencia === "todas" ? ocorrencias : ocorrencias.filter(o => o.status === filtroOcorrencia);
          const cont = {
            todas: ocorrencias.length,
            aberta: ocorrencias.filter(o=>o.status==="aberta").length,
            em_andamento: ocorrencias.filter(o=>o.status==="em_andamento").length,
            resolvida: ocorrencias.filter(o=>o.status==="resolvida").length,
          };
          const filtros = [
            { id:"todas", label:`Todas (${cont.todas})` },
            { id:"aberta", label:`Abertas (${cont.aberta})` },
            { id:"em_andamento", label:`Em andamento (${cont.em_andamento})` },
            { id:"resolvida", label:`Resolvidas (${cont.resolvida})` },
          ];
          return (
          <div>
            <TopBar title="Ocorrências" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Filtros */}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {filtros.map(f => (
                  <button key={f.id} onClick={()=>setFiltroOcorrencia(f.id)} style={{ padding:"7px 14px", background: filtroOcorrencia===f.id?D.primary:D.bgCard, color: filtroOcorrencia===f.id?"#fff":D.textSec, border:`1px solid ${filtroOcorrencia===f.id?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>{f.label}</button>
                ))}
              </div>

              {filtradas.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🛎️</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma ocorrência {filtroOcorrencia!=="todas"?"nesse status":""}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>As ocorrências abertas pelos moradores no portal aparecem aqui.</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {filtradas.map(o => {
                    const si = statusInfo[o.status] || statusInfo.aberta;
                    return (
                      <div key={o.id} style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:"18px 20px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`4px solid ${si.cor}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{o.titulo}</div>
                            <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:3 }}>
                              {o.unidade} · {o.nome} · {o.categoria} · {o.criadoEm}
                            </div>
                          </div>
                          <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:si.cor, background:si.bg, padding:"4px 12px", borderRadius:12, whiteSpace:"nowrap" }}>{si.icon} {si.rotulo}</span>
                        </div>
                        <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, lineHeight:1.55, margin:"12px 0 0", background:D.muted, padding:"10px 12px", borderRadius:D.radiusSm }}>{o.descricao}</p>
                        {o.respostaSindico && (
                          <div style={{ marginTop:10, fontFamily:D.fontBody, fontSize:13, color:D.text, background:D.secondary, padding:"10px 12px", borderRadius:D.radiusSm }}>
                            <b>Sua resposta:</b> {o.respostaSindico}
                          </div>
                        )}
                        {!readOnly && (
                          <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                            <button onClick={() => { setRespostaOcorr(o.respostaSindico || ""); setModal({ type:"responderOcorrencia", data:{ id:o.id, titulo:o.titulo } }); }} style={{ padding:"7px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Responder</button>
                            {o.status !== "em_andamento" && <button onClick={() => responderOcorrencia(o.id, o.respostaSindico || "", "em_andamento")} style={{ padding:"7px 14px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>🔧 Em andamento</button>}
                            {o.status !== "resolvida" && <button onClick={() => responderOcorrencia(o.id, o.respostaSindico || "", "resolvida")} style={{ padding:"7px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>✅ Resolver</button>}
                            <button onClick={() => { if(window.confirm("Remover esta ocorrência?")) removerOcorrencia(o.id); }} style={{ padding:"7px 10px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, cursor:"pointer", fontFamily:D.fontBody }}>🗑️</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Fluxo de Caixa ── */}
        {aba === "fluxoCaixa" && podeUsar("fluxoCaixa") && (() => {
          // Monta a lista de meses com qualquer movimento + o mês atual, em ordem cronológica
          const mesesComMov = [...new Set([
            mesAtual(),
            ...cobrancas.map(c => c.mes),
            ...despesas.map(d => d.mes),
            ...receitas.map(r => r.mes),
            ...cobrancasExtras.map(e => e.mes),
          ])].filter(Boolean).sort();
          // Saldo acumulado até o fim de cada mês
          let acumulado = 0;
          const linhas = mesesComMov.map(mes => {
            const f = fluxoDoMes(mes);
            acumulado += f.resultado;
            return { mes, ...f, saldoAcumulado: acumulado };
          });
          const saldoAtual = acumulado;
          const fMes = fluxoDoMes(mesSel);
          const receitasMes = receitas.filter(r => r.mes === mesSel);
          const fmt = (v) => `R$ ${v.toFixed(2).replace(".",",")}`;

          return (
          <div>
            <TopBar title="Fluxo de Caixa" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Saldo atual */}
              <div style={{ background:`linear-gradient(135deg, ${D.primary}, ${D.sidebar})`, borderRadius:D.radius, padding: isMobile?"20px":"26px 28px", marginBottom:16, color:"#fff", boxShadow:D.shadowMd }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, opacity:.85 }}>Saldo acumulado em caixa</div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:32, fontWeight:700, letterSpacing:"-0.03em", marginTop:4, color: saldoAtual<0?"#FECACA":"#fff" }}>{fmt(saldoAtual)}</div>
                <div style={{ fontFamily:D.fontBody, fontSize:12, opacity:.8, marginTop:4 }}>Considerando taxas, extras, receitas, despesas e serviços de todos os meses.</div>
              </div>

              {/* Resumo do mês selecionado */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile?"minmax(0,1fr) minmax(0,1fr)":"repeat(3, minmax(0,1fr))", gap:12, marginBottom:16 }}>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Entradas — {mesLabel(mesSel)}</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color:D.success, marginTop:4 }}>{fmt(fMes.entradas)}</div>
                </div>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Saídas — {mesLabel(mesSel)}</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color:D.danger, marginTop:4 }}>{fmt(fMes.saidas)}</div>
                </div>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0, gridColumn: isMobile?"1 / -1":"auto" }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Resultado do mês</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color: fMes.resultado>=0?D.success:D.danger, marginTop:4 }}>{fMes.resultado>=0?"+":""}{fmt(fMes.resultado)}</div>
                </div>
              </div>

              {/* Detalhamento do mês */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:16 }}>
                <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em", marginBottom:14 }}>Detalhamento — {mesLabel(mesSel)}</div>
                {[
                  { label:"💰 Taxas pagas", valor:fMes.taxas, cor:D.success },
                  { label:"➕ Cobranças extras pagas", valor:fMes.extras, cor:D.success },
                  { label:"💵 Receitas avulsas", valor:fMes.recAvulsas, cor:D.success },
                  { label:"💧 Despesas pagas", valor:-fMes.despesasPagas, cor:D.danger },
                  { label:"🔧 Serviços concluídos", valor:-fMes.servConcluidos, cor:D.danger },
                ].map((it,idx) => (
                  <div key={idx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom: idx<4?`1px solid ${D.border}`:"none" }}>
                    <span style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{it.label}</span>
                    <span style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color: it.valor===0?D.textMut:it.cor }}>{it.valor>=0?"+":"−"} {fmt(Math.abs(it.valor))}</span>
                  </div>
                ))}
              </div>

              {/* Receitas avulsas do mês */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: receitasMes.length?14:0, flexWrap:"wrap", gap:10 }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>💵 Receitas avulsas — {mesLabel(mesSel)}</div>
                  {!readOnly && <button onClick={() => { setNovaReceita({ descricao:"", valor:"", categoria:"Outra", mes: mesSel }); setModal({ type:"novaReceita" }); }} style={{ padding:"8px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>+ Nova receita</button>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {receitasMes.map(r => (
                    <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:D.successBg, borderRadius:D.radiusSm, borderLeft:`4px solid ${D.success}` }}>
                      <div>
                        <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{r.descricao}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{r.categoria}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:700, color:D.success }}>+ {fmt(r.valor)}</div>
                        {!readOnly && <button onClick={() => { if(window.confirm("Remover esta receita?")) removerReceita(r.id); }} style={{ background:"none", border:"none", color:D.textMut, cursor:"pointer", fontSize:15 }}>🗑️</button>}
                      </div>
                    </div>
                  ))}
                  {receitasMes.length === 0 && <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, textAlign:"center", padding:"8px 0" }}>Nenhuma receita avulsa neste mês. Ex: aluguel do salão, rendimento, multa recebida.</div>}
                </div>
              </div>

              {/* Histórico mês a mês */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                <div style={{ padding: isMobile?"16px 16px 12px":"18px 24px 14px", borderBottom:`1px solid ${D.border}`, fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Saldo mês a mês</div>
                <div>
                  {[...linhas].reverse().map((l,idx) => (
                    <div key={l.mes} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding: isMobile?"12px 16px":"14px 24px", borderBottom: idx<linhas.length-1?`1px solid ${D.border}`:"none", background: l.mes===mesSel?D.muted:"transparent" }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, textTransform:"capitalize" }}>{mesLabel(l.mes)}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec, marginTop:2 }}>+{fmt(l.entradas)} · −{fmt(l.saidas)}</div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, color: l.resultado>=0?D.success:D.danger }}>{l.resultado>=0?"+":""}{fmt(l.resultado)} no mês</div>
                        <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:700, color: l.saldoAcumulado>=0?D.text:D.danger, marginTop:2 }}>{fmt(l.saldoAcumulado)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
          );
        })()}

        {/* ── Agenda ── */}
        {aba === "agenda" && podeUsar("agenda") && (() => {
          const hoje = new Date(); hoje.setHours(0,0,0,0);
          const parseData = (d) => { const [a,m,dia]=d.split("-").map(Number); return new Date(a,m-1,dia); };
          const ordenados = [...eventos].sort((a,b) => parseData(a.data) - parseData(b.data));
          const proximos = ordenados.filter(e => parseData(e.data) >= hoje);
          const passados = ordenados.filter(e => parseData(e.data) < hoje).reverse();
          const iconeTipo = { "Evento":"🎉", "Manutenção":"🔧", "Assembleia":"📋", "Reunião":"👥", "Feriado":"🏖️", "Outro":"📌" };
          const corTipo = { "Evento":D.accent, "Manutenção":D.warning, "Assembleia":D.primary, "Reunião":D.success, "Feriado":D.danger, "Outro":D.textSec };
          const fmtData = (d) => { const dt=parseData(d); return dt.toLocaleDateString("pt-BR",{ weekday:"short", day:"2-digit", month:"short" }); };
          const diasAte = (d) => { const dt=parseData(d); const diff=Math.ceil((dt-hoje)/(1000*60*60*24)); if(diff===0) return "Hoje"; if(diff===1) return "Amanhã"; return `Em ${diff} dias`; };

          const CardEvento = ({ e, passado }) => (
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`4px solid ${corTipo[e.tipo]||D.textSec}`, opacity: passado?0.7:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ display:"flex", gap:12, flex:1 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{iconeTipo[e.tipo]||"📌"}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{e.titulo}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:3 }}>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, color:corTipo[e.tipo]||D.textSec, fontWeight:600 }}>{e.tipo}</span>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, textTransform:"capitalize" }}>· {fmtData(e.data)}{e.hora?` · ${e.hora}`:""}</span>
                    </div>
                    {e.descricao && <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.5, margin:"8px 0 0" }}>{e.descricao}</p>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                  {!passado && <span style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:600, color: diasAte(e.data)==="Hoje"?D.danger:D.textMut, whiteSpace:"nowrap" }}>{diasAte(e.data)}</span>}
                  {!readOnly && (
                    <button onClick={() => { if(window.confirm("Remover este evento?")) removerEvento(e.id); }} style={{ background:"none", border:"none", color:D.textMut, cursor:"pointer", fontSize:15 }}>🗑️</button>
                  )}
                </div>
              </div>
            </div>
          );

          return (
          <div>
            <TopBar title="Agenda" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Eventos, manutenções, assembleias e datas importantes</div>
                {!readOnly && (
                  <button onClick={() => { setNovoEvento({ titulo:"", tipo:"Evento", data:"", hora:"", descricao:"" }); setModal({ type:"novoEvento" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>
                    + Novo evento
                  </button>
                )}
              </div>

              {eventos.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🗓️</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Agenda vazia</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Adicione eventos, manutenções programadas e assembleias para organizar o condomínio.</div>
                </div>
              ) : (
                <>
                  {proximos.length > 0 && (
                    <div style={{ marginBottom:24 }}>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>Próximos eventos</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {proximos.map(e => <CardEvento key={e.id} e={e} passado={false} />)}
                      </div>
                    </div>
                  )}
                  {passados.length > 0 && (
                    <div>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.textSec, marginBottom:12, letterSpacing:"-0.02em" }}>Eventos passados</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {passados.map(e => <CardEvento key={e.id} e={e} passado={true} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Histórico ── */}
        {aba === "historico" && podeUsar("historico") && (
          <div>
            <TopBar title="Histórico de Atividades" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Histórico de Atividades</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>{logs.length} registro{logs.length!==1?"s":""} no sistema</p>
              </div>
              {!readOnly && logs.length > 0 && (
                <button onClick={async () => { if(window.confirm("Limpar todo o histórico?")) { const batch = writeBatch(db); logs.forEach(l => batch.delete(doc(db,"logs",l.id))); await batch.commit(); showToast("Histórico limpo."); }}} style={{ padding:"8px 16px", background:"#FEE2E2", color:"#991B1B", border:"1px solid #FECACA", borderRadius:D.radiusSm, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  🗑️ Limpar histórico
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:12, padding:40, textAlign:"center", boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ color:D.textMut, fontSize:14, fontFamily:D.fontBody }}>Nenhuma atividade registrada ainda.<br/>As ações realizadas no sistema aparecerão aqui.</div>
              </div>
            ) : (
              <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.06)", overflow:"hidden" }}>
                {logs.map((log, i) => (
                  <div key={log.id} style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"14px 18px", borderBottom: i < logs.length-1 ? "1px solid #F0F4F8" : "none", background: i%2===0 ? D.bgCard : "#F8FAFC" }}>
                    <div style={{ fontSize:22, flexShrink:0, marginTop:1 }}>{log.icone}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:D.text, lineHeight:1.5, fontFamily:D.fontBody }}>{log.descricao}</div>
                      <div style={{ fontSize:11, color:D.textMut, fontFamily:D.fontBody, marginTop:3 }}>{log.dataHora}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── Configurações ── */}
        {aba === "config" && (
          <div>
            <TopBar title="Configurações" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:"0 0 6px", fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Configurações</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 20px", fontSize:13 }}>Parâmetros do condomínio</p>

            {/* Card de assinatura */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:20 }}>
              <h3 style={{ color:D.text, margin:"0 0 16px", fontSize:14, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>💳 Sua assinatura</h3>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                    <span style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.text }}>Plano {PLANOS[condominio?.plano]?.nome || "—"}</span>
                    {(() => {
                      const badges = {
                        cortesia: { label:"Cortesia",  bg:D.secondary,  color:D.primary },
                        ativo:    { label:"Ativo",     bg:D.successBg,  color:D.success },
                        trial:    { label:`Teste · ${infoAssinatura.diasRestantes}d`, bg:D.warningBg, color:"#92400E" },
                        expirado: { label:"Expirado",  bg:D.dangerBg,   color:D.danger },
                      };
                      const b = badges[infoAssinatura.estado] || badges.trial;
                      return <span style={{ background:b.bg, color:b.color, fontSize:12, fontWeight:600, padding:"3px 12px", borderRadius:20, fontFamily:D.fontBody }}>{b.label}</span>;
                    })()}
                  </div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>
                    {condominio?.numApartamentos} apartamentos
                    {condominio?.plano !== "cortesia" && ` · R$ ${PLANOS[condominio?.plano]?.preco || 0}/mês`}
                  </div>
                  {infoAssinatura.estado === "trial" && (
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:4 }}>Teste grátis até {condominio?.trialAte}</div>
                  )}
                </div>
                {infoAssinatura.estado !== "cortesia" && infoAssinatura.estado !== "ativo" && (
                  <a href="mailto:comercial.mysindi@gmail.com" style={{ padding:"10px 20px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Assinar</a>
                )}
              </div>
            </div>

            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
              <h3 style={{ color:D.text, margin:"0 0 16px", fontSize:14, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>Taxa mensal</h3>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Valor (R$)</label>
              <input type="number" value={taxa} onChange={e=>setTaxa(parseFloat(e.target.value)||0)} style={{ display:"block", width:"100%", padding:"12px 14px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:16, color:D.text, marginTop:8, boxSizing:"border-box", fontFamily:D.fontBody }} />
              <button onClick={() => salvarTaxa(taxa)} style={{ marginTop:14, padding:"11px 24px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontWeight:600, fontSize:14, fontWeight:600, cursor:"pointer" }}>Salvar</button>

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>📅 Dia de vencimento</h3>
              <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 14px" }}>O sistema enviará e-mails automaticamente 5 dias antes e no dia do vencimento.</p>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Dia do mês (1–28)</label>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginTop:8 }}>
                <input type="number" min={1} max={28} value={diaVencimento} onChange={e=>setDiaVencimento(parseInt(e.target.value)||10)} style={{ width:100, padding:"12px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:16, color:"#1E3A5F", boxSizing:"border-box" }} />
                <button onClick={() => salvarDiaVencimento(diaVencimento)} style={{ padding:"12px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" }}>Salvar</button>
              </div>

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              {/* Multa e juros por atraso (Padrão) */}
              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>⚖️ Multa e juros por atraso</h3>
              {podeUsar("multaJuros") ? (
                <>
                  <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 14px" }}>Quando ativo, cobranças em atraso recebem multa (uma vez) e juros proporcionais aos dias de atraso. Padrão legal: 2% de multa + 1% de juros ao mês.</p>
                  <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", background:D.muted, padding:"12px 14px", borderRadius:D.radiusSm, marginBottom:14 }}>
                    <input type="checkbox" checked={cobrarMultaJuros} onChange={e=>setCobrarMultaJuros(e.target.checked)} style={{ width:18, height:18, cursor:"pointer" }} />
                    <div style={{ fontFamily:D.fontBody, fontSize:14, color:D.text, fontWeight:600 }}>Cobrar multa e juros automaticamente</div>
                  </label>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Multa (%)</label>
                      <input type="number" step="0.1" min={0} value={multaPercent} onChange={e=>setMultaPercent(e.target.value)} disabled={!cobrarMultaJuros} style={{ width:90, padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:15, color:D.text, boxSizing:"border-box", opacity: cobrarMultaJuros?1:.5 }} />
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Juros ao mês (%)</label>
                      <input type="number" step="0.1" min={0} value={jurosPercentMes} onChange={e=>setJurosPercentMes(e.target.value)} disabled={!cobrarMultaJuros} style={{ width:110, padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:15, color:D.text, boxSizing:"border-box", opacity: cobrarMultaJuros?1:.5 }} />
                    </div>
                    <button onClick={() => salvarConfigMultaJuros(cobrarMultaJuros, multaPercent, jurosPercentMes)} style={{ padding:"11px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" }}>Salvar</button>
                  </div>
                  {cobrarMultaJuros && (
                    <div style={{ marginTop:14, background:D.secondary, borderRadius:D.radiusSm, padding:"12px 14px", fontFamily:D.fontBody, fontSize:12, color:D.text }}>
                      <b>Exemplo:</b> uma taxa de R$ {taxa.toFixed(2).replace(".",",")} com 15 dias de atraso ficaria: R$ {taxa.toFixed(2).replace(".",",")} + multa R$ {(taxa*(parseFloat(multaPercent)||0)/100).toFixed(2).replace(".",",")} + juros R$ {(taxa*(parseFloat(jurosPercentMes)||0)/100*(15/30)).toFixed(2).replace(".",",")} = <b>R$ {(taxa + taxa*(parseFloat(multaPercent)||0)/100 + taxa*(parseFloat(jurosPercentMes)||0)/100*(15/30)).toFixed(2).replace(".",",")}</b>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background:D.muted, borderRadius:D.radiusSm, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <span style={{ fontSize:20 }}>🔒</span>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>Multa e juros — plano Padrão</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Cobre automaticamente multa e juros sobre atrasos.</div>
                  </div>
                  <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
                </div>
              )}

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              {/* Zerar atrasos / início de cobrança — marco zero */}
              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>🔄 Iniciar cobrança a partir do próximo mês</h3>
              <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 12px" }}>
                Define o <b>mês que vem</b> como o primeiro mês de cobrança. As cobranças pendentes de meses anteriores (deste mês pra trás) são <b>removidas</b>, e o sistema passa a gerar e cobrar somente a partir do próximo mês. Não mexe no dia de vencimento nem em pagamentos já registrados. Ideal para o início da operação.
              </p>
              {marcoZero && (
                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginBottom:12, background:D.muted, padding:"10px 12px", borderRadius:D.radiusSm }}>
                  Cobrança ativa a partir de: <b>{(() => { const [y,m]=marcoZero.split("-"); return mesLabel(`${y}-${m}`); })()}</b>
                </div>
              )}
              {!readOnly && (
                <button onClick={() => { if(window.confirm("Iniciar a cobrança só a partir do mês que vem?\n\n• As cobranças pendentes deste mês e anteriores serão REMOVIDAS\n• O sistema passa a cobrar a partir do próximo mês\n• Pagamentos já registrados e o dia de vencimento NÃO são afetados")) zerarAtrasados(); }} style={{ padding:"11px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                  🔄 Iniciar cobrança no próximo mês
                </button>
              )}

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>📧 Disparar e-mails manualmente</h3>
              {podeUsar("emailAuto") ? (
                <>
                  <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 14px" }}>Use estes botões caso queira enviar fora do disparo automático. O sistema evita duplicatas no mesmo dia.</p>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <button onClick={() => dispararEmails("lembrete")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>
                      {enviandoEmails ? "Enviando..." : `📧 Lembrete a todos (${moradores.length})`}
                    </button>
                    <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:"#C9933A", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>
                      {enviandoEmails ? "Enviando..." : `⚠️ Cobrar pendentes (${pendentes})`}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ background:D.muted, borderRadius:D.radiusSm, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <span style={{ fontSize:20 }}>🔒</span>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>E-mails automáticos — plano Padrão</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Envie lembretes e cobranças automáticas por e-mail.</div>
                  </div>
                  <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
                </div>
              )}

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              <h3 style={{ color:"#1E3A5F", margin:"0 0 10px", fontSize:15, fontWeight:700 }}>Conta conectada</h3>
              <div style={{ fontSize:13, color:D.textSec, lineHeight:1.8, background:"#F8FAFC", borderRadius:D.radiusSm, padding:"12px 16px", border:`1px solid ${D.border}` }}>
                <div>E-mail: <b style={{color:"#1E3A5F"}}>{user?.email}</b></div>
                <div style={{ marginTop:6, fontSize:11, color:"#aaa" }}>Para trocar a senha, use o painel do Firebase (Authentication → Users).</div>
              </div>
              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, lineHeight:1.8, fontFamily:D.fontBody }}>
                <div>🏢 Condomínio Vila Real 140</div>
                <div>📦 Versão 2.0 · Firebase + React</div>
              </div>
            </div>
          </div>
          </div>
        )}
      </main>

      {/* ── Modais ── */}
      {modal?.type === "pagar" && (
        <Modal title={`Registrar Pgto — ${modal.data.unidade}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <p style={{ fontSize:13, color:"#6B7A8D", margin:"0 0 16px" }}>Morador: <b style={{color:"#1E3A5F"}}>{modal.data.nome}</b> · Taxa: <b style={{color:D.warning}}>R$ {taxa.toFixed(2).replace(".",",")}</b></p>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Observação</label>
          <input value={pagForm.obs} onChange={e=>setPagForm(p=>({...p,obs:e.target.value}))} placeholder="Ex: Pago via Pix" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:6, marginBottom:14, boxSizing:"border-box" }} />
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Comprovante</label>
          <div onClick={() => fileRef.current.click()} style={{ marginTop:6, border:"2px dashed #D0DAE6", borderRadius:8, padding:"18px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {pagForm.arquivoNome ? <span style={{color:"#2E6DA4",fontWeight:600}}>📎 {pagForm.arquivoNome}</span> : <><div style={{fontSize:22,marginBottom:4}}>📁</div>Toque para selecionar</>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(f) setPagForm(p=>({...p,arquivo:f,arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => registrarPagamento(modal.data.moradorId)} style={{ padding:"10px 20px", background:D.success, color:"#fff", border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "comprovante" && (
        <Modal title={`Comprovante — ${modal.data.nome}`} onClose={() => setModal(null)} isMobile={isMobile}>
          {modal.data.comprovante?.startsWith("data:image") ? (
            <img src={modal.data.comprovante} alt="comprovante" style={{ width:"100%", borderRadius:8, border:"1px solid #E8EDF3" }} />
          ) : modal.data.comprovante?.startsWith("data:application/pdf") ? (
            <div style={{ textAlign:"center", padding:20 }}>
              <div style={{ fontSize:48, marginBottom:10 }}>📄</div>
              <p style={{ color:"#1E3A5F", fontWeight:600, marginBottom:14 }}>{modal.data.arquivoNome||"comprovante.pdf"}</p>
              <a href={modal.data.comprovante} download={modal.data.arquivoNome||"comprovante.pdf"} style={{ padding:"10px 24px", background:"#2E6DA4", color:"#fff", borderRadius:8, textDecoration:"none", fontSize:13, fontWeight:600 }}>⬇ Baixar PDF</a>
            </div>
          ) : <p style={{ color:"#6B7A8D", textAlign:"center" }}>Nenhum comprovante.</p>}
        </Modal>
      )}

      {modal?.type === "estorno" && (
        <Modal title="Confirmar Estorno" onClose={() => setModal(null)} isMobile={isMobile}>
          <p style={{ color:"#2C3E50", fontSize:14 }}>Estornar pagamento de <b>{modal.data.nome}</b>? O status voltará para Pendente.</p>
          <div style={{ display:"flex", gap:8, marginTop:18, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => estornarPagamento(modal.data.moradorId)} style={{ padding:"10px 20px", background:D.danger, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer" }}>↩ Estornar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoMorador" && (
        <Modal title="Novo Morador" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Nome *</label>
              <input value={novoMorador.nome} onChange={e=>setNovoMorador(p=>({...p,nome:e.target.value}))} placeholder="Ex: João da Silva" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Unidade *</label>
                <input value={novoMorador.unidade} onChange={e=>setNovoMorador(p=>({...p,unidade:e.target.value}))} placeholder="Ex: Apto 103" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Tipo</label>
                <select value={novoMorador.tipo} onChange={e=>setNovoMorador(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, background:"#fff", fontFamily:D.fontBody }}>
                  <option>Proprietário</option>
                  <option>Inquilino</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Proprietário / Dono do apartamento</label>
              <input value={novoMorador.proprietario} onChange={e=>setNovoMorador(p=>({...p,proprietario:e.target.value}))} placeholder="Ex: Dona Maísa (deixe vazio se for o próprio morador)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>E-mail *</label>
              <input type="email" value={novoMorador.email} onChange={e=>setNovoMorador(p=>({...p,email:e.target.value}))} placeholder="joao@email.com" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Telefone / WhatsApp</label>
              <input value={novoMorador.telefone} onChange={e=>setNovoMorador(p=>({...p,telefone:e.target.value}))} placeholder="(85) 99999-0000" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Veículos</label>
                <input value={novoMorador.veiculos} onChange={e=>setNovoMorador(p=>({...p,veiculos:e.target.value}))} placeholder="Ex: ABC-1234 (Gol)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Pets</label>
                <input value={novoMorador.pets} onChange={e=>setNovoMorador(p=>({...p,pets:e.target.value}))} placeholder="Ex: 1 cão (Rex)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Taxa individual (opcional)</label>
              <input type="number" value={novoMorador.taxaCustom} onChange={e=>setNovoMorador(p=>({...p,taxaCustom:e.target.value}))} placeholder={`Padrão: R$ ${taxa.toFixed(2).replace(".",",")}`} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"5px 0 0" }}>Deixe em branco para usar a taxa padrão do condomínio. Preencha se esta unidade paga um valor diferente.</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:18, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={adicionarMorador} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Cadastrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "historico" && modal.data && (() => {
        const m = modal.data;
        const cobMorador = cobrancas
          .filter(c => c.moradorId === m.id)
          .sort((a,b) => b.mes.localeCompare(a.mes));
        const totalPago   = cobMorador.filter(c=>c.status==="pago").length;
        const totalAtraso = cobMorador.filter(c=>c.status==="atrasado").length;
        return (
          <Modal title={`Histórico — ${m.nome}`} onClose={() => setModal(null)} isMobile={isMobile}>
            <div style={{ marginBottom:16, background:D.muted, borderRadius:D.radius, padding:"12px 16px", border:`1px solid ${D.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:D.text, fontWeight:600, fontFamily:D.fontBody }}>{m.unidade}</span>
                {m.tipo && <span style={{ background:D.secondary, color:D.primary, fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:12, fontFamily:D.fontBody }}>{m.tipo}</span>}
                {m.taxaCustom != null && <span style={{ background:D.warningBg, color:"#92400E", fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:12, fontFamily:D.fontBody }}>Taxa: R$ {Number(m.taxaCustom).toFixed(2).replace(".",",")}</span>}
              </div>
              <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:6, lineHeight:1.8 }}>
                📧 {m.email}{m.telefone ? ` · 📱 ${m.telefone}` : ""}
                {m.veiculos ? <><br/>🚗 {m.veiculos}</> : ""}
                {m.pets ? <><br/>🐾 {m.pets}</> : ""}
              </div>
              <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
                <div style={{ fontSize:12 }}>✅ <b style={{color:"#2E7D32"}}>{totalPago}</b> pagamento{totalPago!==1?"s":""} em dia</div>
                <div style={{ fontSize:12 }}>🚨 <b style={{color:"#B03A2E"}}>{totalAtraso}</b> atraso{totalAtraso!==1?"s":""}</div>
                <div style={{ fontSize:12 }}>📋 <b style={{color:"#1E3A5F"}}>{cobMorador.length}</b> meses no sistema</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight: isMobile ? "55vh" : "400px", overflowY:"auto" }}>
              {cobMorador.length === 0 && (
                <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:20 }}>Nenhum registro encontrado.</div>
              )}
              {cobMorador.map((c, i) => {
                const corBorda = c.status==="pago" ? "#2E7D32" : c.status==="atrasado" ? "#B03A2E" : "#F57F17";
                const bgStatus = c.status==="pago" ? "#E8F5E9" : c.status==="atrasado" ? "#FFEBEE" : "#FFF8E1";
                const icone    = c.status==="pago" ? "✅" : c.status==="atrasado" ? "🚨" : "⏳";
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:bgStatus, borderRadius:10, borderLeft:`4px solid ${corBorda}` }}>
                    <div>
                      <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:13 }}>{mesLabel(c.mes)}</div>
                      {c.dataPagamento && <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>Pago em {c.dataPagamento}</div>}
                      {c.obs && <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>📝 {c.obs}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                      <span style={{ fontSize:16 }}>{icone}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:corBorda, textTransform:"capitalize" }}>{c.status}</span>
                      <span style={{ fontSize:12, color:"#1E3A5F", fontWeight:600 }}>R$ {taxa.toFixed(2).replace(".",",")}</span>
                      {c.status === "pago" && (
                        <button onClick={() => gerarReciboPDF(m, c.dataPagamento, c.obs)} style={{ fontSize:11, padding:"3px 8px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, cursor:"pointer", fontWeight:600, marginTop:2 }}>
                          📄 Recibo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      {modal?.type === "editarMorador" && editMorador && (
        <Modal title="Editar Morador" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Nome *</label>
              <input value={editMorador.nome} onChange={e=>setEditMorador(p=>({...p,nome:e.target.value}))} placeholder="Ex: João da Silva" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Unidade *</label>
                <input value={editMorador.unidade} onChange={e=>setEditMorador(p=>({...p,unidade:e.target.value}))} placeholder="Ex: Apto 103" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Tipo</label>
                <select value={editMorador.tipo} onChange={e=>setEditMorador(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, background:"#fff", fontFamily:D.fontBody }}>
                  <option>Proprietário</option>
                  <option>Inquilino</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Proprietário / Dono do apartamento</label>
              <input value={editMorador.proprietario} onChange={e=>setEditMorador(p=>({...p,proprietario:e.target.value}))} placeholder="Ex: Dona Maísa (deixe vazio se for o próprio morador)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>E-mail *</label>
              <input type="email" value={editMorador.email} onChange={e=>setEditMorador(p=>({...p,email:e.target.value}))} placeholder="joao@email.com" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Telefone / WhatsApp</label>
              <input value={editMorador.telefone} onChange={e=>setEditMorador(p=>({...p,telefone:e.target.value}))} placeholder="(85) 99999-0000" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Veículos</label>
                <input value={editMorador.veiculos} onChange={e=>setEditMorador(p=>({...p,veiculos:e.target.value}))} placeholder="Ex: ABC-1234 (Gol)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Pets</label>
                <input value={editMorador.pets} onChange={e=>setEditMorador(p=>({...p,pets:e.target.value}))} placeholder="Ex: 1 cão (Rex)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Taxa individual (opcional)</label>
              <input type="number" value={editMorador.taxaCustom} onChange={e=>setEditMorador(p=>({...p,taxaCustom:e.target.value}))} placeholder={`Padrão: R$ ${taxa.toFixed(2).replace(".",",")}`} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
              <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"5px 0 0" }}>Deixe em branco para usar a taxa padrão do condomínio.</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:18, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={salvarEdicaoMorador} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Salvar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoEvento" && (
        <Modal title="Novo Evento" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Título *</label>
              <input value={novoEvento.titulo} onChange={e=>setNovoEvento(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Assembleia geral ordinária" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Tipo</label>
              <select value={novoEvento.tipo} onChange={e=>setNovoEvento(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option>Evento</option>
                <option>Manutenção</option>
                <option>Assembleia</option>
                <option>Reunião</option>
                <option>Feriado</option>
                <option>Outro</option>
              </select>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:2 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Data *</label>
                <input type="date" value={novoEvento.data} onChange={e=>setNovoEvento(p=>({...p,data:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Hora</label>
                <input type="time" value={novoEvento.hora} onChange={e=>setNovoEvento(p=>({...p,hora:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição</label>
              <textarea value={novoEvento.descricao} onChange={e=>setNovoEvento(p=>({...p,descricao:e.target.value}))} rows={3} placeholder="Detalhes do evento (opcional)" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical", lineHeight:1.5 }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={salvarEvento} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>🗓️ Salvar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaEntrega" && (
        <Modal title="Registrar Encomenda" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Morador destinatário *</label>
              <select value={novaEntrega.moradorId} onChange={e=>setNovaEntrega(p=>({...p,moradorId:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option value="">Selecione o morador</option>
                {[...moradores].sort((a,b)=>a.unidade.localeCompare(b.unidade)).map(m => (
                  <option key={m.id} value={m.id}>{m.unidade} — {m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição da encomenda *</label>
              <input value={novaEntrega.descricao} onChange={e=>setNovaEntrega(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Caixa média, envelope, sedex..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Remetente / loja</label>
              <input value={novaEntrega.remetente} onChange={e=>setNovaEntrega(p=>({...p,remetente:e.target.value}))} placeholder="Ex: Mercado Livre, Amazon..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Observação</label>
              <input value={novaEntrega.obs} onChange={e=>setNovaEntrega(p=>({...p,obs:e.target.value}))} placeholder="Ex: deixada na portaria" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            {podeUsar("emailAuto") && (
              <div style={{ background:D.secondary, borderRadius:D.radiusSm, padding:"10px 14px", fontFamily:D.fontBody, fontSize:12, color:D.textSec, display:"flex", alignItems:"center", gap:8 }}>
                <span>📧</span> O morador será notificado por e-mail automaticamente (se tiver e-mail cadastrado).
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={registrarEntrega} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>📦 Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaEnquete" && (
        <Modal title="Nova Enquete" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Pergunta *</label>
              <input value={novaEnquete.titulo} onChange={e=>setNovaEnquete(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Aprova a troca do portão?" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição (opcional)</label>
              <textarea value={novaEnquete.descricao} onChange={e=>setNovaEnquete(p=>({...p,descricao:e.target.value}))} rows={2} placeholder="Detalhes ou contexto da votação" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical", lineHeight:1.5 }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Opções de voto *</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {novaEnquete.opcoes.map((op,idx) => (
                  <div key={idx} style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input value={op} onChange={e=>setNovaEnquete(p=>{ const o=[...p.opcoes]; o[idx]=e.target.value; return {...p,opcoes:o}; })} placeholder={`Opção ${idx+1}`} style={{ flex:1, padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
                    {novaEnquete.opcoes.length > 2 && (
                      <button onClick={()=>setNovaEnquete(p=>({...p,opcoes:p.opcoes.filter((_,i)=>i!==idx)}))} style={{ background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, padding:"8px 11px", cursor:"pointer", fontSize:14 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {novaEnquete.opcoes.length < 6 && (
                <button onClick={()=>setNovaEnquete(p=>({...p,opcoes:[...p.opcoes,""]}))} style={{ marginTop:8, background:"none", border:`1.5px dashed ${D.border}`, color:D.accent, borderRadius:D.radiusSm, padding:"8px 14px", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:D.fontBody, width:"100%" }}>+ Adicionar opção</button>
              )}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={criarEnquete} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>🗳️ Criar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "responderOcorrencia" && (
        <Modal title="Responder Ocorrência" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginBottom:14 }}>{modal.data.titulo}</div>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Resposta ao morador</label>
          <textarea value={respostaOcorr} onChange={e=>setRespostaOcorr(e.target.value)} rows={4} placeholder="Ex: Equipe de manutenção agendada para amanhã de manhã." style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical", lineHeight:1.5 }} />
          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:8 }}>A resposta fica visível para o morador no portal.</div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end", flexWrap:"wrap" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={() => responderOcorrencia(modal.data.id, respostaOcorr, "em_andamento")} style={{ padding:"10px 18px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>Salvar (em andamento)</button>
            <button onClick={() => responderOcorrencia(modal.data.id, respostaOcorr, "resolvida")} style={{ padding:"10px 18px", background:D.success, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>Salvar e resolver</button>
          </div>
        </Modal>
      )}

      {modal?.type === "meuPlano" && (() => {
        const info = infoAssinatura;
        const pl = PLANOS[condominio?.plano] || {};
        const rotuloEstado = {
          cortesia: { txt:"Cortesia (acesso total)", cor:D.success, bg:D.successBg },
          ativo:    { txt:"Assinatura ativa",         cor:D.success, bg:D.successBg },
          trial:    { txt:`Teste grátis · ${info.diasRestantes} dia(s) restante(s)`, cor:D.warning, bg:D.warningBg },
          expirado: { txt:"Expirado",                 cor:D.danger,  bg:D.dangerBg },
        }[info.estado] || { txt:info.estado, cor:D.textSec, bg:D.muted };
        const ciclo = condominio?.cicloCobranca === "anual" ? "anual" : "mensal";
        const preco = ciclo === "anual" ? pl.precoAnual : pl.preco;
        return (
          <Modal title="Meu plano" onClose={() => setModal(null)} isMobile={isMobile}>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:24, fontWeight:700, color:D.text, letterSpacing:"-0.02em" }}>{pl.nome || "—"}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{condominio?.nome}</div>
                </div>
                <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:rotuloEstado.cor, background:rotuloEstado.bg, padding:"6px 14px", borderRadius:20 }}>{rotuloEstado.txt}</span>
              </div>

              {condominio?.plano !== "cortesia" && (
                <div style={{ background:D.muted, borderRadius:D.radius, padding:"14px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontFamily:D.fontBody, fontSize:13 }}>
                    <span style={{ color:D.textSec }}>Valor</span>
                    <span style={{ color:D.text, fontWeight:600 }}>R$ {preco || 0}/{ciclo === "anual" ? "ano" : "mês"}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontFamily:D.fontBody, fontSize:13 }}>
                    <span style={{ color:D.textSec }}>Cobrança</span>
                    <span style={{ color:D.text, fontWeight:600, textTransform:"capitalize" }}>{ciclo}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontFamily:D.fontBody, fontSize:13 }}>
                    <span style={{ color:D.textSec }}>Limite de unidades</span>
                    <span style={{ color:D.text, fontWeight:600 }}>até {pl.limite}</span>
                  </div>
                </div>
              )}

              {condominio?.plano === "cortesia" && (
                <div style={{ background:D.successBg, borderRadius:D.radius, padding:"14px 16px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>
                  🎁 Seu condomínio tem <b>acesso cortesia</b> — todos os recursos liberados, sem cobrança e sem prazo de expiração.
                </div>
              )}

              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.5 }}>
                Para mudar de plano, renovar ou tirar dúvidas sobre a assinatura, fale com a gente:
              </div>
              <a href="https://wa.me/5585996532638" target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px", background:D.success, color:"#fff", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:14, fontWeight:600, textDecoration:"none" }}>
                💬 Falar no WhatsApp
              </a>
            </div>
          </Modal>
        );
      })()}

      {modal?.type === "novaReceita" && (
        <Modal title="Nova Receita Avulsa" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição *</label>
              <input value={novaReceita.descricao} onChange={e=>setNovaReceita(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Aluguel do salão de festas" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Categoria</label>
              <select value={novaReceita.categoria} onChange={e=>setNovaReceita(p=>({...p,categoria:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option>Aluguel de espaço</option>
                <option>Rendimento / Aplicação</option>
                <option>Multa recebida</option>
                <option>Doação</option>
                <option>Outra</option>
              </select>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Valor *</label>
                <input type="number" value={novaReceita.valor} onChange={e=>setNovaReceita(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Mês *</label>
                <input type="month" value={novaReceita.mes} onChange={e=>setNovaReceita(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={adicionarReceita} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>💵 Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaCobExtra" && (() => {
        const valorInf = parseFloat(novaCobExtra.valor) || 0;
        const nUn = moradores.length || 1;
        const previa = novaCobExtra.modo === "rateio" ? (valorInf / nUn) : valorInf;
        return (
        <Modal title="Nova Cobrança Extra" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição *</label>
              <input value={novaCobExtra.descricao} onChange={e=>setNovaCobExtra(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Pintura da fachada" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Como cobrar</label>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setNovaCobExtra(p=>({...p,modo:"unidade"}))} style={{ flex:1, padding:"10px", background: novaCobExtra.modo==="unidade"?D.primary:D.muted, color: novaCobExtra.modo==="unidade"?"#fff":D.text, border:`1px solid ${novaCobExtra.modo==="unidade"?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textAlign:"left" }}>
                  Valor por unidade<br/><span style={{ fontSize:10, opacity:.8, fontWeight:400 }}>cada um paga o valor informado</span>
                </button>
                <button onClick={()=>setNovaCobExtra(p=>({...p,modo:"rateio"}))} style={{ flex:1, padding:"10px", background: novaCobExtra.modo==="rateio"?D.primary:D.muted, color: novaCobExtra.modo==="rateio"?"#fff":D.text, border:`1px solid ${novaCobExtra.modo==="rateio"?D.primary:D.border}`, borderRadius:D.radiusSm, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textAlign:"left" }}>
                  Ratear valor total<br/><span style={{ fontSize:10, opacity:.8, fontWeight:400 }}>divide o total entre as unidades</span>
                </button>
              </div>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>{novaCobExtra.modo==="rateio"?"Valor total *":"Valor por unidade *"}</label>
                <input type="number" value={novaCobExtra.valor} onChange={e=>setNovaCobExtra(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Mês *</label>
                <input type="month" value={novaCobExtra.mes} onChange={e=>setNovaCobExtra(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
            </div>
            {valorInf > 0 && (
              <div style={{ background:D.secondary, borderRadius:D.radiusSm, padding:"12px 14px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>
                {novaCobExtra.modo==="rateio"
                  ? <>Rateio de <b>R$ {valorInf.toFixed(2).replace(".",",")}</b> entre <b>{nUn}</b> unidades = <b>R$ {previa.toFixed(2).replace(".",",")}</b> por unidade</>
                  : <>Cada uma das <b>{nUn}</b> unidades pagará <b>R$ {previa.toFixed(2).replace(".",",")}</b> (total R$ {(previa*nUn).toFixed(2).replace(".",",")})</>}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={criarCobrancaExtra} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>Criar</button>
          </div>
        </Modal>
        );
      })()}

      {modal?.type === "gerenciarExtra" && (() => {
        const extra = cobrancasExtras.find(e => e.id === modal.data.extraId);
        if (!extra) return null;
        return (
        <Modal title={extra.descricao} onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginBottom:14 }}>
            R$ {extra.valorUnitario.toFixed(2).replace(".",",")} por unidade · {mesLabel(extra.mes)}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:"50vh", overflowY:"auto" }}>
            {[...moradores].sort((a,b)=>a.unidade.localeCompare(b.unidade)).map(m => {
              const pago = extraPaga(extra.id, m.id);
              return (
                <div key={m.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background: pago?D.successBg:D.muted, borderRadius:D.radiusSm }}>
                  <div>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{m.unidade}</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.nome}</div>
                  </div>
                  {pago ? (
                    <button onClick={() => estornarExtra(extra, m.id)} style={{ padding:"6px 12px", background:"#fff", color:D.danger, border:`1px solid #FECACA`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>✓ Pago · estornar</button>
                  ) : (
                    <button onClick={() => marcarExtraPaga(extra, m.id)} style={{ padding:"6px 12px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Marcar pago</button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 20px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Fechar</button>
          </div>
        </Modal>
        );
      })()}

      {modal?.type === "novaMovFundo" && (
        <Modal title={novaMovFundo.tipo === "aporte" ? "Aporte ao Fundo" : "Retirada do Fundo"} onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setNovaMovFundo(p=>({...p,tipo:"aporte"}))} style={{ flex:1, padding:"10px", background: novaMovFundo.tipo==="aporte"?D.success:D.muted, color: novaMovFundo.tipo==="aporte"?"#fff":D.text, border:`1px solid ${novaMovFundo.tipo==="aporte"?D.success:D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>↑ Aporte</button>
              <button onClick={()=>setNovaMovFundo(p=>({...p,tipo:"retirada"}))} style={{ flex:1, padding:"10px", background: novaMovFundo.tipo==="retirada"?D.danger:D.muted, color: novaMovFundo.tipo==="retirada"?"#fff":D.text, border:`1px solid ${novaMovFundo.tipo==="retirada"?D.danger:D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>↓ Retirada</button>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Valor (R$) *</label>
              <input type="number" value={novaMovFundo.valor} onChange={e=>setNovaMovFundo(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Descrição *</label>
              <input value={novaMovFundo.descricao} onChange={e=>setNovaMovFundo(p=>({...p,descricao:e.target.value}))} placeholder={novaMovFundo.tipo==="aporte"?"Ex: Aporte de Janeiro":"Ex: Reforma da fachada"} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Data</label>
              <input type="date" value={novaMovFundo.data ? (()=>{ const p=novaMovFundo.data.split("/"); return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:""; })() : ""} onChange={e=>{ const v=e.target.value; if(v){ const [a,m,d]=v.split("-"); setNovaMovFundo(p=>({...p,data:`${d}/${m}/${a}`})); } else setNovaMovFundo(p=>({...p,data:""})); }} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"5px 0 0" }}>Em branco = data de hoje.</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={registrarMovFundo} style={{ padding:"10px 20px", background: novaMovFundo.tipo==="aporte"?D.success:D.danger, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoDocumento" && (
        <Modal title="Novo Documento" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Nome do documento *</label>
              <input value={novoDocumento.nome} onChange={e=>setNovoDocumento(p=>({...p,nome:e.target.value}))} placeholder="Ex: Alvará de funcionamento" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Categoria</label>
              <select value={novoDocumento.categoria} onChange={e=>setNovoDocumento(p=>({...p,categoria:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option>Alvará</option>
                <option>Seguro / Apólice</option>
                <option>Elevador (ART)</option>
                <option>Contrato</option>
                <option>Certidão</option>
                <option>AVCB (Bombeiros)</option>
                <option>Outro</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Data de vencimento</label>
              <input type="date" value={novoDocumento.vencimento} onChange={e=>setNovoDocumento(p=>({...p,vencimento:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"5px 0 0" }}>Deixe em branco se o documento não vence.</p>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Observação</label>
              <input value={novoDocumento.obs} onChange={e=>setNovoDocumento(p=>({...p,obs:e.target.value}))} placeholder="Ex: renovar na prefeitura" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Arquivo (opcional)</label>
              <input type="file" onChange={e=>{ const f=e.target.files[0]; if(f) setNovoDocumento(p=>({...p,arquivo:f,arquivoNome:f.name})); }} style={{ display:"block", width:"100%", fontFamily:D.fontBody, fontSize:13, color:D.textSec }} />
              {novoDocumento.arquivoNome && <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.success, margin:"6px 0 0" }}>✓ {novoDocumento.arquivoNome}</p>}
              <p style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, margin:"5px 0 0" }}>Arquivos grandes podem deixar o sistema lento. Ideal até ~1 MB (PDF ou imagem).</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={salvarDocumento} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>📁 Salvar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoComunicado" && (
        <Modal title="Novo Comunicado" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Título *</label>
              <input value={novoComunicado.titulo} onChange={e=>setNovoComunicado(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Falta d'água na terça-feira" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Mensagem *</label>
              <textarea value={novoComunicado.mensagem} onChange={e=>setNovoComunicado(p=>({...p,mensagem:e.target.value}))} rows={5} placeholder="Escreva o comunicado completo aqui..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical", lineHeight:1.5 }} />
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
              <input type="checkbox" checked={novoComunicado.fixado} onChange={e=>setNovoComunicado(p=>({...p,fixado:e.target.checked}))} style={{ width:18, height:18, cursor:"pointer" }} />
              <span style={{ fontFamily:D.fontBody, fontSize:14, color:D.text }}>📌 Fixar no topo (destaque)</span>
            </label>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={publicarComunicado} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>📢 Publicar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaReservaSindico" && (
        <Modal title="Nova Reserva" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Morador *</label>
              <select value={novaReserva.moradorId||""} onChange={e => { const m=moradores.find(x=>x.id===e.target.value); setNovaReserva(p=>({...p,moradorId:e.target.value,moradorNome:m?.nome||"",moradorUnidade:m?.unidade||""})); }} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option value="">Selecione o morador</option>
                {[...moradores].sort((a,b)=>a.unidade.localeCompare(b.unidade)).map(m => (
                  <option key={m.id} value={m.id}>{m.unidade} — {m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Área *</label>
              <select value={novaReserva.area} onChange={e=>setNovaReserva(p=>({...p,area:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text }}>
                <option value="Churrasqueira">🔥 Churrasqueira</option>
                <option value="Salão de Festas">🎉 Salão de Festas</option>
                <option value="Espaço Gourmet">🍽️ Espaço Gourmet</option>
              </select>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Data *</label>
                <input type="date" value={novaReserva.data} onChange={e=>setNovaReserva(p=>({...p,data:e.target.value}))} min={new Date().toISOString().split("T")[0]} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Horário *</label>
                <input value={novaReserva.horario} onChange={e=>setNovaReserva(p=>({...p,horario:e.target.value}))} placeholder="Ex: 14h às 22h" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Observação</label>
              <textarea value={novaReserva.observacao} onChange={e=>setNovaReserva(p=>({...p,observacao:e.target.value}))} rows={2} placeholder="Número de pessoas, ocasião..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text, resize:"vertical" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={async () => {
              if (!novaReserva.moradorId) { showToast("Selecione um morador.", "error"); return; }
              const m = moradores.find(x=>x.id===novaReserva.moradorId);
              const ok = await solicitarReserva(novaReserva.moradorId, m, novaReserva);
              if (ok) {
                // síndico aprova automaticamente — busca a reserva recém-criada deste morador
                const snap = await getDocs(query(collection(db, "reservas"), where("condominioId","==",condominioId), where("moradorId","==",novaReserva.moradorId)));
                const ultima = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.timestamp-a.timestamp)[0];
                if (ultima) await aprovarReserva(ultima.id);
                setModal(null);
              }
            }} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:D.fontBody }}>✓ Reservar e Aprovar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoAcesso" && (
        <Modal title="Registrar Entrada" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Nome *</label>
              <input value={novoAcesso.nome} onChange={e=>setNovoAcesso(p=>({...p,nome:e.target.value}))} placeholder="Ex: João Silva" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Empresa / Vínculo</label>
              <input value={novoAcesso.empresa} onChange={e=>setNovoAcesso(p=>({...p,empresa:e.target.value}))} placeholder="Ex: Hidráulica ABC, Familiar do morador..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Motivo *</label>
              <input value={novoAcesso.motivo} onChange={e=>setNovoAcesso(p=>({...p,motivo:e.target.value}))} placeholder="Ex: Conserto de encanamento, Visita ao morador..." style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Apartamento visitado</label>
              <select value={novoAcesso.unidade} onChange={e=>setNovoAcesso(p=>({...p,unidade:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, background:"#fff" }}>
                <option value="">Área comum / Não especificado</option>
                {[...moradores].sort((a,b)=>a.unidade.localeCompare(b.unidade)).map(m => (
                  <option key={m.id} value={m.unidade}>{m.unidade} — {m.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Data de entrada</label>
                <input type="date" value={novoAcesso.dataEntrada} onChange={e=>setNovoAcesso(p=>({...p,dataEntrada:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Hora de entrada</label>
                <input type="time" value={novoAcesso.horaEntrada} onChange={e=>setNovoAcesso(p=>({...p,horaEntrada:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
              </div>
            </div>
            <p style={{ fontSize:11, color:D.textMut, fontFamily:D.fontBody, margin:0 }}>Se data/hora ficarem em branco, serão preenchidas automaticamente com o momento atual.</p>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={registrarAcesso} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaDespesa" && (
        <Modal title="Nova Despesa" onClose={() => setModal(null)} isMobile={isMobile}>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Categoria</label>
          <select value={novaDespesa.tipo} onChange={e=>setNovaDespesa(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box", background:"#fff", color:D.text, fontFamily:D.fontBody }}>
            <option value="agua">💧 Água</option>
            <option value="luz">⚡ Luz</option>
            <option value="limpeza">🧹 Limpeza</option>
            <option value="portaria">🛡️ Portaria / Segurança</option>
            <option value="elevador">🛗 Elevador</option>
            <option value="jardinagem">🌳 Jardinagem</option>
            <option value="salario">👷 Zelador / Salário</option>
            <option value="internet">🌐 Internet / Telefone</option>
            <option value="manutencao">🔧 Manutenção</option>
            <option value="material">📦 Material</option>
            <option value="impostos">🧾 Impostos / Taxas</option>
            <option value="outro">📌 Outra despesa</option>
          </select>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Descrição</label>
          <input value={novaDespesa.descricao} onChange={e=>setNovaDespesa(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Conta Enel Jun" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box", fontFamily:D.fontBody }} />
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Valor *</label>
              <input type="number" value={novaDespesa.valor} onChange={e=>setNovaDespesa(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Mês *</label>
              <input type="month" value={novaDespesa.mes} onChange={e=>setNovaDespesa(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
            </div>
          </div>
          {/* Despesa recorrente */}
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginTop:14, background:D.muted, padding:"12px 14px", borderRadius:D.radiusSm }}>
            <input type="checkbox" checked={novaDespesa.recorrente} onChange={e=>setNovaDespesa(p=>({...p,recorrente:e.target.checked}))} style={{ width:18, height:18, cursor:"pointer" }} />
            <div>
              <div style={{ fontFamily:D.fontBody, fontSize:14, color:D.text, fontWeight:600 }}>🔁 Despesa recorrente</div>
              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>
                {novaDespesa.recorrente && novaDespesa.mes
                  ? `Será lançada todos os meses até dezembro/${novaDespesa.mes.split("-")[0]}`
                  : "Repete o lançamento todos os meses até dezembro"}
              </div>
            </div>
          </label>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginTop:14 }}>Comprovante</label>
          <div onClick={() => fileRefDespesa.current.click()} style={{ marginTop:6, border:"2px dashed #D0DAE6", borderRadius:8, padding:"16px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {novaDespesa.arquivoNome ? <span style={{color:"#2E6DA4",fontWeight:600}}>📎 {novaDespesa.arquivoNome}</span> : <>📁 Toque para selecionar</>}
          </div>
          <input ref={fileRefDespesa} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(f) setNovaDespesa(p=>({...p,arquivo:f,arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
            <button onClick={adicionarDespesa} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoServico" && (
        <Modal title="Novo Serviço" onClose={() => setModal(null)} isMobile={isMobile}>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Título *</label>
          <input value={novoServico.titulo} onChange={e=>setNovoServico(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Consertar o portão" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box" }} />
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Descrição</label>
          <textarea value={novoServico.descricao} onChange={e=>setNovoServico(p=>({...p,descricao:e.target.value}))} placeholder="Detalhes do serviço" rows={3} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarServico} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "concluirServico" && (
        <Modal title={`Concluir — ${modal.data.titulo}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Início</label>
              <input type="date" value={concluirForm.dataInicio} onChange={e=>setConcluirForm(p=>({...p,dataInicio:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Fim</label>
              <input type="date" value={concluirForm.dataFim} onChange={e=>setConcluirForm(p=>({...p,dataFim:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Material (R$)</label>
              <input type="number" value={concluirForm.valorMaterial} onChange={e=>setConcluirForm(p=>({...p,valorMaterial:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Mão de obra (R$)</label>
              <input type="number" value={concluirForm.valorMaoDeObra} onChange={e=>setConcluirForm(p=>({...p,valorMaoDeObra:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
          </div>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Observações</label>
          <textarea value={concluirForm.obs} onChange={e=>setConcluirForm(p=>({...p,obs:e.target.value}))} rows={2} placeholder="Ex: Trocado motor do portão" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => concluirServico(modal.data.id)} style={{ padding:"10px 20px", background:D.success, color:"#fff", border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar</button>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
