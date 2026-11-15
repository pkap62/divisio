// Pagina "Movimenti": elenco con ricerca e filtri, correzione, eliminazione, esportazione CSV.

import { movimentiAnno } from "../dominio/saldi.js";
import { movimentiCSV, perData } from "../dominio/csv.js";
import { isCassaBanca } from "../dominio/piano.js";
import { analizza } from "../dominio/scritture.js";
import { esc, eur, dataIt, norm, scarica, toast, $ } from "./util.js";
import { tabellaMovimenti } from "./elenco.js";

const PERIODI = { T1: ["01-01", "03-31", "1° trimestre"], T2: ["04-01", "06-30", "2° trimestre"], T3: ["07-01", "09-30", "3° trimestre"], T4: ["10-01", "12-31", "4° trimestre"] };
const filtro = { testo: "", cassa: "", periodo: "", tipo: "" };

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
  return `${tabellaMovimenti(lista, ctx.arch, { dettagli: true })}
    <p class="hint">${lista.length} movimenti · entrate di cassa ${eur(somma(1))} · uscite ${eur(somma(-1))}</p>`;
}

export function vista(ctx) {
  const casse = ctx.arch.contiAttivi().filter((c) => isCassaBanca(c.codice));
  const opz = (valori, scelto) => valori.map(([v, n]) => `<option value="${v}" ${v === scelto ? "selected" : ""}>${esc(n)}</option>`).join("");
  return `
  <div class="riga"><h2 class="spazio">Movimenti ${ctx.anno}</h2>
    <button class="btn sec piccolo" data-azione="csv">Scarica in CSV (Excel)</button></div>
  <p class="lead">Tutto quello che è stato registrato. Apra "Dettagli" per vedere la partita doppia, correggere o eliminare.</p>
  <div class="card"><div class="griglia g4">
    <div><label class="campo" for="m-cerca">Cerca</label><input id="m-cerca" type="search" value="${esc(filtro.testo)}" placeholder="es. funerale" data-input="testo"></div>
    <div><label class="campo" for="m-cassa">Cassa / banca</label><select id="m-cassa" data-cambia="cassa">${opz([["", "Tutte"], ...casse.map((c) => [c.codice, c.nome])], filtro.cassa)}</select></div>
    <div><label class="campo" for="m-periodo">Periodo</label><select id="m-periodo" data-cambia="periodo">${opz([["", "Tutto l'anno"], ...Object.entries(PERIODI).map(([k, p]) => [k, p[2]])], filtro.periodo)}</select></div>
    <div><label class="campo" for="m-tipo">Tipo</label><select id="m-tipo" data-cambia="tipo">${opz([["", "Tutti"], ["entrata", "Entrate"], ["uscita", "Uscite"], ["spostamento", "Spostamenti"], ["senzaCassa", "Senza cassa"], ["apertura", "Saldi di apertura"]], filtro.tipo)}</select></div>
  </div></div>
  <div class="card" id="elenco">${elenco(ctx)}</div>`;
}

const ridisegnaElenco = (ctx) => { $("#elenco").innerHTML = elenco(ctx); };

export const input = { testo(el, ev, ctx) { filtro.testo = el.value; ridisegnaElenco(ctx); } };
export const cambia = {
  cassa(el, ev, ctx) { filtro.cassa = el.value; ridisegnaElenco(ctx); },
  periodo(el, ev, ctx) { filtro.periodo = el.value; ridisegnaElenco(ctx); },
  tipo(el, ev, ctx) { filtro.tipo = el.value; ridisegnaElenco(ctx); },
};

export const azioni = {
  modifica: (el, ev, ctx) => ctx.vai("registra", { modifica: el.dataset.id }),
  async elimina(el, ev, ctx) {
    const m = ctx.arch.movimento(el.dataset.id);
    if (!m || !confirm(`Eliminare il movimento «${m.descr}» del ${dataIt(m.data)}?`)) return;
    await ctx.arch.eliminaMovimento(m.id);
    toast("Movimento eliminato");
    ridisegnaElenco(ctx);
  },
  csv(el, ev, ctx) {
    const testo = movimentiCSV(movimentiAnno(ctx.arch.movimenti(), ctx.anno), (c) => ctx.arch.nomeConto(c));
    scarica(`Divisio_movimenti_${ctx.anno}.csv`, "﻿" + testo, "text/csv;charset=utf-8");   // ﻿: Excel riconosce le lettere accentate
  },
};
