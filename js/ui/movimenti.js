// Pagina "Movimenti": elenco con ricerca e filtri, correzione, eliminazione, esportazione CSV.

import { movimentiAnno, saldiProgressivi } from "../dominio/saldi.js";
import { movimentiCSV, perData } from "../dominio/csv.js";
import { casseInOrdine } from "../dominio/piano.js";
import { analizza } from "../dominio/scritture.js";
import { esc, eur, dataIt, norm, rendicontoInviato, scarica, toast, $ } from "./util.js";
import { tabellaMovimenti } from "./elenco.js";
import { tornaDaPagare } from "../dominio/scadenzario.js";
import { salvaCopia } from "./impostazioni.js";

const PERIODI = { T1: ["01-01", "03-31", "1° trimestre"], T2: ["04-01", "06-30", "2° trimestre"], T3: ["07-01", "09-30", "3° trimestre"], T4: ["10-01", "12-31", "4° trimestre"] };
const filtro = { testo: "", cassa: "", periodo: "", tipo: "" };
let azzera = null;   // pannello "Azzera i movimenti dell'anno" aperto: { anno, capito }

function filtrati({ arch, anno }) {
  const q = norm(filtro.testo).trim();
  return movimentiAnno(arch.movimenti(), anno).filter((m) => {
    if (q && !norm(`${m.descr} ${m.righe.map((r) => arch.nomeConto(r.conto) + " " + r.conto).join(" ")}`).includes(q)) return false;
    if (filtro.cassa && !m.righe.some((r) => r.conto === filtro.cassa)) return false;
    if (filtro.periodo) { const [da, a] = PERIODI[filtro.periodo]; const g = m.data.slice(5); if (g < da || g > a) return false; }
    if (filtro.tipo && analizza(m).tipo !== filtro.tipo) return false;
    return true;
  }).sort(perData).reverse();
}

function elenco(ctx) {
  const lista = filtrati(ctx);
  const somma = (s) => lista.reduce((t, m) => { const a = analizza(m); return t + (a.segno === s ? a.importo : 0); }, 0);
  // scelta una sola cassa o banca: saldo dopo ogni movimento, calcolato su tutto l'anno (anche se si cerca o si sceglie un periodo)
  const progressivo = filtro.cassa ? saldiProgressivi(movimentiAnno(ctx.arch.movimenti(), ctx.anno), filtro.cassa) : null;
  const finale = progressivo?.size ? [...progressivo.values()].at(-1) : null;
  return `${tabellaMovimenti(lista, ctx.arch, { dettagli: true, progressivo })}
    <p class="hint">${lista.length} movimenti · entrate di cassa ${eur(somma(1))} · uscite ${eur(somma(-1))}</p>
    ${progressivo ? `<p class="hint">«Saldo dopo»: quanto c'era in ${esc(ctx.arch.nomeConto(filtro.cassa))} dopo ogni movimento, partendo dal saldo di inizio anno.
      Saldo dopo l'ultimo movimento del ${ctx.anno}: <b>${eur(finale ?? 0)}</b>. Serve per confrontarlo con i contanti contati o con l'estratto conto della banca.</p>` : ""}`;
}

export function vista(ctx) {
  const casse = casseInOrdine(ctx.arch.contiAttivi());
  const opz = (valori, scelto) => valori.map(([v, n]) => `<option value="${v}" ${v === scelto ? "selected" : ""}>${esc(n)}</option>`).join("");
  return `
  <div class="riga"><h2 class="spazio">Movimenti ${ctx.anno}</h2>
    <button class="btn sec piccolo" data-azione="csv">Scarica in CSV (Excel)</button></div>
  <p class="lead">Tutto quello che è stato registrato. Apra "Dettagli" per vedere la partita doppia, correggere, eliminare o registrare di nuovo lo stesso movimento.
    Scegliendo una sola cassa o banca compare anche il saldo dopo ogni movimento.</p>
  ${rendicontoInviato(ctx.arch, ctx.anno) ? `<div class="nota">Il Rendiconto ${ctx.anno} risulta già inviato da UNIO il ${dataIt(rendicontoInviato(ctx.arch, ctx.anno))}:
    le correzioni ai movimenti del ${ctx.anno} vanno fatte anche in UNIO.</div>` : ""}
  <div class="card"><div class="griglia g4">
    <div><label class="campo" for="m-cerca">Cerca</label><input id="m-cerca" type="search" value="${esc(filtro.testo)}" placeholder="es. funerale" data-input="testo"></div>
    <div><label class="campo" for="m-cassa">Cassa / banca</label><select id="m-cassa" data-cambia="cassa">${opz([["", "Tutte"], ...casse.map((c) => [c.codice, c.nome])], filtro.cassa)}</select></div>
    <div><label class="campo" for="m-periodo">Periodo</label><select id="m-periodo" data-cambia="periodo">${opz([["", "Tutto l'anno"], ...Object.entries(PERIODI).map(([k, p]) => [k, p[2]])], filtro.periodo)}</select></div>
    <div><label class="campo" for="m-tipo">Tipo</label><select id="m-tipo" data-cambia="tipo">${opz([["", "Tutti"], ["entrata", "Entrate"], ["uscita", "Uscite"], ["spostamento", "Spostamenti"], ["senzaCassa", "Senza cassa"], ["apertura", "Saldi di apertura"]], filtro.tipo)}</select></div>
  </div></div>
  <div class="card" id="elenco">${elenco(ctx)}</div>
  ${vistaAzzera(ctx)}`;
}

/** Cosa cancella "Azzera": tutti i movimenti dell'anno (anche i saldi di apertura) e le fatture che tornano da pagare. */
function daAzzerare(ctx) {
  const movimenti = movimentiAnno(ctx.arch.movimenti(), ctx.anno);
  const fatture = new Map();
  for (const m of movimenti) {
    if (!m.fattura) continue;
    const f = fatture.get(m.fattura.id) ?? ctx.arch.fattura(m.fattura.id);
    if (f?.rate.some((r) => r.n === m.fattura.rata)) fatture.set(f.id, tornaDaPagare(f, m.fattura.rata).fattura);
  }
  return { movimenti, fatture: [...fatture.values()], daUNIO: movimenti.filter((m) => m.origine === "UNIO").length };
}

function vistaAzzera(ctx) {
  const anno = ctx.anno;
  if (!azzera || azzera.anno !== anno) {
    return `<div class="card solo-schermo"><details data-chiave="azzera"><summary>Azzera i movimenti del ${anno}</summary>
      <p>Cancella da Divisio <b>tutti i movimenti del ${anno}</b>, compresi i saldi di apertura, per ricominciare l'anno da capo
        (per esempio prima di caricare di nuovo i movimenti da UNIO). Gli altri anni, le fatture, i conti e le impostazioni restano. In UNIO non cambia nulla.</p>
      <button class="btn pericolo" data-azione="apriAzzera">Azzera i movimenti del ${anno}…</button></details></div>`;
  }
  const { movimenti, fatture, daUNIO } = daAzzerare(ctx);
  if (!movimenti.length) return `<div class="card solo-schermo"><h3>Azzera i movimenti del ${anno}</h3><p class="hint">Nel ${anno} non ci sono movimenti.</p>
    <button class="btn sec" data-azione="chiudiAzzera">Chiudi</button></div>`;
  return `<div class="card evidenza solo-schermo" id="azzera"><h3>Azzera i movimenti del ${anno}</h3>
    <div class="avviso">Verranno cancellati <b>${movimenti.length === 1 ? "1 movimento" : `${movimenti.length} movimenti`}</b> del ${anno}${daUNIO ? ` (di cui ${daUNIO} caricati da UNIO)` : ""},
      compresi i saldi di apertura. Se Divisio è condiviso, spariranno anche dagli altri computer.</div>
    ${fatture.length ? `<div class="nota">${fatture.length === 1 ? "1 fattura pagata nel" : `${fatture.length} fatture pagate nel`} ${anno} ${fatture.length === 1 ? "tornerà" : "torneranno"} «da pagare» nello scadenzario,
      perché la loro uscita viene cancellata.</div>` : ""}
    <p>Prima di azzerare, Divisio scarica una <b>copia di sicurezza</b> (cartella Download): con quella, da Impostazioni, si può tornare indietro.</p>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="azzeraCapito" ${azzera.capito ? "checked" : ""}>
      Ho capito: i movimenti del ${anno} verranno cancellati da Divisio</label>
    <div class="riga-bottoni"><button class="btn pericolo" data-azione="confermaAzzera" ${azzera.capito ? "" : "disabled"}>Azzera i movimenti del ${anno}</button>
      <button class="btn sec" data-azione="chiudiAzzera">Annulla</button></div>
  </div>`;
}

const ridisegnaElenco = (ctx) => { $("#elenco").innerHTML = elenco(ctx); };

export const input = { testo(el, ev, ctx) { filtro.testo = el.value; ridisegnaElenco(ctx); } };
export const cambia = {
  cassa(el, ev, ctx) { filtro.cassa = el.value; ridisegnaElenco(ctx); },
  periodo(el, ev, ctx) { filtro.periodo = el.value; ridisegnaElenco(ctx); },
  tipo(el, ev, ctx) { filtro.tipo = el.value; ridisegnaElenco(ctx); },
  azzeraCapito(el, ev, ctx) { azzera.capito = el.checked; ctx.aggiorna(); },
};

export const azioni = {
  apriAzzera(el, ev, ctx) { azzera = { anno: ctx.anno, capito: false }; ctx.aggiorna(); },
  chiudiAzzera(el, ev, ctx) { azzera = null; ctx.aggiorna(); },
  async confermaAzzera(el, ev, ctx) {
    if (!azzera?.capito || azzera.anno !== ctx.anno) return;
    const { movimenti, fatture } = daAzzerare(ctx);
    el.disabled = true;
    salvaCopia(ctx, `prima-di-azzerare-${ctx.anno}`);
    await ctx.arch.salvaInsieme({ fatture, movimentiDaEliminare: movimenti.map((m) => m.id) });
    azzera = null;
    toast(`Movimenti del ${ctx.anno} azzerati (${movimenti.length}) ✓ Copia di sicurezza nella cartella Download`);
    ctx.aggiorna();
  },
  modifica: (el, ev, ctx) => ctx.vai("registra", { modifica: el.dataset.id }),
  copia: (el, ev, ctx) => ctx.vai("registra", { copia: el.dataset.id }),
  async elimina(el, ev, ctx) {
    const m = ctx.arch.movimento(el.dataset.id);
    if (!m) return;
    const f = m.fattura ? ctx.arch.fattura(m.fattura.id) : undefined;
    const inviato = rendicontoInviato(ctx.arch, Number(m.data.slice(0, 4)));
    const ancheUNIO = inviato ? `\n\nAttenzione: il Rendiconto ${m.data.slice(0, 4)} risulta già inviato da UNIO il ${dataIt(inviato)}; l'eliminazione va fatta anche in UNIO.` : "";
    if (f) {
      // movimento nato da una fattura pagata: la fattura torna "da pagare", nella stessa operazione
      if (!confirm(`Eliminare il movimento «${m.descr}» del ${dataIt(m.data)}?\n\nViene da una fattura segnata come pagata: la fattura tornerà "da pagare" nello scadenzario.${ancheUNIO}`)) return;
      await ctx.arch.salvaInsieme({ fatture: [tornaDaPagare(f, m.fattura.rata).fattura], movimentiDaEliminare: [m.id] });
      toast("Movimento eliminato; la fattura è di nuovo da pagare");
    } else {
      if (!confirm(`Eliminare il movimento «${m.descr}» del ${dataIt(m.data)}?${ancheUNIO}`)) return;
      await ctx.arch.eliminaMovimento(m.id);
      toast("Movimento eliminato");
    }
    ridisegnaElenco(ctx);
  },
  csv(el, ev, ctx) {
    const testo = movimentiCSV(movimentiAnno(ctx.arch.movimenti(), ctx.anno), (c) => ctx.arch.nomeConto(c));
    scarica(`Divisio_movimenti_${ctx.anno}.csv`, "﻿" + testo, "text/csv;charset=utf-8");   // ﻿: Excel riconosce le lettere accentate
  },
};
