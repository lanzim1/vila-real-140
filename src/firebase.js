import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyDy9MH6F6TGPcMHcw1cH9UPj4kEw_8o-Fk",
  authDomain: "vilareal140-ddf4d.firebaseapp.com",
  projectId: "vilareal140-ddf4d",
  storageBucket: "vilareal140-ddf4d.firebasestorage.app",
  messagingSenderId: "192063667247",
  appId: "1:192063667247:web:63381906f193d59f7a9ada"
};

const app = initializeApp(firebaseConfig);

/* ── App Check ──
   Confirma ao Firebase que a requisição vem mesmo deste site, e não de um script
   rodando em outro lugar. É o que dificulta criação de contas em massa e consulta
   direta à API com as credenciais que ficam visíveis no navegador.

   A chave abaixo é a "chave do site" do reCAPTCHA v3 — pública por natureza,
   feita para ficar no navegador. A chave secreta NÃO entra aqui: ela é usada
   pelo próprio Firebase e nunca deve aparecer no código do cliente.
*/
const CHAVE_RECAPTCHA = "6LeHsWotAAAAAD2BljnivAQXMxkcdnLGMmTci36y";

try {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(CHAVE_RECAPTCHA),
    isTokenAutoRefreshEnabled: true,
  });
} catch (e) {
  // Uma falha aqui não pode derrubar o sistema: sem App Check ele continua
  // funcionando, apenas sem essa camada extra de proteção.
  console.error("App Check não pôde ser iniciado:", e);
}

export const db = getFirestore(app);
export const auth = getAuth(app);

/* OBSERVAÇÃO IMPORTANTE SOBRE O MODO "APLICADO"

   No console, o App Check tem dois modos:

   · Não aplicado (monitoramento) — registra quais requisições passariam e quais
     seriam bloqueadas, mas não bloqueia nada. É onde ele deve ficar primeiro.

   · Aplicado — bloqueia de fato. Se a chave estiver errada ou algum domínio
     ficar de fora, o sistema para de funcionar para todos os usuários.

   Deixe em "Não aplicado" por alguns dias, confira nas métricas se as requisições
   estão sendo verificadas com sucesso, e só então mude para "Aplicado".
*/
