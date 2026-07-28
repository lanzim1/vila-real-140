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
const portalToken = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("t")
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
const Toast = ({ msg, type, onClose, acao, rotuloAcao }) => {
  // Com ação de desfazer o toast fica mais tempo: 3,5s não dá pra ler e decidir.
  useEffect(() => { const t = setTimeout(onClose, acao ? 8000 : 3500); return () => clearTimeout(t); }, []);
  const bg = type === "error" ? D.danger : D.primary;
  return (
    <div style={{ position:"fixed", bottom:88, right:16, left:16, background:bg, color:"#fff", padding:"14px 18px", borderRadius:12, fontSize:14, zIndex:9999, boxShadow:D.shadowMd, display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ width:22, height:22, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:700 }}>{type==="error"?"✕":"✓"}</span>
      <span style={{ flex:1, lineHeight:1.5 }}>{msg}</span>
      {acao && (
        <button onClick={() => { acao(); onClose(); }} style={{ background:"#fff", color:bg, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, borderRadius:8, padding:"7px 14px", flexShrink:0, fontFamily:D.fontBody }}>
          {rotuloAcao || "Desfazer"}
        </button>
      )}
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
        <div style={{ width:64, height:64, borderRadius:16, background:D.secondary, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", color:D.accent }}><NavIcon id="lock" size={30} /></div>
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
const TopBar = ({ title, user, readOnly, nPendentes, moradores, onBuscar, onConfig, onPlano, avisos, onIrPara }) => {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const [avisosAberto, setAvisosAberto] = useState(false);
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
        <p style={{ fontFamily:D.fontBody, fontSize: isMobile?11:12, color:D.textSec, margin:"2px 0 0", textTransform:"capitalize", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{hoje}</p>
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

        {/* Sino de avisos: mostra tudo que precisa de atenção, de qualquer aba */}
        {!readOnly && (
        <div style={{ position:"relative" }}>
          <button onClick={() => { setAvisosAberto(v=>!v); setMenuAberto(false); }} title={`${avisos?.length||0} aviso(s)`}
            style={{ position:"relative", display:"flex", alignItems:"center", background:"none", border:"none", cursor:"pointer", padding:6, color: avisosAberto?D.accent:D.textSec }}>
            <NavIcon id="sino" size={20} />
            {avisos?.length > 0 && (
              <span style={{ position:"absolute", top:0, right:0, background:D.danger, color:"#fff", fontFamily:D.fontBody, fontSize:10, fontWeight:700, minWidth:16, height:16, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", border:`2px solid ${D.bgCard}` }}>{avisos.length > 99 ? "99+" : avisos.length}</span>
            )}
          </button>
          {avisosAberto && (
            <div style={{ position:"absolute", top:"calc(100% + 8px)", right: isMobile?-60:0, width: isMobile?290:340, background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radius, boxShadow:D.shadowMd || D.shadow, overflow:"hidden", zIndex:70, maxHeight:400, display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"12px 16px", borderBottom:`1px solid ${D.border}`, fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>
                Avisos {avisos?.length ? `(${avisos.length})` : ""}
              </div>
              <div style={{ overflowY:"auto" }}>
                {(!avisos || avisos.length === 0) ? (
                  <div style={{ padding:"22px 16px", textAlign:"center", fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Tudo em dia. Nenhum aviso no momento.</div>
                ) : avisos.map((av, i) => (
                  <button key={i} onClick={() => { onIrPara && onIrPara(av.aba); setAvisosAberto(false); }}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding:"12px 16px", background:"none", border:"none", borderBottom: i<avisos.length-1?`1px solid ${D.border}`:"none", cursor:"pointer", textAlign:"left", fontFamily:D.fontBody }}>
                    <span style={{ width:30, height:30, borderRadius:8, background:D.muted, color:av.cor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={av.icon} size={15} /></span>
                    <span style={{ flex:1, fontSize:12.5, color:D.text, minWidth:0, lineHeight:1.4 }}>{av.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Perfil + menu */}
        <div style={{ position:"relative" }}>
          <button onClick={()=>{ setMenuAberto(v=>!v); setAvisosAberto(false); }} style={{ display:"flex", alignItems:"center", gap:10, background:"none", border:"none", cursor:"pointer", padding:"4px 6px 4px 4px", borderRadius:D.radiusSm, fontFamily:D.fontBody }}>
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
// ── Documentos legais (LGPD) ──
// IMPORTANTE: textos-base. Devem ser revisados por um advogado antes de valerem
// juridicamente. Ajuste o nome da empresa/responsável e o e-mail do encarregado.
const CONTATO_DPO = "comercial.mysindi@gmail.com";
const TEXTO_PRIVACIDADE = `POLÍTICA DE PRIVACIDADE — MySindi

Última atualização: ${new Date().toLocaleDateString("pt-BR")}

Esta Política explica como o MySindi ("nós") coleta, usa, armazena e protege os dados pessoais tratados na plataforma de gestão de condomínios, em conformidade com a Lei nº 13.709/2018 (LGPD).

1. QUEM TRATA OS DADOS
O MySindi é a plataforma que hospeda os dados. O síndico/administrador do condomínio é o responsável por inserir e gerenciar os dados dos moradores, atuando como controlador dessas informações. O MySindi atua como operador, tratando os dados conforme as instruções do síndico e para viabilizar o serviço.

2. DADOS QUE COLETAMOS
- Do síndico/administrador: nome, e-mail, e dados de acesso.
- Dos moradores (inseridos pelo síndico): nome, unidade, e-mail, telefone, proprietário do imóvel, veículos, pets e informações de cobrança (valores, status de pagamento).
- Dados de uso: registros de acesso e ações realizadas na plataforma (logs), para segurança e auditoria.

3. PARA QUE USAMOS
Os dados são usados exclusivamente para a gestão do condomínio: emissão e controle de cobranças, comunicação entre síndico e moradores, reservas de áreas, ocorrências, enquetes, prestação de contas e demais funções da plataforma.

4. BASE LEGAL
O tratamento se fundamenta na execução de contrato e no legítimo interesse da gestão condominial, além do consentimento quando aplicável, nos termos dos artigos 7º e 10 da LGPD.

5. COMPARTILHAMENTO
Não vendemos dados pessoais. Os dados podem ser processados por provedores de infraestrutura (como Google Firebase, para hospedagem e banco de dados, e provedores de envio de e-mail), estritamente para operar o serviço. Esses provedores seguem seus próprios padrões de segurança.

6. ARMAZENAMENTO E SEGURANÇA
Os dados são armazenados em servidores do Google Firebase. Adotamos medidas técnicas de segurança, como isolamento de dados por condomínio e controle de acesso. Nenhum sistema é 100% imune; em caso de incidente de segurança relevante, notificaremos os titulares e a ANPD conforme a LGPD.

7. RETENÇÃO
Os dados são mantidos enquanto durar a relação de uso da plataforma. Após o encerramento, podem ser mantidos pelo prazo necessário ao cumprimento de obrigações legais e, depois, eliminados.

8. DIREITOS DO TITULAR
Você pode solicitar a qualquer momento: confirmação e acesso aos seus dados, correção, anonimização, portabilidade, eliminação e informação sobre compartilhamento. Para exercer, entre em contato pelo e-mail abaixo. Solicitações que envolvam dados de moradores devem ser encaminhadas ao síndico do condomínio, que é o controlador.

9. COOKIES
Utilizamos apenas os cookies e o armazenamento local necessários para autenticação e funcionamento da plataforma. Não usamos cookies de publicidade.

10. CONTATO / ENCARREGADO (DPO)
Dúvidas ou solicitações relativas a dados pessoais: ${CONTATO_DPO}.

11. ALTERAÇÕES
Esta Política pode ser atualizada. A data no topo indica a última revisão.`;

const TEXTO_TERMOS = `TERMOS DE USO — MySindi

Última atualização: ${new Date().toLocaleDateString("pt-BR")}

Ao criar uma conta e usar o MySindi, você concorda com estes Termos.

1. O SERVIÇO
O MySindi é uma plataforma online de gestão de condomínios (cobranças, moradores, finanças, reservas, comunicação e funções relacionadas). Oferecemos o serviço "como está", buscando a maior disponibilidade possível, sem garantia de funcionamento ininterrupto.

2. CADASTRO E CONTA
Para usar, é necessário criar uma conta com dados verdadeiros. Você é responsável por manter a confidencialidade de suas credenciais e por todas as ações realizadas na sua conta.

3. RESPONSABILIDADES DO SÍNDICO/ADMINISTRADOR
Ao inserir dados de moradores, você declara ter base legal para isso e assume o papel de controlador desses dados, comprometendo-se a usá-los apenas para a gestão do condomínio e a respeitar a LGPD.

4. PLANOS E PAGAMENTO
O serviço pode ser oferecido em planos gratuitos (teste), de cortesia ou pagos. As condições de cada plano (limites e valores) são informadas na contratação. Planos de teste podem expirar.

5. USO ACEITÁVEL
É proibido usar a plataforma para fins ilícitos, inserir dados sem autorização, tentar burlar a segurança ou acessar dados de outros condomínios.

6. PROPRIEDADE INTELECTUAL
O software, a marca e o design do MySindi pertencem aos seus criadores. Os dados inseridos pertencem ao respectivo condomínio/usuário.

7. LIMITAÇÃO DE RESPONSABILIDADE
O MySindi não se responsabiliza por decisões administrativas ou financeiras tomadas com base nas informações do sistema, nem por perdas decorrentes de uso indevido, força maior ou falhas de terceiros (provedores de infraestrutura).

8. CANCELAMENTO
Você pode encerrar o uso quando quiser. Podemos suspender contas que violem estes Termos.

9. ALTERAÇÕES E FORO
Estes Termos podem ser atualizados. Questões não resolvidas amigavelmente serão tratadas conforme a legislação brasileira.

Contato: ${CONTATO_DPO}.`;

// Sobreposição que exibe um documento legal em tela cheia
const LegalDoc = ({ tipo, onClose }) => {
  const isMobile = useIsMobile();
  const titulo = tipo === "termos" ? "Termos de Uso" : "Política de Privacidade";
  const texto = tipo === "termos" ? TEXTO_TERMOS : TEXTO_PRIVACIDADE;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(3px)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding: isMobile?12:24 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:D.bgCard, borderRadius:D.radius, width:"100%", maxWidth:720, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:D.shadowMd, overflow:"hidden" }}>
        <div style={{ padding: isMobile?"16px 18px":"18px 24px", borderBottom:`1px solid ${D.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h2 style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.text, margin:0, letterSpacing:"-0.02em" }}>{titulo}</h2>
          <button onClick={onClose} style={{ background:D.muted, border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:D.textSec }}>✕</button>
        </div>
        <div style={{ padding: isMobile?"18px":"24px 28px", overflowY:"auto", fontFamily:D.fontBody, fontSize:13.5, color:D.text, lineHeight:1.7, whiteSpace:"pre-wrap" }}>
          {texto}
          <div style={{ marginTop:20, padding:"12px 14px", background:D.warningBg, borderRadius:D.radiusSm, fontSize:12, color:"#92400E" }}>
            ⚠️ Documento-base. Recomendamos revisão por um advogado especializado antes da vigência definitiva.
          </div>
        </div>
        <div style={{ padding:"14px 24px", borderTop:`1px solid ${D.border}`, textAlign:"right" }}>
          <button onClick={onClose} style={{ padding:"10px 22px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

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
  const [aceito, setAceito] = useState(false);      // consentimento LGPD (cadastro)
  const [docLegal, setDocLegal] = useState(null);   // "privacidade" | "termos" | null
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
    if (!aceito) { setErr("Para criar a conta, você precisa aceitar a Política de Privacidade e os Termos de Uso."); return; }
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
      const aceiteEm = new Date().toISOString();
      // 1º o condomínio (a regra do vínculo exige que ele já exista e seja seu)
      await setDoc(doc(db, "condominios", condId), {
        nome: nomeCond.trim(), plano, numApartamentos: parseInt(numApt) || 0,
        taxa: 180, diaVencimento: 10,
        sindicoEmail: emailG, sindicoNome: nomeG, sindicoUid: uid,
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        ativo: true,
        trialAte: new Date(Date.now() + 14*24*60*60*1000).toLocaleDateString("pt-BR"),
        statusAssinatura: "trial", cicloCobranca: "mensal",
        aceitouTermos: true, aceitouTermosEm: aceiteEm,
      });
      // 2º o vínculo usuário → condomínio
      await setDoc(doc(db, "usuarios", uid), {
        email: emailG, nome: nomeG, condominioId: condId, papel: "sindico",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        aceitouTermos: true, aceitouTermosEm: aceiteEm,
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
    if (!aceito) { setErr("Para criar a conta, você precisa aceitar a Política de Privacidade e os Termos de Uso."); return; }
    setLoading(true);
    try {
      // 1. Cria a conta (faz login automático)
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const uid = cred.user.uid;

      // 1b. Se este e-mail foi convidado por um síndico, entra no condomínio dele
      //     com o papel definido no convite — em vez de criar um condomínio novo.
      const convSnap = await getDoc(doc(db, "convites", email.trim().toLowerCase()));
      if (convSnap.exists() && convSnap.data().condominioId) {
        const conv = convSnap.data();
        await setDoc(doc(db, "usuarios", uid), {
          email: email.trim(),
          nome: nomeSindico.trim(),
          condominioId: conv.condominioId,
          papel: conv.papel || "sindico",
          criadoEm: new Date().toLocaleDateString("pt-BR"),
          aceitouTermos: true, aceitouTermosEm: new Date().toISOString(),
        });
        await deleteDoc(doc(db, "convites", email.trim().toLowerCase())).catch(()=>{});
        return; // o onAuthStateChanged assume daqui
      }

      const condId = gerarCondId(nomeCond);
      const plano = planoPorTamanho(numApt);
      const aceiteEm = new Date().toISOString();

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
        aceitouTermos: true, aceitouTermosEm: aceiteEm,
      });

      // 3. Vincula usuário → condomínio (o app relê com re-tentativa ao carregar)
      await setDoc(doc(db, "usuarios", uid), {
        email: email.trim(),
        nome: nomeSindico.trim(),
        condominioId: condId,
        papel: "sindico",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        aceitouTermos: true, aceitouTermosEm: aceiteEm,
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

        {modo === "cadastro" && (
          <label style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:16, cursor:"pointer", fontFamily:D.fontBody }}>
            <input type="checkbox" checked={aceito} onChange={e=>setAceito(e.target.checked)} style={{ width:18, height:18, marginTop:1, flexShrink:0, cursor:"pointer", accentColor:D.primary }} />
            <span style={{ fontSize:12.5, color:D.textSec, lineHeight:1.5 }}>
              Li e aceito a <button type="button" onClick={()=>setDocLegal("privacidade")} style={{ background:"none", border:"none", padding:0, color:D.accent, fontWeight:600, cursor:"pointer", fontSize:12.5, fontFamily:D.fontBody, textDecoration:"underline" }}>Política de Privacidade</button> e os <button type="button" onClick={()=>setDocLegal("termos")} style={{ background:"none", border:"none", padding:0, color:D.accent, fontWeight:600, cursor:"pointer", fontSize:12.5, fontFamily:D.fontBody, textDecoration:"underline" }}>Termos de Uso</button>.
            </span>
          </label>
        )}

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
      {docLegal && <LegalDoc tipo={docLegal} onClose={()=>setDocLegal(null)} />}
    </div>
  );
};

// ── Landing Page (MySindi) ──
// Número que "rola" suavemente ao mudar de valor (efeito estilo number-flow, sem libs)
const NumeroAnimado = ({ valor }) => {
  const [display, setDisplay] = useState(valor);
  const anteriorRef = useRef(valor);
  useEffect(() => {
    const de = anteriorRef.current;
    const para = valor;
    if (de === para) return;
    const dur = 480;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(de + (para - de) * eased));
      if (p < 1) { raf = requestAnimationFrame(tick); }
      else { anteriorRef.current = para; }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <span>{display.toLocaleString("pt-BR")}</span>;
};

const LandingPage = ({ onEntrar, onCadastrar }) => {
  const isMobile = useIsMobile();
  const [cicloAnual, setCicloAnual] = useState(false);
  const [docLegal, setDocLegal] = useState(null);

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
                    <div style={{ height:19, marginBottom:2 }}>
                      {cicloAnual && (
                        <span style={{ fontSize:13, color: dest?"rgba(255,255,255,0.5)":D.textMut, textDecoration:"line-through" }}>R$ {(p.preco*12).toLocaleString("pt-BR")}/ano</span>
                      )}
                    </div>
                    <span style={{ fontFamily:D.fontDisplay, fontSize:40, fontWeight:700, color: dest?"#fff":D.text, letterSpacing:"-0.03em" }}>
                      R$ <NumeroAnimado valor={cicloAnual ? p.precoAnual : p.preco} />
                    </span>
                    <span style={{ fontSize:15, color: dest?"rgba(255,255,255,0.7)":D.textSec }}>{cicloAnual ? "/ano" : "/mês"}</span>
                    <div style={{ fontSize:12, color: dest?"rgba(255,255,255,0.6)":D.textMut, marginTop:4 }}>
                      {cicloAnual
                        ? `equivale a R$ ${Math.round(p.precoAnual/12)}/mês`
                        : `R$ ${p.precoAnual.toLocaleString("pt-BR")} no plano anual · 2 meses grátis`}
                    </div>
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
        <p style={{ fontSize:13, margin:"0 0 12px" }}>Gestão de condomínios simples e profissional.</p>
        <div style={{ display:"flex", gap:18, justifyContent:"center", flexWrap:"wrap", marginBottom:14 }}>
          <button onClick={()=>setDocLegal("privacidade")} style={{ background:"none", border:"none", color:"rgba(226,232,240,0.7)", fontSize:13, cursor:"pointer", fontFamily:D.fontBody, textDecoration:"underline" }}>Política de Privacidade</button>
          <button onClick={()=>setDocLegal("termos")} style={{ background:"none", border:"none", color:"rgba(226,232,240,0.7)", fontSize:13, cursor:"pointer", fontFamily:D.fontBody, textDecoration:"underline" }}>Termos de Uso</button>
        </div>
        <p style={{ fontSize:12, color:"rgba(226,232,240,0.4)", margin:0 }}>© {new Date().getFullYear()} MySindi · Todos os direitos reservados</p>
      </footer>
      {docLegal && <LegalDoc tipo={docLegal} onClose={()=>setDocLegal(null)} />}
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
      valor: paraNumero(novoGasto.valor) || 0,
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
              <input type="text" inputMode="decimal" value={novoGasto.valor} onChange={e=>setNovoGasto(p=>({...p,valor:e.target.value}))} placeholder="Valor (R$)" style={{ flex: isMobile?"1 1 100%":"1 1 100px", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
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
// Recibo de pagamento em PDF. No nível de módulo para ser usado tanto pelo síndico
// quanto pelo portal do morador, sem duplicar código.
// Desenha o logo do condomínio no cabeçalho do PDF, se houver um cadastrado.
// Fica no canto direito para não competir com o nome. Se a imagem falhar, o PDF
// continua sendo gerado sem ela — nunca deixa o documento quebrado por causa do logo.
const desenharLogoPDF = (docPdf, logo, { x = 172, y = 8, tamanho = 22 } = {}) => {
  if (!logo) return false;
  try {
    const formato = String(logo).includes("image/png") ? "PNG" : "JPEG";
    docPdf.addImage(logo, formato, x, y, tamanho, tamanho, undefined, "FAST");
    return true;
  } catch (e) {
    console.error("Não foi possível inserir o logo no PDF:", e);
    return false;
  }
};

const gerarReciboPDF = (morador, dataPagamento, obs, { mesSel, taxa, nomeCondominio, logo }) => {
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
  docPdf.text(nomeCondominio, 14, 16);
  docPdf.setFontSize(10);
  docPdf.setFont("helvetica","normal");
  docPdf.text("Recibo de Pagamento de Taxa Condominial", 14, 26);
  desenharLogoPDF(docPdf, logo);
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
  docPdf.text(`${nomeCondominio} — Sistema de Gestão Condominial`, 14, y);

  docPdf.save(`recibo-${morador.unidade.replace(/\s/g,"-")}-${mesSel}.pdf`);
};

function PortalMorador({ moradorId, db, taxa, mesLabel, mesAtual }) {
  const [morador, setMorador]     = useState(null);
  const [docLegal, setDocLegal]   = useState(null);
  const [cobrancas, setCobrancas] = useState([]);
  const [reservasMor, setReservasMor] = useState([]);
  const [comunicadosMor, setComunicadosMor] = useState([]);
  const [condoConfig, setCondoConfig] = useState(null);
  const [extrasMor, setExtrasMor] = useState([]);
  const [pagExtrasMor, setPagExtrasMor] = useState([]);
  const [documentosMor, setDocumentosMor] = useState([]);
  const [mesSel, setMesSel]       = useState(mesAtual());
  const [formReserva, setFormReserva] = useState({ area:"Churrasqueira", data:"", horario:"", observacao:"" });
  const [enviandoReserva, setEnviandoReserva] = useState(false);
  const [msgReserva, setMsgReserva] = useState(null);
  const [ocorrenciasMor, setOcorrenciasMor] = useState([]);
  const [formOcorrencia, setFormOcorrencia] = useState({ titulo:"", categoria:"Manutenção", descricao:"" });
  const [enviandoOcorrencia, setEnviandoOcorrencia] = useState(false);
  const [msgOcorrencia, setMsgOcorrencia] = useState(null);
  const [enquetesMor, setEnquetesMor] = useState([]);
  const [votosMor, setVotosMor] = useState([]);
  const [secaoAberta, setSecaoAberta] = useState(null);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!moradorId) return;
    const u1 = onSnapshot(doc(db, "moradores", moradorId), d => {
      if (!d.exists()) { setAcessoNegado(true); return; }
      const dados = d.data();
      // Se o morador tem token, o link precisa trazer o token certo.
      // Moradores antigos (sem token) continuam funcionando — links já distribuídos não quebram.
      if (dados.tokenPortal && dados.tokenPortal !== portalToken) { setAcessoNegado(true); return; }
      setAcessoNegado(false);
      setMorador({ id:d.id, ...dados });
    });
    return () => { u1(); };
  }, [moradorId]);

  // Cobranças do morador — filtradas TAMBÉM pelo condomínio.
  // Antes buscava só por moradorId: cobranças órfãs (sem condominioId ou de outro
  // condomínio) apareciam no portal e o síndico nem sabia que existiam.
  useEffect(() => {
    if (!moradorId || !morador?.condominioId) return;
    const doCond = (arr) => arr.filter(x => x.condominioId === morador.condominioId);
    const uCob = onSnapshot(
      query(collection(db, "cobrancas"), where("moradorId","==",moradorId)),
      s => setCobrancas(doCond(s.docs.map(d => ({ id:d.id, ...d.data() }))).sort((a,b) => b.mes.localeCompare(a.mes)))
    );
    const uRes = onSnapshot(
      query(collection(db, "reservas"), where("moradorId","==",moradorId)),
      s => setReservasMor(doCond(s.docs.map(d => ({ id:d.id, ...d.data() }))).sort((a,b) => b.timestamp - a.timestamp))
    );
    return () => { uCob(); uRes(); };
  }, [moradorId, morador?.condominioId]);

  // Documentos que o síndico liberou para os moradores (convenção, regimento, atas...)
  useEffect(() => {
    if (!morador?.condominioId) return;
    const u = onSnapshot(
      query(collection(db, "documentos"), where("condominioId","==",morador.condominioId)),
      s => setDocumentosMor(s.docs.map(d => ({ id:d.id, ...d.data() })).filter(d => d.publico))
    );
    return u;
  }, [morador?.condominioId]);

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
      s => setOcorrenciasMor(s.docs.map(d => ({ id:d.id, ...d.data() })).filter(o => o.condominioId === morador?.condominioId).sort((a,b) => b.timestamp - a.timestamp))
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
    if (!formReserva.data || !formReserva.horario) { setMsgReserva({ texto:"Preencha a data e o horário.", ok:false }); return; }
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
      setMsgReserva({ texto:"Reserva solicitada! Aguarde a aprovação do síndico.", ok:true });
    } catch(e) {
      setMsgReserva({ texto:"Não foi possível enviar. Verifique sua conexão e tente de novo.", ok:false });
    } finally {
      setEnviandoReserva(false);
    }
  };

  const abrirOcorrencia = async () => {
    if (!formOcorrencia.titulo.trim() || !formOcorrencia.descricao.trim()) { setMsgOcorrencia({ texto:"Preencha o título e a descrição.", ok:false }); return; }
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
      setMsgOcorrencia({ texto:"Ocorrência registrada. O síndico irá avaliar.", ok:true });
    } catch(e) {
      setMsgOcorrencia({ texto:"Não foi possível registrar. Verifique sua conexão e tente de novo.", ok:false });
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

  if (acessoNegado) return (
    <div style={{ minHeight:"100vh", background:D.sidebar, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:D.fontBody }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"32px 28px", maxWidth:400, textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:14, color:D.textMut }}><NavIcon id="lock" size={38} /></div>
        <div style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.text, marginBottom:8, letterSpacing:"-0.02em" }}>Link inválido ou expirado</div>
        <p style={{ fontFamily:D.fontBody, fontSize:13.5, color:D.textSec, lineHeight:1.6, margin:0 }}>
          Este link de acesso não é mais válido. Peça ao síndico para enviar o link atualizado do seu portal.
        </p>
      </div>
    </div>
  );

  if (!morador) return (
    <div style={{ minHeight:"100vh", background:D.sidebar, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontFamily:D.fontBody }}>
      Carregando...
    </div>
  );  const cobMes    = cobrancas.find(c => c.mes === mesSel);
  const totalPago = cobrancas.filter(c => c.status === "pago").length;
  const meses     = [...new Set([mesAtual(), ...cobrancas.map(c => c.mes)])].sort().reverse();

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

  // ── Dados de apoio para o resumo e as etiquetas das seções ──
  const extraPagaMor    = (extraId) => pagExtrasMor.some(p => p.extraId === extraId && p.moradorId === moradorId);
  const extrasPendentes = extrasMor.filter(e => !extraPagaMor(e.id)).length;
  const reservasPend    = reservasMor.filter(r => r.status === "pendente").length;
  const ocorrAbertas    = ocorrenciasMor.filter(o => o.status !== "resolvida").length;
  const enquetesAbertas = enquetesMor.filter(e => e.status === "aberta").length;
  const encMes          = cobMes ? encargosPortal(cobMes) : null;
  const corStatus       = cobMes?.status === "pago" ? D.success : cobMes?.status === "atrasado" ? D.danger : D.warning;
  const rotuloStatus    = cobMes?.status === "pago" ? "Em dia" : cobMes?.status === "atrasado" ? "Em atraso" : "Aguardando pagamento";

  // Uma seção por vez: o portal cabe numa tela e o morador não se perde rolando.
  // É função (não componente) de propósito: componente criado aqui dentro seria
  // recriado a cada tecla digitada e os campos perderiam o foco.
  const abrirSecao = (id) => {
    setSecaoAberta(a => a === id ? null : id);
    if (id === "reservas") setMsgReserva(null);
    if (id === "ocorrencias") setMsgOcorrencia(null);
  };
  const secao = (id, titulo, icone, etiqueta, corEtiqueta, conteudo) => {
    const aberta = secaoAberta === id;
    return (
      <div key={id} style={{ background:D.bgCard, borderRadius:D.radius, border:`1px solid ${aberta?D.accent:D.border}`, boxShadow:D.shadow, marginBottom:10, overflow:"hidden" }}>
        <button onClick={() => abrirSecao(id)}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"15px 16px", background:"none", border:"none", cursor:"pointer", textAlign:"left", fontFamily:D.fontBody }}>
          <span style={{ width:34, height:34, borderRadius:9, background:D.muted, color:D.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={icone} size={17} /></span>
          <span style={{ flex:1, fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em", minWidth:0 }}>{titulo}</span>
          {etiqueta ? (
            <span style={{ background: corEtiqueta || D.accent, color:"#fff", fontSize:11.5, fontWeight:700, padding:"2px 9px", borderRadius:20, flexShrink:0 }}>{etiqueta}</span>
          ) : null}
          <span style={{ color:D.textMut, display:"flex", flexShrink:0, transform: aberta?"rotate(180deg)":"none", transition:"transform .18s" }}><NavIcon id="setaBaixo" size={16} /></span>
        </button>
        {aberta && <div style={{ padding:"0 16px 18px", borderTop:`1px solid ${D.border}` }}><div style={{ paddingTop:16 }}>{conteudo}</div></div>}
      </div>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:D.bgApp, fontFamily:D.fontBody }}>
      {/* Cabeçalho */}
      <div style={{ background:`linear-gradient(135deg, ${D.sidebar}, ${D.primaryDk || D.primary})`, padding: isMobile ? "22px 20px" : "30px 40px", color:"#fff" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12.5, opacity:.75, marginBottom:7 }}>
            <NavIcon id="acEmpresa" size={14} /> {morador.condominioNome || "Condomínio"}
          </div>
          <h1 style={{ fontFamily:D.fontDisplay, fontSize: isMobile?22:28, margin:"0 0 4px", fontWeight:700, letterSpacing:"-0.02em" }}>{morador.nome}</h1>
          <div style={{ fontSize:14, opacity:.85 }}>{morador.unidade}{morador.proprietario ? ` · Prop: ${morador.proprietario}` : ""}</div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px 14px 40px" : "24px 40px 40px", maxWidth:640, margin:"0 auto" }}>

        {/* ── Situação do mês: a pergunta que traz o morador aqui ── */}
        <div style={{ background:D.primary, borderRadius:D.radiusXl || 16, padding: isMobile?"18px 18px 16px":"22px 24px 20px", color:"#fff", marginBottom:16, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-40, right:-30, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,.04)" }} />
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:12 }}>
              <span style={{ fontSize:11.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"1px", opacity:.7 }}>Situação do mês</span>
              <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
                style={{ padding:"5px 9px", border:"1px solid rgba(255,255,255,.25)", borderRadius:8, fontSize:12, background:"rgba(255,255,255,.1)", color:"#fff", fontFamily:D.fontBody, cursor:"pointer" }}>
                {meses.map(m => <option key={m} value={m} style={{ color:D.text }}>{mesLabel(m)}</option>)}
              </select>
            </div>

            {cobMes ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}>
                  <span style={{ width:9, height:9, borderRadius:"50%", background:corStatus, flexShrink:0 }} />
                  <span style={{ fontFamily:D.fontDisplay, fontSize: isMobile?24:28, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1.1 }}>{rotuloStatus}</span>
                </div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:600, opacity:.95 }}>
                  R$ {encMes.valorTotal.toFixed(2).replace(".",",")}
                </div>
                {(encMes.multa > 0 || encMes.juros > 0) && (
                  <div style={{ fontSize:12, opacity:.75, marginTop:5 }}>
                    Taxa R$ {encMes.valorBase.toFixed(2).replace(".",",")} + multa R$ {encMes.multa.toFixed(2).replace(".",",")} + juros R$ {encMes.juros.toFixed(2).replace(".",",")} ({encMes.diasAtraso} dias)
                  </div>
                )}
                {cobMes.dataPagamento && <div style={{ fontSize:12.5, opacity:.8, marginTop:6 }}>Pago em {cobMes.dataPagamento}</div>}
                {cobMes.obs && <div style={{ fontSize:12, opacity:.7, marginTop:4 }}>{cobMes.obs}</div>}
              </>
            ) : (
              <div style={{ fontSize:14, opacity:.8, padding:"8px 0" }}>Ainda não há cobrança lançada para você neste mês.</div>
            )}
          </div>
        </div>

        {/* ── Seções ── */}
        {extrasMor.length > 0 && secao("extras", "Cobranças extras", "cobrancas",
          extrasPendentes || null, D.warning,
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {extrasMor.map(extra => {
              const pago = extraPagaMor(extra.id);
              return (
                <div key={extra.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"12px 14px", background:D.bgCard, border:`1px solid ${D.border}`, borderLeft:`3px solid ${pago?D.success:D.warning}`, borderRadius:D.radiusSm }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:D.text }}>{extra.descricao}</div>
                    <div style={{ fontSize:11.5, color:D.textSec, marginTop:2 }}>{mesLabel(extra.mes)}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color: pago?D.success:D.warning }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background: pago?D.success:D.warning }} />{pago?"Pago":"Pendente"}
                    </span>
                    <div style={{ fontSize:13, fontWeight:600, color:D.text, marginTop:2 }}>R$ {extra.valorUnitario.toFixed(2).replace(".",",")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {secao("historico", "Histórico de pagamentos", "histDoc", null, null,
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
              {[
                { label:"Em dia",   valor: totalPago, cor:D.success },
                { label:"Atrasados", valor: cobrancas.filter(c=>c.status==="atrasado").length, cor:D.danger },
                { label:"Meses",    valor: cobrancas.length, cor:D.text },
              ].map((c,i) => (
                <div key={i} style={{ background:D.muted, borderRadius:D.radiusSm, padding:"11px 8px", textAlign:"center" }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:19, fontWeight:700, color:c.cor, lineHeight:1 }}>{c.valor}</div>
                  <div style={{ fontSize:11, color:D.textSec, marginTop:4 }}>{c.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {cobrancas.map((c,i) => {
                const cor = c.status==="pago"?D.success:c.status==="atrasado"?D.danger:D.warning;
                const enc = encargosPortal(c);
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"12px 14px", background:D.bgCard, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cor}`, borderRadius:D.radiusSm }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:D.text, textTransform:"capitalize" }}>{mesLabel(c.mes)}</div>
                      {c.dataPagamento && <div style={{ fontSize:11.5, color:D.textSec, marginTop:2 }}>Pago em {c.dataPagamento}</div>}
                      {(enc.multa > 0 || enc.juros > 0) && <div style={{ fontSize:11.5, color:D.danger, marginTop:2 }}>+ multa e juros ({enc.diasAtraso} dias)</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:cor }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:cor }} />
                        {c.status==="pago"?"Pago":c.status==="atrasado"?"Atrasado":"Pendente"}
                      </span>
                      <div style={{ fontSize:13, fontWeight:600, color:D.text, marginTop:2 }}>R$ {enc.valorTotal.toFixed(2).replace(".",",")}</div>
                      {c.status === "pago" && (
                        <button onClick={() => gerarReciboPDF(morador, c.dataPagamento, c.obs, { mesSel: c.mes, taxa: condoConfig?.taxa || taxa, nomeCondominio: morador.condominioNome || "Condomínio", logo: condoConfig?.logo })}
                          style={{ display:"inline-flex", alignItems:"center", gap:5, marginTop:6, padding:"4px 10px", background:D.muted, color:D.accent, border:`1px solid ${D.border}`, borderRadius:20, fontSize:11.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                          <NavIcon id="download" size={12} /> Recibo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {cobrancas.length === 0 && <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:16 }}>Nenhum registro encontrado.</div>}
            </div>
          </>
        )}

        {comunicadosMor.length > 0 && secao("comunicados", "Comunicados", "comunicados",
          comunicadosMor.length, D.accent,
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {comunicadosMor.map(com => (
              <div key={com.id} style={{ background: com.fixado ? D.secondary : D.muted, borderRadius:D.radiusSm, padding:"14px 16px", borderLeft:`3px solid ${com.fixado ? D.accent : D.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                  {com.fixado && <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:D.bgCard, color:D.accent, fontSize:10.5, fontWeight:700, padding:"3px 9px", borderRadius:10 }}><NavIcon id="pin" size={11} /> Fixado</span>}
                  <span style={{ fontFamily:D.fontDisplay, fontSize:14.5, fontWeight:600, color:D.text }}>{com.titulo}</span>
                </div>
                <p style={{ fontSize:13, color:D.text, lineHeight:1.6, margin:"0 0 6px", whiteSpace:"pre-wrap" }}>{com.mensagem}</p>
                <div style={{ fontSize:11.5, color:D.textMut }}>{com.data}</div>
              </div>
            ))}
          </div>
        )}

        {documentosMor.length > 0 && secao("documentos", "Documentos do condomínio", "documentos",
          documentosMor.length, D.accent,
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {documentosMor.map(d => (
              <div key={d.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 14px", background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radiusSm }}>
                <div style={{ width:32, height:32, borderRadius:8, background:D.muted, color:D.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={docIconId(d.categoria)} size={16} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.nome}</div>
                  <div style={{ fontSize:11.5, color:D.textSec }}>{d.categoria}</div>
                </div>
                {d.arquivo && (
                  <a href={d.arquivo} download={d.arquivoNome || d.nome} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 12px", background:D.muted, color:D.accent, border:`1px solid ${D.border}`, borderRadius:20, fontSize:11.5, fontWeight:600, textDecoration:"none", flexShrink:0 }}>
                    <NavIcon id="download" size={12} /> Baixar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {secao("reservas", "Reservar área comum", "reservas",
          reservasPend || null, D.warning,
          <>
            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom: reservasMor.length?18:0 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Área</label>
                <select value={formReserva.area} onChange={e=>setFormReserva(p=>({...p,area:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, background:"#fff", fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }}>
                  <option value="Churrasqueira">Churrasqueira</option>
                  <option value="Salão de Festas">Salão de Festas</option>
                  <option value="Espaço Gourmet">Espaço Gourmet</option>
                </select>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Data *</label>
                  <input type="date" value={formReserva.data} onChange={e=>setFormReserva(p=>({...p,data:e.target.value}))} min={new Date().toISOString().split("T")[0]} style={{ display:"block", width:"100%", padding:"10px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Horário *</label>
                  <input value={formReserva.horario} onChange={e=>setFormReserva(p=>({...p,horario:e.target.value}))} placeholder="Ex: 14h às 22h" style={{ display:"block", width:"100%", padding:"10px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", display:"block", marginBottom:5 }}>Observação</label>
                <input value={formReserva.observacao} onChange={e=>setFormReserva(p=>({...p,observacao:e.target.value}))} placeholder="Nº de pessoas, ocasião..." style={{ display:"block", width:"100%", padding:"10px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontFamily:D.fontBody, color:D.text, boxSizing:"border-box" }} />
              </div>
              {msgReserva && <div style={{ fontSize:12.5, color: msgReserva.ok ? D.success : D.danger, fontWeight:500 }}>{msgReserva.texto}</div>}
              <button onClick={fazerReserva} disabled={enviandoReserva} style={{ padding:"12px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor: enviandoReserva?"default":"pointer", fontFamily:D.fontBody, opacity: enviandoReserva?.7:1 }}>
                {enviandoReserva ? "Enviando..." : "Solicitar reserva"}
              </button>
            </div>

            {reservasMor.length > 0 && (
              <div>
                <div style={{ fontSize:11.5, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Minhas reservas</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {reservasMor.map((r,i) => {
                    const cor = r.status==="aprovada"?D.success:r.status==="rejeitada"?D.danger:D.warning;
                    return (
                      <div key={i} style={{ background:D.bgCard, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cor}`, borderRadius:D.radiusSm, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:D.text }}>{r.area}</div>
                          <div style={{ fontSize:12, color:D.textSec, marginTop:2 }}>{r.data}{r.horario?` · ${r.horario}`:""}</div>
                        </div>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:cor, flexShrink:0, whiteSpace:"nowrap" }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:cor }} />
                          {r.status==="aprovada"?"Aprovada":r.status==="rejeitada"?"Rejeitada":"Pendente"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {secao("ocorrencias", "Ocorrências e reclamações", "ocorrencias",
          ocorrAbertas || null, D.warning,
          <>
            <div style={{ fontSize:12.5, color:D.textSec, marginBottom:14 }}>Relate um problema ou solicitação ao síndico (vazamento, barulho, manutenção).</div>

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

            {msgOcorrencia && <div style={{ fontSize:13, color: msgOcorrencia.ok ? D.success : D.danger, marginBottom:12 }}>{msgOcorrencia.texto}</div>}

            <button onClick={abrirOcorrencia} disabled={enviandoOcorrencia} style={{ width:"100%", padding:"12px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor: enviandoOcorrencia?"default":"pointer", opacity: enviandoOcorrencia?.7:1, fontFamily:D.fontBody }}>
              {enviandoOcorrencia ? "Enviando..." : "Registrar ocorrência"}
            </button>

            {ocorrenciasMor.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>Minhas ocorrências</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {ocorrenciasMor.map((o,i) => {
                    const cor = o.status==="resolvida"?D.success:o.status==="em_andamento"?D.accent:D.warning;
                    const rot = o.status==="resolvida"?"Resolvida":o.status==="em_andamento"?"Em andamento":"Aberta";
                    return (
                      <div key={i} style={{ background:D.bgCard, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cor}`, borderRadius:D.radiusSm, padding:"12px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:D.text }}>{o.titulo}</div>
                            <div style={{ fontSize:12, color:D.textSec, marginTop:2 }}>{o.categoria} · {o.criadoEm}</div>
                          </div>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:cor, whiteSpace:"nowrap", flexShrink:0 }}>
                            <span style={{ width:6, height:6, borderRadius:"50%", background:cor }} />{rot}
                          </span>
                        </div>
                        {o.respostaSindico && (
                          <div style={{ marginTop:9, background:D.muted, borderRadius:D.radiusSm, padding:"9px 11px", fontSize:12.5, color:D.text, lineHeight:1.5 }}>
                            <b>Resposta do síndico:</b> {o.respostaSindico}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {enquetesMor.length > 0 && secao("enquetes", "Consultas aos moradores", "enquetes",
          enquetesAbertas || null, D.success,
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {enquetesMor.map(enq => {
              const meuVoto = votosMor.find(v => v.enqueteId === enq.id);
              const aberta = enq.status === "aberta";
              return (
                <div key={enq.id} style={{ border:`1px solid ${D.border}`, borderRadius:D.radius, padding:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap" }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14.5, fontWeight:600, color:D.text }}>{enq.titulo}</div>
                      {enq.descricao && <div style={{ fontSize:12.5, color:D.textSec, marginTop:2 }}>{enq.descricao}</div>}
                    </div>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color: aberta?D.success:D.textSec, background: aberta?D.successBg:D.muted, padding:"3px 10px 3px 8px", borderRadius:20, whiteSpace:"nowrap" }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background: aberta?D.success:D.textMut }} />{aberta?"Aberta":"Encerrada"}
                    </span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:14 }}>
                    {enq.opcoes.map((op,idx) => {
                      const escolhida = meuVoto?.opcao === op;
                      return (
                        <button key={idx} onClick={() => aberta && votarEnquete(enq, op)} disabled={!aberta} style={{
                          display:"flex", justifyContent:"space-between", alignItems:"center", gap:10,
                          padding:"12px 14px", borderRadius:D.radiusSm, cursor: aberta?"pointer":"default",
                          border:`1.5px solid ${escolhida?D.primary:D.border}`,
                          background: escolhida?D.secondary:"#fff",
                          fontFamily:D.fontBody, fontSize:14, color:D.text, fontWeight: escolhida?600:400, textAlign:"left",
                        }}>
                          <span style={{ minWidth:0 }}>{op}</span>
                          {escolhida && <span style={{ display:"inline-flex", alignItems:"center", gap:5, color:D.primary, fontWeight:700, fontSize:12, flexShrink:0 }}><NavIcon id="logCheck" size={14} /> Seu voto</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:11.5, color:D.textMut, marginTop:9 }}>
                    {aberta
                      ? (meuVoto ? "Você pode trocar seu voto enquanto estiver aberta." : "Toque em uma opção para votar.")
                      : `Votação encerrada.${meuVoto?` Seu voto: ${meuVoto.opcao}.`:" Você não votou."}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé */}
        <div style={{ marginTop:28, paddingTop:20, borderTop:`1px solid ${D.border}`, textAlign:"center" }}>
          {morador.email && <div style={{ fontSize:12, color:D.textMut, marginBottom:10 }}>{morador.email}</div>}
          <p style={{ fontSize:12, color:D.textMut, lineHeight:1.6, margin:"0 0 8px", maxWidth:520, marginLeft:"auto", marginRight:"auto" }}>
            Seus dados são tratados pela administração do condomínio para fins de gestão condominial, conforme a LGPD.
          </p>
          <button onClick={()=>setDocLegal("privacidade")} style={{ background:"none", border:"none", color:D.accent, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textDecoration:"underline" }}>
            Política de Privacidade
          </button>
        </div>

      </div>
      {docLegal && <LegalDoc tipo={docLegal} onClose={()=>setDocLegal(null)} />}
    </div>
  );
}

// Ícones de navegação (SVG de traço, sem dependências — herdam a cor via currentColor)
const NAV_ICON_PATHS = {
  dashboard:   '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  cobrancas:   '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 12h.01M18 12h.01"/>',
  moradores:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  despesas:    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>',
  servicos:    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  reservas:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  acessos:     '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m14 9 7-7"/><path d="m16.5 4.5 3 3M19 7l2-2"/>',
  entregas:    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  comunicados: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  ocorrencias: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  enquetes:    '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  documentos:  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  fundoReserva:'<path d="M3 21h18M4 10h16M5 6l7-3 7 3M5 10v11M19 10v11M9 14v3M12 14v3M15 14v3"/>',
  fluxoCaixa:  '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  agenda:      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  historico:   '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  config:      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  assinatura:  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  multa:       '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  iniciarCobranca: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  emails:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  logPencil:   '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  logTrash:    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  logPlus:     '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
  logCheck:    '<path d="M20 6 9 17l-5-5"/>',
  logUndo:     '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
  logMail:     '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  logDot:      '<circle cx="12" cy="12" r="4"/>',
  histDoc:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  link:        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  mais:        '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  acPorta:     '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.562z"/>',
  acEmpresa:   '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  acMotivo:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/>',
  acCasa:      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  pin:         '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  lock:        '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  setaCima:    '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  setaBaixo:   '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  banco:       '<path d="M3 21h18"/><path d="M5 21V10M9 21V10M15 21V10M19 21V10"/><path d="M3 10l9-6 9 6z"/>',
  alerta:      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  docEscudo:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  docCert:     '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  fogo:        '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  evFesta:     '<path d="M8 2h8"/><path d="M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2"/><path d="M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/>',
  evAssembleia:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  evSol:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  fxCash:      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  fxMoeda:     '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.4a3 3 0 0 0-2.8-1.4c-1.7 0-2.7.8-2.7 2 0 2.8 5.8 1.3 5.8 4 0 1.3-1.1 2.1-2.9 2.1a3.2 3.2 0 0 1-3-1.5"/><path d="M12 6.5v11"/>',
  whats:       '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-4-1L3 21l2.2-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/><path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5l1-1.2-1.8-1-.9.8a4.3 4.3 0 0 1-2.4-2.4l.8-.9-1-1.8-1.2 1z"/>',
  sino:        '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  busca:       '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  fechar:      '<path d="M18 6 6 18M6 6l12 12"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  catLuz:      '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  catLimpeza:  '<path d="M12 3l1.6 4.8L18 9l-4.4 1.2L12 15l-1.6-4.8L6 9l4.4-1.2z"/><path d="M5 18l1.5 1.5M18 4l1 1"/>',
  catPortaria: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  catElevador: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="m9 10 3-3 3 3"/><path d="m9 14 3 3 3-3"/>',
  catJardim:   '<path d="M7 20h10"/><path d="M12 20c0-4 0-6 0-8"/><path d="M12 12c-1.5-3-4-3-6-3 0 2 1 4.5 4 4.5"/><path d="M12 10c1.2-2.4 3.3-2.4 5-2.4 0 1.8-.9 3.9-3.5 3.9"/>',
  catSalario:  '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M4 15v-2a8 8 0 0 1 16 0v2"/><path d="M10 9V6a2 2 0 0 1 4 0v3"/>',
  catInternet: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  catImpostos: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M14 8H8M16 12H8M13 16H8"/>',
};
const NavIcon = ({ id, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display:"block", flexShrink:0 }}
    dangerouslySetInnerHTML={{ __html: NAV_ICON_PATHS[id] || "" }} />
);

/* ══════════════ CONSULTA POR DATA (componente único, usado em todas as abas) ══════════════ */

const PERIODO_TUDO = { tipo:"tudo", valor:null };
const MS_DIA = 86400000;
const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MESES_ABREV = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIAS_SEMANA = ["D","S","T","Q","Q","S","S"];

const inicioHoje = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const chaveDia = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// Verifica se um timestamp cai dentro do período escolhido
const noPeriodo = (ts, p) => {
  if (!p || p.tipo === "tudo") return true;
  if (!ts) return false;
  const h0 = inicioHoje();
  if (p.tipo === "hoje") return ts >= h0 && ts < h0 + MS_DIA;
  if (p.tipo === "7d")   return ts >= h0 - 6 * MS_DIA;
  if (p.tipo === "30d")  return ts >= h0 - 29 * MS_DIA;
  if (p.tipo === "dia") {
    const [a,m,d] = String(p.valor).split("-").map(Number);
    const ini = new Date(a, m-1, d).setHours(0,0,0,0);
    return ts >= ini && ts < ini + MS_DIA;
  }
  if (p.tipo === "mes") {
    const [a,m] = String(p.valor).split("-").map(Number);
    return ts >= new Date(a, m-1, 1).getTime() && ts < new Date(a, m, 1).getTime();
  }
  return true;
};

// Rótulo curto do período, para mostrar no botão
const rotuloPeriodo = (p) => {
  if (!p || p.tipo === "tudo") return "Escolher data";
  if (p.tipo === "dia") { const [a,m,d] = String(p.valor).split("-").map(Number); return `${d} ${MESES_ABREV[m-1]}`; }
  if (p.tipo === "mes") { const [a,m] = String(p.valor).split("-").map(Number); return `${MESES_ABREV[m-1]}/${a}`; }
  return "Escolher data";
};

/* ── Valores em dinheiro: aceita o jeito brasileiro de digitar ──
   parseFloat("1.500,00") devolve 1.5 — um erro de dinheiro esperando acontecer.
   Aqui "1.500,00", "1500,50", "1500.50" e "R$ 200" viram o número certo. */
const paraNumero = (v) => {
  if (typeof v === "number") return v;
  let t = String(v ?? "").trim().replace(/r\$/gi, "").replace(/\s/g, "");
  if (!t) return NaN;
  const temVirgula = t.includes(","), temPonto = t.includes(".");
  if (temVirgula && temPonto) {
    // O separador que vier por último é o decimal
    t = t.lastIndexOf(",") > t.lastIndexOf(".")
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  } else if (temVirgula) {
    t = t.replace(",", ".");
  } else if (temPonto) {
    // "1.500" é milhar; "1500.50" é decimal. 3 dígitos depois do ponto = milhar.
    const partes = t.split(".");
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) t = partes.join("");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
};
// Valor válido = número real e maior que zero
const valorValido = (v) => { const n = paraNumero(v); return Number.isFinite(n) && n > 0; };

/* ── Busca por texto (ignora acento e maiúscula) ── */
const normalizarTexto = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Confere se algum dos campos do item contém o termo buscado
const casaBusca = (item, termo, campos) => {
  const t = normalizarTexto(termo).trim();
  if (!t) return true;
  return campos.some(c => normalizarTexto(item?.[c]).includes(t));
};


/* ── Manutenção preventiva ──
   Limpeza de caixa d'água, dedetização, recarga de extintor e inspeção de elevador são
   obrigações com prazo. Antes o sistema só avisava depois que o documento vencia. */
const PERIODICIDADES = [
  { id:"mensal",     label:"Mensal",       meses:1  },
  { id:"bimestral",  label:"A cada 2 meses", meses:2 },
  { id:"trimestral", label:"Trimestral",   meses:3  },
  { id:"semestral",  label:"Semestral",    meses:6  },
  { id:"anual",      label:"Anual",        meses:12 },
];
const infoPeriodicidade = (id) => PERIODICIDADES.find(p => p.id === id) || PERIODICIDADES[3];

// Soma meses a uma data no formato aaaa-mm-dd e devolve no mesmo formato
const somarMeses = (dataISO, meses) => {
  if (!dataISO) return "";
  const [a, m, d] = dataISO.split("-").map(Number);
  const base = new Date(a, m - 1, d);
  const alvo = new Date(base.getFullYear(), base.getMonth() + meses, 1);
  // Se o dia não existe no mês de destino (ex: 31 em fevereiro), usa o último dia
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return `${alvo.getFullYear()}-${String(alvo.getMonth()+1).padStart(2,"0")}-${String(alvo.getDate()).padStart(2,"0")}`;
};

// Dias até a próxima execução (negativo = atrasada)
const diasAteData = (dataISO) => {
  if (!dataISO) return null;
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(a, m - 1, d).setHours(0,0,0,0);
  const hoje = new Date().setHours(0,0,0,0);
  return Math.round((alvo - hoje) / 86400000);
};

/* ── Token do portal do morador ──
   Sem token, quem tivesse o link teria acesso permanente e não haveria como revogar
   (ex: morador que vendeu o apartamento). Com token, trocar o valor invalida o link antigo. */
const gerarTokenPortal = () => {
  const c = "abcdefghijkmnopqrstuvwxyz23456789"; // sem l/1/0/o para não confundir na leitura
  let t = "";
  for (let i = 0; i < 12; i++) t += c[Math.floor(Math.random() * c.length)];
  return t;
};

/* ── WhatsApp: canal real de cobrança no Brasil ──
   Monta o link wa.me a partir do telefone cadastrado. Sem API e sem custo: é só uma URL. */
const telefoneParaWhats = (tel) => {
  const so = String(tel || "").replace(/\D/g, "");
  if (so.length < 10) return null;                 // precisa de DDD + número
  return so.startsWith("55") ? so : `55${so}`;     // completa o código do país
};
const linkWhatsApp = (tel, msg) => {
  const num = telefoneParaWhats(tel);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
};

/* ── Papéis de usuário ──
   O campo `papel` já era gravado no cadastro mas nunca era lido: todo mundo entrava como síndico.
   Aqui ele passa a definir o que cada pessoa vê e pode fazer. */
const PAPEIS = {
  sindico: {
    label: "Síndico",
    descricao: "Acesso total ao sistema, incluindo configurações e remoção de moradores.",
    abas: null,          // null = todas
    podeEscrever: true,
    podeConfigurar: true,
    podeRemoverMorador: true,
  },
  subsindico: {
    label: "Subsíndico",
    descricao: "Opera o dia a dia. Não acessa Configurações nem remove moradores.",
    abas: null,
    podeEscrever: true,
    podeConfigurar: false,
    podeRemoverMorador: false,
  },
  conselho: {
    label: "Conselho fiscal",
    descricao: "Vê as contas e os relatórios para fiscalizar. Não altera nada.",
    abas: ["dashboard","cobrancas","moradores","despesas","servicos","fundoReserva","fluxoCaixa","documentos","historico"],
    podeEscrever: false,
    podeConfigurar: false,
    podeRemoverMorador: false,
  },
  portaria: {
    label: "Portaria",
    descricao: "Registra entrada de visitantes e recebimento de encomendas. Não vê o financeiro.",
    abas: ["acessos","entregas","moradores","comunicados"],
    podeEscrever: true,
    podeConfigurar: false,
    podeRemoverMorador: false,
  },
};
// Papel desconhecido ou ausente cai em síndico, preservando as contas que já existem
const infoPapel = (p) => PAPEIS[p] || PAPEIS.sindico;

/* ── Importação de moradores por planilha ──
   Aceita colar direto do Excel/Sheets (colunas separadas por TAB) ou CSV (; ou ,).
   Detecta e ignora a linha de cabeçalho, para o síndico poder colar a seleção inteira. */
const COLUNAS_IMPORT = ["unidade", "nome", "email", "telefone", "tipo", "proprietario"];

const detectarSeparador = (linha) => {
  if (linha.includes("\t")) return "\t";
  if (linha.includes(";")) return ";";
  if (linha.includes(",")) return ",";
  return "\t";
};

const ehCabecalho = (celulas) => {
  const t = celulas.map(c => normalizarTexto(c).trim());
  return t.some(c => ["unidade","apto","apartamento"].includes(c))
      && t.some(c => ["nome","morador"].includes(c));
};

const parsearPlanilha = (texto) => {
  const linhas = String(texto || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = detectarSeparador(linhas[0]);
  const corpo = linhas.map(l => l.split(sep).map(c => c.trim().replace(/^["']|["']$/g, "")));
  const inicio = ehCabecalho(corpo[0]) ? 1 : 0;
  return corpo.slice(inicio).map((cels, i) => {
    const reg = { _linha: inicio + i + 1 };
    COLUNAS_IMPORT.forEach((campo, idx) => { reg[campo] = cels[idx] || ""; });
    return reg;
  });
};

// Valida uma linha contra os moradores já cadastrados e contra as outras linhas do próprio lote
const validarLinhaImport = (reg, moradoresExistentes, outrasLinhas) => {
  const erros = [];
  if (!reg.unidade) erros.push("unidade vazia");
  if (!reg.nome) erros.push("nome vazio");
  if (!reg.email) erros.push("e-mail vazio");
  else if (!reg.email.includes("@") || !reg.email.includes(".")) erros.push("e-mail inválido");

  const un = normalizarTexto(reg.unidade), em = normalizarTexto(reg.email);
  if (un && moradoresExistentes.some(m => normalizarTexto(m.unidade) === un)) erros.push("unidade já cadastrada");
  if (em && moradoresExistentes.some(m => normalizarTexto(m.email) === em)) erros.push("e-mail já cadastrado");
  if (un && outrasLinhas.filter(o => normalizarTexto(o.unidade) === un).length > 1) erros.push("unidade repetida na planilha");
  if (em && outrasLinhas.filter(o => normalizarTexto(o.email) === em).length > 1) erros.push("e-mail repetido na planilha");
  return erros;
};

const BarraFiltros = ({
  periodo, setPeriodo, timestamps = [], total = 0, D, isMobile, rotuloItem = "registro",
  // Linha 1 (opcionais): busca e seletor de categoria
  busca, setBusca, placeholderBusca = "Buscar...", mostrarBusca = false,
  tipos = null, tipoAtivo, setTipo, rotuloTipo = "Todos",
  mostrarPeriodo = true,
}) => {
  const [aberto, setAberto] = useState(false);
  const [tipoAberto, setTipoAberto] = useState(false);
  const hojeD = new Date();
  const [mesVista, setMesVista] = useState({ ano: hojeD.getFullYear(), mes: hojeD.getMonth() });

  // Dias que possuem pelo menos um registro (para marcar com bolinha)
  const diasComRegistro = new Set(timestamps.filter(Boolean).map(chaveDia));

  const atalhos = [
    { tipo:"hoje", label:"Hoje" },
    { tipo:"7d",   label:"7 dias" },
    { tipo:"30d",  label:"30 dias" },
    { tipo:"tudo", label:"Qualquer data" },
  ];
  const ativoCal = periodo.tipo === "dia" || periodo.tipo === "mes";

  const primeiroDiaSemana = new Date(mesVista.ano, mesVista.mes, 1).getDay();
  const diasNoMes = new Date(mesVista.ano, mesVista.mes + 1, 0).getDate();
  const celulas = [...Array(primeiroDiaSemana).fill(null), ...Array.from({length:diasNoMes}, (_,i) => i+1)];
  const chaveMesVista = `${mesVista.ano}-${String(mesVista.mes+1).padStart(2,"0")}`;

  const navegarMes = (delta) => {
    const d = new Date(mesVista.ano, mesVista.mes + delta, 1);
    setMesVista({ ano: d.getFullYear(), mes: d.getMonth() });
  };

  const btnBase = { display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, whiteSpace:"nowrap" };

  const opcaoAtiva = tipos ? (tipos.find(t => t.id === tipoAtivo) || tipos[0]) : null;
  const tipoFiltrando = tipos && opcaoAtiva && opcaoAtiva.id !== tipos[0].id;

  return (
    <div style={{ marginBottom:16 }}>
      {/* Linha 1 — busca e categoria */}
      {(mostrarBusca || tipos) && (
        <div style={{ display:"flex", gap:8, alignItems:"stretch", marginBottom:10, flexDirection: isMobile?"column":"row" }}>
          {mostrarBusca && (
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:9, background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, padding:"9px 12px", minWidth:0 }}>
              <span style={{ color:D.textMut, display:"flex", flexShrink:0 }}><NavIcon id="busca" size={16} /></span>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={placeholderBusca}
                style={{ flex:1, border:"none", outline:"none", background:"transparent", fontSize:13.5, fontFamily:D.fontBody, color:D.text, minWidth:0 }} />
              {busca && (
                <button onClick={() => setBusca("")} title="Limpar busca" style={{ display:"flex", alignItems:"center", justifyContent:"center", width:22, height:22, background:D.muted, border:"none", borderRadius:6, color:D.textSec, cursor:"pointer", flexShrink:0 }}><NavIcon id="fechar" size={13} /></button>
              )}
            </div>
          )}

          {tipos && (
            <div style={{ position:"relative", flexShrink:0 }}>
              <button onClick={() => { setTipoAberto(v=>!v); setAberto(false); }}
                style={{ display:"flex", alignItems:"center", gap:8, width: isMobile?"100%":"auto", justifyContent:"space-between", padding:"9px 12px", background: tipoFiltrando?D.primary:D.bgCard, color: tipoFiltrando?"#fff":D.text, border: tipoFiltrando?"1px solid transparent":`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody, whiteSpace:"nowrap" }}>
                <span style={{ display:"flex", alignItems:"center", gap:7 }}>
                  {tipoFiltrando && <span style={{ width:7, height:7, borderRadius:"50%", background:"#fff" }} />}
                  {tipoFiltrando ? opcaoAtiva.label : rotuloTipo}
                  <span style={{ opacity:.65 }}>{opcaoAtiva?.n}</span>
                </span>
                <span style={{ display:"flex", transform: tipoAberto?"rotate(180deg)":"none", transition:"transform .15s" }}><NavIcon id="setaBaixo" size={13} /></span>
              </button>
              {tipoAberto && (
                <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, left: isMobile?0:"auto", minWidth:190, background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radius, boxShadow:D.shadowMd || D.shadow, padding:6, zIndex:60 }}>
                  {tipos.map(t => {
                    const at = (tipoAtivo || tipos[0].id) === t.id;
                    return (
                      <button key={t.id} onClick={() => { setTipo(t.id); setTipoAberto(false); }}
                        style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 11px", background: at?D.secondary:"transparent", border:"none", borderRadius:D.radiusSm, cursor:"pointer", fontFamily:D.fontBody, fontSize:13, color:D.text, textAlign:"left" }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background: t.cor || D.textMut, flexShrink:0 }} />
                        <span style={{ flex:1 }}>{t.label}</span>
                        <span style={{ color:D.textMut, fontSize:12 }}>{t.n}</span>
                        {at && <span style={{ color:D.accent, display:"flex" }}><NavIcon id="logCheck" size={14} /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Linha 2 — período */}
      {mostrarPeriodo && (<>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {atalhos.map(a => {
          const ativo = periodo.tipo === a.tipo;
          return (
            <button key={a.tipo} onClick={() => { setPeriodo({ tipo:a.tipo, valor:null }); setAberto(false); }}
              style={{ ...btnBase, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec }}>
              {a.label}
            </button>
          );
        })}
        <button onClick={() => { setAberto(v => !v); setTipoAberto(false); }}
          style={{ ...btnBase, borderRadius:D.radiusSm, border: ativoCal?"none":`1px solid ${D.border}`, background: ativoCal?D.primary:D.bgCard, color: ativoCal?"#fff":D.textSec }}>
          <NavIcon id="agenda" size={14} /> {rotuloPeriodo(periodo)}
          <span style={{ display:"flex", transform: aberto?"rotate(180deg)":"none", transition:"transform .15s" }}><NavIcon id="setaBaixo" size={12} /></span>
        </button>
      </div>

      {aberto && (
        <div style={{ marginTop:10, background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radius, boxShadow:D.shadowMd || D.shadow, padding:14, maxWidth: isMobile?"100%":300 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <button onClick={() => navegarMes(-1)} title="Mês anterior" style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, border:`1px solid ${D.border}`, borderRadius:7, cursor:"pointer", color:D.textSec, transform:"rotate(90deg)" }}><NavIcon id="setaCima" size={14} /></button>
            <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, textTransform:"capitalize", letterSpacing:"-0.02em" }}>{MESES_PT[mesVista.mes]} {mesVista.ano}</span>
            <button onClick={() => navegarMes(1)} title="Próximo mês" style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, border:`1px solid ${D.border}`, borderRadius:7, cursor:"pointer", color:D.textSec, transform:"rotate(90deg)" }}><NavIcon id="setaBaixo" size={14} /></button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
            {DIAS_SEMANA.map((d,i) => (
              <div key={i} style={{ textAlign:"center", fontFamily:D.fontBody, fontSize:11, fontWeight:600, color:D.textMut, padding:"2px 0" }}>{d}</div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
            {celulas.map((dia, i) => {
              if (dia === null) return <div key={`v${i}`} />;
              const chave = `${chaveMesVista}-${String(dia).padStart(2,"0")}`;
              const temReg = diasComRegistro.has(chave);
              const selecionado = periodo.tipo === "dia" && periodo.valor === chave;
              const ehHoje = chave === chaveDia(Date.now());
              return (
                <button key={chave} onClick={() => { setPeriodo({ tipo:"dia", valor:chave }); setAberto(false); }}
                  style={{ position:"relative", aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, border: ehHoje && !selecionado ? `1px solid ${D.accent}` : "1px solid transparent", background: selecionado?D.primary:"transparent", color: selecionado?"#fff":(temReg?D.text:D.textMut), borderRadius:7, cursor:"pointer", fontFamily:D.fontBody, fontSize:12, fontWeight: temReg?600:400, padding:0 }}>
                  {dia}
                  <span style={{ width:4, height:4, borderRadius:"50%", background: temReg ? (selecionado?"#fff":D.accent) : "transparent" }} />
                </button>
              );
            })}
          </div>

          <button onClick={() => { setPeriodo({ tipo:"mes", valor:chaveMesVista }); setAberto(false); }}
            style={{ width:"100%", marginTop:10, padding:"8px 12px", background:D.muted, color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textTransform:"capitalize" }}>
            Ver {MESES_PT[mesVista.mes]} inteiro
          </button>
          <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, textAlign:"center", marginTop:8 }}>Bolinha marca dia com registro</div>
        </div>
      )}

      </>)}

      {mostrarPeriodo && periodo.tipo !== "tudo" && (
        <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:8 }}>
          {total} {total === 1 ? rotuloItem : `${rotuloItem}s`} {periodo.tipo==="hoje" ? "hoje" : periodo.tipo==="7d" ? "nos últimos 7 dias" : periodo.tipo==="30d" ? "nos últimos 30 dias" : `em ${rotuloPeriodo(periodo)}`}
          {total === 0 && <button onClick={() => setPeriodo(PERIODO_TUDO)} style={{ marginLeft:8, background:"none", border:"none", color:D.accent, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, textDecoration:"underline", padding:0 }}>ver tudo</button>}
        </div>
      )}
    </div>
  );
};

const CATS_DESPESA = {
  agua:{icon:"💧",label:"Água"}, luz:{icon:"⚡",label:"Luz"}, limpeza:{icon:"🧹",label:"Limpeza"},
  portaria:{icon:"🛡️",label:"Portaria / Segurança"}, elevador:{icon:"🛗",label:"Elevador"},
  jardinagem:{icon:"🌳",label:"Jardinagem"}, salario:{icon:"👷",label:"Zelador / Salário"},
  internet:{icon:"🌐",label:"Internet / Telefone"}, manutencao:{icon:"🔧",label:"Manutenção"},
  material:{icon:"📦",label:"Material"}, impostos:{icon:"🧾",label:"Impostos / Taxas"},
  outro:{icon:"📌",label:"Outra despesa"},
};
const despCat = (tipo) => CATS_DESPESA[tipo] || CATS_DESPESA.outro;

// Mapa: categoria de despesa → id do ícone de traço
const CAT_ICON_ID = {
  agua:"despesas", luz:"catLuz", limpeza:"catLimpeza", portaria:"catPortaria",
  elevador:"catElevador", jardinagem:"catJardim", salario:"catSalario",
  internet:"catInternet", manutencao:"servicos", material:"entregas",
  impostos:"catImpostos", outro:"logDot",
};
const catIconId = (tipo) => CAT_ICON_ID[tipo] || "logDot";

// ── Documentos: ícone por categoria ──
const DOC_ICON_ID = {
  "Alvará":"docCert", "Seguro / Apólice":"docEscudo", "Elevador (ART)":"catElevador",
  "Contrato":"acMotivo", "Certidão":"docCert", "AVCB (Bombeiros)":"fogo", "Outro":"histDoc",
};
const docIconId = (cat) => DOC_ICON_ID[cat] || "histDoc";

// ── Agenda: ícone por tipo de evento ──
const EV_ICON_ID = {
  "Evento":"evFesta", "Manutenção":"servicos", "Assembleia":"evAssembleia",
  "Reunião":"moradores", "Feriado":"evSol", "Outro":"pin",
};
const evIconId = (tipo) => EV_ICON_ID[tipo] || "pin";

// ── Histórico: classificação por categoria, ícone e agrupamento por data ──
const TIPOS_LOG = [
  { id:"tudo",       label:"Tudo"       },
  { id:"moradores",  label:"Moradores"  },
  { id:"cobrancas",  label:"Cobranças"  },
  { id:"pagamentos", label:"Pagamentos" },
  { id:"outros",     label:"Outros"     },
];
const tipoLog = (log) => {
  const d = (log.descricao || "").toLowerCase();
  if (d.includes("pagamento")) return "pagamentos";
  if (d.includes("morador")) return "moradores";
  if (d.includes("cobrança") || d.includes("cobranças")) return "cobrancas";
  return "outros";
};
// Retorna { icon, cor } para um log, a partir do texto da descrição
const estiloLog = (log, D) => {
  const s = (log.descricao || "").toLowerCase();
  if (s.includes("inicia em") || s.includes("anteriores removidas")) return { icon:"iniciarCobranca", cor:D.accent };
  if (s.includes("editad"))                                          return { icon:"logPencil", cor:D.warning };
  if (s.includes("removid") || s.includes("excluíd") || s.includes("estornad")) {
    if (s.includes("estornad")) return { icon:"logUndo", cor:D.warning };
    return { icon:"logTrash", cor:D.danger };
  }
  if (s.includes("cadastrad") || s.includes("adicionad") || s.includes("criad") || s.includes("nova ") || s.includes("novo ") || s.includes("nível") || s.includes("registrad")) {
    if (s.includes("pagamento")) return { icon:"logCheck", cor:D.success };
    return { icon:"logPlus", cor:D.success };
  }
  if (s.includes("pago") || s.includes("pagamento"))                 return { icon:"logCheck", cor:D.success };
  if (s.includes("e-mail") || s.includes("email"))                   return { icon:"logMail", cor:D.accent };
  return { icon:"logDot", cor:D.textSec };
};
const mesmaData = (a, b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const rotuloDataLog = (ts) => {
  const d = new Date(ts), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
  if (mesmaData(d, hoje)) return "Hoje";
  if (mesmaData(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
};
const horaLog = (log) => {
  if (log.timestamp) return new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
  return (log.dataHora || "").split(",")[1]?.trim() || "";
};

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
  // Enquanto a config do condomínio não chega do Firestore, marcoZero é null — e agir nesse
  // momento gerava cobrança de mês que não deveria ser cobrado. Só operamos após carregar.
  const [configCarregada, setConfigCarregada]   = useState(false);
  const [logoCond, setLogoCond]                 = useState(null);
  const [salvandoLogo, setSalvandoLogo]         = useState(false);
  const [publicandoPrestacao, setPublicandoPrestacao] = useState(false);
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
  const [filtroLog, setFiltroLog] = useState("tudo");
  const [filtroMorador, setFiltroMorador] = useState("todos");
  const [filtroCobranca, setFiltroCobranca] = useState("todos");
  const [filtroDespesa, setFiltroDespesa] = useState("todas");
  const [filtroReserva, setFiltroReserva] = useState("todas");
  const [filtroAcesso, setFiltroAcesso] = useState("todos");
  const [filtroDoc, setFiltroDoc] = useState("todos");
  const [filtroEvento, setFiltroEvento] = useState("todos");
  // ── Consulta por data (um período por aba) ──
  const [perLog, setPerLog]       = useState(PERIODO_TUDO);
  const [perAcesso, setPerAcesso] = useState(PERIODO_TUDO);
  const [perEntrega, setPerEntrega] = useState(PERIODO_TUDO);
  const [perReserva, setPerReserva] = useState(PERIODO_TUDO);
  const [perOcorr, setPerOcorr]   = useState(PERIODO_TUDO);
  const [perComun, setPerComun]   = useState(PERIODO_TUDO);
  const [perFundo, setPerFundo]   = useState(PERIODO_TUDO);
  const [perEvento, setPerEvento] = useState(PERIODO_TUDO);
  // ── Busca por texto (uma por aba) ──
  const [buscaLog, setBuscaLog]         = useState("");
  const [buscaAcesso, setBuscaAcesso]   = useState("");
  const [buscaEntrega, setBuscaEntrega] = useState("");
  const [buscaReserva, setBuscaReserva] = useState("");
  const [buscaOcorr, setBuscaOcorr]     = useState("");
  const [buscaComun, setBuscaComun]     = useState("");
  const [buscaDoc, setBuscaDoc]         = useState("");
  const [fichaSecao, setFichaSecao]     = useState("cobrancas");
  const [selCob, setSelCob]             = useState([]);
  const [papelUsuario, setPapelUsuario] = useState("sindico");
  const [equipe, setEquipe]             = useState([]);
  const [novoConvite, setNovoConvite]   = useState({ email:"", papel:"portaria" });
  const [manutencoes, setManutencoes]   = useState([]);
  const [histCompleto, setHistCompleto] = useState(false);
  const [acordos, setAcordos]           = useState([]);
  const [formAcordo, setFormAcordo]     = useState({ moradorId:"", nParcelas:3, primeiraData:"", entrada:"" });
  const [novaManutencao, setNovaManutencao] = useState({ titulo:"", periodicidade:"semestral", proximaData:"", responsavel:"", obs:"" });
  const [importTexto, setImportTexto]   = useState("");
  const [importando, setImportando]     = useState(false);
  const [acessos, setAcessos]   = useState([]);
  const [novoAcesso, setNovoAcesso] = useState({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" });
  const [reservas, setReservas] = useState([]);
  const [novaReserva, setNovaReserva] = useState({ area:"Churrasqueira", data:"", horario:"", observacao:"" });
  const [comunicados, setComunicados] = useState([]);
  const [novoComunicado, setNovoComunicado] = useState({ titulo:"", mensagem:"", fixado:false });
  const [documentos, setDocumentos] = useState([]);
  const [novoDocumento, setNovoDocumento] = useState({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"", publico:false });
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

  const ehVisitante = user?.email === VISITANTE_EMAIL;
  const perm = ehVisitante ? { abas:null, podeEscrever:false, podeConfigurar:false, podeRemoverMorador:false } : infoPapel(papelUsuario);
  // readOnly = "não pode escrever". Cobre visitante e conselho fiscal.
  const readOnly = ehVisitante || !perm.podeEscrever;
  // Aba visível para este papel?
  const podeVerAba = (id) => {
    if (id === "config" && !perm.podeConfigurar) return false;
    return !perm.abas || perm.abas.includes(id);
  };

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
              setPapelUsuario(uSnap.data().papel || "sindico");
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
    const uEq = onSnapshot(byCond("usuarios"), s => setEquipe(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const uAco = onSnapshot(byCond("acordos"), s => setAcordos(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const uMan = onSnapshot(byCond("manutencoes"), s => setManutencoes(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (a.proximaData||"").localeCompare(b.proximaData||""))));
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
        setLogoCond(data.logo ?? null);
        setConfigCarregada(true);
      } else {
        setConfigCarregada(true); // condomínio sem documento: também é um estado conhecido
      }
    });
    // Observações: doc com id composto condominioId_mes
    const u6 = onSnapshot(doc(db, "observacoes", `${condominioId}_${mesSel}`), d => {
      const texto = d.exists() ? (d.data().texto || "") : "";
      setObsMes(texto); setObsSalva(texto);
    });

    return () => { u1(); uEq(); uMan(); uAco(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); u11(); u12(); u13(); u14(); u15(); u16(); u17(); u18(); u19(); u20(); };
  }, [user, condominioId, mesSel]);

  // (Removido o auto-popular com MOCK_MORADORES — no multi-tenant cada
  //  condomínio cadastra seus próprios moradores via a página de setup.)


  const showToast = (msg, type="success") => setToast({ msg, type });

  // Rede de segurança: qualquer escrita que falhe sem tratamento próprio avisa o síndico
  // em vez de falhar em silêncio (a ação simplesmente não acontecia e ninguém sabia).
  useEffect(() => {
    const aoFalhar = (e) => {
      console.error("Falha não tratada:", e?.reason || e);
      setToast({ msg: "Não foi possível concluir. Verifique sua conexão e tente de novo.", type: "error" });
    };
    window.addEventListener("unhandledrejection", aoFalhar);
    return () => window.removeEventListener("unhandledrejection", aoFalhar);
  }, []);

  // Exclusão com desfazer: guarda o documento antes de apagar e devolve pelo mesmo id.
  // Substitui o padrão "window.confirm + sumiu pra sempre" nas remoções simples.
  const removerComDesfazer = async (colecao, id, rotulo) => {
    try {
      const ref = doc(db, colecao, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) { showToast("Este registro já não existe.", "error"); return; }
      const backup = snap.data();
      await deleteDoc(ref);
      setToast({
        msg: `${rotulo} removido.`,
        type: "success",
        rotuloAcao: "Desfazer",
        acao: async () => {
          try {
            await setDoc(doc(db, colecao, id), backup);
            showToast(`${rotulo} restaurado.`);
          } catch (e) {
            console.error("Erro ao restaurar:", e);
            showToast("Não foi possível restaurar. Verifique sua conexão.", "error");
          }
        },
      });
    } catch (e) {
      console.error("Erro ao remover:", e);
      showToast("Não foi possível remover. Verifique sua conexão e tente de novo.", "error");
    }
  };

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

  // ── Central de avisos: tudo que precisa da atenção do síndico, disponível em qualquer aba ──
  const avisos = (() => {
    if (!condominioId || readOnly) return [];
    const DIAS = 86400000;
    const agora = Date.now();
    const diasDesde = (ts) => ts ? Math.floor((agora - ts) / DIAS) : 0;
    const parseDataBR = (d) => { if (!d) return null; const [dd,mm,aa] = d.split("/").map(Number); return aa ? new Date(aa,mm-1,dd).getTime() : null; };
    const lista = [];

    // 1) Documentos vencidos ou vencendo em 30 dias
    const docsAtencao = documentos.filter(d => { const st = situacaoDoc(d.vencimento); return st.dias !== null && st.dias <= 30; });
    const docsVencidos = docsAtencao.filter(d => (situacaoDoc(d.vencimento).dias ?? 0) < 0);
    if (docsAtencao.length) lista.push({
      icon:"alerta", cor: docsVencidos.length ? D.danger : D.warning, aba:"documentos",
      texto: docsVencidos.length
        ? `${docsVencidos.length} documento${docsVencidos.length>1?"s":""} vencido${docsVencidos.length>1?"s":""}${docsAtencao.length>docsVencidos.length ? ` e ${docsAtencao.length-docsVencidos.length} vencendo` : ""}`
        : `${docsAtencao.length} documento${docsAtencao.length>1?"s":""} vencendo em até 30 dias`,
    });

    // 2) Reservas aguardando aprovação
    const reservasPend = reservas.filter(r => r.status === "pendente");
    if (reservasPend.length) lista.push({ icon:"reservas", cor:D.warning, aba:"reservas", texto:`${reservasPend.length} reserva${reservasPend.length>1?"s":""} aguardando sua aprovação` });

    // 3) Ocorrências sem solução há mais de 7 dias
    const ocorrParadas = ocorrencias.filter(o => o.status !== "resolvida" && diasDesde(o.timestamp) >= 7);
    if (ocorrParadas.length) lista.push({ icon:"ocorrencias", cor:D.danger, aba:"ocorrencias", texto:`${ocorrParadas.length} ocorrência${ocorrParadas.length>1?"s":""} sem solução há mais de 7 dias` });

    // 4) Encomendas paradas há mais de 7 dias
    const entregasParadas = entregas.filter(e => e.status === "aguardando" && diasDesde(e.timestamp) >= 7);
    if (entregasParadas.length) lista.push({ icon:"entregas", cor:D.warning, aba:"entregas", texto:`${entregasParadas.length} encomenda${entregasParadas.length>1?"s":""} parada${entregasParadas.length>1?"s":""} há mais de 7 dias` });

    // 5) Cobranças já em atraso no mês selecionado
    const atrasadosMes = cobMes.filter(c => c.status === "atrasado" && !c.acordoId);
    if (atrasadosMes.length) lista.push({ icon:"multa", cor:D.danger, aba:"cobrancas", texto:`${atrasadosMes.length} cobrança${atrasadosMes.length>1?"s":""} em atraso em ${mesLabel(mesSel)}` });

    // 6) Cobranças pendentes vencendo nos próximos 3 dias (avisa ANTES de virar atraso)
    const hojeYMD = mesAtual();
    if (mesSel === hojeYMD) {
      const [ay, am] = mesSel.split("-").map(Number);
      const vencimento = new Date(ay, am-1, diaVencimento, 23, 59, 59).getTime();
      const diasParaVencer = Math.ceil((vencimento - agora) / DIAS);
      const pendentesMes = cobMes.filter(c => c.status === "pendente");
      if (diasParaVencer >= 1 && diasParaVencer <= 3 && pendentesMes.length) {
        lista.push({ icon:"clock", cor:D.warning, aba:"cobrancas", texto:`${pendentesMes.length} cobrança${pendentesMes.length>1?"s":""} vence${pendentesMes.length>1?"m":""} em ${diasParaVencer===0?"hoje":diasParaVencer===1?"1 dia":`${diasParaVencer} dias`}` });
      }
    }

    // 7) Despesas do mês atual ainda não pagas
    const despesasPendMes = despesas.filter(d => d.mes === hojeYMD && d.status === "pendente");
    if (despesasPendMes.length) lista.push({ icon:"despesas", cor:D.warning, aba:"despesas", texto:`${despesasPendMes.length} despesa${despesasPendMes.length>1?"s":""} de ${mesLabel(hojeYMD)} ainda não paga${despesasPendMes.length>1?"s":""}` });

    // 8) Serviços pendentes há mais de 14 dias
    const servicosParados = servicos.filter(s => s.status === "pendente" && (() => { const t = parseDataBR(s.dataAbertura); return t ? Math.floor((agora-t)/DIAS) >= 14 : false; })());
    if (servicosParados.length) lista.push({ icon:"servicos", cor:D.warning, aba:"servicos", texto:`${servicosParados.length} serviço${servicosParados.length>1?"s":""} pendente${servicosParados.length>1?"s":""} há mais de 14 dias` });

    // 9) Visitante/prestador sem saída registrada há mais de 24h (provável esquecimento)
    const acessosEsquecidos = acessos.filter(a => !a.horaSaida && diasDesde(a.timestamp) >= 1);
    if (acessosEsquecidos.length) lista.push({ icon:"acPorta", cor:D.danger, aba:"acessos", texto:`${acessosEsquecidos.length} acesso${acessosEsquecidos.length>1?"s":""} sem saída registrada há mais de 24h` });

    // 10) Enquete aberta há mais de 30 dias sem encerrar
    const enquetesParadas = enquetes.filter(e => e.status === "aberta" && diasDesde(e.timestamp) >= 30);
    if (enquetesParadas.length) lista.push({ icon:"enquetes", cor:D.textSec, aba:"enquetes", texto:`${enquetesParadas.length} enquete${enquetesParadas.length>1?"s":""} aberta${enquetesParadas.length>1?"s":""} há mais de 30 dias` });

    // 14) Parcela de acordo vencida — se o morador furar o acordo, o síndico precisa saber
    const parcelasVencidas = acordos.filter(a => a.status === "ativo").reduce((soma, a) =>
      soma + (a.parcelas || []).filter(pc => pc.status !== "pago" && diasAteData(pc.vencimento) < 0).length, 0);
    if (parcelasVencidas) lista.push({ icon:"multa", cor:D.danger, aba:"cobrancas", texto:`${parcelasVencidas} parcela(s) de acordo vencida(s)` });

    // 12) Manutenção preventiva atrasada ou vencendo — o sinal que evita multa e interdição
    const manutAtrasadas = manutencoes.filter(m => { const d = diasAteData(m.proximaData); return d !== null && d < 0; });
    const manutProximas  = manutencoes.filter(m => { const d = diasAteData(m.proximaData); return d !== null && d >= 0 && d <= 15; });
    if (manutAtrasadas.length) lista.push({ icon:"servicos", cor:D.danger, aba:"servicos", texto:`${manutAtrasadas.length} manutenção(ões) preventiva(s) atrasada(s)` });
    else if (manutProximas.length) lista.push({ icon:"servicos", cor:D.warning, aba:"servicos", texto:`${manutProximas.length} manutenção(ões) preventiva(s) nos próximos 15 dias` });

    // 13) Despesa muito acima da média dos últimos meses (sinal clássico de vazamento)
    (() => {
      const porCategoria = {};
      despesas.forEach(d => {
        if (!d.tipo || !d.mes || !(d.valor > 0)) return;
        (porCategoria[d.tipo] = porCategoria[d.tipo] || []).push(d);
      });
      Object.entries(porCategoria).forEach(([tipo, itens]) => {
        const doMes = itens.filter(d => d.mes === hojeYMD);
        if (!doMes.length) return;
        // Média dos 6 meses anteriores (precisa de pelo menos 3 para a comparação significar algo)
        const anteriores = itens.filter(d => d.mes < hojeYMD).sort((a,b) => b.mes.localeCompare(a.mes)).slice(0, 6);
        if (anteriores.length < 3) return;
        const media = anteriores.reduce((s,d) => s + d.valor, 0) / anteriores.length;
        const atual = doMes.reduce((s,d) => s + d.valor, 0);
        if (media > 0 && atual > media * 1.4) {
          const pct = Math.round((atual / media - 1) * 100);
          lista.push({ icon:catIconId(tipo), cor:D.warning, aba:"despesas", texto:`${despCat(tipo).label} está ${pct}% acima da média dos últimos meses` });
        }
      });
    })();

    // 11) Assinatura perto de vencer ou expirada (não se aplica a cortesia)
    if (infoAssinatura.estado === "expirado") {
      lista.push({ icon:"assinatura", cor:D.danger, aba:"config", texto:"Sua assinatura expirou — algumas funções podem ficar limitadas" });
    } else if (infoAssinatura.estado === "trial" && infoAssinatura.diasRestantes <= 5) {
      lista.push({ icon:"assinatura", cor:D.warning, aba:"config", texto:`Teste grátis termina em ${infoAssinatura.diasRestantes} dia${infoAssinatura.diasRestantes!==1?"s":""}` });
    }

    return lista;
  })();

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
    // Enquanto o acordo está ativo, multa e juros ficam parados: foram congelados na negociação
    if (cob?.acordoId) {
      const base = taxaDoMorador(cob.moradorId);
      return { valorBase: base, multa: 0, juros: 0, diasAtraso: 0, valorTotal: base };
    }
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

  // ── Exportação CSV (abre no Excel / Google Sheets) ──
  // Backup completo em JSON: tudo do condomínio num arquivo só, para guardar fora do sistema.
  // Serve de seguro caso a conta do Firebase seja perdida ou algo seja apagado por engano.
  const [gerandoBackup, setGerandoBackup] = useState(false);
  const exportarBackupCompleto = async () => {
    if (gerandoBackup) return;
    setGerandoBackup(true);
    try {
      const colecoes = ["moradores","cobrancas","cobrancas_extras","pag_extras","despesas","servicos",
        "receitas","acessos","reservas","entregas","comunicados","ocorrencias","enquetes",
        "documentos","fundo_movs","eventos","observacoes","logs"];
      const dados = {};
      let totalDocs = 0;
      for (const col of colecoes) {
        const snap = await getDocs(query(collection(db, col), where("condominioId","==",condominioId)));
        dados[col] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        totalDocs += snap.docs.length;
      }
      const snapCond = await getDoc(doc(db, "condominios", condominioId));
      const backup = {
        geradoEm: new Date().toISOString(),
        geradoPor: user?.email || "",
        condominioId,
        condominio: snapCond.exists() ? snapCond.data() : null,
        totalRegistros: totalDocs,
        dados,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type:"application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${condominioId}-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Backup gerado: ${totalDocs} registros de ${colecoes.length} áreas.`);
      registrarLog("💾", `Backup completo exportado (${totalDocs} registros)`);
    } catch (e) {
      console.error("Erro ao gerar backup:", e);
      showToast("Não foi possível gerar o backup. Verifique sua conexão e tente de novo.", "error");
    } finally {
      setGerandoBackup(false);
    }
  };

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
    // Abrir o portal do morador (ou entrar como visitante) NÃO pode gerar cobrança.
    // Antes, abrir um link de portal criava cobranças para todos os moradores.
    if (portalMoradorId || readOnly) return;
    if (!configCarregada) return;  // sem a config, não dá para saber o que pode ser cobrado
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
    if (portalMoradorId || readOnly) return;  // leitura não altera status de cobrança
    if (!configCarregada) return;
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
        // Antes do marco zero a cobrança não deveria nem existir: o síndico definiu que
        // esses meses não são cobrados. Remove (nunca mexe em cobrança PAGA — isso é histórico).
        batch.delete(ref); mudou = true;
      } else if (c.status === "pendente" && hoje > venc) {
        // A partir do marco zero, marca atraso normalmente
        batch.set(ref, { status:"atrasado" }, { merge:true }); mudou = true;
      }
    });
    if (mudou) await batch.commit();
  };

  // ── Zerar atrasos: este mês limpo, contagem começa no mês que vem ──
  // Cobranças órfãs: têm moradorId de um morador daqui, mas condominioId ausente ou de outro
  // condomínio. O síndico nunca as via (a lista dele filtra por condominioId), mas o portal
  // do morador as exibia. Esta rotina varre por morador e limpa o que não pertence a este condomínio.
  const [limpandoOrfas, setLimpandoOrfas] = useState(false);
  const limparCobrancasOrfas = async () => {
    if (!condominioId || limpandoOrfas) return;
    setLimpandoOrfas(true);
    try {
      const orfas = [];
      for (const m of moradores) {
        const snap = await getDocs(query(collection(db, "cobrancas"), where("moradorId", "==", m.id)));
        snap.forEach(d => {
          const c = d.data();
          if (c.condominioId !== condominioId) orfas.push({ id:d.id, unidade:m.unidade, mes:c.mes, cond:c.condominioId || "(vazio)" });
        });
      }
      if (orfas.length === 0) {
        showToast("Nenhuma cobrança órfã encontrada. Está tudo consistente.");
        return;
      }
      const resumo = orfas.slice(0, 8).map(o => `${o.unidade} — ${o.mes} (condomínio: ${o.cond})`).join("\n");
      if (!window.confirm(
        `Encontradas ${orfas.length} cobrança(s) que não pertencem a este condomínio:\n\n${resumo}` +
        (orfas.length > 8 ? `\n...e mais ${orfas.length - 8}` : "") +
        `\n\nEssas cobranças aparecem no portal do morador mas não no seu painel. Remover?`
      )) return;

      // Uma exclusão por vez, e não em lote: a regra que autoriza remover órfãs precisa
      // consultar o morador de cada cobrança, e um writeBatch tem limite de 20 consultas
      // no total — com muitos moradores isso estoura e o Firebase recusa tudo.
      let removidas = 0, bloqueadas = 0;
      for (const o of orfas) {
        try { await deleteDoc(doc(db, "cobrancas", o.id)); removidas++; }
        catch (err) { bloqueadas++; console.error(`Erro ao remover ${o.id}:`, err); }
      }
      registrarLog("🧹", `Limpeza: ${removidas} cobrança(s) órfã(s) removida(s)${bloqueadas ? `, ${bloqueadas} bloqueada(s)` : ""}`);
      if (bloqueadas > 0) {
        showToast(`${removidas} removida(s), mas ${bloqueadas} foi(ram) bloqueada(s) pelo Firebase. Confira se as regras mais recentes estão publicadas.`, "error");
      } else {
        showToast(`${removidas} cobrança(s) órfã(s) removida(s).`);
      }
    } catch (e) {
      console.error("Erro ao limpar cobranças órfãs:", e);
      // Erro de permissão tem causa e solução específicas — vale dizer qual é
      const semPermissao = String(e?.code || e?.message || "").includes("permission");
      showToast(
        semPermissao
          ? "O Firebase bloqueou a remoção. Republique as regras do Firestore (versão mais recente) e tente de novo."
          : "Não foi possível concluir a limpeza. Verifique sua conexão e tente de novo.",
        "error"
      );
    } finally {
      setLimpandoOrfas(false);
    }
  };

  // Sobe o logo do condomínio. Redimensiona antes de gravar: um documento do Firestore
  // tem limite de ~1 MB, e uma foto de celular passa disso sozinha.
  const salvarLogo = async (arquivo) => {
    if (!arquivo || salvandoLogo) return;
    if (!arquivo.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem (PNG ou JPG).", "error"); return; }
    setSalvandoLogo(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const leitor = new FileReader();
        leitor.onload = e => {
          const img = new Image();
          img.onload = () => {
            // Reduz para caber em 300x300 mantendo a proporção
            const LADO = 300;
            const escala = Math.min(LADO / img.width, LADO / img.height, 1);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * escala);
            canvas.height = Math.round(img.height * escala);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            res(canvas.toDataURL("image/png"));
          };
          img.onerror = () => rej(new Error("imagem inválida"));
          img.src = e.target.result;
        };
        leitor.onerror = () => rej(new Error("falha ao ler o arquivo"));
        leitor.readAsDataURL(arquivo);
      });

      await setDoc(doc(db, "condominios", condominioId), { logo: base64 }, { merge:true });
      registrarLog("🖼️", "Logo do condomínio atualizado");
      showToast("Logo salvo. Ele passa a aparecer nos recibos e relatórios.");
    } catch (e) {
      console.error("Erro ao salvar o logo:", e);
      showToast("Não foi possível salvar o logo. Tente outra imagem.", "error");
    } finally {
      setSalvandoLogo(false);
    }
  };

  const removerLogo = async () => {
    if (!window.confirm("Remover o logo? Os documentos voltam a sair só com o nome do condomínio.")) return;
    try {
      await setDoc(doc(db, "condominios", condominioId), { logo: null }, { merge:true });
      registrarLog("🖼️", "Logo do condomínio removido");
      showToast("Logo removido.");
    } catch (e) {
      console.error("Erro ao remover o logo:", e);
      showToast("Não foi possível remover. Tente de novo.", "error");
    }
  };

  // Publica a prestação de contas do mês no portal do morador.
  // Em vez de dar ao portal acesso a despesas e receitas do condomínio (o que exporia
  // tudo à conta compartilhada), gera o PDF aqui e o disponibiliza como documento.
  const publicarPrestacaoContas = async () => {
    if (publicandoPrestacao) return;
    const rotulo = `Prestação de contas — ${mesLabel(mesSel)}`;
    const jaExiste = documentos.find(d => d.nome === rotulo);
    if (jaExiste && !window.confirm(`Já existe uma "${rotulo}" publicada.\n\nSubstituir pela versão atual?`)) return;
    setPublicandoPrestacao(true);
    try {
      const pdf = exportarPrestacaoContas(true);
      if (!pdf) { showToast("Não foi possível gerar o PDF.", "error"); return; }
      const dados = {
        condominioId,
        nome: rotulo,
        categoria: "Outro",
        vencimento: "",
        obs: `Publicada em ${new Date().toLocaleDateString("pt-BR")}`,
        arquivo: pdf,
        arquivoNome: `prestacao-contas-${slugCond()}-${mesSel}.pdf`,
        publico: true,
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        timestamp: Date.now(),
      };
      if (jaExiste) await setDoc(doc(db, "documentos", jaExiste.id), dados, { merge:true });
      else await addDoc(collection(db, "documentos"), dados);
      registrarLog("📄", `Prestação de contas de ${mesLabel(mesSel)} publicada no portal`);
      showToast(`Publicada. Os moradores já veem a prestação de ${mesLabel(mesSel)} no portal.`);
    } catch (e) {
      console.error("Erro ao publicar a prestação de contas:", e);
      showToast("Não foi possível publicar. Verifique sua conexão e tente de novo.", "error");
    } finally {
      setPublicandoPrestacao(false);
    }
  };

  const zerarAtrasados = async () => {
    if (!condominioId) return;
    const hoje = new Date();
    const proxMesData = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1);
    const marcoStr = `${proxMesData.getFullYear()}-${String(proxMesData.getMonth()+1).padStart(2,"0")}-01`;
    const proxMesYM = `${proxMesData.getFullYear()}-${String(proxMesData.getMonth()+1).padStart(2,"0")}`;
    const mesAtualYM = mesAtual();
    const mesInicio = marcoStr.slice(0,7); // ex: "2026-08" — 1º mês que será cobrado

    // 1. Define o marco zero. Se isto falhar, nada mais faz sentido: aborta e avisa.
    //    Antes o erro era engolido e o botão dizia "Pronto!" mesmo sem ter gravado nada.
    try {
      await setDoc(doc(db, "condominios", condominioId), { marcoZero: marcoStr }, { merge:true });
    } catch (e) {
      console.error("Erro ao gravar o marco de início da cobrança:", e);
      showToast("Não foi possível salvar o início da cobrança. Verifique sua conexão e as permissões do Firebase.", "error");
      return;
    }

    // 2. Remove cobranças NÃO pagas de meses anteriores ao início
    const alvo = cobrancas.filter(c => c.mes < mesInicio && c.status !== "pago");
    let removidas = 0, falhas = 0;
    for (const c of alvo) {
      try { await deleteDoc(doc(db, "cobrancas", c.id)); removidas++; }
      catch (e) { falhas++; console.error(`Erro ao remover cobrança ${c.id}:`, e); }
    }

    // 3. Qualquer atrasado remanescente (do marco em diante) volta a pendente
    for (const c of cobrancas) {
      if (c.mes >= mesInicio && c.status === "atrasado") {
        try { await setDoc(doc(db, "cobrancas", c.id), { status:"pendente" }, { merge:true }); }
        catch (e) { falhas++; console.error(`Erro ao reverter cobrança ${c.id}:`, e); }
      }
    }

    // 4. Observação do mês atual (não crítica: se falhar, segue)
    try {
      await setDoc(doc(db, "observacoes", `${condominioId}_${mesAtualYM}`), {
        condominioId, mes: mesAtualYM,
        texto: `Início de operação: as cobranças começam em ${mesLabel(proxMesYM)}. Meses anteriores não são cobrados.`,
        atualizadoEm: new Date().toLocaleString("pt-BR"),
      }, { merge:true });
    } catch (e) { console.error("Erro ao salvar a observação do mês:", e); }

    registrarLog("🔄", `Início da cobrança definido para ${mesLabel(proxMesYM)} — ${removidas} cobrança(s) removida(s)${falhas?`, ${falhas} falha(s)`:""}`);

    // Relato honesto do que realmente aconteceu
    if (falhas > 0) {
      showToast(`${removidas} cobrança(s) removida(s), mas ${falhas} falhou(ram). Recarregue a página e tente de novo.`, "error");
    } else if (alvo.length === 0) {
      showToast(`Início da cobrança definido para ${mesLabel(proxMesYM)}. Não havia cobrança anterior para remover.`);
    } else {
      showToast(`Pronto! ${removidas} cobrança(s) anterior(es) removida(s). A cobrança começa em ${mesLabel(proxMesYM)}.`);
    }
  };

  useEffect(() => {
    // Portal do morador e visitante são somente leitura: não geram nem alteram cobrança
    if (portalMoradorId || readOnly) return;
    // Espera a config chegar: agir com marcoZero ainda indefinido recriava cobranças
    // de meses que o síndico tinha acabado de limpar.
    if (!configCarregada) return;
    if (user && condominioId && moradores.length > 0) {
      garantirMes(mesSel);
      atualizarAtrasados();
    }
  }, [user, condominioId, moradores.length, cobrancas.length, diaVencimento, marcoZero, readOnly, configCarregada]);

  const mudarMes = async (m) => {
    setMesSel(m);
    setSelCob([]);
    garantirMes(m);
    const snap = await getDoc(doc(db, "observacoes", `${condominioId}_${m}`));
    const texto = snap.exists() ? (snap.data().texto || "") : "";
    setObsMes(texto);
    setObsSalva(texto);
  };

  // ── Pagamentos ──
  // ── Gerar recibo de pagamento em PDF ──
  // Nome do condomínio para uso em PDFs. Antes estava fixo como "Vila Real 140" em 5 pontos,
  // o que fazia qualquer outro cliente receber documentos com o nome do primeiro condomínio.
  const nomeCond = () => condominio?.nome || "Condomínio";
  // Versão do nome segura para nome de arquivo (sem acento, espaço ou barra)
  const slugCond = () => normalizarTexto(nomeCond()).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "condominio";


  const registrarPagamento = (moradorId) => {
    const morador = moradores.find(m => m.id === moradorId);
    const dataPgto = new Date().toLocaleDateString("pt-BR");
    const salvar = async (base64="") => {
      await setDoc(doc(db, "cobrancas", `${condominioId}_${moradorId}_${mesSel}`), { condominioId, moradorId, mes:mesSel, status:"pago", dataPagamento:dataPgto, obs:pagForm.obs, comprovante:base64, arquivoNome:pagForm.arquivoNome }, { merge:true });
      setModal(null); setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
      let emailOk = false;
      if (morador) {
        gerarReciboPDF(morador, dataPgto, pagForm.obs, { mesSel, taxa, nomeCondominio: nomeCond(), logo: logoCond });
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
          emailOk = true;
        } catch(e) {
          console.error("Erro ao enviar e-mail de confirmação:", e);
        }
      }
      // Só afirma o que realmente aconteceu
      showToast(emailOk
        ? "Pagamento registrado. Recibo gerado e e-mail enviado ao morador."
        : "Pagamento registrado e recibo gerado. O e-mail ao morador não saiu — avise por outro meio.",
        emailOk ? "success" : "error");
    };
    const salvarSeguro = async (base64="") => {
      try { await salvar(base64); }
      catch (e) {
        console.error("Erro ao registrar pagamento:", e);
        showToast("Não foi possível registrar o pagamento. Verifique sua conexão e tente de novo.", "error");
      }
    };
    if (pagForm.arquivo) { const r=new FileReader(); r.onload=e=>salvarSeguro(e.target.result); r.readAsDataURL(pagForm.arquivo); } else salvarSeguro();
  };

  // Marca vários pagamentos de uma vez (conciliação de extrato).
  // Não dispara e-mail: 20 envios de golpe viram spam e o síndico perde o controle de quem foi avisado.
  const marcarSelecionadosPagos = async () => {
    if (selCob.length === 0) return;
    const dataPgto = new Date().toLocaleDateString("pt-BR");
    const nomes = selCob.map(id => moradores.find(m => m.id === id)?.unidade || "?").join(", ");
    if (!window.confirm(`Marcar ${selCob.length} cobrança(s) como paga(s) em ${mesLabel(mesSel)}?\n\nUnidades: ${nomes}\n\nOs moradores NÃO receberão e-mail automático por esta ação.`)) return;
    try {
      const batch = writeBatch(db);
      selCob.forEach(moradorId => {
        batch.set(doc(db, "cobrancas", `${condominioId}_${moradorId}_${mesSel}`),
          { condominioId, moradorId, mes:mesSel, status:"pago", dataPagamento:dataPgto, obs:"Baixa em lote", comprovante:null, arquivoNome:null },
          { merge:true });
      });
      await batch.commit();
      registrarLog("✅", `Baixa em lote: ${selCob.length} pagamento(s) registrado(s) — ${mesLabel(mesSel)} (unidades: ${nomes})`);
      showToast(`${selCob.length} pagamento(s) registrado(s). Nenhum e-mail foi enviado.`);
      setSelCob([]);
    } catch (e) {
      console.error("Erro na baixa em lote:", e);
      showToast("Não foi possível registrar os pagamentos. Verifique sua conexão e tente de novo.", "error");
    }
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
    if (!novoMorador.email.includes("@") || !novoMorador.email.includes(".")) { showToast("E-mail parece inválido. Confira antes de salvar.", "error"); return; }
    // Duplicidade: mesma unidade ou mesmo e-mail já cadastrado
    const jaUnidade = moradores.find(m => normalizarTexto(m.unidade) === normalizarTexto(novoMorador.unidade));
    if (jaUnidade && !window.confirm(`A unidade ${novoMorador.unidade} já está cadastrada para ${jaUnidade.nome}.\n\nCadastrar assim mesmo? (útil só se houver dois responsáveis pelo mesmo apartamento)`)) return;
    const jaEmail = moradores.find(m => normalizarTexto(m.email) === normalizarTexto(novoMorador.email));
    if (jaEmail) { showToast(`Este e-mail já é do morador ${jaEmail.nome} (${jaEmail.unidade}). Use outro.`, "error"); return; }
    // taxaCustom: número se preenchido, null se vazio (usa a taxa padrão)
    const taxaCustom = novoMorador.taxaCustom !== "" && valorValido(novoMorador.taxaCustom)
      ? paraNumero(novoMorador.taxaCustom) : null;
    const dados = {
      ...novoMorador, taxaCustom, condominioId, tokenPortal: gerarTokenPortal(),
      // LGPD: guarda quando e por quem o cadastro foi feito, para comprovar a base legal
      cadastradoEm: new Date().toISOString(),
      cadastradoPor: user?.email || "",
      origemCadastro: "cadastro individual",
    };
    const ref = await addDoc(collection(db, "moradores"), dados);
    await setDoc(doc(db, "cobrancas", `${condominioId}_${ref.id}_${mesSel}`), { condominioId, moradorId:ref.id, mes:mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
    registrarLog("👤", `Morador cadastrado: ${novoMorador.nome} (${novoMorador.unidade})`);
    setNovoMorador({ nome:"", unidade:"", proprietario:"", email:"", telefone:"", tipo:"Proprietário", veiculos:"", pets:"", taxaCustom:"" }); setModal(null); showToast("Morador cadastrado!");
  };

  // Importa vários moradores de uma vez a partir de planilha colada ou CSV.
  // Só grava as linhas válidas; as com erro são mostradas ao síndico para correção.
  const importarMoradores = async (linhasValidas) => {
    if (!linhasValidas.length || importando) return;
    setImportando(true);
    try {
      const batch = writeBatch(db);
      linhasValidas.forEach(l => {
        const ref = doc(collection(db, "moradores"));
        batch.set(ref, {
          condominioId,
          nome: l.nome,
          unidade: l.unidade,
          email: l.email,
          telefone: l.telefone || "",
          tipo: l.tipo || "Proprietário",
          proprietario: l.proprietario || "",
          veiculos: "", pets: "", taxaCustom: null,
          tokenPortal: gerarTokenPortal(),
          cadastradoEm: new Date().toISOString(),
          cadastradoPor: user?.email || "",
          origemCadastro: "importação de planilha",
        });
        // Já cria a cobrança do mês corrente, como no cadastro individual
        batch.set(doc(db, "cobrancas", `${condominioId}_${ref.id}_${mesSel}`),
          { condominioId, moradorId: ref.id, mes: mesSel, status: "pendente", comprovante: null, arquivoNome: null });
      });
      await batch.commit();
      registrarLog("👥", `Importação: ${linhasValidas.length} morador(es) cadastrado(s) de uma vez`);
      showToast(`${linhasValidas.length} morador(es) importado(s) com sucesso.`);
      setImportTexto("");
      setModal(null);
    } catch (e) {
      console.error("Erro na importação:", e);
      showToast("Não foi possível importar. Verifique sua conexão e tente de novo.", "error");
    } finally {
      setImportando(false);
    }
  };

  // ── Acordo de dívida ──
  // O acordo NÃO apaga nem altera as cobranças originais: elas ganham a marca `acordoId`
  // e param de contar como atraso puro. Se o acordo for cancelado, tudo volta como estava.
  const acordoDoMorador = (moradorId) => acordos.find(a => a.moradorId === moradorId && a.status === "ativo");

  const criarAcordo = async () => {
    const { moradorId, nParcelas, primeiraData, entrada } = formAcordo;
    const m = moradores.find(x => x.id === moradorId);
    if (!m) { showToast("Selecione o morador.", "error"); return; }
    if (!primeiraData) { showToast("Informe o vencimento da primeira parcela.", "error"); return; }
    const n = parseInt(nParcelas) || 0;
    if (n < 1 || n > 36) { showToast("O número de parcelas deve ficar entre 1 e 36.", "error"); return; }
    if (acordoDoMorador(moradorId)) { showToast("Este morador já tem um acordo ativo. Cancele o atual antes de criar outro.", "error"); return; }

    // Dívida = cobranças em aberto do morador, com multa e juros congelados na data de hoje
    const emAberto = cobrancas.filter(c => c.moradorId === moradorId && c.status !== "pago" && !c.acordoId);
    if (!emAberto.length) { showToast("Este morador não tem cobranças em aberto.", "error"); return; }
    const totalDivida = emAberto.reduce((soma, c) => soma + encargosCobranca(c).valorTotal, 0);
    const valorEntrada = valorValido(entrada) ? paraNumero(entrada) : 0;
    if (valorEntrada >= totalDivida) { showToast("A entrada não pode ser igual ou maior que a dívida.", "error"); return; }
    const restante = totalDivida - valorEntrada;
    const valorParcela = Math.round((restante / n) * 100) / 100;

    const parcelas = Array.from({ length: n }, (_, i) => ({
      numero: i + 1,
      // A última parcela absorve a diferença de centavos do arredondamento
      valor: i === n - 1 ? Math.round((restante - valorParcela * (n - 1)) * 100) / 100 : valorParcela,
      vencimento: somarMeses(primeiraData, i),
      status: "pendente",
      pagoEm: null,
    }));

    if (!window.confirm(
      `Criar acordo para ${m.nome} (${m.unidade})?\n\n` +
      `Dívida atual: R$ ${totalDivida.toFixed(2).replace(".",",")} (${emAberto.length} cobrança(s))\n` +
      (valorEntrada > 0 ? `Entrada: R$ ${valorEntrada.toFixed(2).replace(".",",")}\n` : "") +
      `${n}x de aproximadamente R$ ${valorParcela.toFixed(2).replace(".",",")}\n\n` +
      `As cobranças originais ficam marcadas como "em acordo" e param de acumular novos encargos.`
    )) return;

    try {
      const ref = await addDoc(collection(db, "acordos"), {
        condominioId, moradorId,
        moradorNome: m.nome, unidade: m.unidade,
        cobrancasIds: emAberto.map(c => c.id),
        totalDivida, entrada: valorEntrada, parcelas,
        status: "ativo",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        criadoPor: user?.email || "",
        timestamp: Date.now(),
      });
      // Marca as cobranças originais (sem apagar nem mudar o status)
      const batch = writeBatch(db);
      emAberto.forEach(c => batch.set(doc(db, "cobrancas", c.id), { acordoId: ref.id }, { merge:true }));
      await batch.commit();
      registrarLog("🤝", `Acordo criado: ${m.nome} (${m.unidade}) — R$ ${totalDivida.toFixed(2)} em ${n}x`);
      showToast(`Acordo criado: ${n} parcela(s) para ${m.nome}.`);
      setFormAcordo({ moradorId:"", nParcelas:3, primeiraData:"", entrada:"" });
      setModal(null);
    } catch (e) {
      console.error("Erro ao criar acordo:", e);
      showToast("Não foi possível criar o acordo. Verifique sua conexão e tente de novo.", "error");
    }
  };

  const pagarParcela = async (acordo, numero) => {
    const p = acordo.parcelas.find(x => x.numero === numero);
    if (!p || p.status === "pago") return;
    if (!window.confirm(`Registrar o pagamento da parcela ${numero} (R$ ${p.valor.toFixed(2).replace(".",",")})?`)) return;
    const hoje = new Date().toLocaleDateString("pt-BR");
    const novas = acordo.parcelas.map(x => x.numero === numero ? { ...x, status:"pago", pagoEm:hoje } : x);
    const quitado = novas.every(x => x.status === "pago");
    try {
      await setDoc(doc(db, "acordos", acordo.id), { parcelas: novas, status: quitado ? "quitado" : "ativo" }, { merge:true });
      // Ao quitar tudo, as cobranças originais finalmente viram pagas
      if (quitado) {
        const batch = writeBatch(db);
        (acordo.cobrancasIds || []).forEach(cid => batch.set(doc(db, "cobrancas", cid), { status:"pago", dataPagamento:hoje, obs:"Quitado via acordo" }, { merge:true }));
        await batch.commit();
        registrarLog("✅", `Acordo quitado: ${acordo.moradorNome} (${acordo.unidade})`);
        showToast(`Acordo quitado. As cobranças de ${acordo.moradorNome} foram baixadas.`);
      } else {
        registrarLog("💰", `Parcela ${numero} paga: ${acordo.moradorNome} (${acordo.unidade})`);
        showToast(`Parcela ${numero} registrada.`);
      }
    } catch (e) {
      console.error("Erro ao pagar parcela:", e);
      showToast("Não foi possível registrar. Tente de novo.", "error");
    }
  };

  const cancelarAcordo = async (acordo) => {
    if (!window.confirm(`Cancelar o acordo de ${acordo.moradorNome}?\n\nAs cobranças originais voltam a ser tratadas como atraso normal, com multa e juros voltando a correr.`)) return;
    try {
      await setDoc(doc(db, "acordos", acordo.id), { status:"cancelado", canceladoEm: new Date().toLocaleDateString("pt-BR") }, { merge:true });
      const batch = writeBatch(db);
      (acordo.cobrancasIds || []).forEach(cid => batch.set(doc(db, "cobrancas", cid), { acordoId: null }, { merge:true }));
      await batch.commit();
      registrarLog("↩️", `Acordo cancelado: ${acordo.moradorNome} (${acordo.unidade})`);
      showToast("Acordo cancelado. As cobranças voltaram ao estado anterior.");
    } catch (e) {
      console.error("Erro ao cancelar acordo:", e);
      showToast("Não foi possível cancelar. Tente de novo.", "error");
    }
  };

  // ── Manutenção preventiva ──
  const salvarManutencao = async () => {
    if (!novaManutencao.titulo.trim()) { showToast("Informe o que precisa ser feito.", "error"); return; }
    if (!novaManutencao.proximaData) { showToast("Informe a data da próxima execução.", "error"); return; }
    try {
      await addDoc(collection(db, "manutencoes"), {
        condominioId,
        titulo: novaManutencao.titulo.trim(),
        periodicidade: novaManutencao.periodicidade,
        proximaData: novaManutencao.proximaData,
        responsavel: novaManutencao.responsavel.trim(),
        obs: novaManutencao.obs.trim(),
        ultimaExecucao: null,
        criadoEm: new Date().toLocaleDateString("pt-BR"),
        timestamp: Date.now(),
      });
      registrarLog("🔧", `Manutenção preventiva cadastrada: ${novaManutencao.titulo.trim()}`);
      showToast("Manutenção preventiva cadastrada.");
      setNovaManutencao({ titulo:"", periodicidade:"semestral", proximaData:"", responsavel:"", obs:"" });
      setModal(null);
    } catch (e) {
      console.error("Erro ao salvar manutenção:", e);
      showToast("Não foi possível salvar. Verifique sua conexão e tente de novo.", "error");
    }
  };

  // Ao concluir, agenda a próxima automaticamente pela periodicidade
  const concluirManutencao = async (m) => {
    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-${String(hoje.getDate()).padStart(2,"0")}`;
    const prox = somarMeses(hojeISO, infoPeriodicidade(m.periodicidade).meses);
    if (!window.confirm(`Marcar "${m.titulo}" como feita hoje?\n\nA próxima fica agendada para ${formatarDataBR(prox)}.`)) return;
    try {
      await setDoc(doc(db, "manutencoes", m.id), { ultimaExecucao: hojeISO, proximaData: prox }, { merge:true });
      registrarLog("✅", `Manutenção realizada: ${m.titulo} — próxima em ${formatarDataBR(prox)}`);
      showToast(`Feito. Próxima manutenção agendada para ${formatarDataBR(prox)}.`);
    } catch (e) {
      console.error("Erro ao concluir manutenção:", e);
      showToast("Não foi possível registrar. Tente de novo.", "error");
    }
  };

  const removerManutencao = async (id) => await removerComDesfazer("manutencoes", id, "Manutenção");

  // Liga/desliga a visibilidade de um documento no portal do morador
  const alternarDocPublico = async (docItem) => {
    try {
      const novo = !docItem.publico;
      await setDoc(doc(db, "documentos", docItem.id), { publico: novo }, { merge:true });
      showToast(novo ? "Documento visível para os moradores." : "Documento oculto dos moradores.");
    } catch (e) {
      console.error("Erro ao alterar visibilidade:", e);
      showToast("Não foi possível alterar. Tente de novo.", "error");
    }
  };

  // Troca o token do morador: o link antigo para de funcionar na hora
  const revogarLinkPortal = async (m) => {
    const temToken = !!m.tokenPortal;
    const msg = temToken
      ? `Gerar um link novo para ${m.nome}?\n\nO link antigo para de funcionar imediatamente. Use isto se o morador saiu do apartamento ou se o link vazou.`
      : `Proteger o portal de ${m.nome} com um link exclusivo?\n\nO link atual para de funcionar e você precisa enviar o novo ao morador.`;
    if (!window.confirm(msg)) return;
    try {
      await setDoc(doc(db, "moradores", m.id), { tokenPortal: gerarTokenPortal() }, { merge:true });
      registrarLog("🔑", `Link do portal renovado: ${m.nome} (${m.unidade})`);
      showToast("Link renovado. Copie e envie o novo link ao morador.");
    } catch (e) {
      console.error("Erro ao renovar link:", e);
      showToast("Não foi possível renovar o link. Tente de novo.", "error");
    }
  };

  // Mensagem de cobrança pronta para o WhatsApp, com valor, encargos e link do portal
  const whatsCobranca = (m, cob) => {
    const enc = cob ? encargosCobranca(cob) : null;
    const link = `${window.location.origin}${window.location.pathname}?cond=${condominioId}&morador=${m.id}${m.tokenPortal ? `&t=${m.tokenPortal}` : ""}`;
    const valor = enc ? enc.valorTotal.toFixed(2).replace(".", ",") : "";
    const linhas = [
      `Olá, ${(m.nome || "").split(" ")[0]}!`,
      "",
      `Passando para lembrar da taxa de condomínio de ${mesLabel(mesSel)} — ${m.unidade}.`,
    ];
    if (enc && (enc.multa > 0 || enc.juros > 0)) {
      linhas.push(`Valor: R$ ${valor} (taxa R$ ${enc.valorBase.toFixed(2).replace(".",",")} + multa e juros por ${enc.diasAtraso} dia(s) de atraso).`);
    } else if (enc) {
      linhas.push(`Valor: R$ ${valor}.`);
    }
    linhas.push("", `Você pode consultar tudo pelo portal: ${link}`, "", `${nomeCond()}`);
    return linhas.join("\n");
  };

  const abrirWhatsCobranca = (m, cob) => {
    const url = linkWhatsApp(m.telefone, whatsCobranca(m, cob));
    if (!url) { showToast(`${m.nome} não tem telefone válido cadastrado. Edite o morador para incluir.`, "error"); return; }
    window.open(url, "_blank", "noopener,noreferrer");
    registrarLog("📱", `Cobrança enviada por WhatsApp: ${m.nome} (${m.unidade}) — ${mesLabel(mesSel)}`);
  };

  // ── Equipe: convidar, alterar papel e revogar acesso ──
  const convidarMembro = async (email, papel) => {
    const e = String(email||"").trim().toLowerCase();
    if (!e.includes("@") || !e.includes(".")) { showToast("Informe um e-mail válido.", "error"); return false; }
    if (equipe.some(u => normalizarTexto(u.email) === normalizarTexto(e))) { showToast("Esta pessoa já faz parte da equipe.", "error"); return false; }
    try {
      await setDoc(doc(db, "convites", e), {
        email: e, papel, condominioId,
        condominioNome: condominio?.nome || "",
        convidadoPor: user?.email || "",
        criadoEm: new Date().toLocaleDateString("pt-BR"),
      });
      registrarLog("👤", `Convite enviado: ${e} como ${infoPapel(papel).label}`);
      showToast(`Convite criado. Peça para ${e} criar a conta com este e-mail.`);
      return true;
    } catch (err) {
      console.error("Erro ao convidar:", err);
      showToast("Não foi possível criar o convite. Tente de novo.", "error");
      return false;
    }
  };

  const alterarPapel = async (uid, novoPapel) => {
    const u = equipe.find(x => x.id === uid);
    if (!u) return;
    if (u.id === user?.uid) { showToast("Você não pode alterar o seu próprio perfil.", "error"); return; }
    try {
      await setDoc(doc(db, "usuarios", uid), { papel: novoPapel }, { merge:true });
      registrarLog("👤", `Perfil alterado: ${u.email} agora é ${infoPapel(novoPapel).label}`);
      showToast(`${u.nome || u.email} agora é ${infoPapel(novoPapel).label}.`);
    } catch (e) {
      console.error("Erro ao alterar perfil:", e);
      showToast("Não foi possível alterar o perfil. Tente de novo.", "error");
    }
  };

  const revogarAcesso = async (uid) => {
    const u = equipe.find(x => x.id === uid);
    if (!u) return;
    if (u.id === user?.uid) { showToast("Você não pode remover o seu próprio acesso.", "error"); return; }
    if (!window.confirm(`Remover o acesso de ${u.nome || u.email}?\n\nA conta continua existindo, mas deixa de ver este condomínio.`)) return;
    try {
      await setDoc(doc(db, "usuarios", uid), { condominioId: null }, { merge:true });
      registrarLog("🗑️", `Acesso revogado: ${u.email}`);
      showToast("Acesso removido.");
    } catch (e) {
      console.error("Erro ao revogar:", e);
      showToast("Não foi possível remover o acesso. Tente de novo.", "error");
    }
  };

  const removerMorador = async (id) => {
    if (!perm.podeRemoverMorador) { showToast("Seu perfil não permite remover moradores.", "error"); return; }
    const m = moradores.find(x => x.id === id);
    if (!m) return;
    try {
      // Guarda tudo antes de apagar, para conseguir desfazer
      const snapMor = await getDoc(doc(db, "moradores", id));
      const backupMor = snapMor.exists() ? snapMor.data() : null;
      const snap = await getDocs(query(collection(db, "cobrancas"), where("moradorId","==",id)));
      const backupCob = snap.docs.map(d => ({ id:d.id, dados:d.data() }));

      const nPagos = backupCob.filter(c => c.dados?.status === "pago").length;
      const aviso = `Remover ${m.nome} (${m.unidade})?\n\n`
        + `Isto também apaga ${backupCob.length} registro(s) de cobrança`
        + (nPagos ? `, incluindo ${nPagos} pagamento(s) já quitado(s)` : "")
        + `.\n\nVocê terá alguns segundos para desfazer.`;
      if (!window.confirm(aviso)) return;

      await deleteDoc(doc(db, "moradores", id));
      const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
      registrarLog("🗑️", `Morador removido: ${m.nome} (${m.unidade}) — ${backupCob.length} cobrança(s) junto`);

      setToast({
        msg: `${m.nome} removido${backupCob.length ? ` com ${backupCob.length} cobrança(s)` : ""}.`,
        type: "error",
        rotuloAcao: "Desfazer",
        acao: async () => {
          try {
            if (backupMor) await setDoc(doc(db, "moradores", id), backupMor);
            if (backupCob.length) {
              const b2 = writeBatch(db);
              backupCob.forEach(c => b2.set(doc(db, "cobrancas", c.id), c.dados));
              await b2.commit();
            }
            registrarLog("↩️", `Remoção desfeita: ${m.nome} (${m.unidade}) restaurado`);
            showToast(`${m.nome} foi restaurado com o histórico.`);
          } catch (e) {
            console.error("Erro ao restaurar morador:", e);
            showToast("Não foi possível restaurar. Verifique sua conexão.", "error");
          }
        },
      });
    } catch (e) {
      console.error("Erro ao remover morador:", e);
      showToast("Não foi possível remover o morador. Verifique sua conexão e tente de novo.", "error");
    }
  };

  // Busca do topo: vai para a aba Moradores e abre o histórico do morador
  const abrirMoradorBusca = (m) => {
    setAba("moradores");
    { setFichaSecao("cobrancas"); setModal({ type:"historico", data:m }); };
  };

  const salvarEdicaoMorador = async () => {
    if (!editMorador.nome || !editMorador.unidade || !editMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const { id, ...dados } = editMorador;
    // Converte taxaCustom (string do input) para número ou null
    dados.taxaCustom = (dados.taxaCustom !== "" && dados.taxaCustom != null && !isNaN(paraNumero(dados.taxaCustom)))
      ? paraNumero(dados.taxaCustom) : null;
    await setDoc(doc(db, "moradores", id), dados, { merge:true });
    registrarLog("✏️", `Morador editado: ${editMorador.nome} (${editMorador.unidade})`);
    setEditMorador(null); setModal(null); showToast("Morador atualizado com sucesso!");
  };

  // ── Despesas ──
  const adicionarDespesa = () => {
    if (!novaDespesa.valor || !novaDespesa.mes) { showToast("Preencha o valor e o mês.", "error"); return; }
    if (!valorValido(novaDespesa.valor)) { showToast("Informe um valor maior que zero. Ex: 1.500,00", "error"); return; }
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
          valor:paraNumero(novaDespesa.valor)||0, mes:mesAlvo, status:"pendente",
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
    await setDoc(doc(db,"servicos",id), { status:"concluido", dataInicio:concluirForm.dataInicio, dataFim:concluirForm.dataFim, valorMaterial:paraNumero(concluirForm.valorMaterial)||0, valorMaoDeObra:paraNumero(concluirForm.valorMaoDeObra)||0, obsConclusao:concluirForm.obs }, { merge:true });
    registrarLog("✅", `Serviço concluído: ${s?.titulo||id} — Total: R$ ${((paraNumero(concluirForm.valorMaterial)||0)+(paraNumero(concluirForm.valorMaoDeObra)||0)).toFixed(2).replace(".",",")}`);
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
      dataEntrada: novoAcesso.dataEntrada ? (()=>{ const [an,me,di] = novoAcesso.dataEntrada.split("-"); return `${di}/${me}/${an}`; })() : dataHoje,
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
    await removerComDesfazer("acessos", id, "Registro");
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
    await removerComDesfazer("reservas", id, "Reserva");
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
    await removerComDesfazer("comunicados", id, "Comunicado");
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
      publico: !!novoDocumento.publico,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      timestamp: Date.now(),
    });
    registrarLog("📁", `Documento adicionado: ${novoDocumento.nome.trim()}`);
    setNovoDocumento({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"", publico:false });
    setModal(null);
    showToast("Documento salvo!");
  };

  const removerDocumento = async (id) => {
    await removerComDesfazer("documentos", id, "Documento");
  };

  // ── Fundo de Reserva ──
  const registrarMovFundo = async () => {
    const valor = paraNumero(novaMovFundo.valor) || 0;
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
    await removerComDesfazer("fundo_movs", id, "Movimentação");
  };

  const salvarPercentualFundo = async (pct) => {
    await setDoc(doc(db, "condominios", condominioId), { percentualFundo: pct }, { merge:true });
    showToast("Percentual do fundo atualizado!");
  };

  // ── Cobranças extras / rateios ──
  const criarCobrancaExtra = async () => {
    if (!novaCobExtra.descricao.trim()) { showToast("Informe a descrição da cobrança.", "error"); return; }
    const valorInformado = paraNumero(novaCobExtra.valor) || 0;
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
    const valor = paraNumero(novaReceita.valor) || 0;
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
    await removerComDesfazer("receitas", id, "Receita");
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
    await removerComDesfazer("ocorrencias", id, "Ocorrência");
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
    await removerComDesfazer("entregas", id, "Registro");
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
    await removerComDesfazer("eventos", id, "Evento");
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






  // Salva todos os parâmetros da tela de config de uma vez
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const salvarConfigGeral = async () => {
    setSalvandoConfig(true);
    try {
      // paraNumero (e não parseFloat): os campos aceitam vírgula, e parseFloat("180,50") daria 180
      const dados = { taxa: paraNumero(taxa) || 0, diaVencimento: parseInt(diaVencimento) || 10 };
      if (podeUsar("multaJuros")) {
        dados.cobrarMultaJuros = cobrarMultaJuros;
        dados.multaPercent = paraNumero(multaPercent) || 0;
        dados.jurosPercentMes = paraNumero(jurosPercentMes) || 0;
      }
      await setDoc(doc(db,"condominios",condominioId), dados, { merge:true });
      showToast("Configurações salvas!");
    } catch (e) {
      console.error("Erro ao salvar configurações:", e);
      showToast("Não foi possível salvar. Verifique sua conexão e tente de novo.", "error");
    } finally { setSalvandoConfig(false); }
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

      const falhas = destinatarios.length - enviados;
      showToast(
        falhas === 0
          ? `${enviados} e-mail(s) enviado(s) com sucesso.`
          : `${enviados} de ${destinatarios.length} e-mail(s) enviado(s). ${falhas} falhou(ram) — avise esses moradores por outro meio.`,
        falhas === 0 ? "success" : "error"
      );
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
    docPdf.text(`${nomeCond()} — Relatório do Condomínio`, X, y); desenharLogoPDF(docPdf, logoCond, { x:172, y:6, tamanho:20 }); y+=7;
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
    docPdf.save(`relatorio-${slugCond()}-${mesSel}.pdf`); showToast("PDF gerado com sucesso!");
  };

  const exportarPrestacaoContas = (publicar = false) => {
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
    if (logoCond) desenharLogoPDF(docPdf, logoCond, { x: W/2 - 12, y: 6, tamanho: 24 });
    docPdf.text(nomeCond(), W/2, 30, { align:"center" });
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
      docPdf.text(`${nomeCond()} - Prestação de Contas - ${mesLabelEmail(mesSel)}`, X, 293);
      docPdf.text(`Pagina ${i} de ${totalPags}`, W-14, 293, { align:"right" });
    }

    if (publicar) return docPdf.output("datauristring");
    docPdf.save(`prestacao-contas-${slugCond()}-${mesSel}.pdf`);
    showToast("Prestacao de contas gerada!");
  };

  const [maisAberto, setMaisAberto] = useState(false);

  const navPrincipal = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças"  },
    { id:"moradores", icon:"👥", label:"Moradores"  },
    { id:"despesas",  icon:"💧", label:"Água/Luz"   },
    { id:"servicos",  icon:"🔧", label:"Serviços"   },
  ].filter(i => podeVerAba(i.id));
  const navSecundario = [
    { id:"reservas",    icon:"📅", label:"Reservas"    },
    { id:"acessos",     icon:"🚪", label:"Acessos"     },
    { id:"entregas",    icon:"📦", label:"Entregas"    },
    { id:"comunicados", icon:"📢", label:"Comunicados" },
    { id:"ocorrencias", icon:"🛎️", label:"Ocorrências" },
    { id:"enquetes",    icon:"🗳️", label:"Consultas"    },
    { id:"documentos",  icon:"📁", label:"Documentos"  },
    { id:"fundoReserva",icon:"🏦", label:"Fundo"       },
    { id:"fluxoCaixa",  icon:"📈", label:"Fluxo de Caixa" },
    { id:"agenda",      icon:"🗓️", label:"Agenda"      },
    { id:"historico",   icon:"📋", label:"Histórico"   },
    ...(perm.podeConfigurar ? [{ id:"config", icon:"⚙️", label:"Config."  }] : []),
  ].filter(i => podeVerAba(i.id));

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
    { id:"enquetes",    icon:"🗳️", label:"Consultas"    },
    { id:"documentos",  icon:"📁", label:"Documentos"  },
    { id:"fundoReserva",icon:"🏦", label:"Fundo"       },
    { id:"fluxoCaixa",  icon:"📈", label:"Fluxo de Caixa" },
    { id:"agenda",      icon:"🗓️", label:"Agenda"      },
    { id:"historico",   icon:"📋", label:"Histórico"   },
    ...(perm.podeConfigurar ? [{ id:"config", icon:"⚙️", label:"Config." }] : []),
  ].filter(i => podeVerAba(i.id));

  // Se o papel não dá acesso à aba atual, leva para a primeira permitida.
  // Fica aqui (e não junto dos outros efeitos) porque depende de navItems.
  useEffect(() => {
    if (!condominioId || !navItems.length) return;
    if (!podeVerAba(aba) && navItems[0].id !== aba) setAba(navItems[0].id);
  }, [papelUsuario, condominioId, aba]);

  // Agrupamento da sidebar desktop (seções com título)
  const gruposNav = [
    { titulo:"Principal",   ids:["dashboard","cobrancas","moradores"] },
    { titulo:"Operação",    ids:["despesas","servicos","reservas","acessos","entregas"] },
    { titulo:"Comunicação", ids:["comunicados","ocorrencias","enquetes"] },
    { titulo:"Financeiro",  ids:["fundoReserva","fluxoCaixa"] },
    { titulo:"Geral",       ids:["documentos","agenda","historico", ...(perm.podeConfigurar ? ["config"] : [])] },
  ].map(g => ({ ...g, ids: g.ids.filter(podeVerAba) })).filter(g => g.ids.length > 0);
  const labelPorId = Object.fromEntries(navItems.map(n => [n.id, n.label]));

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody }}>Carregando...</div>
  );

  if (modoVisitante && !user) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:D.sidebar, color:"#fff", fontFamily:D.fontBody, textAlign:"center", padding:24 }}>
      <div><div style={{ display:"flex", justifyContent:"center", marginBottom:10, color:D.textMut }}><NavIcon id="lock" size={34} /></div>Link de visualização indisponível.<br/>Contate o síndico.</div>
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
      <div style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${selCob.includes(cob.moradorId)?D.primary:D.border}`, borderLeft:`3px solid ${cob.status==="pago"?D.success:cob.status==="atrasado"?D.danger:D.warning}`, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, gap:10 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:10, minWidth:0 }}>
            {!readOnly && cob.status !== "pago" && (
              <input type="checkbox" checked={selCob.includes(cob.moradorId)}
                onChange={e => setSelCob(prev => e.target.checked ? [...prev, cob.moradorId] : prev.filter(x => x !== cob.moradorId))}
                style={{ width:18, height:18, marginTop:2, cursor:"pointer", accentColor:D.primary, flexShrink:0 }} />
            )}
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700, color:D.text, fontSize:14 }}>{m.unidade} — {m.nome}</div>
              <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2, overflow:"hidden", textOverflow:"ellipsis" }}>{m.email}</div>
            </div>
          </div>
          {cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />}
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
          {cob.status !== "pago" && !readOnly && m.telefone && (
            <button onClick={() => abrirWhatsCobranca(m, cob)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, flex:1, minWidth:130, padding:"10px 14px", background:D.successBg, color:D.success, border:`1px solid ${D.success}33`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
              <NavIcon id="whats" size={15} /> Cobrar no WhatsApp
            </button>
          )}
          {cob.status !== "pago" ? (
            !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Registrar Pgto</button>
          ) : (
            <>
              {cob.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.bgCard, color:D.text, border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="histDoc" size={14} /> Comprovante</button>}
              {!readOnly && <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.bgCard, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logUndo" size={14} /> Estornar</button>}
            </>
          )}
        </div>
      </div>
    );
  };

  const DespCard = ({ d }) => (
    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${d.status==="pago"?D.success:D.warning}`, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", minWidth:0 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id={catIconId(d.tipo)} size={17} /></div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:600, color:D.text, fontSize:14, fontFamily:D.fontDisplay }}>{d.descricao || despCat(d.tipo).label}</div>
            <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>{mesLabel(d.mes)} · R$ {d.valor.toFixed(2).replace(".",",")}</div>
          </div>
        </div>
        <Badge status={d.status} />
      </div>
      {d.dataPagamento && <div style={{ fontSize:12, color:D.textMut, marginBottom:8 }}>Pago em {d.dataPagamento}</div>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {d.status !== "pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Marcar Paga</button>}
        {d.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.bgCard, color:D.text, border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="histDoc" size={14} /> Comprovante</button>}
        {!readOnly && <button onClick={() => { if(window.confirm("Remover esta despesa?")) removerDespesa(d.id); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.bgCard, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logTrash" size={14} /> Remover</button>}
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
          <nav style={{ flex:1, padding:"10px 10px", overflowY:"auto" }}>
            {gruposNav.map((grupo, gi) => (
              <div key={grupo.titulo} style={{ marginBottom: gi < gruposNav.length-1 ? 14 : 0 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:10, fontWeight:600, color:"rgba(226,232,245,0.35)", textTransform:"uppercase", letterSpacing:"1px", padding:"0 11px 6px" }}>{grupo.titulo}</div>
                {grupo.ids.map(id => {
                  const bloqueado = !podeUsar(id);
                  const ativo = aba===id;
                  return (
                    <button key={id} onClick={() => setAba(id)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"8px 11px", background: ativo ? D.sidebarAct : "transparent", border:"none", cursor:"pointer", color: ativo ? "#fff" : "rgba(226,232,245,0.82)", fontFamily:D.fontBody, fontSize:13, fontWeight: ativo ? 600 : 500, textAlign:"left", borderRadius:8, marginBottom:1, outline:"none", borderLeft: ativo ? `2px solid ${D.sidebarActBdr}` : "2px solid transparent" }}>
                      <span style={{ opacity: ativo?1:.75, display:"flex" }}><NavIcon id={id} /></span>
                      <span style={{ flex:1 }}>{labelPorId[id]}</span>
                      {bloqueado && <span style={{ display:"flex", opacity:.6 }}><NavIcon id="lock" size={12} /></span>}
                    </button>
                  );
                })}
              </div>
            ))}
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
                      <span style={{ display:"flex" }}><NavIcon id={n.id} size={20} /></span>
                      <span style={{ fontSize:10, fontWeight: aba===n.id?600:400 }}>{n.label}</span>
                      {bloqueado && <span style={{ position:"absolute", top:4, right:8, display:"flex", opacity:.7 }}><NavIcon id="lock" size={11} /></span>}
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
            {navPrincipal.map(n => {
              const ativo = aba===n.id;
              return (
              <button key={n.id} onClick={() => { setAba(n.id); setMaisAberto(false); }} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"9px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, color: ativo ? "#93C5FD" : "rgba(226,232,245,0.72)", borderTop: ativo ? `2px solid #93C5FD` : "2px solid transparent", fontFamily:D.fontBody }}>
                <span style={{ display:"flex", height:20, alignItems:"center" }}><NavIcon id={n.id} size={20} /></span>
                <span style={{ fontSize:9.5, fontWeight: ativo?600:400, lineHeight:1 }}>{n.label}</span>
              </button>
              );
            })}
            {(() => {
              const ativo = maisAberto || navSecundario.some(n=>n.id===aba);
              return (
              <button onClick={() => setMaisAberto(v=>!v)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"9px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, color: ativo ? "#93C5FD" : "rgba(226,232,245,0.72)", borderTop: ativo ? `2px solid #93C5FD` : "2px solid transparent", fontFamily:D.fontBody }}>
                <span style={{ display:"flex", height:20, alignItems:"center" }}><NavIcon id="mais" size={20} /></span>
                <span style={{ fontSize:9.5, fontWeight: ativo?600:400, lineHeight:1 }}>Mais</span>
              </button>
              );
            })()}
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
            <TopBar title="Visão Geral" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
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
                      {logs.slice(0,6).map((log,i) => {
                        const est = estiloLog(log, D);
                        return (
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                          <div style={{ width:34, height:34, borderRadius:9, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:est.cor }}><NavIcon id={est.icon} size={16} /></div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:500, color:D.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.descricao}</div>
                            <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:2 }}>{log.dataHora}</div>
                          </div>
                        </div>
                        );
                      })}
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
                                {cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />}
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
                                <td style={{ padding:"14px 24px" }}>{cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />}</td>
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

                // ── Faixa de indicadores (KPIs) ──
                const arrecadadoPct = cobMes.length ? Math.round((pagos/cobMes.length)*100) : 0;
                const inadimplentes = pendentes + atrasados;
                const kpiLight = (label, valor, sub, cor) => (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?"16px 16px":"18px 20px", boxShadow:D.shadow, border:`1px solid ${D.border}`, minWidth:0 }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>{label}</div>
                    <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?22:26, fontWeight:700, color: cor||D.text, letterSpacing:"-0.02em", marginTop:8, lineHeight:1 }}>{valor}</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:6 }}>{sub}</div>
                  </div>
                );
                const kpiSaldo = (
                  <div style={{ background:`linear-gradient(140deg, ${D.sidebarHov}, ${D.primaryDk})`, borderRadius:D.radius, padding: isMobile?"16px 18px":"18px 20px", boxShadow:D.shadowMd, color:"#fff", position:"relative", overflow:"hidden", minWidth:0 }}>
                    <div style={{ position:"absolute", top:-26, right:-26, width:96, height:96, borderRadius:"50%", background:"rgba(16,185,129,0.18)" }} />
                    <div style={{ position:"relative" }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".8px", opacity:.85 }}>Saldo em caixa</div>
                      <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?22:26, fontWeight:700, letterSpacing:"-0.02em", marginTop:8, lineHeight:1, color: saldoCaixaTotal<0?"#FCA5A5":"#fff" }}>{fmt(saldoCaixaTotal)}</div>
                      <div style={{ fontFamily:D.fontBody, fontSize:11.5, opacity:.8, marginTop:6 }}>Acumulado geral</div>
                    </div>
                  </div>
                );
                const kpiStrip = (
                  <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap: isMobile?12:16, marginBottom:16 }}>
                    {kpiSaldo}
                    {kpiLight("Arrecadação do mês", `${arrecadadoPct}%`, cobMes.length?`${pagos} de ${cobMes.length} pagas`:"sem cobranças", arrecadadoPct>=80?D.success:arrecadadoPct>0?D.warning:D.textMut)}
                    {kpiLight("Inadimplentes", `${inadimplentes}`, `${fmt(totalPendente)} a receber`, inadimplentes>0?D.danger:D.success)}
                    {kpiLight("Moradores", `${moradores.length}`, "unidades cadastradas", D.text)}
                  </div>
                );
                // Nota amigável quando o mês selecionado não tem cobranças
                const notaVazia = cobMes.length===0 ? (
                  <div style={{ background:D.secondary, border:`1px solid ${D.border}`, borderRadius:D.radius, padding:"12px 16px", marginBottom:16, fontFamily:D.fontBody, fontSize:13, color:D.textSec, display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ color:D.accent, display:"flex", flexShrink:0 }}><NavIcon id="iniciarCobranca" size={16} /></span>
                    <span>{marcoZero ? `Não há cobranças em ${mesLabel(mesSel)}. A cobrança deste condomínio começa em ${mesLabel(marcoZero.slice(0,7))}.` : `Não há cobranças lançadas em ${mesLabel(mesSel)}.`}</span>
                  </div>
                ) : null;

                // O card usa a mesma lista central (calculada uma vez, no nível do App)
                const avisosCard = avisos.length === 0 ? null : (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}`, overflow:"hidden" }}>
                    <div style={{ padding: isMobile?"14px 16px 10px":"16px 22px 12px", display:"flex", alignItems:"center", gap:9 }}>
                      <span style={{ color:D.warning, display:"flex" }}><NavIcon id="alerta" size={17} /></span>
                      <span style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Precisa da sua atenção</span>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>({avisos.length})</span>
                    </div>
                    {avisos.map((av, i) => (
                      <button key={i} onClick={() => setAba(av.aba)}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding: isMobile?"12px 16px":"12px 22px", background:"none", border:"none", borderTop:`1px solid ${D.border}`, cursor:"pointer", textAlign:"left", fontFamily:D.fontBody }}>
                        <span style={{ width:30, height:30, borderRadius:8, background:D.muted, color:av.cor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={av.icon} size={15} /></span>
                        <span style={{ flex:1, fontSize:13, color:D.text, minWidth:0 }}>{av.texto}</span>
                        <span style={{ color:D.textMut, display:"flex", flexShrink:0, transform:"rotate(-90deg)" }}><NavIcon id="setaBaixo" size={15} /></span>
                      </button>
                    ))}
                  </div>
                );

                if (isMobile) {
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {kpiStrip}{notaVazia}{avisosCard}{chartCard}{inadimplCard}{cobrancasCard}{ocorrenciasCard}{atividadeCard}
                    </div>
                  );
                }
                return (
                  <>
                    {kpiStrip}
                    {notaVazia}
                    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,2fr) minmax(0,1fr)", gap:16, alignItems:"start" }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:16, minWidth:0 }}>
                        {chartCard}
                        {cobrancasCard}
                        {ocorrenciasCard}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:16, minWidth:0 }}>
                        {avisosCard}
                        {inadimplCard}
                        {atividadeCard}
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>
          </div>
        )}


        {/* ── Cobranças ── */}
        {aba === "cobrancas" && (
          <div>
            <TopBar title="Cobranças" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:0, fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Cobranças</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Registre pagamentos e comprovantes</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", width: isMobile?"100%":"auto" }}>
                <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard, flex: isMobile?1:"none" }}>
                  {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                <button onClick={exportarCobrancasCSV} style={{ padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, flex: isMobile?1:"none", whiteSpace:"nowrap" }}>⬇ Exportar CSV</button>
                <button onClick={exportarPDF} title="Resumo do mês em PDF" style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                  <NavIcon id="download" size={15} /> Relatório
                </button>
                <button onClick={() => exportarPrestacaoContas()} title="Relatório completo do mês em PDF, pronto para apresentar aos moradores" style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                  <NavIcon id="histDoc" size={15} /> Prestação de contas
                </button>
                {!readOnly && (
                  <button onClick={publicarPrestacaoContas} disabled={publicandoPrestacao} title="Disponibiliza a prestação de contas no portal do morador" style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 14px", background:D.bgCard, color:D.success, border:`1.5px solid ${D.success}44`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: publicandoPrestacao?"default":"pointer", opacity: publicandoPrestacao?.6:1, fontFamily:D.fontBody }}>
                    <NavIcon id="link" size={15} /> {publicandoPrestacao ? "Publicando..." : "Publicar no portal"}
                  </button>
                )}
                {!readOnly && !isMobile && <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"9px 16px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1, fontFamily:D.fontBody }}>{enviandoEmails?"Enviando...":"Cobrar pendentes"}</button>}
              </div>
            </div>

            {/* ── Resumo financeiro do mês ── */}
            {(() => {
              let arrecadado = 0, aReceber = 0;
              cobMes.forEach(c => {
                const t = encargosCobranca(c).valorTotal;
                if (c.status === "pago") arrecadado += t; else aReceber += t;
              });
              const total = arrecadado + aReceber;
              const pct = total > 0 ? Math.round((arrecadado / total) * 100) : 0;
              const pagosN = cobMes.filter(c=>c.status==="pago").length;
              const brl = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
              if (cobMes.length === 0) return null;
              return (
                <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr 1.4fr", gap:12, marginBottom:16 }}>
                  <div style={{ background:D.successBg, borderRadius:D.radius, padding:"16px 18px", border:`1px solid ${D.border}` }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.success, textTransform:"uppercase", letterSpacing:".8px", marginBottom:6 }}>Arrecadado</div>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.text, letterSpacing:"-0.02em" }}>R$ {brl(arrecadado)}</div>
                  </div>
                  <div style={{ background:D.warningBg, borderRadius:D.radius, padding:"16px 18px", border:`1px solid ${D.border}` }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.warning, textTransform:"uppercase", letterSpacing:".8px", marginBottom:6 }}>A receber</div>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.text, letterSpacing:"-0.02em" }}>R$ {brl(aReceber)}</div>
                  </div>
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", border:`1px solid ${D.border}`, boxShadow:D.shadow }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                      <span style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Arrecadação do mês</span>
                      <span style={{ fontFamily:D.fontDisplay, fontSize:18, fontWeight:700, color:D.success }}>{pct}%</span>
                    </div>
                    <div style={{ height:10, background:D.muted, borderRadius:20, overflow:"hidden", marginBottom:6 }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:D.success, borderRadius:20, transition:"width .4s ease" }} />
                    </div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{pagosN} de {cobMes.length} pagaram{aReceber>0?` · faltam R$ ${brl(aReceber)}`:""}</div>
                  </div>
                </div>
              );
            })()}

            {/* ── Cobranças extras / rateios ── */}
            {podeUsar("cobrancaExtra") ? (
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, padding: isMobile?16:20, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexDirection: isMobile?"column":"row", alignItems: isMobile?"stretch":"center", gap:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>
                    <span style={{ color:D.accent, display:"flex" }}><NavIcon id="cobrancas" size={17} /></span>
                    Cobranças extras — {mesLabel(mesSel)}
                  </div>
                  {!readOnly && (
                    <button onClick={() => { setNovaCobExtra({ descricao:"", modo:"unidade", valor:"", mes: mesSel }); setModal({ type:"novaCobExtra" }); }} style={{ padding:"9px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"auto" }}>+ Nova cobrança extra</button>
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
                          {!readOnly && <button onClick={() => { if(window.confirm(`Remover a cobrança extra "${extra.descricao}"? Isso apaga os registros de pagamento dela.`)) removerCobrancaExtra(extra); }} title="Remover" style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>}
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
                <span style={{ display:"flex", color:D.textMut }}><NavIcon id="lock" size={19} /></span>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>Cobranças extras e rateios — plano Padrão</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Cobre taxas de obra, rateios de contas e fundos aprovados em assembleia.</div>
                </div>
                <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
              </div>
            )}

            {(() => {
              const cont = {
                todos: cobMes.length,
                pago: cobMes.filter(c=>c.status==="pago").length,
                pendente: cobMes.filter(c=>c.status==="pendente").length,
                atrasado: cobMes.filter(c=>c.status==="atrasado").length,
              };
              const chips = [
                { id:"todos",    label:"Todos",     cor:D.primary },
                { id:"pago",     label:"Pagos",     cor:D.success },
                { id:"pendente", label:"Pendentes", cor:D.warning },
                { id:"atrasado", label:"Atrasados", cor:D.danger },
              ];
              const lista = cobMes.filter(c => filtroCobranca==="todos" || c.status===filtroCobranca);

              const AcaoBtn = ({ icon, cor, titulo, onClick }) => (
                <button onClick={onClick} title={titulo} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color: cor||D.textSec, border:`1px solid ${D.border}`, borderRadius:8, cursor:"pointer" }}>
                  <NavIcon id={icon} size={15} />
                </button>
              );

              return (
              <>
                {cobMes.length > 0 && (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                    {chips.map(c => {
                      const ativo = filtroCobranca===c.id;
                      return (
                        <button key={c.id} onClick={()=>setFiltroCobranca(c.id)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:20, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                          {c.id!=="todos" && <span style={{ width:7, height:7, borderRadius:"50%", background: ativo?"#fff":c.cor }} />}
                          {c.label} <span style={{ opacity:.6 }}>{cont[c.id]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Acordos de dívida ativos ── */}
                {(() => {
                  const ativos = acordos.filter(a => a.status === "ativo");
                  const inadimplentes = cobMes.filter(c => c.status !== "pago" && !c.acordoId);
                  if (!ativos.length && (readOnly || !inadimplentes.length)) return null;
                  return (
                    <div style={{ marginBottom:20 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ width:8, height:8, borderRadius:"50%", background:D.accent }} />
                          <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>
                            Acordos de dívida{ativos.length ? ` (${ativos.length})` : ""}
                          </span>
                        </div>
                        {!readOnly && inadimplentes.length > 0 && (
                          <button onClick={() => { setFormAcordo({ moradorId:"", nParcelas:3, primeiraData:"", entrada:"" }); setModal({ type:"novoAcordo" }); }}
                            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"auto" }}>
                            + Novo acordo
                          </button>
                        )}
                      </div>

                      {ativos.length === 0 ? (
                        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.accent}` }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.6 }}>
                            Negocie a dívida em parcelas sem perder o controle: as cobranças originais ficam registradas e param de acumular novos encargos enquanto o acordo estiver em dia.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(auto-fill,minmax(340px,1fr))", gap:12 }}>
                          {ativos.map(ac => {
                            const pagas = ac.parcelas.filter(p => p.status === "pago").length;
                            const total = ac.parcelas.length;
                            const proxima = ac.parcelas.find(p => p.status !== "pago");
                            const atrasada = proxima && diasAteData(proxima.vencimento) < 0;
                            return (
                              <div key={ac.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${atrasada?D.danger:D.accent}` }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontFamily:D.fontDisplay, fontSize:14.5, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{ac.unidade} — {ac.moradorNome}</div>
                                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>
                                      R$ {ac.totalDivida.toFixed(2).replace(".",",")} em {total}x · desde {ac.criadoEm}
                                    </div>
                                  </div>
                                  {!readOnly && (
                                    <button onClick={() => cancelarAcordo(ac)} title="Cancelar acordo" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer", flexShrink:0 }}><NavIcon id="logUndo" size={14} /></button>
                                  )}
                                </div>

                                {/* Progresso */}
                                <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
                                  <div style={{ flex:1, height:6, background:D.muted, borderRadius:20, overflow:"hidden" }}>
                                    <div style={{ width:`${(pagas/total)*100}%`, height:"100%", background:D.success, borderRadius:20 }} />
                                  </div>
                                  <span style={{ fontFamily:D.fontBody, fontSize:11.5, fontWeight:600, color:D.textSec, flexShrink:0 }}>{pagas}/{total} pagas</span>
                                </div>

                                {/* Parcelas */}
                                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:180, overflowY:"auto" }}>
                                  {ac.parcelas.map(pc => {
                                    const dias = diasAteData(pc.vencimento);
                                    const atr = pc.status !== "pago" && dias !== null && dias < 0;
                                    const cor = pc.status === "pago" ? D.success : atr ? D.danger : D.textSec;
                                    return (
                                      <div key={pc.numero} style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 10px", background: pc.status==="pago"?D.successBg:atr?D.dangerBg:D.muted, borderRadius:D.radiusSm }}>
                                        <span style={{ width:22, height:22, borderRadius:6, background:"#fff", color:cor, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontBody, fontSize:11, fontWeight:700, flexShrink:0 }}>{pc.numero}</span>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontFamily:D.fontBody, fontSize:12.5, fontWeight:600, color:D.text }}>R$ {pc.valor.toFixed(2).replace(".",",")}</div>
                                          <div style={{ fontFamily:D.fontBody, fontSize:11, color:cor }}>
                                            {pc.status === "pago" ? `Pago em ${pc.pagoEm}` : `Vence ${formatarDataBR(pc.vencimento)}${atr?` · ${Math.abs(dias)}d atraso`:""}`}
                                          </div>
                                        </div>
                                        {pc.status !== "pago" && !readOnly && (
                                          <button onClick={() => pagarParcela(ac, pc.numero)} style={{ padding:"5px 11px", background:D.primary, color:"#fff", border:"none", borderRadius:20, fontSize:11.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, flexShrink:0 }}>Baixar</button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {selCob.length > 0 && !readOnly && (
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", background:D.primary, color:"#fff", borderRadius:D.radius, padding:"12px 16px", marginBottom:14 }}>
                    <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, flex:1, minWidth:140 }}>
                      {selCob.length} {selCob.length===1?"cobrança selecionada":"cobranças selecionadas"}
                    </span>
                    <button onClick={marcarSelecionadosPagos} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"#fff", color:D.primary, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                      <NavIcon id="logCheck" size={15} /> Marcar como pagas
                    </button>
                    <button onClick={()=>setSelCob([])} style={{ padding:"8px 14px", background:"transparent", color:"#fff", border:"1px solid rgba(255,255,255,.4)", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                      Limpar
                    </button>
                  </div>
                )}

                {isMobile ? (
                  <div>{lista.map((cob,i) => <CobCard key={i} cob={cob} />)}</div>
                ) : (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                    {cobMes.length === 0 ? (
                      <div style={{ padding:32, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhuma cobrança neste mês.</div>
                    ) : lista.length === 0 ? (
                      <div style={{ padding:32, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhuma cobrança nesta categoria.</div>
                    ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:D.muted }}>
                          {!readOnly && (() => {
                            const selecionaveis = lista.filter(c => c.status !== "pago").map(c => c.moradorId);
                            const todosMarcados = selecionaveis.length > 0 && selecionaveis.every(id => selCob.includes(id));
                            return (
                              <th style={{ padding:"12px 8px 12px 16px", width:38, borderBottom:`1px solid ${D.border}` }}>
                                <input type="checkbox" checked={todosMarcados} disabled={selecionaveis.length===0}
                                  onChange={e => setSelCob(e.target.checked ? selecionaveis : [])}
                                  title={selecionaveis.length===0 ? "Nada a selecionar" : "Selecionar todos os não pagos"}
                                  style={{ width:16, height:16, cursor: selecionaveis.length===0?"default":"pointer", accentColor:D.primary }} />
                              </th>
                            );
                          })()}
                          {["Unidade","Morador","Valor","Status","Data Pgto","Ações"].map(h => (
                            <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${D.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((cob,i) => {
                          const m = moradores.find(x => x.id === cob.moradorId);
                          if (!m) return null;
                          const enc = encargosCobranca(cob);
                          return (
                            <tr key={i} style={{ borderBottom:`1px solid ${D.border}`, background: selCob.includes(cob.moradorId) ? D.secondary : "transparent" }}>
                              {!readOnly && (
                                <td style={{ padding:"13px 8px 13px 16px", width:38 }}>
                                  <input type="checkbox" checked={selCob.includes(cob.moradorId)} disabled={cob.status==="pago"}
                                    onChange={e => setSelCob(prev => e.target.checked ? [...prev, cob.moradorId] : prev.filter(x => x !== cob.moradorId))}
                                    title={cob.status==="pago" ? "Já está paga" : "Selecionar"}
                                    style={{ width:16, height:16, cursor: cob.status==="pago"?"default":"pointer", accentColor:D.primary, opacity: cob.status==="pago"?.35:1 }} />
                                </td>
                              )}
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
                              <td style={{ padding:"13px 16px" }}>{cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />}</td>
                              <td style={{ padding:"13px 16px", fontSize:12, color:D.textSec, fontFamily:D.fontBody }}>{cob.dataPagamento || "—"}</td>
                              <td style={{ padding:"13px 16px" }}>
                                <div style={{ display:"flex", gap:6 }}>
                                  {cob.status !== "pago" && !readOnly && m.telefone && (
                                    <AcaoBtn icon="whats" cor={D.success} titulo={`Cobrar ${m.nome} por WhatsApp`} onClick={() => abrirWhatsCobranca(m, cob)} />
                                  )}
                                  {cob.status !== "pago" ? (
                                    !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Registrar</button>
                                  ) : (
                                    <>
                                      {cob.comprovante && <AcaoBtn icon="histDoc" titulo="Ver comprovante" onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} />}
                                      {!readOnly && <AcaoBtn icon="logUndo" cor={D.danger} titulo="Estornar pagamento" onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} />}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    )}
                  </div>
                )}
              </>
              );
            })()}
          </div>
          </div>
        )}

        {/* ── Moradores ── */}
        {aba === "moradores" && (
          <div>
            <TopBar title="Moradores" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ações */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{moradores.length} unidade{moradores.length!==1?"s":""} cadastrada{moradores.length!==1?"s":""}</div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", width: isMobile?"100%":"auto" }}>
                  <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"9px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard, fontFamily:D.fontBody, flex: isMobile?1:"none" }}>
                    {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                  </select>
                  <button onClick={exportarMoradoresCSV} style={{ padding:"9px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, flex: isMobile?1:"none", whiteSpace:"nowrap" }}>
                    ⬇ Exportar CSV
                  </button>
                  {!readOnly && (
                    <button onClick={() => setModal({ type:"importarMoradores" })} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"10px 16px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"auto" }}>
                      <NavIcon id="entregas" size={15} /> Importar planilha
                    </button>
                  )}
                  {!readOnly && (
                    <button onClick={() => setModal({ type:"novoMorador" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, width: isMobile?"100%":"auto" }}>
                      + Adicionar morador
                    </button>
                  )}
                </div>
              </div>

              {/* Filtros por status + tabela */}
              {(() => {
                const statusDe = (m) => cobrancas.find(c=>c.moradorId===m.id&&c.mes===mesSel)?.status;
                const ordenados = [...moradores].sort((a,b)=>a.unidade.localeCompare(b.unidade));
                const cont = {
                  todos: moradores.length,
                  pago: ordenados.filter(m=>statusDe(m)==="pago").length,
                  pendente: ordenados.filter(m=>statusDe(m)==="pendente").length,
                  atrasado: ordenados.filter(m=>statusDe(m)==="atrasado").length,
                };
                const chips = [
                  { id:"todos",    label:"Todos",     cor:D.primary },
                  { id:"pago",     label:"Em dia",    cor:D.success },
                  { id:"pendente", label:"Pendentes", cor:D.warning },
                  { id:"atrasado", label:"Atrasados", cor:D.danger },
                ];
                const lista = ordenados.filter(m => filtroMorador==="todos" || statusDe(m)===filtroMorador);

                const inicial = (m) => (m.nome || m.unidade || "?").trim().charAt(0).toUpperCase();
                const linkMorador = (m) => `${window.location.origin}${window.location.pathname}?cond=${condominioId}&morador=${m.id}${m.tokenPortal ? `&t=${m.tokenPortal}` : ""}`;
                const abrirEditar = (m) => { setEditMorador({id:m.id,nome:m.nome,unidade:m.unidade,proprietario:m.proprietario||"",email:m.email,telefone:m.telefone||"",tipo:m.tipo||"Proprietário",veiculos:m.veiculos||"",pets:m.pets||"",taxaCustom:m.taxaCustom!=null?String(m.taxaCustom):""}); setModal({type:"editarMorador"}); };

                // Botão de ação com ícone de traço (desktop)
                const AcaoBtn = ({ icon, cor, titulo, onClick }) => (
                  <button onClick={onClick} title={titulo} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color: cor||D.textSec, border:`1px solid ${D.border}`, borderRadius:8, cursor:"pointer" }}>
                    <NavIcon id={icon} size={15} />
                  </button>
                );

                return (
                <>
                  {/* Chips de status */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                    {chips.map(c => {
                      // Mostra sempre os 4 filtros, mesmo zerados
                      const ativo = filtroMorador===c.id;
                      return (
                        <button key={c.id} onClick={()=>setFiltroMorador(c.id)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:20, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                          {c.id!=="todos" && <span style={{ width:7, height:7, borderRadius:"50%", background: ativo?"#fff":c.cor }} />}
                          {c.label} <span style={{ opacity:.6 }}>{cont[c.id]}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                    {lista.length===0 ? (
                      <div style={{ padding:32, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhum morador nesta categoria.</div>
                    ) : isMobile ? (
                      /* Mobile: cards */
                      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10 }}>
                        {lista.map(m => {
                          const cob = cobrancas.find(c=>c.moradorId===m.id&&c.mes===mesSel);
                          return (
                            <div key={m.id} style={{ background:D.muted, borderRadius:D.radiusSm, padding:14, borderLeft:`3px solid ${cob?.status==="pago"?D.success:cob?.status==="atrasado"?D.danger:cob?.status==="pendente"?D.warning:D.border}` }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                                <div style={{ display:"flex", gap:10, alignItems:"center", minWidth:0 }}>
                                  <div style={{ width:36, height:36, borderRadius:"50%", background:D.secondary, color:D.primary, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:15, fontWeight:700, flexShrink:0 }}>{inicial(m)}</div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{m.nome}</div>
                                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.unidade}{m.proprietario?` · Prop: ${m.proprietario}`:""}</div>
                                  </div>
                                </div>
                                {cob && (cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />)}
                              </div>
                              {m.email && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.email}</div>}
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:12 }}>
                                <button onClick={() => { setFichaSecao("cobrancas"); setModal({ type:"historico", data:m }); }} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 10px", background:D.bgCard, color:D.text, border:`1px solid ${D.border}`, borderRadius:8, fontSize:12.5, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="histDoc" size={14} /> Histórico</button>
                                <button onClick={() => { navigator.clipboard.writeText(linkMorador(m)); showToast(`Link do ${m.unidade} copiado!`); }} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 10px", background:D.bgCard, color:D.text, border:`1px solid ${D.border}`, borderRadius:8, fontSize:12.5, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="link" size={14} /> Link</button>
                                {!readOnly && <>
                                  <button onClick={() => abrirEditar(m)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 10px", background:D.bgCard, color:D.text, border:`1px solid ${D.border}`, borderRadius:8, fontSize:12.5, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logPencil" size={14} /> Editar</button>
                                  <button onClick={() => { removerMorador(m.id); }} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 10px", background:D.bgCard, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, fontSize:12.5, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logTrash" size={14} /> Remover</button>
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
                            {["Morador","Contato","Status","Ações"].map(h => (
                              <th key={h} style={{ padding:"12px 20px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map(m => {
                            const cob = cobrancas.find(c=>c.moradorId===m.id&&c.mes===mesSel);
                            return (
                              <tr key={m.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                                <td style={{ padding:"12px 20px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                                    <div style={{ width:38, height:38, borderRadius:"50%", background:D.secondary, color:D.primary, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:15, fontWeight:700, flexShrink:0 }}>{inicial(m)}</div>
                                    <div style={{ minWidth:0 }}>
                                      <div style={{ fontFamily:D.fontDisplay, fontSize:13.5, fontWeight:600, color:D.text }}>{m.nome}</div>
                                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.unidade}{m.proprietario?` · Prop: ${m.proprietario}`:""}</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding:"12px 20px" }}>
                                  <div style={{ fontFamily:D.fontBody, fontSize:12.5, color:D.textSec }}>{m.email||"—"}</div>
                                  {m.telefone && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>{m.telefone}</div>}
                                </td>
                                <td style={{ padding:"12px 20px" }}>{cob ? (cob.acordoId ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:D.secondary, color:D.accent, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody, whiteSpace:"nowrap" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.accent }} />Em acordo</span> : <Badge status={cob.status} />) : <span style={{ color:D.textMut, fontSize:12 }}>—</span>}</td>
                                <td style={{ padding:"12px 20px" }}>
                                  <div style={{ display:"flex", gap:6 }}>
                                    <AcaoBtn icon="histDoc" titulo="Ver histórico" onClick={() => { setFichaSecao("cobrancas"); setModal({ type:"historico", data:m }); }} />
                                    {m.telefone && <AcaoBtn icon="whats" cor={D.success} titulo={`Falar com ${m.nome} no WhatsApp`} onClick={() => { const u = linkWhatsApp(m.telefone, `Olá, ${(m.nome||"").split(" ")[0]}! Aqui é do ${nomeCond()}.`); if (u) window.open(u, "_blank", "noopener,noreferrer"); }} />}
                                    {!readOnly && <AcaoBtn icon="unlock" cor={D.warning} titulo="Gerar link novo (invalida o antigo)" onClick={() => revogarLinkPortal(m)} />}
                                    <AcaoBtn icon="link" titulo="Copiar link do portal" onClick={() => { navigator.clipboard.writeText(linkMorador(m)); showToast(`Link do ${m.unidade} copiado!`); }} />
                                    {!readOnly && <>
                                      <AcaoBtn icon="logPencil" titulo="Editar morador" onClick={() => abrirEditar(m)} />
                                      <AcaoBtn icon="logTrash" cor={D.danger} titulo="Remover morador" onClick={() => { removerMorador(m.id); }} />
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
                </>
                );
              })()}
            </div>
          </div>
        )}

        {aba === "despesas" && (
          <div>
            <TopBar title="Água e Luz" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:0, fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Água e Luz</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Contas e despesas fixas</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <button onClick={exportarDespesasCSV} style={{ padding:"10px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody }}>⬇ Exportar CSV</button>
                {!readOnly && <button onClick={() => setModal({ type:"novaDespesa" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Nova</button>}
              </div>
            </div>

            {(() => {
              const totalPago = despesas.filter(d=>d.status==="pago").reduce((s,d)=>s+d.valor,0);
              const totalPend = despesas.filter(d=>d.status!=="pago").reduce((s,d)=>s+d.valor,0);
              const brl = (v) => `R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
              const cards = [
                { label:"Total pago",     valor:brl(totalPago), icon:"logCheck", cor:D.success },
                { label:"Total pendente", valor:brl(totalPend), icon:"clock",    cor:D.warning },
                { label:"Cadastradas",    valor:String(despesas.length), icon:"histDoc", cor:D.text },
              ];

              // "Onde vai o dinheiro" — total por categoria (top 5)
              const porCat = {};
              despesas.forEach(d => { porCat[d.tipo] = (porCat[d.tipo]||0) + d.valor; });
              const ranking = Object.entries(porCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
              const maxCat = ranking.length ? ranking[0][1] : 0;
              const totalGeral = totalPago + totalPend;

              // Filtro
              const cont = { todas: despesas.length, pago: despesas.filter(d=>d.status==="pago").length, pendente: despesas.filter(d=>d.status!=="pago").length };
              const chips = [
                { id:"todas",    label:"Todas",     cor:D.primary },
                { id:"pago",     label:"Pagas",     cor:D.success },
                { id:"pendente", label:"Pendentes", cor:D.warning },
              ];
              const lista = [...despesas].sort((a,b)=>b.mes.localeCompare(a.mes))
                .filter(d => filtroDespesa==="todas" || (filtroDespesa==="pago" ? d.status==="pago" : d.status!=="pago"));

              const AcaoBtn = ({ icon, cor, titulo, onClick }) => (
                <button onClick={onClick} title={titulo} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color: cor||D.textSec, border:`1px solid ${D.border}`, borderRadius:8, cursor:"pointer" }}>
                  <NavIcon id={icon} size={15} />
                </button>
              );

              return (
              <>
                {/* Cards de resumo */}
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap:12, marginBottom:16 }}>
                  {cards.map((c,i) => (
                    <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:c.cor, flexShrink:0 }}><NavIcon id={c.icon} size={19} /></div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?17:20, fontWeight:700, color:c.cor, letterSpacing:"-0.02em", lineHeight:1 }}>{c.valor}</div>
                        <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>{c.label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Onde vai o dinheiro (top categorias) */}
                {ranking.length > 0 && (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:16 }}>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, letterSpacing:"-0.02em", marginBottom:14 }}>Onde vai o dinheiro</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {ranking.map(([tipo, valor]) => (
                        <div key={tipo}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                            <span style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontBody, fontSize:13, color:D.text }}>
                              <span style={{ color:D.accent, display:"flex" }}><NavIcon id={catIconId(tipo)} size={15} /></span>
                              {despCat(tipo).label}
                            </span>
                            <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>{brl(valor)} <span style={{ color:D.textMut, fontWeight:400, fontSize:12 }}>· {totalGeral?Math.round(valor/totalGeral*100):0}%</span></span>
                          </div>
                          <div style={{ height:7, background:D.muted, borderRadius:20, overflow:"hidden" }}>
                            <div style={{ width:`${maxCat?Math.round(valor/maxCat*100):0}%`, height:"100%", background:D.accent, borderRadius:20 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtros */}
                {despesas.length > 0 && (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                    {chips.map(c => {
                      const ativo = filtroDespesa===c.id;
                      return (
                        <button key={c.id} onClick={()=>setFiltroDespesa(c.id)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:20, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                          {c.id!=="todas" && <span style={{ width:7, height:7, borderRadius:"50%", background: ativo?"#fff":c.cor }} />}
                          {c.label} <span style={{ opacity:.6 }}>{cont[c.id]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isMobile ? (
                  <div>
                    {lista.map(d => <DespCard key={d.id} d={d} />)}
                    {despesas.length === 0 && <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:24 }}>Nenhuma despesa cadastrada.</div>}
                    {despesas.length > 0 && lista.length === 0 && <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:24 }}>Nenhuma despesa nesta categoria.</div>}
                  </div>
                ) : (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:D.muted }}>
                          {["Tipo","Descrição","Mês","Valor","Status","Data Pgto","Ações"].map(h => (
                            <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${D.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map(d => (
                          <tr key={d.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                            <td style={{ padding:"13px 16px" }}><span style={{ color:D.accent, display:"flex" }} title={despCat(d.tipo).label}><NavIcon id={catIconId(d.tipo)} size={18} /></span></td>
                            <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>{d.descricao||despCat(d.tipo).label}</td>
                            <td style={{ padding:"13px 16px", fontSize:13, color:D.textSec }}>{mesLabel(d.mes)}</td>
                            <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:D.text }}>R$ {d.valor.toFixed(2).replace(".",",")}</td>
                            <td style={{ padding:"13px 16px" }}><Badge status={d.status} /></td>
                            <td style={{ padding:"13px 16px", fontSize:12, color:D.textSec, fontFamily:D.fontBody }}>{d.dataPagamento||"—"}</td>
                            <td style={{ padding:"13px 16px" }}>
                              <div style={{ display:"flex", gap:6 }}>
                                {d.status!=="pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Marcar paga</button>}
                                {d.comprovante && <AcaoBtn icon="histDoc" titulo="Ver comprovante" onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} />}
                                {!readOnly && <AcaoBtn icon="logTrash" cor={D.danger} titulo="Remover despesa" onClick={() => { if(window.confirm("Remover esta despesa?")) removerDespesa(d.id); }} />}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {despesas.length===0 && <tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:D.textMut, fontSize:13 }}>Nenhuma despesa cadastrada.</td></tr>}
                        {despesas.length>0 && lista.length===0 && <tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:D.textMut, fontSize:13 }}>Nenhuma despesa nesta categoria.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
              );
            })()}
          </div>
          </div>
        )}

        {/* ── Serviços ── */}
        {/* Trava de plano: abas bloqueadas para planos inferiores */}
        {["servicos","reservas","acessos","historico","comunicados","documentos","fundoReserva","entregas","agenda","fluxoCaixa","ocorrencias","enquetes"].includes(aba) && !podeUsar(aba) && (
          <div>
            <TopBar title={{servicos:"Serviços e Manutenção",reservas:"Reservas",acessos:"Controle de Acessos",historico:"Histórico",comunicados:"Comunicados",documentos:"Documentos",fundoReserva:"Fundo de Reserva",entregas:"Controle de Entregas",agenda:"Agenda",fluxoCaixa:"Fluxo de Caixa",ocorrencias:"Ocorrências",enquetes:"Consultas aos moradores"}[aba]} user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <UpgradeCard recurso={aba} planoNecessario={RECURSO_PLANO[aba]} isMobile={isMobile} />
          </div>
        )}

        {aba === "servicos" && podeUsar("servicos") && (
          <div>
            <TopBar title="Serviços e Manutenção" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:0, fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Serviços e Manutenção</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Consertos e melhorias do condomínio</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novoServico" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Novo</button>}
            </div>

            {/* ── Manutenção preventiva ── */}
            {(() => {
              const comPrazo = manutencoes.map(m => ({ ...m, dias: diasAteData(m.proximaData) }));
              const atrasadas = comPrazo.filter(m => m.dias !== null && m.dias < 0);
              const proximas  = comPrazo.filter(m => m.dias !== null && m.dias >= 0 && m.dias <= 30);
              return (
                <div style={{ marginBottom:28 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background:D.accent }} />
                      <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Manutenção preventiva</span>
                    </div>
                    {!readOnly && (
                      <button onClick={() => { setNovaManutencao({ titulo:"", periodicidade:"semestral", proximaData:"", responsavel:"", obs:"" }); setModal({ type:"novaManutencao" }); }}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px 14px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"auto" }}>
                        + Nova rotina
                      </button>
                    )}
                  </div>

                  {manutencoes.length === 0 ? (
                    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"20px 22px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.accent}` }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.6 }}>
                        Cadastre as rotinas obrigatórias — limpeza da caixa d'água, dedetização, recarga de extintor, inspeção do elevador — e o sistema avisa antes de cada prazo vencer.
                      </div>
                    </div>
                  ) : (
                    <>
                      {(atrasadas.length > 0 || proximas.length > 0) && (
                        <div style={{ display:"flex", alignItems:"center", gap:10, background: atrasadas.length?D.dangerBg:D.warningBg, border:`1px solid ${atrasadas.length?"#FECACA":"#FDE68A"}`, borderRadius:D.radius, padding:"10px 16px", marginBottom:12 }}>
                          <span style={{ color: atrasadas.length?D.danger:D.warning, display:"flex", flexShrink:0 }}><NavIcon id="alerta" size={16} /></span>
                          <span style={{ fontFamily:D.fontBody, fontSize:12.5, fontWeight:600, color: atrasadas.length?"#991B1B":"#92400E" }}>
                            {atrasadas.length > 0 && `${atrasadas.length} manutenção(ões) atrasada(s)`}
                            {atrasadas.length > 0 && proximas.length > 0 && " · "}
                            {proximas.length > 0 && `${proximas.length} vencendo em até 30 dias`}
                          </span>
                        </div>
                      )}
                      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
                        {comPrazo.map(m => {
                          const atrasada = m.dias !== null && m.dias < 0;
                          const proxima  = m.dias !== null && m.dias >= 0 && m.dias <= 30;
                          const cor = atrasada ? D.danger : proxima ? D.warning : D.success;
                          const rot = m.dias === null ? "Sem data"
                            : atrasada ? `Atrasada há ${Math.abs(m.dias)} dia${Math.abs(m.dias)!==1?"s":""}`
                            : m.dias === 0 ? "É hoje"
                            : `Em ${m.dias} dia${m.dias!==1?"s":""}`;
                          return (
                            <div key={m.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cor}` }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontFamily:D.fontDisplay, fontSize:14.5, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{m.titulo}</div>
                                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>
                                    {infoPeriodicidade(m.periodicidade).label}{m.responsavel ? ` · ${m.responsavel}` : ""}
                                  </div>
                                </div>
                                {!readOnly && (
                                  <button onClick={() => removerManutencao(m.id)} title="Remover rotina" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer", flexShrink:0 }}><NavIcon id="logTrash" size={14} /></button>
                                )}
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom: readOnly?0:12 }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:6, background: atrasada?D.dangerBg:proxima?D.warningBg:D.successBg, color:cor, fontSize:11.5, fontWeight:600, padding:"4px 11px 4px 8px", borderRadius:20, fontFamily:D.fontBody }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background:cor }} />{rot}
                                </span>
                                <span style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textMut }}>{m.proximaData ? formatarDataBR(m.proximaData) : ""}</span>
                              </div>
                              {m.ultimaExecucao && (
                                <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textMut, marginBottom: readOnly?0:10 }}>Última: {formatarDataBR(m.ultimaExecucao)}</div>
                              )}
                              {!readOnly && (
                                <button onClick={() => concluirManutencao(m)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, width:"100%", padding:"9px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                                  <NavIcon id="logCheck" size={14} /> Marcar como feita
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {(() => {
              const pend = servicos.filter(s=>s.status==="pendente");
              const conc = servicos.filter(s=>s.status==="concluido");
              const custo = (s) => (s.valorMaterial||0) + (s.valorMaoDeObra||0);
              const totalGasto = conc.reduce((soma,s)=> soma + custo(s), 0);
              const brl = (v) => `R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

              const cardPendente = (s) => (
                <div key={s.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}` }}>
                  <div style={{ fontWeight:600, color:D.text, fontSize:14, marginBottom:4, fontFamily:D.fontDisplay }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:D.textSec, marginBottom:8, fontFamily:D.fontBody }}>{s.descricao}</div>}
                  <div style={{ fontSize:11.5, color:D.textMut, fontFamily:D.fontBody }}>Aberto em {s.dataAbertura}</div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => { setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal({ type:"concluirServico", data:s }); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Concluir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} title="Remover" style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                    </div>
                  )}
                </div>
              );

              const cardConcluido = (s) => (
                <div key={s.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.success}` }}>
                  <div style={{ fontWeight:600, color:D.text, fontSize:14, marginBottom:4, fontFamily:D.fontDisplay }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:D.textSec, marginBottom:8, fontFamily:D.fontBody }}>{s.descricao}</div>}
                  <div style={{ fontSize:12.5, color:D.textSec, fontFamily:D.fontBody, background:D.muted, borderRadius:D.radiusSm, padding:"10px 12px", display:"flex", flexDirection:"column", gap:5 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}><span style={{ color:D.accent, display:"flex" }}><NavIcon id="reservas" size={14} /></span> {s.dataInicio||"—"} → {s.dataFim||"—"}</div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}><span>Material</span><b style={{ color:D.text }}>{brl(s.valorMaterial||0)}</b></div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}><span>Mão de obra</span><b style={{ color:D.text }}>{brl(s.valorMaoDeObra||0)}</b></div>
                    <div style={{ display:"flex", justifyContent:"space-between", paddingTop:5, borderTop:`1px solid ${D.border}` }}><span style={{ fontWeight:600, color:D.text }}>Total</span><b style={{ color:D.warning }}>{brl(custo(s))}</b></div>
                    {s.obsConclusao && <div style={{ marginTop:2, fontStyle:"italic", color:D.textMut }}>{s.obsConclusao}</div>}
                  </div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => reabrirServico(s.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", background:D.warningBg, color:"#92400E", border:`1px solid #FDE68A`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logUndo" size={14} /> Reabrir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} title="Remover" style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                    </div>
                  )}
                </div>
              );

              const colunaHeader = (cor, label, n) => (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:cor }} />
                  <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>{label}</span>
                  <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:"#fff", background:cor, borderRadius:20, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 6px" }}>{n}</span>
                </div>
              );

              return (
              <>
                {/* Faixa de resumo */}
                <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12, marginBottom:20 }}>
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.warning, flexShrink:0 }}><NavIcon id="clock" size={19} /></div>
                    <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.warning, lineHeight:1 }}>{pend.length}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>Pendentes</div></div>
                  </div>
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.success, flexShrink:0 }}><NavIcon id="logCheck" size={19} /></div>
                    <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.success, lineHeight:1 }}>{conc.length}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>Concluídos</div></div>
                  </div>
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14, gridColumn: isMobile?"1 / -1":"auto" }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.text, flexShrink:0 }}><NavIcon id="servicos" size={19} /></div>
                    <div><div style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:700, color:D.text, lineHeight:1, letterSpacing:"-0.02em" }}>{brl(totalGasto)}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>Gasto em manutenção</div></div>
                  </div>
                </div>

                {/* Quadro (kanban) */}
                <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:16, alignItems:"start" }}>
                  <div>
                    {colunaHeader(D.warning, "Pendentes", pend.length)}
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {pend.map(cardPendente)}
                      {pend.length===0 && <div style={{ background:D.bgCard, borderRadius:D.radius, border:`1px dashed ${D.border}`, padding:24, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhum serviço pendente.</div>}
                    </div>
                  </div>
                  <div>
                    {colunaHeader(D.success, "Concluídos", conc.length)}
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {conc.map(cardConcluido)}
                      {conc.length===0 && <div style={{ background:D.bgCard, borderRadius:D.radius, border:`1px dashed ${D.border}`, padding:24, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhum serviço concluído ainda.</div>}
                    </div>
                  </div>
                </div>
              </>
              );
            })()}
          </div>
          </div>
        )}

        {/* ── Reservas ── */}
        {aba === "reservas" && podeUsar("reservas") && (
          <div>
            <TopBar title="Reservas" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {(() => {
                const pend = reservas.filter(r=>r.status==="pendente");
                const todoHist = reservas.filter(r=>r.status!=="pendente");
                const hist = todoHist.filter(r => noPeriodo(r.timestamp, perReserva) && casaBusca(r, buscaReserva, ["area","nome","unidade","data","observacao"]));
                const aprov = hist.filter(r=>r.status==="aprovada");
                const rejet = hist.filter(r=>r.status==="rejeitada");

                const cards = [
                  { label:"Aguardando aprovação", valor: pend.length,  icon:"clock",    cor:D.warning },
                  { label:"Aprovadas",            valor: aprov.length, icon:"logCheck", cor:D.success },
                  { label:"Rejeitadas",           valor: rejet.length, icon:"logTrash", cor:D.danger  },
                ];

                const chips = [
                  { id:"todas",     label:"Todas",      cor:D.primary, n:hist.length },
                  { id:"aprovada",  label:"Aprovadas",  cor:D.success, n:aprov.length },
                  { id:"rejeitada", label:"Rejeitadas", cor:D.danger,  n:rejet.length },
                ];
                const histFiltrado = hist.filter(r => filtroReserva==="todas" || r.status===filtroReserva);

                return (
                <>
                  {/* Cards de resumo */}
                  <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12, marginBottom:16 }}>
                    {cards.map((c,i) => (
                      <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:c.cor, flexShrink:0 }}><NavIcon id={c.icon} size={19} /></div>
                        <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:c.cor, letterSpacing:"-0.02em", lineHeight:1 }}>{c.valor}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>{c.label}</div></div>
                      </div>
                    ))}
                  </div>

                  {/* Faixa de destaque + botão nova reserva */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
                    {pend.length > 0 ? (
                      <div style={{ display:"flex", alignItems:"center", gap:10, background:D.warningBg, border:`1px solid #FDE68A`, borderRadius:D.radius, padding:"10px 16px", flex:1, minWidth:220 }}>
                        <span style={{ color:D.warning, display:"flex" }}><NavIcon id="clock" size={17} /></span>
                        <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:"#92400E" }}>{pend.length} {pend.length===1?"reserva aguardando":"reservas aguardando"} sua aprovação</span>
                      </div>
                    ) : <div style={{ flex:1 }} />}
                    {!readOnly && (
                      <button onClick={() => { setNovaReserva({ area:"Churrasqueira", data:"", horario:"", observacao:"", moradorId:"", moradorNome:"" }); setModal({ type:"novaReservaSindico" }); }} style={{ padding:"10px 18px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, whiteSpace:"nowrap" }}>+ Nova Reserva</button>
                    )}
                  </div>

                  {/* Pendentes — precisam de aprovação */}
                  {pend.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:D.warning }} />
                        <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Aguardando aprovação</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {pend.map(r => (
                          <div key={r.id} style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}`, padding:16, display:"flex", justifyContent:"space-between", alignItems: isMobile?"stretch":"center", gap:12, flexDirection: isMobile?"column":"row" }}>
                            <div style={{ display:"flex", gap:12, alignItems:"center", minWidth:0 }}>
                              <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id="reservas" size={19} /></div>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{r.area} · {r.data} {r.horario&&`· ${r.horario}`}</div>
                                <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{r.nome} · {r.unidade}{r.observacao?` · ${r.observacao}`:""}</div>
                                <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:2 }}>Solicitado em {r.criadoEm}</div>
                              </div>
                            </div>
                            {!readOnly && (
                              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                                <button onClick={() => aprovarReserva(r.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={15} /> Aprovar</button>
                                <button onClick={() => rejeitarReserva(r.id)} title="Rejeitar" style={{ width:38, height:38, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={16} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Histórico */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Histórico de reservas</span>

                    </div>
                    {todoHist.length > 0 && (
                      <BarraFiltros
                        periodo={perReserva} setPeriodo={setPerReserva}
                        timestamps={todoHist.map(r=>r.timestamp)} total={hist.length}
                        rotuloItem="reserva" D={D} isMobile={isMobile}
                        busca={buscaReserva} setBusca={setBuscaReserva} placeholderBusca="Buscar por área, morador ou unidade..." mostrarBusca={todoHist.length > 8}
                        tipos={chips} tipoAtivo={filtroReserva} setTipo={setFiltroReserva} rotuloTipo="Todas" />
                    )}
                    {todoHist.length === 0 ? (
                      <div style={{ background:D.bgCard, borderRadius:D.radius, padding:36, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                        <div style={{ display:"flex", justifyContent:"center", marginBottom:10, color:D.textMut }}><NavIcon id="reservas" size={34} /></div>
                        <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhuma reserva aprovada ou rejeitada ainda.</div>
                      </div>
                    ) : isMobile ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {histFiltrado.map(r => {
                          const aprov = r.status==="aprovada";
                          return (
                            <div key={r.id} style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${aprov?D.success:D.danger}`, padding:14 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                                <div style={{ display:"flex", gap:10, alignItems:"center", minWidth:0 }}>
                                  <div style={{ width:34, height:34, borderRadius:9, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id="reservas" size={16} /></div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{r.area}</div>
                                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{r.nome} · {r.unidade}</div>
                                  </div>
                                </div>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:11.5, fontWeight:600, background: aprov?D.successBg:D.dangerBg, color: aprov?D.success:D.danger, flexShrink:0 }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background: aprov?D.success:D.danger }} />
                                  {aprov?"Aprovada":"Rejeitada"}
                                </span>
                              </div>
                              <div style={{ fontFamily:D.fontBody, fontSize:12.5, color:D.textSec, marginTop:8 }}>{r.data}{r.horario?` · ${r.horario}`:""}</div>
                              {!readOnly && (
                                <div style={{ marginTop:10 }}>
                                  <button onClick={() => { if(window.confirm("Remover esta reserva?")) removerReserva(r.id); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:D.bgCard, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logTrash" size={14} /> Remover</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead>
                            <tr style={{ background:D.muted }}>
                              {["Área","Morador","Data","Horário","Status", ...(readOnly?[]:["Ações"])].map(h => (
                                <th key={h} style={{ padding:"10px 18px", textAlign:"left", fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px", borderBottom:`1px solid ${D.border}` }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {histFiltrado.map(r => (
                              <tr key={r.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                                <td style={{ padding:"13px 18px" }}>
                                  <span style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>
                                    <span style={{ color:D.accent, display:"flex" }}><NavIcon id="reservas" size={16} /></span>{r.area}
                                  </span>
                                </td>
                                <td style={{ padding:"13px 18px" }}>
                                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.nome}</div>
                                  <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textSec }}>{r.unidade}</div>
                                </td>
                                <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.data}</td>
                                <td style={{ padding:"13px 18px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>{r.horario||"—"}</td>
                                <td style={{ padding:"13px 18px" }}>
                                  <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:12, fontWeight:600, background: r.status==="aprovada"?D.successBg:D.dangerBg, color: r.status==="aprovada"?D.success:D.danger }}>
                                    <span style={{ width:6, height:6, borderRadius:"50%", background: r.status==="aprovada"?D.success:D.danger }} />
                                    {r.status==="aprovada"?"Aprovada":"Rejeitada"}
                                  </span>
                                </td>
                                {!readOnly && (
                                  <td style={{ padding:"13px 18px" }}>
                                    <button onClick={() => { if(window.confirm("Remover esta reserva?")) removerReserva(r.id); }} title="Remover" style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {histFiltrado.length===0 && <tr><td colSpan={readOnly?5:6} style={{ padding:24, textAlign:"center", color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>Nenhuma reserva nesta categoria.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Acessos ── */}
        {aba === "acessos" && podeUsar("acessos") && (
          <div>
            <TopBar title="Controle de Acessos" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:0, fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Controle de Acessos</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Visitantes e prestadores de serviço</p>
              </div>
              {!readOnly && (
                <button onClick={() => { setNovoAcesso({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" }); setModal({ type:"novoAcesso" }); }} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, width: isMobile?"100%":"auto" }}>
                  + Registrar Entrada
                </button>
              )}
            </div>

            {(() => {
              const noPer = acessos.filter(a => noPeriodo(a.timestamp, perAcesso) && casaBusca(a, buscaAcesso, ["nome","empresa","motivo","unidade","dataEntrada"]));
              const dentro = noPer.filter(a=>!a.horaSaida);
              const sairam = noPer.filter(a=>!!a.horaSaida);
              const cards = [
                { label:"Total de acessos",   valor: noPer.length,  icon:"acPorta", cor:D.text },
                { label:"Ainda no condomínio", valor: dentro.length,  icon:"clock",   cor:D.warning },
                { label:"Saíram",              valor: sairam.length,  icon:"logCheck",cor:D.success },
              ];
              const chips = [
                { id:"todos",  label:"Todos",        cor:D.primary, n:noPer.length },
                { id:"dentro", label:"No condomínio", cor:D.warning, n:dentro.length },
                { id:"sairam", label:"Saíram",        cor:D.success, n:sairam.length },
              ];
              const lista = noPer.filter(a => filtroAcesso==="todos" || (filtroAcesso==="dentro" ? !a.horaSaida : !!a.horaSaida));

              return (
              <>
                {/* Resumo */}
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap:12, marginBottom:16 }}>
                  {cards.map((c,i) => (
                    <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14, gridColumn: (isMobile && i===2)?"1 / -1":"auto" }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:c.cor, flexShrink:0 }}><NavIcon id={c.icon} size={19} /></div>
                      <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:c.cor, lineHeight:1, letterSpacing:"-0.02em" }}>{c.valor}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>{c.label}</div></div>
                    </div>
                  ))}
                </div>

                {acessos.length === 0 ? (
                  <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                    <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="acPorta" size={36} /></div>
                    <div style={{ color:D.textMut, fontSize:14, fontFamily:D.fontBody }}>Nenhum acesso registrado ainda.</div>
                  </div>
                ) : (
                  <>
                    <BarraFiltros
                      periodo={perAcesso} setPeriodo={setPerAcesso}
                      timestamps={acessos.map(a=>a.timestamp)} total={noPer.length}
                      rotuloItem="acesso" D={D} isMobile={isMobile}
                      busca={buscaAcesso} setBusca={setBuscaAcesso} placeholderBusca="Buscar por nome, empresa ou unidade..." mostrarBusca={acessos.length > 8}
                      tipos={chips} tipoAtivo={filtroAcesso} setTipo={setFiltroAcesso} rotuloTipo="Todos" />

                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {lista.map((a) => {
                        const dentroAgora = !a.horaSaida;
                        return (
                          <div key={a.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${dentroAgora ? D.warning : D.success}` }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
                              <div style={{ display:"flex", gap:12, alignItems:"flex-start", minWidth:0 }}>
                                <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id="acPorta" size={19} /></div>
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>{a.nome}</div>
                                  <div style={{ display:"flex", flexWrap:"wrap", gap:"2px 12px", marginTop:3 }}>
                                    {a.empresa && <span style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}><span style={{ color:D.textMut, display:"flex" }}><NavIcon id="acEmpresa" size={13} /></span>{a.empresa}</span>}
                                    <span style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}><span style={{ color:D.textMut, display:"flex" }}><NavIcon id="acMotivo" size={13} /></span>{a.motivo}</span>
                                    {a.unidade && <span style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}><span style={{ color:D.textMut, display:"flex" }}><NavIcon id="acCasa" size={13} /></span>{a.unidade}</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ textAlign:"right", flexShrink:0 }}>
                                <div style={{ fontSize:12, color:D.text, fontWeight:600, fontFamily:D.fontBody }}>{a.dataEntrada}</div>
                                <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>Entrada {a.horaEntrada}</div>
                                {a.horaSaida
                                  ? <div style={{ fontSize:12, color:D.success, marginTop:2, fontWeight:600, fontFamily:D.fontBody }}>Saída {a.horaSaida}</div>
                                  : <span style={{ display:"inline-flex", alignItems:"center", gap:5, marginTop:4, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:11.5, fontWeight:600, background:D.warningBg, color:"#92400E" }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.warning }} />No condomínio</span>
                                }
                              </div>
                            </div>
                            {!readOnly && (
                              <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                                {dentroAgora && (
                                  <button onClick={() => registrarSaida(a.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={15} /> Registrar saída</button>
                                )}
                                <button onClick={() => { if(window.confirm("Remover este registro?")) removerAcesso(a.id); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:D.bgCard, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logTrash" size={14} /> Remover</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
              );
            })()}
          </div>
          </div>
        )}

        {/* ── Comunicados ── */}
        {aba === "comunicados" && podeUsar("comunicados") && (
          <div>
            <TopBar title="Comunicados" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
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
              {(() => {
                const comFiltrados = comunicados.filter(c => noPeriodo(c.timestamp, perComun) && casaBusca(c, buscaComun, ["titulo","mensagem","data"]));
                return (
                <>
                
                {comunicados.length > 0 && (
                  <BarraFiltros periodo={perComun} setPeriodo={setPerComun} timestamps={comunicados.map(c=>c.timestamp)} total={comFiltrados.length} D={D} isMobile={isMobile} rotuloItem="comunicado" busca={buscaComun} setBusca={setBuscaComun} placeholderBusca="Buscar por título ou conteúdo..." mostrarBusca={comunicados.length > 8} />
                )}
                {comunicados.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="comunicados" size={36} /></div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhum comunicado ainda</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Publique avisos para que todos os moradores vejam no portal individual.</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {comFiltrados.length === 0 && (
                    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:32, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhum comunicado neste período.</div>
                    </div>
                  )}
                  {comFiltrados.map(com => (
                    <div key={com.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"18px 20px", boxShadow:D.shadow, border:`1px solid ${com.fixado ? D.accent : D.border}`, borderLeft:`4px solid ${com.fixado ? D.accent : D.border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", minWidth:0 }}>
                          {com.fixado && <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:D.secondary, color:D.accent, fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:12, fontFamily:D.fontBody }}><NavIcon id="pin" size={12} /> Fixado</span>}
                          <span style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{com.titulo}</span>
                        </div>
                        {!readOnly && (
                          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                            <button onClick={() => alternarFixado(com)} title={com.fixado?"Desafixar":"Fixar no topo"} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background: com.fixado?D.secondary:D.muted, color: com.fixado?D.accent:D.textSec, border:`1px solid ${D.border}`, borderRadius:8, cursor:"pointer" }}><NavIcon id="pin" size={15} /></button>
                            <button onClick={() => { if(window.confirm("Remover este comunicado?")) removerComunicado(com.id); }} title="Remover" style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                          </div>
                        )}
                      </div>
                      <p style={{ fontFamily:D.fontBody, fontSize:14, color:D.text, lineHeight:1.6, margin:"0 0 10px", whiteSpace:"pre-wrap" }}>{com.mensagem}</p>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>Publicado em {com.data}</div>
                    </div>
                  ))}
                </div>
              )}
                </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Documentos ── */}
        {aba === "documentos" && podeUsar("documentos") && (
          <div>
            <TopBar title="Documentos" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ação */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Documentos importantes do condomínio, com alerta de vencimento</div>
                {!readOnly && (
                  <button onClick={() => { setNovoDocumento({ nome:"", categoria:"Alvará", vencimento:"", obs:"", arquivo:null, arquivoNome:"", publico:false }); setModal({ type:"novoDocumento" }); }} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, width: isMobile?"100%":"auto" }}>
                    + Novo documento
                  </button>
                )}
              </div>

              {(() => {
                const comSit = documentos.map(d => ({ ...d, sit: situacaoDoc(d.vencimento) }));
                const vencidos = comSit.filter(d => d.sit.dias !== null && d.sit.dias < 0);
                const vencendo = comSit.filter(d => d.sit.dias !== null && d.sit.dias >= 0 && d.sit.dias <= 30);
                const emDia    = comSit.filter(d => d.sit.dias === null || d.sit.dias > 30);
                const atencao  = vencidos.length + vencendo.length;

                const cards = [
                  { label:"Em dia",   valor: emDia.length,    icon:"logCheck", cor:D.success },
                  { label:"Vencendo", valor: vencendo.length, icon:"clock",    cor:D.warning },
                  { label:"Vencidos", valor: vencidos.length, icon:"alerta",   cor:D.danger  },
                ];
                const chips = [
                  { id:"todos",    label:"Todos",    cor:D.primary, n:comSit.length },
                  { id:"emDia",    label:"Em dia",   cor:D.success, n:emDia.length },
                  { id:"vencendo", label:"Vencendo", cor:D.warning, n:vencendo.length },
                  { id:"vencidos", label:"Vencidos", cor:D.danger,  n:vencidos.length },
                ];
                const listaBase = filtroDoc==="emDia" ? emDia : filtroDoc==="vencendo" ? vencendo : filtroDoc==="vencidos" ? vencidos : comSit;
                const lista = listaBase.filter(d => casaBusca(d, buscaDoc, ["nome","categoria","obs"]));

                return (
                <>
                  {/* Cards de resumo */}
                  {documentos.length > 0 && (
                    <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12, marginBottom:16 }}>
                      {cards.map((c,i) => (
                        <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14, gridColumn: (isMobile && i===2)?"1 / -1":"auto" }}>
                          <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:c.cor, flexShrink:0 }}><NavIcon id={c.icon} size={19} /></div>
                          <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:c.cor, lineHeight:1, letterSpacing:"-0.02em" }}>{c.valor}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>{c.label}</div></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Faixa de alerta */}
                  {atencao > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:10, background:D.warningBg, border:`1px solid #FDE68A`, borderRadius:D.radius, padding:"10px 16px", marginBottom:16 }}>
                      <span style={{ color:D.warning, display:"flex", flexShrink:0 }}><NavIcon id="alerta" size={17} /></span>
                      <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:"#92400E" }}>{atencao} {atencao===1?"documento precisa":"documentos precisam"} de atenção</span>
                    </div>
                  )}

                  {documentos.length === 0 ? (
                    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                      <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="documentos" size={36} /></div>
                      <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhum documento cadastrado</div>
                      <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Guarde alvará, apólice de seguro, ART do elevador, contratos e outros documentos importantes.</div>
                    </div>
                  ) : (
                    <>
                      <BarraFiltros
                        periodo={PERIODO_TUDO} setPeriodo={()=>{}} mostrarPeriodo={false}
                        timestamps={[]} total={0} D={D} isMobile={isMobile}
                        busca={buscaDoc} setBusca={setBuscaDoc} placeholderBusca="Buscar por nome ou categoria..." mostrarBusca={true}
                        tipos={chips} tipoAtivo={filtroDoc} setTipo={setFiltroDoc} rotuloTipo="Todos" />

                      {lista.length === 0 ? (
                        <div style={{ background:D.bgCard, borderRadius:D.radius, padding:32, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhum documento nesta situação.</div>
                        </div>
                      ) : (
                        <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"repeat(auto-fill,minmax(320px,1fr))", gap:14 }}>
                          {lista.map(docItem => {
                            const s = docItem.sit;
                            return (
                              <div key={docItem.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:"18px 20px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${s.cor}` }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:10 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:11, minWidth:0 }}>
                                    <div style={{ width:38, height:38, borderRadius:9, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id={docIconId(docItem.categoria)} size={18} /></div>
                                    <div style={{ minWidth:0 }}>
                                      <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{docItem.nome}</div>
                                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{docItem.categoria}</div>
                                    </div>
                                  </div>
                                  {!readOnly && (
                                    <button onClick={() => alternarDocPublico(docItem)} title={docItem.publico ? "Visível no portal do morador — clique para ocultar" : "Oculto dos moradores — clique para liberar no portal"}
                                      style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background: docItem.publico?D.successBg:D.muted, color: docItem.publico?D.success:D.textMut, border:`1px solid ${docItem.publico?D.success+"33":D.border}`, borderRadius:8, cursor:"pointer", flexShrink:0 }}>
                                      <NavIcon id={docItem.publico ? "unlock" : "lock"} size={15} />
                                    </button>
                                  )}
                                  {!readOnly && (
                                    <button onClick={() => { if(window.confirm("Remover este documento?")) removerDocumento(docItem.id); }} title="Remover" style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer", flexShrink:0 }}><NavIcon id="logTrash" size={15} /></button>
                                  )}
                                </div>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:s.bg, color:s.cor, fontSize:12, fontWeight:600, padding:"4px 12px 4px 9px", borderRadius:20, fontFamily:D.fontBody, marginBottom:10 }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background:s.cor }} />{s.label}
                                </span>
                                {docItem.obs && <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.5, margin:"0 0 10px" }}>{docItem.obs}</p>}
                                {docItem.arquivo && (
                                  <a href={docItem.arquivo} download={docItem.arquivoNome||docItem.nome} style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:13, color:D.accent, fontWeight:600, textDecoration:"none" }}>
                                    <NavIcon id="download" size={14} /> Baixar arquivo
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
                );
              })()}
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
            <TopBar title="Fundo de Reserva" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Saldo do fundo — hero */}
              <div style={{ background:`linear-gradient(135deg, ${D.sidebar}, ${D.primary})`, borderRadius:D.radiusXl, padding: isMobile?"22px 20px":"28px 32px", marginBottom:20, color:"#fff", boxShadow:`0 8px 32px rgba(30,58,114,0.3)`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:-20, right:-10, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }} />
                <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontBody, fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"1px", opacity:.75, marginBottom:8 }}><NavIcon id="banco" size={15} /> Saldo do Fundo de Reserva</div>
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
                  <button onClick={()=>{ setNovaMovFundo({ tipo:"aporte", valor:"", descricao:"", data:"" }); setModal({ type:"novaMovFundo" }); }} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="setaCima" size={15} /> Aporte manual</button>
                  <button onClick={()=>{ setNovaMovFundo({ tipo:"retirada", valor:"", descricao:"", data:"" }); setModal({ type:"novaMovFundo" }); }} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:D.dangerBg, color:D.danger, border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="setaBaixo" size={15} /> Retirada</button>
                </div>
              )}

              {/* Histórico de movimentações */}
              <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12, letterSpacing:"-0.02em" }}>Movimentações</div>
              {fundoMovs.length > 0 && (
                <BarraFiltros periodo={perFundo} setPeriodo={setPerFundo} timestamps={fundoMovs.map(m=>m.timestamp)} total={fundoMovs.filter(m=>noPeriodo(m.timestamp, perFundo)).length} D={D} isMobile={isMobile} rotuloItem="movimentação" />
              )}
              {fundoMovs.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="banco" size={36} /></div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma movimentação ainda</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Registre aportes mensais para construir o fundo de reserva do condomínio.</div>
                </div>
              ) : (
                <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                  {fundoMovs.filter(m=>noPeriodo(m.timestamp, perFundo)).length === 0 && (
                    <div style={{ padding:28, textAlign:"center", fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhuma movimentação neste período.</div>
                  )}
                  {fundoMovs.filter(m=>noPeriodo(m.timestamp, perFundo)).map((m,i,arr) => {
                    const aporte = m.tipo==="aporte";
                    return (
                    <div key={m.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom: i<arr.length-1?`1px solid ${D.border}`:"none", gap:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                        <div style={{ width:34, height:34, borderRadius:9, background: aporte?D.successBg:D.dangerBg, color: aporte?D.success:D.danger, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={aporte?"setaCima":"setaBaixo"} size={16} /></div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.descricao}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut }}>{m.data}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                        <span style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:700, color: aporte?D.success:D.danger }}>
                          {aporte?"+":"−"} R$ {m.valor.toFixed(2).replace(".",",")}
                        </span>
                        {!readOnly && (
                          <button onClick={()=>{ if(window.confirm("Remover esta movimentação?")) removerMovFundo(m.id); }} title="Remover" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Entregas ── */}
        {aba === "entregas" && podeUsar("entregas") && (() => {
          const campoEnt = ["descricao","moradorNome","unidade","remetente","obs"];
          const aguardando = entregas.filter(e => e.status === "aguardando" && casaBusca(e, buscaEntrega, campoEnt));
          const todasRetiradas = entregas.filter(e => e.status === "retirada" && casaBusca(e, buscaEntrega, campoEnt));
          const retiradas = todasRetiradas.filter(e => noPeriodo(e.timestamp, perEntrega));
          return (
          <div>
            <TopBar title="Controle de Entregas" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Cabeçalho + ação */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Registre encomendas recebidas e notifique os moradores</div>
                {!readOnly && (
                  <button onClick={() => { setNovaEntrega({ moradorId:"", remetente:"", descricao:"", obs:"" }); setModal({ type:"novaEntrega" }); }} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, width: isMobile?"100%":"auto" }}>
                    + Registrar encomenda
                  </button>
                )}
              </div>

              

              {/* Cards de resumo */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.warning, flexShrink:0 }}><NavIcon id="entregas" size={19} /></div>
                  <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.warning, letterSpacing:"-0.02em", lineHeight:1 }}>{aguardando.length}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>Aguardando retirada</div></div>
                </div>
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.success, flexShrink:0 }}><NavIcon id="logCheck" size={19} /></div>
                  <div><div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.success, letterSpacing:"-0.02em", lineHeight:1 }}>{retiradas.length}</div><div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:4 }}>Já retiradas</div></div>
                </div>
              </div>

              {/* Faixa de destaque */}
              {aguardando.length > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:10, background:D.warningBg, border:`1px solid #FDE68A`, borderRadius:D.radius, padding:"10px 16px", marginBottom:16 }}>
                  <span style={{ color:D.warning, display:"flex" }}><NavIcon id="entregas" size={17} /></span>
                  <span style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:"#92400E" }}>{aguardando.length} {aguardando.length===1?"encomenda aguardando":"encomendas aguardando"} retirada</span>
                </div>
              )}

              {/* Aguardando retirada */}
              {aguardando.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:D.warning }} />
                    <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Aguardando retirada</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {aguardando.map(e => (
                      <div key={e.id} style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                          <div style={{ display:"flex", gap:12, alignItems:"flex-start", flex:1, minWidth:180 }}>
                            <div style={{ width:40, height:40, borderRadius:10, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.accent, flexShrink:0 }}><NavIcon id="entregas" size={19} /></div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{e.descricao}</div>
                              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, marginTop:3 }}>Para: <b style={{ color:D.text }}>{e.moradorNome}</b> · {e.unidade}</div>
                              {e.remetente && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>Remetente: {e.remetente}</div>}
                              {e.obs && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:2 }}>{e.obs}</div>}
                              <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:6 }}>Chegou em {e.dataChegada} às {e.horaChegada}</div>
                            </div>
                          </div>
                          {!readOnly && (
                            <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                              <button onClick={() => marcarRetirada(e)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={15} /> Retirada</button>
                              <button onClick={() => { if(window.confirm("Remover este registro?")) removerEntrega(e.id); }} title="Remover" style={{ width:38, height:38, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={16} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de retiradas */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:D.success }} />
                <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Já retiradas</span>
              </div>
              {todasRetiradas.length > 0 && (
                <BarraFiltros periodo={perEntrega} setPeriodo={setPerEntrega} timestamps={todasRetiradas.map(e=>e.timestamp)} total={retiradas.length} D={D} isMobile={isMobile} rotuloItem="encomenda" busca={buscaEntrega} setBusca={setBuscaEntrega} placeholderBusca="Buscar por encomenda, morador ou unidade..." mostrarBusca={entregas.length > 8} />
              )}
              {todasRetiradas.length === 0 && aguardando.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="entregas" size={36} /></div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Nenhuma encomenda registrada</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Quando chegar uma encomenda, registre aqui e o morador será avisado.</div>
                </div>
              ) : retiradas.length === 0 ? (
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, padding:"12px 0" }}>Nenhuma encomenda retirada ainda.</div>
              ) : (
                <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                  {retiradas.map((e,i) => (
                    <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 16px", borderBottom: i<retiradas.length-1?`1px solid ${D.border}`:"none", gap:12 }}>
                      <div style={{ display:"flex", gap:11, alignItems:"center", flex:1, minWidth:0 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", color:D.textSec, flexShrink:0 }}><NavIcon id="entregas" size={15} /></div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.descricao}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{e.moradorNome} · {e.unidade}</div>
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px 3px 8px", borderRadius:20, fontSize:11.5, fontWeight:600, background:D.successBg, color:D.success }}><span style={{ width:6, height:6, borderRadius:"50%", background:D.success }} />Retirada</span>
                        <div style={{ fontFamily:D.fontBody, fontSize:11, color:D.textMut, marginTop:3 }}>{e.dataRetirada}{e.horaRetirada?` às ${e.horaRetirada}`:""}</div>
                      </div>
                      {!readOnly && (
                        <button onClick={() => { if(window.confirm("Remover este registro?")) removerEntrega(e.id); }} title="Remover" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer", flexShrink:0 }}><NavIcon id="logTrash" size={15} /></button>
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
            <TopBar title="Consultas aos moradores" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Crie votações para os moradores decidirem pelo portal</div>
                {!readOnly && (
                  <button onClick={() => { setNovaEnquete({ titulo:"", descricao:"", opcoes:["",""] }); setModal({ type:"novaEnquete" }); }} style={{ padding:"9px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Nova enquete</button>
                )}
              </div>

              {enquetes.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="enquetes" size={36} /></div>
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
                          <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:12, fontWeight:600, color: aberta?D.success:D.textSec, background: aberta?D.successBg:D.muted, padding:"4px 12px 4px 10px", borderRadius:20, whiteSpace:"nowrap" }}><span style={{ width:7, height:7, borderRadius:"50%", background: aberta?D.success:D.textMut }} />{aberta?"Aberta":"Encerrada"}</span>
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
                            <button onClick={() => encerrarEnquete(enq.id, aberta)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background: aberta?D.warningBg:D.successBg, color: aberta?"#92400E":D.success, border:`1px solid ${aberta?"#FDE68A":"#86EFAC"}`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id={aberta?"lock":"unlock"} size={14} /> {aberta?"Encerrar":"Reabrir"}</button>
                            <button onClick={() => { if(window.confirm(`Remover a enquete "${enq.titulo}"? Os votos serão apagados.`)) removerEnquete(enq); }} title="Remover" style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
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
            aberta:       { rotulo:"Aberta",       icon:"clock",    cor:D.warning, bg:D.warningBg },
            em_andamento: { rotulo:"Em andamento", icon:"servicos", cor:D.accent,  bg:D.secondary },
            resolvida:    { rotulo:"Resolvida",    icon:"logCheck", cor:D.success,  bg:D.successBg },
          };
          const noPer = ocorrencias.filter(o => noPeriodo(o.timestamp, perOcorr) && casaBusca(o, buscaOcorr, ["titulo","descricao","nome","unidade","categoria","respostaSindico"]));
          const filtradas = filtroOcorrencia === "todas" ? noPer : noPer.filter(o => o.status === filtroOcorrencia);
          const cont = {
            todas: noPer.length,
            aberta: noPer.filter(o=>o.status==="aberta").length,
            em_andamento: noPer.filter(o=>o.status==="em_andamento").length,
            resolvida: noPer.filter(o=>o.status==="resolvida").length,
          };
          const filtros = [
            { id:"todas",        label:"Todas",        cor:D.primary, n:cont.todas },
            { id:"aberta",       label:"Abertas",      cor:D.warning, n:cont.aberta },
            { id:"em_andamento", label:"Em andamento", cor:D.accent,  n:cont.em_andamento },
            { id:"resolvida",    label:"Resolvidas",   cor:D.success, n:cont.resolvida },
          ];
          return (
          <div>
            <TopBar title="Ocorrências" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              {/* Filtros */}
              <BarraFiltros
                periodo={perOcorr} setPeriodo={setPerOcorr}
                timestamps={ocorrencias.map(o=>o.timestamp)} total={noPer.length}
                rotuloItem="ocorrência" D={D} isMobile={isMobile}
                busca={buscaOcorr} setBusca={setBuscaOcorr} placeholderBusca="Buscar por título, morador ou unidade..." mostrarBusca={ocorrencias.length > 8}
                tipos={filtros} tipoAtivo={filtroOcorrencia} setTipo={setFiltroOcorrencia} rotuloTipo="Todas" />

              {filtradas.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="ocorrencias" size={36} /></div>
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
                          <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:si.cor, background:si.bg, padding:"4px 12px 4px 9px", borderRadius:20, whiteSpace:"nowrap" }}><NavIcon id={si.icon} size={13} /> {si.rotulo}</span>
                        </div>
                        <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, lineHeight:1.55, margin:"12px 0 0", background:D.muted, padding:"10px 12px", borderRadius:D.radiusSm }}>{o.descricao}</p>
                        {o.respostaSindico && (
                          <div style={{ marginTop:10, fontFamily:D.fontBody, fontSize:13, color:D.text, background:D.secondary, padding:"10px 12px", borderRadius:D.radiusSm }}>
                            <b>Sua resposta:</b> {o.respostaSindico}
                          </div>
                        )}
                        {!readOnly && (
                          <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                            <button onClick={() => { setRespostaOcorr(o.respostaSindico || ""); setModal({ type:"responderOcorrencia", data:{ id:o.id, titulo:o.titulo } }); }} style={{ padding:"8px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Responder</button>
                            {o.status !== "em_andamento" && <button onClick={() => responderOcorrencia(o.id, o.respostaSindico || "", "em_andamento")} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="servicos" size={14} /> Em andamento</button>}
                            {o.status !== "resolvida" && <button onClick={() => responderOcorrencia(o.id, o.respostaSindico || "", "resolvida")} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:D.successBg, color:D.success, border:`1px solid #86EFAC`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}><NavIcon id="logCheck" size={14} /> Resolver</button>}
                            <button onClick={() => { if(window.confirm("Remover esta ocorrência?")) removerOcorrencia(o.id); }} title="Remover" style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid #FECACA`, borderRadius:8, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
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
            <TopBar title="Fluxo de Caixa" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
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
                  { label:"Taxas pagas",            icon:"fxCash",  valor:fMes.taxas,             cor:D.success },
                  { label:"Cobranças extras pagas", icon:"logPlus", valor:fMes.extras,            cor:D.success },
                  { label:"Receitas avulsas",       icon:"fxMoeda", valor:fMes.recAvulsas,        cor:D.success },
                  { label:"Despesas pagas",         icon:"catLuz",  valor:-fMes.despesasPagas,    cor:D.danger },
                  { label:"Serviços concluídos",    icon:"servicos",valor:-fMes.servConcluidos,   cor:D.danger },
                ].map((it,idx) => {
                  const zerado = it.valor === 0;
                  return (
                  <div key={idx} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 0", borderBottom: idx<4?`1px solid ${D.border}`:"none" }}>
                    <div style={{ width:30, height:30, borderRadius:8, background: zerado?D.muted:(it.cor===D.success?D.successBg:D.dangerBg), color: zerado?D.textMut:it.cor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={it.icon} size={15} /></div>
                    <span style={{ flex:1, fontFamily:D.fontBody, fontSize:13, color:D.textSec, minWidth:0 }}>{it.label}</span>
                    <span style={{ fontFamily:D.fontBody, fontSize:14, fontWeight:600, color: zerado?D.textMut:it.cor, flexShrink:0 }}>{it.valor>=0?"+":"−"} {fmt(Math.abs(it.valor))}</span>
                  </div>
                  );
                })}
              </div>

              {/* Receitas avulsas do mês */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?16:20, boxShadow:D.shadow, border:`1px solid ${D.border}`, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems: isMobile?"stretch":"center", marginBottom: receitasMes.length?14:0, flexDirection: isMobile?"column":"row", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>
                    <span style={{ color:D.accent, display:"flex" }}><NavIcon id="fxMoeda" size={17} /></span>
                    Receitas avulsas — {mesLabel(mesSel)}
                  </div>
                  {!readOnly && <button onClick={() => { setNovaReceita({ descricao:"", valor:"", categoria:"Outra", mes: mesSel }); setModal({ type:"novaReceita" }); }} style={{ padding:"9px 14px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"auto" }}>+ Nova receita</button>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {receitasMes.map(r => (
                    <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:D.bgCard, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.success}`, borderRadius:D.radiusSm, gap:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:11, minWidth:0 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:D.successBg, color:D.success, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id="setaCima" size={15} /></div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.descricao}</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{r.categoria}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                        <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:700, color:D.success }}>+ {fmt(r.valor)}</div>
                        {!readOnly && <button onClick={() => { if(window.confirm("Remover esta receita?")) removerReceita(r.id); }} title="Remover" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>}
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
          const corTipo = { "Evento":D.accent, "Manutenção":D.warning, "Assembleia":D.primary, "Reunião":D.success, "Feriado":D.danger, "Outro":D.textSec };
          const fmtData = (d) => { const dt=parseData(d); return dt.toLocaleDateString("pt-BR",{ weekday:"short", day:"2-digit", month:"short" }); };
          const diasAte = (d) => { const dt=parseData(d); const diff=Math.ceil((dt-hoje)/(1000*60*60*24)); if(diff===0) return "Hoje"; if(diff===1) return "Amanhã"; return `Em ${diff} dias`; };

          const CardEvento = ({ e, passado }) => {
            const cor = corTipo[e.tipo] || D.textSec;
            const prazo = diasAte(e.data);
            const urgente = prazo==="Hoje" || prazo==="Amanhã";
            return (
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"16px 18px", boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cor}`, opacity: passado?0.65:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ display:"flex", gap:12, flex:1, minWidth:0 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:D.muted, color:cor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={evIconId(e.tipo)} size={19} /></div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>{e.titulo}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:3 }}>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, color:cor, fontWeight:600 }}>{e.tipo}</span>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, textTransform:"capitalize" }}>· {fmtData(e.data)}{e.hora?` · ${e.hora}`:""}</span>
                    </div>
                    {e.descricao && <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.5, margin:"8px 0 0" }}>{e.descricao}</p>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                  {!passado && (
                    urgente
                      ? <span style={{ fontFamily:D.fontBody, fontSize:11.5, fontWeight:600, color:D.danger, background:D.dangerBg, padding:"3px 10px", borderRadius:20, whiteSpace:"nowrap" }}>{prazo}</span>
                      : <span style={{ fontFamily:D.fontBody, fontSize:11.5, fontWeight:600, color:D.textMut, whiteSpace:"nowrap" }}>{prazo}</span>
                  )}
                  {!readOnly && (
                    <button onClick={() => { if(window.confirm("Remover este evento?")) removerEvento(e.id); }} title="Remover" style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:D.textMut, cursor:"pointer" }}><NavIcon id="logTrash" size={15} /></button>
                  )}
                </div>
              </div>
            </div>
            );
          };

          return (
          <div>
            <TopBar title="Agenda" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>Eventos, manutenções, assembleias e datas importantes</div>
                {!readOnly && (
                  <button onClick={() => { setNovoEvento({ titulo:"", tipo:"Evento", data:"", hora:"", descricao:"" }); setModal({ type:"novoEvento" }); }} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)`, width: isMobile?"100%":"auto" }}>
                    + Novo evento
                  </button>
                )}
              </div>

              {eventos.length === 0 ? (
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="agenda" size={36} /></div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:16, fontWeight:600, color:D.text, marginBottom:6, letterSpacing:"-0.02em" }}>Agenda vazia</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Adicione eventos, manutenções programadas e assembleias para organizar o condomínio.</div>
                </div>
              ) : (() => {
                const tiposPresentes = [...new Set(eventos.map(e=>e.tipo))];
                const chips = [{ id:"todos", label:"Todos", cor:D.primary, n:eventos.length },
                  ...tiposPresentes.map(t => ({ id:t, label:t, cor:corTipo[t]||D.textSec, n:eventos.filter(e=>e.tipo===t).length }))];
                const fil = (arr) => filtroEvento==="todos" ? arr : arr.filter(e=>e.tipo===filtroEvento);
                const tsEv = (e) => parseData(e.data).getTime();
                const prox = fil(proximos);
                const todosPass = fil(passados);
                const pass = todosPass.filter(e => noPeriodo(tsEv(e), perEvento));
                const primeiro = proximos[0];

                return (
                <>
                  {/* Faixa do próximo evento */}
                  {primeiro && (
                    <div style={{ display:"flex", alignItems:"center", gap:10, background:D.secondary, border:`1px solid ${D.border}`, borderRadius:D.radius, padding:"10px 16px", marginBottom:16 }}>
                      <span style={{ color:D.accent, display:"flex", flexShrink:0 }}><NavIcon id="agenda" size={17} /></span>
                      <span style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        Próximo: <b>{primeiro.titulo}</b> · {diasAte(primeiro.data).toLowerCase()}
                      </span>
                    </div>
                  )}

                  {/* Filtros por tipo */}
                  {tiposPresentes.length > 1 && (
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                      {chips.map(c => {
                        const ativo = filtroEvento===c.id;
                        return (
                          <button key={c.id} onClick={()=>setFiltroEvento(c.id)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:20, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                            {c.id!=="todos" && <span style={{ width:7, height:7, borderRadius:"50%", background: ativo?"#fff":c.cor }} />}
                            {c.label} <span style={{ opacity:.6 }}>{c.n}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {prox.length === 0 && todosPass.length === 0 ? (
                    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:32, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhum evento deste tipo.</div>
                    </div>
                  ) : (
                    <>
                      {prox.length > 0 && (
                        <div style={{ marginBottom:24 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                            <span style={{ width:8, height:8, borderRadius:"50%", background:D.accent }} />
                            <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Próximos eventos</span>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                            {prox.map(e => <CardEvento key={e.id} e={e} passado={false} />)}
                          </div>
                        </div>
                      )}
                      {todosPass.length > 0 && (
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                            <span style={{ width:8, height:8, borderRadius:"50%", background:D.textMut }} />
                            <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:".8px" }}>Eventos passados</span>
                          </div>
                          <BarraFiltros periodo={perEvento} setPeriodo={setPerEvento} timestamps={todosPass.map(tsEv)} total={pass.length} D={D} isMobile={isMobile} rotuloItem="evento" />
                          {pass.length === 0 ? (
                            <div style={{ background:D.bgCard, borderRadius:D.radius, padding:28, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                              <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut }}>Nenhum evento neste período.</div>
                            </div>
                          ) : (
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {pass.map(e => <CardEvento key={e.id} e={e} passado={true} />)}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
                );
              })()}
            </div>
          </div>
          );
        })()}

        {/* ── Histórico ── */}
        {aba === "historico" && podeUsar("historico") && (
          <div>
            <TopBar title="Histórico de Atividades" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:0, fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Histórico de Atividades</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>{logs.length} registro{logs.length!==1?"s":""} no sistema</p>
              </div>
              {!readOnly && logs.length > 0 && (
                <button onClick={async () => { if(window.confirm("Limpar todo o histórico?")) { const batch = writeBatch(db); logs.forEach(l => batch.delete(doc(db,"logs",l.id))); await batch.commit(); showToast("Histórico limpo."); }}} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:D.dangerBg, color:"#991B1B", border:`1px solid #FECACA`, borderRadius:D.radiusSm, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                  <NavIcon id="logTrash" size={14} /> Limpar histórico
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div style={{ background:D.bgCard, borderRadius:12, padding:40, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:D.textMut }}><NavIcon id="historico" size={36} /></div>
                <div style={{ color:D.textMut, fontSize:14, fontFamily:D.fontBody }}>Nenhuma atividade registrada ainda.<br/>As ações realizadas no sistema aparecerão aqui.</div>
              </div>
            ) : (() => {
              // Filtro por período (data) e depois por tipo
              // Por padrão mostra os últimos 12 meses: o histórico cresce para sempre e
              // carregar tudo deixa a tela lenta com o tempo. O botão abaixo libera o resto.
              const LIMITE_MESES = 12;
              const corteHistorico = Date.now() - LIMITE_MESES * 30 * MS_DIA;
              const logsAntigos = logs.filter(l => (l.timestamp || 0) < corteHistorico).length;
              const baseLogs = histCompleto ? logs : logs.filter(l => (l.timestamp || 0) >= corteHistorico);
              const noPer = baseLogs.filter(l => noPeriodo(l.timestamp, perLog) && casaBusca(l, buscaLog, ["descricao","usuario","dataHora"]));
              const filtrados = noPer.filter(l => filtroLog === "tudo" || tipoLog(l) === filtroLog);
              // Agrupamento por data (logs já vêm ordenados por timestamp desc)
              const grupos = [];
              filtrados.forEach(l => {
                const rot = rotuloDataLog(l.timestamp || Date.now());
                const ultimo = grupos[grupos.length-1];
                if (ultimo && ultimo.rotulo === rot) ultimo.itens.push(l);
                else grupos.push({ rotulo: rot, itens: [l] });
              });
              return (
                <>
                  <BarraFiltros
                    periodo={perLog} setPeriodo={setPerLog}
                    timestamps={logs.map(l=>l.timestamp)} total={noPer.length}
                    rotuloItem="registro" D={D} isMobile={isMobile}
                    busca={buscaLog} setBusca={setBuscaLog} placeholderBusca="Buscar no histórico..." mostrarBusca={logs.length > 8}
                    tipos={TIPOS_LOG.filter(t => t.id === "tudo" || noPer.some(l => tipoLog(l) === t.id))
                            .map(t => ({ id:t.id, label:t.label, cor: t.id==="tudo"?D.primary:D.accent,
                                         n: t.id==="tudo" ? noPer.length : noPer.filter(l => tipoLog(l) === t.id).length }))}
                    tipoAtivo={filtroLog} setTipo={setFiltroLog} rotuloTipo="Todos os tipos" />

                  {filtrados.length === 0 ? (
                    <div style={{ background:D.bgCard, borderRadius:12, padding:32, textAlign:"center", boxShadow:D.shadow, border:`1px solid ${D.border}`, color:D.textMut, fontSize:13, fontFamily:D.fontBody }}>
                      Nenhum registro nesta categoria.
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                      {grupos.map((g, gi) => (
                        <div key={gi}>
                          <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textMut, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:8, paddingLeft:2 }}>{g.rotulo}</div>
                          <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                            {g.itens.map((log, i) => {
                              const est = estiloLog(log, D);
                              return (
                                <div key={log.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderBottom: i < g.itens.length-1 ? `1px solid ${D.border}` : "none" }}>
                                  <div style={{ width:30, height:30, borderRadius:8, background:D.muted, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:est.cor }}>
                                    <NavIcon id={est.icon} size={16} />
                                  </div>
                                  <div style={{ flex:1, minWidth:0, fontSize:13, color:D.text, lineHeight:1.4, fontFamily:D.fontBody }}>{log.descricao}</div>
                                  <div style={{ fontSize:11.5, color:D.textMut, fontFamily:D.fontBody, flexShrink:0 }}>{horaLog(log)}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Registros mais antigos ficam fora por padrão, para a tela abrir rápido */}
                  {!histCompleto && logsAntigos > 0 && (
                    <div style={{ textAlign:"center", marginTop:18 }}>
                      <button onClick={() => setHistCompleto(true)}
                        style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 20px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                        <NavIcon id="setaBaixo" size={14} /> Carregar registros anteriores ({logsAntigos})
                      </button>
                      <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textMut, marginTop:8 }}>
                        Mostrando os últimos 12 meses
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          </div>
        )}

        {/* ── Configurações ── */}
        {aba === "config" && (
          <div>
            <TopBar title="Configurações" user={user} readOnly={readOnly} nPendentes={nPagos} moradores={moradores} onBuscar={abrirMoradorBusca} onConfig={()=>setAba("config")} onPlano={()=>setModal({type:"meuPlano"})} avisos={avisos} onIrPara={setAba} />
            <div style={{ padding: isMobile?"14px 14px 80px":"24px 28px 40px" }}>
            <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:"0 0 6px", fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Configurações</h2>
            <p style={{ color:D.textSec, margin:"0 0 20px", fontSize:13 }}>Parâmetros do condomínio</p>

            {/* Card de IDENTIDADE */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.accent}`, marginBottom:20 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.accent, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Identidade</div>
              <h3 style={{ color:D.text, margin:"0 0 4px", fontSize:15, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>Logo do condomínio</h3>
              <p style={{ color:D.textSec, fontSize:12.5, margin:"0 0 18px", lineHeight:1.6 }}>
                Aparece nos recibos, no relatório e na prestação de contas. Use PNG ou JPG — a imagem é reduzida automaticamente.
              </p>

              <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
                <div style={{ width:88, height:88, borderRadius:D.radius, border:`1.5px dashed ${logoCond?D.border:D.textMut}`, background: logoCond?"#fff":D.muted, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                  {logoCond
                    ? <img src={logoCond} alt="Logo do condomínio" style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }} />
                    : <span style={{ color:D.textMut, display:"flex" }}><NavIcon id="acEmpresa" size={30} /></span>}
                </div>

                {!readOnly && (
                  <div style={{ display:"flex", flexDirection:"column", gap:9, flex:1, minWidth:180 }}>
                    <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"10px 18px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: salvandoLogo?"default":"pointer", opacity: salvandoLogo?.6:1, fontFamily:D.fontBody, width: isMobile?"100%":"fit-content" }}>
                      <NavIcon id="download" size={15} />
                      {salvandoLogo ? "Salvando..." : logoCond ? "Trocar logo" : "Enviar logo"}
                      <input type="file" accept="image/png,image/jpeg" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; salvarLogo(f); }} style={{ display:"none" }} />
                    </label>
                    {logoCond && (
                      <button onClick={removerLogo} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"9px 16px", background:"none", color:D.textSec, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, width: isMobile?"100%":"fit-content" }}>
                        <NavIcon id="logTrash" size={14} /> Remover
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Card de assinatura — PLANO */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.accent}`, marginBottom:20 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.accent, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Plano</div>
              <h3 style={{ color:D.text, margin:"0 0 16px", fontSize:14, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em", display:"flex", alignItems:"center", gap:8 }}><span style={{ color:D.accent, display:"flex" }}><NavIcon id="assinatura" size={17} /></span> Sua assinatura</h3>
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

            {/* Card de PARÂMETROS (salvamento único) */}
            {(() => {
              const alterada =
                (parseFloat(taxa)||0) !== (parseFloat(condominio?.taxa)||0) ||
                (parseInt(diaVencimento)||10) !== (parseInt(condominio?.diaVencimento)||10) ||
                (podeUsar("multaJuros") && (
                  Boolean(cobrarMultaJuros) !== Boolean(condominio?.cobrarMultaJuros) ||
                  (parseFloat(multaPercent)||0) !== (parseFloat(condominio?.multaPercent)||0) ||
                  (parseFloat(jurosPercentMes)||0) !== (parseFloat(condominio?.jurosPercentMes)||0)
                ));
              return (
              <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.warning}`, marginBottom:20 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.warning, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Financeiro</div>
                <h3 style={{ color:D.text, margin:"0 0 4px", fontSize:15, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>Parâmetros de cobrança</h3>
                <p style={{ color:D.textSec, fontSize:12.5, margin:"0 0 20px" }}>Ajuste os valores e clique em salvar no fim do card.</p>

                {/* Taxa mensal */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ color:D.accent, display:"flex" }}><NavIcon id="cobrancas" size={17} /></span>
                  <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Taxa mensal</span>
                </div>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Valor (R$)</label>
                <input type="text" inputMode="decimal" value={taxa} onChange={e=>setTaxa(paraNumero(e.target.value)||0)} style={{ display:"block", width:"100%", padding:"12px 14px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:16, color:D.text, marginTop:8, boxSizing:"border-box", fontFamily:D.fontBody }} />

                <hr style={{ margin:"22px 0", border:"none", borderTop:`1px solid ${D.border}` }} />

                {/* Dia de vencimento */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ color:D.accent, display:"flex" }}><NavIcon id="reservas" size={17} /></span>
                  <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Dia de vencimento</span>
                </div>
                <p style={{ color:D.textSec, fontSize:12, margin:"0 0 12px" }}>O sistema enviará e-mails automaticamente 5 dias antes e no dia do vencimento.</p>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Dia do mês (1–28)</label>
                <input type="number" min={1} max={28} value={diaVencimento} onChange={e=>setDiaVencimento(parseInt(e.target.value)||10)} style={{ display:"block", width:120, padding:"12px 14px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:16, color:D.text, marginTop:8, boxSizing:"border-box", fontFamily:D.fontBody }} />

                <hr style={{ margin:"22px 0", border:"none", borderTop:`1px solid ${D.border}` }} />

                {/* Multa e juros */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ color:D.accent, display:"flex" }}><NavIcon id="multa" size={17} /></span>
                  <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Multa e juros por atraso</span>
                </div>
                {podeUsar("multaJuros") ? (
                  <>
                    <p style={{ color:D.textSec, fontSize:12, margin:"0 0 14px" }}>Quando ativo, cobranças em atraso recebem multa (uma vez) e juros proporcionais aos dias de atraso. Padrão legal: 2% de multa + 1% de juros ao mês.</p>
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
                    </div>
                    {cobrarMultaJuros && (
                      <div style={{ marginTop:14, background:D.secondary, borderRadius:D.radiusSm, padding:"12px 14px", fontFamily:D.fontBody, fontSize:12, color:D.text }}>
                        <b>Exemplo:</b> uma taxa de R$ {taxa.toFixed(2).replace(".",",")} com 15 dias de atraso ficaria: R$ {taxa.toFixed(2).replace(".",",")} + multa R$ {(taxa*(parseFloat(multaPercent)||0)/100).toFixed(2).replace(".",",")} + juros R$ {(taxa*(parseFloat(jurosPercentMes)||0)/100*(15/30)).toFixed(2).replace(".",",")} = <b>R$ {(taxa + taxa*(parseFloat(multaPercent)||0)/100 + taxa*(parseFloat(jurosPercentMes)||0)/100*(15/30)).toFixed(2).replace(".",",")}</b>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ background:D.muted, borderRadius:D.radiusSm, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <span style={{ display:"flex", color:D.textMut }}><NavIcon id="lock" size={19} /></span>
                    <div style={{ flex:1, minWidth:180 }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>Multa e juros — plano Padrão</div>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Cobre automaticamente multa e juros sobre atrasos.</div>
                    </div>
                    <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
                  </div>
                )}

                {/* Barra de salvar (único) */}
                {!readOnly && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:14, marginTop:24, paddingTop:18, borderTop:`1px solid ${D.border}` }}>
                    {alterada && <span style={{ fontFamily:D.fontBody, fontSize:12.5, color:D.warning, fontWeight:500 }}>Você tem alterações não salvas</span>}
                    <button onClick={salvarConfigGeral} disabled={!alterada || salvandoConfig} style={{ padding:"12px 28px", background: alterada ? D.primary : D.muted, color: alterada ? "#fff" : D.textMut, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontWeight:600, fontSize:14, cursor: (alterada && !salvandoConfig) ? "pointer" : "default" }}>
                      {salvandoConfig ? "Salvando..." : "Salvar alterações"}
                    </button>
                  </div>
                )}
              </div>
              );
            })()}

            {/* Card de AÇÕES */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.danger}`, marginBottom:20 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.danger, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Ações</div>
              <h3 style={{ color:D.text, margin:"0 0 4px", fontSize:15, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>Ações</h3>
              <p style={{ color:D.textSec, fontSize:12.5, margin:"0 0 20px" }}>Estas ações têm efeito imediato e não fazem parte do salvamento acima.</p>

              {/* Iniciar cobrança — marco zero (a única ação de fato irreversível do card) */}
              <div style={{ background:D.dangerBg, border:`1px solid #FECACA`, borderRadius:D.radius, padding:"16px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ color:D.danger, display:"flex" }}><NavIcon id="iniciarCobranca" size={17} /></span>
                  <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Iniciar cobrança a partir do próximo mês</span>
                  <span style={{ marginLeft:"auto", fontSize:9.5, fontWeight:700, color:D.danger, background:"#fff", padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap", flexShrink:0 }}>IRREVERSÍVEL</span>
                </div>
                <p style={{ color:D.textSec, fontSize:12, margin:"0 0 12px" }}>
                  Define o <b>mês que vem</b> como o primeiro mês de cobrança. As cobranças pendentes de meses anteriores (deste mês pra trás) são <b>removidas</b>, e o sistema passa a gerar e cobrar somente a partir do próximo mês. Não mexe no dia de vencimento nem em pagamentos já registrados. Ideal para o início da operação.
                </p>
                {/* Estado real: mostra o marco gravado e denuncia cobrança que não deveria existir */}
                {(() => {
                  const mesInicio = marcoZero ? marcoZero.slice(0,7) : null;
                  const orfas = mesInicio ? cobrancas.filter(c => c.mes < mesInicio && c.status !== "pago") : [];
                  return (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, background:"#fff", padding:"10px 12px", borderRadius:D.radiusSm, border:`1px solid ${D.border}` }}>
                        {marcoZero
                          ? <>Cobrança ativa a partir de: <b>{(() => { const [y,m]=marcoZero.split("-"); return mesLabel(`${y}-${m}`); })()}</b></>
                          : <>Nenhum início definido ainda — o sistema cobra todos os meses cadastrados.</>}
                      </div>
                      {orfas.length > 0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:9, background:D.warningBg, border:`1px solid #FDE68A`, borderRadius:D.radiusSm, padding:"10px 12px", marginTop:8 }}>
                          <span style={{ color:D.warning, display:"flex", flexShrink:0 }}><NavIcon id="alerta" size={15} /></span>
                          <span style={{ fontFamily:D.fontBody, fontSize:12, color:"#92400E" }}>
                            Ainda existem <b>{orfas.length}</b> cobrança(s) de meses anteriores ao início ({[...new Set(orfas.map(c=>mesLabel(c.mes)))].join(", ")}). Clique no botão abaixo para limpar.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {!readOnly && (
                  <button onClick={() => { if(window.confirm("Iniciar a cobrança só a partir do mês que vem?\n\n• As cobranças pendentes deste mês e anteriores serão REMOVIDAS\n• O sistema passa a cobrar a partir do próximo mês\n• Pagamentos já registrados e o dia de vencimento NÃO são afetados")) zerarAtrasados(); }} style={{ padding:"11px 20px", background:D.danger, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                    Iniciar cobrança no próximo mês
                  </button>
                )}
              </div>

              <hr style={{ margin:"24px 0", border:"none", borderTop:`1px solid ${D.border}` }} />

              {/* Verificação de consistência */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ color:D.accent, display:"flex" }}><NavIcon id="busca" size={17} /></span>
                <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Verificar cobranças inconsistentes</span>
              </div>
              <p style={{ color:D.textSec, fontSize:12, margin:"0 0 12px", lineHeight:1.6 }}>
                Procura cobranças que aparecem no portal do morador mas não no seu painel — normalmente sobras de testes ou de versões antigas do sistema. Mostra o que encontrar antes de remover.
              </p>
              <button onClick={limparCobrancasOrfas} disabled={limpandoOrfas} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: limpandoOrfas?"default":"pointer", opacity: limpandoOrfas?.6:1, fontFamily:D.fontBody, marginBottom:22, width: isMobile?"100%":"auto", justifyContent:"center" }}>
                <NavIcon id="busca" size={15} /> {limpandoOrfas ? "Verificando..." : "Verificar e limpar"}
              </button>

              <hr style={{ margin:"0 0 24px", border:"none", borderTop:`1px solid ${D.border}` }} />

              {/* Backup completo */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ color:D.accent, display:"flex" }}><NavIcon id="download" size={17} /></span>
                <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Backup completo</span>
              </div>
              <p style={{ color:D.textSec, fontSize:12, margin:"0 0 12px" }}>
                Baixa um arquivo com <b>tudo</b> deste condomínio — moradores, cobranças, despesas, documentos, histórico. Guarde em local seguro (nuvem pessoal, pendrive). É o seu seguro caso algo seja apagado por engano.
              </p>
              <button onClick={exportarBackupCompleto} disabled={gerandoBackup} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:D.bgCard, color:D.primary, border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: gerandoBackup?"default":"pointer", opacity: gerandoBackup?.6:1, fontFamily:D.fontBody, marginBottom:22, width: isMobile?"100%":"auto", justifyContent:"center" }}>
                <NavIcon id="download" size={15} /> {gerandoBackup ? "Gerando backup..." : "Baixar backup completo"}
              </button>

              <div style={{ height:1, background:D.border, margin:"0 0 22px" }} />

              {/* Disparar e-mails */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ color:D.accent, display:"flex" }}><NavIcon id="emails" size={17} /></span>
                <span style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text }}>Disparar e-mails manualmente</span>
              </div>
              {podeUsar("emailAuto") ? (
                <>
                  <p style={{ color:D.textSec, fontSize:12, margin:"0 0 14px" }}>Use estes botões caso queira enviar fora do disparo automático. O sistema evita duplicatas no mesmo dia.</p>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <button onClick={() => dispararEmails("lembrete")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1, fontFamily:D.fontBody }}>
                      {enviandoEmails ? "Enviando..." : `Lembrete a todos (${moradores.length})`}
                    </button>
                    <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:D.warning, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1, fontFamily:D.fontBody }}>
                      {enviandoEmails ? "Enviando..." : `Cobrar pendentes (${pendentes})`}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ background:D.muted, borderRadius:D.radiusSm, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <span style={{ display:"flex", color:D.textMut }}><NavIcon id="lock" size={19} /></span>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text }}>E-mails automáticos — plano Padrão</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>Envie lembretes e cobranças automáticas por e-mail.</div>
                  </div>
                  <a href="mailto:comercial.mysindi@gmail.com?subject=Upgrade de plano — MySindi" style={{ padding:"8px 16px", background:D.primary, color:"#fff", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:D.fontBody }}>Fazer upgrade</a>
                </div>
              )}
            </div>

            {/* Card de EQUIPE */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.success}`, marginBottom:20 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.success, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Equipe</div>
              <h3 style={{ color:D.text, margin:"0 0 4px", fontSize:15, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em" }}>Quem tem acesso</h3>
              <p style={{ color:D.textSec, fontSize:12.5, margin:"0 0 18px", lineHeight:1.6 }}>
                Dê acesso ao subsíndico, ao conselho fiscal e à portaria sem compartilhar a sua senha. Cada perfil vê apenas o que precisa.
              </p>

              {/* Lista da equipe */}
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                {equipe.length === 0 ? (
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textMut, padding:"12px 0" }}>Carregando...</div>
                ) : equipe.map(u => {
                  const eu = u.id === user?.uid;
                  const info = infoPapel(u.papel);
                  return (
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, flexWrap: isMobile?"wrap":"nowrap" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:D.primary, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, flexShrink:0 }}>
                        {(u.nome || u.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {u.nome || u.email}{eu && <span style={{ color:D.textMut, fontWeight:400 }}> · você</span>}
                        </div>
                        <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
                      </div>
                      {eu ? (
                        <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:D.textSec, background:D.muted, padding:"6px 12px", borderRadius:20, flexShrink:0 }}>{info.label}</span>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          <select value={u.papel || "sindico"} onChange={e => alterarPapel(u.id, e.target.value)}
                            style={{ padding:"7px 10px", border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:12.5, background:"#fff", fontFamily:D.fontBody, color:D.text, cursor:"pointer" }}>
                            {Object.entries(PAPEIS).map(([id,p]) => <option key={id} value={id}>{p.label}</option>)}
                          </select>
                          <button onClick={() => revogarAcesso(u.id)} title="Remover acesso"
                            style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:D.muted, color:D.danger, border:`1px solid ${D.border}`, borderRadius:8, cursor:"pointer" }}>
                            <NavIcon id="logTrash" size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Convidar */}
              <div style={{ background:D.muted, borderRadius:D.radius, padding:"16px 18px" }}>
                <div style={{ fontFamily:D.fontDisplay, fontSize:14, fontWeight:600, color:D.text, marginBottom:12 }}>Convidar alguém</div>
                <div style={{ display:"flex", gap:10, flexDirection: isMobile?"column":"row", alignItems: isMobile?"stretch":"flex-end" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <label style={{ fontSize:10.5, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>E-mail</label>
                    <input value={novoConvite.email} onChange={e => setNovoConvite(p => ({...p, email:e.target.value}))} placeholder="pessoa@email.com"
                      style={{ display:"block", width:"100%", padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13.5, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
                  </div>
                  <div style={{ minWidth: isMobile?"auto":170 }}>
                    <label style={{ fontSize:10.5, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:5 }}>Perfil</label>
                    <select value={novoConvite.papel} onChange={e => setNovoConvite(p => ({...p, papel:e.target.value}))}
                      style={{ display:"block", width:"100%", padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13.5, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text, cursor:"pointer" }}>
                      {Object.entries(PAPEIS).filter(([id]) => id !== "sindico").map(([id,p]) => <option key={id} value={id}>{p.label}</option>)}
                    </select>
                  </div>
                  <button onClick={async () => { const ok = await convidarMembro(novoConvite.email, novoConvite.papel); if (ok) setNovoConvite({ email:"", papel:"portaria" }); }}
                    style={{ padding:"10px 20px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody, whiteSpace:"nowrap" }}>
                    Convidar
                  </button>
                </div>
                <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:10, lineHeight:1.5 }}>
                  {infoPapel(novoConvite.papel).descricao} A pessoa recebe acesso ao criar a conta com este e-mail.
                </div>
              </div>
            </div>

            {/* Card de INFO — CONTA */}
            <div style={{ background:D.bgCard, borderRadius:D.radius, padding: isMobile?20:28, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${D.textMut}` }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10.5, fontWeight:700, color:D.textMut, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Conta</div>
              <h3 style={{ color:D.text, margin:"0 0 12px", fontSize:15, fontWeight:600, fontFamily:D.fontDisplay, letterSpacing:"-0.02em", display:"flex", alignItems:"center", gap:8 }}><span style={{ color:D.accent, display:"flex" }}><NavIcon id="moradores" size={17} /></span> Conta conectada</h3>
              <div style={{ fontSize:13, color:D.textSec, lineHeight:1.8, background:D.muted, borderRadius:D.radiusSm, padding:"12px 16px", border:`1px solid ${D.border}` }}>
                <div>E-mail: <b style={{color:D.text}}>{user?.email}</b></div>
                <div style={{ marginTop:6, fontSize:11, color:D.textMut }}>Para trocar a senha, use o painel do Firebase (Authentication → Users).</div>
              </div>
              <div style={{ marginTop:16, fontSize:12, color:D.textMut, fontFamily:D.fontBody, lineHeight:1.8 }}>
                <div>{condominio?.nome || "Condomínio"}</div>
                <div>MySindi · Versão 2.0 · Firebase + React</div>
              </div>
            </div>
          </div>
          </div>
        )}
      </main>

      {/* ── Modais ── */}
      {modal?.type === "pagar" && (
        <Modal title={`Registrar Pgto — ${modal.data.unidade}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <p style={{ fontSize:13, color:D.textSec, margin:"0 0 16px" }}>Morador: <b style={{color:D.text}}>{modal.data.nome}</b> · Taxa: <b style={{color:D.warning}}>R$ {taxa.toFixed(2).replace(".",",")}</b></p>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Observação</label>
          <input value={pagForm.obs} onChange={e=>setPagForm(p=>({...p,obs:e.target.value}))} placeholder="Ex: Pago via Pix" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:8, fontSize:14, marginTop:6, marginBottom:14, boxSizing:"border-box" }} />
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Comprovante</label>
          <div onClick={() => fileRef.current.click()} style={{ marginTop:6, border:`2px dashed ${D.border}`, borderRadius:8, padding:"18px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:D.textSec, fontSize:13 }}>
            {pagForm.arquivoNome ? <span style={{color:D.accent,fontWeight:600,display:"inline-flex",alignItems:"center",gap:6}}><NavIcon id="histDoc" size={14} /> {pagForm.arquivoNome}</span> : <><div style={{display:"flex",justifyContent:"center",marginBottom:6,color:D.textMut}}><NavIcon id="download" size={20} /></div>Toque para selecionar</>}
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
              <div style={{ display:"flex", justifyContent:"center", marginBottom:10, color:D.textMut }}><NavIcon id="histDoc" size={44} /></div>
              <p style={{ color:D.text, fontWeight:600, marginBottom:14 }}>{modal.data.arquivoNome||"comprovante.pdf"}</p>
              <a href={modal.data.comprovante} download={modal.data.arquivoNome||"comprovante.pdf"} style={{ padding:"10px 24px", background:"#2E6DA4", color:"#fff", borderRadius:8, textDecoration:"none", fontSize:13, fontWeight:600 }}>⬇ Baixar PDF</a>
            </div>
          ) : <p style={{ color:D.textSec, textAlign:"center" }}>Nenhum comprovante.</p>}
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

      {modal?.type === "novoAcordo" && (() => {
        const devedores = moradores.filter(m => cobrancas.some(c => c.moradorId === m.id && c.status !== "pago" && !c.acordoId));
        const sel = formAcordo.moradorId ? moradores.find(m => m.id === formAcordo.moradorId) : null;
        const emAberto = sel ? cobrancas.filter(c => c.moradorId === sel.id && c.status !== "pago" && !c.acordoId) : [];
        const totalDivida = emAberto.reduce((soma, c) => soma + encargosCobranca(c).valorTotal, 0);
        const entradaNum = valorValido(formAcordo.entrada) ? paraNumero(formAcordo.entrada) : 0;
        const n = parseInt(formAcordo.nParcelas) || 1;
        const valorParcela = totalDivida > entradaNum ? (totalDivida - entradaNum) / n : 0;
        return (
          <Modal title="Novo acordo de dívida" onClose={() => setModal(null)} isMobile={isMobile}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Morador *</label>
                <select value={formAcordo.moradorId} onChange={e=>setFormAcordo(p=>({...p,moradorId:e.target.value}))}
                  style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text, cursor:"pointer" }}>
                  <option value="">Selecione quem vai negociar</option>
                  {devedores.map(m => <option key={m.id} value={m.id}>{m.unidade} — {m.nome}</option>)}
                </select>
                {devedores.length === 0 && <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginTop:6 }}>Nenhum morador com cobrança em aberto.</div>}
              </div>

              {sel && (
                <div style={{ background:D.muted, borderRadius:D.radius, padding:"14px 16px" }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Dívida atual</div>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:22, fontWeight:700, color:D.danger, letterSpacing:"-0.02em" }}>R$ {totalDivida.toFixed(2).replace(".",",")}</div>
                  <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:4 }}>
                    {emAberto.length} cobrança(s): {emAberto.map(c => mesLabel(c.mes)).join(", ")}
                  </div>
                  <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textMut, marginTop:8, lineHeight:1.5 }}>
                    Multa e juros ficam congelados na data de hoje enquanto o acordo estiver em dia.
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:12, flexDirection: isMobile?"column":"row" }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Entrada (opcional)</label>
                  <input type="text" inputMode="decimal" value={formAcordo.entrada} onChange={e=>setFormAcordo(p=>({...p,entrada:e.target.value}))} placeholder="0,00"
                    style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Parcelas *</label>
                  <input type="number" min="1" max="36" value={formAcordo.nParcelas} onChange={e=>setFormAcordo(p=>({...p,nParcelas:e.target.value}))}
                    style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Vencimento da 1ª parcela *</label>
                <input type="date" value={formAcordo.primeiraData} onChange={e=>setFormAcordo(p=>({...p,primeiraData:e.target.value}))}
                  style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
                <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textMut, marginTop:6 }}>As demais vencem no mesmo dia dos meses seguintes.</div>
              </div>

              {sel && valorParcela > 0 && (
                <div style={{ background:D.successBg, border:`1px solid ${D.success}33`, borderRadius:D.radius, padding:"14px 16px" }}>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.text, lineHeight:1.6 }}>
                    {entradaNum > 0 && <>Entrada de <b>R$ {entradaNum.toFixed(2).replace(".",",")}</b> mais<br/></>}
                    <b>{n}x de aproximadamente R$ {valorParcela.toFixed(2).replace(".",",")}</b>
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexDirection: isMobile?"column-reverse":"row" }}>
                <button onClick={() => setModal(null)} style={{ padding:"11px 20px", background:D.bgCard, color:D.textSec, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
                <button onClick={criarAcordo} disabled={!sel} style={{ padding:"11px 22px", background: sel?D.primary:D.muted, color: sel?"#fff":D.textMut, border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor: sel?"pointer":"default", fontFamily:D.fontBody }}>Criar acordo</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {modal?.type === "novaManutencao" && (
        <Modal title="Nova rotina de manutenção" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>O que precisa ser feito *</label>
              <input value={novaManutencao.titulo} onChange={e=>setNovaManutencao(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Limpeza da caixa d'água"
                style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                {[
                  { t:"Limpeza da caixa d'água", p:"semestral" },
                  { t:"Dedetização", p:"semestral" },
                  { t:"Recarga de extintores", p:"anual" },
                  { t:"Inspeção do elevador", p:"mensal" },
                  { t:"Limpeza de calhas", p:"semestral" },
                ].map((sug,i) => (
                  <button key={i} onClick={() => setNovaManutencao(p => ({...p, titulo:sug.t, periodicidade:sug.p }))}
                    style={{ padding:"4px 11px", background:D.muted, color:D.textSec, border:`1px solid ${D.border}`, borderRadius:20, fontSize:11.5, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                    {sug.t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", gap:12, flexDirection: isMobile?"column":"row" }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>A cada quanto tempo *</label>
                <select value={novaManutencao.periodicidade} onChange={e=>setNovaManutencao(p=>({...p,periodicidade:e.target.value}))}
                  style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", background:"#fff", fontFamily:D.fontBody, color:D.text, cursor:"pointer" }}>
                  {PERIODICIDADES.map(pp => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Próxima execução *</label>
                <input type="date" value={novaManutencao.proximaData} onChange={e=>setNovaManutencao(p=>({...p,proximaData:e.target.value}))}
                  style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:6 }}>Responsável</label>
              <input value={novaManutencao.responsavel} onChange={e=>setNovaManutencao(p=>({...p,responsavel:e.target.value}))} placeholder="Empresa ou pessoa"
                style={{ display:"block", width:"100%", padding:"11px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
            </div>

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexDirection: isMobile?"column-reverse":"row" }}>
              <button onClick={() => setModal(null)} style={{ padding:"11px 20px", background:D.bgCard, color:D.textSec, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cancelar</button>
              <button onClick={salvarManutencao} style={{ padding:"11px 22px", background:D.primary, color:"#fff", border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>Cadastrar rotina</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === "importarMoradores" && (() => {
        const linhas = parsearPlanilha(importTexto);
        const comErros = linhas.map(l => ({ ...l, erros: validarLinhaImport(l, moradores, linhas) }));
        const validas = comErros.filter(l => l.erros.length === 0);
        const invalidas = comErros.filter(l => l.erros.length > 0);
        return (
          <Modal title="Importar moradores" onClose={() => { setImportTexto(""); setModal(null); }} isMobile={isMobile}>
            <p style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec, lineHeight:1.6, margin:"0 0 14px" }}>
              Cole as linhas direto do Excel ou Google Sheets (ou um CSV). A ordem das colunas deve ser:
            </p>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
              {["Unidade *","Nome *","E-mail *","Telefone","Tipo","Proprietário"].map((c,i) => (
                <span key={i} style={{ fontFamily:D.fontBody, fontSize:11.5, fontWeight:600, background: i<3?D.secondary:D.muted, color: i<3?D.text:D.textSec, padding:"4px 10px", borderRadius:20 }}>{c}</span>
              ))}
            </div>
            <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textMut, marginBottom:10 }}>
              Se a primeira linha for o cabeçalho da planilha, ela é ignorada automaticamente.
            </div>

            <textarea value={importTexto} onChange={e => setImportTexto(e.target.value)} rows={7}
              placeholder={"Apto 101\tMayara Silva\tmayara@email.com\t(85) 99999-8888\nApto 102\tJoão Souza\tjoao@email.com"}
              style={{ display:"block", width:"100%", padding:"12px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, boxSizing:"border-box", fontFamily:"monospace", color:D.text, resize:"vertical", lineHeight:1.6, marginBottom:14 }} />

            {linhas.length > 0 && (
              <>
                <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:12.5, fontWeight:600, color:D.success, background:D.successBg, padding:"5px 12px", borderRadius:20 }}>
                    <NavIcon id="logCheck" size={13} /> {validas.length} pronta{validas.length!==1?"s":""} para importar
                  </span>
                  {invalidas.length > 0 && (
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:D.fontBody, fontSize:12.5, fontWeight:600, color:D.danger, background:D.dangerBg, padding:"5px 12px", borderRadius:20 }}>
                      <NavIcon id="alerta" size={13} /> {invalidas.length} com problema
                    </span>
                  )}
                </div>

                <div style={{ maxHeight:220, overflowY:"auto", border:`1px solid ${D.border}`, borderRadius:D.radiusSm, marginBottom:16 }}>
                  {comErros.map((l,i) => {
                    const ok = l.erros.length === 0;
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderBottom: i<comErros.length-1?`1px solid ${D.border}`:"none", background: ok?"transparent":D.dangerBg }}>
                        <span style={{ color: ok?D.success:D.danger, display:"flex", flexShrink:0 }}><NavIcon id={ok?"logCheck":"alerta"} size={14} /></span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:D.fontBody, fontSize:12.5, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {l.unidade || "(sem unidade)"} — {l.nome || "(sem nome)"}
                          </div>
                          <div style={{ fontFamily:D.fontBody, fontSize:11.5, color: ok?D.textSec:D.danger }}>
                            {ok ? l.email : l.erros.join(" · ")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display:"flex", gap:10, flexDirection: isMobile?"column-reverse":"row", justifyContent:"flex-end" }}>
              <button onClick={() => { setImportTexto(""); setModal(null); }} style={{ padding:"11px 20px", background:D.bgCard, color:D.textSec, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                Cancelar
              </button>
              <button onClick={() => importarMoradores(validas)} disabled={validas.length === 0 || importando}
                style={{ padding:"11px 22px", background: validas.length?D.primary:D.muted, color: validas.length?"#fff":D.textMut, border:"none", borderRadius:D.radiusSm, fontSize:14, fontWeight:600, cursor: validas.length&&!importando?"pointer":"default", fontFamily:D.fontBody }}>
                {importando ? "Importando..." : validas.length ? `Importar ${validas.length} morador${validas.length!==1?"es":""}` : "Nada para importar"}
              </button>
            </div>
          </Modal>
        );
      })()}

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
              <input type="text" inputMode="decimal" value={novoMorador.taxaCustom} onChange={e=>setNovoMorador(p=>({...p,taxaCustom:e.target.value}))} placeholder={`Padrão: R$ ${taxa.toFixed(2).replace(".",",")}`} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
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
        // Tudo que pertence a esta unidade/morador
        const daUnidade = (r) => (r.moradorId && r.moradorId === m.id) || (r.unidade && m.unidade && normalizarTexto(r.unidade) === normalizarTexto(m.unidade));
        const acessosMor   = acessos.filter(daUnidade);
        const entregasMor  = entregas.filter(daUnidade);
        const reservasMorF = reservas.filter(daUnidade);
        const ocorrMor     = ocorrencias.filter(daUnidade);
        const secoes = [
          { id:"cobrancas",   label:"Cobranças",   n:cobMorador.length,   icon:"cobrancas"   },
          { id:"acessos",     label:"Acessos",     n:acessosMor.length,   icon:"acessos"     },
          { id:"entregas",    label:"Entregas",    n:entregasMor.length,  icon:"entregas"    },
          { id:"reservas",    label:"Reservas",    n:reservasMorF.length, icon:"reservas"    },
          { id:"ocorrencias", label:"Ocorrências", n:ocorrMor.length,     icon:"ocorrencias" },
        ];
        const sec = secoes.find(x => x.id === fichaSecao) ? fichaSecao : "cobrancas";
        const linhaSimples = (chave, titulo, sub, direita, corD, iconId) => (
          <div key={chave} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"11px 13px", background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:D.radiusSm }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:D.muted, color:D.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><NavIcon id={iconId} size={15} /></div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontFamily:D.fontBody, fontSize:13, fontWeight:600, color:D.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{titulo}</div>
                {sub && <div style={{ fontFamily:D.fontBody, fontSize:11.5, color:D.textSec }}>{sub}</div>}
              </div>
            </div>
            {direita && <span style={{ fontFamily:D.fontBody, fontSize:11.5, fontWeight:600, color:corD || D.textSec, flexShrink:0, whiteSpace:"nowrap" }}>{direita}</span>}
          </div>
        );
        return (
          <Modal title={`Histórico — ${m.nome}`} onClose={() => setModal(null)} isMobile={isMobile}>
            <div style={{ marginBottom:16, background:D.muted, borderRadius:D.radius, padding:"12px 16px", border:`1px solid ${D.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:D.text, fontWeight:600, fontFamily:D.fontBody }}>{m.unidade}</span>
                {m.tipo && <span style={{ background:D.secondary, color:D.primary, fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:12, fontFamily:D.fontBody }}>{m.tipo}</span>}
                {m.taxaCustom != null && <span style={{ background:D.warningBg, color:"#92400E", fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:12, fontFamily:D.fontBody }}>Taxa: R$ {Number(m.taxaCustom).toFixed(2).replace(".",",")}</span>}
              </div>
              <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:6, lineHeight:1.8 }}>
                {m.email}{m.telefone ? ` · ${m.telefone}` : ""}
                {m.veiculos ? <><br/>🚗 {m.veiculos}</> : ""}
                {m.pets ? <><br/>🐾 {m.pets}</> : ""}
              </div>
              <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
                <div style={{ fontSize:12 }}>✅ <b style={{color:"#2E7D32"}}>{totalPago}</b> pagamento{totalPago!==1?"s":""} em dia</div>
                <div style={{ fontSize:12 }}>🚨 <b style={{color:"#B03A2E"}}>{totalAtraso}</b> atraso{totalAtraso!==1?"s":""}</div>
                <div style={{ fontSize:12, display:"flex", alignItems:"center", gap:6 }}><span style={{ color:D.accent, display:"flex" }}><NavIcon id="histDoc" size={13} /></span> <b style={{color:D.text}}>{cobMorador.length}</b> meses no sistema</div>
              </div>
            </div>
            {/* Seções da ficha */}
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
              {secoes.map(x => {
                const ativo = sec === x.id;
                return (
                  <button key={x.id} onClick={() => setFichaSecao(x.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border: ativo?"none":`1px solid ${D.border}`, background: ativo?D.primary:D.bgCard, color: ativo?"#fff":D.textSec, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:D.fontBody }}>
                    <NavIcon id={x.icon} size={13} /> {x.label} <span style={{ opacity:.65 }}>{x.n}</span>
                  </button>
                );
              })}
            </div>

            {sec !== "cobrancas" && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight: isMobile ? "50vh" : "380px", overflowY:"auto" }}>
                {sec === "acessos" && (acessosMor.length === 0
                  ? <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:20, fontFamily:D.fontBody }}>Nenhum acesso registrado para esta unidade.</div>
                  : acessosMor.map(a => linhaSimples(a.id, a.nome, `${a.empresa ? a.empresa+" · " : ""}${a.motivo}`, a.horaSaida ? `${a.dataEntrada}` : "No condomínio", a.horaSaida ? D.textSec : D.warning, "acPorta")))}

                {sec === "entregas" && (entregasMor.length === 0
                  ? <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:20, fontFamily:D.fontBody }}>Nenhuma encomenda para esta unidade.</div>
                  : entregasMor.map(e => linhaSimples(e.id, e.descricao, e.remetente ? `Remetente: ${e.remetente}` : e.dataChegada, e.status === "retirada" ? "Retirada" : "Aguardando", e.status === "retirada" ? D.success : D.warning, "entregas")))}

                {sec === "reservas" && (reservasMorF.length === 0
                  ? <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:20, fontFamily:D.fontBody }}>Nenhuma reserva desta unidade.</div>
                  : reservasMorF.map(r => linhaSimples(r.id, r.area, `${r.data}${r.horario ? " · "+r.horario : ""}`, r.status === "aprovada" ? "Aprovada" : r.status === "rejeitada" ? "Rejeitada" : "Pendente", r.status === "aprovada" ? D.success : r.status === "rejeitada" ? D.danger : D.warning, "reservas")))}

                {sec === "ocorrencias" && (ocorrMor.length === 0
                  ? <div style={{ color:D.textMut, fontSize:13, textAlign:"center", padding:20, fontFamily:D.fontBody }}>Nenhuma ocorrência desta unidade.</div>
                  : ocorrMor.map(o => linhaSimples(o.id, o.titulo, o.criadoEm, o.status === "resolvida" ? "Resolvida" : o.status === "em_andamento" ? "Em andamento" : "Aberta", o.status === "resolvida" ? D.success : o.status === "em_andamento" ? D.accent : D.warning, "ocorrencias")))}
              </div>
            )}

            {sec === "cobrancas" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight: isMobile ? "50vh" : "380px", overflowY:"auto" }}>
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
                      <div style={{ fontWeight:700, color:D.text, fontSize:13 }}>{mesLabel(c.mes)}</div>
                      {c.dataPagamento && <div style={{ fontSize:11, color:D.textSec, marginTop:2 }}>Pago em {c.dataPagamento}</div>}
                      {c.obs && <div style={{ fontSize:11, color:D.textSec, marginTop:2 }}>📝 {c.obs}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                      <span style={{ fontSize:16 }}>{icone}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:corBorda, textTransform:"capitalize" }}>{c.status}</span>
                      <span style={{ fontSize:12, color:D.text, fontWeight:600 }}>R$ {taxa.toFixed(2).replace(".",",")}</span>
                      {c.status === "pago" && (
                        <button onClick={() => gerarReciboPDF(m, c.dataPagamento, c.obs, { mesSel: c.mes, taxa, nomeCondominio: nomeCond(), logo: logoCond })} style={{ fontSize:11, padding:"3px 8px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, cursor:"pointer", fontWeight:600, marginTop:2 }}>
                          📄 Recibo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
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
              <input type="text" inputMode="decimal" value={editMorador.taxaCustom} onChange={e=>setEditMorador(p=>({...p,taxaCustom:e.target.value}))} placeholder={`Padrão: R$ ${taxa.toFixed(2).replace(".",",")}`} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
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
                <span style={{display:"flex",color:D.accent}}><NavIcon id="emails" size={14} /></span> O morador será notificado por e-mail automaticamente (se tiver e-mail cadastrado).
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
                <input type="text" inputMode="decimal" value={novaReceita.valor} onChange={e=>setNovaReceita(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
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
        const valorInf = paraNumero(novaCobExtra.valor) || 0;
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
                <input type="text" inputMode="decimal" value={novaCobExtra.valor} onChange={e=>setNovaCobExtra(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
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
              <input type="text" inputMode="decimal" value={novaMovFundo.valor} onChange={e=>setNovaMovFundo(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, boxSizing:"border-box", fontFamily:D.fontBody, color:D.text }} />
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
            <label style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:D.muted, borderRadius:D.radiusSm, cursor:"pointer", marginBottom:16 }}>
              <input type="checkbox" checked={!!novoDocumento.publico} onChange={e=>setNovoDocumento(p=>({...p,publico:e.target.checked}))} style={{ width:17, height:17, cursor:"pointer", accentColor:D.primary, flexShrink:0 }} />
              <span style={{ minWidth:0 }}>
                <span style={{ display:"block", fontFamily:D.fontBody, fontSize:13.5, fontWeight:600, color:D.text }}>Visível para os moradores</span>
                <span style={{ display:"block", fontFamily:D.fontBody, fontSize:11.5, color:D.textSec, marginTop:2 }}>Aparece no portal para consulta e download. Use para convenção, regimento e atas.</span>
              </span>
            </label>
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
          <input value={novaDespesa.descricao} onChange={e=>setNovaDespesa(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Conta Enel Jun" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box", fontFamily:D.fontBody }} />
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Valor *</label>
              <input type="text" inputMode="decimal" value={novaDespesa.valor} onChange={e=>setNovaDespesa(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text, fontFamily:D.fontBody }} />
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
          <div onClick={() => fileRefDespesa.current.click()} style={{ marginTop:6, border:`2px dashed ${D.border}`, borderRadius:8, padding:"16px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:D.textSec, fontSize:13 }}>
            {novaDespesa.arquivoNome ? <span style={{color:D.accent,fontWeight:600,display:"inline-flex",alignItems:"center",gap:6}}><NavIcon id="histDoc" size={14} /> {novaDespesa.arquivoNome}</span> : <>📁 Toque para selecionar</>}
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
          <input value={novoServico.titulo} onChange={e=>setNovoServico(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Consertar o portão" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box" }} />
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
              <input type="text" inputMode="decimal" value={concluirForm.valorMaterial} onChange={e=>setConcluirForm(p=>({...p,valorMaterial:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Mão de obra (R$)</label>
              <input type="text" inputMode="decimal" value={concluirForm.valorMaoDeObra} onChange={e=>setConcluirForm(p=>({...p,valorMaoDeObra:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
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

      {toast && <Toast msg={toast.msg} type={toast.type} acao={toast.acao} rotuloAcao={toast.rotuloAcao} onClose={() => setToast(null)} />}
    </div>
  );
}
