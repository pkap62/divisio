// Pagina "Fatture": caricamento delle fatture ricevute (XML, P7M, PDF), scadenzario, pagamento.
// Regola: in contabilità entra solo una fattura PAGATA, e solo dopo la conferma dell'utente.

import { leggiFatturaPA, xmlDaP7m, testoDaByte, trovaDoppione, stessaFattura, chiaveFornitore, MODALITA, nomeModalita, modalitaInContanti, TIPI_DOCUMENTO } from "../dominio/fatture.js";
import { leggiFatturaDaTesto } from "../dominio/fatturePDF.js";
import { nuovaFattura, segnaPagata, tornaDaPagare, scadenze, riepilogo, coerenza, righePagamento, dividi, descrizione, idMovimento, testoModalita, PAGATA, CONTO_TEATRO } from "../dominio/scadenzario.js";
import { proponiVoce, propostaTeatro } from "../dominio/suggerimenti.js";
import { verificaMovimento } from "../dominio/scritture.js";
import { parseEuro, formatDecimale } from "../dominio/importi.js";
import { isCassaBanca, casseInOrdine, tipoDi } from "../dominio/piano.js";
import { esc, eur, dataIt, oggiISO, opzioniConti, toast, locale, $ } from "./util.js";
import { tabellaRighe } from "./elenco.js";

let carico = null;   // { voci:[…], inLettura } — fatture lette e non ancora aggiunte
let pag = null;      // pagamento in compilazione
let filtro = locale.leggi("fatture-filtro", "dapagare");

/* ---------- impostazioni che servono qui ---------- */
export const teatro = (arch) => ({ attivo: false, conto: CONTO_TEATRO, parole: [], ...arch.impostazione("teatro", {}) });
const casse = (arch) => casseInOrdine(arch.contiAttivi());
const ricordo = (arch, f) => arch.impostazione(chiaveFornitore(f));
const parrocchia = (arch) => arch.impostazione("parrocchia", {});

/** Problemi tra scadenzario e contabilità (usato anche dalla pagina Inizio). */
export function problemi(arch) {
  return coerenza(arch.fatture(), (id) => arch.movimento(id), arch.movimenti().filter((m) => m.fattura));
}
export const elencoScadenze = (arch) => scadenze(arch.fatture(), oggiISO());

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
      const { testo, immagini } = await leggiPDF(await file.arrayBuffer());
      const noti = new Map(arch.fatture().filter((f) => f.piva).map((f) => [f.piva, f.fornitore]));
      const par = parrocchia(arch);
      const dati = leggiFatturaDaTesto(testo, { escludiPiva: [par.codiceFiscale, par.partitaIva].filter(Boolean), fornitoriNoti: noti });
      return [{ ...base, dati, immagini, urlPDF: URL.createObjectURL(file), controllato: false }];
    }
    return [{ ...base, errore: "Questo tipo di file non è una fattura: servono file .xml, .p7m o .pdf." }];
  } catch (e) {
    console.error(e);
    return [{ ...base, errore: tipo === "pdf" ? "Il PDF non si riesce a leggere (forse è protetto o rovinato)." : "Il file non si riesce a leggere." }];
  }
}

/** Ricontrolla i doppioni (con lo scadenzario e tra i file appena scelti). */
function segnaDoppioni(arch) {
  const gia = arch.fatture();
  carico.voci.forEach((v, i) => {
    v.doppione = null;
    if (!v.dati || v.errore) return;
    const d = trovaDoppione(v.dati, gia);
    if (d) v.doppione = `È già nello scadenzario (caricata il ${new Date(d.creatoIl).toLocaleDateString("it-IT")}${d.nomeFile ? ", file " + d.nomeFile : ""}): non verrà caricata di nuovo.`;
    else if (carico.voci.slice(0, i).some((x) => x.dati && !x.errore && !x.tolta && stessaFattura(x.dati, v.dati))) v.doppione = "È la stessa fattura di un altro file scelto (per esempio l'XML e il PDF): verrà caricata una volta sola.";
  });
}

async function carica(files, ctx) {
  const lista = [...files];
  if (!lista.length) return;
  if (!carico) carico = { voci: [], inLettura: 0 };
  carico.inLettura += lista.length;
  ctx.aggiorna();
  for (const file of lista) {
    const voci = await leggiFile(file, ctx.arch);
    carico.voci.push(...voci.map((v) => ({ ...v, id: Math.random().toString(36).slice(2) })));
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
  const el = elencoScadenze(arch);
  const r = riepilogo(el);
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
      ${[["dapagare", "Da pagare"], ["pagate", "Pagate"], ["tutte", "Tutte"]].map(([k, n]) => `<button class="${filtro === k ? "on sposta" : ""}" data-azione="filtro" data-v="${k}">${n}</button>`).join("")}
    </div>
    ${tabellaScadenze(el.filter((x) => filtro === "tutte" || (filtro === "pagate") === (x.rata.stato === PAGATA)), ctx)}
  </div>
  ${vistaFornitori(arch)}`;
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
  const valide = carico.voci.filter((v) => v.dati && !v.errore && !v.doppione && !v.tolta);
  const daControllare = valide.filter((v) => v.dati.incerti?.length && !v.controllato);
  return `<div class="card evidenza" id="carico"><h3>Fatture lette: controlli e aggiunga</h3>
    ${carico.inLettura ? `<div class="nota">Lettura in corso… (${carico.inLettura} ${carico.inLettura === 1 ? "file" : "file"} ancora da leggere)</div>` : ""}
    ${carico.voci.filter((v) => !v.tolta).map((v) => vistaVoce(v)).join("")}
    <div class="riga-bottoni">
      <button class="btn" data-azione="aggiungi" ${!valide.length || daControllare.length || carico.inLettura ? "disabled" : ""}>Aggiungi ${valide.length === 1 ? "1 fattura" : `${valide.length} fatture`} allo scadenzario</button>
      <button class="btn sec" data-azione="annullaCarico">Annulla</button></div>
    ${daControllare.length ? `<p class="hint">Prima di aggiungere, controlli i campi in arancione e spunti "Ho controllato" (${daControllare.length === 1 ? "1 fattura" : `${daControllare.length} fatture`}).</p>` : ""}
  </div>`;
}

function vistaVoce(v) {
  const titolo = `<div class="riga"><b class="spazio">${esc(v.nomeFile)}</b>
    ${v.errore ? `<span class="pill ko-pill">non letta</span>` : v.doppione ? `<span class="pill presto-pill">doppione</span>` : v.tipo === "pdf" ? `<span class="pill">PDF</span>` : `<span class="pill ok-pill">XML</span>`}
    <button class="btn sec piccolo" data-azione="togliVoce" data-v="${v.id}">Non caricare</button></div>`;
  if (v.errore) return `<div class="voce-carico">${titolo}<div class="errore">${esc(v.errore)}</div></div>`;
  if (v.doppione) return `<div class="voce-carico">${titolo}<div class="avviso">${esc(v.dati.fornitore)} n. ${esc(v.dati.numero)} del ${dataIt(v.dati.data)}: ${esc(v.doppione)}</div></div>`;
  const d = v.dati;
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
  const tipoDoc = d.notaCredito ? `<div class="nota">È una <b>nota di credito</b>: quando la segnerà come rimborsata, la spesa diminuirà.</div>` : "";
  const spunta = inc.size ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="controllato" data-v="${v.id}" ${v.controllato ? "checked" : ""}>
      Ho controllato i campi in arancione${v.tipo === "pdf" ? " guardando il PDF" : ""}</label>` : "";
  const pdf = v.urlPDF ? `<details ${inc.size ? "open" : ""} data-chiave="pdf-${v.id}"><summary>Guarda il PDF</summary>
      ${(v.immagini ?? []).map((src, i) => `<img class="pdf-vista" src="${src}" alt="Pagina ${i + 1} del PDF ${esc(v.nomeFile)}">`).join("")}
      <p class="hint"><a href="${v.urlPDF}" target="_blank" rel="noopener">Apri il PDF intero in un'altra scheda</a></p></details>` : "";
  return `<div class="voce-carico">${titolo}${tipoDoc}${avvisi}${campi}${spunta}${pdf}</div>`;
}

function tabellaScadenze(el, ctx) {
  if (!el.length) return `<p class="hint">${filtro === "dapagare" ? "Nessuna fattura da pagare." : "Nessuna fattura."}</p>`;
  const t = teatro(ctx.arch);
  return `<div class="scorri"><table class="scadenze">
    <tr><th>Scadenza</th><th>Fornitore e fattura</th><th class="n">Importo</th><th>Stato</th></tr>
    ${el.map(({ fattura: f, rata, giorni, urgenza }) => {
      const pagata = rata.stato === PAGATA;
      const stato = pagata ? `<span class="pill ok-pill">${f.notaCredito ? "rimborsata" : "pagata"} il ${dataIt(rata.pagataIl)}</span>${rata.fuori ? ` <span class="pill">fuori contabilità</span>` : ""}`
        : urgenza === "scaduta" ? `<span class="pill ko-pill">scaduta ${giorniTesto(giorni)}</span>`
        : urgenza === "presto" ? `<span class="pill presto-pill">scade ${giorniTesto(giorni)}</span>`
        : urgenza === "senza-data" ? `<span class="pill presto-pill">scadenza da indicare</span>` : `<span class="pill">da pagare</span>`;
      const quota = pagata ? rata.quotaTeatro : ricordo(ctx.arch, f)?.quotaTeatro;
      return `<tr class="${urgenza === "scaduta" ? "riga-scaduta" : ""}"><td class="nowrap">${rata.scadenza ? dataIt(rata.scadenza) : "—"}</td>
        <td><b>${esc(f.fornitore || "Fornitore?")}</b>${t.attivo && quota ? ` <span class="pill teatro-pill">teatro ${quota}%</span>` : ""}<br>
          <span class="hint">${f.notaCredito ? "Nota di credito" : TIPI_DOCUMENTO[f.tipoDoc] && f.tipoDoc !== "TD01" ? TIPI_DOCUMENTO[f.tipoDoc] : "Fattura"} n. ${esc(f.numero)} del ${dataIt(f.data)}${f.rate.length > 1 ? ` · rata ${rata.n} di ${f.rate.length}` : ""}</span>
          ${dettagli(f, rata, ctx)}</td>
        <td class="n ${f.notaCredito ? "pos" : ""}">${f.notaCredito ? "−" : ""}${eur(rata.importo)}</td>
        <td>${stato}${pagata ? "" : `<div><button class="btn piccolo" data-azione="apriPagamento" data-id="${esc(f.id)}" data-n="${rata.n}">${f.notaCredito ? "Segna come rimborsata" : "Segna come pagata"}</button></div>`}</td></tr>`;
    }).join("")}</table></div>`;
}

function dettagli(f, rata, ctx) {
  const m = ctx.arch.movimento(idMovimento(f, rata.n));
  const nessunaPagata = f.rate.every((r) => r.stato !== PAGATA);
  return `<details data-chiave="fattura-${esc(f.id)}-${rata.n}"><summary>Dettagli</summary>
    <table class="righe"><tr><td>Imponibile</td><td class="n">${eur(f.imponibile)}</td></tr><tr><td>IVA</td><td class="n">${eur(f.iva)}</td></tr>
      <tr class="tot"><td>Totale</td><td class="n">${eur(f.totale)}</td></tr></table>
    <p class="hint">Partita IVA ${esc(f.piva || "—")} · pagamento: ${esc(testoModalita(rata))}${rata.iban ? ` · IBAN ${esc(rata.iban)}` : ""}<br>
      ${f.origine === "pdf" ? "Letta da PDF" : "Letta da XML"}${f.nomeFile ? ` (${esc(f.nomeFile)})` : ""} · caricata da ${esc(f.autore ?? "—")}</p>
    ${f.descrizione ? `<p class="hint">${esc(f.descrizione)}</p>` : ""}
    ${f.note ? `<div class="nota">${esc(f.note)}</div>` : ""}
    ${rata.stato === PAGATA
      ? `${m ? `<p class="hint">Registrazione in contabilità (${dataIt(m.data)}):</p>${tabellaRighe(m.righe, ctx.arch)}` : rata.fuori ? `<p class="hint">Pagata fuori dai conti della parrocchia: nessuna registrazione.</p>` : ""}
         <div class="riga-bottoni stretta"><button class="btn pericolo piccolo" data-azione="tornaDaPagare" data-id="${esc(f.id)}" data-n="${rata.n}">Torna da pagare</button></div>`
      : `<div class="riga stretta"><label class="campo" for="sc-${esc(f.id)}-${rata.n}">Scadenza</label>
           <input id="sc-${esc(f.id)}-${rata.n}" type="date" value="${esc(rata.scadenza)}" style="max-width:200px" data-cambia="scadenza" data-id="${esc(f.id)}" data-n="${rata.n}"></div>
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
  const pagate = ctx.arch.fatture().filter((x) => x.id !== f.id && chiaveFornitore(x) === chiaveFornitore(f) && x.rate.some((r) => r.stato === PAGATA && r.voce));
  const proposta = proponiVoce(f, { ricordo: ricordo(ctx.arch, f), pagate, contiAttivi: new Set(ctx.arch.contiAttivi().map((c) => c.codice)) });
  const t = teatro(ctx.arch);
  const pt = t.attivo ? propostaTeatro(f, { ricordo: ricordo(ctx.arch, f), parole: t.parole }) : null;
  const oggi = oggiISO();
  pag = { id, n, data: oggi, modalita: mod, cassa, voce: proposta.voce, cerca: "", proposta, pt,
    quota: pt ? pt.quota : 0, quotaScelta: pt ? !pt.chiedi : true, fuori: false, ricorda: true, errore: "" };
}

const quotaPag = () => (Number(pag.quota) || 0);

function candidatoPagamento(ctx) {
  const f = ctx.arch.fattura(pag.id);
  const t = teatro(ctx.arch);
  return { f, pagamento: { data: pag.data, modalita: pag.modalita, cassa: pag.cassa, voce: pag.voce, quotaTeatro: t.attivo ? quotaPag() : 0, contoTeatro: t.conto || CONTO_TEATRO, fuori: t.attivo && quotaPag() === 100 && pag.fuori } };
}

function vistaPagamento(ctx) {
  const { f, pagamento } = candidatoPagamento(ctx);
  if (!f) { pag = null; return ""; }
  const rata = f.rate.find((r) => r.n === pag.n);
  const t = teatro(ctx.arch);
  const nc = f.notaCredito;
  const { teatro: parteTeatro, parrocchia: parteParrocchia } = dividi(rata.importo, pagamento.quotaTeatro);
  const serveVoce = !pagamento.fuori && parteParrocchia > 0;
  let anteprima = "";
  if (pagamento.fuori) anteprima = `<div class="nota">Pagata dal conto del teatro: <b>in contabilità non verrà registrato nulla</b>.</div>`;
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
    <div class="griglia g2">
      <div><label class="campo" for="p-data">${nc ? "Data del rimborso" : "Data del pagamento"}</label><input id="p-data" type="date" value="${esc(pag.data)}" data-cambia="pagData"></div>
      <div><label class="campo" for="p-mod">Come è stata pagata</label><select id="p-mod" data-cambia="pagModalita">${opzioniModalita(pag.modalita)}</select></div>
    </div>
    ${t.attivo ? `<label class="campo">Di chi è questa spesa?</label>
      ${pag.pt ? `<div class="${pag.pt.chiedi && !pag.quotaScelta ? "avviso" : "nota"}">${esc(pag.pt.motivo)}</div>` : ""}
      <div class="scelta">${[[0, "Della parrocchia"], [50, "Metà e metà"], [100, "Del teatro"]].map(([q, nome]) =>
        `<button type="button" class="${pag.quotaScelta && quotaPag() === q && !pag.altraQuota ? "on sposta" : ""}" data-azione="pagQuota" data-v="${q}">${nome}</button>`).join("")}
        <button type="button" class="${pag.quotaScelta && pag.altraQuota ? "on sposta" : ""}" data-azione="pagQuota" data-v="altra">Altra percentuale</button></div>
      ${pag.altraQuota ? `<div class="riga"><label for="p-quota">Parte del teatro (%)</label><input id="p-quota" type="text" inputmode="numeric" style="max-width:120px" value="${esc(pag.quota)}" data-cambia="pagQuotaAltra"></div>` : ""}
      ${pag.quotaScelta && pagamento.quotaTeatro > 0 && pagamento.quotaTeatro < 100 ? `<p class="hint">Parrocchia ${eur(parteParrocchia)} · teatro ${eur(parteTeatro)} (su «${esc(ctx.arch.nomeConto(t.conto))}»)</p>` : ""}
      ${pag.quotaScelta && quotaPag() === 100 ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="pagFuori" ${pag.fuori ? "checked" : ""}>
        Pagata dal conto del teatro, non da una cassa o banca della parrocchia (non va registrata)</label>` : ""}` : ""}
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
    <div class="riga-bottoni"><button class="btn" data-azione="confermaPagamento" ${pronto ? "" : "disabled"}>${pagamento.fuori ? "Conferma: segna pagata" : nc ? "Conferma: segna rimborsata e registra" : "Conferma: segna pagata e registra"}</button>
      <button class="btn sec" data-azione="annullaPagamento">Annulla</button></div>
  </div>`;
}

function vistaFornitori(arch) {
  const ricordati = arch.impostazioniCon("fornitore:");
  if (!ricordati.length) return "";
  const t = teatro(arch);
  return `<div class="card"><details data-chiave="fornitori"><summary>Fornitori ricordati (${ricordati.length})</summary>
    <p class="hint">Per questi fornitori Divisio propone già la voce${t.attivo ? " e la parte del teatro" : ""} scelta l'ultima volta.</p>
    <table>${ricordati.sort((a, b) => String(a.valore.nome).localeCompare(String(b.valore.nome))).map((i) => `<tr><td>${esc(i.valore.nome)}</td>
      <td>${i.valore.voce ? `${esc(arch.nomeConto(i.valore.voce))} <span class="codice">${i.valore.voce}</span>` : "—"}${t.attivo && i.valore.quotaTeatro ? ` <span class="pill teatro-pill">teatro ${i.valore.quotaTeatro}%</span>` : ""}</td>
      <td class="n"><button class="btn sec piccolo" data-azione="dimentica" data-chiave="${esc(i.chiave)}">Dimentica</button></td></tr>`).join("")}</table>
  </details></div>`;
}

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
    await ctx.arch.salvaInsieme({ fatture: [{ ...f, rate: f.rate.map((r) => (r.n === Number(el.dataset.n) ? { ...r, scadenza: el.value } : r)) }] });
    toast("Scadenza salvata ✓");
    ctx.aggiorna();
  },
  pagData(el, ev, ctx) { pag.data = el.value; ctx.aggiorna(); },
  pagModalita(el, ev, ctx) { pag.modalita = el.value; if (modalitaInContanti(el.value) && ctx.arch.conti.has("A02-01-01")) pag.cassa = "A02-01-01"; ctx.aggiorna(); },
  pagVoce(el, ev, ctx) { pag.voce = el.value; ctx.aggiorna(); },
  pagQuotaAltra(el, ev, ctx) { const q = Math.round(Number(String(el.value).replace(",", "."))); pag.quota = q >= 0 && q <= 100 ? q : 0; ctx.aggiorna(); },
  pagFuori(el, ev, ctx) { pag.fuori = el.checked; ctx.aggiorna(); },
  pagRicorda(el) { pag.ricorda = el.checked; },
};

export const azioni = {
  filtro(el, ev, ctx) { filtro = el.dataset.v; locale.scrivi("fatture-filtro", filtro); ctx.aggiorna(); },
  togliVoce(el, ev, ctx) { const v = voce(el); v.tolta = true; if (v.urlPDF) URL.revokeObjectURL(v.urlPDF); segnaDoppioni(ctx.arch); if (!carico.voci.some((x) => !x.tolta)) carico = null; ctx.aggiorna(); },
  annullaCarico(el, ev, ctx) { for (const v of carico?.voci ?? []) if (v.urlPDF) URL.revokeObjectURL(v.urlPDF); carico = null; ctx.aggiorna(); },
  async aggiungi(el, ev, ctx) {
    const valide = carico.voci.filter((v) => v.dati && !v.errore && !v.doppione && !v.tolta);
    for (const v of valide) {
      const d = v.dati;
      const nome = `${d.fornitore || v.nomeFile}`;
      if (!d.fornitore || !d.numero || !d.data) { toast(`${nome}: mancano fornitore, numero o data`); return; }
      if (![d.imponibile, d.iva, d.totale].every((x) => Number.isInteger(x)) || d.totale <= 0) { toast(`${nome}: controlli gli importi`); return; }
      if (d.rate.some((r) => !(r.importo > 0))) { toast(`${nome}: l'importo da pagare deve essere maggiore di zero`); return; }
    }
    el.disabled = true;
    const fatture = valide.map((v) => nuovaFattura({ ...v.dati, avvisi: (v.dati.avvisi ?? []).filter((a) => !/scansione|scriva lei|controlli/i.test(a)) }, { origine: v.tipo === "pdf" ? "pdf" : "xml", nomeFile: v.nomeFile }));
    await ctx.arch.salvaInsieme({ fatture });
    for (const v of carico.voci) if (v.urlPDF) URL.revokeObjectURL(v.urlPDF);
    const saltate = carico.voci.filter((v) => v.doppione && !v.tolta).length;
    carico = null;
    filtro = "dapagare";
    toast(`${fatture.length === 1 ? "1 fattura aggiunta" : `${fatture.length} fatture aggiunte`} allo scadenzario ✓${saltate ? ` (${saltate} ${saltate === 1 ? "doppione saltato" : "doppioni saltati"})` : ""}`);
    ctx.aggiorna();
  },
  apriPagamento(el, ev, ctx) { apriPagamento(ctx, el.dataset.id, Number(el.dataset.n)); pag.scorri = true; ctx.aggiorna(); },
  annullaPagamento(el, ev, ctx) { pag = null; ctx.aggiorna(); },
  pagCassa(el, ev, ctx) { pag.cassa = el.dataset.v; ctx.aggiorna(); },
  pagQuota(el, ev, ctx) {
    pag.quotaScelta = true;
    if (el.dataset.v === "altra") { pag.altraQuota = true; if (![0, 50, 100].includes(quotaPag())) pag.quota = quotaPag(); else pag.quota = 30; }
    else { pag.altraQuota = false; pag.quota = Number(el.dataset.v); }
    if (quotaPag() !== 100) pag.fuori = false;
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
    const impostazioni = pag.ricorda ? [{ chiave: chiaveFornitore(f), valore: { nome: f.fornitore, voce: pagamento.voce || ricordo(ctx.arch, f)?.voce || "", ...(teatro(ctx.arch).attivo ? { quotaTeatro: pagamento.quotaTeatro } : {}) } }] : [];
    await ctx.arch.salvaInsieme({ fatture: [esito.fattura], movimenti: esito.movimento ? [esito.movimento] : [], impostazioni });
    const anno = pagamento.data.slice(0, 4);
    toast(esito.movimento ? `Pagata e registrata in contabilità ✓${anno !== String(ctx.anno) ? ` (nell'anno ${anno})` : ""}` : "Segnata come pagata ✓ (nessuna registrazione)");
    pag = null;
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
    await ctx.arch.salvaInsieme({ fatture: [fattura], movimentiDaEliminare: movimentoDaEliminare || m ? [movimentoDaEliminare || m.id] : [] });
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
    await ctx.arch.salvaInsieme({ fatture: [fattura], movimenti: movimento ? [movimento] : [] });
    toast("Registrata di nuovo ✓");
    ctx.aggiorna();
  },
  async rimettiDaPagare(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    if (!f) return;
    await ctx.arch.salvaInsieme({ fatture: [tornaDaPagare(f, Number(el.dataset.n)).fattura] });
    toast("Fattura di nuovo da pagare ✓");
    ctx.aggiorna();
  },
  async togliUscita(el, ev, ctx) {
    const f = ctx.arch.fattura(el.dataset.id);
    const id = idMovimento(f, Number(el.dataset.n));
    const m = ctx.arch.movimento(id);
    if (!m || !confirm(`Togliere dalla contabilità il movimento «${m.descr}» del ${dataIt(m.data)}?`)) return;
    await ctx.arch.salvaInsieme({ movimentiDaEliminare: [id] });
    toast("Uscita tolta dalla contabilità");
    ctx.aggiorna();
  },
  async dimentica(el, ev, ctx) {
    await ctx.arch.salvaImpostazione(el.dataset.chiave, null);
    toast("Fornitore dimenticato");
    ctx.aggiorna();
  },
};
