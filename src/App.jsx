import { useState, useEffect, useRef } from "react";

// ─── Paleta ───────────────────────────────────────────────
// Azul ardósia escuro  #1E3A5F  (autoridade, confiança)
// Azul médio           #2E6DA4  (ações primárias)
// Dourado suave        #C9933A  (destaque, status pago)
// Cinza névoa          #F0F4F8  (fundos)
// Vermelho tijolo      #B03A2E  (inadimplente)
// Branco               #FFFFFF
// ──────────────────────────────────────────────────────────

const ADMIN_USER = "sindico";
const ADMIN_PASS = "vilareal140";

const MOCK_MORADORES = [
  { id: 1, nome: "Carlos Mendes", unidade: "Apto 101", email: "carlos@email.com", telefone: "(85) 99123-0001" },
  { id: 2, nome: "Fernanda Lima", unidade: "Apto 102", email: "fernanda@email.com", telefone: "(85) 99123-0002" },
  { id: 3, nome: "Roberto Alves", unidade: "Apto 201", email: "roberto@email.com", telefone: "(85) 99123-0003" },
  { id: 4, nome: "Juliana Costa", unidade: "Apto 202", email: "juliana@email.com", telefone: "(85) 99123-0004" },
  { id: 5, nome: "Marcos Souza", unidade: "Apto 301", email: "marcos@email.com", telefone: "(85) 99123-0005" },
  { id: 6, nome: "Patrícia Nunes", unidade: "Apto 302", email: "patricia@email.com", telefone: "(85) 99123-0006" },
];

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const mesLabel = (m) => {
  const [y, mo] = m.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(mo) - 1]}/${y}`;
};

const gerarCobrancas = (moradores, mes) =>
  moradores.map((m) => ({ moradorId: m.id, mes, status: "pendente", comprovante: null, dataPagamento: null, obs: "" }));

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

const Login = ({ onLogin }) => {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const handle = () => {
    if (user === ADMIN_USER && pass === ADMIN_PASS) { onLogin(); }
    else { setErr("Usuário ou senha incorretos."); }
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
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>Usuário</label>
          <input value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="sindico" style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1E3A5F", marginBottom:6, textTransform:"uppercase", letterSpacing:.5 }}>Senha</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:14, color:"#1E3A5F", outline:"none", boxSizing:"border-box" }} />
        </div>
        {err && <p style={{ color:"#B03A2E", fontSize:13, margin:"0 0 14px", textAlign:"center" }}>{err}</p>}
        <button onClick={handle} style={{ width:"100%", padding:"12px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:15, fontWeight:600, cursor:"pointer", letterSpacing:.3 }}>
          Entrar
        </button>
        <p style={{ textAlign:"center", fontSize:11, color:"#aaa", marginTop:20, marginBottom:0 }}>
          Demo: usuário <b>sindico</b> / senha <b>vilareal140</b>
        </p>
      </div>
    </div>
  );
};

// ─── App Principal ───────────────────────────────────────

export default function App() {
  const [logado, setLogado] = useState(false);
  const [aba, setAba] = useState("dashboard");
  const [moradores, setMoradores] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vr_moradores")) || MOCK_MORADORES; } catch { return MOCK_MORADORES; }
  });
  const [cobrancas, setCobrancas] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vr_cobrancas")) || gerarCobrancas(MOCK_MORADORES, mesAtual()); } catch { return gerarCobrancas(MOCK_MORADORES, mesAtual()); }
  });
  const [taxa, setTaxa] = useState(() => parseFloat(localStorage.getItem("vr_taxa")) || 180);
  const [mesSel, setMesSel] = useState(mesAtual);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // { type, data }
  const [novoMorador, setNovoMorador] = useState({ nome:"", unidade:"", email:"", telefone:"" });
  const [pagForm, setPagForm] = useState({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" });
  const fileRef = useRef();

  useEffect(() => { localStorage.setItem("vr_moradores", JSON.stringify(moradores)); }, [moradores]);
  useEffect(() => { localStorage.setItem("vr_cobrancas", JSON.stringify(cobrancas)); }, [cobrancas]);
  useEffect(() => { localStorage.setItem("vr_taxa", taxa); }, [taxa]);

  const showToast = (msg, type="success") => setToast({ msg, type });

  const cobMes = cobrancas.filter(c => c.mes === mesSel);
  const pagos = cobMes.filter(c => c.status === "pago").length;
  const pendentes = cobMes.filter(c => c.status !== "pago").length;
  const totalArrecadado = pagos * taxa;
  const totalPendente = pendentes * taxa;

  // Gerar cobranças para mês se não existir
  const garantirMes = (mes) => {
    const existe = cobrancas.some(c => c.mes === mes);
    if (!existe) {
      const novas = gerarCobrancas(moradores, mes);
      setCobrancas(prev => [...prev, ...novas]);
    }
  };

  const mudarMes = (m) => { setMesSel(m); garantirMes(m); };

  const registrarPagamento = (moradorId) => {
    const arq = pagForm.arquivo;
    let arquivoBase64 = "";
    let arquivoNome = pagForm.arquivoNome;

    const salvar = (base64 = "") => {
      setCobrancas(prev => prev.map(c =>
        c.moradorId === moradorId && c.mes === mesSel
          ? { ...c, status:"pago", dataPagamento: new Date().toLocaleDateString("pt-BR"), obs: pagForm.obs, comprovante: base64, arquivoNome }
          : c
      ));
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

  const estornarPagamento = (moradorId) => {
    setCobrancas(prev => prev.map(c =>
      c.moradorId === moradorId && c.mes === mesSel
        ? { ...c, status:"pendente", dataPagamento:null, obs:"", comprovante:null, arquivoNome:"" }
        : c
    ));
    setModal(null);
    showToast("Pagamento estornado.", "error");
  };

  const adicionarMorador = () => {
    if (!novoMorador.nome || !novoMorador.unidade || !novoMorador.email) {
      showToast("Preencha nome, unidade e e-mail.", "error"); return;
    }
    const id = Date.now();
    const m = { ...novoMorador, id };
    const novosM = [...moradores, m];
    setMoradores(novosM);
    // adicionar cobrança para mês atual
    setCobrancas(prev => [...prev, { moradorId: id, mes: mesSel, status:"pendente", comprovante:null, dataPagamento:null, obs:"" }]);
    setNovoMorador({ nome:"", unidade:"", email:"", telefone:"" });
    setModal(null);
    showToast("Morador cadastrado!");
  };

  const removerMorador = (id) => {
    setMoradores(prev => prev.filter(m => m.id !== id));
    setCobrancas(prev => prev.filter(c => c.moradorId !== id));
    showToast("Morador removido.", "error");
  };

  const enviarLembretes = () => {
    const devedores = cobMes.filter(c => c.status !== "pago").map(c => moradores.find(m => m.id === c.moradorId)).filter(Boolean);
    if (devedores.length === 0) { showToast("Todos já pagaram! Nenhum lembrete necessário."); return; }
    // Simula envio (em produção: integrar EmailJS ou Firebase Functions)
    const lista = devedores.map(d => `• ${d.nome} (${d.unidade})`).join("\n");
    showToast(`📧 Lembretes enviados para ${devedores.length} morador(es):\n${lista}`);
  };

  const mesesDisponiveis = () => {
    const set = new Set(cobrancas.map(c => c.mes));
    set.add(mesAtual());
    return Array.from(set).sort().reverse();
  };

  // ── Sidebar ──
  const navItems = [
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"cobrancas", icon:"💰", label:"Cobranças" },
    { id:"moradores", icon:"👥", label:"Moradores" },
    { id:"config",    icon:"⚙️",  label:"Configurações" },
  ];

  if (!logado) return <Login onLogin={() => setLogado(true)} />;

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
        <button onClick={() => setLogado(false)} style={{ margin:"0 16px", padding:"9px", background:"rgba(176,58,46,.25)", border:"1px solid rgba(176,58,46,.4)", borderRadius:8, color:"#ff9a8b", cursor:"pointer", fontSize:13, fontWeight:600 }}>
          Sair
        </button>
      </aside>

      {/* Conteúdo */}
      <main style={{ flex:1, padding:"32px 32px 40px", overflow:"auto" }}>

        {/* ── Dashboard ── */}
        {aba === "dashboard" && (
          <div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#1E3A5F", margin:"0 0 8px", fontSize:26 }}>Dashboard</h2>
            <p style={{ color:"#6B7A8D", margin:"0 0 28px", fontSize:14 }}>Visão geral do condomínio · {mesLabel(mesSel)}</p>

            {/* Seletor de mês */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
              <label style={{ fontSize:13, color:"#1E3A5F", fontWeight:600 }}>Mês de referência:</label>
              <select value={mesSel} onChange={e=>mudarMes(e.target.value)} style={{ padding:"7px 12px", border:"1.5px solid #D0DAE6", borderRadius:8, fontSize:13, color:"#1E3A5F", background:"#fff" }}>
                {mesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </div>

            {/* Cards */}
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

            {/* Barra de progresso */}
            <div style={{ background:"#fff", borderRadius:12, padding:24, boxShadow:"0 2px 8px rgba(0,0,0,.06)", marginBottom:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#1E3A5F" }}>Taxa de adimplência — {mesLabel(mesSel)}</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#2E7D32" }}>{moradores.length ? Math.round((pagos/moradores.length)*100) : 0}%</span>
              </div>
              <div style={{ height:12, background:"#E8EDF3", borderRadius:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${moradores.length ? (pagos/moradores.length)*100 : 0}%`, background:"linear-gradient(90deg,#2E6DA4,#C9933A)", borderRadius:6, transition:"width .5s ease" }} />
              </div>
            </div>

            {/* Botão lembrete */}
            <button onClick={enviarLembretes} style={{ padding:"12px 24px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:9, fontSize:14, fontWeight:600, cursor:"pointer" }}>
              📧 Enviar Lembretes por E-mail ({pendentes} pendente{pendentes!==1?"s":""})
            </button>
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
                <button onClick={enviarLembretes} style={{ padding:"9px 18px", background:"#2E6DA4", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  📧 Enviar Lembretes
                </button>
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
                              <button onClick={() => { setPagForm({ obs:"", arquivo:null, arquivoNome:"", arquivoUrl:"" }); setModal({ type:"pagar", data:{ moradorId:m.id, nome:m.nome, unidade:m.unidade } }); }} style={{ padding:"5px 12px", background:"#E8F5E9", color:"#2E7D32", border:"1px solid #A5D6A7", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                ✓ Registrar Pgto
                              </button>
                            ) : (
                              <>
                                {cob.comprovante && (
                                  <button onClick={() => setModal({ type:"comprovante", data:{ comprovante:cob.comprovante, nome:m.nome, arquivoNome:cob.arquivoNome } })} style={{ padding:"5px 12px", background:"#E3F2FD", color:"#1565C0", border:"1px solid #90CAF9", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                    📄 Ver Comprovante
                                  </button>
                                )}
                                <button onClick={() => setModal({ type:"estorno", data:{ moradorId:m.id, nome:m.nome } })} style={{ padding:"5px 12px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                  ↩ Estornar
                                </button>
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
              <button onClick={() => setModal({ type:"novoMorador" })} style={{ padding:"10px 20px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                + Novo Morador
              </button>
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
                    <button onClick={() => { if(window.confirm(`Remover ${m.nome}?`)) removerMorador(m.id); }} style={{ marginTop:14, padding:"6px 14px", background:"#FFEBEE", color:"#B03A2E", border:"1px solid #EF9A9A", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                      Remover
                    </button>
                  </div>
                );
              })}
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
              <button onClick={() => showToast("Taxa atualizada com sucesso!")} style={{ marginTop:16, padding:"10px 24px", background:"#1E3A5F", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                Salvar
              </button>
              <hr style={{ margin:"28px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <h3 style={{ color:"#1E3A5F", margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Credenciais de acesso</h3>
              <div style={{ fontSize:13, color:"#6B7A8D", lineHeight:1.8, background:"#F0F4F8", borderRadius:8, padding:"12px 16px" }}>
                <div>Usuário: <b style={{color:"#1E3A5F"}}>sindico</b></div>
                <div>Senha: <b style={{color:"#1E3A5F"}}>vilareal140</b></div>
                <div style={{ marginTop:8, fontSize:11, color:"#aaa" }}>Para alterar senha, edite o arquivo de configuração ou integre ao Firebase Auth.</div>
              </div>
              <hr style={{ margin:"28px 0", border:"none", borderTop:"1px solid #E8EDF3" }} />
              <h3 style={{ color:"#1E3A5F", margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Sobre o sistema</h3>
              <div style={{ fontSize:12, color:"#6B7A8D", lineHeight:1.8 }}>
                <div>🏢 Condomínio Vila Real 140</div>
                <div>📦 Versão 1.0 · Dados salvos localmente</div>
                <div>🔧 Para produção: integre Firebase Firestore + Auth</div>
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

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
