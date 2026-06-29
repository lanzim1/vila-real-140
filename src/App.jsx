import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
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

const modoVisitante = typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("visualizar") === "1";

const portalMoradorId = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("morador")
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
  bgApp:       "#F4F6FB",   // --background oklch(0.985 0.004 250)
  bgCard:      "#FFFFFF",   // --card

  // Text
  text:        "#1A2744",   // --foreground oklch(0.22 0.05 260)
  textSec:     "#6B7A9E",   // --muted-foreground oklch(0.52 0.04 256)
  textMut:     "#9AA5C0",

  // Brand
  primary:     "#1E3A72",   // --primary oklch(0.32 0.09 258) — botões primários
  primaryFg:   "#F8F9FC",   // --primary-foreground
  accent:      "#4B72C4",   // --accent oklch(0.6 0.11 250) — ativo, gráficos
  secondary:   "#E8EDF7",   // --secondary
  muted:       "#EEF1F8",   // --muted

  // Semantic
  success:     "#22A26B",   // --success oklch(0.62 0.14 155)
  successBg:   "#DCFDF0",
  warning:     "#B87200",   // --warning-foreground oklch(0.28 0.06 70)
  warningBg:   "#FEF3C7",   // --warning oklch(0.78 0.15 75) bg
  danger:      "#E03A22",   // --destructive oklch(0.58 0.21 25)
  dangerBg:    "#FEE8E4",

  // UI
  border:      "#DDE3EF",   // --border oklch(0.9 0.015 252)
  ring:        "#4B72C4",   // --ring

  // Sidebar (oklch values conforme design system)
  sidebar:     "#1C2D5E",   // --sidebar oklch(0.27 0.07 260)
  sidebarHov:  "#253875",   // --sidebar-accent oklch(0.33 0.07 260)
  sidebarAct:  "rgba(75,114,196,0.2)",
  sidebarActBdr:"#4B72C4",  // --sidebar-primary
  sidebarFg:   "#E2E8F5",   // --sidebar-foreground
  sidebarBdr:  "#2E4380",   // --sidebar-border

  // Deprecated (mantidos para compatibilidade de código legado)
  gold:        "#B87200",
  primaryDk:   "#162E5C",

  // Shadows
  shadow:    "0 1px 3px rgba(30,42,100,.06), 0 2px 8px rgba(30,42,100,.05)",
  shadowMd:  "0 4px 16px rgba(30,42,100,.1), 0 8px 32px rgba(30,42,100,.07)",

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


// ── Top Bar ──
const TopBar = ({ title, user, readOnly, nPendentes }) => {
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  return (
    <div style={{ background:D.bgCard, borderBottom:`1px solid ${D.border}`, padding:"14px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
      <div>
        <h1 style={{ fontFamily:D.fontDisplay, fontSize:20, fontWeight:600, color:D.text, margin:0, letterSpacing:"-0.02em" }}>{title}</h1>
        <p style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, margin:"2px 0 0", textTransform:"capitalize" }}>{hoje}</p>
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

// ── Login ──
const Login = () => {
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [verPass, setVerPass] = useState(false);
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr("");
    if (!email || !pass) { setErr("Preencha e-mail e senha."); return; }
    setLoading(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), pass); }
    catch (e) { setErr("E-mail ou senha incorretos."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:D.sidebar, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:D.fontBody, padding:16, position:"relative", overflow:"hidden" }}>
      {/* Padrão decorativo */}
      <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(circle at 20% 20%, rgba(13,148,136,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(13,148,136,0.1) 0%, transparent 50%)`, pointerEvents:"none" }} />
      <div style={{ background:"#fff", borderRadius:20, padding:"40px 36px", width:"100%", maxWidth:420, boxShadow:"0 32px 80px rgba(0,0,0,0.4)", position:"relative" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:`linear-gradient(135deg, ${D.primary}, ${D.primaryDk})`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:`0 8px 24px rgba(13,148,136,0.35)` }}>
            <span style={{ color:"#fff", fontFamily:D.fontDisplay, fontSize:22, fontWeight:700 }}>VR</span>
          </div>
          <h1 style={{ fontFamily:D.fontDisplay, fontSize:24, color:D.text, margin:0, fontWeight:700, letterSpacing:"-0.02em" }}>Vila Real 140</h1>
          <p style={{ color:D.textSec, fontSize:13, margin:"6px 0 0", letterSpacing:".2px" }}>Sistema de Gestão Condominial</p>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:700, color:D.textSec, marginBottom:7, textTransform:"uppercase", letterSpacing:1 }}>E-mail</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="seu@email.com" style={{ width:"100%", padding:"12px 14px", border:`1.5px solid ${D.border}`, borderRadius:10, fontSize:15, color:D.text, outline:"none", boxSizing:"border-box", transition:"border .2s" }} onFocus={e=>e.target.style.borderColor=D.primary} onBlur={e=>e.target.style.borderColor=D.border} />
        </div>
        <div style={{ marginBottom:24 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:700, color:D.textSec, marginBottom:7, textTransform:"uppercase", letterSpacing:1 }}>Senha</label>
          <div style={{ position:"relative" }}>
            <input type={verPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{ width:"100%", padding:"12px 44px 12px 14px", border:`1.5px solid ${D.border}`, borderRadius:10, fontSize:15, color:D.text, outline:"none", boxSizing:"border-box", transition:"border .2s" }} onFocus={e=>e.target.style.borderColor=D.primary} onBlur={e=>e.target.style.borderColor=D.border} />
            <button type="button" onClick={()=>setVerPass(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:17, padding:4, lineHeight:1, color:D.textMut }}>
              {verPass?"🙈":"👁️"}
            </button>
          </div>
        </div>
        {err && <div style={{ background:"#FEE2E2", color:"#991B1B", fontSize:13, padding:"10px 14px", borderRadius:8, marginBottom:16, textAlign:"center" }}>{err}</div>}
        <button onClick={handle} disabled={loading} style={{ width:"100%", padding:"14px", background:`linear-gradient(135deg, ${D.primary}, ${D.primaryDk})`, color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor: loading?"default":"pointer", opacity: loading?.75:1, letterSpacing:".3px", boxShadow:`0 4px 16px rgba(13,148,136,0.35)` }}>
          {loading?"Verificando...":"Entrar"}
        </button>
        <p style={{ textAlign:"center", fontSize:11, color:D.textMut, margin:"20px 0 0" }}>Condomínio Vila Real 140 · Sistema Privado</p>
      </div>
    </div>
  );
};

// ── App Principal ──
// ── Portal do Morador ──
function PortalMorador({ moradorId, db, taxa, mesLabel, mesAtual }) {
  const [morador, setMorador]   = useState(null);
  const [cobrancas, setCobrancas] = useState([]);
  const [mesSel, setMesSel]     = useState(mesAtual());
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
    return () => { u1(); u2(); };
  }, [moradorId]);

  if (!morador) return (
    <div style={{ minHeight:"100vh", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontFamily:D.fontBody }}>
      Carregando...
    </div>
  );

  const cobMes    = cobrancas.find(c => c.mes === mesSel);
  const totalPago = cobrancas.filter(c => c.status === "pago").length;
  const meses     = [...new Set(cobrancas.map(c => c.mes))].sort().reverse();
  const statusCor = cobMes?.status === "pago" ? "#2E7D32" : cobMes?.status === "atrasado" ? "#B03A2E" : "#F57F17";

  return (
    <div style={{ minHeight:"100vh", background:"#F0F4F8", fontFamily:D.fontBody }}>
      {/* Cabeçalho */}
      <div style={{ background:`linear-gradient(135deg, ${D.sidebar}, ${D.primary})`, padding: isMobile ? "24px 20px" : "32px 40px", color:"#fff" }}>
        <div style={{ fontSize:13, opacity:.7, marginBottom:6 }}>🏢 Condomínio Vila Real 140</div>
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
                <div style={{ fontSize:13, color:"#6B7A8D", marginTop:4 }}>Taxa: R$ {taxa.toFixed(2).replace(".",",")}</div>
                {cobMes.dataPagamento && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>Pago em {cobMes.dataPagamento}</div>}
                {cobMes.obs && <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>📝 {cobMes.obs}</div>}
              </div>
              <div style={{ fontSize:40, opacity:.3 }}>{cobMes.status==="pago"?"✅":cobMes.status==="atrasado"?"🚨":"⏳"}</div>
            </div>
          ) : (
            <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:16 }}>Nenhum registro para este mês.</div>
          )}
        </div>

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
              return (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background: c.status==="pago"?D.successBg:c.status==="atrasado"?D.dangerBg:D.warningBg, borderRadius:D.radiusSm, borderLeft:`4px solid ${cor}` }}>
                  <div>
                    <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:13 }}>{mesLabel(c.mes)}</div>
                    {c.dataPagamento && <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>Pago em {c.dataPagamento}</div>}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:cor, textTransform:"capitalize" }}>{c.status}</div>
                    <div style={{ fontSize:12, color:"#1E3A5F" }}>R$ {taxa.toFixed(2).replace(".",",")}</div>
                  </div>
                </div>
              );
            })}
            {cobrancas.length === 0 && <div style={{ color:"#9aa6b5", fontSize:13, textAlign:"center", padding:16 }}>Nenhum registro encontrado.</div>}
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:24, fontSize:11, color:D.textMut, fontFamily:D.fontBody }}>
          Vila Real 140 · Portal do Morador · Acesso somente leitura
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [user, setUser]             = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [aba, setAba]               = useState("dashboard");
  const [moradores, setMoradores]   = useState([]);
  const [cobrancas, setCobrancas]   = useState([]);
  const [taxa, setTaxa]             = useState(180);
  const [diaVencimento, setDiaVencimento] = useState(10);
  const [enviandoEmails, setEnviandoEmails] = useState(false);
  const [mesSel, setMesSel]         = useState(mesAtual);
  const [toast, setToast]           = useState(null);
  const [modal, setModal]           = useState(null);
  const [novoMorador, setNovoMorador] = useState({ nome:"", unidade:"", email:"", telefone:"" });
  const [editMorador, setEditMorador] = useState(null); // { id, nome, unidade, email, telefone }
  const [pagForm, setPagForm]         = useState({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
  const [despesas, setDespesas]       = useState([]);
  const [novaDespesa, setNovaDespesa] = useState({ tipo:"agua", descricao:"", valor:"", mes: mesAtual(), arquivo:null, arquivoNome:"" });
  const [servicos, setServicos]       = useState([]);
  const [novoServico, setNovoServico] = useState({ titulo:"", descricao:"" });
  const [concluirForm, setConcluirForm] = useState({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" });
  const [obsMes, setObsMes]     = useState("");
  const [obsSalva, setObsSalva] = useState("");
  const [logs, setLogs]         = useState([]);
  const [acessos, setAcessos]   = useState([]);
  const [novoAcesso, setNovoAcesso] = useState({ nome:"", empresa:"", motivo:"", unidade:"", dataEntrada:"", horaEntrada:"", horaSaida:"" });
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

  // ── Firestore listeners ──
  useEffect(() => {
    if (!user) return;
    const u1 = onSnapshot(collection(db, "moradores"), s => setMoradores(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, "cobrancas"), s => setCobrancas(s.docs.map(d => d.data())));
    const u3 = onSnapshot(doc(db, "config", "geral"),  d => {
      if (d.exists()) {
        setTaxa(d.data().taxa ?? 180);
        setDiaVencimento(d.data().diaVencimento ?? 10);
      }
    });
    const u4 = onSnapshot(collection(db, "despesas"),  s => setDespesas(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u5 = onSnapshot(collection(db, "servicos"),  s => setServicos(s.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u6 = onSnapshot(doc(db, "observacoes", mesSel), d => {
      const texto = d.exists() ? (d.data().texto || "") : "";
      setObsMes(texto); setObsSalva(texto);
    });
    const u7 = onSnapshot(
      query(collection(db, "logs")),
      s => setLogs(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    const u8 = onSnapshot(collection(db, "acessos"),
      s => setAcessos(s.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp))
    );
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, [user]);

  // ── Popular na primeira vez ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(collection(db, "moradores"));
      if (snap.empty) {
        const batch = writeBatch(db);
        MOCK_MORADORES.forEach(m => {
          const ref = doc(collection(db, "moradores"));
          batch.set(ref, m);
          batch.set(doc(db, "cobrancas", `${ref.id}_${mesAtual()}`), { moradorId:ref.id, mes:mesAtual(), status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
        });
        await batch.commit();
      }
    })();
  }, [user]);

  const showToast = (msg, type="success") => setToast({ msg, type });

  const registrarLog = async (icone, descricao) => {
    try {
      await addDoc(collection(db, "logs"), {
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
  const totalArrecadado = pagos * taxa;
  const totalPendente   = nPagos * taxa;

  const totalEntradas        = cobrancas.filter(c => c.status === "pago").length * taxa;
  const totalSaidasDespesas  = despesas.filter(d => d.status === "pago").reduce((s,d) => s+(d.valor||0), 0);
  const totalSaidasServicos  = servicos.filter(s => s.status === "concluido").reduce((s,sv) => s+(sv.valorMaterial||0)+(sv.valorMaoDeObra||0), 0);
  const saldoCaixa = totalEntradas - totalSaidasDespesas - totalSaidasServicos;

  const garantirMes = async (mes) => {
    const existentes = new Set(cobrancas.filter(c => c.mes === mes).map(c => c.moradorId));
    const batch = writeBatch(db); let mudou = false;
    moradores.forEach(m => {
      if (!existentes.has(m.id)) { batch.set(doc(db, "cobrancas", `${m.id}_${mes}`), { moradorId:m.id, mes, status:"pendente", comprovante:null, dataPagamento:null, obs:"" }); mudou=true; }
    });
    if (mudou) await batch.commit();
  };

  // ── Marcar cobranças vencidas como "atrasado" ──
  const atualizarAtrasados = async () => {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const batch = writeBatch(db);
    let mudou = false;
    cobrancas.forEach(c => {
      if (c.status !== "pendente") return;
      const venc = dataVencimentoMes(c.mes);
      venc.setHours(0,0,0,0);
      if (hoje > venc) {
        batch.set(doc(db, "cobrancas", `${c.moradorId}_${c.mes}`), { status:"atrasado" }, { merge:true });
        mudou = true;
      }
    });
    if (mudou) await batch.commit();
  };

  useEffect(() => {
    if (user && moradores.length > 0) {
      garantirMes(mesSel);
      atualizarAtrasados();
    }
  }, [user, moradores.length, cobrancas.length, diaVencimento]);

  const mudarMes = async (m) => {
    setMesSel(m);
    garantirMes(m);
    const snap = await getDoc(doc(db, "observacoes", m));
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
      await setDoc(doc(db, "cobrancas", `${moradorId}_${mesSel}`), { moradorId, mes:mesSel, status:"pago", dataPagamento:dataPgto, obs:pagForm.obs, comprovante:base64, arquivoNome:pagForm.arquivoNome }, { merge:true });
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
    await setDoc(doc(db, "cobrancas", `${moradorId}_${mesSel}`), { moradorId, mes:mesSel, status:novoStatus, dataPagamento:null, obs:"", comprovante:null, arquivoNome:"" }, { merge:true });
    const m = moradores.find(x => x.id === moradorId);
    registrarLog("↩️", `Pagamento estornado: ${m?.nome || moradorId} (${m?.unidade || ""}) — ${mesLabel(mesSel)}`);
    setModal(null); showToast("Pagamento estornado.", "error");
  };

  // ── Moradores ──
  const adicionarMorador = async () => {
    if (!novoMorador.nome || !novoMorador.unidade || !novoMorador.email) { showToast("Preencha nome, unidade e e-mail.", "error"); return; }
    const ref = await addDoc(collection(db, "moradores"), novoMorador);
    await setDoc(doc(db, "cobrancas", `${ref.id}_${mesSel}`), { moradorId:ref.id, mes:mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
    registrarLog("👤", `Morador cadastrado: ${novoMorador.nome} (${novoMorador.unidade})`);
    setNovoMorador({ nome:"", unidade:"", email:"", telefone:"" }); setModal(null); showToast("Morador cadastrado!");
  };

  const removerMorador = async (id) => {
    await deleteDoc(doc(db, "moradores", id));
    const snap = await getDocs(query(collection(db, "cobrancas"), where("moradorId","==",id)));
    const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    registrarLog("🗑️", `Morador removido: ID ${id}`);
    showToast("Morador removido.", "error");
  };

  const salvarEdicaoMorador = async () => {
    if (!editMorador.nome || !editMorador.unidade || !editMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const { id, ...dados } = editMorador;
    await setDoc(doc(db, "moradores", id), dados, { merge:true });
    registrarLog("✏️", `Morador editado: ${editMorador.nome} (${editMorador.unidade})`);
    setEditMorador(null); setModal(null); showToast("Morador atualizado com sucesso!");
  };

  // ── Despesas ──
  const adicionarDespesa = () => {
    if (!novaDespesa.valor || !novaDespesa.mes) { showToast("Preencha o valor e o mês.", "error"); return; }
    const salvar = async (base64="") => {
      await addDoc(collection(db, "despesas"), { tipo:novaDespesa.tipo, descricao:novaDespesa.descricao, valor:parseFloat(novaDespesa.valor)||0, mes:novaDespesa.mes, status:"pendente", dataPagamento:null, comprovante:base64, arquivoNome:novaDespesa.arquivoNome });
      registrarLog("💧", `Despesa registrada: ${novaDespesa.descricao||novaDespesa.tipo} — R$ ${novaDespesa.valor} (${mesLabel(novaDespesa.mes)})`);
      setNovaDespesa({ tipo:"agua", descricao:"", valor:"", mes:mesAtual(), arquivo:null, arquivoNome:"" }); setModal(null); showToast("Despesa registrada!");
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
    await addDoc(collection(db,"servicos"), { titulo:novoServico.titulo, descricao:novoServico.descricao, status:"pendente", dataAbertura:new Date().toLocaleDateString("pt-BR"), dataInicio:null, dataFim:null, valorMaterial:null, valorMaoDeObra:null, obsConclusao:"" });
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

  const enviarLembretes = () => {
    const dev = cobMes.filter(c=>c.status!=="pago").map(c=>moradores.find(m=>m.id===c.moradorId)).filter(Boolean);
    if (!dev.length) { showToast("Todos já pagaram!"); return; }
    showToast(`📧 Lembretes para ${dev.length} morador(es): ${dev.map(d=>`${d.nome}`).join(", ")}`);
  };

  const salvarTaxa = async (v) => { await setDoc(doc(db,"config","geral"), { taxa:v }, { merge:true }); showToast("Taxa atualizada!"); };

  const salvarObsMes = async () => {
    await setDoc(doc(db, "observacoes", mesSel), { texto: obsMes, mes: mesSel, atualizadoEm: new Date().toLocaleString("pt-BR") }, { merge:true });
    setObsSalva(obsMes);
    showToast("Observação salva!");
  };

  const salvarDiaVencimento = async (v) => {
    await setDoc(doc(db,"config","geral"), { diaVencimento: parseInt(v) }, { merge:true });
    showToast("Dia de vencimento salvo!");
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
    await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
      nome_morador:    morador.nome,
      unidade:         morador.unidade,
      valor:           taxa.toFixed(2).replace(".",","),
      data_vencimento: formatarDataBR(dataVencimentoMes(mesSel)),
      assunto,
      mensagem,
      email_destino:   morador.email,
    });
  };

  const dispararEmails = async (tipo) => {
    // tipo: "lembrete" (5 dias antes) ou "vencimento" (dia do vencimento)
    setEnviandoEmails(true);
    const chave = `${mesSel}_${tipo}`;
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
        tipo, mes: mesSel, dataEnvio: new Date().toLocaleDateString("pt-BR"),
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
    const hoje     = new Date();
    const venc     = dataVencimentoMes(mesSel);
    const diffDias = Math.round((venc - hoje) / (1000*60*60*24));

    if (diffDias === 5) {
      dispararEmails("lembrete");
    } else if (diffDias === 0) {
      dispararEmails("vencimento");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, moradores.length, diaVencimento]);

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
      body: despesas.filter(d=>d.mes===mesSel).map(d=>[d.tipo==="agua"?"Água":d.tipo==="luz"?"Luz":"Outro",d.descricao||"—",`R$ ${d.valor.toFixed(2).replace(".",",")}`,d.status==="pago"?"Pago":"Pendente"]),
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
        d.tipo==="agua"?"Agua":d.tipo==="luz"?"Luz":"Outro",
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

  const navItems = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças"  },
    { id:"moradores", icon:"👥", label:"Moradores"  },
    { id:"despesas",  icon:"💧", label:"Água/Luz"   },
    { id:"servicos",  icon:"🔧", label:"Serviços"   },
    { id:"acessos",   icon:"🚪", label:"Acessos"    },
    { id:"historico", icon:"📋", label:"Histórico"  },
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

  if (!user) return <Login />;

  // ── Portal do morador (link individual) ──
  if (portalMoradorId && user) {
    return <PortalMorador moradorId={portalMoradorId} db={db} taxa={taxa} mesLabel={mesLabel} mesAtual={mesAtual} />;
  }

  // ── helpers de estilo responsivo ──
  const h2size = isMobile ? 20 : 22;
  const pad    = isMobile ? "16px 16px 100px" : "24px 28px 40px"; // mantido por compatibilidade

  // ── Cobranças: renderiza cards no mobile, tabela no desktop ──
  const CobCard = ({ cob }) => {
    const m = moradores.find(x => x.id === cob.moradorId);
    if (!m) return null;
    return (
      <div style={{ background:D.bgCard, borderRadius:D.radius, padding:16, boxShadow:D.shadow, border:`1px solid ${D.border}`, borderLeft:`3px solid ${cob.status==="pago"?D.success:cob.status==="atrasado"?D.danger:D.warning}`, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <div>
            <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{m.unidade} — {m.nome}</div>
            <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:2 }}>{m.email}</div>
          </div>
          <Badge status={cob.status} />
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
          <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{d.tipo==="agua"?"💧":d.tipo==="luz"?"⚡":"📦"} {d.descricao || (d.tipo==="agua"?"Conta de água":d.tipo==="luz"?"Conta de luz":"Outra despesa")}</div>
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
                <span style={{ color:"#fff", fontFamily:D.fontDisplay, fontSize:13, fontWeight:700 }}>VR</span>
              </div>
              <div>
                <div style={{ fontFamily:D.fontDisplay, fontSize:14, color:D.sidebarFg, fontWeight:600, letterSpacing:"-0.02em", lineHeight:1.2 }}>Vila Real 140</div>
                <div style={{ fontFamily:D.fontBody, fontSize:11, color:"rgba(226,232,245,0.4)", marginTop:1 }}>Gestão Condominial</div>
              </div>
            </div>
          </div>
          {/* Nav */}
          <nav style={{ flex:1, padding:"8px 10px" }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setAba(n.id)} style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 11px", background: aba===n.id ? D.sidebarAct : "transparent", border:"none", cursor:"pointer", color: aba===n.id ? "#fff" : "rgba(226,232,245,0.5)", fontFamily:D.fontBody, fontSize:13, fontWeight: aba===n.id ? 600 : 500, textAlign:"left", borderRadius:8, marginBottom:1, outline:"none", borderLeft: aba===n.id ? `2px solid ${D.sidebarActBdr}` : "2px solid transparent" }}>
                <span style={{ fontSize:15, minWidth:18, textAlign:"center", opacity: aba===n.id?1:.65 }}>{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>
          {/* Bottom */}
          <div style={{ padding:"10px 10px 18px", borderTop:`1px solid ${D.sidebarBdr}` }}>
            <div style={{ background:"rgba(255,255,255,.05)", borderRadius:8, padding:"8px 11px", marginBottom:8 }}>
              <div style={{ fontFamily:D.fontBody, fontSize:10, color:"rgba(226,232,245,0.35)", textTransform:"uppercase", letterSpacing:".8px", marginBottom:2 }}>Conta ativa</div>
              <div style={{ fontFamily:D.fontBody, fontSize:11, color:"rgba(226,232,245,0.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.email}</div>
            </div>
            {readOnly ? (
              <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin + window.location.pathname; }} style={{ width:"100%", padding:"8px 11px", background:"rgba(184,114,0,.15)", border:`1px solid rgba(184,114,0,.3)`, borderRadius:8, color:"#FCD34D", fontFamily:D.fontBody, fontSize:11.5, fontWeight:500, textAlign:"center", cursor:"pointer" }}>
                👁️ Modo Visualização — Sair
              </button>
            ) : (
              <button onClick={() => signOut(auth)} style={{ width:"100%", padding:"8px 11px", background:"rgba(224,58,34,.12)", border:`1px solid rgba(224,58,34,.22)`, borderRadius:8, color:"#FCA5A5", cursor:"pointer", fontFamily:D.fontBody, fontSize:12, fontWeight:500 }}>Sair</button>
            )}
          </div>
        </aside>
      )}

      {/* ── Barra de navegação inferior (mobile) ── */}
      {isMobile && (
        <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:D.sidebar, display:"flex", zIndex:500, boxShadow:`0 -1px 0 ${D.sidebarBdr}, 0 -4px 16px rgba(28,45,94,.4)`, paddingBottom:"env(safe-area-inset-bottom,0)" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setAba(n.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color: aba===n.id ? D.accent : "rgba(226,232,245,0.4)", borderTop: aba===n.id ? `2px solid ${D.accent}` : "2px solid transparent", fontFamily:D.fontBody }}>
              <span style={{ fontSize:18 }}>{n.icon}</span>
              <span style={{ fontSize:9.5, fontWeight: aba===n.id ? 600 : 400 }}>{n.label}</span>
            </button>
          ))}
          {readOnly ? (
            <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin+window.location.pathname; }} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:"rgba(252,211,77,.8)", borderTop:"2px solid transparent" }}>
              <span style={{ fontSize:19 }}>👁️</span>
              <span style={{ fontSize:9.5 }}>Sair</span>
            </button>
          ) : (
            <button onClick={() => signOut(auth)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 2px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:"rgba(252,165,165,.8)", borderTop:"2px solid transparent" }}>
              <span style={{ fontSize:19 }}>🚪</span>
              <span style={{ fontSize:9.5 }}>Sair</span>
            </button>
          )}
        </nav>
      )}

      {/* ── Conteúdo ── */}
      <main style={{ flex:1, overflow:"auto", background:D.bgApp }}>

        {/* ── Dashboard ── */}
        {aba === "dashboard" && (
          <div>
            <TopBar title="Visão Geral" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile ? "20px 16px 100px" : "24px 28px 40px" }}>

              {/* Stat Cards */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap:16, marginBottom:24 }}>
                {[
                  {
                    icon:"💰", iconBg:"#DCFDF0", iconColor:D.success,
                    label:"Receita do mês", valor:`R$ ${totalArrecadado.toFixed(2).replace(".",",")}`,
                    change: moradores.length ? `↑ ${Math.round((pagos/moradores.length)*100)}% adimpl.` : "—",
                    changeColor: D.success,
                  },
                  {
                    icon:"⚠️", iconBg:"#FEF3C7", iconColor:D.warning,
                    label:"Inadimplência", valor: moradores.length ? `${Math.round((nPagos/moradores.length)*100)}%` : "0%",
                    change: nPagos > 0 ? `↓ ${nPagos} unid.` : "✓ Em dia",
                    changeColor: nPagos > 0 ? D.danger : D.success,
                  },
                  {
                    icon:"👥", iconBg:D.secondary, iconColor:D.accent,
                    label:"Unidades ativas", valor:`${pagos} / ${moradores.length}`,
                    change:`${atrasados} atrasada${atrasados!==1?"s":""}`,
                    changeColor: atrasados > 0 ? D.danger : D.success,
                  },
                  {
                    icon:"💼", iconBg: saldoCaixa>=0 ? "#DCFDF0" : "#FEE8E4", iconColor: saldoCaixa>=0 ? D.success : D.danger,
                    label:"Saldo de caixa", valor:`R$ ${saldoCaixa.toFixed(2).replace(".",",")}`,
                    change: saldoCaixa>=0 ? "↑ Positivo" : "↓ Negativo",
                    changeColor: saldoCaixa>=0 ? D.success : D.danger,
                  },
                ].map((c,i) => (
                  <div key={i} style={{ background:D.bgCard, borderRadius:D.radius, padding:"20px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:c.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                        {c.icon}
                      </div>
                      <span style={{ fontFamily:D.fontBody, fontSize:12, fontWeight:600, color:c.changeColor }}>{c.change}</span>
                    </div>
                    <div style={{ fontFamily:D.fontDisplay, fontSize: isMobile?20:24, fontWeight:700, color:D.text, letterSpacing:"-0.02em", marginBottom:4 }}>{c.valor}</div>
                    <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Linha: Gráfico + Atividade Recente */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"2fr 1fr", gap:16, marginBottom:24 }}>

                {/* Fluxo Financeiro */}
                {(() => {
                  const anoAtual = new Date().getFullYear();
                  const mesesAno = Array.from({length:6}, (_,i) => {
                    const d = new Date(); d.setMonth(d.getMonth()-5+i);
                    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
                  });
                  const labels6 = mesesAno.map(m => {
                    const [,mo] = m.split("-");
                    return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1];
                  });
                  const dados6 = mesesAno.map(m => {
                    const entrada = cobrancas.filter(c=>c.mes===m&&c.status==="pago").length * taxa;
                    const saida   = despesas.filter(d=>d.mes===m&&d.status==="pago").reduce((s,d)=>s+d.valor,0)
                                  + servicos.filter(s=>{
                                      if(!s.dataFim) return false;
                                      const p=s.dataFim.split("/");
                                      return p.length===3&&`${p[2]}-${p[1]}`===m;
                                    }).reduce((s,sv)=>(sv.valorMaterial||0)+(sv.valorMaoDeObra||0)+s, 0);
                    return { entrada, saida };
                  });
                  return (
                    <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"22px 24px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                        <div>
                          <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Fluxo Financeiro</div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>Receitas × Despesas (em R$)</div>
                        </div>
                        <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:D.accent }} />Receita
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:"#F59E0B" }} />Despesa
                          </div>
                        </div>
                      </div>
                      <AreaChart dadosMes={dados6} mesesLabel={labels6} />
                    </div>
                  );
                })()}

                {/* Atividade Recente */}
                <div style={{ background:D.bgCard, borderRadius:D.radius, padding:"22px 24px", boxShadow:D.shadow, border:`1px solid ${D.border}` }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em", marginBottom:18 }}>Atividade recente</div>
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
              </div>

              {/* Cobranças Recentes */}
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden" }}>
                <div style={{ padding:"18px 24px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${D.border}` }}>
                  <div style={{ fontFamily:D.fontDisplay, fontSize:15, fontWeight:600, color:D.text, letterSpacing:"-0.02em" }}>Cobranças recentes</div>
                  <button onClick={() => setAba("cobrancas")} style={{ fontFamily:D.fontBody, fontSize:13, color:D.accent, background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>Ver todas →</button>
                </div>
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
                          <td style={{ padding:"14px 24px", fontFamily:D.fontBody, fontSize:13, color:D.text }}>R$ {taxa.toFixed(2).replace(".",",")}</td>
                          <td style={{ padding:"14px 24px" }}><Badge status={cob.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}


        {/* ── Cobranças ── */}
        {aba === "cobrancas" && (
          <div>
            <TopBar title="Cobranças" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Cobranças</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Registre pagamentos e comprovantes</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard }}>
                  {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                {!readOnly && !isMobile && <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"9px 16px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>{enviandoEmails?"📧 Enviando...":"📧 Cobrar pendentes"}</button>}
              </div>
            </div>

            {isMobile ? (
              <div>{cobMes.map((cob,i) => <CobCard key={i} cob={cob} />)}</div>
            ) : (
              <div style={{ background:D.bgCard, borderRadius:D.radius, boxShadow:D.shadow, border:`1px solid ${D.border}`, overflow:"hidden", marginTop:16 }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F8FAFC" }}>
                      {["Unidade","Morador","E-mail","Status","Data Pgto","Ações"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${D.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cobMes.map((cob,i) => {
                      const m = moradores.find(x => x.id === cob.moradorId);
                      if (!m) return null;
                      return (
                        <tr key={i} style={{ borderBottom:`1px solid ${D.border}` }}>
                          <td style={{ padding:"13px 16px", fontWeight:600, color:D.text, fontSize:13 }}>{m.unidade}</td>
                          <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>{m.nome}</td>
                          <td style={{ padding:"13px 16px", fontSize:12, color:D.textSec, fontFamily:D.fontBody }}>{m.email}</td>
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
            <TopBar title="Moradores" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>

              {/* Cabeçalho + ações */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontFamily:D.fontBody, fontSize:13, color:D.textSec }}>{moradores.length} unidade{moradores.length!==1?"s":""} cadastrada{moradores.length!==1?"s":""}</div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, color:D.text, background:D.bgCard, fontFamily:D.fontBody }}>
                    {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                  </select>
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
                              <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec, marginTop:2 }}>{m.nome}</div>
                            </div>
                            {cob && <Badge status={cob.status} />}
                          </div>
                          <div style={{ fontFamily:D.fontBody, fontSize:12, color:D.textSec }}>{m.email}</div>
                          <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                            <button onClick={() => { setModal({ type:"historico", data:m }); }} style={{ padding:"5px 12px", background:D.secondary, color:D.primary, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>📋 Histórico</button>
                            <button onClick={() => { const link=`${window.location.origin}${window.location.pathname}?morador=${m.id}`; navigator.clipboard.writeText(link); showToast(`Link do ${m.unidade} copiado!`); }} style={{ padding:"5px 12px", background:"#F0FDFA", color:D.success, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🔗 Link</button>
                            {!readOnly && <>
                              <button onClick={() => { setEditMorador({id:m.id,nome:m.nome,unidade:m.unidade,email:m.email,telefone:m.telefone||""}); setModal({type:"editarMorador"}); }} style={{ padding:"5px 12px", background:D.secondary, color:D.accent, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>✏️</button>
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
                                <button onClick={() => { const link=`${window.location.origin}${window.location.pathname}?morador=${m.id}`; navigator.clipboard.writeText(link); showToast(`Link do ${m.unidade} copiado!`); }} style={{ padding:"5px 10px", background:"#F0FDFA", color:D.success, border:`1px solid #BBF7D0`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>🔗</button>
                                {!readOnly && <>
                                  <button onClick={() => { setEditMorador({id:m.id,nome:m.nome,unidade:m.unidade,email:m.email,telefone:m.telefone||""}); setModal({type:"editarMorador"}); }} style={{ padding:"5px 10px", background:D.secondary, color:D.accent, border:`1px solid ${D.border}`, borderRadius:6, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:D.fontBody }}>✏️</button>
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
            <TopBar title="Água & Luz" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:D.fontDisplay, color:"#1E3A5F", margin:0, fontSize:h2size }}>Água &amp; Luz</h2>
                <p style={{ color:D.textSec, margin:"4px 0 0", fontSize:13 }}>Contas e despesas fixas</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novaDespesa" })} style={{ padding:"10px 16px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:D.fontBody, boxShadow:`0 2px 8px rgba(30,58,114,0.25)` }}>+ Nova</button>}
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
                        <td style={{ padding:"13px 16px", fontSize:18 }}>{d.tipo==="agua"?"💧":d.tipo==="luz"?"⚡":"📦"}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, color:D.text }}>{d.descricao||(d.tipo==="agua"?"Conta de água":d.tipo==="luz"?"Conta de luz":"Outra despesa")}</td>
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
        {aba === "servicos" && (
          <div>
            <TopBar title="Serviços & Manutenção" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
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

        {/* ── Acessos ── */}
        {aba === "acessos" && (
          <div>
            <TopBar title="Controle de Acessos" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
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

        {/* ── Histórico ── */}
        {aba === "historico" && (
          <div>
            <TopBar title="Histórico de Atividades" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
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
            <TopBar title="Configurações" user={user} readOnly={readOnly} nPendentes={nPagos} />
            <div style={{ padding: isMobile?"16px 16px 100px":"24px 28px 40px" }}>
            <h2 style={{ fontFamily:D.fontDisplay, color:D.text, margin:"0 0 6px", fontSize:h2size, letterSpacing:"-0.02em", fontWeight:600 }}>Configurações</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 20px", fontSize:13 }}>Parâmetros do condomínio</p>
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

              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>📧 Disparar e-mails manualmente</h3>
              <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 14px" }}>Use estes botões caso queira enviar fora do disparo automático. O sistema evita duplicatas no mesmo dia.</p>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button onClick={() => dispararEmails("lembrete")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>
                  {enviandoEmails ? "Enviando..." : `📧 Lembrete a todos (${moradores.length})`}
                </button>
                <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"10px 18px", background:"#C9933A", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>
                  {enviandoEmails ? "Enviando..." : `⚠️ Cobrar pendentes (${pendentes})`}
                </button>
              </div>

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
          {[{label:"Nome *",key:"nome",placeholder:"Ex: João da Silva"},{label:"Unidade *",key:"unidade",placeholder:"Ex: Apto 103"},{label:"E-mail *",key:"email",placeholder:"joao@email.com",type:"email"},{label:"Telefone",key:"telefone",placeholder:"(85) 99999-0000"}].map(f => (
            <div key={f.key} style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>{f.label}</label>
              <input type={f.type||"text"} value={novoMorador[f.key]} onChange={e=>setNovoMorador(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:6, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
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
              <div style={{ fontSize:13, color:D.text, fontWeight:600, fontFamily:D.fontBody }}>{m.unidade}</div>
              <div style={{ fontSize:12, color:D.textSec, fontFamily:D.fontBody, marginTop:4, lineHeight:1.8 }}>
                📧 {m.email}{m.telefone ? ` · 📱 ${m.telefone}` : ""}
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
          {[
            { label:"Nome *",    key:"nome",     placeholder:"Ex: João da Silva"    },
            { label:"Unidade *", key:"unidade",  placeholder:"Ex: Apto 103"         },
            { label:"E-mail *",  key:"email",    placeholder:"joao@email.com", type:"email" },
            { label:"Telefone",  key:"telefone", placeholder:"(85) 99999-0000"      },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>{f.label}</label>
              <input
                type={f.type||"text"}
                value={editMorador[f.key]}
                onChange={e => setEditMorador(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }}
              />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:6, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={salvarEdicaoMorador} style={{ padding:"10px 20px", background:D.primary, color:D.primaryFg, border:"none", borderRadius:D.radiusSm, fontFamily:D.fontBody, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Salvar</button>
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
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Tipo</label>
          <select value={novaDespesa.tipo} onChange={e=>setNovaDespesa(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box", background:"#fff", color:D.text }}>
            <option value="agua">💧 Água</option>
            <option value="luz">⚡ Luz</option>
            <option value="outro">📦 Outra despesa</option>
          </select>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Descrição</label>
          <input value={novaDespesa.descricao} onChange={e=>setNovaDespesa(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Conta Enel Jun" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box" }} />
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Valor *</label>
              <input type="number" value={novaDespesa.valor} onChange={e=>setNovaDespesa(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1 }}>Mês *</label>
              <input type="month" value={novaDespesa.mes} onChange={e=>setNovaDespesa(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:`1.5px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:14, marginTop:5, boxSizing:"border-box", color:D.text }} />
            </div>
          </div>
          <label style={{ fontSize:11, fontWeight:700, color:D.textSec, textTransform:"uppercase", letterSpacing:1, display:"block", marginTop:14 }}>Comprovante</label>
          <div onClick={() => fileRefDespesa.current.click()} style={{ marginTop:6, border:"2px dashed #D0DAE6", borderRadius:8, padding:"16px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {novaDespesa.arquivoNome ? <span style={{color:"#2E6DA4",fontWeight:600}}>📎 {novaDespesa.arquivoNome}</span> : <>📁 Toque para selecionar</>}
          </div>
          <input ref={fileRefDespesa} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(f) setNovaDespesa(p=>({...p,arquivo:f,arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", color:D.text, border:`1px solid ${D.border}`, borderRadius:D.radiusSm, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
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
