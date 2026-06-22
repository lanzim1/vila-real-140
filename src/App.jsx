import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc,
  getDocs, query, where, writeBatch
} from "firebase/firestore";

// ─── Paleta ───────────────────────────────────────────────
// Azul ardósia escuro  #1E3A5F  (autoridade, confiança)
// Azul médio           #2E6DA4  (ações primárias)
// Dourado suave        #C9933A  (destaque, status pago)
// Cinza névoa          #F0F4F8  (fundos)
// Vermelho tijolo      #B03A2E  (inadimplente)
// Branco               #FFFFFF
// ──────────────────────────────────────────────────────────

// Dados usados apenas para popular o Firestore na primeira vez que o app roda
const MOCK_MORADORES = [
  { nome: "Carlos Mendes", unidade: "Apto 101", email: "carlos@email.com", telefone: "(85) 99123-0001" },
  { nome: "Fernanda Lima", unidade: "Apto 102", email: "fernanda@email.com", telefone: "(85) 99123-0002" },
  { nome: "Roberto Alves", unidade: "Apto 201", email: "roberto@email.com", telefone: "(85) 99123-0003" },
  { nome: "Juliana Costa", unidade: "Apto 202", email: "juliana@email.com", telefone: "(85) 99123-0004" },
  { nome: "Marcos Souza", unidade: "Apto 301", email: "marcos@email.com", telefone: "(85) 99123-0005" },
  { nome: "Patrícia Nunes", unidade: "Apto 302", email: "patricia@email.com", telefone: "(85) 99123-0006" },
];

// Conta usada exclusivamente para o link de visualização (somente leitura).
// Crie esse usuário no Firebase Console → Authentication → Users com este
// e-mail e senha exatos. As regras do Firestore impedem essa conta de
// escrever dados (veja instruções no README).
const VISITANTE_EMAIL = "visitante@vilareal140-ddf4d.firebaseapp.com";
const VISITANTE_SENHA = "VisualizarVR140";

// true quando o link foi aberto com ?visualizar=1
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

// ─── Componentes de UI ───────────────────────────────────

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const bg = type === "success" ? "#2E6DA4" : type === "error" ? "#B03A2E" : "#1E3A5F";
  return (
    <div style={{ position:"fixed", bottom:24, right:24, background:bg, color:"#fff", padding:"12px 20px", borderRadius:8, fontSize:14, zIndex:9999, boxShadow:"0 4px 16px rgba(0,0,0,0.2)", maxWidth:320, lineHeight:1.4 }}>
      {msg}
      <button onClick={onClose} style={{ marginLeft:12, background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
    </div>
  );
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
    <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:520, maxHeight:"90vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.25)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px 16px", borderBottom:"1px solid #e8edf3" }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:"#1E3A5F", fontWeight:700 }}>{title}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#666", lineHeight:1 }}>×</button>
      </div>
      <div style={{ padding:"20px 24px 24px" }}>{children}</div>
    </div>
  </div>
);

const Badge = ({ status }) => {
  const map = {
    pago:      { label:"Pago",       bg:"#E8F5E9", color:"#2E7D32", border:"#A5D6A7" },
    pendente:  { label:"Pendente",   bg:"#FFF8E1", color:"#F57F17", border:"#FFE082" },
    atrasado:  { label:"Atrasado",   bg:"#FFEBEE", color:"#B03A2E", border:"#EF9A9A" },
  };
  const s = map[status] || map.pendente;
  return (
    <span style={{ padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
};

// ─── Tela de Login ───────────────────────────────────────

const Login = () => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr("");
    if (!email || !pass) { setErr("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e) {
      setErr("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif" }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"44px 40px", width:"100%", maxWidth:380, boxShadow:"0 16px 48px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏢</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, color:"#1E3A5F", margin:0, fontWeight:700 }}>Vila Real 140</h1>
          <p style={{ color:"#6B7A8D", fontSize:13, margin:"6px 0 0" }}>Sistema de Cobrança de Condomínio</p>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>E-mail</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="seu@email.com" style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>Senha</label>
          <div style={{ position:"relative" }}>
            <input type={verPass ? "text" : "password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{ width:"100%", padding:"10px 40px 10px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
            <button type="button" onClick={() => setVerPass(v => !v)} title={verPass ? "Ocultar senha" : "Mostrar senha"} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, padding:4, lineHeight:1 }}>
              {verPass ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        {err && <p style={{ color:"#B03A2E", fontSize:13, margin:"0 0 14px", textAlign:"center" }}>{err}</p>}
        <button onClick={handle} disabled={loading} style={{ width:"100%", padding:"12px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:15, fontWeight:600, cursor: loading ? "default" : "pointer", letterSpacing:.3, opacity: loading ? .7 : 1 }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
};

// ─── App Principal ───────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [aba, setAba] = useState("dashboard");
  const [moradores, setMoradores] = useState([]);
  const [cobrancas, setCobrancas] = useState([]);
  const [taxa, setTaxa] = useState(180);
  const [mesSel, setMesSel] = useState(mesAtual);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // { type, data }
  const [novoMorador, setNovoMorador] = useState({ nome:"", unidade:"", email:"", telefone:"" });
  const [pagForm, setPagForm] = useState({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
  const [despesas, setDespesas] = useState([]);
  const [novaDespesa, setNovaDespesa] = useState({ tipo:"agua", descricao:"", valor:"", mes: mesAtual(), arquivo:null, arquivoNome:"" });
  const [servicos, setServicos] = useState([]);
  const [novoServico, setNovoServico] = useState({ titulo:"", descricao:"" });
  const [concluirForm, setConcluirForm] = useState({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" });
  const fileRef = useRef();
  const fileRefDespesa = useRef();

  // ── Autenticação ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u && modoVisitante) {
        // Link de visualização: tenta logar automaticamente com a conta visitante
        try {
          await signInWithEmailAndPassword(auth, VISITANTE_EMAIL, VISITANTE_SENHA);
        } catch (e) {
          console.error("Conta visitante indisponível:", e);
          setAuthChecked(true);
        }
        return; // onAuthStateChanged será chamado de novo com o novo usuário
      }
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // true quando o usuário logado é a conta de visualização
  const readOnly = user?.email === VISITANTE_EMAIL;

  // ── Listeners em tempo real do Firestore (só depois de logado) ──
  useEffect(() => {
    if (!user) return;
    const unsubM = onSnapshot(collection(db, "moradores"), (snap) => {
      setMoradores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubC = onSnapshot(collection(db, "cobrancas"), (snap) => {
      setCobrancas(snap.docs.map(d => d.data()));
    });
    const unsubCfg = onSnapshot(doc(db, "config", "geral"), (d) => {
      if (d.exists()) setTaxa(d.data().taxa ?? 180);
    });
    const unsubD = onSnapshot(collection(db, "despesas"), (snap) => {
      setDespesas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubS = onSnapshot(collection(db, "servicos"), (snap) => {
      setServicos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubM(); unsubC(); unsubCfg(); unsubD(); unsubS(); };
  }, [user]);

  // ── Popular o banco na primeira vez (só roda se "moradores" estiver vazio) ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(collection(db, "moradores"));
      if (snap.empty) {
        const batch = writeBatch(db);
        MOCK_MORADORES.forEach((m) => {
          const ref = doc(collection(db, "moradores"));
          batch.set(ref, m);
          batch.set(doc(db, "cobrancas", `${ref.id}_${mesAtual()}`), {
            moradorId: ref.id, mes: mesAtual(), status:"pendente", comprovante:null, dataPagamento:null, obs:""
          });
        });
        await batch.commit();
      }
    })();
  }, [user]);

  const showToast = (msg, type="success") => setToast({ msg, type });

  const cobMes = cobrancas.filter(c => c.mes === mesSel);
  const pagos = cobMes.filter(c => c.status === "pago").length;
  const pendentes = cobMes.filter(c => c.status !== "pago").length;
  const totalArrecadado = pagos * taxa;
  const totalPendente = pendentes * taxa;

  // ── Saldo de caixa (total geral, não filtrado por mês) ──
  const totalEntradas = cobrancas.filter(c => c.status === "pago").length * taxa;
  const totalSaidasDespesas = despesas.filter(d => d.status === "pago").reduce((s, d) => s + (d.valor || 0), 0);
  const totalSaidasServicos = servicos.filter(s => s.status === "concluido").reduce((s, sv) => s + (sv.valorMaterial || 0) + (sv.valorMaoDeObra || 0), 0);
  const saldoCaixa = totalEntradas - totalSaidasDespesas - totalSaidasServicos;

  // Garante que existe cobrança para cada morador no mês informado
  const garantirMes = async (mes) => {
    const existentes = new Set(cobrancas.filter(c => c.mes === mes).map(c => c.moradorId));
    const batch = writeBatch(db);
    let mudou = false;
    moradores.forEach(m => {
      if (!existentes.has(m.id)) {
        batch.set(doc(db, "cobrancas", `${m.id}_${mes}`), { moradorId:m.id, mes, status:"pendente", comprovante:null, dataPagamento:null, obs:"" });
        mudou = true;
      }
    });
    if (mudou) await batch.commit();
  };

  // ── Despesas (Água/Luz) ──
  const adicionarDespesa = () => {
    if (!novaDespesa.valor || !novaDespesa.mes) { showToast("Preencha o valor e o mês.", "error"); return; }
    const salvar = async (base64 = "") => {
      await addDoc(collection(db, "despesas"), {
        tipo: novaDespesa.tipo, descricao: novaDespesa.descricao,
        valor: parseFloat(novaDespesa.valor) || 0, mes: novaDespesa.mes,
        status: "pendente", dataPagamento: null,
        comprovante: base64, arquivoNome: novaDespesa.arquivoNome
      });
      setNovaDespesa({ tipo:"agua", descricao:"", valor:"", mes: mesAtual(), arquivo:null, arquivoNome:"" });
      setModal(null);
      showToast("Despesa registrada!");
    };
    if (novaDespesa.arquivo) {
      const reader = new FileReader();
      reader.onload = (e) => salvar(e.target.result);
      reader.readAsDataURL(novaDespesa.arquivo);
    } else {
      salvar();
    }
  };

  const marcarDespesaPaga = async (id) => {
    await setDoc(doc(db, "despesas", id), { status:"pago", dataPagamento: new Date().toLocaleDateString("pt-BR") }, { merge:true });
    showToast("Despesa marcada como paga!");
  };

  const removerDespesa = async (id) => {
    await deleteDoc(doc(db, "despesas", id));
    showToast("Despesa removida.", "error");
  };

  // ── Serviços / Manutenção ──
  const adicionarServico = async () => {
    if (!novoServico.titulo) { showToast("Dê um título ao serviço.", "error"); return; }
    await addDoc(collection(db, "servicos"), {
      titulo: novoServico.titulo, descricao: novoServico.descricao,
      status: "pendente", dataAbertura: new Date().toLocaleDateString("pt-BR"),
      dataInicio:null, dataFim:null, valorMaterial:null, valorMaoDeObra:null, obsConclusao:""
    });
    setNovoServico({ titulo:"", descricao:"" });
    setModal(null);
    showToast("Serviço registrado!");
  };

  const concluirServico = async (id) => {
    await setDoc(doc(db, "servicos", id), {
      status:"concluido",
      dataInicio: concluirForm.dataInicio, dataFim: concluirForm.dataFim,
      valorMaterial: parseFloat(concluirForm.valorMaterial) || 0,
      valorMaoDeObra: parseFloat(concluirForm.valorMaoDeObra) || 0,
      obsConclusao: concluirForm.obs
    }, { merge:true });
    setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" });
    setModal(null);
    showToast("Serviço concluído com sucesso!");
  };

  const reabrirServico = async (id) => {
    await setDoc(doc(db, "servicos", id), { status:"pendente" }, { merge:true });
    showToast("Serviço reaberto.", "error");
  };

  const removerServico = async (id) => {
    await deleteDoc(doc(db, "servicos", id));
    showToast("Serviço removido.", "error");
  };

  // Garante o mês atual sempre que a lista de moradores estiver pronta
  useEffect(() => {
    if (user && moradores.length > 0) garantirMes(mesSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, moradores.length]);

  const mudarMes = (m) => { setMesSel(m); garantirMes(m); };

  const registrarPagamento = (moradorId) => {
    const arq = pagForm.arquivo;

    const salvar = async (base64 = "") => {
      await setDoc(doc(db, "cobrancas", `${moradorId}_${mesSel}`), {
        moradorId, mes: mesSel, status:"pago",
        dataPagamento: new Date().toLocaleDateString("pt-BR"),
        obs: pagForm.obs, comprovante: base64, arquivoNome: pagForm.arquivoNome
      }, { merge:true });
      setModal(null);
      setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
      showToast("Pagamento registrado com sucesso!");
    };

    if (arq) {
      const reader = new FileReader();
      reader.onload = (e) => salvar(e.target.result);
      reader.readAsDataURL(arq);
    } else {
      salvar();
    }
  };

  const estornarPagamento = async (moradorId) => {
    await setDoc(doc(db, "cobrancas", `${moradorId}_${mesSel}`), {
      moradorId, mes: mesSel, status:"pendente", dataPagamento:null, obs:"", comprovante:null, arquivoNome:""
    }, { merge:true });
    setModal(null);
    showToast("Pagamento estornado.", "error");
  };

  const adicionarMorador = async () => {
    if (!novoMorador.nome || !novoMorador.unidade || !novoMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const ref = await addDoc(collection(db, "moradores"), novoMorador);
    await setDoc(doc(db, "cobrancas", `${ref.id}_${mesSel}`), {
      moradorId: ref.id, mes: mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:""
    });
    setNovoMorador({ nome:"", unidade:"", email:"", telefone:"" });
    setModal(null);
    showToast("Morador cadastrado!");
  };

  const removerMorador = async (id) => {
    await deleteDoc(doc(db, "moradores", id));
    const q = query(collection(db, "cobrancas"), where("moradorId", "==", id));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    showToast("Morador removido.", "error");
  };

  const enviarLembretes = () => {
    const devedores = cobMes.filter(c => c.status !== "pago").map(c => moradores.find(m => m.id === c.moradorId)).filter(Boolean);
    if (devedores.length === 0) { showToast("Todos já pagaram! Nenhum lembrete necessário."); return; }
    const lista = devedores.map(d => `• ${d.nome} (${d.unidade})`).join("\n");
    showToast(`📧 Lembretes enviados para ${devedores.length} morador(es):\n${lista}`);
  };

  const salvarTaxa = async (novaTaxa) => {
    await setDoc(doc(db, "config", "geral"), { taxa: novaTaxa }, { merge:true });
    showToast("Taxa atualizada com sucesso!");
  };

  const mesesDisponiveis = () => {
    const set = new Set(cobrancas.map(c => c.mes));
    set.add(mesAtual());
    return Array.from(set).sort().reverse();
  };

  // ── Exportação de Relatório em PDF ──
  const exportarPDF = () => {
    const docPdf = new jsPDF();
    const X = 14;
    const AZUL = [30, 58, 95];
    let y = 18;

    docPdf.setFontSize(17);
    docPdf.setTextColor(...AZUL);
    docPdf.text("Vila Real 140 — Relatório do Condomínio", X, y);
    y += 7;
    docPdf.setFontSize(10);
    docPdf.setTextColor(107, 122, 141);
    docPdf.text(`Período de referência: ${mesLabel(mesSel)}  ·  Gerado em ${new Date().toLocaleDateString("pt-BR")}`, X, y);
    y += 10;

    // Resumo financeiro
    docPdf.setFontSize(12.5);
    docPdf.setTextColor(...AZUL);
    docPdf.text("Resumo Financeiro", X, y);
    y += 5;
    autoTable(docPdf, {
      startY: y, margin: { left: X }, theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: AZUL },
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de unidades", String(moradores.length)],
        ["Pagamentos realizados", String(pagos)],
        ["Pendentes / Atrasados", String(pendentes)],
        ["Arrecadado", `R$ ${totalArrecadado.toFixed(2).replace(".",",")}`],
        ["A receber", `R$ ${totalPendente.toFixed(2).replace(".",",")}`],
        ["Total entradas (geral)", `R$ ${totalEntradas.toFixed(2).replace(".",",")}`],
        ["Total despesas pagas (geral)", `R$ ${totalSaidasDespesas.toFixed(2).replace(".",",")}`],
        ["Total serviços (geral)", `R$ ${totalSaidasServicos.toFixed(2).replace(".",",")}`],
        ["SALDO DE CAIXA", `R$ ${saldoCaixa.toFixed(2).replace(".",",")}`],
      ],
    });
    y = docPdf.lastAutoTable.finalY + 12;

    // Cobranças do mês
    docPdf.setFontSize(12.5);
    docPdf.setTextColor(...AZUL);
    docPdf.text(`Cobranças — ${mesLabel(mesSel)}`, X, y);
    y += 5;
    const linhasCob = cobMes.map(c => {
      const m = moradores.find(x => x.id === c.moradorId);
      return [m?.unidade || "—", m?.nome || "—", c.status === "pago" ? "Pago" : "Pendente", c.dataPagamento || "—"];
    });
    autoTable(docPdf, {
      startY: y, margin: { left: X }, theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: AZUL },
      head: [["Unidade", "Morador", "Status", "Data Pgto"]],
      body: linhasCob.length ? linhasCob : [["—", "Nenhuma cobrança neste mês", "—", "—"]],
    });
    y = docPdf.lastAutoTable.finalY + 12;

    // Despesas (Água/Luz) do mês
    if (y > 250) { docPdf.addPage(); y = 18; }
    docPdf.setFontSize(12.5);
    docPdf.setTextColor(...AZUL);
    docPdf.text(`Despesas (Água/Luz) — ${mesLabel(mesSel)}`, X, y);
    y += 5;
    const despesasMes = despesas.filter(d => d.mes === mesSel);
    autoTable(docPdf, {
      startY: y, margin: { left: X }, theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: AZUL },
      head: [["Tipo", "Descrição", "Valor", "Status"]],
      body: despesasMes.length ? despesasMes.map(d => [
        d.tipo === "agua" ? "Água" : d.tipo === "luz" ? "Luz" : "Outro",
        d.descricao || "—",
        `R$ ${d.valor.toFixed(2).replace(".",",")}`,
        d.status === "pago" ? "Pago" : "Pendente",
      ]) : [["—", "Nenhuma despesa neste mês", "—", "—"]],
    });
    y = docPdf.lastAutoTable.finalY + 12;

    // Serviços concluídos
    if (y > 230) { docPdf.addPage(); y = 18; }
    docPdf.setFontSize(12.5);
    docPdf.setTextColor(...AZUL);
    docPdf.text("Serviços Concluídos", X, y);
    y += 5;
    const concluidos = servicos.filter(s => s.status === "concluido");
    autoTable(docPdf, {
      startY: y, margin: { left: X }, theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: AZUL },
      head: [["Serviço", "Início", "Fim", "Material", "Mão de obra", "Total"]],
      body: concluidos.length ? concluidos.map(s => [
        s.titulo, s.dataInicio || "—", s.dataFim || "—",
        `R$ ${(s.valorMaterial || 0).toFixed(2).replace(".",",")}`,
        `R$ ${(s.valorMaoDeObra || 0).toFixed(2).replace(".",",")}`,
        `R$ ${((s.valorMaterial || 0) + (s.valorMaoDeObra || 0)).toFixed(2).replace(".",",")}`,
      ]) : [["—", "—", "—", "—", "—", "Nenhum serviço concluído"]],
    });

    docPdf.save(`relatorio-vila-real-140-${mesSel}.pdf`);
    showToast("Relatório PDF gerado com sucesso!");
  };

  // ── Sidebar ──
  const navItems = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças" },
    { id:"moradores", icon:"👥", label:"Moradores" },
    { id:"despesas",  icon:"💧", label:"Água/Luz" },
    { id:"servicos",  icon:"🔧", label:"Serviços" },
    ...(!readOnly ? [{ id:"config", icon:"⚙️", label:"Configurações" }] : []),
  ];

  if (!authChecked) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:"'Inter',sans-serif" }}>
        Carregando...
      </div>
    );
  }

  if (modoVisitante && !user) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1E3A5F", color:"#fff", fontFamily:"'Inter',sans-serif", textAlign:"center", padding:24 }}>
        <div>
          <div style={{ fontSize:36, marginBottom:10 }}>🔒</div>
          Link de visualização indisponível no momento.<br/>Contate o síndico.
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'Inter',sans-serif", background:"#F0F4F8" }}>
      {/* Sidebar */}
      <aside style={{ width:220, background:"#1E3A5F", display:"flex", flexDirection:"column", padding:"0 0 24px" }}>
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
          <button
            onClick={async () => { await signOut(auth); window.location.href = window.location.origin + window.location.pathname; }}
            title="Sair do modo visualização e voltar para a tela de login"
            style={{ margin:"0 16px", padding:"9px", background:"rgba(201,147,58,.2)", border:"1px solid rgba(201,147,58,.4)", borderRadius:8, color:"#F0D9A8", fontSize:12, fontWeight:600, textAlign:"center", cursor:"pointer", lineHeight:1.5 }}
          >
            👁️ Modo Visualização<br/>
            <span style={{ fontSize:11, fontWeight:400, opacity:.85 }}>Sair</span>
          </button>
        ) : (
          <button onClick={() => signOut(auth)} style={{ margin:"0 16px", padding:"9px", background:"rgba(176,58,46,.25)", border:"1px solid rgba(176,58,46,.4)", borderRadius:8, color:"#ff9a8b", cursor:"pointer", fontSize:13, fontWeight:600 }}>
            Sair
          </button>
        )}
      </aside>

      {/* Conteúdo */}
      <main style={{ flex:1, padding:"32px 32px 40px", overflow:"auto" }}>

        {/* ── Dashboard ── */}
        {aba === "dashboard" && (
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:"0 0 8px", fontSize:26 }}>Dashboard</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 20px", fontSize:14 }}>Visão geral do condomínio · {mesLabel(mesSel)}</p>

            {/* Card de Saldo de Caixa */}
            <div style={{ background: saldoCaixa >= 0 ? "linear-gradient(135deg,#1E3A5F,#2E6DA4)" : "linear-gradient(135deg,#7B241C,#B03A2E)", borderRadius:14, padding:"22px 28px", marginBottom:28, boxShadow:"0 4px 20px rgba(0,0,0,.15)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
              <div>
                <div style={{ color:"rgba(255,255,255,.7)", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, marginBottom:6 }}>💰 Saldo de Caixa — Geral</div>
                <div style={{ color:"#fff", fontSize:34, fontWeight:800, letterSpacing:-.5 }}>
                  R$ {saldoCaixa.toFixed(2).replace(".",",")}
                </div>
                <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, marginTop:6 }}>
                  Entradas: R$ {totalEntradas.toFixed(2).replace(".",",")} &nbsp;·&nbsp;
                  Despesas: R$ {totalSaidasDespesas.toFixed(2).replace(".",",")} &nbsp;·&nbsp;
                  Serviços: R$ {totalSaidasServicos.toFixed(2).replace(".",",")}
                </div>
              </div>
              <div style={{ fontSize:48, opacity:.3 }}>
                {saldoCaixa >= 0 ? "📈" : "📉"}
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
              <label style={{ fontSize:13, color:"#1E3A5F", fontWeight:600 }}>Mês de referência:</label>
              <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"7px 12px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff" }}>
                {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:16, marginBottom:32 }}>
              {[
                { label:"Total de Unidades", valor: moradores.length, icon:"🏠", cor:"#1E3A5F" },
                { label:"Pagamentos Realizados", valor: pagos, icon:"✅", cor:"#2E7D32" },
                { label:"Pendentes / Atrasados", valor: pendentes, icon:"⏳", cor:"#B03A2E" },
                { label:"Arrecadado", valor: `R$ ${totalArrecadado.toFixed(2).replace(".",",")}`, icon:"💵", cor:"#C9933A" },
                { label:"A Receber", valor: `R$ ${totalPendente.toFixed(2).replace(".",",")}`, icon:"📋", cor:"#2E6DA4" },
              ].map((c,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:12, padding:"20px 20px 16px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${c.cor}` }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{c.icon}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:c.cor }}>{c.valor}</div>
                  <div style={{ fontSize:12, color:"#6B7A8D", marginTop:4 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"#fff", borderRadius:12, padding:24, boxShadow:"0 2px 8px rgba(0,0,0,.06)", marginBottom:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#1E3A5F" }}>Taxa de adimplência — {mesLabel(mesSel)}</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#2E7D32" }}>{moradores.length ? Math.round((pagos/moradores.length)*100) : 0}%</span>
              </div>
              <div style={{ height:12, background:"#E8EDF3", borderRadius:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${moradores.length ? (pagos/moradores.length)*100 : 0}%`, background:"linear-gradient(90deg,#2E6DA4,#C9933A)", borderRadius:6, transition:"width .5s ease" }} />
              </div>
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {!readOnly && (
                <button onClick={enviarLembretes} style={{ padding:"12px 24px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:9, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  📧 Enviar Lembretes por E-mail ({pendentes} pendente{pendentes!==1?"s":""})
                </button>
              )}
              <button onClick={exportarPDF} style={{ padding:"12px 24px", background:"#fff", color:"#1E3A5F", border:"1.5px solid #1E3A5F", borderRadius:9, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                📄 Exportar Relatório PDF
              </button>
            </div>
          </div>
        )}

        {/* ── Cobranças ── */}
        {aba === "cobrancas" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:26 }}>Cobranças</h2>
                <p style={{ color:"#6B7A8D", margin:"6px 0 0", fontSize:14 }}>Registre pagamentos e visualize comprovantes</p>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff" }}>
                  {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                {!readOnly && (
                  <button onClick={enviarLembretes} style={{ padding:"9px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                    📧 Enviar Lembretes
                  </button>
                )}
              </div>
            </div>

            <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.06)", overflow:"hidden", marginTop:20 }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#F0F4F8" }}>
                    {["Unidade","Morador","E-mail","Status","Data Pgto","Ações"].map(h => (
                      <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:12, fontWeight:700, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid #E8EDF3" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cobMes.map((cob, i) => {
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
                              !readOnly && (
                                <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"5px 12px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                  ✓ Registrar Pgto
                                </button>
                              )
                            ) : (
                              <>
                                {cob.comprovante && (
                                  <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"5px 12px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                    📄 Ver Comprovante
                                  </button>
                                )}
                                {!readOnly && (
                                  <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"5px 12px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                    ↩ Estornar
                                  </button>
                                )}
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
          </div>
        )}

        {/* ── Moradores ── */}
        {aba === "moradores" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:26 }}>Moradores</h2>
                <p style={{ color:"#6B7A8D", margin:"6px 0 0", fontSize:14 }}>{moradores.length} unidade{moradores.length!==1?"s":""} cadastrada{moradores.length!==1?"s":""}</p>
              </div>
              {!readOnly && (
                <button onClick={() => setModal({ type:"novoMorador" })} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  + Novo Morador
                </button>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
              {moradores.map(m => {
                const cob = cobrancas.find(c => c.moradorId === m.id && c.mes === mesSel);
                return (
                  <div key={m.id} style={{ background:"#fff", borderRadius:12, padding:20, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:`4px solid ${cob?.status==="pago" ? "#2E7D32" : "#B03A2E"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:15 }}>{m.nome}</div>
                        <div style={{ fontSize:12, color:"#C9933A", fontWeight:600, marginTop:2 }}>{m.unidade}</div>
                      </div>
                      {cob && <Badge status={cob.status} />}
                    </div>
                    <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8 }}>
                      <div>📧 {m.email}</div>
                      {m.telefone && <div>📱 {m.telefone}</div>}
                    </div>
                    {!readOnly && (
                      <button onClick={() => { if(window.confirm(`Remover ${m.nome}?`)) removerMorador(m.id); }} style={{ marginTop:14, padding:"6px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Remover
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Despesas (Água/Luz) ── */}
        {aba === "despesas" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:26 }}>Água &amp; Luz</h2>
                <p style={{ color:"#6B7A8D", margin:"6px 0 0", fontSize:14 }}>Contas e despesas fixas do condomínio</p>
              </div>
              {!readOnly && (
                <button onClick={() => setModal({ type:"novaDespesa" })} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  + Nova Despesa
                </button>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:24 }}>
              {[
                { label:"Total Pago", valor:`R$ ${despesas.filter(d=>d.status==="pago").reduce((s,d)=>s+d.valor,0).toFixed(2).replace(".",",")}`, icon:"✅", cor:"#2E7D32" },
                { label:"Total Pendente", valor:`R$ ${despesas.filter(d=>d.status!=="pago").reduce((s,d)=>s+d.valor,0).toFixed(2).replace(".",",")}`, icon:"⏳", cor:"#B03A2E" },
                { label:"Contas Cadastradas", valor: despesas.length, icon:"📋", cor:"#2E6DA4" },
              ].map((c,i) => (
                <div key={i} style={{ background:"#fff", borderRadius:12, padding:"18px 18px 14px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${c.cor}` }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                  <div style={{ fontSize:19, fontWeight:700, color:c.cor }}>{c.valor}</div>
                  <div style={{ fontSize:12, color:"#6B7A8D", marginTop:4 }}>{c.label}</div>
                </div>
              ))}
            </div>

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
                  {[...despesas].sort((a,b)=>b.mes.localeCompare(a.mes)).map((d) => (
                    <tr key={d.id} style={{ borderBottom:"1px solid #F0F4F8" }}>
                      <td style={{ padding:"13px 16px", fontSize:18 }}>{d.tipo==="agua" ? "💧" : d.tipo==="luz" ? "⚡" : "📦"}</td>
                      <td style={{ padding:"13px 16px", fontSize:13, color:"#2C3E50" }}>{d.descricao || (d.tipo==="agua"?"Conta de água":d.tipo==="luz"?"Conta de luz":"Outra despesa")}</td>
                      <td style={{ padding:"13px 16px", fontSize:13, color:"#6B7A8D" }}>{mesLabel(d.mes)}</td>
                      <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:"#1E3A5F" }}>R$ {d.valor.toFixed(2).replace(".",",")}</td>
                      <td style={{ padding:"13px 16px" }}><Badge status={d.status} /></td>
                      <td style={{ padding:"13px 16px", fontSize:12, color:"#6B7A8D" }}>{d.dataPagamento || "—"}</td>
                      <td style={{ padding:"13px 16px" }}>
                        <div style={{ display:"flex", gap:8 }}>
                          {d.status !== "pago" && !readOnly && (
                            <button onClick={() => marcarDespesaPaga(d.id)} style={{ padding:"5px 12px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              ✓ Marcar Paga
                            </button>
                          )}
                          {d.comprovante && (
                            <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:d.comprovante, nome:d.descricao||"Despesa", arquivoNome:d.arquivoNome } })} style={{ padding:"5px 12px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              📄 Ver
                            </button>
                          )}
                          {!readOnly && (
                            <button onClick={() => { if(window.confirm("Remover esta despesa?")) removerDespesa(d.id); }} style={{ padding:"5px 12px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              Remover
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {despesas.length === 0 && (
                    <tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:"#9aa6b5", fontSize:13 }}>Nenhuma despesa cadastrada ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Serviços / Manutenção ── */}
        {aba === "servicos" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:0, fontSize:26 }}>Serviços &amp; Manutenção</h2>
                <p style={{ color:"#6B7A8D", margin:"6px 0 0", fontSize:14 }}>Acompanhe consertos e melhorias do condomínio</p>
              </div>
              {!readOnly && (
                <button onClick={() => setModal({ type:"novoServico" })} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  + Novo Serviço
                </button>
              )}
            </div>

            <h3 style={{ fontSize:14, color:"#1E3A5F", fontWeight:700, margin:"24px 0 12px" }}>🟡 Pendentes ({servicos.filter(s=>s.status==="pendente").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16, marginBottom:8 }}>
              {servicos.filter(s=>s.status==="pendente").map(s => (
                <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:20, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:"4px solid #F57F17" }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:15, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:8 }}>{s.descricao}</div>}
                  <div style={{ fontSize:11, color:"#9aa6b5" }}>Aberto em {s.dataAbertura}</div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:14 }}>
                      <button onClick={() => { setConcluirForm({ dataInicio:"", dataFim:"", valorMaterial:"", valorMaoDeObra:"", obs:"" }); setModal({ type:"concluirServico", data:s }); }} style={{ padding:"6px 14px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        ✓ Concluir
                      </button>
                      <button onClick={() => { if(window.confirm(`Remover serviço "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"6px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="pendente").length === 0 && (
                <div style={{ color:"#9aa6b5", fontSize:13, padding:"8px 4px" }}>Nenhum serviço pendente. 🎉</div>
              )}
            </div>

            <h3 style={{ fontSize:14, color:"#1E3A5F", fontWeight:700, margin:"32px 0 12px" }}>✅ Concluídos ({servicos.filter(s=>s.status==="concluido").length})</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
              {servicos.filter(s=>s.status==="concluido").map(s => (
                <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:20, boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderLeft:"4px solid #2E7D32" }}>
                  <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:15, marginBottom:4 }}>{s.titulo}</div>
                  {s.descricao && <div style={{ fontSize:13, color:"#6B7A8D", marginBottom:10 }}>{s.descricao}</div>}
                  <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8, background:"#F0F4F8", borderRadius:8, padding:"10px 12px" }}>
                    <div>📅 Início: <b style={{color:"#1E3A5F"}}>{s.dataInicio || "—"}</b> · Fim: <b style={{color:"#1E3A5F"}}>{s.dataFim || "—"}</b></div>
                    <div>🧱 Material: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaterial||0).toFixed(2).replace(".",",")}</b></div>
                    <div>👷 Mão de obra: <b style={{color:"#1E3A5F"}}>R$ {(s.valorMaoDeObra||0).toFixed(2).replace(".",",")}</b></div>
                    <div>💰 Total: <b style={{color:"#C9933A"}}>R$ {((s.valorMaterial||0)+(s.valorMaoDeObra||0)).toFixed(2).replace(".",",")}</b></div>
                    {s.obsConclusao && <div style={{marginTop:4}}>📝 {s.obsConclusao}</div>}
                  </div>
                  {!readOnly && (
                    <div style={{ display:"flex", gap:8, marginTop:12 }}>
                      <button onClick={() => reabrirServico(s.id)} style={{ padding:"6px 14px", background:"#FFF8E1", color:"#F57F17", border:"1px solid #FFE082", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        ↩ Reabrir
                      </button>
                      <button onClick={() => { if(window.confirm(`Remover serviço "${s.titulo}"?`)) removerServico(s.id); }} style={{ padding:"6px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {servicos.filter(s=>s.status==="concluido").length === 0 && (
                <div style={{ color:"#9aa6b5", fontSize:13, padding:"8px 4px" }}>Nenhum serviço concluído ainda.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Configurações ── */}
        {aba === "config" && (
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:"0 0 8px", fontSize:26 }}>Configurações</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 28px", fontSize:14 }}>Ajuste os parâmetros do condomínio</p>
            <div style={{ background:"#fff", borderRadius:12, padding:28, boxShadow:"0 2px 8px rgba(0,0,0,.06)", maxWidth:480 }}>
              <h3 style={{ color:"#1E3A5F", margin:"0 0 20px", fontSize:15, fontWeight:700 }}>Taxa mensal de condomínio</h3>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Valor (R$)</label>
              <input type="number" value={taxa} onChange={e=>setTaxa(parseFloat(e.target.value)||0)} style={{ display:"block", width:"100%", padding:"10px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:16, color:"#1E3A5F", marginTop:8, boxSizing:"border-box" }} />
              <button onClick={() => salvarTaxa(taxa)} style={{ marginTop:16, padding:"10px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                Salvar
              </button>
              <hr style={{ margin:"28px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <h3 style={{ color:"#1E3A5F", margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Conta conectada</h3>
              <div style={{ fontSize:13, color:"#6B7A8D", lineHeight:1.8, background:"#F0F4F8", borderRadius:8, padding:"12px 16px" }}>
                <div>E-mail: <b style={{color:"#1E3A5F"}}>{user?.email}</b></div>
                <div style={{ marginTop:8, fontSize:11, color:"#aaa" }}>Login gerenciado pelo Firebase Authentication. Para trocar a senha, use o painel do Firebase (Authentication → Users).</div>
              </div>
              <hr style={{ margin:"28px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <h3 style={{ color:"#1E3A5F", margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Sobre o sistema</h3>
              <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8 }}>
                <div>🏢 Condomínio Vila Real 140</div>
                <div>📦 Versão 2.0 · Dados em tempo real via Firebase</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Modais ── */}
      {modal?.type === "pagar" && (
        <Modal title={`Registrar Pagamento — ${modal.data.unidade}`} onClose={() => setModal(null)}>
          <p style={{ fontSize:13, color:"#6B7A8D", margin:"0 0 20px" }}>Morador: <b style={{color:"#1E3A5F"}}>{modal.data.nome}</b> · Taxa: <b style={{color:"#C9933A"}}>R$ {taxa.toFixed(2).replace(".",",")}</b></p>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Observação (opcional)</label>
          <input value={pagForm.obs} onChange={e=>setPagForm(p=>({...p,obs:e.target.value}))} placeholder="Ex: Pago via Pix" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:8, marginBottom:18, boxSizing:"border-box" }} />
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Comprovante (imagem ou PDF)</label>
          <div onClick={() => fileRef.current.click()} style={{ marginTop:8, border:"2px dashed #D0DAE6", borderRadius:8, padding:"20px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {pagForm.arquivoNome ? <><span style={{color:"#2E6DA4", fontWeight:600}}>📎 {pagForm.arquivoNome}</span></> : <><div style={{fontSize:24,marginBottom:6}}>📁</div>Clique para selecionar arquivo</>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f = e.target.files[0]; if(f) setPagForm(p => ({...p, arquivo:f, arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:10, marginTop:24, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => registrarPagamento(modal.data.moradorId)} style={{ padding:"9px 24px", background:"#2E7D32", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar Pagamento</button>
          </div>
        </Modal>
      )}

      {modal?.type === "comprovante" && (
        <Modal title={`Comprovante — ${modal.data.nome}`} onClose={() => setModal(null)}>
          {modal.data.comprovante?.startsWith("data:image") ? (
            <img src={modal.data.comprovante} alt="comprovante" style={{ width:"100%", borderRadius:8, border:"1px solid #E8EDF3" }} />
          ) : modal.data.comprovante?.startsWith("data:application/pdf") ? (
            <div style={{ textAlign:"center", padding:24 }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📄</div>
              <p style={{ color:"#1E3A5F", fontWeight:600, marginBottom:16 }}>{modal.data.arquivoNome || "comprovante.pdf"}</p>
              <a href={modal.data.comprovante} download={modal.data.arquivoNome || "comprovante.pdf"} style={{ padding:"10px 24px", background:"#2E6DA4", color:"#fff", borderRadius:8, textDecoration:"none", fontSize:13, fontWeight:600 }}>⬇ Baixar PDF</a>
            </div>
          ) : (
            <p style={{ color:"#6B7A8D", textAlign:"center" }}>Nenhum comprovante anexado.</p>
          )}
        </Modal>
      )}

      {modal?.type === "estorno" && (
        <Modal title="Confirmar Estorno" onClose={() => setModal(null)}>
          <p style={{ color:"#2C3E50", fontSize:14 }}>Deseja estornar o pagamento de <b>{modal.data.nome}</b>? O status voltará para <b>Pendente</b>.</p>
          <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => estornarPagamento(modal.data.moradorId)} style={{ padding:"9px 24px", background:"#B03A2E", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>↩ Confirmar Estorno</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoMorador" && (
        <Modal title="Cadastrar Novo Morador" onClose={() => setModal(null)}>
          {[
            { label:"Nome completo *", key:"nome", placeholder:"Ex: João da Silva" },
            { label:"Unidade *", key:"unidade", placeholder:"Ex: Apto 103" },
            { label:"E-mail *", key:"email", placeholder:"joao@email.com", type:"email" },
            { label:"Telefone", key:"telefone", placeholder:"(85) 99999-0000" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>{f.label}</label>
              <input type={f.type||"text"} value={novoMorador[f.key]} onChange={e=>setNovoMorador(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
          ))}
          <div style={{ display:"flex", gap:10, marginTop:8, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarMorador} style={{ padding:"9px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Cadastrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novaDespesa" && (
        <Modal title="Nova Despesa — Água/Luz" onClose={() => setModal(null)}>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Tipo</label>
          <select value={novaDespesa.tipo} onChange={e=>setNovaDespesa(p=>({...p,tipo:e.target.value}))} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, marginBottom:16, boxSizing:"border-box", background:"#fff" }}>
            <option value="agua">💧 Água</option>
            <option value="luz">⚡ Luz</option>
            <option value="outro">📦 Outra despesa</option>
          </select>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Descrição (opcional)</label>
          <input value={novaDespesa.descricao} onChange={e=>setNovaDespesa(p=>({...p,descricao:e.target.value}))} placeholder="Ex: Conta Enel referente a Junho" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, marginBottom:16, boxSizing:"border-box" }} />
          <div style={{ display:"flex", gap:12 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Valor (R$) *</label>
              <input type="number" value={novaDespesa.valor} onChange={e=>setNovaDespesa(p=>({...p,valor:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Mês de referência *</label>
              <input type="month" value={novaDespesa.mes} onChange={e=>setNovaDespesa(p=>({...p,mes:e.target.value}))} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
          </div>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5, display:"block", marginTop:16 }}>Comprovante (opcional)</label>
          <div onClick={() => fileRefDespesa.current.click()} style={{ marginTop:8, border:"2px dashed #D0DAE6", borderRadius:8, padding:"18px", textAlign:"center", cursor:"pointer", background:"#F8FAFC", color:"#6B7A8D", fontSize:13 }}>
            {novaDespesa.arquivoNome ? <span style={{color:"#2E6DA4", fontWeight:600}}>📎 {novaDespesa.arquivoNome}</span> : <>📁 Clique para selecionar arquivo</>}
          </div>
          <input ref={fileRefDespesa} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e => { const f = e.target.files[0]; if(f) setNovaDespesa(p => ({...p, arquivo:f, arquivoNome:f.name})); }} />
          <div style={{ display:"flex", gap:10, marginTop:22, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarDespesa} style={{ padding:"9px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "novoServico" && (
        <Modal title="Novo Serviço a Fazer" onClose={() => setModal(null)}>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Título *</label>
          <input value={novoServico.titulo} onChange={e=>setNovoServico(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Consertar o portão da garagem" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, marginBottom:16, boxSizing:"border-box" }} />
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Descrição (opcional)</label>
          <textarea value={novoServico.descricao} onChange={e=>setNovoServico(p=>({...p,descricao:e.target.value}))} placeholder="Detalhes do que precisa ser feito" rows={3} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:10, marginTop:22, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={adicionarServico} style={{ padding:"9px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Registrar</button>
          </div>
        </Modal>
      )}

      {modal?.type === "concluirServico" && (
        <Modal title={`Concluir Serviço — ${modal.data.titulo}`} onClose={() => setModal(null)}>
          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Data de início</label>
              <input type="date" value={concluirForm.dataInicio} onChange={e=>setConcluirForm(p=>({...p,dataInicio:e.target.value}))} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Data de fim</label>
              <input type="date" value={concluirForm.dataFim} onChange={e=>setConcluirForm(p=>({...p,dataFim:e.target.value}))} style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Material (R$)</label>
              <input type="number" value={concluirForm.valorMaterial} onChange={e=>setConcluirForm(p=>({...p,valorMaterial:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Mão de obra (R$)</label>
              <input type="number" value={concluirForm.valorMaoDeObra} onChange={e=>setConcluirForm(p=>({...p,valorMaoDeObra:e.target.value}))} placeholder="0,00" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box" }} />
            </div>
          </div>
          <label style={{ fontSize:12, fontWeight:600, color:"#1E3A5F", textTransform:"uppercase", letterSpacing:.5 }}>Observações (opcional)</label>
          <textarea value={concluirForm.obs} onChange={e=>setConcluirForm(p=>({...p,obs:e.target.value}))} rows={2} placeholder="Ex: Trocado motor do portão, fornecedor X" style={{ display:"block", width:"100%", padding:"9px 13px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, marginTop:6, boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }} />
          <div style={{ display:"flex", gap:10, marginTop:22, justifyContent:"flex-end" }}>
            <button onClick={() => setModal(null)} style={{ padding:"9px 20px", background:"#F0F4F8", color:"#1E3A5F", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
            <button onClick={() => concluirServico(modal.data.id)} style={{ padding:"9px 24px", background:"#2E7D32", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Confirmar Conclusão</button>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
