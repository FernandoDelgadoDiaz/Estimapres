/* ════════════════════════════════════════════════════════════════
   PRESTIFY · script.js
   SaaS de Gestión de Préstamos — Módulo principal (Firebase ES Module)
   ════════════════════════════════════════════════════════════════ */

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
         serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref as sRef, uploadString, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ══ FIREBASE CONFIG ══ */
const firebaseConfig = {
  apiKey:            "AIzaSyBuLQHhsOBTr2e8Kp5HKUz-a7xXgrgLlUI",
  authDomain:        "estimapres.firebaseapp.com",
  projectId:         "estimapres",
  storageBucket:     "estimapres.firebasestorage.app",
  messagingSenderId: "578516597437",
  appId:             "1:578516597437:web:f59994b87729aa1cd655d4"
};
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

/* ══════════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════════ */
const fmtMoney = n => isNaN(n) || n == null ? "$ 0" : "$ " + Number(Math.round(n)).toLocaleString("es-AR");
const digits   = v => (v || "").replace(/\D+/g, "");
const nowTS    = () => serverTimestamp();
const daysLate = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const el       = id => document.getElementById(id);

function toast(msg, type = "info", dur = 3800) {
  const c = el("toastContainer");
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

function scheduleRows(L) {
  const due  = L.dueDay || 10;
  const base = L.activeAt?.toDate ? L.activeAt.toDate() : new Date();
  const gastoOtorgAmt = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin        = L.capitalFinanciar || (L.amount || 0) + gastoOtorgAmt;
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
const GASTO_OTORGAMIENTO = 3; // 3% fijo sobre el monto solicitado
const SUPER_ADMIN_UID    = "CuQqbuHWkTWdFPdknVTUAkx5Xri2";
let gActivateLoan = null, inactTab = "paid";
let gNotifications = [], gSnapshotUnsub = null, gStatusUnsub = null, knownPendingIds = new Set();
let gObSigData = null, gObPayMethod = "mp";

/* ══════════════════════════════════════════════════════════════
   MULTITENANT — ?ref= captura inmediata
   ══════════════════════════════════════════════════════════════ */
(()=>{
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
  el("heroSection").style.display   = "none";
  el("clientView").style.display    = "none";
  el("adminView").className         = "admin-wrap";
  el("superadminView")?.classList.remove("show");
  el("btnViewClient").style.display = "none";
  el("btnViewAdmin").style.display  = "none";
  renderLandingPage();
}

function hideLandingPage() {
  el("landingView")?.classList.remove("show");
  document.body.classList.remove("landing-active");
  el("btnViewClient").style.display = "";
  el("btnViewAdmin").style.display  = "";
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

// Sincronización inicial (la landing ya fue mostrada por el script síncrono inline)
(()=>{
  if (!gRefLenderId) {
    el("btnViewClient").style.display = "none";
    el("btnViewAdmin").style.display  = "none";
    requestAnimationFrame(() => setTimeout(renderLandingPage, 60));
  } else {
    const lv = el("landingView");
    if (lv) lv.classList.remove("show");
    document.body.classList.remove("landing-active");
    el("heroSection").style.display   = "none";
    el("clientView").style.display    = "none";
    el("btnViewClient").style.display = "none";
    el("btnViewAdmin").style.display  = "none";
  }
})();

// Landing CTAs → abrir registro
function openRegisterFlow() {
  // Si hay sesión activa (admin), cerrarla primero para mostrar el flujo de registro limpio
  if (auth.currentUser) {
    signOut(auth).then(() => {
      hideLandingPage();
      el("heroSection").style.display = "none";
      el("clientView").style.display  = "none";
      el("adminView").className       = "admin-wrap visible";
      el("btnViewClient").style.display = "";
      el("btnViewAdmin").style.display  = "";
      requestAnimationFrame(() => {
        const gate = el("adminGate");
        if (gate) gate.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    return;
  }
  hideLandingPage();
  el("heroSection").style.display = "none";
  el("clientView").style.display  = "none";
  el("adminView").className       = "admin-wrap visible";
  el("btnViewClient").style.display = "";
  el("btnViewAdmin").style.display  = "";
  requestAnimationFrame(() => {
    const gate = el("adminGate");
    if (gate) gate.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
el("btnLandingRegister")?.addEventListener("click", openRegisterFlow);
el("btnLandingRegister2")?.addEventListener("click", openRegisterFlow);
el("btnLandingLogin")?.addEventListener("click", e => { e.preventDefault(); openRegisterFlow(); });

/* ══════════════════════════════════════════════════════════════
   HELPERS FIRESTORE
   ══════════════════════════════════════════════════════════════ */
const effectiveLid = () => gLenderId || gRefLenderId;
const loanQ        = (...c) => query(collection(db, "loans"), where("lenderId", "==", effectiveLid()), ...c);
const settRef      = ()     => doc(db, "settings", effectiveLid());
const lenderRef    = id     => doc(db, "lenders", id);
const hasMpToken   = ()     => !!(gSettings.mpToken && gSettings.mpToken.length > 10);

/* ══════════════════════════════════════════════════════════════
   OVERLAYS — SUSPENDIDO / PENDIENTE
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
    if (d.accentColor)  document.documentElement.style.setProperty("--sky",  d.accentColor);
    Object.assign(gSettings, {
      appName: d.appName || gSettings.appName,
      city:    d.city    || gSettings.city,
      tna:     d.tna     || gSettings.tna,
      dueDay:  d.dueDay  || gSettings.dueDay,
      expenses:    d.expenses    || gSettings.expenses,
      logoBase64:  d.logoBase64  || gSettings.logoBase64,
      wa:          d.wa          || gSettings.wa,
      mpToken:     d.mpToken     || "",
      mpPublicKey: d.mpPublicKey || "",
      status:      d.status      || "activo",
      plazos:      d.plazos      || gSettings.plazos,
      brandColor:  d.brandColor  || gSettings.brandColor || "#1a56db",
      maxAmount:   d.maxAmount   || gSettings.maxAmount  || 1000000
    });
    applyBranding();
    refreshSimMeta();
  } catch(e) { console.warn("Branding:", e); }
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════════ */
async function loadSettings() {
  if (!effectiveLid()) return;
  try {
    const s = await getDoc(settRef());
    if (s.exists()) gSettings = { ...gSettings, ...s.data() };
  } catch{}
  if (gRefLenderId && !gLenderId) await loadLenderBranding(gRefLenderId);
  applyBranding();
  refreshSimMeta();
  const sv = (id, v) => { const e = el(id); if (e) e.value = v || ""; };
  sv("cfgTna",      gSettings.tna      || "");
  sv("cfgDue",      gSettings.dueDay   || "");
  sv("cfgAppName",  gSettings.appName  || "");
  sv("cfgCity",     gSettings.city     || "");
  sv("cfgExpenses", gSettings.expenses || 0);
  sv("cfgWa",       gSettings.wa       || "");
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

  // Plazos checkboxes
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
    const le = el("lblExp");    if (le) le.textContent = gSettings.expenses + "%";
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
  // Pill buttons para modo cliente
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
    const manualEl  = el("clientAmountManual");
    const manualVal = manualEl ? Number(digits(manualEl.value)) : 0;
    if (manualVal > 0) return manualVal;
    return Number(el("clientAmountSlider")?.value || el("simAmount")?.value || 0);
  }
  return Number(digits(el("simAmountInput")?.value || el("simAmount")?.value || ""));
}

function autoSimClient() {
  const amt = getSimAmount(), m = getSimMonths();
  if (!amt || !m || !gSettings.tna) return;
  const gastoOtorgAmt  = Math.round(amt * GASTO_OTORGAMIENTO / 100);
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
   APPLY BRANDING
   ══════════════════════════════════════════════════════════════ */
function applyBranding() {
  const name = gSettings.appName || "Prestify";
  document.title = name + " · Tu financiera, digitalizada";

  const mark = el("logoMark");
  if (mark) {
    if (gSettings.logoBase64) mark.innerHTML = `<img src="${gSettings.logoBase64}" alt="logo"/>`;
    else mark.textContent = name.replace(/\s+/g, "").slice(0, 1).toUpperCase();
  }
  const mid = Math.ceil(name.length / 2);
  const ln = el("logoName");
  if (ln) ln.innerHTML = `${name.slice(0, mid)}<span>${name.slice(mid)}</span>`;

  const bc = gSettings.brandColor || "#1a56db";
  document.documentElement.style.setProperty("--brand-color", bc);
  document.documentElement.style.setProperty("--blue", bc);

  const adminTitle = el("adminDashTitle");
  if (adminTitle) adminTitle.textContent = name;

  // Modo portal cliente
  if (gRefLenderId && !gLenderId) {
    document.body.classList.add("client-mode");
    const maxAmt  = gSettings.maxAmount || 1000000;
    const sliderEl = el("clientAmountSlider");
    if (sliderEl) {
      sliderEl.max = maxAmt;
      if (Number(sliderEl.value) > maxAmt) sliderEl.value = Math.round(maxAmt * 0.05);
      const disp = el("clientAmountDisplay");
      if (disp) disp.textContent = "$ " + Number(sliderEl.value).toLocaleString("es-AR");
      const sa = el("simAmount");
      if (sa) sa.value = sliderEl.value;
    }
    const maxLbl = el("sliderMaxLabel"); if (maxLbl) maxLbl.textContent = "$ " + maxAmt.toLocaleString("es-AR");
    const minLbl = el("sliderMinLabel"); if (minLbl) minLbl.textContent = "$ 5.000";
    const bh = el("lenderBrandHeader"); if (bh) bh.style.display = "";
    const bn = el("lenderBrandName");   if (bn) bn.textContent = name;
    const ft = el("prestifyFooter");    if (ft) ft.style.display = "";
    const caw = el("clientAmountWrap"); if (caw) caw.style.display = "";
    const aaw = el("adminAmountWrap");  if (aaw) aaw.style.display = "none";
    const apw = el("adminPlazoWrap");   if (apw) apw.style.display = "none";
    const cpw = el("clientPillsWrap");  if (cpw) cpw.style.display = "";
    const hs  = el("heroSection");      if (hs)  hs.style.display  = "none";
    const ht  = el("simHintText");
    if (ht) ht.textContent = "Usá el simulador para ver tu cuota, luego completá el formulario.";
    const btnSim = el("btnSim");
    if (btnSim) btnSim.innerHTML = `<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:#fff;fill:none;stroke-width:2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Ver mi cuota`;
    const cardTitles = document.querySelectorAll(".card-title");
    if (cardTitles.length > 0) cardTitles[0].innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Calculá tu cuota`;
    if (cardTitles.length > 1) cardTitles[1].innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Solicitá tu préstamo`;
  }
}

/* ══════════════════════════════════════════════════════════════
   ONBOARDING — 3 pasos
   ══════════════════════════════════════════════════════════════ */
let gObStep = 1;

function initObSigCanvas() {
  const canvas = el("obSigCanvas");
  if (!canvas) return;
  canvas.width  = canvas.parentElement.clientWidth || 460;
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
  canvas.onmousedown  = e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.onmousemove  = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.onmouseup    = canvas.onmouseleave = () => drawing = false;
  canvas.ontouchstart = e => { e.preventDefault(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.ontouchmove  = e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.ontouchend   = e => { e.preventDefault(); drawing = false; };
}

function setObStep(step) {
  gObStep = step;
  [1, 2, 3].forEach(i => {
    el(`obStep${i}`).className    = "ob-step" + (i < step ? " done" : i === step ? " active" : "");
    el(`obContent${i}`).className = "ob-content" + (i === step ? " active" : "");
  });
}

window.selectPayMethod = function(method) {
  gObPayMethod = method;
  el("pmOptMP").classList.toggle("selected",     method === "mp");
  el("pmOptManual").classList.toggle("selected",  method === "manual");
  el("obMpFields").style.display  = method === "mp"     ? "" : "none";
  el("obManualMsg").style.display = method === "manual" ? "" : "none";
};

async function showOnboarding() {
  el("onboardingOverlay").classList.add("show");
  setTimeout(initObSigCanvas, 200);
}

el("btnObClearSig")?.addEventListener("click", () => {
  const c = el("obSigCanvas"); if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  gObSigData = null;
});

el("btnObStep1")?.addEventListener("click", () => {
  const name  = (el("obName").value  || "").trim();
  const dni   = digits(el("obDni").value);
  const email = (el("obEmail").value || "").trim();
  if (!name || !dni || !email) { toast("Completá nombre, DNI y email.", "err"); return; }
  if (!el("obConsentCheck").checked) { toast("Debés aceptar los términos de uso.", "err"); return; }
  const canvas = el("obSigCanvas");
  const data   = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(data).some((v, i) => i % 4 === 3 && v > 0)) {
    toast("Dibujá tu firma para continuar.", "err"); return;
  }
  gObSigData = canvas.toDataURL("image/png");
  setObStep(2);
});

el("btnObBack1")?.addEventListener("click", () => setObStep(1));
el("btnObStep2")?.addEventListener("click", () => {
  const appName = (el("obAppName").value || "").trim();
  const tna     = Number(digits(el("obTna").value));
  const due     = Number(digits(el("obDueDay").value));
  if (!appName)             { toast("Ingresá el nombre del negocio.", "err"); return; }
  if (!tna || tna < 1)      { toast("Ingresá la TNA.", "err"); return; }
  if (!due || due < 1 || due > 28) { toast("Día de vencimiento entre 1 y 28.", "err"); return; }
  setObStep(3);
});

el("btnObBack2")?.addEventListener("click", () => setObStep(2));

el("btnObFinish")?.addEventListener("click", async () => {
  if (!gLenderId) { toast("Error de sesión. Recargá la página.", "err"); return; }
  el("btnObFinish").disabled    = true;
  el("btnObFinish").textContent = "Guardando...";
  try {
    const cfg = {
      lenderId:  gLenderId,
      appName:   (el("obAppName").value || "Prestify").trim(),
      city:      (el("obCity").value    || "Río Gallegos, Santa Cruz").trim(),
      tna:       Number(digits(el("obTna").value)),
      dueDay:    Math.min(28, Math.max(1, Number(digits(el("obDueDay").value)))),
      expenses:  Number(el("obExpenses").value || 0),
      wa:        (el("obWa").value || "").trim(),
      status:    "pendiente",
      plazos:    [3, 6, 9, 12, 18, 24],
      onboardingDone: true,
      onboardingAt:   nowTS(),
      operator: {
        name:              (el("obName").value  || "").trim(),
        dni:               digits(el("obDni").value),
        email:             (el("obEmail").value || "").trim(),
        consentSignedAt:   new Date().toISOString(),
        signatureImg:      gObSigData || ""
      },
      updatedAt: nowTS()
    };
    if (gObPayMethod === "mp") {
      const tok = (el("obMpToken").value     || "").trim();
      const pub = (el("obMpPublicKey").value || "").trim();
      if (tok) cfg.mpToken     = tok;
      if (pub) cfg.mpPublicKey = pub;
    }
    await Promise.all([
      setDoc(settRef(),         cfg, { merge: true }),
      setDoc(lenderRef(gLenderId), cfg, { merge: true })
    ]);
    Object.assign(gSettings, cfg);
    applyBranding(); refreshSimMeta();
    el("onboardingOverlay").classList.remove("show");
    toast("✅ Cuenta registrada. Aguardá la activación de tu financiera.", "ok", 6000);
    checkPending();
  } catch(e) {
    toast("Error al guardar. Intentá de nuevo.", "err");
    el("btnObFinish").disabled    = false;
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
  el("adminGate").style.display     = ok ? "none" : "";
  el("adminContent").style.display  = ok ? ""     : "none";
  el("btnAdminLogin").style.display = ok ? "none" : "";
  el("btnLogout").style.display     = ok ? ""     : "none";
  el("notifWrap").style.display     = ok ? ""     : "none";

  if (ok) {
    const saBtn = el("btnViewSuperAdmin");
    if (saBtn) saBtn.style.display = (u.uid === SUPER_ADMIN_UID) ? "" : "none";
    el("adminUserLabel").textContent = "Sesión: " + u.email + " · Lender ID: " + u.uid.slice(0, 8) + "...";
    hideLandingPage();

    if (u.uid === SUPER_ADMIN_UID) {
      el("heroSection").style.display = "none";
      el("clientView").style.display  = "none";
      el("adminView").className       = "admin-wrap";
      el("superadminView")?.classList.add("show");
      loadSuperAdmin();
      return;
    }

    el("heroSection").style.display   = "none";
    el("clientView").style.display    = "none";
    el("adminView").className         = "admin-wrap visible";
    el("btnViewClient").style.display = "";
    el("btnViewAdmin").style.display  = "";
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
      el("btnViewAdmin").style.display  = "";
      showView("client");
      await loadSettings();
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   STATUS LISTENER — bloqueo remoto reactivo
   ══════════════════════════════════════════════════════════════ */
function startStatusListener() {
  if (!gLenderId || gStatusUnsub) return;
  gStatusUnsub = onSnapshot(lenderRef(gLenderId), snap => {
    if (!snap.exists()) return;
    const data       = snap.data();
    const prevStatus = gSettings.status;
    gSettings.status = data.status || "activo";
    if (data.plazos) gSettings.plazos = data.plazos;
    if (checkSuspended()) { if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; } return; }
    if (checkPending())   { if (gSnapshotUnsub) { gSnapshotUnsub(); gSnapshotUnsub = null; } return; }
    if (prevStatus !== "activo" && gSettings.status === "activo") {
      el("pendingOverlay").classList.remove("show");
      el("adminContent").style.display = gUser ? "" : "none";
      toast("🎉 Tu cuenta fue activada. ¡Bienvenido a Prestify!", "ok", 6000);
      loadAllAdmin(); startRealtimeListener();
      return;
    }
    el("adminContent").style.display = gUser ? "" : "none";
  }, err => console.error("StatusListener:", err));
}

/* ══════════════════════════════════════════════════════════════
   LOGIN / LOGOUT
   ══════════════════════════════════════════════════════════════ */
async function doLogin() {
  const email = prompt("Email de administrador:") || "";
  const pass  = prompt("Contraseña:")             || "";
  if (!email || !pass) return;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Sesión iniciada", "ok");
  } catch { toast("Credenciales incorrectas", "err"); }
}
el("btnAdminLogin").onclick  = doLogin;
el("btnAdminLogin2").onclick = doLogin;
el("btnLogout").onclick = () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => toast("Sesión cerrada", "info")).catch(() => {});
};
el("btnPendingLogout").onclick = () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => {
    el("pendingOverlay").classList.remove("show");
    toast("Sesión cerrada", "info");
  }).catch(() => {});
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
  el("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 9000);
  el("alertBannerText").textContent = `Nueva solicitud de ${name} · ${amt}`;
  const banner = el("alertBanner");
  banner.classList.add("show");
  setTimeout(() => banner.classList.remove("show"), 7000);
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
  } catch {}
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
    item.onclick = () => { showView("admin"); switchTab("Pending"); el("notifDropdown").classList.remove("open"); };
  });
}
function updateNotifBadge() {
  const count = gNotifications.filter(n => n.unread).length;
  const badge = el("notifBadge");
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent   = count > 9 ? "9+" : count;
}
el("notifBell").onclick = () => {
  el("notifDropdown").classList.toggle("open");
  gNotifications.forEach(n => n.unread = false);
  updateNotifBadge(); renderNotifDropdown();
};
el("btnClearNotifs").onclick = () => {
  gNotifications = []; renderNotifDropdown(); updateNotifBadge();
  el("notifDropdown").classList.remove("open");
};
el("alertBannerClose").onclick = () => el("alertBanner").classList.remove("show");
document.addEventListener("click", e => {
  if (!el("notifWrap").contains(e.target)) el("notifDropdown").classList.remove("open");
});

/* ══════════════════════════════════════════════════════════════
   VISTAS Y TABS
   ══════════════════════════════════════════════════════════════ */
function showView(v) {
  el("landingView")?.classList.remove("show");
  document.body.classList.remove("landing-active");
  el("superadminView")?.classList.remove("show");
  const a  = v === "admin";
  const sa = v === "superadmin";
  el("clientView").style.display  = (a || sa) ? "none" : "";
  el("heroSection").style.display = (a || sa) ? "none" : "";
  el("adminView").className       = "admin-wrap" + ((a && !sa) ? " visible" : "");
  el("btnViewClient").className   = "nav-btn" + ((!a && !sa) ? " active" : "");
  el("btnViewAdmin").className    = "nav-btn" + ((a && !sa) ? " active" : "");
  const saBtn = el("btnViewSuperAdmin");
  if (saBtn) saBtn.className = "nav-btn" + (sa ? " active" : "");
  if (sa) el("superadminView")?.classList.add("show");
}
el("btnViewClient").onclick = () => showView("client");
el("btnViewAdmin").onclick  = () => showView("admin");
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
  btn.onclick = () => switchTab(btn.dataset.tab);
});

/* ══════════════════════════════════════════════════════════════
   SIMULADOR
   ══════════════════════════════════════════════════════════════ */
el("btnSim").onclick = () => {
  const montoSolicitado = getSimAmount();
  const m = getSimMonths();
  if (!gSettings.tna || !gSettings.dueDay) { toast("El admin aún no configuró la TNA.", "err"); return; }
  if (!montoSolicitado || !m) { el("simResult").innerHTML = ""; return; }

  const gastoOtorgAmt    = Math.round(montoSolicitado * GASTO_OTORGAMIENTO / 100);
  const capitalFinanciar = montoSolicitado + gastoOtorgAmt;
  const cuota            = Math.round(annuity(capitalFinanciar, gSettings.tna, m));
  const totalAPagar      = cuota * m;
  const interesesProyectados = totalAPagar - capitalFinanciar;
  const expP = gSettings.expenses || 0;
  const expA = Math.round(montoSolicitado * expP / 100);
  const netoAEntregar = montoSolicitado - expA;

  const badge = el("simDeductionBadge");
  if (expP > 0) { badge.style.display = "flex"; el("simExpAmt").textContent = fmtMoney(expA); }
  else badge.style.display = "none";

  let rows = "";
  for (let i = 1; i <= m; i++) {
    const d = new Date(); d.setMonth(d.getMonth() + i); d.setDate(Math.min(gSettings.dueDay, 28));
    rows += `<div class="schedule-row"><span class="num">${String(i).padStart(2, "0")}</span><span class="date">${d.toLocaleDateString("es-AR")}</span><span class="amount">${fmtMoney(cuota)}</span><span class="action-col"><span class="pill warn">Pendiente</span></span></div>`;
  }

  if (gRefLenderId && !gLenderId) {
    let hero = el("clientCuotaHero");
    if (!hero) {
      hero = document.createElement("div");
      hero.id = "clientCuotaHero"; hero.className = "client-cuota-hero";
      el("simResult").parentNode.insertBefore(hero, el("simResult"));
    }
    hero.innerHTML = `<div class="client-cuota-label">Tu cuota mensual</div>
      <div class="client-cuota-value">${fmtMoney(cuota)}</div>
      <div class="client-cuota-months">${m} cuotas · TNA ${gSettings.tna}%</div>`;
  }

  el("simResult").innerHTML = `<div class="sim-result-box">
    <div class="sim-cuota-display">
      <span class="sim-cuota-label">Cuota mensual</span>
      <span class="sim-cuota-value">${fmtMoney(cuota)}</span>
    </div>
    <div class="breakdown-box">
      <div class="breakdown-row"><span class="bl">Monto solicitado</span><span class="bv">${fmtMoney(montoSolicitado)}</span></div>
      <div class="breakdown-row warn-row"><span class="bl">Gasto de otorgamiento (${GASTO_OTORGAMIENTO}%)</span><span class="bv">+ ${fmtMoney(gastoOtorgAmt)}</span></div>
      <div class="breakdown-row"><span class="bl">Capital a financiar</span><span class="bv">${fmtMoney(capitalFinanciar)}</span></div>
      ${expP > 0 ? `<div class="breakdown-row warn-row"><span class="bl">Gastos administrativos (${expP}%)</span><span class="bv">- ${fmtMoney(expA)}</span></div>` : ""}
      <div class="breakdown-row"><span class="bl">Neto a recibir</span><span class="bv" style="color:var(--ok)">${fmtMoney(netoAEntregar)}</span></div>
      <div class="breakdown-row"><span class="bl">Intereses proyectados</span><span class="bv" style="color:var(--purple)">${fmtMoney(interesesProyectados)}</span></div>
      <div class="breakdown-row accent"><span class="bl">Total a pagar</span><span class="bv">${fmtMoney(totalAPagar)}</span></div>
    </div>
    <div class="schedule-wrap"><div class="schedule-header"><span>#</span><span>Vencimiento</span><span>Importe</span><span>Estado</span></div>${rows}</div>
  </div>`;
};

/* ══════════════════════════════════════════════════════════════
   SOLICITUD DE PRÉSTAMO
   ══════════════════════════════════════════════════════════════ */
el("btnSendReq").onclick = async () => {
  const montoSolicitado = getSimAmount();
  const months = getSimMonths();
  if (!montoSolicitado || !months) { toast("Completá el Simulador primero.", "err"); return; }
  const borrower = {
    name:  (el("bName").value  || "").trim(),
    dni:   digits(el("bDni").value),
    email: (el("bEmail").value || "").trim(),
    phone: (el("bPhone").value || "").trim(),
    alias: (el("bAlias").value || "").trim()
  };
  if (!borrower.name || !borrower.dni) { toast("Completá nombre y DNI.", "err"); return; }

  const urlParams = new URLSearchParams(window.location.search);
  const urlRef    = urlParams.get("ref") || gRefLenderId || sessionStorage.getItem("prestify_ref");
  const lid       = urlRef || gLenderId;
  if (!lid) {
    toast("Error: no se detectó el prestamista. Verificá que la URL tenga ?ref=ID.", "err");
    console.error("lenderId faltante. URL:", location.href);
    return;
  }
  if (!gSettings.tna) { toast("Error: no se pudo cargar la configuración del prestamista.", "err"); return; }

  const gastoOtorgAmt    = Math.round(montoSolicitado * GASTO_OTORGAMIENTO / 100);
  const capitalFinanciar = montoSolicitado + gastoOtorgAmt;
  const cuota            = Math.round(annuity(capitalFinanciar, gSettings.tna || 100, months));

  try {
    const loanDoc = {
      status:   "pending",
      lenderId: lid,
      amount:   montoSolicitado,
      gastoOtorgPct: GASTO_OTORGAMIENTO,
      gastoOtorgAmt,
      capitalFinanciar,
      months,
      tna:    gSettings.tna || 0,
      dueDay: gSettings.dueDay || 10,
      installment: cuota,
      borrower,
      createdAt: nowTS(), updatedAt: nowTS()
    };
    await addDoc(collection(db, "loans"), loanDoc);
    const sendBtn    = el("btnSendReq");
    const originalHtml = sendBtn.innerHTML;
    sendBtn.innerHTML  = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg> ¡Solicitud enviada con éxito!`;
    sendBtn.style.background = "linear-gradient(135deg,#059669,#10b981)";
    sendBtn.disabled = true;
    ["bName", "bDni", "bEmail", "bPhone", "bAlias"].forEach(id => { const e = el(id); if (e) e.value = ""; });
    toast("✅ Solicitud enviada. Te contactaremos pronto.", "ok", 5000);
    const successCard = document.createElement("div");
    successCard.className = "req-success-card";
    successCard.innerHTML = `<div class="req-success-icon">✓</div><div><div class="req-success-title">¡Solicitud recibida!</div><div class="req-success-sub">El prestamista revisará tu solicitud y se pondrá en contacto con vos.</div></div>`;
    sendBtn.parentNode.insertBefore(successCard, sendBtn.nextSibling);
    setTimeout(() => { successCard.remove(); sendBtn.innerHTML = originalHtml; sendBtn.style.background = ""; sendBtn.disabled = false; }, 6000);
  } catch(e) { toast("Error al enviar. Intentá de nuevo.", "err"); console.error("Error saving loan:", e); }
};

/* ══════════════════════════════════════════════════════════════
   HELPERS RENDER
   ══════════════════════════════════════════════════════════════ */
function waButton(phone, name) {
  if (!phone) return "";
  return `<a href="https://wa.me/${digits(phone)}?text=Hola+${encodeURIComponent(name || "")}" target="_blank" class="btn-wa btn-sm"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WA</a>`;
}

function loanItem(d, actions = "") {
  const b = d.borrower || {};
  const notesHtml = d.notes ? `<div class="loan-notes"><strong>Nota:</strong> ${d.notes}</div>` : "";
  const gastoOtorg = d.gastoOtorgAmt || Math.round((d.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin     = d.capitalFinanciar || (d.amount || 0) + gastoOtorg;
  const cuota      = d.installment || Math.round(annuity(capFin, d.tna || 100, d.months || 1));
  const breakdownHtml = `<div class="breakdown-box" style="margin-top:10px;margin-bottom:0">
    <div class="breakdown-row"><span class="bl">Monto solicitado</span><span class="bv">${fmtMoney(d.amount)}</span></div>
    <div class="breakdown-row warn-row"><span class="bl">Gasto otorgamiento (${d.gastoOtorgPct || GASTO_OTORGAMIENTO}%)</span><span class="bv">+ ${fmtMoney(gastoOtorg)}</span></div>
    <div class="breakdown-row"><span class="bl">Capital a financiar</span><span class="bv">${fmtMoney(capFin)}</span></div>
    <div class="breakdown-row accent"><span class="bl">Cuota mensual · ${d.months}m · TNA ${d.tna}%</span><span class="bv">${fmtMoney(cuota)}</span></div>
  </div>`;
  return `<div class="loan-item">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><div class="loan-name">${b.name || "--"}</div>
        <div class="loan-meta">
          <span>DNI <strong>${b.dni || "--"}</strong></span>
          <span>Solicitado <strong>${fmtMoney(d.amount)}</strong></span>
          <span><strong>${d.months}</strong> cuotas</span>
          <span>TNA <strong>${d.tna}%</strong></span>
          ${d.contractId ? `<span>Contrato <strong>${d.contractId}</strong></span>` : ""}
        </div>
      </div>
      ${waButton(b.phone, b.name)}
    </div>${breakdownHtml}${notesHtml}<div class="toolbar">${actions}</div></div>`;
}

function attachNotes(box) {
  box.querySelectorAll("[data-note]").forEach(btn => btn.onclick = async () => {
    const id = btn.getAttribute("data-note");
    const s  = await getDoc(doc(db, "loans", id));
    if (!s.exists()) return;
    const txt = prompt("Nota de seguimiento:", s.data().notes || "");
    if (txt === null) return;
    await updateDoc(doc(db, "loans", id), { notes: txt, updatedAt: nowTS() });
    toast("Nota guardada", "ok"); await loadAllAdmin();
  });
}

function applySearch(inputId, container) {
  const q = (el(inputId)?.value || "").toLowerCase();
  container.querySelectorAll(".loan-item").forEach(item =>
    item.style.display = item.textContent.toLowerCase().includes(q) ? "" : "none"
  );
}
el("searchPend")?.addEventListener("input", () => applySearch("searchPend", el("listPend")));
el("searchAct")?.addEventListener("input",  () => applySearch("searchAct",  el("listAct")));

/* ══════════════════════════════════════════════════════════════
   ADMIN: PENDIENTES
   ══════════════════════════════════════════════════════════════ */
async function loadPend() {
  if (!gLenderId) return;
  const box = el("listPend"); box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(100)));
    el("badgePend").textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin solicitudes pendientes</div>`; return; }
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      box.insertAdjacentHTML("beforeend", loanItem(d,
        `<button class="btn-success btn-sm" data-pre="${d.id}">Preaprobar</button>
         <button class="btn-outline btn-sm" data-note="${d.id}">Nota</button>
         <button class="btn-danger btn-sm" data-del="${d.id}">Eliminar</button>`));
    });
    attachNotes(box);
    box.querySelectorAll("[data-pre]").forEach(btn => btn.onclick = async () => {
      if (!confirm("¿Preaprobar?")) return;
      const contractId = Math.random().toString(36).slice(2, 10).toUpperCase();
      await updateDoc(doc(db, "loans", btn.getAttribute("data-pre")), { status: "preapproved", contractId, updatedAt: nowTS() });
      toast("Preaprobado", "ok"); await loadAllAdmin();
    });
    box.querySelectorAll("[data-del]").forEach(btn => btn.onclick = async () => {
      if (!confirm("¿Eliminar?")) return;
      await updateDoc(doc(db, "loans", btn.getAttribute("data-del")), { status: "deleted", updatedAt: nowTS() });
      toast("Eliminado", "info"); await loadAllAdmin();
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: PREAPROBADOS
   ══════════════════════════════════════════════════════════════ */
async function loadPre() {
  if (!gLenderId) return;
  const box = el("listPre"); box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "preapproved"), orderBy("createdAt", "desc"), limit(100)));
    el("badgePre").textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin preaprobados</div>`; return; }
    qs.forEach(docu => {
      const d    = { ...docu.data(), id: docu.id };
      const badge = d.signed
        ? `<span class="pill ok">Firmado</span>`
        : `<span class="pill warn">Sin firma</span>`;
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
    box.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
      const s = await getDoc(doc(db, "loans", b.getAttribute("data-open")));
      if (!s.exists()) return;
      openContractWindow({ ...s.data(), id: b.getAttribute("data-open") });
    });
    box.querySelectorAll("[data-share]").forEach(b => b.onclick = async () => {
      const id = b.getAttribute("data-share");
      const s  = await getDoc(doc(db, "loans", id));
      if (!s.exists()) return;
      const L    = { ...s.data(), id };
      const link = location.origin + location.pathname + "?ref=" + gLenderId + "#sign-" + id;
      const msg  = `Hola ${L.borrower?.name}, tu contrato ${gSettings.appName || "Prestify"} (${L.contractId}) está listo. Firmalo acá: ${link}`;
      if (navigator.share) { try { await navigator.share({ title: "Contrato", text: msg }); } catch {} }
      else prompt("Copiá el enlace:", link);
    });
    box.querySelectorAll("[data-approve]").forEach(b => b.onclick = async () => {
      const id = b.getAttribute("data-approve");
      const s  = await getDoc(doc(db, "loans", id));
      if (!s.exists()) return;
      const L = s.data();
      if (!L.signed) { toast("Todavía no firmó.", "err"); return; }
      showActivateModal({ ...L, id });
    });
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!confirm("¿Eliminar?")) return;
      await updateDoc(doc(db, "loans", b.getAttribute("data-del")), { status: "deleted", updatedAt: nowTS() });
      toast("Eliminado", "info"); await loadAllAdmin();
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: ACTIVOS
   ══════════════════════════════════════════════════════════════ */
async function loadAct() {
  if (!gLenderId) return;
  const box = el("listAct"); box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), orderBy("activeAt", "desc"), limit(100)));
    el("badgeAct").textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin préstamos activos</div>`; return; }
    qs.forEach(docu => {
      const d       = { ...docu.data(), id: docu.id };
      const allPaid = (d.paidCount || 0) >= d.months;
      const pct     = d.months ? Math.round((d.paidCount || 0) / d.months * 100) : 0;
      box.insertAdjacentHTML("beforeend", `<div class="loan-item" id="li-${d.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><div class="loan-name">${d.borrower?.name || "--"}</div>
            <div class="loan-meta">
              <span>DNI <strong>${d.borrower?.dni || "--"}</strong></span>
              <span><strong>${fmtMoney(d.amount)}</strong></span>
              <span><strong>${d.months}</strong> cuotas</span>
              <span>TNA <strong>${d.tna}%</strong></span>
              ${d.contractId ? `<span><strong>${d.contractId}</strong></span>` : ""}
            </div>
            <div style="margin:8px 0 4px">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px">
                <span>Progreso</span><span style="color:var(--sky)">${d.paidCount || 0}/${d.months} cuotas</span>
              </div>
              <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            </div>
          </div>
          ${waButton(d.borrower?.phone, d.borrower?.name)}
        </div>
        ${d.notes ? `<div class="loan-notes"><strong>Nota:</strong> ${d.notes}</div>` : ""}
        <div class="toolbar">
          <button class="btn-outline btn-sm" data-cuotas="${d.id}">📅 Ver cuotas</button>
          <button class="btn-success btn-sm" data-paid="${d.id}" ${allPaid ? "" : "disabled"}>✓ Cerrar saldado</button>
          <button class="btn-outline btn-sm" data-note="${d.id}">Nota</button>
          <button class="btn-danger btn-sm" data-charge="${d.id}">Incobrable</button>
        </div>
        <div id="sch-${d.id}"></div></div>`);
    });
    attachNotes(box);
    box.querySelectorAll("[data-cuotas]").forEach(b => b.onclick = async () => {
      const id    = b.getAttribute("data-cuotas");
      const schEl = el(`sch-${id}`);
      if (schEl.innerHTML) { schEl.innerHTML = ""; return; }
      const s = await getDoc(doc(db, "loans", id));
      if (!s.exists()) return;
      const L = { ...s.data(), id };
      const rowsHtml = scheduleRows(L).map(r => {
        const late   = daysLate(r.due);
        const badge  = r.paid ? `<span class="pill ok">Pagada</span>` : late > 10 ? `<span class="pill bad">Mora +${late}d</span>` : late > 0 ? `<span class="pill warn">Mora ${late}d</span>` : `<span class="pill teal">Pendiente</span>`;
        const btnPagar = r.paid ? "" : `<button class="btn-pay btn-sm" data-mark="${L.id}:${r.n}"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Pagar</button>`;
        const rc = r.paid ? "schedule-row is-paid" : late > 0 ? "schedule-row is-late" : "schedule-row";
        return `<div class="${rc}"><span class="num">${String(r.n).padStart(2, "0")}</span><span class="date">${new Date(r.due).toLocaleDateString("es-AR")}</span><span class="amount">${fmtMoney(r.amount)}</span><span class="action-col">${badge}${btnPagar}</span></div>`;
      }).join("");
      schEl.innerHTML = `<div class="schedule-wrap" style="margin-top:12px"><div class="schedule-header"><span>#</span><span>Vencimiento</span><span>Importe</span><span>Acción</span></div>${rowsHtml}</div>`;
      schEl.querySelectorAll("[data-mark]").forEach(btn => btn.onclick = async () => {
        const [loanId] = btn.getAttribute("data-mark").split(":");
        const s2 = await getDoc(doc(db, "loans", loanId));
        if (!s2.exists()) return;
        const cur = s2.data();
        await updateDoc(doc(db, "loans", loanId), { paidCount: Math.min((cur.paidCount || 0) + 1, cur.months), updatedAt: nowTS() });
        toast("Cuota registrada como pagada", "ok");
        await loadAct(); await computeDashboard(); await loadMora();
      });
    });
    box.querySelectorAll("[data-paid]").forEach(b => b.onclick = async () => {
      const id = b.getAttribute("data-paid");
      const s  = await getDoc(doc(db, "loans", id));
      if (!s.exists()) return;
      if ((s.data().paidCount || 0) < s.data().months) { toast("Faltan cuotas.", "err"); return; }
      await updateDoc(doc(db, "loans", id), { status: "paid", updatedAt: nowTS() });
      toast("Préstamo cerrado como saldado", "ok"); await loadAllAdmin();
    });
    box.querySelectorAll("[data-charge]").forEach(b => b.onclick = async () => {
      if (!confirm("¿Mover a incobrables?")) return;
      await updateDoc(doc(db, "loans", b.getAttribute("data-charge")), { status: "charged_off", chargedOffAt: nowTS(), updatedAt: nowTS() });
      toast("Movido a incobrables", "info"); await loadAllAdmin();
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar activos.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN: MORA
   ══════════════════════════════════════════════════════════════ */
async function loadMora() {
  if (!gLenderId) return;
  const box = el("listMora"); box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), orderBy("activeAt", "desc"), limit(200)));
    const items = [], deudoresSet = new Set();
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      scheduleRows(d).forEach(r => {
        const dl = daysLate(r.due);
        if (!r.paid && dl > 0) { items.push({ loan: d, row: r, days: dl }); deudoresSet.add(d.id); }
      });
    });
    items.sort((a, b) => b.days - a.days);
    el("badgeMora").textContent = items.length;
    if (!items.length) {
      el("moraSummary").style.display = "none";
      box.innerHTML = `<div class="empty">✅ Sin cuotas en mora. ¡Todo al día!</div>`; return;
    }
    const totalAmt = items.reduce((s, i) => s + (i.row.amount || 0), 0);
    el("moraSummary").style.display = "grid";
    el("moraTotal").textContent     = fmtMoney(totalAmt);
    el("moraDeudores").textContent  = deudoresSet.size;
    el("moraMaxDias").textContent   = (items[0]?.days || 0) + "d";
    items.forEach(({ loan: L, row: r, days }) => {
      const b    = L.borrower || {};
      const phone = digits(b.phone || "");
      const msg  = encodeURIComponent(`Hola ${b.name}, te contactamos de ${gSettings.appName || "Prestify"}. Tu cuota N°${r.n} de ${fmtMoney(r.amount)} tiene ${days} días de atraso. Por favor informanos el estado del pago. ¡Gracias!`);
      const waLink   = phone ? `https://wa.me/${phone}?text=${msg}` : "";
      const sev      = days > 30 ? "grave" : days > 10 ? "media" : "leve";
      const pillClass = sev === "grave" ? "bad" : sev === "media" ? "warn" : "teal";
      const label    = sev === "grave" ? "🔴 Mora grave" : sev === "media" ? "🟡 Mora media" : "🔵 Mora leve";
      box.insertAdjacentHTML("beforeend", `<div class="mora-row ${sev}">
        <div><div class="mora-name">${b.name || "--"}</div><div class="mora-sub">DNI ${b.dni || "--"} · Cuota ${r.n}/${L.months} · ${L.contractId || ""}</div></div>
        <div><div class="mora-dias ${sev}">${days}</div><div class="mora-dias-label ${sev}">días</div></div>
        <div><div class="mora-amount">${fmtMoney(r.amount)}</div><div class="mora-amount-label">monto cuota</div></div>
        <div><span class="pill ${pillClass}">${label}</span></div>
        <div>${waLink ? `<a href="${waLink}" target="_blank" class="btn-wa"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>Cobrar por WhatsApp</a>` : `<span style="font-size:11px;color:var(--muted)">Sin teléfono</span>`}</div>
      </div>`);
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar mora.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   COMPROBANTES
   ══════════════════════════════════════════════════════════════ */
async function loadComprobantes() {
  if (!gLenderId) return;
  const box = el("listComp"); box.innerHTML = "";
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), where("hasComprobantePendiente", "==", true), limit(100)));
    el("badgeComp").textContent = qs.size;
    if (qs.empty) { box.innerHTML = `<div class="empty">✅ Sin comprobantes pendientes de verificación</div>`; return; }
    qs.forEach(docu => {
      const d     = { ...docu.data(), id: docu.id };
      const b     = d.borrower || {};
      const comps = d.comprobantesPendientes || [];
      comps.forEach((comp, idx) => {
        const imgHtml = comp.url
          ? `<img src="${comp.url}" style="max-width:100%;max-height:200px;border-radius:10px;border:1px solid var(--border-hi);margin-top:10px;display:block" alt="comprobante"/>`
          : `<p style="font-size:12px;color:var(--muted);margin-top:6px">Sin imagen adjunta</p>`;
        box.insertAdjacentHTML("beforeend", `<div class="loan-item">
          <div class="loan-name">${b.name || "--"} — <span style="color:var(--sky)">Cuota N°${comp.cuota}</span></div>
          <div class="loan-meta">
            <span>DNI <strong>${b.dni || "--"}</strong></span>
            <span>Importe cuota <strong>${fmtMoney(d.installment || 0)}</strong></span>
            <span>Enviado <strong>${comp.sentAt || "--"}</strong></span>
          </div>
          ${imgHtml}
          <div class="toolbar" style="margin-top:12px">
            <button class="btn-success btn-sm" data-approve-comp="${d.id}" data-idx="${idx}" data-cuota="${comp.cuota}">✓ Aprobar y marcar cuota como pagada</button>
            <button class="btn-danger btn-sm" data-reject-comp="${d.id}" data-idx="${idx}">✕ Rechazar comprobante</button>
          </div>
        </div>`);
      });
    });
    box.querySelectorAll("[data-approve-comp]").forEach(btn => btn.onclick = async () => {
      const loanId = btn.getAttribute("data-approve-comp");
      const idx    = Number(btn.getAttribute("data-idx"));
      const s      = await getDoc(doc(db, "loans", loanId));
      if (!s.exists()) return;
      const cur       = s.data();
      const newComps  = (cur.comprobantesPendientes || []).filter((_, i) => i !== idx);
      await updateDoc(doc(db, "loans", loanId), {
        paidCount:               Math.min((cur.paidCount || 0) + 1, cur.months),
        comprobantesPendientes:  newComps,
        hasComprobantePendiente: newComps.length > 0,
        updatedAt:               nowTS()
      });
      toast("✅ Cuota aprobada y marcada como pagada", "ok");
      await loadComprobantes(); await computeDashboard(); await loadAct();
    });
    box.querySelectorAll("[data-reject-comp]").forEach(btn => btn.onclick = async () => {
      if (!confirm("¿Rechazar este comprobante?")) return;
      const loanId = btn.getAttribute("data-reject-comp");
      const idx    = Number(btn.getAttribute("data-idx"));
      const s      = await getDoc(doc(db, "loans", loanId));
      if (!s.exists()) return;
      const cur      = s.data();
      const newComps = (cur.comprobantesPendientes || []).filter((_, i) => i !== idx);
      await updateDoc(doc(db, "loans", loanId), {
        comprobantesPendientes:  newComps,
        hasComprobantePendiente: newComps.length > 0,
        updatedAt:               nowTS()
      });
      toast("Comprobante rechazado.", "info"); await loadComprobantes();
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar comprobantes.</div>`; console.error(e); }
}

/* ══════════════════════════════════════════════════════════════
   HISTÓRICO
   ══════════════════════════════════════════════════════════════ */
async function loadInact() {
  if (!gLenderId) return;
  const box = el("listInact"); box.innerHTML = "";
  try {
    const status = inactTab === "paid" ? "paid" : "charged_off";
    const qs = await getDocs(loanQ(where("status", "==", status), orderBy("updatedAt", "desc"), limit(100)));
    if (qs.empty) { box.innerHTML = `<div class="empty">Sin registros</div>`; return; }
    qs.forEach(docu => {
      const d = { ...docu.data(), id: docu.id };
      let acts = `<button class="btn-outline btn-sm" data-open="${d.id}">Contrato</button>`;
      if (inactTab === "charged_off") acts += ` <button class="btn-danger btn-sm" data-debt="${d.id}">Certificado</button>`;
      acts += ` <button class="btn-danger btn-sm" data-del="${d.id}">✕</button>`;
      box.insertAdjacentHTML("beforeend", loanItem(d, acts));
    });
    box.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
      const s = await getDoc(doc(db, "loans", b.getAttribute("data-open")));
      if (!s.exists()) return;
      openContractWindow({ ...s.data(), id: b.getAttribute("data-open") });
    });
    box.querySelectorAll("[data-debt]").forEach(b => b.onclick = async () => {
      const s = await getDoc(doc(db, "loans", b.getAttribute("data-debt")));
      if (!s.exists()) return;
      openDebtCertificate({ ...s.data(), id: b.getAttribute("data-debt") });
    });
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!confirm("¿Eliminar definitivamente?")) return;
      await deleteDoc(doc(db, "loans", b.getAttribute("data-del")));
      toast("Eliminado", "info"); await loadInact();
    });
  } catch(e) { box.innerHTML = `<div class="empty">Error al cargar.</div>`; }
}
el("btnTabPaid").onclick    = () => { inactTab = "paid";        loadInact(); };
el("btnTabCharged").onclick = () => { inactTab = "charged_off"; loadInact(); };
el("btnReloadPend").onclick  = loadPend;
el("btnReloadPre").onclick   = loadPre;
el("btnReloadAct").onclick   = loadAct;
el("btnReloadMora").onclick  = loadMora;
el("btnReloadComp").onclick  = loadComprobantes;
el("btnReloadInact").onclick = loadInact;

/* ══════════════════════════════════════════════════════════════
   DASHBOARD — 5 KPIs
   ══════════════════════════════════════════════════════════════ */
async function computeDashboard() {
  if (!gLenderId) return;
  try {
    const qs = await getDocs(loanQ(where("status", "==", "active"), limit(500)));
    let invested = 0, recovered = 0, mora = 0, profit = 0, moraCount = 0, paidCount = 0, totalInst = 0;
    qs.forEach(docu => {
      const L   = docu.data();
      invested += (L.amount || 0);
      const inst = (L.installment && L.installment > 0) ? L.installment : Math.round(annuity(L.amount, L.tna, L.months));
      const paid = (L.paidCount || 0);
      recovered += inst * paid; paidCount += paid; totalInst += L.months;
      profit    += (inst * L.months) - (L.amount || 0);
      scheduleRows(L).forEach(r => { if (!r.paid && daysLate(r.due) > 0) { mora += (r.amount || 0); moraCount++; } });
    });
    const moraRate = totalInst > 0 ? Math.round((moraCount / totalInst) * 100) : 0;
    el("kpiInvested").textContent    = fmtMoney(invested);
    el("kpiActiveCount").textContent = qs.size + " préstamos activos";
    el("kpiRecovered").textContent   = fmtMoney(recovered);
    el("kpiPaidCount").textContent   = paidCount + " cuotas cobradas";
    el("kpiMora").textContent        = fmtMoney(mora);
    el("kpiMoraCount").textContent   = moraCount + " cuotas vencidas";
    el("kpiMoraRate").textContent    = moraRate + "%";
    el("kpiMoraBar").style.width     = Math.min(moraRate, 100) + "%";
    el("kpiProfit").textContent      = fmtMoney(profit);
  } catch(e) { console.error("Dashboard:", e); }
}

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════════════════════════ */
el("cfgLogoFile").onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    gSettings.logoBase64 = ev.target.result;
    el("cfgLogoPreview").innerHTML = `<img src="${ev.target.result}" alt="logo"/>`;
    applyBranding();
  };
  reader.readAsDataURL(file);
};

el("btnSelAllPlazos")?.addEventListener("click", () => {
  for (let n = 1; n <= 24; n++) { const cb = el(`plazo${n}`); if (cb) cb.checked = true; }
});
el("btnClearPlazos")?.addEventListener("click", () => {
  for (let n = 1; n <= 24; n++) { const cb = el(`plazo${n}`); if (cb) cb.checked = false; }
});

el("btnCopyMyLink")?.addEventListener("click", () => {
  if (!gLenderId) { toast("Iniciá sesión primero.", "err"); return; }
  const link = location.origin + location.pathname + "?ref=" + gLenderId;
  navigator.clipboard?.writeText(link)
    .then(() => toast("✅ Link copiado al portapapeles", "ok"))
    .catch(() => { prompt("Copiá tu link Prestify:", link); });
});

el("btnSaveCfg").onclick = async () => {
  if (!gLenderId) { toast("Necesitás iniciar sesión primero.", "err"); return; }
  const tna        = Number(digits(el("cfgTna").value));
  const due        = Math.min(28, Math.max(1, Number(digits(el("cfgDue").value))));
  const appName    = (el("cfgAppName").value  || "Prestify").trim();
  const city       = (el("cfgCity").value     || "Río Gallegos").trim();
  const expenses   = Number(el("cfgExpenses").value || "0");
  const wa         = (el("cfgWa").value       || "").trim();
  const brandColor = (el("cfgBrandColor")?.value || "#1a56db");
  const maxAmount  = Number(digits(el("cfgMaxAmount")?.value || "1000000")) || 1000000;
  const mpTokInput = (el("cfgMpToken").value  || "").trim();
  const mpPubKey   = (el("cfgMpPublicKey").value || "").trim();
  const mpToken    = mpTokInput && mpTokInput !== "••••••••••••••••"
    ? mpTokInput : (mpTokInput === "" ? "" : gSettings.mpToken || "");

  const plazos = [];
  for (let n = 1; n <= 24; n++) { const cb = el(`plazo${n}`); if (cb && cb.checked) plazos.push(n); }
  if (plazos.length === 0) { toast("Seleccioná al menos un plazo.", "err"); return; }

  const data = { tna, dueDay: due, appName, city, expenses, wa, plazos, brandColor, maxAmount, lenderId: gLenderId, updatedAt: nowTS() };
  if (gSettings.logoBase64) data.logoBase64 = gSettings.logoBase64;
  data.mpToken = mpToken; gSettings.mpToken = mpToken;
  if (mpPubKey) { data.mpPublicKey = mpPubKey; gSettings.mpPublicKey = mpPubKey; }
  await Promise.all([
    setDoc(settRef(),             data, { merge: true }),
    setDoc(lenderRef(gLenderId), data, { merge: true })
  ]);
  gSettings.plazos    = plazos;
  gSettings.maxAmount = maxAmount;
  await loadSettings(); refreshPlazoSelector();
  toast("Configuración guardada", "ok");
};

/* ══════════════════════════════════════════════════════════════
   LIMPIEZA EN CASCADA
   ══════════════════════════════════════════════════════════════ */
window.deleteLenderCascade = async function(lenderId) {
  if (!lenderId) { console.error("deleteLenderCascade: falta lenderId"); return; }
  if (!confirm(`¿Eliminar PERMANENTEMENTE el lender ${lenderId} y TODOS sus préstamos? Esta acción no se puede deshacer.`)) return;
  try {
    const loansSnap  = await getDocs(query(collection(db, "loans"), where("lenderId", "==", lenderId)));
    const BATCH_SIZE = 499;
    let batch = writeBatch(db), ops = 0;
    for (const d of loansSnap.docs) {
      batch.delete(d.ref); ops++;
      if (ops >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
    await deleteDoc(doc(db, "settings", lenderId));
    await deleteDoc(doc(db, "lenders",  lenderId));
    console.log(`✅ Lender ${lenderId} y sus ${loansSnap.size} préstamos eliminados.`);
    toast(`Lender eliminado. ${loansSnap.size} préstamos borrados.`, "ok", 6000);
  } catch(e) { console.error("deleteLenderCascade error:", e); toast("Error en eliminación cascada. Ver consola.", "err"); }
};

/* ══════════════════════════════════════════════════════════════
   ACTIVATE MODAL
   ══════════════════════════════════════════════════════════════ */
function showActivateModal(L) {
  gActivateLoan = L;
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin     = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const inst       = L.installment || Math.round(annuity(capFin, L.tna, L.months));
  const expPct = gSettings.expenses || 0, expAmt = Math.round(L.amount * expPct / 100), neto = L.amount - expAmt;
  el("activateSummary").innerHTML = `
    <div class="activate-row"><span class="l">Monto solicitado</span><span class="v">${fmtMoney(L.amount)}</span></div>
    <div class="activate-row"><span class="l">Gasto de otorgamiento (${L.gastoOtorgPct || GASTO_OTORGAMIENTO}%)</span><span class="v" style="color:var(--warn)">+ ${fmtMoney(gastoOtorg)}</span></div>
    <div class="activate-row"><span class="l">Capital a financiar</span><span class="v" style="color:var(--sky)">${fmtMoney(capFin)}</span></div>
    ${expPct > 0 ? `<div class="activate-row"><span class="l">Gastos admin (${expPct}%)</span><span class="v" style="color:#f87171">– ${fmtMoney(expAmt)}</span></div>` : ""}
    <div class="activate-row"><span class="l">Neto a entregar al cliente</span><span class="v" style="color:var(--ok)">${fmtMoney(neto)}</span></div>
    <div class="activate-row"><span class="l">Cuota mensual (francés)</span><span class="v">${fmtMoney(inst)}</span></div>
    <div class="activate-row"><span class="l">Plazo</span><span class="v">${L.months} meses</span></div>
    <div class="activate-row"><span class="l">Intereses proyectados</span><span class="v" style="color:var(--purple)">${fmtMoney((inst * L.months) - capFin)}</span></div>
    <div class="activate-row"><span class="l">TOTAL A RECUPERAR</span><span class="v">${fmtMoney(inst * L.months)}</span></div>`;
  el("activateModal").classList.add("open");
}
el("btnCancelActivate").onclick  = () => { el("activateModal").classList.remove("open"); gActivateLoan = null; };
el("btnConfirmActivate").onclick = async () => {
  const L = gActivateLoan; if (!L) return;
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin     = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const inst       = L.installment || Math.round(annuity(capFin, L.tna, L.months));
  await updateDoc(doc(db, "loans", L.id), {
    status: "active", activeAt: nowTS(), updatedAt: nowTS(),
    installment: inst, capitalFinanciar: capFin,
    gastoOtorgAmt: gastoOtorg, gastoOtorgPct: L.gastoOtorgPct || GASTO_OTORGAMIENTO,
    paidCount: 0
  });
  el("activateModal").classList.remove("open"); gActivateLoan = null;
  toast("Préstamo activado", "ok"); await loadAllAdmin();
};

async function loadAllAdmin() {
  await loadSettings();
  if (checkSuspended()) return;
  await Promise.all([loadPend(), loadPre(), loadAct(), loadMora(), loadComprobantes(), loadInact()]);
  await computeDashboard();
}

/* ══════════════════════════════════════════════════════════════
   MI PRÉSTAMO — PORTAL CLIENTE
   ══════════════════════════════════════════════════════════════ */
el("btnFindMyLoan").onclick = async () => {
  const dni = digits(el("myDni").value);
  if (!dni) { el("myLoanResult").innerHTML = `<div class="empty">Ingresá un DNI válido.</div>`; return; }
  el("myLoanResult").innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
  try {
    const lid = effectiveLid();
    const baseQ = lid
      ? query(collection(db, "loans"), where("lenderId", "==", lid), orderBy("createdAt", "desc"), limit(500))
      : query(collection(db, "loans"), orderBy("createdAt", "desc"), limit(500));
    const qs = await getDocs(baseQ);
    const list = [];
    qs.forEach(d => { if ((d.data().borrower?.dni || "") === dni) list.push({ id: d.id, ...d.data() }); });
    if (!list.length) { el("myLoanResult").innerHTML = `<div class="empty">No encontramos préstamos para ese DNI.</div>`; return; }
    const L      = list[0];
    const paid   = Number(L.paidCount || 0);
    const pct    = L.months ? Math.round((paid / L.months) * 100) : 0;
    const sLabels = { pending: "Pendiente", preapproved: "Preaprobado", active: "Activo", paid: "Saldado", charged_off: "Incobrable" };
    const sClass  = { active: "ok", paid: "ok", charged_off: "bad" };
    const mpEnabled = hasMpToken();
    const manualBox = !mpEnabled && L.status === "active"
      ? `<div style="margin-bottom:16px;padding:14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:12px">
          <div style="font-size:12px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📋 Instrucciones de pago</div>
          <p style="font-size:12px;color:var(--muted);line-height:1.65">Realizá tu transferencia al alias o CBU que te indicó el prestamista.<br>Luego usá el botón <strong style="color:var(--ice)">"Enviar comprobante"</strong> en la cuota correspondiente para adjuntar la captura. El prestamista lo verificará y marcará el pago.</p>
        </div>`
      : "";
    const rows = scheduleRows(L).map(r => {
      const late = daysLate(r.due);
      const badge = r.paid ? `<span class="pill ok">Pagada</span>` : late > 0 ? `<span class="pill bad">Mora ${late}d</span>` : `<span class="pill teal">Pendiente</span>`;
      let payAction = "";
      if (!r.paid && L.status === "active") {
        if (mpEnabled) {
          const mpUrl = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=DEMO_${L.id}_${r.n}`;
          payAction   = `<a href="${mpUrl}" target="_blank" style="padding:6px 12px;background:rgba(0,168,90,.15);border:1px solid rgba(0,168,90,.35);border-radius:8px;color:#00c878;font-size:11px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px">💳 Pagar con MP</a>`;
        } else {
          payAction = `<button class="btn-comp btn-sm" data-upload="${L.id}:${r.n}">📎 Enviar comprobante</button>`;
        }
      }
      const rc = r.paid ? "schedule-row is-paid" : late > 0 ? "schedule-row is-late" : "schedule-row";
      return `<div class="${rc}"><span class="num">${String(r.n).padStart(2, "0")}</span><span class="date">${new Date(r.due).toLocaleDateString("es-AR")}</span><span class="amount">${fmtMoney(r.amount)}</span><span class="action-col">${badge}${payAction}</span></div>`;
    }).join("");
    let actionBtn = "";
    if (L.contractId && L.status === "preapproved" && !L.signed)  actionBtn = `<button id="btnPDF" class="btn-primary" style="width:auto;padding:12px 22px">✍️ Firmar contrato</button>`;
    else if (L.contractId && L.status === "preapproved" && L.signed) actionBtn = `<span class="pill ok" style="padding:9px 14px;font-size:13px">Contrato firmado — Aguardando activación</span>`;
    else if (L.contractId) actionBtn = `<button id="btnPDF" class="btn-outline">Ver contrato PDF</button>`;
    el("myLoanResult").innerHTML = `
      <div class="myloan-status">
        <div><div class="myloan-name">${L.borrower?.name || "--"}</div><div class="myloan-meta">${fmtMoney(L.amount)} · ${L.months} cuotas · TNA ${L.tna}%</div></div>
        <span class="pill ${sClass[L.status] || "warn"}">${sLabels[L.status] || L.status}</span>
      </div>
      <div style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px"><span>Progreso de pago</span><span style="color:var(--sky);font-weight:700">${paid}/${L.months} cuotas · ${pct}%</span></div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      ${actionBtn ? `<div style="margin-bottom:16px">${actionBtn}</div>` : ""}
      ${manualBox}
      <div class="schedule-wrap"><div class="schedule-header"><span>#</span><span>Vencimiento</span><span>Importe</span><span>Estado / Acción</span></div>${rows}</div>`;
    const pdfBtn = el("btnPDF");
    if (pdfBtn) pdfBtn.addEventListener("click", () => {
      if (L.status === "preapproved" && !L.signed) openSignModal(L); else openContractWindow(L);
    });
    el("myLoanResult").querySelectorAll("[data-upload]").forEach(btn => {
      btn.onclick = () => {
        const [loanId, cuota] = btn.getAttribute("data-upload").split(":");
        openComprobanteUpload(loanId, Number(cuota), btn);
      };
    });
  } catch(e) { el("myLoanResult").innerHTML = `<div class="empty">Error al buscar.</div>`; console.error(e); }
};

/* ══════════════════════════════════════════════════════════════
   COMPROBANTE UPLOAD
   ══════════════════════════════════════════════════════════════ */
function openComprobanteUpload(loanId, cuota, triggerBtn) {
  const input  = document.createElement("input");
  input.type   = "file"; input.accept = "image/*,application/pdf";
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    triggerBtn.textContent = "⏳ Subiendo..."; triggerBtn.disabled = true;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const path    = `comprobantes/${loanId}/cuota_${cuota}_${Date.now()}`;
        const storRef = sRef(storage, path);
        await uploadString(storRef, ev.target.result, "data_url");
        const url  = await getDownloadURL(storRef);
        const snap = await getDoc(doc(db, "loans", loanId));
        if (!snap.exists()) return;
        const cur = snap.data();
        const pendientes = [...(cur.comprobantesPendientes || []), {
          cuota, url,
          sentAt:   new Date().toLocaleDateString("es-AR"),
          fileName: file.name
        }];
        await updateDoc(doc(db, "loans", loanId), {
          comprobantesPendientes:  pendientes,
          hasComprobantePendiente: true,
          updatedAt:               nowTS()
        });
        triggerBtn.outerHTML = `<span class="pill warn" style="padding:5px 10px">⏳ En revisión por el prestamista</span>`;
        toast("✅ Comprobante enviado. El prestamista lo verificará pronto.", "ok", 5000);
      } catch(err) {
        triggerBtn.textContent = "📎 Enviar comprobante"; triggerBtn.disabled = false;
        toast("Error al subir el archivo. Intentá de nuevo.", "err");
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ══════════════════════════════════════════════════════════════
   FIRMA TÁCTIL
   ══════════════════════════════════════════════════════════════ */
let gSignLoan = null;
function openSignModal(L) {
  gSignLoan = L;
  const canvas = el("sigCanvas");
  canvas.width = canvas.parentElement.clientWidth || 400; canvas.height = 170;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  let drawing = false, lx = 0, ly = 0;
  const pos = e => { const r = canvas.getBoundingClientRect(); const s = e.touches ? e.touches[0] : e; return { x: s.clientX - r.left, y: s.clientY - r.top }; };
  canvas.onmousedown  = e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.onmousemove  = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.onmouseup    = canvas.onmouseleave = () => drawing = false;
  canvas.ontouchstart = e => { e.preventDefault(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
  canvas.ontouchmove  = e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; };
  canvas.ontouchend   = e => { e.preventDefault(); drawing = false; };
  el("sigModal").classList.add("open");
}
function closeSignModal() { el("sigModal").classList.remove("open"); gSignLoan = null; }
el("btnCancelSig").onclick = closeSignModal;
el("btnClearSig").onclick  = () => { const c = el("sigCanvas"); c.getContext("2d").clearRect(0, 0, c.width, c.height); };
el("btnConfirmSig").onclick = async () => {
  const canvas = el("sigCanvas");
  const data   = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(data).some((v, i) => i % 4 === 3 && v > 0)) { toast("Dibujá tu firma primero.", "err"); return; }
  const sigImg = canvas.toDataURL("image/png");
  const L = gSignLoan; if (!L) return;
  try {
    await updateDoc(doc(db, "loans", L.id), { signed: true, signedAt: nowTS(), updatedAt: nowTS(), signatureImg: sigImg });
    closeSignModal(); toast("Firma registrada. El admin activará tu préstamo en breve.", "ok");
    el("btnFindMyLoan").click();
  } catch(e) { toast("Error al guardar firma.", "err"); console.error(e); }
};

/* ══════════════════════════════════════════════════════════════
   CONTRATO HTML
   ══════════════════════════════════════════════════════════════ */
function contractHtml(L) {
  const today = new Date().toLocaleDateString("es-AR");
  const name  = gSettings.appName || "Prestify";
  const city  = gSettings.city    || "Río Gallegos";
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin     = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const inst       = (L.installment && L.installment > 0) ? L.installment : Math.round(annuity(capFin, L.tna, L.months));
  const expPct = gSettings.expenses || 0, expAmt = Math.round(L.amount * expPct / 100), neto = L.amount - expAmt;
  const rows   = scheduleRows(L).map(r => `<tr><td style="text-align:center">${r.n}</td><td>${new Date(r.due).toLocaleDateString("es-AR")}</td><td style="text-align:right">${fmtMoney(r.amount)}</td><td style="text-align:center">${r.paid ? "Pagada" : "Pendiente"}</td></tr>`).join("");
  const sigImg = L.signatureImg
    ? `<div style="border:1px solid #ccc;border-radius:6px;padding:6px;max-width:260px;margin-top:6px"><img src="${L.signatureImg}" style="width:100%;max-height:70px;object-fit:contain"/><div style="font-size:9pt;color:#666;margin-top:3px">Firma digital – Ley 25.506</div></div>`
    : `<div style="border-bottom:1px solid #666;width:200px;margin-top:28px;margin-bottom:4px"></div><div style="font-size:9pt;color:#888">Pendiente de firma</div>`;
  const logoHtml = gSettings.logoBase64
    ? `<img src="${gSettings.logoBase64}" style="height:40px;margin-bottom:4px;"/>`
    : `<strong style="font-size:16pt">${name}</strong>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${L.contractId || ""}</title>
<style>@page{size:A4;margin:25mm 20mm}body{font-family:'Times New Roman',serif;color:#111;font-size:11pt;line-height:1.6}.header{text-align:center;margin-bottom:12px}h1{font-size:14pt;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}h2{font-size:11pt;text-transform:uppercase;border-bottom:1px solid #bbb;padding-bottom:3px;margin:16px 0 8px}p{margin-bottom:8px}.parties{background:#f5f5f5;border:1px solid #ddd;padding:12px;margin:12px 0;font-size:10.5pt}ol{padding-left:20px}ol li{margin-bottom:9px}table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:8px}th{background:#1a56db;color:#fff;padding:7px 10px;text-align:left}td{border:1px solid #ddd;padding:6px 8px}.sign-block{display:flex;gap:60px;margin-top:30px}</style>
</head><body>
<div class="header">${logoHtml}<h1>Contrato de Préstamo Personal</h1><p style="color:#555">${name} – N.° <strong>${L.contractId || "--"}</strong> – Fecha: <strong>${today}</strong></p></div>
<div class="parties"><strong>PRESTAMISTA:</strong> ${name}, ${city}.<br><strong>PRESTATARIO:</strong> ${L.borrower?.name || "--"}, DNI ${L.borrower?.dni || "--"}, Email: ${L.borrower?.email || "--"}, Tel: ${L.borrower?.phone || "--"}.</div>
<h2>Condiciones financieras</h2><table><tbody>
<tr><td>Monto solicitado</td><td style="text-align:right">${fmtMoney(L.amount)}</td></tr>
<tr style="color:#c60"><td>Gasto de otorgamiento (${L.gastoOtorgPct || GASTO_OTORGAMIENTO}%)</td><td style="text-align:right">+ ${fmtMoney(gastoOtorg)}</td></tr>
<tr><td><strong>Capital a financiar</strong></td><td style="text-align:right"><strong>${fmtMoney(capFin)}</strong></td></tr>
${expPct > 0 ? `<tr style="color:#c00"><td>Gastos administrativos (${expPct}%)</td><td style="text-align:right">– ${fmtMoney(expAmt)}</td></tr><tr><td><strong>Neto a entregar</strong></td><td style="text-align:right"><strong>${fmtMoney(neto)}</strong></td></tr>` : ""}
<tr><td>Cuota mensual (sistema francés)</td><td style="text-align:right">${fmtMoney(inst)}</td></tr>
<tr><td>Plazo</td><td style="text-align:right">${L.months} meses</td></tr>
<tr><td>TNA</td><td style="text-align:right">${L.tna}%</td></tr>
<tr><td>Día de vencimiento</td><td style="text-align:right">Día ${L.dueDay}</td></tr>
</tbody></table>
<h2>Cláusulas</h2><ol>
<li><strong>Objeto.</strong> El PRESTAMISTA otorga la suma de <strong>${fmtMoney(neto)}</strong> (neto de gastos).</li>
<li><strong>Plazo y cuotas.</strong> ${L.months} cuotas mensuales sistema francés, vencimiento día ${L.dueDay}. Cuota fija: <strong>${fmtMoney(inst)}</strong>.</li>
<li><strong>Tasa.</strong> TNA <strong>${L.tna}%</strong>.</li>
<li><strong>Mora automática.</strong> Opera de pleno derecho (art. 509 CCyCN). Intereses punitorios al doble de la tasa pactada.</li>
<li><strong>Título ejecutivo.</strong> Constituye título ejecutivo hábil (arts. 520 y cc. CPCCN).</li>
<li><strong>Incumplimiento.</strong> Dos cuotas impagas habilita acciones judiciales e informe a centrales de riesgo.</li>
<li><strong>Firma digital – Ley 25.506.</strong> El PRESTATARIO declara plena validez jurídica de la firma electrónica.</li>
<li><strong>Datos personales.</strong> Tratamiento conforme Ley 25.326.</li>
<li><strong>Jurisdicción.</strong> Tribunales Ordinarios de ${city}.</li>
</ol>
<h2>Calendario de Pagos</h2>
<table><thead><tr><th>#</th><th>Vencimiento</th><th>Importe</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Firmas</h2>
<div class="sign-block">
  <div><div style="border-bottom:1px solid #555;width:200px;margin-top:30px;margin-bottom:4px"></div><div style="font-size:9.5pt"><strong>PRESTAMISTA – ${name}</strong><br>${city}</div></div>
  <div>${sigImg}<div style="font-size:9.5pt;margin-top:4px"><strong>PRESTATARIO – ${L.borrower?.name}</strong><br>DNI: ${L.borrower?.dni}</div></div>
</div>
<p style="margin-top:22px;font-size:9pt;color:#999;text-align:center">Generado por ${name} – ${today} – Ley 25.506 / Ley 25.326</p>
</body></html>`;
}
function openContractWindow(L) { const w = window.open("about:blank", "_blank"); w.document.open(); w.document.write(contractHtml(L)); w.document.close(); }

/* ══════════════════════════════════════════════════════════════
   CERTIFICADO DE DEUDA
   ══════════════════════════════════════════════════════════════ */
function openDebtCertificate(L) {
  const today  = new Date().toLocaleDateString("es-AR");
  const name   = gSettings.appName || "Prestify";
  const city   = gSettings.city    || "Río Gallegos";
  const gastoOtorg = L.gastoOtorgAmt || Math.round((L.amount || 0) * GASTO_OTORGAMIENTO / 100);
  const capFin     = L.capitalFinanciar || (L.amount || 0) + gastoOtorg;
  const late   = scheduleRows(L).filter(r => !r.paid);
  const capital = late.reduce((a, r) => a + (r.amount || 0), 0);
  const dMax   = late.length > 0 ? daysLate(late[0].due) : 0;
  const tasaP  = ((L.tna || 100) / 100 / 12) * 2;
  const interes = Math.round(capital * tasaP * (dMax / 30));
  const total  = capital + interes;
  const rowsH  = late.map(r => `<tr><td style="text-align:center">${r.n}</td><td>${new Date(r.due).toLocaleDateString("es-AR")}</td><td style="text-align:right">${fmtMoney(r.amount)}</td><td style="text-align:center">${daysLate(r.due)}d</td></tr>`).join("");
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Certificado de Deuda</title>
<style>@page{size:A4;margin:25mm 20mm}body{font-family:'Times New Roman',serif;color:#111;font-size:11pt;line-height:1.6}h1{font-size:14pt;text-align:center;color:#8b0000;text-transform:uppercase}h2{font-size:11pt;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:3px;margin:14px 0 8px}.alert{background:#fff0f0;border:2px solid #c00;padding:12px;margin:14px 0;color:#8b0000;font-weight:700;text-align:center}table{width:100%;border-collapse:collapse;font-size:10pt}th{background:#8b0000;color:#fff;padding:7px 10px}td{border:1px solid #ddd;padding:6px 8px}.total-row td{font-weight:700;font-size:13pt;color:#8b0000;border-top:2px solid #8b0000}</style>
</head><body>
<h1>Certificado de Deuda Exigible</h1><p style="text-align:center;color:#555">${name} – Emitido: <strong>${today}</strong></p>
<div class="alert">DOCUMENTO LEGAL – APTO PARA GESTIÓN JUDICIAL / EXTRAJUDICIAL</div>
<h2>Deudor</h2><table><tbody>
<tr><td><strong>Nombre</strong></td><td>${L.borrower?.name || "--"}</td></tr>
<tr><td><strong>DNI</strong></td><td>${L.borrower?.dni || "--"}</td></tr>
<tr><td><strong>N.° Contrato</strong></td><td>${L.contractId || "--"}</td></tr>
</tbody></table>
<h2>Cuotas Impagas</h2><table><thead><tr><th>#</th><th>Vencimiento</th><th>Capital</th><th>Días mora</th></tr></thead><tbody>${rowsH}</tbody></table>
<h2>Liquidación</h2><table><tbody>
<tr><td>Capital adeudado</td><td style="text-align:right">${fmtMoney(capital)}</td></tr>
<tr><td>Intereses punitorios (${(tasaP * 12 * 100).toFixed(0)}% anual – ${dMax} días)</td><td style="text-align:right">${fmtMoney(interes)}</td></tr>
<tr class="total-row"><td>TOTAL EXIGIBLE al ${today}</td><td style="text-align:right">${fmtMoney(total)}</td></tr>
</tbody></table>
<p style="font-size:10pt;color:#555">Intereses estimativos. Se recalcularán en liquidación judicial.</p>
<h2>Fundamento Legal</h2><p style="font-size:10pt">Contrato N.° <strong>${L.contractId || "--"}</strong> – Título ejecutivo (art. 523 CPCCN) – Mora de pleno derecho (art. 509 CCyCN) – Firma digital válida (Ley 25.506).</p>
<div style="border-bottom:1px solid #555;width:200px;margin-top:40px;margin-bottom:5px"></div>
<p style="font-size:10pt"><strong>${name}</strong> – Acreedor – ${city}</p>
</body></html>`;
  const w = window.open("about:blank", "_blank"); w.document.open(); w.document.write(html); w.document.close();
}

/* ══════════════════════════════════════════════════════════════
   HASH #sign- → firma desde link compartido
   ══════════════════════════════════════════════════════════════ */
(async function trySignFromHash() {
  if (!location.hash.startsWith("#sign-")) return;
  const id = location.hash.replace("#sign-", "").trim();
  try {
    const snap = await getDoc(doc(db, "loans", id));
    if (!snap.exists()) return;
    const L = { ...snap.data(), id };
    if (L.signed) { toast("Este contrato ya fue firmado.", "info"); return; }
    showView("client");
    el("myDni").value = L.borrower?.dni || "";
    el("myloan").scrollIntoView({ behavior: "smooth" });
    await new Promise(r => setTimeout(r, 700));
    el("btnFindMyLoan").click();
    await new Promise(r => setTimeout(r, 1200));
    openSignModal(L);
  } catch(e) { console.error(e); }
})();

/* ══════════════════════════════════════════════════════════════
   INPUT FORMATTERS
   ══════════════════════════════════════════════════════════════ */
const simAmountInput = el("simAmountInput");
if (simAmountInput) simAmountInput.addEventListener("input", e => {
  const n = digits(e.target.value);
  e.target.value = n ? "$ " + Number(n).toLocaleString("es-AR") : "";
  const sa = el("simAmount"); if (sa) sa.value = n;
});

const legacySimAmount = el("simAmount");
if (legacySimAmount && legacySimAmount.type !== "hidden") {
  legacySimAmount.addEventListener("input", e => {
    const n = digits(e.target.value);
    e.target.value = n ? "$ " + Number(n).toLocaleString("es-AR") : "";
  });
}

const slider = el("clientAmountSlider");
if (slider) {
  function updateSlider() {
    const v    = Number(slider.value);
    const disp = el("clientAmountDisplay"); if (disp) disp.textContent = "$ " + v.toLocaleString("es-AR");
    const sa   = el("simAmount"); if (sa) sa.value = v;
    const mi   = el("clientAmountManual"); if (mi) mi.value = "$ " + v.toLocaleString("es-AR");
    autoSimClient();
  }
  slider.addEventListener("input", updateSlider);
  updateSlider();
}

const clientManualInput = el("clientAmountManual");
if (clientManualInput) {
  clientManualInput.addEventListener("input", e => {
    const raw    = digits(e.target.value);
    if (raw) e.target.value = "$ " + Number(raw).toLocaleString("es-AR");
    const numVal = Number(raw) || 0;
    const sa = el("simAmount"); if (sa) sa.value = numVal;
    const sl = el("clientAmountSlider");
    if (sl) { const currentMax = Number(sl.max) || 1000000; if (numVal > currentMax) sl.max = numVal; sl.value = numVal; }
    const disp = el("clientAmountDisplay"); if (disp && numVal) disp.textContent = "$ " + numVal.toLocaleString("es-AR");
    autoSimClient();
  });
  clientManualInput.addEventListener("focus",  e => { const raw = digits(e.target.value); if (raw) e.target.value = raw; });
  clientManualInput.addEventListener("blur",   e => { const raw = digits(e.target.value); if (raw) e.target.value = "$ " + Number(raw).toLocaleString("es-AR"); });
}

["cfgTna", "cfgDue"].forEach(id => {
  const e = el(id);
  if (e) e.addEventListener("input", ev => ev.target.value = digits(ev.target.value));
});

/* ══════════════════════════════════════════════════════════════
   SUPERADMIN
   ══════════════════════════════════════════════════════════════ */
async function loadSuperAdmin() {
  const listEl = el("saLendersList");
  if (!listEl) return;
  listEl.innerHTML = `<div class="sa-loading"><div class="spinner"></div><p style="margin-top:12px;font-size:13px">Cargando prestamistas...</p></div>`;
  try {
    const lendersSnap = await getDocs(collection(db, "lenders"));
    const lenders = [];
    lendersSnap.forEach(d => lenders.push({ id: d.id, ...d.data() }));
    const loansSnap  = await getDocs(collection(db, "loans"));
    const totalLoans = loansSnap.size;
    const total     = lenders.length;
    const activos   = lenders.filter(l => l.status === "activo").length;
    const pendientes = lenders.filter(l => l.status === "pendiente").length;
    const sv = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    sv("saCountLenders", total);
    sv("saCountActive",  activos);
    sv("saCountPending", pendientes);
    sv("saCountLoans",   totalLoans);
    if (!lenders.length) { listEl.innerHTML = `<div class="empty">No hay prestamistas registrados aún.</div>`; return; }
    lenders.sort((a, b) => {
      const order = { pendiente: 0, activo: 1, pausado: 2 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1);
    });
    listEl.innerHTML = lenders.map(l => {
      const status     = l.status || "activo";
      const pillClass  = status === "activo" ? "activo" : status === "pendiente" ? "pendiente" : "pausado";
      const pillLabel  = status === "activo" ? "✓ Activo" : status === "pendiente" ? "⏳ Pendiente" : "⛔ Pausado";
      const canActivate = status !== "activo";
      const canSuspend  = status === "activo";
      return `<div class="sa-row" id="sarow-${l.id}">
        <div>
          <div class="sa-lender-name">${l.appName || "Sin nombre"}</div>
          <div class="sa-lender-email">${l.operator?.name || ""} ${l.operator?.email ? "· " + l.operator.email : ""}</div>
          <div class="sa-lender-id">${l.id}</div>
        </div>
        <div>${l.operator?.email || l.city || "—"}</div>
        <div><span class="sa-status-pill ${pillClass}">${pillLabel}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${canActivate ? `<button class="sa-action-btn sa-btn-activate" onclick="saSetStatus('${l.id}','activo')">✓ Activar</button>` : ""}
          ${canSuspend  ? `<button class="sa-action-btn sa-btn-suspend"  onclick="saSetStatus('${l.id}','pausado')">⛔ Suspender</button>` : ""}
          ${status === "pausado" ? `<button class="sa-action-btn sa-btn-activate" onclick="saSetStatus('${l.id}','activo')">↩ Reactivar</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    listEl.innerHTML = `<div class="empty" style="color:#f87171">Error al cargar: ${e.message}</div>`;
    console.error("SA Load error:", e);
  }
}

window.saSetStatus = async function(lenderId, newStatus) {
  try {
    await setDoc(doc(db, "lenders",  lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    await setDoc(doc(db, "settings", lenderId), { status: newStatus, updatedAt: nowTS() }, { merge: true });
    toast(`Prestamista ${newStatus === "activo" ? "activado" : "suspendido"} correctamente.`, newStatus === "activo" ? "ok" : "err", 4000);
    await loadSuperAdmin();
  } catch(e) { toast("Error al cambiar estado: " + e.message, "err"); }
};

el("btnSaLogout")?.addEventListener("click", () => {
  if (gStatusUnsub) { gStatusUnsub(); gStatusUnsub = null; }
  signOut(auth).then(() => { el("superadminView")?.classList.remove("show"); showLandingPage(); toast("Sesión cerrada", "info"); }).catch(() => {});
});
