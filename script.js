/* ================================
   PRESTIFY · script.js
   Versión robusta sin alterar lógica
================================ */

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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================= FIREBASE INIT ================= */

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_BUCKET",
  messagingSenderId: "TU_SENDER",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================= DOM CACHE ================= */

const body = document.body;
const pendingOverlay = document.getElementById("pendingOverlay");
const suspendedOverlay = document.getElementById("suspendedOverlay");
const logoMark = document.getElementById("logoMark");
const logoName = document.getElementById("logoName");

/* ================= STATE ================= */

let unsubscribeStatus = null;
let currentUserId = null;

/* ================= UTILITIES ================= */

function safeShow(el) {
  if (!el) return;
  el.classList.add("show");
}

function safeHide(el) {
  if (!el) return;
  el.classList.remove("show");
}

function removePreload() {
  body.classList.remove("preload");
}

/* ================= STATUS HANDLER ================= */

function handleStatus(status) {

  const valid = ["pending", "active", "suspended"];

  if (!valid.includes(status)) {
    console.warn("Estado inválido:", status);
    return;
  }

  if (status === "pending") {
    safeShow(pendingOverlay);
    safeHide(suspendedOverlay);
  }

  if (status === "active") {
    safeHide(pendingOverlay);
    safeHide(suspendedOverlay);
  }

  if (status === "suspended") {
    safeHide(pendingOverlay);
    safeShow(suspendedOverlay);
  }
}

/* ================= BRANDING ================= */

async function loadBranding(uid) {

  try {
    const snap = await getDoc(doc(db, "lenders", uid));
    if (!snap.exists()) return;

    const data = snap.data() || {};

    if (data.brandColor) {
      document.documentElement.style.setProperty(
        "--brand-color",
        data.brandColor
      );
    }

    if (data.logoUrl) {
      logoMark.innerHTML = `<img src="${data.logoUrl}" />`;
    }

    if (data.businessName) {
      logoName.textContent = data.businessName;
    }

  } catch (e) {
    console.error("Error branding:", e);
  }
}

/* ================= AUTH LISTENER ================= */

onAuthStateChanged(auth, async (user) => {

  if (unsubscribeStatus) {
    unsubscribeStatus();
    unsubscribeStatus = null;
  }

  if (!user) {
    removePreload();
    return;
  }

  currentUserId = user.uid;

  await loadBranding(user.uid);

  unsubscribeStatus = onSnapshot(
    doc(db, "lenders", user.uid),
    (snap) => {

      if (!snap.exists()) {
        handleStatus("pending");
        removePreload();
        return;
      }

      const data = snap.data() || {};
      const status = data.status || "pending";

      handleStatus(status);
      removePreload();
    },
    (error) => {
      console.error("Snapshot error:", error);
      removePreload();
    }
  );
});

/* ================= UI NAVIGATION ================= */

function showClientView() {
  document.getElementById("clientView")?.classList.remove("hidden");
  document.getElementById("adminView")?.classList.remove("visible");
}

function showAdminView() {
  document.getElementById("adminView")?.classList.add("visible");
}

function goHome() {
  showClientView();
}

/* ================= AUTH ================= */

async function logout() {
  try {
    await signOut(auth);
    location.reload();
  } catch (e) {
    console.error(e);
  }
}

/* ================= ONBOARDING ================= */

let currentStep = 1;

function nextStep() {

  if (currentStep === 2) {
    const consent = document.getElementById("obConsent");
    if (!consent.checked) return;
  }

  if (currentStep < 3) {
    document.getElementById("step" + currentStep).classList.remove("active");
    document.getElementById("stepDot" + currentStep).classList.remove("active");
    document.getElementById("stepDot" + currentStep).classList.add("done");

    currentStep++;
    document.getElementById("step" + currentStep).classList.add("active");
    document.getElementById("stepDot" + currentStep).classList.add("active");
  }
}

function prevStep() {

  if (currentStep > 1) {
    document.getElementById("step" + currentStep).classList.remove("active");
    document.getElementById("stepDot" + currentStep).classList.remove("active");

    currentStep--;
    document.getElementById("step" + currentStep).classList.add("active");
    document.getElementById("stepDot" + currentStep).classList.add("active");
  }
}

function finishOnboarding() {
  document.getElementById("onboardingOverlay")?.classList.remove("show");
}

/* ================= SIMULATION (NO CHANGE LOGIC) ================= */

function simulateLoan() {

  const amount = Number(document.getElementById("amountInput").value);
  const term = Number(document.getElementById("termInput").value);

  if (!amount || !term) return;

  const GASTO_OTORGAMIENTO = 0.03;
  const tasa = 0.08;

  const capitalFinanciado = amount + (amount * GASTO_OTORGAMIENTO);

  const cuota =
    (capitalFinanciado * tasa) /
    (1 - Math.pow(1 + tasa, -term));

  document.getElementById("simCuota").textContent =
    "$" + cuota.toFixed(2);

  document.getElementById("simResult").style.display = "block";
}

/* ================= GLOBAL EXPOSURE (OBLIGATORIO) ================= */

window.showClientView = showClientView;
window.showAdminView = showAdminView;
window.goHome = goHome;
window.logout = logout;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.finishOnboarding = finishOnboarding;
window.simulateLoan = simulateLoan;