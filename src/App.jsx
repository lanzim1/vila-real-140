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
const EJS_PUBLIC  = "miqPVueWYbnAe6ijd";
const EJS_SERVICE = "service_h0a4utj";
const EJS_TEMPLATE = "template_yzl1x2m";
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

// ── Toast ──
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const bg = type === "success" ? "#2E6DA4" : type === "error" ? "#B03A2E" : "#1E3A5F";
  return (
    <div style={{ position:"fixed", bottom:80, right:16, left:16, background:bg, color:"#fff", padding:"12px 16px", borderRadius:10, fontSize:14, zIndex:9999, boxShadow:"0 4px 16px rgba(0,0,0,.25)", lineHeight:1.4, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ marginLeft:12, background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:18, lineHeight:1, flexShrink:0 }}>×</button>
    </div>
  );
};

// ── Modal ──
const Modal = ({ title, onClose, children, isMobile }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems: isMobile ? "flex-end" : "center", justifyContent:"center" }}>
    <div style={{ background:"#fff", borderRadius: isMobile ? "16px 16px 0 0" : 12, width:"100%", maxWidth: isMobile ? "100%" : 520, maxHeight: isMobile ? "92vh" : "90vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,.25)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 20px 14px", borderBottom:"1px solid #e8edf3", position:"sticky", top:0, background:"#fff", zIndex:1 }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:"#1E3A5F", fontWeight:700 }}>{title}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:24, cursor:"pointer", color:"#666", lineHeight:1, padding:"0 4px" }}>×</button>
      </div>
      <div style={{ padding:"18px 20px 28px" }}>{children}</div>
    </div>
  </div>
);

// ── Badge ──
const Badge = ({ status }) => {
  const map = {
    pago:     { label:"Pago",     bg:"#E8F5E9", color:"#2E7D32", border:"#A5D6A7" },
    pendente: { label:"Pendente", bg:"#FFF8E1", color:"#F57F17", border:"#FFE082" },
    atrasado: { label:"Atrasado", bg:"#FFEBEE", color:"#B03A2E", border:"#EF9A9A" },
  };
  const s = map[status] || map.pendente;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>{s.label}</span>;
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
    <div style={{ minHeight:"100vh", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"36px 28px", width:"100%", maxWidth:400, boxShadow:"0 16px 48px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏢</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#1E3A5F", margin:0, fontWeight:700 }}>Vila Real 140</h1>
          <p style={{ color:"#6B7A8D", fontSize:13, margin:"6px 0 0" }}>Sistema de Cobrança de Condomínio</p>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>E-mail</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="seu@email.com" style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #D0DAE6", borderRadius:10, fontSize:16, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:22 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>Senha</label>
          <div style={{ position:"relative" }}>
            <input type={verPass ? "text" : "password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{ width:"100%", padding:"12px 44px 12px 14px", border:"1.5px solid #D0DAE6", borderRadius:10, fontSize:16, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
            <button type="button" onClick={() => setVerPass(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:18, padding:4, lineHeight:1 }}>
              {verPass ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        {err && <p style={{ color:"#B03A2E", fontSize:13, margin:"0 0 14px", textAlign:"center" }}>{err}</p>}
        <button onClick={handle} disabled={loading} style={{ width:"100%", padding:"14px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:10, fontSize:16, fontWeight:600, cursor: loading ? "default" : "pointer", opacity: loading ? .7 : 1 }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
};

// ── App Principal ──
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
  const fileRef        = useRef();
  const fileRefDespesa = useRef();

  // ── Autenticação ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u && modoVisitante) {
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
    return () => { u1(); u2(); u3(); u4(); u5(); };
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

  const mudarMes = (m) => { setMesSel(m); garantirMes(m); };

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
      showToast("Pagamento registrado! Recibo gerado.");
      if (morador) gerarReciboPDF(morador, dataPgto, pagForm.obs);
    };
    if (pagForm.arquivo) { const r=new FileReader(); r.onload=e=>salvar(e.target.result); r.readAsDataURL(pagForm.arquivo); } else salvar();
  };

  const estornarPagamento = async (moradorId) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const venc = dataVencimentoMes(mesSel); venc.setHours(0,0,0,0);
    const novoStatus = hoje > venc ? "atrasado" : "pendente";
    await setDoc(doc(db, "cobrancas", `${moradorId}_${mesSel}`), { moradorId, mes:mesSel, status:novoStatus, dataPagamento:null, obs:"", comprovante:null, arquivoNome:"" }, { merge:true });
    setModal(null); showToast("Pagamento estornado.", "error");
  };

  // ── Moradores ──
  const adicionarMorador = async () => {
    if (!novoMorador.nome || !novoMorador.unidade || !novoMorador.email) { showToast("Preencha nome, unidade e e-mail.", "error"); return; }
    const ref = await addDoc(collection(db, "moradores"), novoMorador);
    await setDoc(doc(db, "cobrancas", `${ref.id}_${mesSel}`), { moradorId:ref.id, mes:mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
    setNovoMorador({ nome:"", unidade:"", email:"", telefone:"" }); setModal(null); showToast("Morador cadastrado!");
  };

  const removerMorador = async (id) => {
    await deleteDoc(doc(db, "moradores", id));
    const snap = await getDocs(query(collection(db, "cobrancas"), where("moradorId","==",id)));
    const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit(); showToast("Morador removido.", "error");
  };

  const salvarEdicaoMorador = async () => {
    if (!editMorador.nome || !editMorador.unidade || !editMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const { id, ...dados } = editMorador;
    await setDoc(doc(db, "moradores", id), dados, { merge:true });
    setEditMorador(null);
    setModal(null);
    showToast("Morador atualizado com sucesso!");
  };

  // ── Despesas ──
  const adicionarDespesa = () => {
    if (!novaDespesa.valor || !novaDespesa.mes) { showToast("Preencha o valor e o mês.", "error"); return; }
    const salvar = async (base64="") => {
      await addDoc(collection(db, "despesas"), { tipo:novaDespesa.tipo, descricao:novaDespesa.descricao, valor:parseFloat(novaDespesa.valor)||0, mes:novaDespesa.mes, status:"pendente", dataPagamento:null, comprovante:base64, arquivoNome:novaDespesa.arquivoNome });
      setNovaDespesa({ tipo:"agua", descricao:"", valor:"", mes:mesAtual(), arquivo:null, arquivoNome:"" }); setModal(null); showToast("Despesa registrada!");
    };
    if (novaDespesa.arquivo) { const r=new FileReader(); r.onload=e=>salvar(e.target.result); r.readAsDataURL(novaDespesa.arquivo); } else salvar();
  };

  const marcarDespesaPaga = async (id) => {
    await setDoc(doc(db,"despesas",id), { status:"pago", dataPagamento:new Date().toLocaleDateString("pt-BR") }, { merge:true });
    showToast("Despesa marcada como paga!");
  };
  const removerDespesa = async (id) => { await deleteDoc(doc(db,"despesas",id)); showToast("Despesa removida.","error"); };

  // ── Serviços ──
  const adicionarServico = async () => {
    if (!novoServico.titulo) { showToast("Dê um título ao serviço.","error"); return; }
    await addDoc(collection(db,"servicos"), { titulo:novoServico.titulo, descricao:novoServico.descricao, status:"pendente", dataAbertura:new Date().toLocaleDateString("pt-BR"), dataInicio:null, dataFim:null, valorMaterial:null, valorMaoDeObra:null, obsConclusao:"" });
    setNovoServico({ titulo:"", descricao:"" }); setModal(null); showToast("Serviço registrado!");
  };

  const concluirServico = async (id) => {
    await setDoc(doc(db,"servicos",id), { status:"concluido", dataInicio:concluirForm.dataInicio, dataFim:concluirForm.dataFim, valorMaterial:parseFloat(concluirForm.valorMaterial)||0, valorMaoDeObra:parseFloat(concluirForm.valorMaoDeObra)||0, obsConclusao:concluirForm.obs }, { merge:true });
    setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal(null); showToast("Serviço concluído!");
  };
  const reabrirServico  = async (id) => { await setDoc(doc(db,"servicos",id), { status:"pendente" }, { merge:true }); showToast("Serviço reaberto.","error"); };
  const removerServico  = async (id) => { await deleteDoc(doc(db,"servicos",id)); showToast("Serviço removido.","error"); };

  const enviarLembretes = () => {
    const dev = cobMes.filter(c=>c.status!=="pago").map(c=>moradores.find(m=>m.id===c.moradorId)).filter(Boolean);
    if (!dev.length) { showToast("Todos já pagaram!"); return; }
    showToast(`📧 Lembretes para ${dev.length} morador(es): ${dev.map(d=>`${d.nome}`).join(", ")}`);
  };

  const salvarTaxa = async (v) => { await setDoc(doc(db,"config","geral"), { taxa:v }, { merge:true }); showToast("Taxa atualizada!"); };

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

  const navItems = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças"  },
    { id:"moradores", icon:"👥", label:"Moradores"  },
    { id:"despesas",  icon:"💧", label:"Água/Luz"   },
    { id:"servicos",  icon:"🔧", label:"Serviços"   },
    ...(!readOnly ? [{ id:"config", icon:"⚙️", label:"Config." }] : []),
  ];

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:"'Inter',sans-serif" }}>Carregando...</div>
  );

  if (modoVisitante && !user) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:"'Inter',sans-serif", textAlign:"center", padding:24 }}>
      <div><div style={{ fontSize:36, marginBottom:10 }}>🔒</div>Link de visualização indisponível.<br/>Contate o síndico.</div>
    </div>
  );

  if (!user) return <Login />;

  // ── helpers de estilo responsivo ──
  const pad    = isMobile ? "16px 16px 100px" : "32px 32px 40px";
  const h2size = isMobile ? 22 : 26;

  // ── Cobranças: renderiza cards no mobile, tabela no desktop ──
  const CobCard = ({ cob }) => {
    const m = moradores.find(x => x.id === cob.moradorId);
    if (!m) return null;
    return (
      <div style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:`4px solid ${cob.status==="pago"?"#2E7D32":"#B03A2E"}`, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <div>
            <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{m.unidade} — {m.nome}</div>
            <div style={{ fontSize:12, color:"#6B7A8D", marginTop:2 }}>{m.email}</div>
          </div>
          <Badge status={cob.status} />
        </div>
        {cob.dataPagamento && <div style={{ fontSize:12, color:"#9aa6b5", marginBottom:8 }}>Pago em {cob.dataPagamento}</div>}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {cob.status !== "pago" ? (
            !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"7px 14px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Registrar Pgto</button>
          ) : (
            <>
              {cob.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"7px 14px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>📄 Comprovante</button>}
              {!readOnly && <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"7px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>↩ Estornar</button>}
            </>
          )}
        </div>
      </div>
    );
  };

  const DespCard = ({ d }) => (
    <div style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:`4px solid ${d.status==="pago"?"#2E7D32":"#B03A2E"}`, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{d.tipo==="agua"?"💧":d.tipo==="luz"?"⚡":"📦"} {d.descricao || (d.tipo==="agua"?"Conta de água":d.tipo==="luz"?"Conta de luz":"Outra despesa")}</div>
          <div style={{ fontSize:12, color:"#6B7A8D", marginTop:2 }}>{mesLabel(d.mes)} · R$ {d.valor.toFixed(2).replace(".",",")}</div>
        </div>
        <Badge status={d.status} />
      </div>
      {d.dataPagamento && <div style={{ fontSize:12, color:"#9aa6b5", marginBottom:8 }}>Pago em {d.dataPagamento}</div>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {d.status !== "pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ padding:"7px 14px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Marcar Paga</button>}
        {d.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ padding:"7px 14px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
        {!readOnly && <button onClick={() => { if(window.confirm("Remover esta despesa?")) removerDespesa(d.id); }} style={{ padding:"7px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", minHeight:"100vh", fontFamily:"'Inter',sans-serif", background:"#F0F4F8" }}>

      {/* ── Sidebar (desktop) ── */}
      {!isMobile && (
        <aside style={{ width:220, background:"#1E3A5F", display:"flex", flexDirection:"column", padding:"0 0 24px", flexShrink:0 }}>
          <div style={{ padding:"28px 20px 24px", borderBottom:"1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize:22, marginBottom:4 }}>🏢</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:"#fff", fontWeight:700, lineHeight:1.3 }}>Vila Real 140</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginTop:3 }}>Gestão de Condomínio</div>
          </div>
          <nav style={{ flex:1, padding:"16px 0" }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setAba(n.id)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"11px 20px", background: aba===n.id ? "rgba(255,255,255,.12)" : "none", border:"none", cursor:"pointer", color: aba===n.id ? "#fff" : "rgba(255,255,255,.6)", fontSize:13.5, fontWeight: aba===n.id ? 600 : 400, textAlign:"left", borderLeft: aba===n.id ? "3px solid #C9933A" : "3px solid transparent" }}>
                <span style={{ fontSize:16 }}>{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>
          {readOnly ? (
            <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin + window.location.pathname; }} style={{ margin:"0 16px", padding:"9px", background:"rgba(201,147,58,.2)", border:"1px solid rgba(201,147,58,.4)", borderRadius:8, color:"#F0D9A8", fontSize:12, fontWeight:600, textAlign:"center", cursor:"pointer", lineHeight:1.5 }}>
              👁️ Modo Visualização<br/><span style={{ fontSize:11, fontWeight:400, opacity:.85 }}>Sair</span>
            </button>
          ) : (
            <button onClick={() => signOut(auth)} style={{ margin:"0 16px", padding:"9px", background:"rgba(176,58,46,.25)", border:"1px solid rgba(176,58,46,.4)", borderRadius:8, color:"#ff9a8b", cursor:"pointer", fontSize:13, fontWeight:600 }}>Sair</button>
          )}
        </aside>
      )}

      {/* ── Barra de navegação inferior (mobile) ── */}
      {isMobile && (
        <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:"#1E3A5F", display:"flex", zIndex:500, boxShadow:"0 -2px 12px rgba(0,0,0,.2)", borderTop:"1px solid rgba(255,255,255,.08)" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setAba(n.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"8px 2px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color: aba===n.id ? "#C9933A" : "rgba(255,255,255,.55)", borderTop: aba===n.id ? "2px solid #C9933A" : "2px solid transparent" }}>
              <span style={{ fontSize:20 }}>{n.icon}</span>
              <span style={{ fontSize:10, fontWeight: aba===n.id ? 700 : 400 }}>{n.label}</span>
            </button>
          ))}
          {readOnly ? (
            <button onClick={async () => { await signOut(auth); window.location.href = window.location.origin+window.location.pathname; }} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"8px 2px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:"rgba(201,147,58,.9)", borderTop:"2px solid transparent" }}>
              <span style={{ fontSize:20 }}>👁️</span>
              <span style={{ fontSize:10 }}>Sair</span>
            </button>
          ) : (
            <button onClick={() => signOut(auth)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"8px 2px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:"rgba(255,150,138,.85)", borderTop:"2px solid transparent" }}>
              <span style={{ fontSize:20 }}>🚪</span>
              <span style={{ fontSize:10 }}>Sair</span>
            </button>
          )}
        </nav>
      )}

      {/* ── Conteúdo ── */}
      <main style={{ flex:1, padding:pad, overflow:"auto" }}>

        {/* ── Dashboard ── */}
        {aba === "dashboard" && (
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:"0 0 6px", fontSize:h2size }}>Dashboard</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 18px", fontSize:13 }}>Visão geral · {mesLabel(mesSel)}</p>

            {/* Saldo de caixa */}
            <div style={{ background: saldoCaixa>=0 ? "linear-gradient(135deg,#1E3A5F,#2E6DA4)" : "linear-gradient(135deg,#7B241C,#B03A2E)", borderRadius:14, padding: isMobile ? "18px 20px" : "22px 28px", marginBottom:20, boxShadow:"0 4px 20px rgba(0,0,0,.15)" }}>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, marginBottom:4 }}>💰 Saldo de Caixa — Geral</div>
              <div style={{ color:"#fff", fontSize: isMobile ? 28 : 34, fontWeight:800, letterSpacing:-.5 }}>R$ {saldoCaixa.toFixed(2).replace(".",",")}</div>
              <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, marginTop:6, lineHeight:1.7 }}>
                Entradas: R$ {totalEntradas.toFixed(2).replace(".",",")}  ·  Despesas: R$ {totalSaidasDespesas.toFixed(2).replace(".",",")}  ·  Serviços: R$ {totalSaidasServicos.toFixed(2).replace(".",",")}
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
              <label style={{ fontSize:13, color:"#1E3A5F", fontWeight:600 }}>Mês:</label>
              <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff", flex:1, minWidth:120 }}>
                {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </div>

            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { label:"Unidades",   valor: moradores.length,                                              icon:"🏠", cor:"#1E3A5F" },
                { label:"Pagamentos", valor: pagos,                                                         icon:"✅", cor:"#2E7D32" },
                { label:"Pendentes",  valor: pendentes,                                                     icon:"⏳", cor:"#F57F17" },
                { label:"Atrasados",  valor: atrasados,                                                     icon:"🚨", cor:"#B03A2E" },
                { label:"Arrecadado", valor:`R$ ${totalArrecadado.toFixed(2).replace(".",",")}`,            icon:"💵", cor:"#C9933A" },
                { label:"A Receber",  valor:`R$ ${totalPendente.toFixed(2).replace(".",",")}`,              icon:"📋", cor:"#2E6DA4" },
              ].map((c,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:12, padding:"14px 14px 12px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${c.cor}` }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight:700, color:c.cor }}>{c.valor}</div>
                  <div style={{ fontSize:11, color:"#6B7A8D", marginTop:3 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"#fff", borderRadius:12, padding:18, boxShadow:"0 2px 8px rgba(0,0,0,.06)", marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#1E3A5F" }}>Adimplência — {mesLabel(mesSel)}</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#2E7D32" }}>{moradores.length ? Math.round((pagos/moradores.length)*100) : 0}%</span>
              </div>
              <div style={{ height:12, background:"#E8EDF3", borderRadius:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${moradores.length?(pagos/moradores.length)*100:0}%`, background:"linear-gradient(90deg,#2E6DA4,#C9933A)", borderRadius:6, transition:"width .5s ease" }} />
              </div>
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {!readOnly && (
                <button onClick={() => dispararEmails("lembrete")} disabled={enviandoEmails} style={{ padding:"12px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1, flex: isMobile?"1 1 100%":"none" }}>
                  {enviandoEmails ? "📧 Enviando..." : `📧 Lembrete a todos (${moradores.length})`}
                </button>
              )}
              {!readOnly && (
                <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"12px 18px", background:"#C9933A", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1, flex: isMobile?"1 1 100%":"none" }}>
                  {enviandoEmails ? "📧 Enviando..." : `⚠️ Cobrar pendentes/atrasados (${nPagos})`}
                </button>
              )}
              <button onClick={exportarPDF} style={{ padding:"12px 18px", background:"#fff", color:"#1E3A5F", border:"1.5px solid #1E3A5F", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer", flex: isMobile?"1 1 100%":"none" }}>📄 Exportar PDF</button>
            </div>
          </div>
        )}

        {/* ── Cobranças ── */}
        {aba === "cobrancas" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:h2size }}>Cobranças</h2>
                <p style={{ color:"#6B7A8D", margin:"4px 0 0", fontSize:13 }}>Registre pagamentos e comprovantes</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff" }}>
                  {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                {!readOnly && !isMobile && <button onClick={() => dispararEmails("vencimento")} disabled={enviandoEmails} style={{ padding:"9px 16px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoEmails?"default":"pointer", opacity: enviandoEmails?.7:1 }}>{enviandoEmails?"📧 Enviando...":"📧 Cobrar pendentes"}</button>}
              </div>
            </div>

            {isMobile ? (
              <div>{cobMes.map((cob,i) => <CobCard key={i} cob={cob} />)}</div>
            ) : (
              <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.06)", overflow:"hidden", marginTop:16 }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#F0F4F8" }}>
                      {["Unidade","Morador","E-mail","Status","Data Pgto","Ações"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:12, fontWeight:700, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid #E8EDF3" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cobMes.map((cob,i) => {
                      const m = moradores.find(x => x.id === cob.moradorId);
                      if (!m) return null;
                      return (
                        <tr key={i} style={{ borderBottom:"1px solid #F0F4F8" }}>
                          <td style={{ padding:"13px 16px", fontWeight:600, color:"#1E3A5F", fontSize:13 }}>{m.unidade}</td>
                          <td style={{ padding:"13px 16px", fontSize:13, color:"#2C3E50" }}>{m.nome}</td>
                          <td style={{ padding:"13px 16px", fontSize:12, color:"#6B7A8D" }}>{m.email}</td>
                          <td style={{ padding:"13px 16px" }}><Badge status={cob.status} /></td>
                          <td style={{ padding:"13px 16px", fontSize:12, color:"#6B7A8D" }}>{cob.dataPagamento || "—"}</td>
                          <td style={{ padding:"13px 16px" }}>
                            <div style={{ display:"flex", gap:8 }}>
                              {cob.status !== "pago" ? (
                                !readOnly && <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"5px 12px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>✓ Registrar Pgto</button>
                              ) : (
                                <>
                                  {cob.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"5px 12px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
                                  {!readOnly && <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"5px 12px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>↩ Estornar</button>}
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
        )}

        {/* ── Moradores ── */}
        {aba === "moradores" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:h2size }}>Moradores</h2>
                <p style={{ color:"#6B7A8D", margin:"4px 0 0", fontSize:13 }}>{moradores.length} unidade{moradores.length!==1?"s":""} cadastrada{moradores.length!==1?"s":""}</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novoMorador" })} style={{ padding:"10px 16px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>+ Novo</button>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {moradores.map(m => {
                const cob = cobrancas.find(c => c.moradorId===m.id && c.mes===mesSel);
                return (
                  <div key={m.id} style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:`4px solid ${cob?.status==="pago"?"#2E7D32":"#B03A2E"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div><div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14 }}>{m.nome}</div><div style={{ fontSize:12, color:"#C9933A", fontWeight:600, marginTop:2 }}>{m.unidade}</div></div>
                      {cob && <Badge status={cob.status} />}
                    </div>
                    <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8 }}>
                      <div>📧 {m.email}</div>
                      {m.telefone && <div>📱 {m.telefone}</div>}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => setModal({ type:"historico", data:m })} style={{ padding:"6px 14px", background:"#F3E5F5", color:"#6A1B9A", border:"1px solid #CE93D8", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>📋 Histórico</button>
                      {!readOnly && (
                        <>
                          <button onClick={() => { setEditMorador({ id:m.id, nome:m.nome, unidade:m.unidade, email:m.email, telefone:m.telefone||"" }); setModal({ type:"editarMorador" }); }} style={{ padding:"6px 14px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>✏️ Editar</button>
                          <button onClick={() => { if(window.confirm(`Remover ${m.nome}?`)) removerMorador(m.id); }} style={{ padding:"6px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>Remover</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Despesas ── */}
        {aba === "despesas" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:h2size }}>Água &amp; Luz</h2>
                <p style={{ color:"#6B7A8D", margin:"4px 0 0", fontSize:13 }}>Contas e despesas fixas</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novaDespesa" })} style={{ padding:"10px 16px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>+ Nova</button>}
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
                    <tr style={{ background:"#F0F4F8" }}>
                      {["Tipo","Descrição","Mês","Valor","Status","Data Pgto","Ações"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:12, fontWeight:700, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid #E8EDF3" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...despesas].sort((a,b)=>b.mes.localeCompare(a.mes)).map(d => (
                      <tr key={d.id} style={{ borderBottom:"1px solid #F0F4F8" }}>
                        <td style={{ padding:"13px 16px", fontSize:18 }}>{d.tipo==="agua"?"💧":d.tipo==="luz"?"⚡":"📦"}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, color:"#2C3E50" }}>{d.descricao||(d.tipo==="agua"?"Conta de água":d.tipo==="luz"?"Conta de luz":"Outra despesa")}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, color:"#6B7A8D" }}>{mesLabel(d.mes)}</td>
                        <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:"#1E3A5F" }}>R$ {d.valor.toFixed(2).replace(".",",")}</td>
                        <td style={{ padding:"13px 16px" }}><Badge status={d.status} /></td>
                        <td style={{ padding:"13px 16px", fontSize:12, color:"#6B7A8D" }}>{d.dataPagamento||"—"}</td>
                        <td style={{ padding:"13px 16px" }}>
                          <div style={{ display:"flex", gap:8 }}>
                            {d.status!=="pago" && !readOnly && <button onClick={() => marcarDespesaPaga(d.id)} style={{ padding:"5px 12px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>✓ Marcar Paga</button>}
                            {d.comprovante && <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ padding:"5px 12px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>📄 Ver</button>}
                            {!readOnly && <button onClick={() => { if(window.confirm("Remover?")) removerDespesa(d.id); }} style={{ padding:"5px 12px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>Remover</button>}
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
        )}

        {/* ── Serviços ── */}
        {aba === "servicos" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:h2size }}>Serviços &amp; Manutenção</h2>
                <p style={{ color:"#6B7A8D", margin:"4px 0 0", fontSize:13 }}>Consertos e melhorias do condomínio</p>
              </div>
              {!readOnly && <button onClick={() => setModal({ type:"novoServico" })} style={{ padding:"10px 16px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>+ Novo</button>}
            </div>

            <h3 style={{ fontSize:13, color:"#1E3A5F", fontWeight:700, margin:"20px 0 10px" }}>🟡 Pendentes ({servicos.filter(s=>s.status==="pendente").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:12, marginBottom:8 }}>
              {servicos.filter(s=>s.status==="pendente").map(s => (
                <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:"4px solid #F57F17" }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:8 }}>{s.descricao}</div>}
                  <div style={{ fontSize:11, color:"#9aa6b5" }}>Aberto em {s.dataAbertura}</div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => { setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal({ type:"concluirServico", data:s }); }} style={{ padding:"7px 14px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>✓ Concluir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"7px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="pendente").length===0 && <div style={{ color:"#9aa6b5", fontSize:13, padding:"4px 0" }}>Nenhum serviço pendente. 🎉</div>}
            </div>

            <h3 style={{ fontSize:13, color:"#1E3A5F", fontWeight:700, margin:"24px 0 10px" }}>✅ Concluídos ({servicos.filter(s=>s.status==="concluido").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {servicos.filter(s=>s.status==="concluido").map(s => (
                <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:"4px solid #2E7D32" }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:14, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:8 }}>{s.descricao}</div>}
                  <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8, background:"#F0F4F8", borderRadius:8, padding:"10px 12px" }}>
                    <div>📅 Início: <b style={{color:"#1E3A5F"}}>{s.dataInicio||"—"}</b> · Fim: <b style={{color:"#1E3A5F"}}>{s.dataFim||"—"}</b></div>
                    <div>🧱 Material: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaterial||0).toFixed(2).replace(".",",")}</b></div>
                    <div>👷 Mão de obra: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaoDeObra||0).toFixed(2).replace(".",",")}</b></div>
                    <div>💰 Total: <b style={{color:"#C9933A"}}>R$ {((s.valorMaterial||0)+(s.valorMaoDeObra||0)).toFixed(2).replace(".",",")}</b></div>
                    {s.obsConclusao && <div style={{marginTop:4}}>📝 {s.obsConclusao}</div>}
                  </div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={() => reabrirServico(s.id)} style={{ padding:"7px 14px", background:"#FFF8E1", color:"#F57F17", border:"1px solid #FFE082", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>↩ Reabrir</button>
                      <button onClick={() => { if(window.confirm(`Remover "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"7px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Remover</button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="concluido").length===0 && <div style={{ color:"#9aa6b5", fontSize:13, padding:"4px 0" }}>Nenhum serviço concluído ainda.</div>}
            </div>
          </div>
        )}

        {/* ── Configurações ── */}
        {aba === "config" && (
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:"0 0 6px", fontSize:h2size }}>Configurações</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 20px", fontSize:13 }}>Parâmetros do condomínio</p>
            <div style={{ background:"#fff", borderRadius:12, padding: isMobile ? 20 : 28, boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
              <h3 style={{ color:"#1E3A5F", margin:"0 0 16px", fontSize:15, fontWeight:700 }}>Taxa mensal</h3>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Valor (R$)</label>
              <input type="number" value={taxa} onChange={e=>setTaxa(parseFloat(e.target.value)||0)} style={{ display:"block", width:"100%", padding:"12px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:16, color:"#1E3A5F", marginTop:8, boxSizing:"border-box" }} />
              <button onClick={() => salvarTaxa(taxa)} style={{ marginTop:14, padding:"11px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" }}>Salvar</button>

              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />

              <h3 style={{ color:"#1E3A5F", margin:"0 0 6px", fontSize:15, fontWeight:700 }}>📅 Dia de vencimento</h3>
              <p style={{ color:"#6B7A8D", fontSize:12, margin:"0 0 14px" }}>O sistema enviará e-mails automaticamente 5 dias antes e no dia do vencimento.</p>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Dia do mês (1–28)</label>
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
              <div style={{ fontSize:13, color:"#6B7A8D", lineHeight:1.8, background:"#F0F4F8", borderRadius:8, padding:"12px 16px" }}>
                <div>E-mail: <b style={{color:"#1E3A5F"}}>{user?.email}</b></div>
                <div style={{ marginTop:6, fontSize:11, color:"#aaa" }}>Para trocar a senha, use o painel do Firebase (Authentication → Users).</div>
              </div>
              <hr style={{ margin:"24px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8 }}>
                <div>🏢 Condomínio Vila Real 140</div>
                <div>📦 Versão 2.0 · Firebase + React</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Modais ── */}
      {modal?.type === "pagar" && (
        <Modal title={`Registrar Pgto — ${modal.data.unidade}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <p style={{ fontSize:13, color:"#6B7A8D", margin:"0 0 16px" }}>Morador: <b style={{color:"#1E3A5F"}}>{modal.data.nome}</b> · Taxa: <b style={{color:"#C9933A"}}>R$ {taxa.toFixed(2).replace(".",",")}</b></p>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Observação</label>
          <input value={pagForm.obs} onChange={e=>setPagForm(p=>({...p,obs:e.target.value}))} placeholder="Ex: Pago via Pix" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:6, marginBottom:14, boxSizing:"border-box" }} />
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Comprovante</label>
          <div onClick={() => fileRef.current.click()} style={{ marginTop:6, border:"2px dashed #D0DAE6", borderRadius:8, padding:"18px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {pagForm.arquivoNome ? <span style={{color:"#2E6DA4",fontWeight:600}}>📎 {pagForm.arquivoNome}</span> : <><div style={{fontSize:22,marginBottom:4}}>📁</div>Toque para selecionar</>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(f) setPagForm(p=>({...p,arquivo:f,arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => registrarPagamento(modal.data.moradorId)} style={{ padding:"10px 20px", background:"#2E7D32", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar</button>
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
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => estornarPagamento(modal.data.moradorId)} style={{ padding:"10px 20px", background:"#B03A2E", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>↩ Estornar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoMorador" && (
        <Modal title="Novo Morador" onClose={() => setModal(null)} isMobile={isMobile}>
          {[{label:"Nome *",key:"nome",placeholder:"Ex: João da Silva"},{label:"Unidade *",key:"unidade",placeholder:"Ex: Apto 103"},{label:"E-mail *",key:"email",placeholder:"joao@email.com",type:"email"},{label:"Telefone",key:"telefone",placeholder:"(85) 99999-0000"}].map(f => (
            <div key={f.key} style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>{f.label}</label>
              <input type={f.type||"text"} value={novoMorador[f.key]} onChange={e=>setNovoMorador(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:6, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarMorador} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Cadastrar</button>
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
            <div style={{ marginBottom:16, background:"#F0F4F8", borderRadius:10, padding:"12px 16px" }}>
              <div style={{ fontSize:13, color:"#1E3A5F", fontWeight:600 }}>{m.unidade}</div>
              <div style={{ fontSize:12, color:"#6B7A8D", marginTop:4, lineHeight:1.8 }}>
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
                        <button onClick={() => gerarReciboPDF(m, c.dataPagamento, c.obs)} style={{ fontSize:11, padding:"3px 8px", background:"#F3E5F5", color:"#6A1B9A", border:"1px solid #CE93D8", borderRadius:6, cursor:"pointer", fontWeight:600, marginTop:2 }}>
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
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>{f.label}</label>
              <input
                type={f.type||"text"}
                value={editMorador[f.key]}
                onChange={e => setEditMorador(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }}
              />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:6, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={salvarEdicaoMorador} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Salvar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaDespesa" && (
        <Modal title="Nova Despesa" onClose={() => setModal(null)} isMobile={isMobile}>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Tipo</label>
          <select value={novaDespesa.tipo} onChange={e=>setNovaDespesa(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box", background:"#fff" }}>
            <option value="agua">💧 Água</option>
            <option value="luz">⚡ Luz</option>
            <option value="outro">📦 Outra despesa</option>
          </select>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Descrição</label>
          <input value={novaDespesa.descricao} onChange={e=>setNovaDespesa(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Conta Enel Jun" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box" }} />
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Valor *</label>
              <input type="number" value={novaDespesa.valor} onChange={e=>setNovaDespesa(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Mês *</label>
              <input type="month" value={novaDespesa.mes} onChange={e=>setNovaDespesa(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
          </div>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5, display:"block", marginTop:14 }}>Comprovante</label>
          <div onClick={() => fileRefDespesa.current.click()} style={{ marginTop:6, border:"2px dashed #D0DAE6", borderRadius:8, padding:"16px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {novaDespesa.arquivoNome ? <span style={{color:"#2E6DA4",fontWeight:600}}>📎 {novaDespesa.arquivoNome}</span> : <>📁 Toque para selecionar</>}
          </div>
          <input ref={fileRefDespesa} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(f) setNovaDespesa(p=>({...p,arquivo:f,arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarDespesa} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoServico" && (
        <Modal title="Novo Serviço" onClose={() => setModal(null)} isMobile={isMobile}>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Título *</label>
          <input value={novoServico.titulo} onChange={e=>setNovoServico(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Consertar o portão" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, marginBottom:14, boxSizing:"border-box" }} />
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Descrição</label>
          <textarea value={novoServico.descricao} onChange={e=>setNovoServico(p=>({...p,descricao:e.target.value}))} placeholder="Detalhes do serviço" rows={3} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarServico} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "concluirServico" && (
        <Modal title={`Concluir — ${modal.data.titulo}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Início</label>
              <input type="date" value={concluirForm.dataInicio} onChange={e=>setConcluirForm(p=>({...p,dataInicio:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Fim</label>
              <input type="date" value={concluirForm.dataFim} onChange={e=>setConcluirForm(p=>({...p,dataFim:e.target.value}))} style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Material (R$)</label>
              <input type="number" value={concluirForm.valorMaterial} onChange={e=>setConcluirForm(p=>({...p,valorMaterial:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Mão de obra (R$)</label>
              <input type="number" value={concluirForm.valorMaoDeObra} onChange={e=>setConcluirForm(p=>({...p,valorMaoDeObra:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box" }} />
            </div>
          </div>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Observações</label>
          <textarea value={concluirForm.obs} onChange={e=>setConcluirForm(p=>({...p,obs:e.target.value}))} rows={2} placeholder="Ex: Trocado motor do portão" style={{ display:"block", width:"100%", padding:"10px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, marginTop:5, boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"10px 18px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => concluirServico(modal.data.id)} style={{ padding:"10px 20px", background:"#2E7D32", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar</button>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
