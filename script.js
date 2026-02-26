// ─────────────────────────────────────────────
// PRESTIFY — SCRIPT PRINCIPAL BLINDADO
// Versión robusta sincronizada con index.html
// ─────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔒 CONFIG FIREBASE (tu config real debe estar aquí)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_BUCKET",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────
// CONSTANTES DE NEGOCIO
// ─────────────────────────────────────────────

const GASTO_OTORGAMIENTO = 3; // 3% fijo global

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────

let currentUser = null;
let lenderUnsubscribe = null;
let loansUnsubscribe = null;
let lenderData = null;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function fmtPeso(n) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}
// ─────────────────────────────────────────────
// DETECCIÓN ?ref= (PORTAL MONI)
// ─────────────────────────────────────────────

async function checkRefAccess() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (!ref) return;

  const lenderRef = doc(db, "lenders", ref);
  const snap = await getDoc(lenderRef);

  if (!snap.exists()) return;

  const cfg = snap.data();
  if (typeof initMoniView === "function") {
    initMoniView(cfg);
  }
}

checkRefAccess();

// ─────────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    hide("pendingOverlay");
    hide("suspendedOverlay");
    hide("adminView");
    hide("clientView");
    hide("superadminView");
    return;
  }

  const lenderRef = doc(db, "lenders", user.uid);

  if (lenderUnsubscribe) lenderUnsubscribe();

  lenderUnsubscribe = onSnapshot(lenderRef, (snap) => {
    if (!snap.exists()) return;

    lenderData = snap.data();

    applyBranding(lenderData);
    watchStatus(lenderData.status);
  });

  initAdminData();
});

// ─────────────────────────────────────────────
// STATUS EN TIEMPO REAL
// ─────────────────────────────────────────────

function watchStatus(status) {
  if (status === "pending") {
    show("pendingOverlay");
    hide("suspendedOverlay");
    return;
  }

  if (status === "suspended") {
    show("suspendedOverlay");
    hide("pendingOverlay");
    return;
  }

  hide("pendingOverlay");
  hide("suspendedOverlay");
}

// ─────────────────────────────────────────────
// MARCA BLANCA DINÁMICA
// ─────────────────────────────────────────────

function applyBranding(data) {
  if (!data) return;

  const name = data.appName || "Prestify";

  const logoName = document.getElementById("logoName");
  if (logoName) {
    const parts = name.split(" ");
    if (parts.length > 1) {
      logoName.innerHTML = parts[0] + " <span>" + parts.slice(1).join(" ") + "</span>";
    } else {
      logoName.innerHTML = "<span>" + name + "</span>";
    }
  }

  const logoMark = document.getElementById("logoMark");
  if (logoMark) {
    logoMark.textContent = name.charAt(0).toUpperCase();
  }

  const title = document.getElementById("pageTitle");
  if (title) {
    title.textContent = name + " · Tu financiera digital";
  }

  if (data.primaryColor) {
    document.documentElement.style.setProperty("--brand", data.primaryColor);
  }
}
// ─────────────────────────────────────────────
// SISTEMA FRANCÉS (CORREGIDO)
// Suma gasto antes de calcular cuota
// ─────────────────────────────────────────────

function calcularSistemaFrances(monto, meses, tasaMensual) {
  const gasto = monto * (GASTO_OTORGAMIENTO / 100);
  const capitalFinanciado = monto + gasto;

  const cuota =
    capitalFinanciado *
    (tasaMensual * Math.pow(1 + tasaMensual, meses)) /
    (Math.pow(1 + tasaMensual, meses) - 1);

  return {
    gasto,
    capitalFinanciado,
    cuota
  };
}

// ─────────────────────────────────────────────
// CREAR PRÉSTAMO DESDE MONI
// ─────────────────────────────────────────────

document.addEventListener("moniSolicitud", async (e) => {
  if (!currentUser) return;

  const data = e.detail;

  const tasaMensual = (lenderData?.tna || 120) / 100 / 12;

  const calc = calcularSistemaFrances(
    data.monto,
    data.meses,
    tasaMensual
  );

  await addDoc(collection(db, "loans"), {
    lenderId: currentUser.uid,
    clienteNombre: data.nombre,
    clienteDni: data.dni,
    clienteTelefono: data.telefono,
    amount: data.monto,
    months: data.meses,
    gastoOtorgAmt: Math.round(calc.gasto),
    capitalFinanciado: Math.round(calc.capitalFinanciado),
    cuota: Math.round(calc.cuota),
    status: "pending",
    createdAt: new Date()
  });
});

// ─────────────────────────────────────────────
// ADMIN — CARGA DE PRÉSTAMOS
// ─────────────────────────────────────────────

function initAdminData() {
  if (!currentUser) return;

  const loansRef = collection(db, "loans");
  const q = query(loansRef, where("lenderId", "==", currentUser.uid));

  if (loansUnsubscribe) loansUnsubscribe();

  loansUnsubscribe = onSnapshot(q, (snapshot) => {
    const list = document.getElementById("loansList");
    if (!list) return;

    list.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const L = docSnap.data();

      const div = document.createElement("div");
      div.className = "loan-item";

      div.innerHTML = `
        <strong>${L.clienteNombre}</strong>
        <div>Monto: ${fmtPeso(L.amount)}</div>
        <div>Cuota: ${fmtPeso(L.cuota)}</div>
        <div>Estado: ${L.status}</div>
      `;

      list.appendChild(div);
    });
  });
}
// ─────────────────────────────────────────────
// SUPERADMIN
// ─────────────────────────────────────────────

async function loadSuperAdmin() {
  const view = document.getElementById("superadminView");
  if (view) view.style.display = "block";

  const container = document.getElementById("superadminList");
  if (!container) return;

  container.innerHTML = "Cargando...";

  const q = query(collection(db, "lenders"), where("status", "==", "pending"));
  const snapshot = await getDocs(q);

  container.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const row = document.createElement("div");
    row.className = "superadmin-item";

    row.innerHTML = `
      <strong>${data.appName || "Sin nombre"}</strong>
      <div>UID: ${docSnap.id}</div>
      <button onclick="approveLender('${docSnap.id}')">APROBAR</button>
    `;

    container.appendChild(row);
  });
}

async function approveLender(uid) {
  const lenderRef = doc(db, "lenders", uid);
  await updateDoc(lenderRef, { status: "active" });

  // recargar lista
  loadSuperAdmin();
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

async function logout() {
  try {
    if (lenderUnsubscribe) lenderUnsubscribe();
    if (loansUnsubscribe) loansUnsubscribe();

    await signOut(auth);

    currentUser = null;
    lenderData = null;

    location.reload();
  } catch (err) {
    console.error("Error logout:", err);
  }
}

// ─────────────────────────────────────────────
// EXPOSICIÓN GLOBAL OBLIGATORIA (ES6 FIX)
// ─────────────────────────────────────────────

window.loadSuperAdmin = loadSuperAdmin;
window.approveLender = approveLender;
window.logout = logout;

// si existen en tu HTML:
if (typeof selectPayMethod === "function")
  window.selectPayMethod = selectPayMethod;

if (typeof moniSimular === "function")
  window.moniSimular = moniSimular;

if (typeof moniShowForm === "function")
  window.moniShowForm = moniShowForm;

if (typeof moniEnviarSolicitud === "function")
  window.moniEnviarSolicitud = moniEnviarSolicitud;