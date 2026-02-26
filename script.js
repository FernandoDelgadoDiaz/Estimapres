/* ════════════════════════════════════════════════════════════════
   PRESTIFY · script.js
   SaaS de Gestión de Préstamos — Módulo principal (Firebase ES Module)
   VERSIÓN CORREGIDA - CON CONEXIÓN TOTAL A WINDOW
   ════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
         serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref as sRef, uploadString, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ══ FIREBASE CONFIG ══ */
const firebaseConfig = {
  apiKey: "AIzaSyBuLQHhsOBTr2e8Kp5HKUz-a7xXgrgLlUI",
  authDomain: "estimapres.firebaseapp.com",
  projectId: "estimapres",
  storageBucket: "estimapres.firebasestorage.app",
  messagingSenderId: "578516597437",
  appId: "1:578516597437:web:f59994b87729aa1cd655d4"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* ══════════════════════════════════════════════════════════════
   CONSTANTES GLOBALES
   ══════════════════════════════════════════════════════════════ */
const GASTO_OTORGAMIENTO = 3; // 3% fijo sobre el monto solicitado
const SUPER_ADMIN_UID = "CuQqbuHWkTWdFPdknVTUAkx5Xri2";

/* ══════════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════════ */
const fmtMoney = n => isNaN(n) || n == null ? "$ 0" : "$ " + Number(Math.round(n)).toLocaleString("es-AR");
const digits = v => (v || "").replace(/\D+/g, "");
const nowTS = () => serverTimestamp();
const daysLate = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const el = id => document.getElementById(id);

function toast(msg, type = "info", dur = 3800) {
  const c = el("toastContainer");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

/* ══════════════════════════════════════════════════════════════
   SISTEMA FRANCÉS CORREGIDO - CON GASTOS AL CAPITAL
   ══════════════════════════════════════════════════════════════ */
function annuity(P, rate, m) {
  const i = (rate / 100) / 12;
  if (i === 0) return P / m;
  return P * i * Math.pow(1 + i, m) / (Math.pow(1 + i, m) - 1);
}

function calculateFrenchLoan(amount, months, tna) {
  // ✅ REGLA DE ORO: Sumar gasto de otorgamiento al capital
  const gastoOtorgAmt = Math.round(amount * GASTO_OTORGAMIENTO / 100);
  const capitalFinanciar = amount + gastoOtorgAmt;
  
  // Calcular cuota
  const cuota = Math.round(annuity(capitalFinanciar, tna, months));
  const totalAPagar = cuota * months;
  
  return {
    amount,
    months,
    tna,
    gastoOtorgAmt,
    capitalFinanciar,
    cuota,
    totalAPagar,
    intereses: totalAPagar - capitalFinanciar
  };
}

function scheduleRows(L) {
  const due = L.dueDay || 10;
  const base = L.activeAt?.toDate ? L.activeAt.toDate() : new Date();
  const gastoOtorgAmt = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin = L.capitalFinanciar || (L.amount || 0) + gastoOtorgAmt;
  const inst = (L.installment && L.installment > 0)
    ? L.installment
    : Math.round(annuity(capFin, L.tna, L.months));
  return Array.from({ length: L.months }, (_, k) => {
    const d = new Date(base.getFullYear(), base.getMonth() + k + 1, 1);
    d.setDate(Math.min(due, 28));
    return { n: k + 1, due: d.toISOString().slice(0, 10), amount: inst, paid: (L.paidCount || 0) > k };
  });
}

/* ══════════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════════════════ */
let gUser = null, gLenderId = null, gRefLenderId = null;
let gSettings = {
  tna: null, dueDay: null, appName: "Prestify", city: "Río Gallegos, Santa Cruz",
  expenses: 0, wa: "", logoBase64: "", mpToken: "", mpPublicKey: "",
  status: "activo", plazos: [3, 6, 9, 12, 18, 24], brandColor: "#1a56db", maxAmount: 1000000
};
let gActivateLoan = null, inactTab = "paid";
let gNotifications = [], gSnapshotUnsub = null, gStatusUnsub = null, knownPendingIds = new Set();
let gObSigData = null, gObPayMethod = "mp";

// Exponer gSettings globalmente
window.gSettings = gSettings;

/* ══════════════════════════════════════════════════════════════
   CONEXIÓN TOTAL - Exportar funciones al objeto window
   ══════════════════════════════════════════════════════════════ */

// Función para avanzar en el onboarding
window.nextStep = function(step) {
  console.log('nextStep called', step);
  if (typeof setObStep === 'function') {
    setObStep(step);
  } else {
    // Fallback manual
    const steps = [1, 2, 3];
    steps.forEach(s => {
      const stepEl = document.getElementById(`obStep${s}`);
      const contentEl = document.getElementById(`obContent${s}`);
      if (stepEl && contentEl) {
        if (s === step) {
          stepEl.className = 'ob-step active';
          contentEl.className = 'ob-content active';
        } else if (s < step) {
          stepEl.className = 'ob-step done';
          contentEl.className = 'ob-content';
        } else {
          stepEl.className = 'ob-step';
          contentEl.className = 'ob-content';
        }
      }
    });
  }
};

// Función para retroceder en el onboarding
window.prevStep = function(step) {
  console.log('prevStep called', step);
  const prev = step - 1;
  if (prev >= 1) {
    window.nextStep(prev);
  }
};

// Función para manejar el registro (abre onboarding)
window.handleSignup = function() {
  console.log('handleSignup called');
  if (typeof showOnboarding === 'function') {
    showOnboarding();
  } else {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.classList.add('show');
  }
};

// Función para calcular préstamo con sistema francés + gastos
window.calculateLoan = function() {
  console.log('calculateLoan called');
  
  // Obtener valores del DOM
  const amountInput = document.getElementById('simAmountInput') || 
                      document.getElementById('clientAmountSlider') ||
                      document.getElementById('simAmount');
  const monthsSelect = document.getElementById('simMonths');
  const monthsHidden = document.getElementById('simMonthsHidden');
  
  let amount = 0;
  let months = 0;
  
  if (amountInput) {
    if (amountInput.type === 'range' || amountInput.type === 'hidden') {
      amount = parseInt(amountInput.value) || 0;
    } else {
      const rawValue = amountInput.value || '';
      amount = parseInt(rawValue.replace(/\D/g, '')) || 0;
    }
  }
  
  if (monthsSelect && monthsSelect.value) {
    months = parseInt(monthsSelect.value) || 0;
  } else if (monthsHidden && monthsHidden.value) {
    months = parseInt(monthsHidden.value) || 0;
  }
  
  if (!amount || !months) {
    toast('Completá el monto y plazo primero', 'err');
    return null;
  }
  
  // Usar configuración global
  const tna = gSettings?.tna || 100;
  
  // ✅ REGLA DE ORO: Sumar gasto de otorgamiento al capital
  const result = calculateFrenchLoan(amount, months, tna);
  
  // Mostrar resultado
  const simResult = document.getElementById('simResult');
  if (simResult) {
    const expP = gSettings.expenses || 0;
    const expA = Math.round(amount * expP / 100);
    
    simResult.innerHTML = `
      <div class="sim-result-box">
        <div class="sim-cuota-display">
          <span class="sim-cuota-label">Cuota mensual</span>
          <span class="sim-cuota-value">${fmtMoney(result.cuota)}</span>
        </div>
        <div class="breakdown-box">
          <div class="breakdown-row"><span class="bl">Monto solicitado</span><span class="bv">${fmtMoney(amount)}</span></div>
          <div class="breakdown-row warn-row"><span class="bl">Gasto de otorgamiento (${GASTO_OTORGAMIENTO}%)</span><span class="bv">+ ${fmtMoney(result.gastoOtorgAmt)}</span></div>
          <div class="breakdown-row"><span class="bl">Capital a financiar</span><span class="bv">${fmtMoney(result.capitalFinanciar)}</span></div>
          ${expP > 0 ? `<div class="breakdown-row warn-row"><span class="bl">Gastos administrativos (${expP}%)</span><span class="bv">- ${fmtMoney(expA)}</span></div>` : ""}
          <div class="breakdown-row"><span class="bl">Neto a recibir</span><span class="bv" style="color:var(--ok)">${fmtMoney(amount - expA)}</span></div>
          <div class="breakdown-row"><span class="bl">Intereses proyectados</span><span class="bv" style="color:var(--purple)">${fmtMoney(result.intereses)}</span></div>
          <div class="breakdown-row accent"><span class="bl">Total a pagar</span><span class="bv">${fmtMoney(result.totalAPagar)}</span></div>
        </div>
      </div>
    `;
  }
  
  return result;
};

// Función para cerrar modal demo
window.closeDemoModal = function() {
  document.getElementById('demoModal')?.classList.remove('open');
};

// Función para seleccionar método de pago
window.selectPayMethod = function(method) {
  console.log('selectPayMethod', method);
  gObPayMethod = method;
  const mpOpt = document.getElementById('pmOptMP');
  const manualOpt = document.getElementById('pmOptManual');
  const mpFields = document.getElementById('obMpFields');
  const manualMsg = document.getElementById('obManualMsg');
  
  if (mpOpt) mpOpt.classList.toggle('selected', method === 'mp');
  if (manualOpt) manualOpt.classList.toggle('selected', method === 'manual');
  if (mpFields) mpFields.style.display = method === 'mp' ? 'block' : 'none';
  if (manualMsg) manualMsg.style.display = method === 'manual' ? 'block' : 'none';
};

// Funciones Moni
window.moniUpdateSlider = function(slider) {
  const val = parseInt(slider.value) || 50000;
  const display = document.getElementById('moniAmountDisplay');
  if (display) display.textContent = '$ ' + val.toLocaleString('es-AR');
  const pct = ((val - parseInt(slider.min)) / (parseInt(slider.max) - parseInt(slider.min))) * 100;
  slider.style.background = 'linear-gradient(to right, #10b981 0%, #10b981 ' + pct + '%, #e2e8f0 ' + pct + '%)';
};

window.moniSimular = function() {
  const amount = parseInt(document.getElementById('moniSlider')?.value) || 50000;
  const months = window.moniMonths || 3;
  const tna = window.moniTna || 100;
  
  const tnaDecimal = tna / 100;
  const tmv = Math.pow(1 + tnaDecimal, 1/12) - 1;
  let cuota;
  if (tmv === 0) {
    cuota = amount / months;
  } else {
    cuota = amount * (tmv * Math.pow(1+tmv, months)) / (Math.pow(1+tmv, months) - 1);
  }
  const total = cuota * months;

  document.getElementById('moniResCapital').textContent = fmtMoney(amount);
  document.getElementById('moniResPlazo').textContent = months + ' meses';
  document.getElementById('moniResTna').textContent = tna + '%';
  document.getElementById('moniResCuota').textContent = fmtMoney(cuota);
  document.getElementById('moniResTotal').textContent = fmtMoney(total);
  document.getElementById('moniSimResult').style.display = 'block';
  document.getElementById('moniSucCapital').textContent = fmtMoney(amount);
  document.getElementById('moniSucCuota').textContent = fmtMoney(cuota);
};

window.moniShowForm = function() {
  document.getElementById('moniSimResult').style.display = 'none';
  document.getElementById('moniFormSection').style.display = 'block';
  document.getElementById('moniFormSection').scrollIntoView({behavior:'smooth', block:'start'});
};

window.moniEnviarSolicitud = function() {
  const name = document.getElementById('moniName')?.value.trim();
  const dni = document.getElementById('moniDni')?.value.trim();
  const email = document.getElementById('moniEmail')?.value.trim();
  
  if (!name || !dni || !email) {
    alert('Completá nombre, DNI y email para continuar.');
    return;
  }
  
  // Disparar evento para el módulo principal
  const evt = new CustomEvent('moniSolicitud', {
    detail: {
      name, dni, email,
      phone: document.getElementById('moniPhone')?.value.trim(),
      alias: document.getElementById('moniAlias')?.value.trim(),
      amount: parseInt(document.getElementById('moniSlider')?.value) || 50000,
      months: window.moniMonths || 3
    }
  });
  document.dispatchEvent(evt);
  
  // Mostrar éxito
  document.getElementById('moniFormSection').style.display = 'none';
  document.getElementById('moniSimCard').style.display = 'none';
  document.getElementById('moniSuccessSection').style.display = 'block';
  document.getElementById('moniLenderContactName').textContent = window.moniLenderName || 'tu financiera';
  
  if (window.moniLenderWa) {
    const waDiv = document.getElementById('moniWaContact');
    const waLink = document.getElementById('moniWaLink');
    const msg = encodeURIComponent('Hola! Acabo de enviar una solicitud de préstamo. Soy ' + name + ', DNI ' + dni);
    waLink.href = 'https://wa.me/' + window.moniLenderWa + '?text=' + msg;
    waDiv.style.display = 'block';
  }
};

console.log('✅ Funciones expuestas a window:', 
  Object.keys(window).filter(k => 
    ['nextStep', 'prevStep', 'handleSignup', 'calculateLoan', 'closeDemoModal', 
     'selectPayMethod', 'moniUpdateSlider', 'moniSimular', 'moniShowForm', 'moniEnviarSolicitud'].includes(k)
  )
);

/* ══════════════════════════════════════════════════════════════
   MULTITENANT — ?ref= captura inmediata
   ══════════════════════════════════════════════════════════════ */
(() => {
  const params = new URLSearchParams(location.search);
  const urlRef = params.get("ref");
  if (urlRef) {
    gRefLenderId = urlRef;
    sessionStorage.setItem("prestify_ref", urlRef);
    window.moniLenderId = urlRef;
  } else {
    sessionStorage.removeItem("prestify_ref");
    gRefLenderId = null;
  }
})();

/* ══════════════════════════════════════════════════════════════
   ROUTING
   ══════════════════════════════════════════════════════════════ */
function showLandingPage() {
  el("landingView")?.classList.add("show");
  document.body.classList.add("landing-active");
  el("heroSection").style.display = "none";
  el("clientView").style.display = "none";
  el("adminView").className = "admin-wrap";
  el("superadminView")?.classList.remove("show");
  el("btnViewClient").style.display = "none";
  el("btnViewAdmin").style.display = "none";
  renderLandingPage();
}

function hideLandingPage() {
  el("landingView")?.classList.remove("show");
  document.body.classList.remove("landing-active");
  el("btnViewClient").style.display = "";
  el("btnViewAdmin").style.display = "";
}

function renderLandingPage() {
  const lv = el("landingView");
  if (!lv) return;
  document.body.classList.add("landing-active");
  const rvEls = lv.querySelectorAll(".rv");
  if (!rvEls.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
  rvEls.forEach(e => io.observe(e));
}

// Inicialización
(() => {
  if (!gRefLenderId) {
    el("btnViewClient").style.display = "none";
    el("btnViewAdmin").style.display = "none";
    requestAnimationFrame(() => setTimeout(renderLandingPage, 60));
  } else {
    const lv = el("landingView");
    if (lv) lv.classList.remove("show");
    document.body.classList.remove("landing-active");
    el("heroSection").style.display = "none";
    el("clientView").style.display = "none";
    el("btnViewClient").style.display = "none";
    el("btnViewAdmin").style.display = "none";
  }
})();

// Landing CTAs
function openRegisterFlow() {
  if (auth.currentUser) {
    signOut(auth).then(() => {
      hideLandingPage();
      el("heroSection").style.display = "none";
      el("clientView").style.display = "none";
      el("adminView").className = "admin-wrap visible";
      el("btnViewClient").style.display = "";
      el("btnViewAdmin").style.display = "";
    });
    return;
  }
  hideLandingPage();
  el("heroSection").style.display = "none";
  el("clientView").style.display = "none";
  el("adminView").className = "admin-wrap visible";
  el("btnViewClient").style.display = "";
  el("btnViewAdmin").style.display = "";
}
el("btnLandingRegister")?.addEventListener("click", openRegisterFlow);
el("btnLandingRegister2")?.addEventListener("click", openRegisterFlow);
el("btnLandingLogin")?.addEventListener("click", e => { e.preventDefault(); openRegisterFlow(); });

/* ══════════════════════════════════════════════════════════════
   HELPERS FIRESTORE
   ══════════════════════════════════════════════════════════════ */
const effectiveLid = () => gLenderId || gRefLenderId;
const loanQ = (...c) => query(collection(db, "loans"), where("lenderId", "==", effectiveLid()), ...c);
const settRef = () => doc(db, "settings", effectiveLid());
const lenderRef = id => doc(db, "lenders", id);
const hasMpToken = () => !!(gSettings.mpToken && gSettings.mpToken.length > 10);

/* ══════════════════════════════════════════════════════════════
   OVERLAYS — SUSPENDIDO / PENDIENTE
   ══════════════════════════════════════════════════════════════ */
function checkSuspended() {
  if (gSettings.status === "pausado") {
    el("suspendedOverlay")?.classList.add("show");
    el("pendingOverlay")?.classList.remove("show");
    const adminC = el("adminContent");
    if (adminC) adminC.style.display = "none";
    return true;
  }
  el("suspendedOverlay")?.classList.remove("show");
  return false;
}

function checkPending() {
  if (gSettings.status === "pendiente") {
    el("pendingOverlay")?.classList.add("show");
    const adminC = el("adminContent");
    if (adminC) adminC.style.display = "none";
    return true;
  }
  el("pendingOverlay")?.classList.remove("show");
  return false;
}

/* ══════════════════════════════════════════════════════════════
   BRANDING
   ══════════════════════════════════════════════════════════════ */
async function loadLenderBranding(lid) {
  try {
    const snap = await getDoc(lenderRef(lid));
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.primaryColor) document.documentElement.style.setProperty("--blue", d.primaryColor);
    if (d.accentColor) document.documentElement.style.setProperty("--sky", d.accentColor);
    Object.assign(gSettings, {
      appName: d.appName || gSettings.appName,
      city: d.city || gSettings.city,
      tna: d.tna || gSettings.tna,
      dueDay: d.dueDay || gSettings.dueDay,
      expenses: d.expenses || gSettings.expenses,
      logoBase64: d.logoBase64 || gSettings.logoBase64,
      wa: d.wa || gSettings.wa,
      mpToken: d.mpToken || "",
      mpPublicKey: d.mpPublicKey || "",
      status: d.status || "activo",
      plazos: d.plazos || gSettings.plazos,
      brandColor: d.brandColor || gSettings.brandColor || "#1a56db",
      maxAmount: d.maxAmount || gSettings.maxAmount || 1000000
    });
    applyBranding();
    refreshSimMeta();
  } catch (e) { console.warn("Branding:", e); }
}

function applyBranding() {
  const name = gSettings.appName || "Prestify";
  document.title = name + " · Tu financiera, digitalizada";

  const mark = el("logoMark");
  if (mark) {
    if (gSettings.logoBase64) {
      mark.innerHTML = `<img src="${gSettings.logoBase64}" alt="logo"/>`;
    } else {
      mark.textContent = name.replace(/\s+/g, "").slice(0, 1).toUpperCase();
    }
  }
  
  const mid = Math.ceil(name.length / 2);
  const ln = el("logoName");
  if (ln) {
    ln.innerHTML = `${name.slice(0, mid)}<span>${name.slice(mid)}</span>`;
  }

  // ✅ REGLA DE ORO: Actualizar variables CSS del brand color
  const brandColor = gSettings.brandColor || "#1a56db";
  document.documentElement.style.setProperty("--brand-color", brandColor);
  document.documentElement.style.setProperty("--blue", brandColor);
  document.documentElement.style.setProperty("--blue-light", brandColor);
  
  console.log('🎨 Branding aplicado:', { name, brandColor });

  // Modo portal cliente
  if (gRefLenderId && !gLenderId) {
    document.body.classList.add("client-mode");
    
    const style = document.createElement('style');
    style.textContent = `
      body.client-mode .btn-primary {
        background: ${brandColor} !important;
      }
      body.client-mode .client-pill.active {
        background: ${brandColor};
        border-color: ${brandColor};
      }
      body.client-mode .client-amount-display {
        color: ${brandColor};
      }
    `;
    document.head.appendChild(style);
    
    const maxAmt = gSettings.maxAmount || 1000000;
    const sliderEl = el("clientAmountSlider");
    if (sliderEl) {
      sliderEl.max = maxAmt;
      if (Number(sliderEl.value) > maxAmt) sliderEl.value = Math.round(maxAmt * 0.05);
      const disp = el("clientAmountDisplay");
      if (disp) disp.textContent = "$ " + Number(sliderEl.value).toLocaleString("es-AR");
      const sa = el("simAmount");
      if (sa) sa.value = sliderEl.value;
    }
    
    const maxLbl = el("sliderMaxLabel");
    if (maxLbl) maxLbl.textContent = "$ " + maxAmt.toLocaleString("es-AR");
    
    const bh = el("lenderBrandHeader");
    if (bh) bh.style.display = "";
    const bn = el("lenderBrandName");
    if (bn) bn.textContent = name;
  }
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════════ */
async function loadSettings() {
  if (!effectiveLid()) return;
  try {
    const s = await getDoc(settRef());
    if (s.exists()) gSettings = { ...gSettings, ...s.data() };
  } catch { }
  if (gRefLenderId && !gLenderId) await loadLenderBranding(gRefLenderId);
  applyBranding();
  refreshSimMeta();
  
  const sv = (id, v) => { const e = el(id); if (e) e.value = v || ""; };
  sv("cfgTna", gSettings.tna || "");
  sv("cfgDue", gSettings.dueDay || "");
  sv("cfgAppName", gSettings.appName || "");
  sv("cfgCity", gSettings.city || "");
  sv("cfgExpenses", gSettings.expenses || 0);
  sv("cfgWa", gSettings.wa || "");
  sv("cfgMaxAmount", gSettings.maxAmount || 1000000);

  const mpTok = el("cfgMpToken");
  if (mpTok) mpTok.placeholder = gSettings.mpToken ? "••••••••••••••••" : "APP_USR-xxxxxxxxxxxx";
  const mpPub = el("cfgMpPublicKey");
  if (mpPub) mpPub.value = gSettings.mpPublicKey || "";

  const prev = el("cfgLogoPreview");
  if (prev) {
    if (gSettings.logoBase64) prev.innerHTML = `<img src="${gSettings.logoBase64}" alt="logo"/>`;
    else prev.textContent = (gSettings.appName || "P").replace(/\s+/g, "").slice(0, 2).toUpperCase();
  }
  const bcEl = el("cfgBrandColor");
  if (bcEl && gSettings.brandColor) bcEl.value = gSettings.brandColor;

  const mpB = el("mpStatusBadge");
  if (mpB) mpB.innerHTML = gSettings.mpToken
    ? `<span class="mp-connected">Mercado Pago conectado y activo</span>`
    : `<span class="mp-disconnected">Sin token MP — modo transferencia manual activo</span>`;

  const plazosActivos = Array.isArray(gSettings.plazos) && gSettings.plazos.length > 0
    ? gSettings.plazos : [3, 6, 9, 12, 18, 24];
  for (let n = 1; n <= 24; n++) {
    const cb = el(`plazo${n}`);
    if (cb) cb.checked = plazosActivos.includes(n);
  }
  refreshPlazoSelector();

  const linkEl = el("myLinkPreview");
  if (linkEl && gLenderId) linkEl.textContent = location.origin + location.pathname + "?ref=" + gLenderId;

  if (gLenderId) { checkSuspended(); checkPending(); }
}

function refreshSimMeta() {
  const s = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  s("lblTna", (gSettings.tna || "--") + "%");
  s("lblDue", gSettings.dueDay || "--");
  const h = el("heroTna");
  if (h) h.innerHTML = gSettings.tna ? `${gSettings.tna}<small>%</small>` : `&#8212;<small>%</small>`;
  const d = el("heroDue");
  if (d) d.innerHTML = gSettings.dueDay ? `${gSettings.dueDay}<small>del mes</small>` : `&#8212;<small>del mes</small>`;
  if (gSettings.expenses > 0) {
    const m = el("lblExpMeta"); if (m) m.style.display = "";
    const le = el("lblExp"); if (le) le.textContent = gSettings.expenses + "%";
  }
  refreshPlazoSelector();
}

function refreshPlazoSelector() {
  const sel = el("simMonths");
  if (sel) {
    const plazos = Array.isArray(gSettings.plazos) && gSettings.plazos.length > 0
      ? [...gSettings.plazos].sort((a, b) => a - b) : [3, 6, 9, 12, 18, 24];
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Seleccioná un plazo —</option>`;
    plazos.forEach(n => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n + (n === 1 ? " mes" : " meses");
      if (String(n) === String(cur)) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  
  const pillsContainer = el("clientPillsContainer");
  if (pillsContainer) {
    const plazos = Array.isArray(gSettings.plazos) && gSettings.plazos.length > 0
      ? [...gSettings.plazos].sort((a, b) => a - b) : [3, 6, 9, 12, 18, 24];
    const currentVal = el("simMonthsHidden")?.value || "";
    pillsContainer.innerHTML = plazos.map(n =>
      `<button type="button" class="client-pill${String(n) === String(currentVal) ? " active" : ""}" data-months="${n}">${n} ${n === 1 ? "mes" : "m"}</button>`
    ).join("");
    pillsContainer.querySelectorAll(".client-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        pillsContainer.querySelectorAll(".client-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        const mh = el("simMonthsHidden");
        if (mh) mh.value = pill.dataset.months;
        autoSimClient();
      });
    });
  }
}

function getSimMonths() {
  if (gRefLenderId && !gLenderId) return Number(el("simMonthsHidden")?.value || 0);
  return Number(el("simMonths")?.value || 0);
}

function getSimAmount() {
  if (gRefLenderId && !gLenderId) {
    const manualEl = el("clientAmountManual");
    const manualVal = manualEl ? Number(digits(manualEl.value)) : 0;
    if (manualVal > 0) return manualVal;
    return Number(el("clientAmountSlider")?.value || el("simAmount")?.value || 0);
  }
  return Number(digits(el("simAmountInput")?.value || el("simAmount")?.value || ""));
}

function autoSimClient() {
  const amt = getSimAmount(), m = getSimMonths();
  if (!amt || !m || !gSettings.tna) return;
  const gastoOtorgAmt = Math.round(amt * GASTO_OTORGAMIENTO / 100);
  const capitalFinanciar = amt + gastoOtorgAmt;
  const cuota = Math.round(annuity(capitalFinanciar, gSettings.tna, m));
  let hero = el("clientCuotaHero");
  if (!hero) {
    hero = document.createElement("div");
    hero.id = "clientCuotaHero";
    hero.className = "client-cuota-hero";
    const simResult = el("simResult");
    if (simResult) simResult.parentNode.insertBefore(hero, simResult);
  }
  hero.innerHTML = `<div class="client-cuota-label">Tu cuota mensual</div>
    <div class="client-cuota-value">${fmtMoney(cuota)}</div>
    <div class="client-cuota-months">${m} cuotas · TNA ${gSettings.tna}%</div>`;
}

/* ══════════════════════════════════════════════════════════════
   ONBOARDING — 3 pasos
   ══════════════════════════════════════════════════════════════ */
let gObStep = 1;

function initObSigCanvas() {
  const canvas = el("obSigCanvas");
  if (!canvas) return;
  canvas.width = canvas.parentElement.clientWidth || 460;
  canvas.height = 150;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  let drawing = false, lx = 0, ly = 0;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX - r.left, y: s.clientY - r.top };
  };
  canvas.onmousedown = e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.onmousemove = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.onmouseup = canvas.onmouseleave = () => drawing = false;
  canvas.ontouchstart = e => { e.preventDefault(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.ontouchmove = e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.ontouchend = e => { e.preventDefault(); drawing = false; };
}

function setObStep(step) {
  gObStep = step;
  [1, 2, 3].forEach(i => {
    el(`obStep${i}`).className = "ob-step" + (i < step ? " done" : i === step ? " active" : "");
    el(`obContent${i}`).className = "ob-content" + (i === step ? " active" : "");
  });
}

async function showOnboarding() {
  el("onboardingOverlay")?.classList.add("show");
  setTimeout(initObSigCanvas, 200);
}

el("btnObClearSig")?.addEventListener("click", () => {
  const c = el("obSigCanvas"); if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  gObSigData = null;
});

el("btnObStep1")?.addEventListener("click", () => {
  const name = (el("obName")?.value || "").trim();
  const dni = digits(el("obDni")?.value);
  const email = (el("obEmail")?.value || "").trim();
  if (!name || !dni || !email) { toast("Completá nombre, DNI y email.", "err"); return; }
  if (!el("obConsentCheck")?.checked) { toast("Debés aceptar los términos de uso.", "err"); return; }
  const canvas = el("obSigCanvas");
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(data).some((v, i) => i % 4 === 3 && v > 0)) {
    toast("Dibujá tu firma para continuar.", "err"); return;
  }
  gObSigData = canvas.toDataURL("image/png");
  setObStep(2);
});

el("btnObBack1")?.addEventListener("click", () => setObStep(1));
el("btnObStep2")?.addEventListener("click", () => {
  const appName = (el("obAppName")?.value || "").trim();
  const tna = Number(digits(el("obTna")?.value));
  const due = Number(digits(el("obDueDay")?.value));
  if (!appName) { toast("Ingresá el nombre del negocio.", "err"); return; }
  if (!tna || tna < 1) { toast("Ingresá la TNA.", "err"); return; }
  if (!due || due < 1 || due > 28) { toast("Día de vencimiento entre 1 y 28.", "err"); return; }
  setObStep(3);
});

el("btnObBack2")?.addEventListener("click", () => setObStep(2));

el("btnObFinish")?.addEventListener("click", async () => {
  if (!gLenderId) { toast("Error de sesión. Recargá la página.", "err"); return; }
  el("btnObFinish").disabled = true;
  el("btnObFinish").textContent = "Guardando...";
  try {
    const cfg = {
      lenderId: gLenderId,
      appName: (el("obAppName")?.value || "Prestify").trim(),
      city: (el("obCity")?.value || "Río Gallegos, Santa Cruz").trim(),
      tna: Number(digits(el("obTna")?.value)),
      dueDay: Math.min(28, Math.max(1, Number(digits(el("obDueDay")?.value)))),
      expenses: Number(el("obExpenses")?.value || 0),
      wa: (el("obWa")?.value || "").trim(),
      status: "pendiente",
      plazos: [3, 6, 9, 12, 18, 24],
      onboardingDone: true,
      onboardingAt: nowTS(),
      operator: {
        name: (el("obName")?.value || "").trim(),
        dni: digits(el("obDni")?.value),
        email: (el("obEmail")?.value || "").trim(),
        consentSignedAt: new Date().toISOString(),
        signatureImg: gObSigData || ""
      },
      updatedAt: nowTS()
    };
    if (gObPayMethod === "mp") {
      const tok = (el("obMpToken")?.value || "").trim();
      const pub = (el("obMpPublicKey")?.value || "").trim();
      if (tok) cfg.mpToken = tok;
      if (pub) cfg.mpPublicKey = pub;
    }
    await Promise.all([
      setDoc(settRef(), cfg, { merge: true }),
      setDoc(lenderRef(gLenderId), cfg, { merge: true })
    ]);
    Object.assign(gSettings, cfg);
    applyBranding(); refreshSimMeta();
    el("onboardingOverlay")?.classList.remove("show");
    toast("✅ Cuenta registrada. Aguardá la activación de tu financiera.", "ok", 6000);
    checkPending();
  } catch (e) {
    toast("Error al guardar. Intentá de nuevo.", "err");
    el("btnObFinish").disabled = false;
    el("btnObFinish").textContent = "✓ Crear mi cuenta";
    console.error(e);
  }
});

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async u => {
  gUser = u; gLenderId = u ? u.uid : null;
  const ok = !!u;
  
  if (ok) {
    const saBtn = el("btnViewSuperAdmin");
    if (saBtn) saBtn.style.display = (u.uid === SUPER_ADMIN_UID) ? "" : "none";
    hideLandingPage();

    if (u.uid === SUPER_ADMIN_UID) {
      el("heroSection").style.display = "none";
      el("clientView").style.display = "none";
      el("adminView").className = "admin-wrap";
      el("superadminView")?.classList.add("show");
      loadSuperAdmin();
      return;
    }

    el("heroSection").style.display = "none";
    el("clientView").style.display = "none";
    el("adminView").className = "admin-wrap visible";
    el("btnViewClient").style.display = "";
    el("btnViewAdmin").style.display = "";
    await loadSettings();
    if (checkSuspended()) return;
    if (checkPending()) { startStatusListener(); return; }

    const lenderSnap = await getDoc(lenderRef(gLenderId));
    if (!lenderSnap.exists() || !lenderSnap.data().onboardingDone) {
      showOnboarding();
    } else {
      showView("admin");
      await loadAllAdmin();
    }
    startRealtimeListener();
    startStatusListener();
  } else {
    const saBtn = el("btnViewSuperAdmin");
    if (saBtn) saBtn.style.display = "none";
    if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; }
    if (!gRefLenderId) {
      showLandingPage();
    } else {
      el("landingView")?.classList.remove("show");
      el("btnViewClient").style.display = "";
      el("btnViewAdmin").style.display = "";
      showView("client");
      await loadSettings();
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   STATUS LISTENER CORREGIDO - onSnapshot en tiempo real
   ══════════════════════════════════════════════════════════════ */
function startStatusListener() {
  if (!gLenderId || gStatusUnsub) return;
  
  console.log('🎧 Iniciando status listener para lender:', gLenderId);
  
  gStatusUnsub = onSnapshot(
    lenderRef(gLenderId),
    (snap) => {
      if (!snap.exists()) {
        console.warn('Documento lender no existe');
        return;
      }
      
      const data = snap.data();
      const prevStatus = gSettings.status;
      const newStatus = data.status || 'activo';
      
      console.log('📡 Status update:', { prev: prevStatus, new: newStatus });
      
      gSettings.status = newStatus;
      if (data.plazos) gSettings.plazos = data.plazos;
      if (data.brandColor) {
        gSettings.brandColor = data.brandColor;
        applyBranding();
      }
      
      // ✅ REGLA DE ORO: Actualizar overlay en tiempo real
      const pendingOverlay = document.getElementById('pendingOverlay');
      const suspendedOverlay = document.getElementById('suspendedOverlay');
      const adminContent = document.getElementById('adminContent');
      
      if (newStatus === 'pendiente') {
        console.log('🔴 Mostrando overlay de pendiente');
        if (pendingOverlay) pendingOverlay.classList.add('show');
        if (suspendedOverlay) suspendedOverlay.classList.remove('show');
        if (adminContent) adminContent.style.display = 'none';
        
        if (gSnapshotUnsub) {
          gSnapshotUnsub();
          gSnapshotUnsub = null;
        }
      } else if (newStatus === 'pausado') {
        console.log('⛔ Mostrando overlay de suspendido');
        if (suspendedOverlay) suspendedOverlay.classList.add('show');
        if (pendingOverlay) pendingOverlay.classList.remove('show');
        if (adminContent) adminContent.style.display = 'none';
        
        if (gSnapshotUnsub) {
          gSnapshotUnsub();
          gSnapshotUnsub = null;
        }
      } else if (newStatus === 'activo') {
        console.log('✅ Cuenta activada - ocultando overlays');
        
        if (pendingOverlay) pendingOverlay.classList.remove('show');
        if (suspendedOverlay) suspendedOverlay.classList.remove('show');
        
        if (gUser) {
          if (adminContent) adminContent.style.display = '';
          
          if (prevStatus === 'pendiente') {
            toast('🎉 ¡Tu cuenta fue activada! Bienvenido a Prestify.', 'ok', 6000);
            loadAllAdmin();
          }
          
          if (!gSnapshotUnsub) {
            startRealtimeListener();
          }
        }
      }
      
      refreshSimMeta();
    },
    (error) => {
      console.error('❌ Error en status listener:', error);
      toast('Error al monitorear estado de la cuenta', 'err');
    }
  );
}

/* ══════════════════════════════════════════════════════════════
   LOGIN / LOGOUT
   ══════════════════════════════════════════════════════════════ */
async function doLogin() {
  const email = prompt("Email de administrador:") || "";
  const pass = prompt("Contraseña:") || "";
  if (!email || !pass) return;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Sesión iniciada", "ok");
  } catch { toast("Credenciales incorrectas", "err"); }
}
el("btnAdminLogin").onclick = doLogin;
el("btnAdminLogin2").onclick = doLogin;
el("btnLogout").onclick = () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => toast("Sesión cerrada", "info")).catch(() => { });
};
el("btnPendingLogout").onclick = () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => {
    el("pendingOverlay")?.classList.remove("show");
    toast("Sesión cerrada", "info");
  }).catch(() => { });
};
el("btnResetPass").onclick = async () => {
  const email = prompt("Ingresá tu email:");
  if (!email) return;
  try { await sendPasswordResetEmail(auth, email); toast("Email de recuperación enviado", "ok"); }
  catch { toast("No se pudo enviar", "err"); }
};

/* ══════════════════════════════════════════════════════════════
   NOTIFICACIONES EN TIEMPO REAL
   ══════════════════════════════════════════════════════════════ */
function startRealtimeListener() {
  if (!gLenderId || gSnapshotUnsub) return;
  const q = query(
    collection(db, "loans"),
    where("lenderId", "==", gLenderId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  getDocs(q).then(snap => snap.forEach(d => knownPendingIds.add(d.id)));
  gSnapshotUnsub = onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const id = change.doc.id;
        if (!knownPendingIds.has(id)) {
          knownPendingIds.add(id);
          const data = change.doc.data();
          fireNewRequestAlert(data.borrower?.name || "Cliente", fmtMoney(data.amount), id);
        }
      }
    });
  }, err => console.error("onSnapshot error:", err));
}

function fireNewRequestAlert(name, amt, id) {
  gNotifications.unshift({ id, name, amt, time: new Date().toLocaleTimeString("es-AR"), unread: true });
  renderNotifDropdown(); updateNotifBadge();
  const t = document.createElement("div");
  t.className = "toast new-req";
  t.innerHTML = `<span style="font-size:22px">🔔</span>
    <div><div style="font-weight:800;font-size:14px">${name} solicitó ${amt}</div>
    <div style="font-size:11px;opacity:.7;margin-top:2px">Click para ir a Pendientes →</div></div>`;
  t.onclick = () => { showView("admin"); switchTab("Pending"); t.remove(); };
  el("toastContainer")?.appendChild(t);
  setTimeout(() => t.remove(), 9000);
  el("alertBannerText").textContent = `Nueva solicitud de ${name} · ${amt}`;
  const banner = el("alertBanner");
  banner?.classList.add("show");
  setTimeout(() => banner?.classList.remove("show"), 7000);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      const t0 = ctx.currentTime + (i * 0.18);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.start(t0); osc.stop(t0 + 0.35);
    });
  } catch { }
  loadPend(); computeDashboard();
}

function renderNotifDropdown() {
  const list = el("notifList");
  if (!gNotifications.length) { list.innerHTML = `<div class="notif-empty">Sin notificaciones nuevas</div>`; return; }
  list.innerHTML = gNotifications.slice(0, 20).map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" data-notif-id="${n.id}">
      <div class="notif-item-title">🔔 Nueva solicitud · ${n.name}</div>
      <div class="notif-item-sub">${n.amt} · ${n.time}</div>
    </div>`).join("");
  list.querySelectorAll(".notif-item").forEach(item => {
    item.onclick = () => { showView("admin"); switchTab("Pending"); el("notifDropdown")?.classList.remove("open"); };
  });
}

function updateNotifBadge() {
  const count = gNotifications.filter(n => n.unread).length;
  const badge = el("notifBadge");
  if (!badge) return;
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent = count > 9 ? "9+" : count;
}

el("notifBell")?.addEventListener("click", () => {
  el("notifDropdown")?.classList.toggle("open");
  gNotifications.forEach(n => n.unread = false);
  updateNotifBadge(); renderNotifDropdown();
});

el("btnClearNotifs")?.addEventListener("click", () => {
  gNotifications = []; renderNotifDropdown(); updateNotifBadge();
  el("notifDropdown")?.classList.remove("open");
});

el("alertBannerClose")?.addEventListener("click", () => el("alertBanner")?.classList.remove("show"));

document.addEventListener("click", e => {
  if (!el("notifWrap")?.contains(e.target)) el("notifDropdown")?.classList.remove("open");
});

/* ══════════════════════════════════════════════════════════════
   VISTAS Y TABS
   ══════════════════════════════════════════════════════════════ */
function showView(v) {
  el("landingView")?.classList.remove("show");
  document.body.classList.remove("landing-active");
  el("superadminView")?.classList.remove("show");
  const a = v === "admin";
  const sa = v === "superadmin";
  if (el("clientView")) el("clientView").style.display = (a || sa) ? "none" : "";
  if (el("heroSection")) el("heroSection").style.display = (a || sa) ? "none" : "";
  if (el("adminView")) el("adminView").className = "admin-wrap" + ((a && !sa) ? " visible" : "");
  if (el("btnViewClient")) el("btnViewClient").className = "nav-btn" + ((!a && !sa) ? " active" : "");
  if (el("btnViewAdmin")) el("btnViewAdmin").className = "nav-btn" + ((a && !sa) ? " active" : "");
  const saBtn = el("btnViewSuperAdmin");
  if (saBtn) saBtn.className = "nav-btn" + (sa ? " active" : "");
  if (sa) el("superadminView")?.classList.add("show");
}

el("btnViewClient")?.addEventListener("click", () => showView("client"));
el("btnViewAdmin")?.addEventListener("click", () => showView("admin"));
el("btnViewSuperAdmin")?.addEventListener("click", () => { showView("superadmin"); loadSuperAdmin(); });

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("visible"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  const cnt = el("tab" + tabName);
  if (cnt) cnt.classList.add("visible");
}

document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ══════════════════════════════════════════════════════════════
   SIMULADOR (usando calculateLoan)
   ══════════════════════════════════════════════════════════════ */
el("btnSim")?.addEventListener("click", () => {
  window.calculateLoan();
});

/* ══════════════════════════════════════════════════════════════
   SOLICITUD DE PRÉSTAMO
   ══════════════════════════════════════════════════════════════ */
el("btnSendReq")?.addEventListener("click", async () => {
  const montoSolicitado = getSimAmount();
  const months = getSimMonths();
  if (!montoSolicitado || !months) { toast("Completá el Simulador primero.", "err"); return; }
  const borrower = {
    name: (el("bName")?.value || "").trim(),
    dni: digits(el("bDni")?.value),
    email: (el("bEmail")?.value || "").trim(),
    phone: (el("bPhone")?.value || "").trim(),
    alias: (el("bAlias")?.value || "").trim()
  };
  if (!borrower.name || !borrower.dni) { toast("Completá nombre y DNI.", "err"); return; }

  const urlParams = new URLSearchParams(window.location.search);
  const urlRef = urlParams.get("ref") || gRefLenderId || sessionStorage.getItem("prestify_ref");
  const lid = urlRef || gLenderId;
  if (!lid) {
    toast("Error: no se detectó el prestamista.", "err");
    return;
  }
  if (!gSettings.tna) { toast("Error: no se pudo cargar la configuración.", "err"); return; }

  const result = calculateFrenchLoan(montoSolicitado, months, gSettings.tna);

  try {
    const loanDoc = {
      status: "pending",
      lenderId: lid,
      amount: montoSolicitado,
      gastoOtorgPct: GASTO_OTORGAMIENTO,
      gastoOtorgAmt: result.gastoOtorgAmt,
      capitalFinanciar: result.capitalFinanciar,
      months,
      tna: gSettings.tna || 0,
      dueDay: gSettings.dueDay || 10,
      installment: result.cuota,
      borrower,
      createdAt: nowTS(), updatedAt: nowTS()
    };
    await addDoc(collection(db, "loans"), loanDoc);
    const sendBtn = el("btnSendReq");
    const originalHtml = sendBtn.innerHTML;
    sendBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg> ¡Solicitud enviada con éxito!`;
    sendBtn.style.background = "linear-gradient(135deg,#059669,#10b981)";
    sendBtn.disabled = true;
    ["bName", "bDni", "bEmail", "bPhone", "bAlias"].forEach(id => { const e = el(id); if (e) e.value = ""; });
    toast("✅ Solicitud enviada. Te contactaremos pronto.", "ok", 5000);
    const successCard = document.createElement("div");
    successCard.className = "req-success-card";
    successCard.innerHTML = `<div class="req-success-icon">✓</div><div><div class="req-success-title">¡Solicitud recibida!</div><div class="req-success-sub">El prestamista revisará tu solicitud.</div></div>`;
    sendBtn.parentNode.insertBefore(successCard, sendBtn.nextSibling);
    setTimeout(() => { successCard.remove(); sendBtn.innerHTML = originalHtml; sendBtn.style.background = ""; sendBtn.disabled = false; }, 6000);
  } catch (e) { toast("Error al enviar.", "err"); console.error(e); }
});

/* ══════════════════════════════════════════════════════════════
   HELPERS RENDER (simplificado)
   ══════════════════════════════════════════════════════════════ */
function waButton(phone, name) {
  if (!phone) return "";
  return `<a href="https://wa.me/${digits(phone)}?text=Hola+${encodeURIComponent(name || "")}" target="_blank" class="btn-wa btn-sm"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WA</a>`;
}

function loanItem(d, actions = "") {
  const b = d.borrower || {};
  const notesHtml = d.notes ? `<div class="loan-notes"><strong>Nota:</strong> ${d.notes}</div>` : "";
  const gastoOtorg = d.gastoOtorgAmt || Math.round((d.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin = d.capitalFinanciar || (d.amount || 0) + gastoOtorg;
  const cuota = d.installment || Math.round(annuity(capFin, d.tna || 100, d.months || 1));
  const breakdownHtml = `<div class="breakdown-box" style="margin-top:10px;margin-bottom:0">
    <div class="breakdown-row"><span class="bl">Monto</span><span class="bv">${fmtMoney(d.amount)}</span></div>
    <div class="breakdown-row warn-row"><span class="bl">Gasto otorg. (${d.gastoOtorgPct || GASTO_OTORGAMIENTO}%)</span><span class="bv">+ ${fmtMoney(gastoOtorg)}</span></div>
    <div class="breakdown-row accent"><span class="bl">Cuota</span><span class="bv">${fmtMoney(cuota)}</span></div>
  </div>`;
  return `<div class="loan-item">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><div class="loan-name">${b.name || "--"}</div>
        <div class="loan-meta">
          <span>DNI <strong>${b.dni || "--"}</strong></span>
          <span>${fmtMoney(d.amount)}</span>
          <span><strong>${d.months}</strong> cuotas</span>
          <span>TNA <strong>${d.tna}%</strong></span>
          ${d.contractId ? `<span><strong>${d.contractId}</strong></span>` : ""}
        </div>
      </div>
      ${waButton(b.phone, b.name)}
    </div>${breakdownHtml}${notesHtml}<div class="toolbar">${actions}</div></div>`;
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: PENDIENTES
   ══════════════════════════════════════════════════════════════ */
async function loadPend() {
  if (!gLenderId) return;
  const box = el("listPending");
  if (!box) return;
  box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(100)));
    const badge = el("badgePending");
    if (badge) badge.textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin solicitudes pendientes</div>`; return; }
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      box.insertAdjacentHTML("beforeend", loanItem(d,
        `<button class="btn-success btn-sm" data-pre="${d.id}">Preaprobar</button>
         <button class="btn-outline btn-sm" data-note="${d.id}">Nota</button>
         <button class="btn-danger btn-sm" data-del="${d.id}">Eliminar</button>`));
    });
    attachNotes(box);
    box.querySelectorAll("[data-pre]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("¿Preaprobar?")) return;
      const contractId = Math.random().toString(36).slice(2, 10).toUpperCase();
      await updateDoc(doc(db, "loans", btn.getAttribute("data-pre")), { status: "preapproved", contractId, updatedAt: nowTS() });
      toast("Preaprobado", "ok"); await loadAllAdmin();
    }));
    box.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar?")) return;
      await updateDoc(doc(db, "loans", btn.getAttribute("data-del")), { status: "deleted", updatedAt: nowTS() });
      toast("Eliminado", "info"); await loadAllAdmin();
    }));
  } catch (e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; console.error(e); }
}

function attachNotes(box) {
  box.querySelectorAll("[data-note]").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-note");
    const s = await getDoc(doc(db, "loans", id));
    if (!s.exists()) return;
    const txt = prompt("Nota de seguimiento:", s.data().notes || "");
    if (txt === null) return;
    await updateDoc(doc(db, "loans", id), { notes: txt, updatedAt: nowTS() });
    toast("Nota guardada", "ok"); await loadAllAdmin();
  }));
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: PREAPROBADOS
   ══════════════════════════════════════════════════════════════ */
async function loadPre() {
  if (!gLenderId) return;
  const box = el("listPre");
  if (!box) return;
  box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "preapproved"), orderBy("createdAt", "desc"), limit(100)));
    const badge = el("badgePre");
    if (badge) badge.textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin preaprobados</div>`; return; }
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      const badge = d.signed ? `<span class="pill ok">Firmado</span>` : `<span class="pill warn">Sin firma</span>`;
      const acts = [
        `<button class="btn-outline btn-sm" data-share="${d.id}">Compartir link</button>`,
        d.signed ? `<button class="btn-success btn-sm" data-approve="${d.id}">Activar</button>` : "",
        `<button class="btn-outline btn-sm" data-open="${d.id}">Ver contrato</button>`,
        `<button class="btn-outline btn-sm" data-note="${d.id}">Nota</button>`,
        `<button class="btn-danger btn-sm" data-del="${d.id}">✕</button>`
      ].join(" ");
      box.insertAdjacentHTML("beforeend", loanItem(d, badge + " " + acts));
    });
    attachNotes(box);
    box.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-approve");
      const s = await getDoc(doc(db, "loans", id));
      if (!s.exists()) return;
      const L = s.data();
      if (!L.signed) { toast("Todavía no firmó.", "err"); return; }
      showActivateModal({ ...L, id });
    }));
  } catch (e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: ACTIVOS (simplificado)
   ══════════════════════════════════════════════════════════════ */
async function loadAct() {
  if (!gLenderId) return;
  const box = el("listActive");
  if (!box) return;
  box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), orderBy("activeAt", "desc"), limit(100)));
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin préstamos activos</div>`; return; }
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      const pct = d.months ? Math.round((d.paidCount || 0) / d.months * 100) : 0;
      box.insertAdjacentHTML("beforeend", `<div class="loan-item">
        <div class="loan-name">${d.borrower?.name || "--"}</div>
        <div class="loan-meta">${fmtMoney(d.amount)} · ${d.months} cuotas · ${d.paidCount || 0}/${d.months} pagadas</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="toolbar"><button class="btn-outline btn-sm" data-cuotas="${d.id}">Ver cuotas</button></div>
        <div id="sch-${d.id}"></div></div>`);
    });
  } catch (e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════════ */
async function computeDashboard() {
  if (!gLenderId) return;
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), limit(500)));
    let invested = 0, activeCount = qs.size;
    qs.forEach(docu => {
      const L = docu.data();
      invested += (L.amount || 0);
    });
    if (el("kpiCapital")) el("kpiCapital").textContent = fmtMoney(invested);
    if (el("kpiActive")) el("kpiActive").textContent = activeCount;
  } catch (e) { console.error("Dashboard:", e); }
}

async function loadAllAdmin() {
  await loadSettings();
  if (checkSuspended()) return;
  await Promise.all([loadPend(), loadPre(), loadAct()]);
  await computeDashboard();
}

/* ══════════════════════════════════════════════════════════════
   ACTIVATE MODAL
   ══════════════════════════════════════════════════════════════ */
function showActivateModal(L) {
  gActivateLoan = L;
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const inst = L.installment || Math.round(annuity(capFin, L.tna, L.months));
  const expPct = gSettings.expenses || 0, expAmt = Math.round(L.amount * expPct / 100), neto = L.amount - expAmt;
  const summary = el("activateSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="activate-row"><span>Monto</span><span>${fmtMoney(L.amount)}</span></div>
      <div class="activate-row"><span>Gasto otorg. (${GASTO_OTORGAMIENTO}%)</span><span>+ ${fmtMoney(gastoOtorg)}</span></div>
      <div class="activate-row"><span>Capital a financiar</span><span>${fmtMoney(capFin)}</span></div>
      ${expPct > 0 ? `<div class="activate-row"><span>Gastos admin (${expPct}%)</span><span>– ${fmtMoney(expAmt)}</span></div>` : ""}
      <div class="activate-row"><span>Neto a entregar</span><span>${fmtMoney(neto)}</span></div>
      <div class="activate-row"><span>Cuota mensual</span><span>${fmtMoney(inst)}</span></div>
      <div class="activate-row"><span>Total a pagar</span><span>${fmtMoney(inst * L.months)}</span></div>`;
  }
  el("activateModal")?.classList.add("open");
}

el("btnCancelActivate")?.addEventListener("click", () => {
  el("activateModal")?.classList.remove("open");
  gActivateLoan = null;
});

el("btnConfirmActivate")?.addEventListener("click", async () => {
  const L = gActivateLoan; if (!L) return;
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const inst = L.installment || Math.round(annuity(capFin, L.tna, L.months));
  await updateDoc(doc(db, "loans", L.id), {
    status: "active", activeAt: nowTS(), updatedAt: nowTS(),
    installment: inst, capitalFinanciar: capFin,
    gastoOtorgAmt: gastoOtorg, gastoOtorgPct: L.gastoOtorgPct || GASTO_OTORGAMIENTO,
    paidCount: 0
  });
  el("activateModal")?.classList.remove("open");
  gActivateLoan = null;
  toast("Préstamo activado", "ok"); await loadAllAdmin();
});

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════════════════════════ */
el("cfgLogoFile")?.addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    gSettings.logoBase64 = ev.target.result;
    const preview = el("cfgLogoPreview");
    if (preview) preview.innerHTML = `<img src="${ev.target.result}" alt="logo"/>`;
    applyBranding();
  };
  reader.readAsDataURL(file);
});

el("btnCopyMyLink")?.addEventListener("click", () => {
  if (!gLenderId) { toast("Iniciá sesión primero.", "err"); return; }
  const link = location.origin + location.pathname + "?ref=" + gLenderId;
  navigator.clipboard?.writeText(link)
    .then(() => toast("✅ Link copiado", "ok"))
    .catch(() => { prompt("Copiá tu link:", link); });
});

el("btnSaveCfg")?.addEventListener("click", async () => {
  if (!gLenderId) { toast("Necesitás iniciar sesión.", "err"); return; }
  const tna = Number(digits(el("cfgTna")?.value));
  const due = Math.min(28, Math.max(1, Number(digits(el("cfgDue")?.value))));
  const appName = (el("cfgAppName")?.value || "Prestify").trim();
  const city = (el("cfgCity")?.value || "Río Gallegos").trim();
  const expenses = Number(el("cfgExpenses")?.value || "0");
  const wa = (el("cfgWa")?.value || "").trim();
  const brandColor = (el("cfgBrandColor")?.value || "#1a56db");
  const maxAmount = Number(digits(el("cfgMaxAmount")?.value || "1000000")) || 1000000;
  
  const data = { tna, dueDay: due, appName, city, expenses, wa, brandColor, maxAmount, lenderId: gLenderId, updatedAt: nowTS() };
  if (gSettings.logoBase64) data.logoBase64 = gSettings.logoBase64;
  
  await Promise.all([
    setDoc(settRef(), data, { merge: true }),
    setDoc(lenderRef(gLenderId), data, { merge: true })
  ]);
  await loadSettings();
  toast("Configuración guardada", "ok");
});

/* ══════════════════════════════════════════════════════════════
   SUPERADMIN
   ══════════════════════════════════════════════════════════════ */
async function loadSuperAdmin() {
  const listEl = el("saLendersList");
  if (!listEl) return;
  listEl.innerHTML = `<div class="sa-loading"><div class="spinner"></div><p>Cargando prestamistas...</p></div>`;
  try {
    const lendersSnap = await getDocs(collection(db, "lenders"));
    const lenders = [];
    lendersSnap.forEach(d => lenders.push({ id: d.id, ...d.data() }));
    const loansSnap = await getDocs(collection(db, "loans"));
    const totalLoans = loansSnap.size;
    const total = lenders.length;
    const activos = lenders.filter(l => l.status === "activo").length;
    const pendientes = lenders.filter(l => l.status === "pendiente").length;
    
    if (el("saCountLenders")) el("saCountLenders").textContent = total;
    if (el("saCountActive")) el("saCountActive").textContent = activos;
    if (el("saCountPending")) el("saCountPending").textContent = pendientes;
    if (el("saCountLoans")) el("saCountLoans").textContent = totalLoans;
    
    if (!lenders.length) { listEl.innerHTML = `<div class="empty">No hay prestamistas</div>`; return; }
    
    lenders.sort((a, b) => {
      const order = { pendiente: 0, activo: 1, pausado: 2 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1);
    });
    
    listEl.innerHTML = lenders.map(l => {
      const status = l.status || "activo";
      const pillClass = status === "activo" ? "activo" : status === "pendiente" ? "pendiente" : "pausado";
      const pillLabel = status === "activo" ? "✓ Activo" : status === "pendiente" ? "⏳ Pendiente" : "⛔ Pausado";
      const canActivate = status !== "activo";
      const canSuspend = status === "activo";
      return `<div class="sa-row" id="sarow-${l.id}">
        <div>
          <div class="sa-lender-name">${l.appName || "Sin nombre"}</div>
          <div class="sa-lender-email">${l.operator?.email || ""}</div>
          <div class="sa-lender-id">${l.id}</div>
        </div>
        <div>${l.operator?.email || "—"}</div>
        <div><span class="sa-status-pill ${pillClass}">${pillLabel}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${canActivate ? `<button class="sa-action-btn sa-btn-activate" onclick="saSetStatus('${l.id}','activo')">✓ Activar</button>` : ""}
          ${canSuspend ? `<button class="sa-action-btn sa-btn-suspend" onclick="saSetStatus('${l.id}','pausado')">⛔ Suspender</button>` : ""}
          ${status === "pausado" ? `<button class="sa-action-btn sa-btn-activate" onclick="saSetStatus('${l.id}','activo')">↩ Reactivar</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch (e) {
    listEl.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    console.error(e);
  }
}

window.saSetStatus = async function(lenderId, newStatus) {
  try {
    await setDoc(doc(db, "lenders", lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    await setDoc(doc(db, "settings", lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    toast(`Prestamista ${newStatus === "activo" ? "activado" : "suspendido"}`, newStatus === "activo" ? "ok" : "info");
    await loadSuperAdmin();
  } catch (e) { toast("Error: " + e.message, "err"); }
};

el("btnSaLogout")?.addEventListener("click", () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => { el("superadminView")?.classList.remove("show"); showLandingPage(); toast("Sesión cerrada", "info"); }).catch(() => { });
});

// Inicializar input formatters
["cfgTna", "cfgDue", "cfgMaxAmount"].forEach(id => {
  const e = el(id);
  if (e) e.addEventListener("input", ev => ev.target.value = digits(ev.target.value));
});

console.log('✅ Módulo script.js cargado correctamente');