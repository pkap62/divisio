// Pagina "Registra": modalità semplice (Entrate/Uscite) e modalità partita doppia.

import { scritturaSemplice, verificaMovimento, analizza } from "../dominio/scritture.js";
import { parseEuro, formatDecimale, formatEuro } from "../dominio/importi.js";
import { isCassaBanca, tipoDi } from "../dominio/piano.js";
import { esc, eur, dataPerAnno, opzioniConti, toast, $ } from "./util.js";
import { tabellaRighe } from "./elenco.js";

let F = null;   // stato del modulo in compilazione

const casse = (arch) => arch.contiAttivi().filter((c) => isCassaBanca(c.codice));
const rigaVuota = () => ({ conto: "", dare: "", avere: "" });

function nuovo(ctx, tipo = "entrata", tieni = {}) {
  const cs = casse(ctx.arch);
  return { modo: "semplice", tipo, data: dataPerAnno(ctx.anno), importo: "", descr: "", voce: "", cerca: "",
    cassa: cs[0]?.codice ?? "", da: cs[0]?.codice ?? "", verso: (cs[1] ?? cs[0])?.codice ?? "",
    righe: [rigaVuota(), rigaVuota()], id: null, ...tieni };
}

function daMovimento(m) {
  const a = analizza(m);
  const base = { id: m.id, data: m.data, descr: m.descr, cerca: "", righe: [rigaVuota(), rigaVuota()] };
  if ((m.tipo === "entrata" || m.tipo === "uscita") && m.righe.length === 2 && a.casse.length === 1) {
    return { ...base, modo: "semplice", tipo: m.tipo, importo: formatDecimale(a.importo), voce: a.voci[0].conto, cassa: a.casse[0].conto, da: "", verso: "" };
  }
  if (m.tipo === "spostamento" && a.tipo === "spostamento") {
    return { ...base, modo: "semplice", tipo: "spostamento", importo: formatDecimale(a.importo), voce: "", cassa: "", da: a.da, verso: a.verso };
  }
  return { ...base, modo: "pd", tipo: "pd", importo: "", voce: "", cassa: "", da: "", verso: "",
    righe: m.righe.map((r) => ({ conto: r.conto, dare: r.dare ? formatDecimale(r.dare) : "", avere: r.avere ? formatDecimale(r.avere) : "" })) };
}

/** Chiamata prima di mostrare la pagina. opz: {tipo} per un nuovo movimento, {modifica:id} per correggerne uno. */
export function prepara(ctx, opz = {}) {
  if (opz.modifica) { const m = ctx.arch.movimento(opz.modifica); if (m) { F = daMovimento(m); return; } }
  if (!F || opz.tipo || F.id) F = nuovo(ctx, opz.tipo || "entrata");
  if (F.data.slice(0, 4) !== String(ctx.anno)) F.data = dataPerAnno(ctx.anno);
}

/* ---------- movimento costruito dal modulo ---------- */
function candidato(ctx) {
  if (F.modo === "pd") {
    const righe = F.righe.filter((r) => r.conto || r.dare || r.avere)
      .map((r) => ({ conto: r.conto, dare: parseEuro(r.dare), avere: parseEuro(r.avere) }));
    const valide = righe.every((r) => !Number.isNaN(r.dare) && !Number.isNaN(r.avere));
    return { completo: valide && righe.length >= 2, mov: { data: F.data, descr: F.descr.trim(), tipo: "pd", righe }, importoNonValido: !valide };
  }
  const importo = parseEuro(F.importo);
  const pronto = importo > 0 && (F.tipo === "spostamento" ? F.da && F.verso : F.voce && F.cassa);
  const righe = pronto ? scritturaSemplice({ tipo: F.tipo, importo, voce: F.voce, cassa: F.cassa, da: F.da, verso: F.verso }) : [];
  return { completo: pronto && F.descr.trim(), mov: { data: F.data, descr: F.descr.trim(), tipo: F.tipo, righe }, importoNonValido: Number.isNaN(importo) || importo < 0 };
}

/* ---------- viste ---------- */
const bottoniCasse = (ctx, scelto, azione) => `<div class="scelta">${casse(ctx.arch).map((c) =>
  `<button type="button" class="${c.codice === scelto ? "on sposta" : ""}" data-azione="${azione}" data-v="${c.codice}">${esc(c.nome)}</button>`).join("")}</div>`;

const tipiPerVoce = () => (F.tipo === "entrata" ? ["E", "PG", "A", "P"] : ["U", "PG", "A", "P"]);
const escludiVoce = (codice) => isCassaBanca(codice) || tipoDi(codice) === "PAT" || (F.tipo === "entrata" ? tipoDi(codice) === "U" : tipoDi(codice) === "E");
const opzioniVoce = (ctx) => opzioniConti(ctx.arch.contiAttivi(), { tipi: tipiPerVoce(), escludi: escludiVoce, cerca: F.cerca, selezionato: F.voce });

export function vista(ctx) {
  return F.modo === "pd" ? vistaPD(ctx) : vistaSemplice(ctx);
}

const notaFattura = (ctx) => (F.id && ctx.arch.movimento(F.id)?.fattura
  ? `<div class="nota">Questo movimento viene da una fattura pagata (pagina Fatture). Si può correggere qui; per annullare il pagamento, usi "Torna da pagare" nella pagina Fatture.</div>` : "");

function intestazione(titolo, testoBottone, azioneBottone) {
  return `<div class="riga"><h2 class="spazio">${titolo}</h2>
    <button class="btn sec piccolo" data-azione="${azioneBottone}">${testoBottone}</button></div>`;
}

function vistaSemplice(ctx) {
  const sp = F.tipo === "spostamento";
  return `
  ${intestazione(F.id ? "Correggi il movimento" : "Registra un movimento", "Sono pratico: usa la partita doppia", "modoPD")}
  <p class="lead">Compili i campi: Divisio scrive da solo la registrazione in partita doppia.</p>
  ${notaFattura(ctx)}
  <div class="card">
    <div class="scelta">
      <button class="${F.tipo === "entrata" ? "on entrata" : ""}" data-azione="tipo" data-v="entrata">+ Entrata</button>
      <button class="${F.tipo === "uscita" ? "on uscita" : ""}" data-azione="tipo" data-v="uscita">− Uscita</button>
      <button class="${sp ? "on sposta" : ""}" data-azione="tipo" data-v="spostamento">⇄ Sposta soldi</button>
    </div>
    <div class="griglia g2">
      <div><label class="campo" for="f-data">Data</label><input id="f-data" type="date" value="${F.data}" data-input="data"></div>
      <div><label class="campo" for="f-importo">Importo (€)</label><input id="f-importo" type="text" class="importo" inputmode="decimal" placeholder="0,00" value="${esc(F.importo)}" data-input="importo"></div>
    </div>
    <label class="campo" for="f-descr">${sp ? "Descrizione" : "Che cos'è? Lo scriva con parole sue"}</label>
    <input id="f-descr" type="text" value="${esc(F.descr)}" data-input="descr"
      placeholder="${F.tipo === "entrata" ? "es. offerta funerale" : F.tipo === "uscita" ? "es. bolletta luce di marzo" : "es. versamento contanti in banca"}">
    ${sp ? `
      <label class="campo">Da dove escono i soldi</label>${bottoniCasse(ctx, F.da, "da")}
      <label class="campo">Dove arrivano</label>${bottoniCasse(ctx, F.verso, "verso")}` : `
      <label class="campo" for="f-voce">Voce</label>
      <div class="griglia voce"><input type="search" placeholder="Cerca la voce, es. funerali" value="${esc(F.cerca)}" data-input="cerca" aria-label="Cerca la voce">
        <select id="f-voce" data-cambia="voce">${opzioniVoce(ctx)}</select></div>
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
  ${notaFattura(ctx)}
  <div class="card">
    <div class="griglia g2">
      <div><label class="campo" for="p-data">Data</label><input id="p-data" type="date" value="${F.data}" data-input="data"></div>
      <div><label class="campo" for="p-descr">Descrizione</label><input id="p-descr" type="text" value="${esc(F.descr)}" data-input="descr" placeholder="es. giroconto di fine anno"></div>
    </div>
    <div class="scorri"><table class="pd"><tr><th>Conto</th><th class="n">Dare</th><th class="n">Avere</th><th></th></tr>
      ${F.righe.map((r, i) => `<tr>
        <td><select data-cambia="pdConto" data-i="${i}" aria-label="Conto della riga ${i + 1}">${opzioniConti(tutti, { tipi: ["A", "P", "PAT", "PG", "E", "U"], selezionato: r.conto, vuota: "— scegli il conto —" })}</select></td>
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
  if (F.data && F.data.slice(0, 4) !== String(ctx.anno)) msg.push(`<div class="avviso">La data è fuori dall'anno ${ctx.anno} (l'anno si cambia in alto).</div>`);
  if (F.modo === "semplice" && F.voce && tipoDi(F.voce) === "PG") {
    msg.push(`<div class="nota">${F.tipo === "entrata"
      ? "Questa è una <b>colletta da versare alla Diocesi</b>: Divisio la tiene da parte e non la conta tra le entrate della parrocchia."
      : "Questo è il <b>versamento alla Diocesi</b> di una colletta raccolta."}</div>`);
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
  descr(el, ev, ctx) { F.descr = el.value; aggiornaAnteprima(ctx); },
  cerca(el, ev, ctx) { F.cerca = el.value; $("#f-voce").innerHTML = opzioniVoce(ctx); },
  pdDare(el, ev, ctx) { F.righe[el.dataset.i].dare = el.value; aggiornaAnteprima(ctx); },
  pdAvere(el, ev, ctx) { F.righe[el.dataset.i].avere = el.value; aggiornaAnteprima(ctx); },
};

export const cambia = {
  voce(el, ev, ctx) { F.voce = el.value; aggiornaAnteprima(ctx); },
  pdConto(el, ev, ctx) { F.righe[el.dataset.i].conto = el.value; aggiornaAnteprima(ctx); },
};

export const azioni = {
  tipo(el, ev, ctx) { const t = el.dataset.v; if (t !== F.tipo) { F.tipo = t; F.voce = ""; F.cerca = ""; } ctx.aggiorna(); },
  cassa(el, ev, ctx) { F.cassa = el.dataset.v; ctx.aggiorna(); },
  da(el, ev, ctx) { F.da = el.dataset.v; if (F.verso === F.da) F.verso = casse(ctx.arch).find((c) => c.codice !== F.da)?.codice ?? ""; ctx.aggiorna(); },
  verso(el, ev, ctx) { F.verso = el.dataset.v; if (F.verso === F.da) F.da = casse(ctx.arch).find((c) => c.codice !== F.verso)?.codice ?? ""; ctx.aggiorna(); },
  modoPD(el, ev, ctx) {
    // porta nella partita doppia quello che era già stato scritto
    const { mov } = candidato(ctx);
    F.modo = "pd";
    if (mov.righe.length) F.righe = mov.righe.map((r) => ({ conto: r.conto, dare: r.dare ? formatDecimale(r.dare) : "", avere: r.avere ? formatDecimale(r.avere) : "" }));
    ctx.aggiorna();
  },
  modoSemplice(el, ev, ctx) { F = nuovo(ctx, "entrata", { data: F.data, descr: F.descr, id: F.id }); ctx.aggiorna(); },
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
      // pronto per il prossimo: tiene tipo, data e cassa
      F = F.modo === "pd" ? { ...nuovo(ctx, "pd"), modo: "pd", data: F.data } : nuovo(ctx, F.tipo, { data: F.data, cassa: F.cassa, da: F.da, verso: F.verso });
      ctx.aggiorna();
      document.getElementById(F.modo === "pd" ? "p-descr" : "f-importo")?.focus();
    } catch (e) {
      el.disabled = false;
      toast("Non è stato possibile salvare: " + e.message);
    }
  },
};
