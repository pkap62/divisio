// Pagina "Fatture": caricamento delle fatture ricevute (XML, P7M, PDF), scadenzario, pagamento.
// Regola: in contabilità entra solo una fattura PAGATA, e solo dopo la conferma dell'utente.

import { leggiFatturaPA, xmlDaP7m, testoDaByte, trovaDoppione, stessaFattura, chiaveFornitore, MODALITA, nomeModalita, modalitaInContanti, TIPI_DOCUMENTO } from "../dominio/fatture.js";
import { leggiFatturaDaTesto, imparaModello } from "../dominio/fatturePDF.js";
import { nuovaFattura, segnaPagata, tornaDaPagare, scadenze, riepilogo, coerenza, righePagamento, dividi, descrizione, idMovimento, testoModalita, PAGATA, GESTIONI, gestioneValida, nomeGestione } from "../dominio/scadenzario.js";
import { proponiVoce, propostaTeatro } from "../dominio/suggerimenti.js";
import { ricordoPer, ricordoAggiornato, diversoServizio, etichettaServizio } from "../dominio/servizi.js";
import { trovaForseDoppione } from "../dominio/doppioni.js";
import { azzeraScadenzario } from "../dominio/azzera.js";
import { salvaCopia } from "./impostazioni.js";
import { verificaMovimento } from "../dominio/scritture.js";
import { parseEuro, formatDecimale } from "../dominio/importi.js";
import { isCassaBanca, casseInOrdine, tipoDi } from "../dominio/piano.js";
import { esc, eur, dataIt, oggiISO, opzioniConti, toast, locale, $ } from "./util.js";
import { tabellaRighe } from "./elenco.js";

let carico = null;   // { voci:[…], inLettura } — fatture lette e non ancora aggiunte
let pag = null;      // pagamento in compilazione
let coda = [];       // fatture appena aggiunte con la scritta "PAGATA" sul PDF: si propone di segnarle pagate, una dopo l'altra
let filtro = locale.leggi("fatture-filtro", "dapagare");
let azzera = null;   // riquadro "Azzera lo scadenzario" aperto: { ancheUscite, capito }

/* ---------- impostazioni che servono qui ---------- */
// Divisione delle fatture parrocchia / 50% / teatro o altra gestione: SPENTA per tutti finché non la si accende nelle Impostazioni.
export const teatro = (arch) => ({ attivo: false, parole: [], ...arch.impostazione("teatro", {}) });
const casse = (arch) => casseInOrdine(arch.contiAttivi());
/** Scelte ricordate per il fornitore, così come sono salvate (per tutti i suoi servizi). */
const ricordoSalvato = (arch, f) => arch.impostazione(chiaveFornitore(f));
/** Scelte ricordate che valgono per questa fattura (per il suo servizio: luce, gas…, o il suo contatore). */
const ricordo = (arch, f) => ricordoPer(ricordoSalvato(arch, f), f);
/** Impostazione da salvare per ricordare le scelte {voce, quotaTeatro} fatte per la fattura f. */
const daRicordare = (arch, f, scelte) => ({ chiave: chiaveFornitore(f), valore: ricordoAggiornato(ricordoSalvato(arch, f), f, scelte) });
/** Etichetta piccola con il servizio della fattura (luce, gas…), se Divisio l'ha riconosciuto. */
const pillaServizio = (f) => (f?.servizio?.tipo ? ` <span class="pill" title="${esc(etichettaServizio(f.servizio))}">${esc(f.servizio.tipo)}</span>` : "");
const parrocchia = (arch) => arch.impostazione("parrocchia", {});
/** Dove Divisio ricorda come è fatto il PDF di un fornitore (vedi imparaModello). */
const chiaveModello = (f) => chiaveFornitore(f).replace(/^fornitore:/, "modello-pdf:");
const opzioniPDF = (arch) => {
  const par = parrocchia(arch);
  return { escludiPiva: [par.codiceFiscale, par.partitaIva].filter(Boolean), nomiParrocchia: [par.nome].filter(Boolean) };
};

/** Problemi tra scadenzario e contabilità (usato anche dalla pagina Inizio). */
export function problemi(arch) {
  return coerenza(arch.fatture(), (id) => arch.movimento(id), arch.movimenti().filter((m) => m.fattura));
}
/** Fattura del teatro o di altra gestione, scelta quando è stata caricata: resta fuori dallo scadenzario e dalla contabilità. */
export const diAltraGestione = (arch, f) => teatro(arch).attivo && f.quotaTeatro === 100 && f.rate.every((r) => r.stato !== PAGATA);
/** Fatture che riguardano la contabilità della parrocchia (quelle di altre gestioni no). */
export const fattureDellaParrocchia = (arch) => arch.fatture().filter((f) => !diAltraGestione(arch, f));
export const elencoScadenze = (arch) => scadenze(fattureDellaParrocchia(arch), oggiISO());

/** Etichetta piccola con la scelta parrocchia / 50% / altra gestione (niente per "della parrocchia"). */
const pillaGestione = (q) => (q === 50 ? ` <span class="pill teatro-pill">al 50%</span>` : q === 100 ? ` <span class="pill teatro-pill">altra gestione</span>`
  : q > 0 ? ` <span class="pill teatro-pill">teatro ${q}%</span>` : "");

/** Pulsanti delle tre scelte. attributi: testo da aggiungere a ogni pulsante (data-azione, ecc.). */
const pulsantiGestione = (scelta, attributi, piccoli = false) => `<div class="scelta ${piccoli ? "piccola" : ""}">${GESTIONI.map((g) =>
  `<button type="button" class="${scelta === g.quota ? "on sposta" : ""}" ${attributi} data-q="${g.quota}" title="${esc(g.spiega)}">${esc(g.nome)}</button>`).join("")}</div>`;
const spiegaGestione = (q) => (gestioneValida(q) ? `<p class="hint">${esc(nomeGestione(q))}: ${esc(GESTIONI.find((g) => g.quota === q).spiega)}.</p>` : "");

/* ---------- lettura dei file ---------- */
const estensione = (nome) => (/\.(xml|p7m|pdf)$/i.exec(nome)?.[1] ?? "").toLowerCase();

async function leggiFile(file, arch) {
  const tipo = estensione(file.name);
  const base = { nomeFile: file.name, tipo };
  try {
    if (tipo === "xml" || tipo === "p7m") {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const xml = tipo === "p7m" || /\.xml\.p7m$/i.test(file.name) ? xmlDaP7m(bytes) : testoDaByte(bytes);
      if (!xml) return [{ ...base, errore: "Non si riesce ad aprire la busta firmata (.p7m)." }];
      const r = leggiFatturaPA(xml);
      if (!r.ok) return [{ ...base, errore: r.errore }];
      return r.fatture.map((dati) => ({ ...base, dati }));
    }
    if (tipo === "pdf") {
      const { leggiPDF } = await import("../dati/pdf.js");
      const { testo, righe, immagini } = await leggiPDF(await file.arrayBuffer());
      const noti = new Map(arch.fatture().filter((f) => f.piva).map((f) => [f.piva, f.fornitore]));
      const dati = leggiFatturaDaTesto(testo, { righe, ...opzioniPDF(arch), fornitoriNoti: noti, modelli: arch.impostazioniCon("modello-pdf:") });
      return [{ ...base, dati, righe, immagini, urlPDF: URL.createObjectURL(file), controllato: false }];
    }
    return [{ ...base, errore: "Questo tipo di file non è una fattura: servono file .xml, .p7m o .pdf." }];
  } catch (e) {
    console.error(e);
    return [{ ...base, errore: tipo === "pdf" ? "Il PDF non si riesce a leggere (forse è protetto o rovinato)." : "Il file non si riesce a leggere." }];
  }
}

/** Proposta "di chi è" per una fattura letta (solo con la divisione accesa): dalla scelta ricordata o dalle parole. */
function proponiGestione(v, arch) {
  const t = teatro(arch);
  if (!t.attivo || !v.dati || v.errore) return v;
  const pt = propostaTeatro(v.dati, { ricordo: ricordo(arch, v.dati), parole: t.parole });
  return { ...v, quota: pt.quota, quotaScelta: !pt.chiedi, quotaMotivo: pt.motivo, quotaRicordata: !pt.chiedi };
}

/**
 * Ricontrolla i doppioni (con lo scadenzario e tra i file appena scelti).
 * doppione: è sicuramente la stessa fattura (stesso fornitore, numero e data) → non si carica.
 * forse: potrebbe esserlo (stesso importo e stessa data, numero quasi uguale o stessa descrizione) → non si carica,
 * a meno che l'utente dica che è diversa (v.diversa).
 */
function segnaDoppioni(arch) {
  const gia = arch.fatture();
  carico.voci.forEach((v, i) => {
    v.doppione = null;
    v.forse = null;
    if (!v.dati || v.errore || v.tolta) return;
    const prima = carico.voci.slice(0, i).filter((x) => x.dati && !x.errore && !x.tolta && !x.doppione);
    const d = trovaDoppione(v.dati, gia);
    if (d) { v.doppione = `È già nello scadenzario (caricata il ${new Date(d.creatoIl).toLocaleDateString("it-IT")}${d.nomeFile ? ", file " + d.nomeFile : ""}): non verrà caricata di nuovo.`; return; }
    if (prima.some((x) => stessaFattura(x.dati, v.dati))) { v.doppione = "È la stessa fattura di un altro file scelto (per esempio l'XML e il PDF): verrà caricata una volta sola."; return; }
    const forse = trovaForseDoppione(v.dati, gia);
    if (forse) { v.forse = `${forse.testo} È già nello scadenzario.`; return; }
    const tra = trovaForseDoppione(v.dati, prima.map((x) => x.dati));
    if (tra) v.forse = `${tra.testo} È tra i file appena scelti.`;
  });
}
/** Fatture lette che verranno aggiunte. */
const daAggiungere = () => carico.voci.filter((v) => v.dati && !v.errore && !v.doppione && !v.tolta && (!v.forse || v.diversa));

async function carica(files, ctx) {
  const lista = [...files];
  if (!lista.length) return;
  if (!carico) carico = { voci: [], inLettura: 0 };
  carico.inLettura += lista.length;
  ctx.aggiorna();
  for (const file of lista) {
    const voci = await leggiFile(file, ctx.arch);
    carico.voci.push(...voci.map((v) => proponiGestione({ ...v, id: Math.random().toString(36).slice(2) }, ctx.arch)));
    carico.inLettura--;
    segnaDoppioni(ctx.arch);
    ctx.aggiorna();
  }
}

/* ---------- viste ---------- */
const giorniTesto = (g) => (g === 0 ? "oggi" : g === 1 ? "domani" : g > 0 ? `tra ${g} giorni` : g === -1 ? "da ieri" : `da ${-g} giorni`);
const opzioniModalita = (scelta) => `<option value="">— non indicata —</option>` + Object.entries(MODALITA)
  .map(([k, n]) => `<option value="${k}" ${k === scelta ? "selected" : ""}>${esc(n)}</option>`).join("");

export function vista(ctx) {
  const { arch } = ctx;
  const tutte = scadenze(arch.fatture(), oggiISO());
  const altre = tutte.filter((x) => diAltraGestione(arch, x.fattura));
  const el = tutte.filter((x) => !diAltraGestione(arch, x.fattura));
  const r = riepilogo(el);
  if (filtro === "altre" && !altre.length) filtro = "dapagare";
  const filtri = [["dapagare", "Da pagare"], ["pagate", "Pagate"], ["tutte", "Tutte"], ...(altre.length ? [["altre", `Teatro e altre gestioni (${altre.length})`]] : [])];
  const mostrate = filtro === "altre" ? altre : filtro === "tutte" ? tutte : el.filter((x) => (filtro === "pagate") === (x.rata.stato === PAGATA));
  const pr = problemi(arch);
  return `
  <h2>Fatture e scadenze</h2>
  <p class="lead">Carichi le fatture ricevute: Divisio le mette nello scadenzario come "da pagare".
    In contabilità entrano <b>solo quando le segna come pagate</b>, dopo la sua conferma.</p>
  ${pr.length ? vistaProblemi(pr) : ""}
  ${vistaCarica()}
  ${carico ? vistaCarico(ctx) : ""}
  ${pag ? vistaPagamento(ctx) : ""}
  <div class="card" id="scadenzario"><div class="riga"><h3 class="spazio">Scadenzario</h3></div>
    <div class="griglia g4 riepilogo-fatture">
      <div class="saldo"><div class="etichetta">Da pagare</div><div class="valore">${eur(r.totale)}</div><div class="hint">${r.daPagare === 1 ? "1 scadenza" : `${r.daPagare} scadenze`}</div></div>
      <div class="saldo"><div class="etichetta">Scadute</div><div class="valore ${r.scadute ? "neg" : ""}">${eur(r.totaleScadute)}</div><div class="hint">${r.scadute === 1 ? "1 fattura" : `${r.scadute} fatture`}</div></div>
      <div class="saldo"><div class="etichetta">Entro 7 giorni</div><div class="valore">${eur(r.totalePresto)}</div><div class="hint">${r.presto === 1 ? "1 fattura" : `${r.presto} fatture`}</div></div>
    </div>
    <div class="scelta filtro-fatture">
      ${filtri.map(([k, n]) => `<button class="${filtro === k ? "on sposta" : ""}" data-azione="filtro" data-v="${k}">${n}</button>`).join("")}
    </div>
    ${filtro === "altre" ? `<p class="hint">Fatture del teatro o di altre gestioni: non sono da pagare con i soldi della parrocchia e non entrano in contabilità.
      Se una è finita qui per sbaglio, apra «Dettagli» e scelga «Della parrocchia» o «Al 50%».</p>` : ""}
    ${tabellaScadenze(mostrate, ctx)}
  </div>
  ${vistaFornitori(arch)}
  ${vistaAzzera(ctx)}`;
}

function vistaProblemi(pr) {
  return `<div class="card"><h3>Da sistemare</h3><p class="hint">Scadenzario e contabilità non coincidono: scelga come rimettere a posto.</p>
    ${pr.map((p) => `<div class="errore">${esc(p.testo)}
      ${p.problema === "manca" ? `<div class="riga-bottoni stretta"><button class="btn sec piccolo" data-azione="riregistra" data-id="${esc(p.fattura.id)}" data-n="${p.rata.n}">Registrala di nuovo</button>
        <button class="btn sec piccolo" data-azione="rimettiDaPagare" data-id="${esc(p.fattura.id)}" data-n="${p.rata.n}">Rimetti la fattura "da pagare"</button></div>` : ""}
      ${p.problema === "in-piu" ? `<div class="riga-bottoni stretta"><button class="btn sec piccolo" data-azione="apriPagamento" data-id="${esc(p.fattura.id)}" data-n="${p.rata.n}">Segna la fattura come pagata</button>
        <button class="btn sec piccolo" data-azione="togliUscita" data-id="${esc(p.fattura.id)}" data-n="${p.rata.n}">Togli l'uscita dalla contabilità</button></div>` : ""}
    </div>`).join("")}</div>`;
}

function vistaCarica() {
  return `<div class="card zona-file" id="zona-file">
    <h3>Carica fatture</h3>
    <p>Trascini qui i file delle fatture, anche molti insieme, oppure li scelga dal computer.
      Vanno bene gli <b>XML</b> scaricati da Aruba (anche firmati, <b>.p7m</b>) e i <b>PDF</b>.</p>
    <div class="riga-bottoni stretta"><label class="btn">Scegli i file…<input type="file" accept=".xml,.p7m,.pdf,application/pdf,text/xml" multiple hidden data-cambia="file"></label></div>
    <div class="avviso"><b>Controlli sempre i dati letti.</b> La lettura automatica può sbagliare, soprattutto con i PDF;
      le scansioni non vengono lette e vanno compilate a mano. Prima di aggiungere le fatture, confronti fornitore, numero, data, importi e scadenza con l'originale.</div>
    <p class="hint">I file vengono letti solo su questo computer: non sono inviati da nessuna parte e Divisio non li conserva (tenga gli originali nella sua cartella).</p>
  </div>`;
}

const CAMPI = [["fornitore", "Fornitore", "text"], ["piva", "Partita IVA", "text"], ["numero", "Numero", "text"], ["data", "Data della fattura", "date"],
  ["imponibile", "Imponibile", "euro"], ["iva", "IVA", "euro"], ["totale", "Totale", "euro"]];

function vistaCarico(ctx) {
  const valide = daAggiungere();
  const forse = carico.voci.filter((v) => v.forse && !v.diversa && !v.tolta).length;
  const daControllare = valide.filter((v) => v.dati.incerti?.length && !v.controllato);
  const divisione = teatro(ctx.arch).attivo;
  const senzaScelta = divisione ? valide.filter((v) => !v.quotaScelta) : [];
  const conta = (q) => valide.filter((v) => v.quotaScelta && v.quota === q).length;
  const fatture = (n) => (n === 1 ? "1 fattura" : `${n} fatture`);
  const riassunto = divisione && valide.length && !senzaScelta.length
    ? `<div class="nota">Riepilogo delle sue scelte: <b>${fatture(conta(0))}</b> della parrocchia (entrano in contabilità per intero),
        <b>${fatture(conta(100))}</b> del teatro o di altra gestione (non entrano in contabilità), <b>${fatture(conta(50))}</b> al 50% (entra metà).
        Se qualcosa non va, la cambi sopra prima di aggiungere.</div>` : "";
  return `<div class="card evidenza" id="carico"><h3>Fatture lette: controlli e aggiunga</h3>
    ${carico.inLettura ? `<div class="nota">Lettura in corso… (${carico.inLettura} ${carico.inLettura === 1 ? "file" : "file"} ancora da leggere)</div>` : ""}
    ${carico.voci.filter((v) => !v.tolta).map((v) => vistaVoce(v, divisione)).join("")}
    ${riassunto}
    <div class="riga-bottoni">
      <button class="btn" data-azione="aggiungi" ${!valide.length || daControllare.length || senzaScelta.length || carico.inLettura ? "disabled" : ""}>${divisione ? "Confermo le scelte: aggiungi" : "Aggiungi"} ${fatture(valide.length)} allo scadenzario</button>
      <button class="btn sec" data-azione="annullaCarico">Annulla</button></div>
    ${forse ? `<p class="hint">${forse === 1 ? "1 fattura sembra un doppione e non verrà aggiunta" : `${forse} fatture sembrano doppioni e non verranno aggiunte`}, a meno che lei dica che è diversa.</p>` : ""}
    ${daControllare.length ? `<p class="hint">Prima di aggiungere, controlli i campi in arancione e spunti "Ho controllato" (${fatture(daControllare.length)}).</p>` : ""}
    ${senzaScelta.length ? `<p class="hint">Prima di aggiungere, scelga di chi è ogni fattura: della parrocchia, del teatro / altra gestione o al 50% (${senzaScelta.length === 1 ? "manca per 1 fattura" : `mancano ${senzaScelta.length} fatture`}).</p>` : ""}
  </div>`;
}

function vistaVoce(v, divisione) {
  const titolo = `<div class="riga"><b class="spazio">${esc(v.nomeFile)}</b>
    ${v.errore ? `<span class="pill ko-pill">non letta</span>` : v.doppione ? `<span class="pill presto-pill">doppione</span>` : v.forse && !v.diversa ? `<span class="pill presto-pill">forse doppione</span>` : v.tipo === "pdf" ? `<span class="pill">PDF</span>` : `<span class="pill ok-pill">XML</span>`}
    <button class="btn sec piccolo" data-azione="togliVoce" data-v="${v.id}">Non caricare</button></div>`;
  if (v.errore) return `<div class="voce-carico">${titolo}<div class="errore">${esc(v.errore)}</div></div>`;
  if (v.doppione) return `<div class="voce-carico">${titolo}<div class="avviso">${esc(v.dati.fornitore)} n. ${esc(v.dati.numero)} del ${dataIt(v.dati.data)}: ${esc(v.doppione)}</div></div>`;
  const d = v.dati;
  if (v.forse && !v.diversa) return `<div class="voce-carico">${titolo}<div class="avviso"><b>${esc(d.fornitore || "Fornitore?")} n. ${esc(d.numero)} del ${dataIt(d.data)}, ${eur(d.totale)}${pillaServizio(d)}</b><br>${esc(v.forse)}
      Non verrà aggiunta.</div><div class="riga-bottoni stretta"><button class="btn sec piccolo" data-azione="nonDoppione" data-v="${v.id}">È una fattura diversa: aggiungila</button></div></div>`;
  const inc = new Set(d.incerti ?? []);
  const campo = ([k, nome, tipo]) => {
    const valore = tipo === "euro" ? (d[k] ? formatDecimale(d[k]) : "") : d[k] ?? "";
    return `<div><label class="campo" for="c-${v.id}-${k}">${nome}${inc.has(k) ? ` <span class="da-controllare">da controllare</span>` : ""}</label>
      <input id="c-${v.id}-${k}" type="${tipo === "date" ? "date" : "text"}" ${tipo === "euro" ? 'inputmode="decimal"' : ""} class="${inc.has(k) ? "incerto" : ""} ${tipo === "euro" ? "n" : ""}"
        value="${esc(valore)}" data-input="campoVoce" data-v="${v.id}" data-campo="${k}" data-tipo="${tipo}"></div>`;
  };
  const rate = d.rate.map((r, i) => `<div><label class="campo" for="s-${v.id}-${i}">Scadenza${d.rate.length > 1 ? ` rata ${r.n} (${eur(r.importo)})` : ""}${inc.has("scadenza") && !r.scadenza ? ` <span class="da-controllare">da scrivere</span>` : ""}</label>
      <input id="s-${v.id}-${i}" type="date" class="${inc.has("scadenza") ? "incerto" : ""}" value="${esc(r.scadenza)}" data-input="scadenzaVoce" data-v="${v.id}" data-i="${i}"></div>`).join("");
  const modalita = `<div><label class="campo" for="m-${v.id}">Modalità di pagamento${inc.has("modalita") ? ` <span class="da-controllare">da controllare</span>` : ""}</label>
      <select id="m-${v.id}" class="${inc.has("modalita") ? "incerto" : ""}" data-cambia="modalitaVoce" data-v="${v.id}">${opzioniModalita(d.rate[0].modalita)}</select></div>`;
  const campi = `<div class="griglia g4">${CAMPI.map(campo).join("")}${rate}${modalita}</div>`;
  const avvisi = (d.avvisi ?? []).map((a) => `<div class="avviso">${esc(a)}</div>`).join("");
  const servizio = d.servizio?.tipo ? `<div class="nota piccola">Riguarda: <b>${esc(etichettaServizio(d.servizio))}</b>. Divisio ricorda la voce${divisione ? " e la scelta parrocchia / 50% / altra gestione" : ""} per ogni servizio dello stesso fornitore
      (per esempio luce e gas della stessa società), e non scambia per doppioni due bollette di servizi o contatori diversi.</div>` : "";
  const diversa = v.forse && v.diversa ? `<div class="nota piccola">Lei ha indicato che non è un doppione: verrà aggiunta. <a href="#" data-azione="forseDoppione" data-v="${v.id}">Ripensamento: non aggiungerla</a></div>` : "";
  const tipoDoc = diversa + servizio + (d.notaCredito ? `<div class="nota">È una <b>nota di credito</b>: quando la segnerà come rimborsata, la spesa diminuirà.</div>` : "")
    + (d.modello ? `<div class="ok piccola">Fornitore già visto: Divisio ha cercato i dati dove li aveva trovati le altre volte.</div>` : "");
  const spunta = inc.size ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="controllato" data-v="${v.id}" ${v.controllato ? "checked" : ""}>
      Ho controllato i campi in arancione${v.tipo === "pdf" ? " guardando il PDF" : ""}</label>` : "";
  const pdf = v.urlPDF ? `<details ${inc.size ? "open" : ""} data-chiave="pdf-${v.id}"><summary>Guarda il PDF</summary>
      ${(v.immagini ?? []).map((src, i) => `<img class="pdf-vista" src="${src}" alt="Pagina ${i + 1} del PDF ${esc(v.nomeFile)}">`).join("")}
      <p class="hint"><a href="${v.urlPDF}" target="_blank" rel="noopener">Apri il PDF intero in un'altra scheda</a></p></details>` : "";
  const gestione = divisione ? `<div class="gestione-voce"><label class="campo">Di chi è questa fattura?</label>
      <div class="${v.quotaScelta ? "nota" : "avviso"} piccola">${esc(v.quotaMotivo || "")}${v.quotaRicordata ? " La confermi o la cambi." : ""}</div>
      ${pulsantiGestione(v.quotaScelta ? v.quota : null, `data-azione="voceGestione" data-v="${v.id}"`)}
      ${v.quotaScelta ? spiegaGestione(v.quota) : ""}</div>` : "";
  return `<div class="voce-carico">${titolo}${tipoDoc}${avvisi}${campi}${gestione}${spunta}${pdf}</div>`;
}

function tabellaScadenze(el, ctx) {
  if (!el.length) return `<p class="hint">${filtro === "dapagare" ? "Nessuna fattura da pagare." : "Nessuna fattura."}</p>`;
  const t = teatro(ctx.arch);
  return `<div class="scorri"><table class="scadenze">
    <tr><th>Scadenza</th><th>Fornitore e fattura</th><th class="n">Importo</th><th>Stato</th></tr>
    ${el.map(({ fattura: f, rata, giorni, urgenza }) => {
      const pagata = rata.stato === PAGATA;
      const altra = diAltraGestione(ctx.arch, f);
      const stato = altra ? `<span class="pill">fuori contabilità</span>` : pagata ? `<span class="pill ok-pill">${f.notaCredito ? "rimborsata" : "pagata"} il ${dataIt(rata.pagataIl)}</span>${rata.fuori ? ` <span class="pill">fuori contabilità</span>` : ""}`
        : urgenza === "scaduta" ? `<span class="pill ko-pill">scaduta ${giorniTesto(giorni)}</span>`
        : urgenza === "presto" ? `<span class="pill presto-pill">scade ${giorniTesto(giorni)}</span>`
        : urgenza === "senza-data" ? `<span class="pill presto-pill">scadenza da indicare</span>` : `<span class="pill">da pagare</span>`;
      const quota = pagata ? rata.quotaTeatro : f.quotaTeatro;
      return `<tr class="${urgenza === "scaduta" && !altra ? "riga-scaduta" : ""}"><td class="nowrap">${rata.scadenza ? dataIt(rata.scadenza) : "—"}</td>
        <td><b>${esc(f.fornitore || "Fornitore?")}</b>${pillaServizio(f)}${t.attivo ? pillaGestione(quota) : ""}<br>
          <span class="hint">${f.notaCredito ? "Nota di credito" : TIPI_DOCUMENTO[f.tipoDoc] && f.tipoDoc !== "TD01" ? TIPI_DOCUMENTO[f.tipoDoc] : "Fattura"} n. ${esc(f.numero)} del ${dataIt(f.data)}${f.rate.length > 1 ? ` · rata ${rata.n} di ${f.rate.length}` : ""}</span>
          ${dettagli(f, rata, ctx)}</td>
        <td class="n ${f.notaCredito ? "pos" : ""}">${f.notaCredito ? "−" : ""}${eur(rata.importo)}</td>
        <td>${stato}${pagata || altra ? "" : `<div><button class="btn piccolo" data-azione="apriPagamento" data-id="${esc(f.id)}" data-n="${rata.n}">${f.notaCredito ? "Segna come rimborsata" : "Segna come pagata"}</button></div>`}</td></tr>`;
    }).join("")}</table></div>`;
}

function dettagli(f, rata, ctx) {
  const m = ctx.arch.movimento(idMovimento(f, rata.n));
  const nessunaPagata = f.rate.every((r) => r.stato !== PAGATA);
  return `<details data-chiave="fattura-${esc(f.id)}-${rata.n}"><summary>Dettagli</summary>
    <table class="righe"><tr><td>Imponibile</td><td class="n">${eur(f.imponibile)}</td></tr><tr><td>IVA</td><td class="n">${eur(f.iva)}</td></tr>
      <tr class="tot"><td>Totale</td><td class="n">${eur(f.totale)}</td></tr></table>
    <p class="hint">Partita IVA ${esc(f.piva || "—")}${f.servizio?.tipo ? ` · servizio: ${esc(etichettaServizio(f.servizio))}` : ""} · pagamento: ${esc(testoModalita(rata))}${rata.iban ? ` · IBAN ${esc(rata.iban)}` : ""}<br>
      ${f.origine === "pdf" ? "Letta da PDF" : "Letta da XML"}${f.nomeFile ? ` (${esc(f.nomeFile)})` : ""} · caricata da ${esc(f.autore ?? "—")}</p>
    ${f.descrizione ? `<p class="hint">${esc(f.descrizione)}</p>` : ""}
    ${f.note ? `<div class="nota">${esc(f.note)}</div>` : ""}
    ${rata.stato === PAGATA
      ? `${m ? `<p class="hint">Registrazione in contabilità (${dataIt(m.data)}):</p>${tabellaRighe(m.righe, ctx.arch)}` : rata.fuori ? `<p class="hint">Pagata fuori dai conti della parrocchia: nessuna registrazione.</p>` : ""}
         <div class="riga-bottoni stretta"><button class="btn pericolo piccolo" data-azione="tornaDaPagare" data-id="${esc(f.id)}" data-n="${rata.n}">Torna da pagare</button></div>`
      : `<div class="riga stretta"><label class="campo" for="sc-${esc(f.id)}-${rata.n}">Scadenza</label>
           <input id="sc-${esc(f.id)}-${rata.n}" type="date" value="${esc(rata.scadenza)}" style="max-width:200px" data-cambia="scadenza" data-id="${esc(f.id)}" data-n="${rata.n}"></div>
         ${nessunaPagata && teatro(ctx.arch).attivo ? `<label class="campo">Di chi è questa fattura?</label>
           ${pulsantiGestione(gestioneValida(f.quotaTeatro) ? f.quotaTeatro : null, `data-azione="cambiaGestione" data-id="${esc(f.id)}"`, true)}
           ${gestioneValida(f.quotaTeatro) ? spiegaGestione(f.quotaTeatro) : `<p class="hint">Non ancora scelto: Divisio lo chiederà quando la segnerà pagata.</p>`}` : ""}
         ${nessunaPagata ? `<div class="riga-bottoni stretta"><button class="btn pericolo piccolo" data-azione="togliFattura" data-id="${esc(f.id)}">Togli dallo scadenzario</button></div>` : ""}`}
  </details>`;
}

/* ---------- pagamento ---------- */
function apriPagamento(ctx, id, n) {
  const f = ctx.arch.fattura(id);
  const rata = f?.rate.find((r) => r.n === n);
  if (!rata) return;
  const cs = casse(ctx.arch);
  const mod = rata.modalita;
  const cassa = modalitaInContanti(mod) ? "A02-01-01" : (cs.find((c) => c.codice !== "A02-01-01") ?? cs[0])?.codice ?? "";
  const pagate = ctx.arch.fatture().filter((x) => x.id !== f.id && chiaveFornitore(x) === chiaveFornitore(f) && !diversoServizio(x, f) && x.rate.some((r) => r.stato === PAGATA && r.voce));
  const proposta = proponiVoce(f, { ricordo: ricordo(ctx.arch, f), pagate, contiAttivi: new Set(ctx.arch.contiAttivi().map((c) => c.codice)) });
  const t = teatro(ctx.arch);
  const pt = !t.attivo ? null : gestioneValida(f.quotaTeatro)
    ? { quota: f.quotaTeatro, motivo: `Scelta quando ha caricato la fattura: ${nomeGestione(f.quotaTeatro).toLowerCase()}. La confermi o la cambi.`, chiedi: false }
    : propostaTeatro(f, { ricordo: ricordo(ctx.arch, f), parole: t.parole });
  const oggi = oggiISO();
  pag = { id, n, data: oggi, modalita: mod, cassa, voce: proposta.voce, cerca: "", proposta, pt,
    quota: pt ? pt.quota ?? 0 : 0, quotaScelta: pt ? !pt.chiedi : true, ricorda: true, errore: "" };
}

/** Apre "Segna come pagata" per la prossima fattura con la scritta PAGATA, con la data e la modalità lette dal PDF. */
function prossimaDellaCoda(ctx) {
  while (coda.length) {
    const x = coda.shift();
    const f = ctx.arch.fattura(x.id);
    if (!f || f.rate[0].stato === PAGATA) continue;
    apriPagamento(ctx, x.id, 1);
    pag.data = x.data;
    if (x.modalita) pag.modalita = x.modalita;
    pag.dalPDF = { data: x.data, rimaste: coda.length };
    pag.scorri = true;
    return;
  }
}

const quotaPag = () => (Number(pag.quota) || 0);

function candidatoPagamento(ctx) {
  const f = ctx.arch.fattura(pag.id);
  const t = teatro(ctx.arch);
  return { f, pagamento: { data: pag.data, modalita: pag.modalita, cassa: pag.cassa, voce: pag.voce, quotaTeatro: t.attivo ? quotaPag() : 0, fuori: t.attivo && quotaPag() === 100 } };
}

function vistaPagamento(ctx) {
  const { f, pagamento } = candidatoPagamento(ctx);
  if (!f) { pag = null; return ""; }
  const rata = f.rate.find((r) => r.n === pag.n);
  const t = teatro(ctx.arch);
  const nc = f.notaCredito;
  const { parrocchia: parteParrocchia } = dividi(rata.importo, pagamento.quotaTeatro);
  const serveVoce = !pagamento.fuori && parteParrocchia > 0;
  let anteprima = "";
  if (pagamento.fuori && pag.quotaScelta) anteprima = `<div class="nota">È del teatro o di un'altra gestione: la fattura sarà segnata pagata, ma <b>in contabilità non verrà registrato nulla</b>.</div>`;
  else if (pag.cassa && (!serveVoce || pag.voce) && pag.quotaScelta) {
    const m = { data: pag.data, descr: descrizione(f, rata), tipo: nc ? "entrata" : "uscita", righe: righePagamento(f, rata, pagamento) };
    const err = verificaMovimento(m, { conti: ctx.arch.conti });
    anteprima = `<p class="hint">Ecco cosa verrà registrato in contabilità:</p>${tabellaRighe(m.righe, ctx.arch)}${err.length ? `<div class="errore">${esc(err[0])}</div>` : ""}`;
  }
  const pronto = pag.data && pag.quotaScelta && (pagamento.fuori || (pag.cassa && (!serveVoce || pag.voce)));
  const tipiVoce = ["U", "PG", "A", "P"];
  const escludiVoce = (c) => isCassaBanca(c) || tipoDi(c) === "PAT" || tipoDi(c) === "E";
  const p = pag.proposta;
  return `<div class="card evidenza" id="pagamento">
    <h3>${nc ? "Segna come rimborsata" : "Segna come pagata"}: ${esc(descrizione(f, rata))}</h3>
    <p class="lead">Importo: <b>${eur(rata.importo)}</b>${rata.scadenza ? ` · scadenza ${dataIt(rata.scadenza)}` : ""}</p>
    ${pag.dalPDF ? `<div class="nota">Sul PDF c'è scritto che è stata pagata il <b>${dataIt(pag.dalPDF.data)}</b>: controlli i dati qui sotto e confermi.
      Se non è stata pagata, prema «Annulla»: resterà da pagare.${pag.dalPDF.rimaste ? ` Dopo, Divisio proporrà ${pag.dalPDF.rimaste === 1 ? "l'altra fattura segnata" : `le altre ${pag.dalPDF.rimaste} fatture segnate`} PAGATA
      (<a href="#" data-azione="saltaCoda">non ora</a>).` : ""}</div>` : ""}
    <div class="griglia g2">
      <div><label class="campo" for="p-data">${nc ? "Data del rimborso" : "Data del pagamento"}</label><input id="p-data" type="date" value="${esc(pag.data)}" data-cambia="pagData"></div>
      <div><label class="campo" for="p-mod">Come è stata pagata</label><select id="p-mod" data-cambia="pagModalita">${opzioniModalita(pag.modalita)}</select></div>
    </div>
    ${t.attivo ? `<label class="campo">Di chi è questa fattura?</label>
      ${pag.pt ? `<div class="${pag.pt.chiedi && !pag.quotaScelta ? "avviso" : "nota"}">${esc(pag.pt.motivo)}</div>` : ""}
      ${pulsantiGestione(pag.quotaScelta ? quotaPag() : null, `data-azione="pagQuota"`)}
      ${pag.quotaScelta && quotaPag() === 50 ? `<p class="hint">Al 50%: in contabilità entra <b>${eur(parteParrocchia)}</b>, metà del totale di ${eur(rata.importo)} (IVA compresa). L'altra metà non viene registrata.</p>`
        : pag.quotaScelta ? spiegaGestione(quotaPag()) : ""}` : ""}
    ${pagamento.fuori ? "" : `<label class="campo">${nc ? "Dove sono arrivati i soldi" : "Da dove sono usciti i soldi"}</label>
      <div class="scelta">${casse(ctx.arch).map((c) => `<button type="button" class="${c.codice === pag.cassa ? "on sposta" : ""}" data-azione="pagCassa" data-v="${c.codice}">${esc(c.nome)}</button>`).join("")}</div>`}
    ${serveVoce ? `<label class="campo" for="p-voce">Voce di spesa</label>
      ${p.livello !== "nessuno" ? `<div class="ok">Proposta: <b>${esc(ctx.arch.nomeConto(p.voce))}</b> <span class="codice">${p.voce}</span> – ${esc(p.motivo)} La confermi o ne scelga un'altra.</div>`
        : `<div class="avviso">${esc(p.motivo)}</div>`}
      <div class="griglia voce"><input type="search" placeholder="Cerca la voce…" value="${esc(pag.cerca)}" data-input="pagCerca" aria-label="Cerca la voce">
        <select id="p-voce" data-cambia="pagVoce">${opzioniConti(ctx.arch.contiAttivi(), { tipi: tipiVoce, escludi: escludiVoce, cerca: pag.cerca, selezionato: pag.voce })}</select></div>` : ""}
    <div id="p-anteprima">${anteprima}</div>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="pagRicorda" ${pag.ricorda ? "checked" : ""}>
      Ricorda questa scelta per ${esc(f.fornitore || "questo fornitore")}: la prossima volta Divisio la proporrà già</label>
    ${pag.errore ? `<div class="errore">${esc(pag.errore)}</div>` : ""}
    <div class="riga-bottoni"><button class="btn" data-azione="confermaPagamento" ${pronto ? "" : "disabled"}>${pagamento.fuori ? "Conferma: segna pagata (senza registrare)" : nc ? "Conferma: segna rimborsata e registra" : "Conferma: segna pagata e registra"}</button>
      <button class="btn sec" data-azione="annullaPagamento">Annulla</button></div>
  </div>`;
}

function vistaFornitori(arch) {
  const ricordati = arch.impostazioniCon("fornitore:");
  const modelli = arch.impostazioniCon("modello-pdf:");
  if (!ricordati.length && !modelli.length) return "";
  const t = teatro(arch);
  const pdf = modelli.length ? `<p class="hint" style="margin-top:16px">Fatture PDF: Divisio ricorda dove questi fornitori scrivono i loro dati
      (nome, partita IVA, numero, date, importi, come corretti da lei) e li riconosce dalla partita IVA, dall'IBAN, dall'e-mail o dal sito.</p>
    <table>${modelli.sort((a, b) => String(a.valore.nome).localeCompare(String(b.valore.nome))).map((i) => `<tr><td>${esc(i.valore.nome)}</td>
      <td class="hint">${i.valore.piva ? `P. IVA ${esc(i.valore.piva)} · ` : ""}${i.valore.volte === 1 ? "1 fattura" : `${i.valore.volte} fatture`}</td>
      <td class="n"><button class="btn sec piccolo" data-azione="dimentica" data-chiave="${esc(i.chiave)}">Dimentica</button></td></tr>`).join("")}</table>` : "";
  return `<div class="card"><details data-chiave="fornitori"><summary>Fornitori ricordati (${Math.max(ricordati.length, modelli.length)})</summary>
    ${ricordati.length ? `<p class="hint">Per questi fornitori Divisio propone già la voce${t.attivo ? " e la scelta parrocchia / 50% / altra gestione" : ""} dell'ultima volta.</p>` : ""}
    <table>${ricordati.sort((a, b) => String(a.valore.nome).localeCompare(String(b.valore.nome))).map((i) => `<tr><td>${esc(i.valore.nome)}</td>
      <td>${Object.keys(i.valore.servizi ?? {}).length ? Object.values(i.valore.servizi).map((x) => `<div><span class="hint">${esc(x.nome)}:</span> ${sceltaRicordata(x, arch, t)}</div>`).join("") : sceltaRicordata(i.valore, arch, t)}</td>
      <td class="n"><button class="btn sec piccolo" data-azione="dimentica" data-chiave="${esc(i.chiave)}">Dimentica</button></td></tr>`).join("")}</table>
    ${pdf}
  </details></div>`;
}

/** "Azzera lo scadenzario": tutte le fatture spariscono; le uscite di quelle pagate si tolgono o restano, a scelta. */
function vistaAzzera(ctx) {
  const tutte = ctx.arch.fatture();
  if (!azzera) {
    return `<div class="card solo-schermo"><details data-chiave="azzera-scadenzario"><summary>Azzera lo scadenzario</summary>
      <p>Toglie da Divisio <b>tutte le fatture</b> dello scadenzario (${tutte.length}), per ricaricarle da capo. Movimenti, conti e impostazioni restano.</p>
      <button class="btn pericolo" data-azione="apriAzzera" ${tutte.length ? "" : "disabled"}>Azzera lo scadenzario…</button></details></div>`;
  }
  const s = azzeraScadenzario({ movimenti: ctx.arch.movimenti(), fatture: tutte }, { ancheUscite: azzera.ancheUscite });
  const fatture = (n) => (n === 1 ? "1 fattura" : `${n} fatture`);
  return `<div class="card evidenza solo-schermo" id="azzera-scadenzario"><h3>Azzera lo scadenzario</h3>
    <div class="avviso">Verranno tolte <b>${fatture(s.conta.fatture)}</b>${s.conta.pagate ? `, di cui ${s.conta.pagate === 1 ? "1 pagata" : `${s.conta.pagate} pagate`}` : ""}. Se Divisio è condiviso, spariranno anche dagli altri computer.</div>
    ${s.conta.uscite ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="azzeraUscite" ${azzera.ancheUscite ? "checked" : ""}>
        Togli dalla contabilità anche le uscite delle fatture pagate (${s.conta.uscite === 1 ? "1 movimento" : `${s.conta.uscite} movimenti`})</label>
      <p class="hint">${azzera.ancheUscite ? "Le uscite spariranno anche dai Movimenti." : "Le uscite resteranno nei Movimenti come movimenti normali, senza il collegamento alla fattura."}</p>` : ""}
    <p>Prima di azzerare, Divisio scarica una <b>copia di sicurezza</b> (cartella Download). Si può anche annullare subito con «↶ Annulla».</p>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="azzeraCapito" ${azzera.capito ? "checked" : ""}> Ho capito: le fatture verranno tolte da Divisio</label>
    <div class="riga-bottoni"><button class="btn pericolo" data-azione="confermaAzzera" ${azzera.capito ? "" : "disabled"}>Azzera lo scadenzario</button>
      <button class="btn sec" data-azione="chiudiAzzera">Annulla</button></div>
  </div>`;
}

const sceltaRicordata = (x, arch, t) => `${x.voce ? `${esc(arch.nomeConto(x.voce))} <span class="codice">${x.voce}</span>` : t.attivo && gestioneValida(x.quotaTeatro) ? esc(nomeGestione(x.quotaTeatro)) : "—"}${t.attivo ? pillaGestione(x.quotaTeatro) : ""}`;

/* ---------- trascinamento dei file ---------- */
export function dopo(ctx) {
  const zona = $("#zona-file");
  if (zona) {
    const su = (ev) => { ev.preventDefault(); zona.classList.add("sopra"); };
    zona.addEventListener("dragenter", su);
    zona.addEventListener("dragover", su);
    zona.addEventListener("dragleave", (ev) => { if (!zona.contains(ev.relatedTarget)) zona.classList.remove("sopra"); });
    zona.addEventListener("drop", (ev) => { ev.preventDefault(); zona.classList.remove("sopra"); carica(ev.dataTransfer.files, ctx).catch((e) => toast("Errore: " + e.message)); });
  }
  if (pag?.scorri) { pag.scorri = false; $("#pagamento")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

/* ---------- eventi ---------- */
const voce = (el) => carico.voci.find((v) => v.id === el.dataset.v);

export const input = {
  campoVoce(el) {
    const v = voce(el), k = el.dataset.campo;
    if (el.dataset.tipo === "euro") { const c = parseEuro(el.value); v.dati[k] = Number.isNaN(c) ? NaN : c; if (k === "totale" && v.dati.rate.length === 1) v.dati.rate[0].importo = (Number.isNaN(c) ? 0 : c) - (v.dati.ritenuta || 0); }
    else v.dati[k] = el.value.trim();
  },
  scadenzaVoce(el) { voce(el).dati.rate[Number(el.dataset.i)].scadenza = el.value; },
  pagCerca(el, ev, ctx) { pag.cerca = el.value; const s = $("#p-voce"); if (s) s.innerHTML = opzioniConti(ctx.arch.contiAttivi(), { tipi: ["U", "PG", "A", "P"], escludi: (c) => isCassaBanca(c) || tipoDi(c) === "PAT" || tipoDi(c) === "E", cerca: pag.cerca, selezionato: pag.voce }); },
};

export const cambia = {
  file(el, ev, ctx) { const files = [...el.files]; el.value = ""; return carica(files, ctx); },
  modalitaVoce(el) { for (const r of voce(el).dati.rate) r.modalita = el.value; },
  controllato(el, ev, ctx) { voce(el).controllato = el.checked; ctx.aggiorna(); },
  async scadenza(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    if (!f) return;
    await ctx.arch.salvaInsieme({ fatture: [{ ...f, rate: f.rate.map((r) => (r.n === Number(el.dataset.n) ? { ...r, scadenza: el.value } : r)) }], etichetta: `Scadenza della fattura ${f.fornitore} n. ${f.numero}` });
    toast("Scadenza salvata ✓");
    ctx.aggiorna();
  },
  pagData(el, ev, ctx) { pag.data = el.value; ctx.aggiorna(); },
  pagModalita(el, ev, ctx) { pag.modalita = el.value; if (modalitaInContanti(el.value) && ctx.arch.conti.has("A02-01-01")) pag.cassa = "A02-01-01"; ctx.aggiorna(); },
  pagVoce(el, ev, ctx) { pag.voce = el.value; ctx.aggiorna(); },
  pagRicorda(el) { pag.ricorda = el.checked; },
  azzeraUscite(el, ev, ctx) { azzera.ancheUscite = el.checked; ctx.aggiorna(); },
  azzeraCapito(el, ev, ctx) { azzera.capito = el.checked; ctx.aggiorna(); },
};

export const azioni = {
  apriAzzera(el, ev, ctx) { azzera = { ancheUscite: true, capito: false }; ctx.aggiorna(); document.getElementById("azzera-scadenzario")?.scrollIntoView({ block: "start" }); },
  chiudiAzzera(el, ev, ctx) { azzera = null; ctx.aggiorna(); },
  async confermaAzzera(el, ev, ctx) {
    if (!azzera?.capito) return;
    const s = azzeraScadenzario({ movimenti: ctx.arch.movimenti(), fatture: ctx.arch.fatture() }, { ancheUscite: azzera.ancheUscite });
    el.disabled = true;
    salvaCopia(ctx, "prima-di-azzerare-lo-scadenzario");
    await ctx.arch.salvaInsieme({ fatture: s.fatture, movimenti: s.movimenti, movimentiDaEliminare: s.movimentiDaEliminare, etichetta: "Azzeramento dello scadenzario" });
    azzera = null; pag = null; coda = [];
    toast(`Scadenzario azzerato (${s.conta.fatture === 1 ? "1 fattura" : `${s.conta.fatture} fatture`}) ✓ Copia di sicurezza nella cartella Download`);
    ctx.aggiorna();
  },
  filtro(el, ev, ctx) { filtro = el.dataset.v; locale.scrivi("fatture-filtro", filtro); ctx.aggiorna(); },
  nonDoppione(el, ev, ctx) { voce(el).diversa = true; ctx.aggiorna(); },
  forseDoppione(el, ev, ctx) { voce(el).diversa = false; ctx.aggiorna(); },
  togliVoce(el, ev, ctx) { const v = voce(el); v.tolta = true; if (v.urlPDF) URL.revokeObjectURL(v.urlPDF); segnaDoppioni(ctx.arch); if (!carico.voci.some((x) => !x.tolta)) carico = null; ctx.aggiorna(); },
  annullaCarico(el, ev, ctx) { for (const v of carico?.voci ?? []) if (v.urlPDF) URL.revokeObjectURL(v.urlPDF); carico = null; ctx.aggiorna(); },
  async aggiungi(el, ev, ctx) {
    // i dati possono essere stati corretti a mano: si ricontrollano i doppioni
    const primaForse = carico.voci.filter((v) => v.forse && !v.diversa).length, primaDoppi = carico.voci.filter((v) => v.doppione).length;
    segnaDoppioni(ctx.arch);
    if (carico.voci.filter((v) => v.forse && !v.diversa).length > primaForse || carico.voci.filter((v) => v.doppione).length > primaDoppi) {
      toast("Con i dati corretti una fattura sembra un doppione: controlli prima di aggiungere");
      ctx.aggiorna();
      return;
    }
    const valide = daAggiungere();
    for (const v of valide) {
      const d = v.dati;
      const nome = `${d.fornitore || v.nomeFile}`;
      if (!d.fornitore || !d.numero || !d.data) { toast(`${nome}: mancano fornitore, numero o data`); return; }
      if (![d.imponibile, d.iva, d.totale].every((x) => Number.isInteger(x)) || d.totale <= 0) { toast(`${nome}: controlli gli importi`); return; }
      if (d.rate.some((r) => !(r.importo > 0))) { toast(`${nome}: l'importo da pagare deve essere maggiore di zero`); return; }
    }
    const divisione = teatro(ctx.arch).attivo;
    if (divisione && valide.some((v) => !v.quotaScelta)) { toast("Scelga di chi è ogni fattura"); return; }
    el.disabled = true;
    const fatture = valide.map((v) => {
      const { impronte, pagata, modello, ...dati } = v.dati;
      const f = nuovaFattura({ ...dati, avvisi: (dati.avvisi ?? []).filter((a) => !/scansione|scriva lei|controlli|proporrà/i.test(a)) }, { origine: v.tipo === "pdf" ? "pdf" : "xml", nomeFile: v.nomeFile });
      return divisione ? { ...f, quotaTeatro: v.quota } : f;
    });
    // la scelta parrocchia / 50% / altra gestione viene ricordata per ogni fornitore
    const ricordi = new Map();
    if (divisione) for (const f of fatture) {
      const prima = ricordi.get(chiaveFornitore(f)) ?? ricordoSalvato(ctx.arch, f);
      ricordi.set(chiaveFornitore(f), ricordoAggiornato(prima, f, { quotaTeatro: f.quotaTeatro }));
    }
    // per i PDF: Divisio impara dove stanno i dati di quel fornitore (con le correzioni fatte qui), per leggerli da solo la volta dopo
    const modelli = new Map();
    valide.forEach((v, i) => {
      const f = fatture[i];
      if (v.tipo !== "pdf" || !v.righe || !f.fornitore) return;
      const chiave = chiaveModello(f);
      modelli.set(chiave, imparaModello(v.righe, f, { precedente: modelli.get(chiave) ?? ctx.arch.impostazione(chiave), ...opzioniPDF(ctx.arch) }));
    });
    const salvate = await ctx.arch.salvaInsieme({ fatture, impostazioni: [...ricordi, ...modelli].map(([chiave, valore]) => ({ chiave, valore })) });
    // fatture con la scritta "PAGATA" sul PDF: si propone subito di segnarle pagate (sempre con conferma)
    coda = valide.map((v, i) => ({ v, f: salvate.fatture[i] })).filter(({ v, f }) => v.dati.pagata?.data && f.rate.length === 1)
      .map(({ v, f }) => ({ id: f.id, data: v.dati.pagata.data, modalita: v.dati.pagata.modalita }));
    for (const v of carico.voci) if (v.urlPDF) URL.revokeObjectURL(v.urlPDF);
    const saltate = carico.voci.filter((v) => (v.doppione || (v.forse && !v.diversa)) && !v.tolta).length;
    carico = null;
    filtro = "dapagare";
    const altre = fatture.filter((f) => divisione && f.quotaTeatro === 100).length;
    toast(`${fatture.length === 1 ? "1 fattura aggiunta" : `${fatture.length} fatture aggiunte`} ✓${altre ? ` (${altre} del teatro o di altra gestione: fuori contabilità)` : ""}${saltate ? ` (${saltate} ${saltate === 1 ? "doppione saltato" : "doppioni saltati"})` : ""}`);
    prossimaDellaCoda(ctx);
    ctx.aggiorna();
  },
  apriPagamento(el, ev, ctx) { apriPagamento(ctx, el.dataset.id, Number(el.dataset.n)); pag.scorri = true; ctx.aggiorna(); },
  annullaPagamento(el, ev, ctx) { pag = null; prossimaDellaCoda(ctx); ctx.aggiorna(); },
  saltaCoda(el, ev, ctx) { coda = []; pag = null; ctx.aggiorna(); },
  pagCassa(el, ev, ctx) { pag.cassa = el.dataset.v; ctx.aggiorna(); },
  pagQuota(el, ev, ctx) { pag.quotaScelta = true; pag.quota = Number(el.dataset.q); ctx.aggiorna(); },
  voceGestione(el, ev, ctx) {
    const v = voce(el);
    Object.assign(v, { quota: Number(el.dataset.q), quotaScelta: true, quotaRicordata: false, quotaMotivo: "Scelta da lei." });
    ctx.aggiorna();
  },
  async cambiaGestione(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    if (!f) return;
    const q = Number(el.dataset.q);
    await ctx.arch.salvaInsieme({ fatture: [{ ...f, quotaTeatro: q }], impostazioni: [daRicordare(ctx.arch, f, { quotaTeatro: q })], etichetta: `Fattura ${f.fornitore} n. ${f.numero}: ${nomeGestione(q).toLowerCase()}` });
    toast(`${nomeGestione(q)} ✓${q === 100 ? " (non entra in contabilità)" : ""}`);
    ctx.aggiorna();
  },
  async confermaPagamento(el, ev, ctx) {
    const { f, pagamento } = candidatoPagamento(ctx);
    let esito;
    try { esito = segnaPagata(f, pag.n, pagamento); } catch (e) { pag.errore = e.message; ctx.aggiorna(); return; }
    if (esito.movimento) {
      const err = verificaMovimento(esito.movimento, { conti: ctx.arch.conti });
      if (err.length) { pag.errore = err[0]; ctx.aggiorna(); return; }
    }
    el.disabled = true;
    const divisione = teatro(ctx.arch).attivo;
    const impostazioni = pag.ricorda ? [daRicordare(ctx.arch, f, { voce: pagamento.voce || ricordo(ctx.arch, f)?.voce || undefined, ...(divisione ? { quotaTeatro: pagamento.quotaTeatro } : {}) })] : [];
    await ctx.arch.salvaInsieme({ fatture: [divisione ? { ...esito.fattura, quotaTeatro: pagamento.quotaTeatro } : esito.fattura], movimenti: esito.movimento ? [esito.movimento] : [], impostazioni });
    const anno = pagamento.data.slice(0, 4);
    toast(esito.movimento ? `Pagata e registrata in contabilità ✓${anno !== String(ctx.anno) ? ` (nell'anno ${anno})` : ""}` : "Segnata come pagata ✓ (nessuna registrazione)");
    pag = null;
    prossimaDellaCoda(ctx);
    ctx.aggiorna();
  },
  async tornaDaPagare(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id), n = Number(el.dataset.n);
    const rata = f?.rate.find((r) => r.n === n);
    if (!rata) return;
    const m = ctx.arch.movimento(idMovimento(f, n));
    const testo = m ? `La fattura tornerà "da pagare" e la sua registrazione del ${dataIt(m.data)} (${eur(rata.importo)}) sarà tolta dalla contabilità.\n\nSe l'aveva già passata a UNIO, la pagina "Per UNIO" preparerà da sola la correzione.`
      : `La fattura tornerà "da pagare".`;
    if (!confirm(testo + "\n\nProcedere?")) return;
    const { fattura, movimentoDaEliminare } = tornaDaPagare(f, n);
    await ctx.arch.salvaInsieme({ fatture: [fattura], movimentiDaEliminare: movimentoDaEliminare || m ? [movimentoDaEliminare || m.id] : [], etichetta: `Fattura ${f.fornitore} n. ${f.numero} di nuovo da pagare` });
    toast(m ? "Fattura di nuovo da pagare; registrazione tolta ✓" : "Fattura di nuovo da pagare ✓");
    ctx.aggiorna();
  },
  async togliFattura(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    if (!f || !confirm(`Togliere dallo scadenzario la fattura di ${f.fornitore} n. ${f.numero}?\n\nNon è stata pagata, quindi in contabilità non cambia nulla.`)) return;
    await ctx.arch.salvaInsieme({ fatture: [{ ...f, eliminato: true }] });
    toast("Fattura tolta dallo scadenzario");
    ctx.aggiorna();
  },
  async riregistra(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id), n = Number(el.dataset.n);
    const rata = f?.rate.find((r) => r.n === n);
    if (!rata) return;
    const base = tornaDaPagare(f, n).fattura;
    const { fattura, movimento } = segnaPagata(base, n, { data: rata.pagataIl, modalita: rata.modalitaPagamento, cassa: rata.cassa, voce: rata.voce, quotaTeatro: rata.quotaTeatro, contoTeatro: rata.contoTeatro });
    const err = movimento ? verificaMovimento(movimento, { conti: ctx.arch.conti }) : [];
    if (err.length) { toast(err[0]); return; }
    await ctx.arch.salvaInsieme({ fatture: [fattura], movimenti: movimento ? [movimento] : [], etichetta: `Fattura ${f.fornitore} n. ${f.numero} registrata di nuovo` });
    toast("Registrata di nuovo ✓");
    ctx.aggiorna();
  },
  async rimettiDaPagare(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    if (!f) return;
    await ctx.arch.salvaInsieme({ fatture: [tornaDaPagare(f, Number(el.dataset.n)).fattura], etichetta: `Fattura ${f.fornitore} n. ${f.numero} di nuovo da pagare` });
    toast("Fattura di nuovo da pagare ✓");
    ctx.aggiorna();
  },
  async togliUscita(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    const id = idMovimento(f, Number(el.dataset.n));
    const m = ctx.arch.movimento(id);
    if (!m || !confirm(`Togliere dalla contabilità il movimento «${m.descr}» del ${dataIt(m.data)}?`)) return;
    await ctx.arch.salvaInsieme({ movimentiDaEliminare: [id], etichetta: `Uscita della fattura ${f.fornitore} n. ${f.numero} tolta dalla contabilità` });
    toast("Uscita tolta dalla contabilità");
    ctx.aggiorna();
  },
  async dimentica(el, ev, ctx) {
    await ctx.arch.salvaImpostazione(el.dataset.chiave, null, { etichetta: "Fornitore dimenticato" });
    toast("Fornitore dimenticato");
    ctx.aggiorna();
  },
};
