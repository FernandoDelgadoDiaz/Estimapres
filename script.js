/* ════════════════════════════════════════════════════════════════
   PRESTIFY · script.js
   SaaS de Gestión de Préstamos — VERSIÓN CORREGIDA FINAL
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
const GASTO_OTORGAMIENTO = 3;
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

function annuity(P, rate, m) {
  const i = (rate / 100) / 12;
  if (i === 0) return P / m;
  return P * i * Math.pow(1 + i, m) / (Math.pow(1 + i, m) - 1);
}

function calculateFrenchLoan(amount, months, tna) {
  const gastoOtorgAmt = Math.round(amount * GASTO_OTORGAMIENTO / 100);
  const capitalFinanciar = amount + gastoOtorgAmt;
  const cuota = Math.round(annuity(capitalFinanciar, tna, months));
  const totalAPagar = cuota * months;
  return {
    amount, months, tna, gastoOtorgAmt, capitalFinanciar, cuota, totalAPagar,
    intereses: totalAPagar - capitalFinanciar
  };
}

function scheduleRows(L) {
  const due = L.dueDay || 10;
  const base = L.activeAt?.toDate ? L.activeAt.toDate() : new Date();
  const gastoOtorgAmt = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin = L.capitalFinanciar || (L.amount || 0) + gastoOtorgAmt;
  const inst = (L.installment && L.installment > 0) ? L.installment : Math.round(annuity(capFin, L.tna, L.months));
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

window.gSettings = gSettings;

/* ══════════════════════════════════════════════════════════════
   CONEXIÓN TOTAL - Exportar funciones al objeto window
   ══════════════════════════════════════════════════════════════ */
window.nextStep = function(step) {
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
};

window.prevStep = function(step) {
  const prev = step - 1;
  if (prev >= 1) window.nextStep(prev);
};

window.handleSignup = function() {
  showOnboarding();
};

window.calculateLoan = function() {
  const amountInput = document.getElementById('simAmountInput') || 
                      document.getElementById('clientAmountSlider') ||
                      document.getElementById('simAmount');
  const monthsSelect = document.getElementById('simMonths');
  const monthsHidden = document.getElementById('simMonthsHidden');
  
  let amount = 0, months = 0;
  
  if (amountInput) {
    if (amountInput.type === 'range' || amountInput.type === 'hidden') {
      amount = parseInt(amountInput.value) || 0;
    } else {
      amount = parseInt((amountInput.value || '').replace(/\D/g, '')) || 0;
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
  
  const tna = gSettings?.tna || 100;
  const result = calculateFrenchLoan(amount, months, tna);
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

window.closeDemoModal = function() {
  const modal = document.getElementById('demoModal');
  if (modal) modal.classList.remove('open');
};

window.selectPayMethod = function(method) {
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

window.moniUpdateSlider = function(slider) {
  const val = parseInt(slider.value) || 50000;
  const display = document.getElementById('moniAmountDisplay');
  if (display) display.textContent = '$ ' + val.toLocaleString('es-AR');
  const pct = ((val - parseInt(slider.min)) / (parseInt(slider.max) - parseInt(slider.min))) * 100;
  slider.style.background = 'linear-gradient(to right, #10b981 0%, #10b981 ' + pct + '%, #e2e8f0 ' + pct + '%)';
};

window.moniSimular = function() {
  if (typeof moniSimular === 'function') moniSimular();
};

window.moniShowForm = function() {
  const simResult = document.getElementById('moniSimResult');
  const formSection = document.getElementById('moniFormSection');
  if (simResult) simResult.style.display = 'none';
  if (formSection) {
    formSection.style.display = 'block';
    formSection.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
};

window.moniEnviarSolicitud = function() {
  if (typeof moniEnviarSolicitud === 'function') moniEnviarSolicitud();
};

/* ══════════════════════════════════════════════════════════════
   MULTITENANT
   ══════════════════════════════════════════════════════════════ */
(() => {
  const params = new URLSearchParams(location.search);
  const urlRef = params.get("ref");
  if (urlRef) {
    gRefLenderId = urlRef;
    sessionStorage.setItem("prestify_ref", urlRef);
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

function openRegisterFlow() {
  if (auth.currentUser) {
    signOut(auth).then(() => {
      hideLandingPage();
      el("heroSection").style.display = "none";
      el("clientView").style.display = "none";
      el("adminView").className = "admin-wrap visible";
      el("btnViewClient").style.display = "";
      el("btnViewAdmin").style.display = "";
      requestAnimationFrame(() => {
        const gate = el("adminGate");
        if (gate) gate.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    return;
  }
  hideLandingPage();
  el("heroSection").style.display = "none";
  el("clientView").style.display = "none";
  el("adminView").className = "admin-wrap visible";
  el("btnViewClient").style.display = "";
  el("btnViewAdmin").style.display = "";
  requestAnimationFrame(() => {
    const gate = el("adminGate");
    if (gate) gate.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

el("btnLandingRegister")?.addEventListener("click", openRegisterFlow);
el("btnLandingRegister2")?.addEventListener("click", openRegisterFlow);
el("btnLandingLogin")?.addEventListener("click", e => { e.preventDefault(); openRegisterFlow(); });

/* ══════════════════════════════════════════════════════════════
   FIRESTORE HELPERS
   ══════════════════════════════════════════════════════════════ */
const effectiveLid = () => gLenderId || gRefLenderId;
const loanQ = (...c) => query(collection(db, "loans"), where("lenderId", "==", effectiveLid()), ...c);
const settRef = () => doc(db, "settings", effectiveLid());
const lenderRef = id => doc(db, "lenders", id);
const hasMpToken = () => !!(gSettings.mpToken && gSettings.mpToken.length > 10);

/* ══════════════════════════════════════════════════════════════
   OVERLAYS
   ══════════════════════════════════════════════════════════════ */
function checkSuspended() {
  if (gSettings.status === "pausado") {
    el("suspendedOverlay").classList.add("show");
    el("pendingOverlay").classList.remove("show");
    const adminC = el("adminContent");
    if (adminC) adminC.style.display = "none";
    return true;
  }
  el("suspendedOverlay").classList.remove("show");
  return false;
}

function checkPending() {
  if (gSettings.status === "pendiente") {
    el("pendingOverlay").classList.add("show");
    const adminC = el("adminContent");
    if (adminC) adminC.style.display = "none";
    return true;
  }
  el("pendingOverlay").classList.remove("show");
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
  const mark = document.getElementById("logoMark");
  if (mark) {
    if (gSettings.logoBase64) {
      mark.innerHTML = `<img src="${gSettings.logoBase64}" alt="logo"/>`;
    } else {
      mark.textContent = name.replace(/\s+/g, "").slice(0, 1).toUpperCase();
    }
  }
  const mid = Math.ceil(name.length / 2);
  const ln = document.getElementById("logoName");
  if (ln) ln.innerHTML = `${name.slice(0, mid)}<span>${name.slice(mid)}</span>`;
  
  const brandColor = gSettings.brandColor || "#1a56db";
  document.documentElement.style.setProperty("--brand-color", brandColor);
  document.documentElement.style.setProperty("--blue", brandColor);
  document.documentElement.style.setProperty("--blue-light", brandColor);
  
  if (gRefLenderId && !gLenderId) {
    document.body.classList.add("client-mode");
    const style = document.createElement('style');
    style.textContent = `
      body.client-mode .btn-primary { background: ${brandColor} !important; }
      body.client-mode .client-pill.active { background: ${brandColor}; border-color: ${brandColor}; }
      body.client-mode .client-amount-display { color: ${brandColor}; }
    `;
    document.head.appendChild(style);
    
    const maxAmt = gSettings.maxAmount || 1000000;
    const sliderEl = document.getElementById("clientAmountSlider");
    if (sliderEl) {
      sliderEl.max = maxAmt;
      if (Number(sliderEl.value) > maxAmt) sliderEl.value = Math.round(maxAmt * 0.05);
      const disp = document.getElementById("clientAmountDisplay");
      if (disp) disp.textContent = "$ " + Number(sliderEl.value).toLocaleString("es-AR");
      const sa = document.getElementById("simAmount");
      if (sa) sa.value = sliderEl.value;
    }
    const maxLbl = document.getElementById("sliderMaxLabel");
    if (maxLbl) maxLbl.textContent = "$ " + maxAmt.toLocaleString("es-AR");
    const bh = document.getElementById("lenderBrandHeader");
    if (bh) bh.style.display = "";
    const bn = document.getElementById("lenderBrandName");
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
  } catch {}
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
   ONBOARDING
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
  gObStep = 1;
  gObSigData = null;
  gObPayMethod = "mp";
  
  ['obName', 'obDni', 'obEmail', 'obAppName', 'obCity', 'obTna', 'obDueDay', 'obExpenses', 'obWa', 'obMpToken', 'obMpPublicKey']
    .forEach(id => { const inp = document.getElementById(id); if (inp) inp.value = ''; });
  
  const consent = document.getElementById('obConsentCheck');
  if (consent) consent.checked = false;
  
  [1, 2, 3].forEach(i => {
    const stepEl = document.getElementById(`obStep${i}`);
    const contentEl = document.getElementById(`obContent${i}`);
    if (stepEl && contentEl) {
      stepEl.className = i === 1 ? 'ob-step active' : 'ob-step';
      contentEl.className = i === 1 ? 'ob-content active' : 'ob-content';
    }
  });
  
  window.selectPayMethod('mp');
  setTimeout(initObSigCanvas, 200);
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) overlay.classList.add('show');
}

el("btnObClearSig")?.addEventListener("click", () => {
  const c = el("obSigCanvas"); if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  gObSigData = null;
});

el("btnObStep1")?.addEventListener("click", () => {
  const name = (el("obName").value || "").trim();
  const dni = digits(el("obDni").value);
  const email = (el("obEmail").value || "").trim();
  if (!name || !dni || !email) { toast("Completá nombre, DNI y email.", "err"); return; }
  if (!el("obConsentCheck").checked) { toast("Debés aceptar los términos de uso.", "err"); return; }
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
  const appName = (el("obAppName").value || "").trim();
  const tna = Number(digits(el("obTna").value));
  const due = Number(digits(el("obDueDay").value));
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
    const appName = (el("obAppName")?.value || "").trim();
    const tna = Number(digits(el("obTna")?.value));
    const dueDay = Number(digits(el("obDueDay")?.value));
    const city = (el("obCity")?.value || "Río Gallegos, Santa Cruz").trim();
    const expenses = Number(el("obExpenses")?.value || 0);
    const wa = (el("obWa")?.value || "").trim();
    
    if (!appName || !tna || !dueDay) throw new Error("Completá todos los campos del paso 2");
    
    const name = (el("obName")?.value || "").trim();
    const dni = digits(el("obDni")?.value);
    const email = (el("obEmail")?.value || "").trim();
    if (!name || !dni || !email) throw new Error("Faltan datos del paso 1");
    
    const canvas = document.getElementById("obSigCanvas");
    if (!canvas) throw new Error("Error con el canvas de firma");
    
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasSignature = Array.from(imgData).some((v, i) => i % 4 === 3 && v > 0);
    if (!hasSignature) throw new Error("Dibujá tu firma en el paso 1");
    
    if (!document.getElementById("obConsentCheck")?.checked) throw new Error("Debés aceptar los términos de uso");
    
    const signatureImg = canvas.toDataURL("image/png");
    const plazos = [3, 6, 9, 12, 18, 24];
    
    const cfg = {
      lenderId: gLenderId, appName, city, tna, dueDay, expenses, wa,
      status: "pendiente", plazos, minAmount: 5000, maxAmount: 1000000,
      brandColor: "#1a56db", onboardingDone: true, onboardingAt: serverTimestamp(),
      operator: { name, dni, email, consentSignedAt: new Date().toISOString(), signatureImg },
      updatedAt: serverTimestamp()
    };
    
    if (gObPayMethod === "mp") {
      const mpToken = (el("obMpToken")?.value || "").trim();
      const mpPublicKey = (el("obMpPublicKey")?.value || "").trim();
      if (mpToken) cfg.mpToken = mpToken;
      if (mpPublicKey) cfg.mpPublicKey = mpPublicKey;
    }
    
    await Promise.all([
      setDoc(doc(db, "settings", gLenderId), cfg, { merge: true }),
      setDoc(doc(db, "lenders", gLenderId), cfg, { merge: true })
    ]);
    
    Object.assign(gSettings, cfg);
    applyBranding();
    refreshSimMeta();
    document.getElementById("onboardingOverlay").classList.remove("show");
    toast("✅ Cuenta registrada. Aguardá la activación.", "ok", 6000);
    checkPending();
    
  } catch (e) {
    toast("Error: " + e.message, "err");
    el("btnObFinish").disabled = false;
    el("btnObFinish").textContent = "✓ Crear mi cuenta";
  }
});

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async u => {
  gUser = u;
  gLenderId = u ? u.uid : null;
  const ok = !!u;
  
  const adminGate = document.getElementById('adminGate');
  const adminContent = document.getElementById('adminContent');
  const btnAdminLogin = document.getElementById('btnAdminLogin');
  const btnLogout = document.getElementById('btnLogout');
  const notifWrap = document.getElementById('notifWrap');
  
  if (adminGate) adminGate.style.display = ok ? "none" : "";
  if (adminContent) adminContent.style.display = ok ? "" : "none";
  if (btnAdminLogin) btnAdminLogin.style.display = ok ? "none" : "";
  if (btnLogout) btnLogout.style.display = ok ? "" : "none";
  if (notifWrap) notifWrap.style.display = ok ? "" : "none";

  if (ok) {
    const isSuperAdmin = (u.uid === SUPER_ADMIN_UID);
    const saBtn = document.getElementById("btnViewSuperAdmin");
    if (saBtn) saBtn.style.display = isSuperAdmin ? "" : "none";
    
    hideLandingPage();
    
    if (isSuperAdmin) {
      const lenderSnap = await getDoc(lenderRef(u.uid));
      const hasLender = lenderSnap.exists();
      const onboardingDone = hasLender && lenderSnap.data().onboardingDone;
      
      if (hasLender && onboardingDone) {
        await loadSettings();
        document.getElementById('heroSection').style.display = "none";
        document.getElementById('clientView').style.display = "none";
        document.getElementById('adminView').className = "admin-wrap visible";
        document.getElementById('btnViewClient').style.display = "";
        document.getElementById('btnViewAdmin').style.display = "";
        if (checkSuspended() || checkPending()) { startStatusListener(); return; }
        showView("admin");
        await loadAllAdmin();
        startRealtimeListener();
        startStatusListener();
      } else {
        document.getElementById('heroSection').style.display = "none";
        document.getElementById('clientView').style.display = "none";
        document.getElementById('adminView').className = "admin-wrap";
        document.getElementById('btnViewClient').style.display = "none";
        document.getElementById('btnViewAdmin').style.display = "none";
        document.getElementById('superadminView')?.classList.add("show");
        loadSuperAdmin();
      }
    } else {
      document.getElementById('heroSection').style.display = "none";
      document.getElementById('clientView').style.display = "none";
      document.getElementById('adminView').className = "admin-wrap visible";
      document.getElementById('btnViewClient').style.display = "";
      document.getElementById('btnViewAdmin').style.display = "";
      
      await loadSettings();
      if (checkSuspended() || checkPending()) { startStatusListener(); return; }
      
      const lenderSnap = await getDoc(lenderRef(gLenderId));
      if (!lenderSnap.exists() || !lenderSnap.data().onboardingDone) {
        showOnboarding();
      } else {
        showView("admin");
        await loadAllAdmin();
        startRealtimeListener();
        startStatusListener();
      }
    }
  } else {
    document.getElementById("btnViewSuperAdmin").style.display = "none";
    if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; }
    if (!gRefLenderId) {
      showLandingPage();
    } else {
      document.getElementById('landingView')?.classList.remove("show");
      document.getElementById('btnViewClient').style.display = "";
      document.getElementById('btnViewAdmin').style.display = "";
      showView("client");
      await loadSettings();
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   LOGIN / LOGOUT
   ══════════════════════════════════════════════════════════════ */
async function doLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPass');
  const email = emailInput ? emailInput.value : prompt("Email:") || "";
  const pass = passInput ? passInput.value : prompt("Contraseña:") || "";
  if (!email || !pass) { toast("Completá email y contraseña", "err"); return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Sesión iniciada", "ok");
  } catch { toast("Credenciales incorrectas", "err"); }
}

document.getElementById('btnAdminLogin')?.addEventListener('click', doLogin);
document.getElementById('btnLogout')?.addEventListener('click', () => {
  if (gStatusUnsub) gStatusUnsub();
  signOut(auth).then(() => toast("Sesión cerrada", "info"));
});
document.getElementById('btnPendingLogout')?.addEventListener('click', () => {
  if (gStatusUnsub) gStatusUnsub();
  signOut(auth).then(() => {
    document.getElementById('pendingOverlay')?.classList.remove("show");
    toast("Sesión cerrada", "info");
  });
});
document.getElementById('btnResetPass')?.addEventListener('click', async () => {
  const email = prompt("Ingresá tu email:");
  if (!email) return;
  try { await sendPasswordResetEmail(auth, email); toast("Email de recuperación enviado", "ok"); }
  catch { toast("No se pudo enviar", "err"); }
});
document.getElementById('btnForgotPass')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value;
  if (!email) { toast("Ingresá tu email primero", "err"); return; }
  try { await sendPasswordResetEmail(auth, email); toast("Email de recuperación enviado", "ok"); }
  catch { toast("No se pudo enviar", "err"); }
});
document.getElementById('btnGoToRegister')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.handleSignup();
});

/* ══════════════════════════════════════════════════════════════
   STATUS LISTENER
   ══════════════════════════════════════════════════════════════ */
function startStatusListener() {
  if (!gLenderId || gStatusUnsub) return;
  gStatusUnsub = onSnapshot(lenderRef(gLenderId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const prevStatus = gSettings.status;
    const newStatus = data.status || 'activo';
    gSettings.status = newStatus;
    if (data.plazos) gSettings.plazos = data.plazos;
    if (data.brandColor) { gSettings.brandColor = data.brandColor; applyBranding(); }
    
    const pendingOverlay = document.getElementById('pendingOverlay');
    const suspendedOverlay = document.getElementById('suspendedOverlay');
    const adminContent = document.getElementById('adminContent');
    
    if (newStatus === 'pendiente') {
      pendingOverlay?.classList.add('show');
      suspendedOverlay?.classList.remove('show');
      if (adminContent) adminContent.style.display = 'none';
      if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; }
    } else if (newStatus === 'pausado') {
      suspendedOverlay?.classList.add('show');
      pendingOverlay?.classList.remove('show');
      if (adminContent) adminContent.style.display = 'none';
      if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; }
    } else if (newStatus === 'activo') {
      pendingOverlay?.classList.remove('show');
      suspendedOverlay?.classList.remove('show');
      if (gUser) {
        if (adminContent) adminContent.style.display = '';
        if (prevStatus === 'pendiente') {
          toast('🎉 ¡Tu cuenta fue activada!', 'ok', 6000);
          loadAllAdmin();
        }
        if (!gSnapshotUnsub) startRealtimeListener();
      }
    }
    refreshSimMeta();
  }, err => console.error("StatusListener error:", err));
}

/* ══════════════════════════════════════════════════════════════
   NOTIFICACIONES
   ══════════════════════════════════════════════════════════════ */
function startRealtimeListener() {
  if (!gLenderId || gSnapshotUnsub) return;
  const q = query(collection(db, "loans"), where("lenderId", "==", gLenderId), where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(50));
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
  renderNotifDropdown();
  updateNotifBadge();
  
  const t = document.createElement("div");
  t.className = "toast new-req";
  t.innerHTML = `<span style="font-size:22px">🔔</span><div><div style="font-weight:800;font-size:14px">${name} solicitó ${amt}</div><div style="font-size:11px;opacity:.7;margin-top:2px">Click para ir a Pendientes →</div></div>`;
  t.onclick = () => { showView("admin"); switchTab("Pending"); t.remove(); };
  document.getElementById("toastContainer")?.appendChild(t);
  setTimeout(() => t.remove(), 9000);
  
  const alertBanner = document.getElementById("alertBanner");
  const alertBannerText = document.getElementById("alertBannerText");
  if (alertBannerText) alertBannerText.textContent = `Nueva solicitud de ${name} · ${amt}`;
  if (alertBanner) {
    alertBanner.classList.add("show");
    setTimeout(() => alertBanner.classList.remove("show"), 7000);
  }
  
  loadPend();
  computeDashboard();
}

function renderNotifDropdown() {
  const list = document.getElementById("notifList");
  if (!list) return;
  if (!gNotifications.length) { list.innerHTML = `<div class="notif-empty">Sin notificaciones nuevas</div>`; return; }
  list.innerHTML = gNotifications.slice(0, 20).map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" data-notif-id="${n.id}">
      <div class="notif-item-title">🔔 Nueva solicitud · ${n.name}</div>
      <div class="notif-item-sub">${n.amt} · ${n.time}</div>
    </div>`).join("");
  list.querySelectorAll(".notif-item").forEach(item => {
    item.onclick = () => { showView("admin"); switchTab("Pending"); document.getElementById("notifDropdown")?.classList.remove("open"); };
  });
}

function updateNotifBadge() {
  const count = gNotifications.filter(n => n.unread).length;
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent = count > 9 ? "9+" : count;
}

document.getElementById("notifBell")?.addEventListener("click", () => {
  document.getElementById("notifDropdown")?.classList.toggle("open");
  gNotifications.forEach(n => n.unread = false);
  updateNotifBadge();
  renderNotifDropdown();
});
document.getElementById("btnClearNotifs")?.addEventListener("click", () => {
  gNotifications = [];
  renderNotifDropdown();
  updateNotifBadge();
  document.getElementById("notifDropdown")?.classList.remove("open");
});
document.getElementById("alertBannerClose")?.addEventListener("click", () => {
  document.getElementById("alertBanner")?.classList.remove("show");
});
document.addEventListener("click", e => {
  const wrap = document.getElementById("notifWrap");
  const drop = document.getElementById("notifDropdown");
  if (wrap && drop && !wrap.contains(e.target)) drop.classList.remove("open");
});

/* ══════════════════════════════════════════════════════════════
   VISTAS Y TABS
   ══════════════════════════════════════════════════════════════ */
function showView(v) {
  document.getElementById("landingView")?.classList.remove("show");
  document.body.classList.remove("landing-active");
  document.getElementById("superadminView")?.classList.remove("show");
  const a = v === "admin";
  const sa = v === "superadmin";
  document.getElementById("clientView").style.display = (a || sa) ? "none" : "";
  document.getElementById("heroSection").style.display = (a || sa) ? "none" : "";
  document.getElementById("adminView").className = "admin-wrap" + ((a && !sa) ? " visible" : "");
  document.getElementById("btnViewClient").className = "nav-btn" + ((!a && !sa) ? " active" : "");
  document.getElementById("btnViewAdmin").className = "nav-btn" + ((a && !sa) ? " active" : "");
  const saBtn = document.getElementById("btnViewSuperAdmin");
  if (saBtn) saBtn.className = "nav-btn" + (sa ? " active" : "");
  if (sa) document.getElementById("superadminView")?.classList.add("show");
}
document.getElementById("btnViewClient")?.addEventListener("click", () => showView("client"));
document.getElementById("btnViewAdmin")?.addEventListener("click", () => showView("admin"));
document.getElementById("btnViewSuperAdmin")?.addEventListener("click", () => { showView("superadmin"); loadSuperAdmin(); });

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("visible"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  const cnt = document.getElementById("tab" + tabName);
  if (cnt) cnt.classList.add("visible");
}
document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.getElementById("btnSim")?.addEventListener("click", window.calculateLoan);

document.getElementById("btnSendReq")?.addEventListener("click", async () => {
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

  const urlRef = new URLSearchParams(location.search).get("ref") || gRefLenderId || sessionStorage.getItem("prestify_ref");
  const lid = urlRef || gLenderId;
  if (!lid) { toast("Error: no se detectó el prestamista.", "err"); return; }
  if (!gSettings.tna) { toast("Error: no se pudo cargar la configuración.", "err"); return; }

  const result = calculateFrenchLoan(montoSolicitado, months, gSettings.tna);

  try {
    await addDoc(collection(db, "loans"), {
      status: "pending", lenderId: lid, amount: montoSolicitado,
      gastoOtorgPct: GASTO_OTORGAMIENTO, gastoOtorgAmt: result.gastoOtorgAmt,
      capitalFinanciar: result.capitalFinanciar, months, tna: gSettings.tna || 0,
      dueDay: gSettings.dueDay || 10, installment: result.cuota, borrower,
      createdAt: nowTS(), updatedAt: nowTS()
    });
    
    const sendBtn = document.getElementById("btnSendReq");
    sendBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg> ¡Enviada!`;
    sendBtn.disabled = true;
    ["bName","bDni","bEmail","bPhone","bAlias"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    toast("✅ Solicitud enviada. Te contactaremos pronto.", "ok", 5000);
    setTimeout(() => { sendBtn.innerHTML = "Enviar solicitud"; sendBtn.disabled = false; }, 6000);
  } catch (e) { toast("Error al enviar.", "err"); console.error(e); }
});

/* ══════════════════════════════════════════════════════════════
   SUPERADMIN
   ══════════════════════════════════════════════════════════════ */
async function loadSuperAdmin() {
  const listEl = document.getElementById("saLendersList");
  if (!listEl) return;
  listEl.innerHTML = `<div class="sa-loading"><div class="spinner"></div><p>Cargando prestamistas...</p></div>`;
  
  try {
    const lendersSnap = await getDocs(collection(db, "lenders"));
    const lenders = []; lendersSnap.forEach(d => lenders.push({ id: d.id, ...d.data() }));
    const loansSnap = await getDocs(collection(db, "loans"));
    const loans = []; loansSnap.forEach(d => loans.push({ id: d.id, ...d.data() }));
    
    document.getElementById("saCountLenders").textContent = lenders.length;
    document.getElementById("saCountActive").textContent = lenders.filter(l => l.status === "activo").length;
    document.getElementById("saCountPending").textContent = lenders.filter(l => l.status === "pendiente").length;
    document.getElementById("saCountLoans").textContent = loans.length;
    
    const loansByLender = {};
    loans.forEach(loan => {
      const lid = loan.lenderId;
      if (!loansByLender[lid]) loansByLender[lid] = { total: 0, active: 0, paid: 0, amount: 0 };
      loansByLender[lid].total++;
      loansByLender[lid].amount += (loan.amount || 0);
      if (loan.status === "active") loansByLender[lid].active++;
      if (loan.status === "paid") loansByLender[lid].paid++;
    });
    
    let totalAmountEl = document.getElementById("saTotalAmount");
    if (!totalAmountEl) {
      const newMetric = document.createElement("div");
      newMetric.className = "sa-metric-card";
      newMetric.innerHTML = `<div class="sa-metric-label">Total prestado</div><div class="sa-metric-val" id="saTotalAmount">${fmtMoney(loans.reduce((s,l)=>s+(l.amount||0),0))}</div>`;
      document.getElementById("saMetrics")?.appendChild(newMetric);
    } else {
      totalAmountEl.textContent = fmtMoney(loans.reduce((s,l)=>s+(l.amount||0),0));
    }
    
    if (!lenders.length) { listEl.innerHTML = `<div class="empty">No hay prestamistas registrados</div>`; return; }
    
    lenders.sort((a,b)=> (({pendiente:0,activo:1,pausado:2})[a.status]??1) - (({pendiente:0,activo:1,pausado:2})[b.status]??1));
    
    listEl.innerHTML = lenders.map(l => {
      const status = l.status || "activo";
      const pillClass = status === "activo" ? "activo" : status === "pendiente" ? "pendiente" : "pausado";
      const pillLabel = status === "activo" ? "✓ Activo" : status === "pendiente" ? "⏳ Pendiente" : "⛔ Pausado";
      const loans = loansByLender[l.id] || { total: 0, active: 0, paid: 0, amount: 0 };
      return `<div class="sa-row" id="sarow-${l.id}">
        <div>
          <div class="sa-lender-name">${l.appName || "Sin nombre"}</div>
          <div class="sa-lender-email">${l.operator?.name || ""} ${l.operator?.email ? "· " + l.operator.email : ""}</div>
          <div class="sa-lender-id">${l.id}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:5px;">📊 Préstamos: ${loans.total} (${loans.active} activos)<br>💰 $${Math.round(loans.amount).toLocaleString('es-AR')}</div>
        </div>
        <div>${l.operator?.email || "—"}${l.wa ? `<div style="font-size:10px;color:#25d366;">WA: ${l.wa}</div>` : ""}</div>
        <div><span class="sa-status-pill ${pillClass}">${pillLabel}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${status !== "activo" ? `<button class="sa-action-btn sa-btn-activate" onclick="saSetStatus('${l.id}','activo')">✓ Activar</button>` : ""}
          ${status === "activo" ? `<button class="sa-action-btn sa-btn-suspend" onclick="saSetStatus('${l.id}','pausado')">⛔ Suspender</button>` : ""}
          <button class="sa-action-btn sa-btn-outline" onclick="saViewDetails('${l.id}')">👁 Detalles</button>
        </div>
      </div>`;
    }).join("");
  } catch (e) { listEl.innerHTML = `<div class="empty" style="color:#f87171">Error: ${e.message}</div>`; }
}

window.saSetStatus = async (lenderId, newStatus) => {
  try {
    await setDoc(doc(db, "lenders", lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    await setDoc(doc(db, "settings", lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    toast(`Prestamista ${newStatus === "activo" ? "activado" : "suspendido"}`, newStatus === "activo" ? "ok" : "err");
    await loadSuperAdmin();
  } catch (e) { toast("Error: " + e.message, "err"); }
};

window.saViewDetails = async (lenderId) => {
  try {
    const lender = (await getDoc(doc(db, "lenders", lenderId))).data();
    const settings = (await getDoc(doc(db, "settings", lenderId))).data() || {};
    const loans = (await getDocs(query(collection(db, "loans"), where("lenderId", "==", lenderId)))).docs.map(d=>d.data());
    alert(`
🏢 ${lender.appName || "Sin nombre"}
📍 ${lender.city || "—"}
👤 Operador: ${lender.operator?.name || "—"} (${lender.operator?.email || "—"})
📊 TNA: ${lender.tna || settings.tna || "—"}%
📅 Vencimiento: día ${lender.dueDay || settings.dueDay || "—"}
💰 Gastos admin: ${lender.expenses || settings.expenses || 0}%

📋 PRÉSTAMOS:
• Total: ${loans.length}
• Activos: ${loans.filter(l=>l.status==="active").length}
• Pagados: ${loans.filter(l=>l.status==="paid").length}
• Monto total: ${fmtMoney(loans.reduce((s,l)=>s+(l.amount||0),0))}
    `);
  } catch (e) { toast("Error: " + e.message, "err"); }
};

document.getElementById("btnSaLogout")?.addEventListener("click", () => {
  if (gStatusUnsub) gStatusUnsub();
  signOut(auth).then(() => {
    document.getElementById("superadminView")?.classList.remove("show");
    showLandingPage();
    toast("Sesión cerrada", "info");
  });
});

async function loadPend() {}
async function loadPre() {}
async function loadAct() {}
async function loadMora() {}
async function loadComprobantes() {}
async function loadInact() {}
async function loadAllAdmin() {}
async function computeDashboard() {}

console.log('✅ Módulo script.js cargado completamente');