import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let unsubscribeStatus = null;

function handleStatus(status) {
  const pending = document.getElementById("pendingOverlay");
  const suspended = document.getElementById("suspendedOverlay");

  pending.classList.remove("show");
  suspended.classList.remove("show");

  if (status === "pending") pending.classList.add("show");
  if (status === "suspended") suspended.classList.add("show");
}

async function loadBranding(uid) {
  const snap = await getDoc(doc(db,"lenders",uid));
  if (!snap.exists()) return;

  const data = snap.data();

  if (data.brandColor)
    document.documentElement.style.setProperty("--brand-color",data.brandColor);

  if (data.logoUrl)
    document.getElementById("logoMark").innerHTML = `<img src="${data.logoUrl}">`;

  if (data.businessName)
    document.getElementById("logoName").textContent = data.businessName;
}

onAuthStateChanged(auth, async(user)=>{
  if(unsubscribeStatus){
    unsubscribeStatus();
    unsubscribeStatus=null;
  }

  if(!user){
    document.body.classList.remove("preload");
    return;
  }

  await loadBranding(user.uid);

  unsubscribeStatus = onSnapshot(doc(db,"lenders",user.uid),(snap)=>{
    const data = snap.exists()? snap.data():{};
    handleStatus(data.status || "pending");
    document.body.classList.remove("preload");
  });
});

function simulateLoan(){
  const amount = Number(document.getElementById("amountInput").value);
  const term = Number(document.getElementById("termInput").value);
  if(!amount||!term) return;

  const GASTO_OTORGAMIENTO = 0.03;
  const tasa = 0.08;

  const capital = amount + amount*GASTO_OTORGAMIENTO;
  const cuota = (capital*tasa)/(1-Math.pow(1+tasa,-term));

  document.getElementById("simCuota").textContent="$"+cuota.toFixed(2);
  document.getElementById("simResult").style.display="block";
}

function logout(){
  signOut(auth).then(()=>location.reload());
}

function showClientView(){}
function showAdminView(){}
function goHome(){}

window.simulateLoan = simulateLoan;
window.logout = logout;
window.showClientView = showClientView;
window.showAdminView = showAdminView;
window.goHome = goHome;