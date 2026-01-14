/* ========= CONFIG ========= */
const firebaseConfig = {
  apiKey: "AIzaSyBm67RjL0QzMRLfo6zUYCI0bak1eGJAR-U",
  authDomain: "oasis-facturacion.firebaseapp.com",
  projectId: "oasis-facturacion",
  storageBucket: "oasis-facturacion.firebasestorage.app",
  messagingSenderId: "84422038905",
  appId: "1:84422038905:web:b0eef65217d2bfc3298ba8"
};

const WHATSAPP_E164 = "17876643079"; // PR = +1. Cambia si quieres.
const SOURCE = "github-pages";

/* ========= INIT FIREBASE ========= */
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ========= PRICING (EDITA AQUÍ) =========
   Mantén esto simple. Luego lo movemos a Firestore si quieres editar desde tu Hub.
*/
const PRICING = {
  install: {
    // base por tier de BTU estimados
    tiers: [
      { maxBtu: 12000, baseMin: 650, baseMax: 900 },
      { maxBtu: 18000, baseMin: 850, baseMax: 1150 },
      { maxBtu: 24000, baseMin: 1050, baseMax: 1450 },
      { maxBtu: 36000, baseMin: 1450, baseMax: 2100 },
      { maxBtu: 60000, baseMin: 2100, baseMax: 3500 }
    ],
    add: {
      nearPower_no: { min: 120, max: 350 },
      nearPower_nose: { min: 60, max: 200 },
      lineSet_11_25: { min: 80, max: 180 },
      lineSet_26_50: { min: 180, max: 420 },
      access_2do: { min: 60, max: 180 },
      access_dificil: { min: 150, max: 450 },
      wall_hormigon: { min: 40, max: 140 }
    }
  },

  maint: {
    basePerUnit: { minisplit: { min: 55, max: 85 }, window: { min: 50, max: 75 }, central: { min: 120, max: 220 } },
    accessMult: { facil: 1.0, altura: 1.15, dificil: 1.30 },
    volumeDiscount: [
      { minUnits: 1, disc: 0.00 },
      { minUnits: 2, disc: 0.05 },
      { minUnits: 4, disc: 0.10 },
      { minUnits: 6, disc: 0.15 }
    ]
  },

  repair: {
    diag: { min: 65, max: 120 },
    bumps: {
      nofria: { min: 0, max: 120 },
      gotea: { min: 0, max: 90 },
      error: { min: 0, max: 150 },
      noseprende: { min: 0, max: 180 },
      ruido: { min: 0, max: 120 },
      otro: { min: 0, max: 120 }
    },
    lastMaint: {
      lt6: { min: 0, max: 20 },
      "6_12": { min: 0, max: 40 },
      gt12: { min: 10, max: 80 },
      nunca: { min: 20, max: 120 }
    }
  }
};

/* ========= UI HELPERS ========= */
const $ = (id) => document.getElementById(id);

let state = {
  serviceType: null,
  client: { clientName: "", phone: "", town: "" },
  answers: {},
  estimate: { min: 0, max: 0 },
  breakdown: ""
};

function show(id){ $(id).hidden = false; }
function hide(id){ $(id).hidden = true; }

function money(n){
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Math.round(n));
}

function pickInstallTier(btu){
  for (const t of PRICING.install.tiers){
    if (btu <= t.maxBtu) return t;
  }
  return PRICING.install.tiers[PRICING.install.tiers.length-1];
}

function suggestBTUFromSqft(sqft){
  // Regla simple y práctica: 20–25 BTU por ft² (PR calor/humedad -> tendemos a 25)
  const raw = sqft * 25;
  // redondeo a tiers comunes
  const tiers = [9000,12000,18000,24000,36000,48000,60000];
  return tiers.reduce((prev,cur)=> Math.abs(cur-raw)<Math.abs(prev-raw)?cur:prev, tiers[0]);
}

function bestDiscount(units){
  let disc = 0;
  for (const d of PRICING.maint.volumeDiscount){
    if (units >= d.minUnits) disc = d.disc;
  }
  return disc;
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
  const title = s === "instalacion" ? "Instalación" : s === "mantenimiento" ? "Mantenimiento" : "Reparación";

  const lines = [];
  lines.push(`Hola, hice una pre-cotización en Oasis.`);
  lines.push(`Servicio: ${title}`);
  lines.push(`Nombre: ${state.client.clientName}`);
  lines.push(`Tel: ${state.client.phone}`);
  lines.push(`Zona: ${state.client.town}`);
  lines.push(`Estimado: ${money(state.estimate.min)} – ${money(state.estimate.max)}`);
  lines.push(`Ref: ${docId}`);
  lines.push(`Detalles: ${JSON.stringify(state.answers)}`);

  return lines.join("\n");
}

function setWhatsAppLink(docId){
  const text = encodeURIComponent(buildWhatsAppText(docId));
  $("waBtn").href = `https://wa.me/${WHATSAPP_E164}?text=${text}`;
}

/* ========= FLOW ========= */
function resetAll(){
  state = {
    serviceType: null,
    client: { clientName: "", phone: "", town: "" },
    answers: {},
    estimate: { min: 0, max: 0 },
    breakdown: ""
  };

  hide("stepClient");
  hide("qInstall"); hide("qMaint"); hide("qRepair");
  hide("result");
}

function goClient(){
  show("stepClient");
  hide("qInstall"); hide("qMaint"); hide("qRepair");
  hide("result");
  window.scrollTo({top:0,behavior:"smooth"});
}

function goQuestions(){
  hide("result");
  if (state.serviceType === "instalacion") { show("qInstall"); hide("qMaint"); hide("qRepair"); }
  if (state.serviceType === "mantenimiento") { show("qMaint"); hide("qInstall"); hide("qRepair"); }
  if (state.serviceType === "reparacion") { show("qRepair"); hide("qInstall"); hide("qMaint"); }
  window.scrollTo({top:0,behavior:"smooth"});
}

function validateClient(){
  const name = $("clientName").value.trim();
  const phone = $("phone").value.trim();
  const town = $("town").value.trim();

  if (!name || name.length < 2) return { ok:false, msg:"Pon tu nombre." };
  if (!phone || phone.length < 7) return { ok:false, msg:"Pon un teléfono válido." };
  if (!town || town.length < 2) return { ok:false, msg:"Pon tu pueblo/zona." };

  state.client = { clientName:name, phone, town };
  return { ok:true };
}

/* ========= CALCULATORS ========= */
async function calcInstall(){
  const sqft = Number($("sqft").value || 0);
  const access = $("access").value;
  const nearPower = $("nearPower").value;
  const lineSet = $("lineSet").value;
  const hasUnit = $("hasUnit").value;
  const wall = $("wall").value;

  if (!sqft || sqft < 50) { alert("Pon los pies² del área."); return; }

  const btu = suggestBTUFromSqft(sqft);
  const tier = pickInstallTier(btu);

  let min = tier.baseMin;
  let max = tier.baseMax;

  const adds = PRICING.install.add;

  if (nearPower === "no") { min += adds.nearPower_no.min; max += adds.nearPower_no.max; }
  if (nearPower === "nose") { min += adds.nearPower_nose.min; max += adds.nearPower_nose.max; }

  if (lineSet === "11_25") { min += adds.lineSet_11_25.min; max += adds.lineSet_11_25.max; }
  if (lineSet === "26_50") { min += adds.lineSet_26_50.min; max += adds.lineSet_26_50.max; }

  if (access === "2do") { min += adds.access_2do.min; max += adds.access_2do.max; }
  if (access === "dificil") { min += adds.access_dificil.min; max += adds.access_dificil.max; }

  if (wall === "hormigon") { min += adds.wall_hormigon.min; max += adds.wall_hormigon.max; }

  // Si el cliente no tiene unidad, no sumamos equipo (porque tú podrías venderlo aparte).
  // Pero dejamos claro en el breakdown.
  const unitNote = (hasUnit === "no")
    ? "Nota: estimado incluye instalación; equipo no incluido."
    : "Nota: estimado asume que el cliente ya tiene el equipo.";

  state.answers = { sqft, btuSuggested: btu, access, nearPower, lineSet, hasUnit, wall };
  state.estimate = { min, max };
  state.breakdown = `BTU sugeridos: ${btu}. ${unitNote}`;

  await finalize();
}

async function calcMaint(){
  const units = Number($("units").value || 1);
  const mAccess = $("mAccess").value;
  const mType = $("mType").value;

  if (units < 1) { alert("Cantidad de unidades inválida."); return; }

  const base = PRICING.maint.basePerUnit[mType] || PRICING.maint.basePerUnit.minisplit;
  const mult = PRICING.maint.accessMult[mAccess] ?? 1.0;

  let min = units * base.min * mult;
  let max = units * base.max * mult;

  const disc = bestDiscount(units);
  min = min * (1 - disc);
  max = max * (1 - disc);

  state.answers = { units, access: mAccess, type: mType, volumeDiscount: disc };
  state.estimate = { min, max };
  state.breakdown = `Descuento por volumen: ${(disc*100).toFixed(0)}%.`;

  await finalize();
}

async function calcRepair(){
  const symptom = $("symptom").value;
  const lastMaint = $("lastMaint").value;
  const brand = $("brand").value.trim();
  const model = $("model").value.trim();

  let min = PRICING.repair.diag.min;
  let max = PRICING.repair.diag.max;

  const bumpS = PRICING.repair.bumps[symptom] || { min:0, max:120 };
  const bumpM = PRICING.repair.lastMaint[lastMaint] || { min:0, max:60 };

  min += bumpS.min + bumpM.min;
  max += bumpS.max + bumpM.max;

  state.answers = { symptom, lastMaint, brand, model };
  state.estimate = { min, max };
  state.breakdown = `Incluye diagnóstico. Reparación final depende de piezas/causa raíz.`;

  await finalize();
}

async function finalize(){
  // UI result
  $("range").textContent = `${money(state.estimate.min)} – ${money(state.estimate.max)}`;
  $("breakdown").textContent = state.breakdown;

  hide("qInstall"); hide("qMaint"); hide("qRepair");
  show("result");
  window.scrollTo({top:0,behavior:"smooth"});

  try{
    const docId = await savePrequote();
    setWhatsAppLink(docId);
  }catch(err){
    console.error(err);
    alert("No pude guardar la solicitud ahora mismo. Igual puedes enviar por WhatsApp.");
    // WhatsApp sin ref
    setWhatsAppLink("SIN-REF");
  }
}

/* ========= EVENTS ========= */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-service]");
  if (btn){
    state.serviceType = btn.dataset.service;
    goClient();
  }
});

$("backToService").addEventListener("click", () => { resetAll(); });

$("goQuestions").addEventListener("click", () => {
  const v = validateClient();
  if (!v.ok) { alert(v.msg); return; }
  goQuestions();
});

$("backToClient1").addEventListener("click", () => { show("stepClient"); hide("qInstall"); });
$("backToClient2").addEventListener("click", () => { show("stepClient"); hide("qMaint"); });
$("backToClient3").addEventListener("click", () => { show("stepClient"); hide("qRepair"); });

$("calcInstall").addEventListener("click", calcInstall);
$("calcMaint").addEventListener("click", calcMaint);
$("calcRepair").addEventListener("click", calcRepair);

$("startOver").addEventListener("click", () => {
  // limpia inputs rápido
  ["clientName","phone","town","sqft","units","brand","model"].forEach(id => { if ($(id)) $(id).value = ""; });
  resetAll();
});

resetAll();
