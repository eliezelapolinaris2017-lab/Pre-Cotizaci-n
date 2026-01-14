/* ========= FIREBASE CONFIG ========= */
const firebaseConfig = {
  apiKey: "AIzaSyBm67RjL0QzMRLfo6zUYCI0bak1eGJAR-U",
  authDomain: "oasis-facturacion.firebaseapp.com",
  projectId: "oasis-facturacion",
  storageBucket: "oasis-facturacion.firebasestorage.app",
  messagingSenderId: "84422038905",
  appId: "1:84422038905:web:b0eef65217d2bfc3298ba8"
};

const WHATSAPP_E164 = "17876643079"; // cambia si quieres
const SOURCE = "github-pages";

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ========= PRECIOS OASIS (exactos) ========= */
const PRICING = {
  diagMetro: 75,

  installLaborByBTU: {
    12000: 300,
    18000: 300,
    24000: 400,
    36000: 500
  },

  maintPerUnit: {
    preventivo: 55,
    profundo: 75
  },

  // Más de 5 unidades => $50 por unidad (según tu regla)
  maintOver5PerUnit: 50
};

/* ========= HELPERS ========= */
const $ = (id) => document.getElementById(id);

let state = {
  serviceType: null,
  client: { clientName: "", phone: "", town: "", pref: "whatsapp" },
  answers: {},
  estimate: { min: 0, max: 0 },
  breakdown: ""
};

function show(id){ $(id).hidden = false; }
function hide(id){ $(id).hidden = true; }

function money(n){
  const val = Number(n || 0);
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Math.round(val));
}

function scrollTop(){
  window.scrollTo({top:0,behavior:"smooth"});
}

function resetAll(){
  state = {
    serviceType: null,
    client: { clientName: "", phone: "", town: "", pref: "whatsapp" },
    answers: {},
    estimate: { min: 0, max: 0 },
    breakdown: ""
  };
  hide("stepClient");
  hide("qInstall"); hide("qMaint"); hide("qRepair");
  hide("result");
}

function validateClient(){
  const clientName = $("clientName").value.trim();
  const phone = $("phone").value.trim();
  const town = $("town").value.trim();
  const pref = $("prefContact").value;

  if (!clientName || clientName.length < 2) return { ok:false, msg:"Pon tu nombre." };
  if (!phone || phone.length < 7) return { ok:false, msg:"Pon un teléfono válido." };
  if (!town || town.length < 2) return { ok:false, msg:"Pon tu pueblo/zona." };

  state.client = { clientName, phone, town, pref };
  return { ok:true };
}

/* ========= FIRESTORE SAVE ========= */
async function savePrequote(){
  const payload = {
    serviceType: state.serviceType,
    clientName: state.client.clientName,
    phone: state.client.phone,
    town: state.client.town,
    answers: state.answers,
    estimateMin: state.estimate.min,
    estimateMax: state.estimate.max,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    source: SOURCE
  };

  const ref = await db.collection("prequotes").add(payload);
  return ref.id;
}

/* ========= WHATSAPP ========= */
function buildWhatsAppText(docId){
  const s = state.serviceType;
  const title =
    s === "instalacion" ? "Instalación" :
    s === "mantenimiento" ? "Mantenimiento" :
    "Reparación (Diagnóstico)";

  const lines = [];
  lines.push(`Hola, hice una pre-cotización en Oasis.`);
  lines.push(`Servicio: ${title}`);
  lines.push(`Nombre: ${state.client.clientName}`);
  lines.push(`Tel: ${state.client.phone}`);
  lines.push(`Zona: ${state.client.town}`);
  lines.push(`Total: ${money(state.estimate.min)} – ${money(state.estimate.max)}`);
  lines.push(`Ref: ${docId}`);
  lines.push(`Detalles: ${JSON.stringify(state.answers)}`);
  return lines.join("\n");
}

function setWhatsAppLink(docId){
  const text = encodeURIComponent(buildWhatsAppText(docId));
  $("waBtn").href = `https://wa.me/${WHATSAPP_E164}?text=${text}`;
}

/* ========= FLOW ========= */
function goClient(){
  show("stepClient");
  hide("qInstall"); hide("qMaint"); hide("qRepair");
  hide("result");
  scrollTop();
}

function goQuestions(){
  hide("result");
  if (state.serviceType === "instalacion") { show("qInstall"); hide("qMaint"); hide("qRepair"); }
  if (state.serviceType === "mantenimiento") { show("qMaint"); hide("qInstall"); hide("qRepair"); }
  if (state.serviceType === "reparacion") { show("qRepair"); hide("qInstall"); hide("qMaint"); }
  scrollTop();
}

async function finalize(){
  $("range").textContent = `${money(state.estimate.min)} – ${money(state.estimate.max)}`;
  $("breakdown").textContent = state.breakdown;

  hide("qInstall"); hide("qMaint"); hide("qRepair");
  show("result");
  scrollTop();

  try{
    const docId = await savePrequote();
    setWhatsAppLink(docId);
  }catch(err){
    console.error(err);
    alert("No pude guardar la solicitud ahora mismo. Igual puedes enviarla por WhatsApp.");
    setWhatsAppLink("SIN-REF");
  }
}

/* ========= CALCULOS (con tus reglas) ========= */

// Reparación / Diagnóstico
async function calcRepair(){
  const isMetro = $("isMetro").value;
  const symptom = $("symptom").value;
  const brand = $("brand").value.trim();
  const model = $("model").value.trim();

  const min = PRICING.diagMetro;
  const max = PRICING.diagMetro;

  let note = `Diagnóstico por visita (Área Metropolitana): ${money(PRICING.diagMetro)}.`;
  if (isMetro === "no") note = `Diagnóstico: ${money(PRICING.diagMetro)} aplica Área Metropolitana. Fuera del área: sujeto a coordinación y ruta.`;
  if (isMetro === "nose") note = `Diagnóstico: ${money(PRICING.diagMetro)} aplica Área Metropolitana. Confirmamos al contactarte.`;

  state.answers = { isMetro, symptom, brand, model, diagPrice: PRICING.diagMetro };
  state.estimate = { min, max };
  state.breakdown = `${note} Reparación y piezas se cotizan luego del diagnóstico.`;

  await finalize();
}

// Instalación
async function calcInstall(){
  const btu = Number($("installBtu").value);
  const unitSource = $("unitSource").value;
  const unitCostRaw = Number($("unitCost").value || 0);
  const notes = $("installNotes").value.trim();

  const labor = PRICING.installLaborByBTU[btu];
  if (labor == null) { alert("Selecciona el tamaño (BTU)."); return; }

  // Si la unidad la trae el cliente -> costo unidad = 0
  const unitCost = (unitSource === "cliente") ? 0 : unitCostRaw;
  if (unitCost < 0) { alert("Costo de unidad inválido."); return; }

  const total = labor + unitCost;

  state.answers = { btu, labor, unitSource, unitCost, total, notes };
  state.estimate = { min: total, max: total };

  const btuLabel = `${btu/1000}k`;
  const unitText = (unitSource === "cliente")
    ? "Unidad: el cliente la provee."
    : `Unidad (estimada): ${money(unitCost)}.`;

  state.breakdown =
    `Instalación ${btuLabel}: Mano de obra ${money(labor)}. ${unitText} Total: ${money(total)}.` +
    (notes ? ` Notas: ${notes}.` : "") +
    ` (Materiales especiales o condiciones no estándar se confirman por fotos/visita.)`;

  await finalize();
}

// Mantenimiento
async function calcMaint(){
  const maintType = $("maintType").value; // preventivo | profundo
  const units = Number($("units").value || 1);
  const notes = $("notesMaint").value.trim();

  if (units < 1) { alert("Cantidad de unidades inválida."); return; }

  // Regla exacta: >5 => $50 por unidad
  const perUnit = (units > 5)
    ? PRICING.maintOver5PerUnit
    : PRICING.maintPerUnit[maintType];

  const total = units * perUnit;

  state.answers = { maintType, units, perUnit, policy: (units > 5 ? "over5" : "standard"), notes };
  state.estimate = { min: total, max: total };

  const policyText = (units > 5)
    ? `Tarifa por volumen: ${money(PRICING.maintOver5PerUnit)} por unidad (más de 5 unidades).`
    : `Tarifa ${maintType}: ${money(perUnit)} por unidad (hasta 5 unidades).`;

  state.breakdown = `${policyText} Total: ${money(total)}.` + (notes ? ` Notas: ${notes}.` : "");
  await finalize();
}

/* ========= UI INTERACTIONS ========= */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-service]");
  if (btn){
    state.serviceType = btn.dataset.service;
    goClient();
  }
});

$("backToService").addEventListener("click", () => resetAll());

$("goQuestions").addEventListener("click", () => {
  const v = validateClient();
  if (!v.ok) { alert(v.msg); return; }
  goQuestions();
});

$("backToClient1").addEventListener("click", () => { show("stepClient"); hide("qInstall"); scrollTop(); });
$("backToClient2").addEventListener("click", () => { show("stepClient"); hide("qMaint"); scrollTop(); });
$("backToClient3").addEventListener("click", () => { show("stepClient"); hide("qRepair"); scrollTop(); });

$("calcInstall").addEventListener("click", calcInstall);
$("calcMaint").addEventListener("click", calcMaint);
$("calcRepair").addEventListener("click", calcRepair);

$("startOver").addEventListener("click", () => {
  ["clientName","phone","town","unitCost","units","brand","model","notesMaint","installNotes"].forEach(id => {
    if ($(id)) $(id).value = "";
  });
  resetAll();
});

/* Toggle visual: unitCost input */
function syncUnitCostVisibility(){
  const unitSource = $("unitSource")?.value;
  const wrap = $("unitCostWrap");
  if (!wrap) return;
  if (unitSource === "cliente"){
    wrap.style.display = "none";
    $("unitCost").value = "";
  } else {
    wrap.style.display = "";
  }
}

$("unitSource")?.addEventListener("change", syncUnitCostVisibility);
syncUnitCostVisibility();

/* Footer year */
$("year").textContent = String(new Date().getFullYear());

resetAll();
