// ─────────────────────────────────────────────
// PRESTIFY — SCRIPT PRINCIPAL
// ─────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

// 🔥 TU CONFIG REAL
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

const GASTO_OTORGAMIENTO = 3;

let currentUser = null;
let lenderData = null;
let lenderUnsubscribe = null;
let loansUnsubscribe = null;

function show(id){ const el=document.getElementById(id); if(el) el.style.display="block";}
function hide(id){ const el=document.getElementById(id); if(el) el.style.display="none";}

function fmtPeso(n){
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

// ─────────────────────────
// AUTH
// ─────────────────────────

onAuthStateChanged(auth, (user)=>{
  currentUser = user;

  if(!user){
    hide("adminView");
    hide("superadminView");
    return;
  }

  const lenderRef = doc(db,"lenders",user.uid);

  if(lenderUnsubscribe) lenderUnsubscribe();

  lenderUnsubscribe = onSnapshot(lenderRef,(snap)=>{
    if(!snap.exists()) return;

    lenderData = snap.data();

    aplicarMarcaBlanca(lenderData);
    controlarStatus(lenderData.status);
  });

  cargarPrestamos();
});

function controlarStatus(status){
  if(status==="pending"){
    show("pendingOverlay");
    hide("suspendedOverlay");
    return;
  }
  if(status==="suspended"){
    show("suspendedOverlay");
    hide("pendingOverlay");
    return;
  }
  hide("pendingOverlay");
  hide("suspendedOverlay");
}

function aplicarMarcaBlanca(data){
  if(!data) return;

  const name=data.appName||"Prestify";
  const logoName=document.getElementById("logoName");
  if(logoName) logoName.innerText=name;

  const title=document.getElementById("pageTitle");
  if(title) title.innerText=name+" · Tu financiera digital";
}
// ─────────────────────────
// SISTEMA FRANCÉS
// ─────────────────────────

function calcularSistemaFrances(monto,meses,tasaMensual){
  const gasto=monto*(GASTO_OTORGAMIENTO/100);
  const capital=monto+gasto;

  const cuota=
    capital*
    (tasaMensual*Math.pow(1+tasaMensual,meses))/
    (Math.pow(1+tasaMensual,meses)-1);

  return {gasto,capital,cuota};
}

// ─────────────────────────
// EVENTO MONI
// ─────────────────────────

document.addEventListener("moniSolicitud",async(e)=>{
  if(!currentUser) return;

  const data=e.detail;

  const tasaMensual=(lenderData?.tna||120)/100/12;

  const calc=calcularSistemaFrances(
    data.monto,
    data.meses,
    tasaMensual
  );

  await addDoc(collection(db,"loans"),{
    lenderId:currentUser.uid,
    clienteNombre:data.nombre,
    clienteDni:data.dni,
    clienteTelefono:data.telefono,
    amount:data.monto,
    months:data.meses,
    gastoOtorgAmt:Math.round(calc.gasto),
    capitalFinanciado:Math.round(calc.capital),
    cuota:Math.round(calc.cuota),
    status:"pending",
    createdAt:new Date()
  });
});

// ─────────────────────────
// CARGAR PRÉSTAMOS ADMIN
// ─────────────────────────

function cargarPrestamos(){
  if(!currentUser) return;

  const q=query(
    collection(db,"loans"),
    where("lenderId","==",currentUser.uid)
  );

  if(loansUnsubscribe) loansUnsubscribe();

  loansUnsubscribe=onSnapshot(q,(snapshot)=>{
    const list=document.getElementById("loansList");
    if(!list) return;

    list.innerHTML="";

    snapshot.forEach((docSnap)=>{
      const L=docSnap.data();

      const div=document.createElement("div");
      div.className="loan-item";
      div.innerHTML=`
        <strong>${L.clienteNombre}</strong>
        <div>Monto: ${fmtPeso(L.amount)}</div>
        <div>Cuota: ${fmtPeso(L.cuota)}</div>
        <div>Estado: ${L.status}</div>
      `;
      list.appendChild(div);
    });
  });
}
// ─────────────────────────
// SUPERADMIN
// ─────────────────────────

async function loadSuperAdmin(){
  const container=document.getElementById("superadminList");
  if(!container) return;

  container.innerHTML="Cargando...";

  const q=query(collection(db,"lenders"),where("status","==","pending"));
  const snapshot=await getDocs(q);

  container.innerHTML="";

  snapshot.forEach((docSnap)=>{
    const data=docSnap.data();

    const row=document.createElement("div");
    row.innerHTML=`
      <strong>${data.appName||"Sin nombre"}</strong>
      <button onclick="approveLender('${docSnap.id}')">APROBAR</button>
    `;
    container.appendChild(row);
  });
}

async function approveLender(uid){
  await updateDoc(doc(db,"lenders",uid),{status:"active"});
  loadSuperAdmin();
}

// ─────────────────────────
// LOGOUT
// ─────────────────────────

async function logout(){
  if(lenderUnsubscribe) lenderUnsubscribe();
  if(loansUnsubscribe) loansUnsubscribe();
  await signOut(auth);
  location.reload();
}

// ─────────────────────────
// EXPOSICIÓN GLOBAL (OBLIGATORIO)
// ─────────────────────────

window.loadSuperAdmin=loadSuperAdmin;
window.approveLender=approveLender;
window.logout=logout;
