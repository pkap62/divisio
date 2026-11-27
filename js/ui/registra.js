// Pagina "Registra": modalità semplice (Entrate/Uscite) e modalità partita doppia.

import { scritturaSemplice, scritturaPiuVoci, verificaMovimento, analizza } from "../dominio/scritture.js";
import { parseEuro, formatDecimale, formatEuro } from "../dominio/importi.js";
import { isCassaBanca, casseInOrdine, tipoDi } from "../dominio/piano.js";
import { esc, eur, dataIt, dataPerAnno, opzioniConti, rendicontoInviato, toast, $ } from "./util.js";
import { tabellaRighe } from "./elenco.js";
import { causaleProposta, causaleDa, causaliPer, contoAmmesso, causalePerSpostamento, etichettaCausale } from "../dominio/causali.js";

let F = null;   // stato del modulo in compilazione

const casse = (arch) => casseInOrdine(arch.contiAttivi());
const rigaVuota = () => ({ conto: "", dare: "", avere: "" });
const vuotaVoce = () => ({ voce: "", cerca: "", importo: "", nota: "" });
/** Causale come in UNIO: facoltativa, si accende in Impostazioni. */
export const conCausale = (arch) => Boolean(arch.impostazione("causale-unio", false));
/** Le causali del teatro (ETE, UTE) compaiono solo se la parrocchia ha acceso la funzione del teatro. */
const opzCausali = (arch) => ({ teatro: Boolean(arch.impostazione("teatro", {})?.attivo) });
/** La causale scelta, se è accesa ed è tra quelle di UNIO (decide quali voci si possono scegliere). */
const causaleScelta = (ctx) => (conCausale(ctx.arch) ? causaleDa(F.causale) : null);
const tipoCausali = () => (F.modo === "pd" ? "pd" : F.tipo);

function nuovo(ctx, tipo = "entrata", tieni = {}) {
  const cs = casse(ctx.arch);
  const f = { modo: "semplice", tipo, data: dataPerAnno(ctx.anno), importo: "", descr: "", causaleToccata: false, voci: [vuotaVoce()], causale: "",
    cassa: cs[0]?.codice ?? "", da: cs[0]?.codice ?? "", verso: (cs[1] ?? cs[0])?.codice ?? "",
    righe: [rigaVuota(), rigaVuota()], id: null, ...tieni };
  if (tipo === "spostamento" && conCausale(ctx.arch) && !f.causaleToccata) f.causale = causalePerSpostamento(f.da, f.verso);
  return f;
}

function daMovimento(m) {
  const a = analizza(m);
  const causale = m.causale ?? "";
  const base = { id: m.id, data: m.data, descr: m.descr, causale, causaleToccata: Boolean(causale), voci: [vuotaVoce()], righe: [rigaVuota(), rigaVuota()] };
  // Entrata/uscita semplice: una sola cassa che riceve (o dà) e tutte le voci dall'altra parte, anche più di una.
  // Il tipo si ricava dalle righe: così anche i movimenti caricati da UNIO o scritti in partita doppia tornano nella modalità semplice.
  const entra = a.tipo === "entrata";
  if (m.tipo !== "apertura" && (a.tipo === "entrata" || a.tipo === "uscita") && a.casse.length === 1 && a.voci.length >= 1
      && (entra ? a.casse[0].dare > 0 && a.voci.every((r) => r.avere > 0 && !r.dare) : a.casse[0].avere > 0 && a.voci.every((r) => r.dare > 0 && !r.avere))) {
    return { ...base, modo: "semplice", tipo: a.tipo, importo: "", cassa: a.casse[0].conto, da: "", verso: "",
      voci: a.voci.map((r) => ({ voce: r.conto, cerca: "", importo: formatDecimale(entra ? r.avere : r.dare), nota: r.nota ?? "" })) };
  }
  if (m.tipo !== "apertura" && a.tipo === "spostamento") {
    return { ...base, modo: "semplice", tipo: "spostamento", importo: formatDecimale(a.importo), cassa: "", da: a.da, verso: a.verso };
  }
  return { ...base, modo: "pd", tipo: "pd", importo: "", cassa: "", da: "", verso: "", righe: m.righe.map(rigaPD) };
}

/** Chiamata prima di mostrare la pagina. opz: {tipo} per un nuovo movimento, {modifica:id} per correggerne uno. */
export function prepara(ctx, opz = {}) {
  if (opz.modifica) { const m = ctx.arch.movimento(opz.modifica); if (m) { F = daMovimento(m); return; } }
  if (opz.copia) {
    // "Registra di nuovo": stesso movimento, ma nuovo e con la data di oggi (o dell'anno scelto)
    const m = ctx.arch.movimento(opz.copia);
    if (m) { F = { ...daMovimento(m), id: null, data: dataPerAnno(ctx.anno), copiaDa: { descr: m.descr, data: m.data } }; return; }
  }
  if (!F || opz.tipo || F.id) F = nuovo(ctx, opz.tipo || "entrata");
  if (F.data.slice(0, 4) !== String(ctx.anno)) F.data = dataPerAnno(ctx.anno);
}

// riga del modulo in partita doppia (il dettaglio della riga, se c'è, viene conservato)
const rigaPD = (r) => ({ conto: r.conto, dare: r.dare ? formatDecimale(r.dare) : "", avere: r.avere ? formatDecimale(r.avere) : "", ...(r.nota ? { nota: r.nota } : {}) });

/* ---------- movimento costruito dal modulo ---------- */
function candidato(ctx) {
  const r = candidatoSenzaCausale(ctx);
  // la causale si salva solo se è accesa in Impostazioni (se è spenta, quella che c'era resta com'è)
  if (conCausale(ctx.arch)) r.mov.causale = F.causale.trim();
  return r;
}

function candidatoSenzaCausale(ctx) {
  if (F.modo === "pd") {
    const righe = F.righe.filter((r) => r.conto || r.dare || r.avere)
      .map((r) => ({ conto: r.conto, dare: parseEuro(r.dare), avere: parseEuro(r.avere), ...(r.nota ? { nota: r.nota } : {}) }));
    const valide = righe.every((r) => !Number.isNaN(r.dare) && !Number.isNaN(r.avere));
    return { completo: valide && righe.length >= 2, mov: { data: F.data, descr: F.descr.trim(), tipo: "pd", righe }, importoNonValido: !valide };
  }
  if (F.tipo === "spostamento") {
    const importo = parseEuro(F.importo);
    const pronto = importo > 0 && F.da && F.verso;
    const righe = pronto ? scritturaSemplice({ tipo: F.tipo, importo, da: F.da, verso: F.verso }) : [];
    return { completo: pronto && F.descr.trim(), mov: { data: F.data, descr: F.descr.trim(), tipo: F.tipo, righe }, importoNonValido: Number.isNaN(importo) || importo < 0 };
  }
  // entrata/uscita: le righe del tutto vuote si ignorano
  const voci = F.voci.filter((v) => v.voce || v.importo.trim() || v.nota.trim()).map((v) => ({ voce: v.voce, importo: parseEuro(v.importo), nota: v.nota }));
  const importoNonValido = voci.some((v) => Number.isNaN(v.importo) || v.importo < 0);
  const pronto = voci.length > 0 && voci.every((v) => v.voce && v.importo > 0) && F.cassa;
  const righe = pronto ? scritturaPiuVoci({ tipo: F.tipo, cassa: F.cassa, voci }) : [];
  return { completo: pronto && F.descr.trim(), mov: { data: F.data, descr: F.descr.trim(), tipo: F.tipo, righe }, importoNonValido };
}

/* ---------- viste ---------- */
const bottoniCasse = (ctx, scelto, azione) => `<div class="scelta">${casse(ctx.arch).map((c) =>
  `<button type="button" class="${c.codice === scelto ? "on sposta" : ""}" data-azione="${azione}" data-v="${c.codice}">${esc(c.nome)}</button>`).join("")}</div>`;

const tipiPerVoce = () => (F.tipo === "entrata" ? ["E", "PG", "A", "P"] : ["U", "PG", "A", "P"]);
const escludiVoce = (codice) => isCassaBanca(codice) || tipoDi(codice) === "PAT" || (F.tipo === "entrata" ? tipoDi(codice) === "U" : tipoDi(codice) === "E");
// con una causale scelta, l'elenco mostra solo le voci di quella causale (come in UNIO)
const opzioniVoce = (ctx, i) => {
  const c = causaleScelta(ctx);
  return opzioniConti(ctx.arch.contiAttivi(), { tipi: tipiPerVoce(), escludi: (k) => escludiVoce(k) || !contoAmmesso(c, k), cerca: F.voci[i].cerca, selezionato: F.voci[i].voce,
    vuota: c ? `— scegli la voce di «${c.descr}» —` : undefined });
};

export function vista(ctx) {
  return F.modo === "pd" ? vistaPD(ctx) : vistaSemplice(ctx);
}

// Campo "Causale" (come la "Tipologia operazione" di UNIO): elenco delle causali della Diocesi, raggruppate come in UNIO.
// Scelta la causale, l'elenco delle voci mostra solo quelle della causale.
function campoCausale(ctx, id) {
  if (!conCausale(ctx.arch)) return "";
  const elenco = causaliPer(tipoCausali(), opzCausali(ctx.arch));
  const gruppi = [...new Set(elenco.map((c) => c.tipologia))];
  const scelta = causaleDa(F.causale);
  // una causale che non è nell'elenco (scritta a mano in passato, o di un altro tipo) resta visibile e scelta
  const altra = F.causale.trim() && !(scelta && elenco.includes(scelta))
    ? `<option value="${esc(F.causale)}" selected>${esc(etichettaCausale(F.causale))} (non è tra le causali ${F.modo === "pd" ? "di UNIO" : F.tipo === "entrata" ? "di entrata" : F.tipo === "uscita" ? "di uscita" : "per spostare soldi"})</option>` : "";
  return `<label class="campo" for="${id}">Causale <span class="hint">(come la «Tipologia operazione» di UNIO; facoltativa)</span></label>
    <select id="${id}" data-cambia="causale">
      <option value="" ${F.causale.trim() ? "" : "selected"}>${F.modo === "semplice" && F.tipo === "spostamento" ? "— nessuna causale —" : `— nessuna causale: tutti ${F.modo === "pd" ? "i conti" : "le voci"} —`}</option>${altra}
      ${gruppi.map((g) => `<optgroup label="${esc(g)}">${elenco.filter((c) => c.tipologia === g).map((c) =>
        `<option value="${esc(c.descr)}" ${c === scelta && !altra ? "selected" : ""}>${esc(c.codice)} · ${esc(c.descr)}</option>`).join("")}</optgroup>`).join("")}
    </select>
    ${scelta && !altra && F.modo !== "pd" && F.tipo !== "spostamento" ? `<p class="hint">Nell'elenco delle voci ci sono solo quelle della causale. Per averle tutte scelga «nessuna causale».</p>` : ""}`;
}

/** Propone la causale (se non è stata scelta a mano) in base alla prima voce scelta. */
function proponiCausale(ctx) {
  if (!conCausale(ctx.arch) || F.causaleToccata || F.modo === "pd" || F.tipo === "spostamento") return false;
  const voce = F.voci.find((v) => v.voce)?.voce ?? "";
  const prima = F.causale;
  F.causale = causaleProposta(voce, F.tipo, ctx.arch.movimenti(), opzCausali(ctx.arch));
  return F.causale !== prima;
}

/** Sposta soldi: Prelevamento (dalla banca alla cassa) o Versamento (dalla cassa alla banca), se non è stata scelta a mano. */
function proponiCausaleSpostamento(ctx) {
  if (conCausale(ctx.arch) && !F.causaleToccata) F.causale = causalePerSpostamento(F.da, F.verso);
}

/** Voci (o conti, in partita doppia) che non sono tra quelli della causale scelta. */
function fuoriCausale(ctx) {
  const c = causaleScelta(ctx);
  if (!c) return [];
  const codici = F.modo === "pd" ? F.righe.map((r) => r.conto) : F.tipo === "spostamento" ? [F.da, F.verso] : F.voci.map((v) => v.voce);
  return [...new Set(codici.filter((k) => k && !contoAmmesso(c, k)))];
}

const notaCopia = () => (F.copiaDa && !F.id
  ? `<div class="nota">Copiato da «${esc(F.copiaDa.descr)}» del ${dataIt(F.copiaDa.data)}: controlli data e importo, poi prema Registra.</div>` : "");

const notaFattura = (ctx) => (F.id && ctx.arch.movimento(F.id)?.fattura
  ? `<div class="nota">Questo movimento viene da una fattura saldata (pagina Scadenzario). Si può correggere qui; per annullare il pagamento, nella pagina Scadenzario clicchi il pulsante verde «Saldata».</div>` : "");

function intestazione(titolo, testoBottone, azioneBottone) {
  return `<div class="riga"><h2 class="spazio">${titolo}</h2>
    <button class="btn sec piccolo" data-azione="${azioneBottone}">${testoBottone}</button></div>`;
}

// Una riga per voce (come in UNIO): voce, dettaglio facoltativo, importo. Se le righe sono più di una compare il totale.
function righeVoci(ctx) {
  const piu = F.voci.length > 1;
  return `<div class="righe-voci${piu ? " piu" : ""}">${F.voci.map((v, i) => `<div class="riga-voce">
      ${piu ? `<div class="riga"><b class="spazio">Riga ${i + 1}</b><button class="btn pericolo piccolo" data-azione="togliVoce" data-i="${i}" aria-label="Togli la riga ${i + 1}">✕ Togli</button></div>` : ""}
      <label class="campo" for="f-voce-${i}">Voce</label>
      <div class="griglia voce"><input type="search" placeholder="Cerca la voce, es. funerali" value="${esc(v.cerca)}" data-input="cerca" data-i="${i}" aria-label="Cerca la voce della riga ${i + 1}">
        <select id="f-voce-${i}" data-cambia="voce" data-i="${i}">${opzioniVoce(ctx, i)}</select></div>
      <div class="griglia dettaglio">
        <div><label class="campo" for="f-nota-${i}">Dettaglio (facoltativo)</label><input id="f-nota-${i}" type="text" value="${esc(v.nota)}" data-input="nota" data-i="${i}"
          placeholder="${F.tipo === "entrata" ? "es. esequie di Mario Rossi" : "es. fattura n. 12"}"></div>
        <div><label class="campo" for="f-importo-${i}">Importo (€)</label><input id="f-importo-${i}" type="text" class="importo" inputmode="decimal" placeholder="0,00" value="${esc(v.importo)}" data-input="importoVoce" data-i="${i}"></div>
      </div></div>`).join("")}</div>
    <div class="riga riga-totale"><button class="btn sec piccolo" data-azione="aggiungiVoce">+ Aggiungi riga</button>
      <span class="spazio"></span>${piu ? `<span>Totale <b id="f-totale"></b></span>` : ""}</div>`;
}

function vistaSemplice(ctx) {
  const sp = F.tipo === "spostamento";
  return `
  ${intestazione(F.id ? "Correggi il movimento" : "Registra un movimento", "Sono pratico: usa la partita doppia", "modoPD")}
  <p class="lead">Compili i campi: Divisio scrive da solo la registrazione in partita doppia.</p>
  ${notaFattura(ctx)}${notaCopia()}
  <div class="card modulo">
    <div class="scelta">
      <button class="${F.tipo === "entrata" ? "on entrata" : ""}" data-azione="tipo" data-v="entrata">+ Entrata</button>
      <button class="${F.tipo === "uscita" ? "on uscita" : ""}" data-azione="tipo" data-v="uscita">− Uscita</button>
      <button class="${sp ? "on sposta" : ""}" data-azione="tipo" data-v="spostamento">⇄ Sposta soldi</button>
    </div>
    <div class="griglia g2">
      <div><label class="campo" for="f-data">Data</label><input id="f-data" type="date" value="${F.data}" data-input="data"></div>
      ${sp ? `<div><label class="campo" for="f-importo">Importo (€)</label><input id="f-importo" type="text" class="importo" inputmode="decimal" placeholder="0,00" value="${esc(F.importo)}" data-input="importo"></div>` : ""}
    </div>
    ${campoCausale(ctx, "f-causale")}
    <label class="campo" for="f-descr">${sp ? "Descrizione" : "Che cos'è? Lo scriva con parole sue"}</label>
    <input id="f-descr" type="text" value="${esc(F.descr)}" data-input="descr"
      placeholder="${F.tipo === "entrata" ? "es. offerte funerali di novembre" : F.tipo === "uscita" ? "es. bolletta luce di marzo" : "es. versamento contanti in banca"}">
    ${sp ? `
      <label class="campo">Da dove escono i soldi</label>${bottoniCasse(ctx, F.da, "da")}
      <label class="campo">Dove arrivano</label>${bottoniCasse(ctx, F.verso, "verso")}` : `
      ${righeVoci(ctx)}
      <label class="campo">${F.tipo === "entrata" ? "Dove sono entrati i soldi" : "Da dove sono usciti i soldi"}</label>${bottoniCasse(ctx, F.cassa, "cassa")}`}
    <div id="anteprima"></div>
    <div class="riga-bottoni"><button class="btn" id="salva" data-azione="salva">${F.id ? "Salva la correzione" : "Registra"}</button>
      <button class="btn sec" data-azione="${F.id ? "annullaModifica" : "svuota"}">${F.id ? "Annulla" : "Svuota"}</button></div>
  </div>`;
}

function vistaPD(ctx) {
  const tutti = ctx.arch.contiAttivi();
  return `
  ${intestazione(F.id ? "Correggi il movimento" : "Registra in partita doppia", "Torna alla modalità semplice", "modoSemplice")}
  <p class="lead">Per chi conosce la partita doppia: il movimento si salva solo se Dare = Avere.</p>
  ${notaFattura(ctx)}${notaCopia()}
  <div class="card modulo">
    ${campoCausale(ctx, "p-causale")}
    <div class="griglia g2">
      <div><label class="campo" for="p-data">Data</label><input id="p-data" type="date" value="${F.data}" data-input="data"></div>
      <div><label class="campo" for="p-descr">Descrizione</label><input id="p-descr" type="text" value="${esc(F.descr)}" data-input="descr" placeholder="es. giroconto di fine anno"></div>
    </div>
    <div class="scorri"><table class="pd"><tr><th>Conto</th><th class="n">Dare</th><th class="n">Avere</th><th></th></tr>
      ${F.righe.map((r, i) => `<tr>
        <td><select data-cambia="pdConto" data-i="${i}" aria-label="Conto della riga ${i + 1}">${opzioniConti(tutti, { tipi: ["A", "P", "PAT", "PG", "E", "U"], selezionato: r.conto, vuota: "— scegli il conto —",
          escludi: (k) => !contoAmmesso(causaleScelta(ctx), k) })}</select></td>
        <td><input type="text" inputmode="decimal" class="n" value="${esc(r.dare)}" data-input="pdDare" data-i="${i}" aria-label="Dare riga ${i + 1}"></td>
        <td><input type="text" inputmode="decimal" class="n" value="${esc(r.avere)}" data-input="pdAvere" data-i="${i}" aria-label="Avere riga ${i + 1}"></td>
        <td>${F.righe.length > 2 ? `<button class="btn pericolo piccolo" data-azione="pdTogli" data-i="${i}" aria-label="Togli riga">✕</button>` : ""}</td></tr>`).join("")}
      <tr class="tot"><td>Totale</td><td class="n" id="pd-dare"></td><td class="n" id="pd-avere"></td><td></td></tr></table></div>
    <button class="btn sec piccolo" data-azione="pdAggiungi">+ Aggiungi riga</button>
    <div id="anteprima"></div>
    <div class="riga-bottoni"><button class="btn" id="salva" data-azione="salva">${F.id ? "Salva la correzione" : "Registra"}</button>
      ${F.id ? `<button class="btn sec" data-azione="annullaModifica">Annulla</button>` : ""}</div>
  </div>`;
}

/** Aggiorna solo l'anteprima e il pulsante, senza ridisegnare i campi (così non si perde il cursore). */
function aggiornaAnteprima(ctx) {
  const box = $("#anteprima");
  if (!box) return;
  const { completo, mov, importoNonValido } = candidato(ctx);
  const errori = completo ? verificaMovimento(mov, { conti: ctx.arch.conti, anno: ctx.anno }) : [];
  const msg = [];
  if (importoNonValido) msg.push(`<div class="errore">Importo non valido: scriva per esempio 50 oppure 1.250,50</div>`);
  // Rendiconto di quell'anno già inviato da UNIO (anche l'anno della data di prima, se si sta correggendo)
  const anni = new Set([F.data?.slice(0, 4), F.id ? ctx.arch.movimento(F.id)?.data.slice(0, 4) : null].filter(Boolean));
  for (const a of anni) {
    const inviato = rendicontoInviato(ctx.arch, Number(a));
    if (inviato) msg.push(`<div class="avviso">Il Rendiconto ${a} risulta già <b>inviato da UNIO il ${dataIt(inviato)}</b>: quello che registra o corregge qui va riportato anche in UNIO.</div>`);
  }
  if (F.data && F.data.slice(0, 4) !== String(ctx.anno)) msg.push(`<div class="avviso">La data è fuori dall'anno ${ctx.anno} (l'anno si cambia in alto).</div>`);
  if (F.modo === "semplice" && F.tipo !== "spostamento") {
    const tot = mov.righe.filter((r) => isCassaBanca(r.conto)).reduce((s, r) => s + r.dare + r.avere, 0);
    const el = $("#f-totale");
    if (el) el.textContent = importoNonValido ? "—" : formatEuro(tot || F.voci.reduce((s, v) => s + (parseEuro(v.importo) || 0), 0));
  }
  if (F.modo === "semplice" && F.tipo !== "spostamento" && F.voci.some((v) => v.voce && tipoDi(v.voce) === "PG")) {
    msg.push(`<div class="nota">${F.tipo === "entrata"
      ? "Questa è una <b>colletta da versare alla Diocesi</b>: Divisio la tiene da parte e non la conta tra le entrate della parrocchia."
      : "Questo è il <b>versamento alla Diocesi</b> di una colletta raccolta."}</div>`);
  }
  const fuori = fuoriCausale(ctx);
  if (fuori.length) {
    msg.push(`<div class="avviso">${fuori.length > 1 ? "Queste voci non sono" : "Questa voce non è"} tra quelle della causale «${esc(causaleScelta(ctx).descr)}»:
      ${fuori.map((k) => `<b>${esc(ctx.arch.nomeConto(k))}</b> (${k})`).join(", ")}. In UNIO non si potrebbe registrare così: cambi la voce o la causale.</div>`);
  }
  if (F.modo === "pd") {
    const d = mov.righe.reduce((s, r) => s + (r.dare || 0), 0), a = mov.righe.reduce((s, r) => s + (r.avere || 0), 0);
    $("#pd-dare").textContent = formatEuro(d);
    $("#pd-avere").textContent = formatEuro(a);
    if (!importoNonValido && d !== a) msg.push(`<div class="errore">Non in quadratura: mancano <b>${eur(Math.abs(d - a))}</b> in ${d > a ? "Avere" : "Dare"}.</div>`);
  }
  for (const e of errori) if (!(F.modo === "pd" && e.startsWith("Dare ("))) msg.push(`<div class="errore">${esc(e)}</div>`);
  if (completo && !errori.length) msg.push(`<div class="ok">✓ Dare = Avere: si può registrare.</div>`);
  box.innerHTML = msg.join("") + (F.modo === "semplice" && mov.righe.length
    ? `<details><summary>Mostra la registrazione in partita doppia</summary>${tabellaRighe(mov.righe, ctx.arch)}</details>` : "");
  $("#salva").disabled = !completo || errori.length > 0;
}

export const dopo = aggiornaAnteprima;

export const input = {
  data(el, ev, ctx) { F.data = el.value; aggiornaAnteprima(ctx); },
  importo(el, ev, ctx) { F.importo = el.value; aggiornaAnteprima(ctx); },
  importoVoce(el, ev, ctx) { F.voci[el.dataset.i].importo = el.value; aggiornaAnteprima(ctx); },
  nota(el, ev, ctx) { F.voci[el.dataset.i].nota = el.value; aggiornaAnteprima(ctx); },
  descr(el, ev, ctx) { F.descr = el.value; aggiornaAnteprima(ctx); },
  cerca(el, ev, ctx) { const i = Number(el.dataset.i); F.voci[i].cerca = el.value; $(`#f-voce-${i}`).innerHTML = opzioniVoce(ctx, i); },
  pdDare(el, ev, ctx) { F.righe[el.dataset.i].dare = el.value; aggiornaAnteprima(ctx); },
  pdAvere(el, ev, ctx) { F.righe[el.dataset.i].avere = el.value; aggiornaAnteprima(ctx); },
};

export const cambia = {
  voce(el, ev, ctx) {
    F.voci[el.dataset.i].voce = el.value;
    // causale proposta dalla voce: si ridisegna, così l'elenco delle voci mostra quelle della causale
    if (proponiCausale(ctx)) ctx.aggiorna(); else aggiornaAnteprima(ctx);
  },
  causale(el, ev, ctx) {
    // scelta a mano (anche «nessuna causale»): Divisio non la cambia più da solo
    F.causale = el.value;
    F.causaleToccata = true;
    if (F.modo === "semplice" && F.tipo === "spostamento") {
      // Prelevamento: dalla banca alla cassa; Versamento: dalla cassa alla banca
      const cs = casse(ctx.arch).map((c) => c.codice), cassa = "A02-01-01", banca = cs.find((k) => k !== cassa);
      const c = causaleDa(F.causale);
      if (c?.codice === "PRE" && cs.includes(cassa) && banca) { F.verso = cassa; if (F.da === cassa) F.da = banca; }
      if (c?.codice === "VER" && cs.includes(cassa) && banca) { F.da = cassa; if (F.verso === cassa) F.verso = banca; }
    }
    ctx.aggiorna();
  },
  pdConto(el, ev, ctx) { F.righe[el.dataset.i].conto = el.value; aggiornaAnteprima(ctx); },
};

export const azioni = {
  tipo(el, ev, ctx) {
    const t = el.dataset.v;
    if (t !== F.tipo) {
      // l'importo già scritto passa da un tipo all'altro; la voce no (le voci di entrata e di uscita sono diverse)
      if (t === "spostamento" && !F.importo) F.importo = F.voci[0].importo;
      if (F.tipo === "spostamento" && F.voci.length === 1 && !F.voci[0].importo) F.voci[0].importo = F.importo;
      F.tipo = t;
      F.voci = F.voci.map((v) => ({ ...v, voce: "", cerca: "" }));
      // la causale di un altro tipo (es. di entrata, passando a uscita) non vale più
      const c = causaleDa(F.causale);
      if (!F.causaleToccata || (c && c.modo !== t)) { F.causale = ""; F.causaleToccata = false; }
      if (t === "spostamento") proponiCausaleSpostamento(ctx);
    }
    ctx.aggiorna();
  },
  aggiungiVoce(el, ev, ctx) {
    // la nuova riga riprende la voce di quella sopra (es. più funerali): basta cambiare dettaglio e importo
    const ultima = F.voci[F.voci.length - 1];
    F.voci.push({ ...vuotaVoce(), voce: ultima?.voce ?? "", cerca: ultima?.cerca ?? "" });
    ctx.aggiorna();
    document.getElementById(`f-nota-${F.voci.length - 1}`)?.focus();
  },
  togliVoce(el, ev, ctx) { F.voci.splice(Number(el.dataset.i), 1); if (!F.voci.length) F.voci.push(vuotaVoce()); ctx.aggiorna(); },
  cassa(el, ev, ctx) { F.cassa = el.dataset.v; ctx.aggiorna(); },
  da(el, ev, ctx) { F.da = el.dataset.v; if (F.verso === F.da) F.verso = casse(ctx.arch).find((c) => c.codice !== F.da)?.codice ?? ""; proponiCausaleSpostamento(ctx); ctx.aggiorna(); },
  verso(el, ev, ctx) { F.verso = el.dataset.v; if (F.verso === F.da) F.da = casse(ctx.arch).find((c) => c.codice !== F.verso)?.codice ?? ""; proponiCausaleSpostamento(ctx); ctx.aggiorna(); },
  modoPD(el, ev, ctx) {
    // porta nella partita doppia quello che era già stato scritto
    const { mov } = candidato(ctx);
    F.modo = "pd";
    if (mov.righe.length) F.righe = mov.righe.map(rigaPD);
    ctx.aggiorna();
  },
  modoSemplice(el, ev, ctx) {
    // se le righe scritte sono un'entrata, un'uscita o uno spostamento, passano nella modalità semplice; altrimenti si riparte da capo
    const righe = F.righe.filter((r) => r.conto && (r.dare || r.avere))
      .map((r) => ({ conto: r.conto, dare: parseEuro(r.dare) || 0, avere: parseEuro(r.avere) || 0, ...(r.nota ? { nota: r.nota } : {}) }));
    const conv = righe.length >= 2 ? daMovimento({ id: F.id, data: F.data, descr: F.descr, causale: F.causale, tipo: "pd", righe }) : null;
    F = conv && conv.modo === "semplice" ? conv : nuovo(ctx, "entrata", { data: F.data, descr: F.descr, id: F.id, causale: F.causale, causaleToccata: Boolean(F.causale) });
    ctx.aggiorna();
  },
  pdAggiungi(el, ev, ctx) { F.righe.push(rigaVuota()); ctx.aggiorna(); },
  pdTogli(el, ev, ctx) { F.righe.splice(Number(el.dataset.i), 1); ctx.aggiorna(); },
  svuota(el, ev, ctx) { F = nuovo(ctx, F.tipo); ctx.aggiorna(); },
  annullaModifica(el, ev, ctx) { F = nuovo(ctx, "entrata"); ctx.vai("movimenti"); },
  async salva(el, ev, ctx) {
    const { completo, mov } = candidato(ctx);
    if (!completo) return;
    const errori = verificaMovimento(mov, { conti: ctx.arch.conti, anno: ctx.anno });
    if (errori.length) { toast(errori[0]); return; }
    el.disabled = true;
    try {
      const eraModifica = Boolean(F.id);
      await ctx.arch.salvaMovimento(F.id ? { ...ctx.arch.movimento(F.id), ...mov, id: F.id } : mov);
      toast(eraModifica ? "Correzione salvata ✓" : "Registrato ✓");
      if (eraModifica) { F = nuovo(ctx, "entrata"); ctx.vai("movimenti"); return; }
      // pronto per il prossimo: tiene tipo, data e cassa (e la causale, se è stata scelta a mano)
      const causale = F.causaleToccata ? { causale: F.causale, causaleToccata: true } : {};
      F = F.modo === "pd" ? { ...nuovo(ctx, "pd"), modo: "pd", data: F.data, ...causale } : nuovo(ctx, F.tipo, { data: F.data, cassa: F.cassa, da: F.da, verso: F.verso, ...causale });
      ctx.aggiorna();
      document.getElementById(F.modo === "pd" ? "p-descr" : F.tipo === "spostamento" ? "f-importo" : "f-importo-0")?.focus();
    } catch (e) {
      el.disabled = false;
      toast("Non è stato possibile salvare: " + e.message);
    }
  },
};
