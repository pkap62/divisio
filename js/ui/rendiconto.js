// Pagina "Rendiconto": le stesse sezioni del Rendiconto UNIO, calcolate dai movimenti.

import { calcolaRendiconto, totaliPrevisione } from "../dominio/rendiconto.js";
import { saldiCSV, leggiSaldiUNIO, confronta } from "../dominio/unio.js";
import { movimentiAnno } from "../dominio/saldi.js";
import { GRUPPI, VOCI, voceDi } from "../dominio/piano.js";
import { parseEuro, formatDecimale } from "../dominio/importi.js";
import { esc, eur, cellaEuro, scarica, toast } from "./util.js";

let unio = null;   // CSV di UNIO caricato: { anno, nomeFile, voci }. Il confronto si ricalcola a ogni visualizzazione.

function calcola(ctx) {
  const tutti = ctx.arch.movimenti();
  const R = calcolaRendiconto(tutti, ctx.anno, { conti: ctx.arch.conti });
  const P = movimentiAnno(tutti, ctx.anno - 1).length ? calcolaRendiconto(tutti, ctx.anno - 1, { conti: ctx.arch.conti }) : null;
  return { R, P };
}

const segnoUNIO = (confronto, codice) => {
  const x = confronto?.find((r) => r.codice === codice);
  if (!x) return "";
  return x.uguale ? ` <span class="pill ok-pill">= UNIO</span>` : ` <span class="pill ko-pill">UNIO: ${eur(x.unio)}</span>`;
};

function tabellaSezione(R, P, tipi, confronto) {
  return GRUPPI.filter((g) => tipi.includes(g.tipo)).map((g) => `
    <tr class="gruppo"><td colspan="${P ? 3 : 2}">${g.codice} ${esc(g.nome)}</td></tr>
    ${g.voci.map((v) => `<tr><td><span class="codice">${v.codice.slice(4)}</span> ${esc(v.nome)}${segnoUNIO(confronto, v.codice)}</td>
      ${cellaEuro(R.voci.get(v.codice))}${P ? cellaEuro(P.voci.get(v.codice), "prec") : ""}</tr>`).join("")}
    <tr class="tot"><td>Totale ${esc(g.nome.toLowerCase())}</td>${cellaEuro(R.gruppi.get(g.codice))}${P ? cellaEuro(P.gruppi.get(g.codice), "prec") : ""}</tr>`).join("");
}

const intestazioneColonne = (R, P, primo = "Voce") => `<tr><th>${primo}</th><th class="n">Anno ${R.anno}</th>${P ? `<th class="n prec">Anno ${P.anno}</th>` : ""}</tr>`;
const rigaTotale = (testo, a, b, P) => `<tr class="grande-tot"><td>${testo}</td>${cellaEuro(a)}${P ? cellaEuro(b, "prec") : ""}</tr>`;

export function vista(ctx) {
  const { R, P } = calcola(ctx);
  const par = ctx.arch.impostazione("parrocchia", {});
  const prev = ctx.arch.impostazione(`previsione-${ctx.anno}`, {});
  const tp = totaliPrevisione(prev);
  const confronto = unio && unio.anno === ctx.anno ? confronta(R, unio) : null;
  const nomeConto = (c) => esc(ctx.arch.nomeConto(c));

  return `
  <div class="riga"><h2 class="spazio">Rendiconto Parrocchiale ${ctx.anno}</h2>
    <div class="riga-bottoni stretta"><button class="btn sec piccolo" data-azione="stampa">Stampa / PDF</button>
    <button class="btn sec piccolo" data-azione="csv">Scarica CSV come UNIO</button></div></div>
  <p class="lead">${esc(par.nome || "Parrocchia")}${par.icsc ? ` · cod. ICSC ${esc(par.icsc)}` : ""}${par.parroco ? ` · Parroco ${esc(par.parroco)}` : ""}.
    Calcolato da ${R.numeroMovimenti} movimenti, con le stesse voci del Rendiconto di UNIO.</p>
  ${!par.nome || !par.icsc ? `<div class="avviso solo-schermo">Mancano alcuni dati della parrocchia (nome, codice ICSC): li inserisca in <a href="#" data-azione="vai" data-pagina="impostazioni">Impostazioni</a>.</div>` : ""}

  <div class="griglia g4 riepilogo">
    <div class="card saldo"><div class="etichetta">Entrate (T01)</div><div class="valore pos">${eur(R.entrate)}</div></div>
    <div class="card saldo"><div class="etichetta">Uscite (T02)</div><div class="valore neg">${eur(R.uscite)}</div></div>
    <div class="card saldo"><div class="etichetta">${R.avanzo >= 0 ? "Avanzo" : "Disavanzo"} di gestione</div><div class="valore">${eur(R.avanzo)}</div></div>
    <div class="card saldo"><div class="etichetta">Contributo diocesano</div><div class="valore">${eur(R.contributo.totale)}</div></div>
  </div>
  ${R.quadra ? `<div class="ok">✓ I conti tornano: Attività ${eur(R.attivita)} = Passività e capitale ${eur(R.passivitaPiuCapitale)} + ${R.avanzo >= 0 ? "Avanzo" : "Disavanzo"} ${eur(R.avanzo)}</div>`
             : `<div class="errore">✗ Lo stato patrimoniale non torna: controlli i movimenti in partita doppia.</div>`}
  ${!ctx.arch.movimento(`apertura-${ctx.anno}`) ? `<div class="avviso solo-schermo">Mancano i saldi di apertura ${ctx.anno}: cassa, banche e patrimonio partono da zero.</div>` : ""}

  <div class="card solo-schermo" style="margin-top:16px"><h3>Confronta con UNIO</h3>
    <p class="hint">In UNIO, pagina Rendiconto Parrocchiale, prema <b>"Esporta saldi Patrimoniali e di Gestione in .csv"</b> e carichi qui il file.
      Divisio controlla le 54 voci una per una. Il file viene letto solo su questo computer.</p>
    <div class="riga-bottoni stretta"><label class="btn sec piccolo">${unio ? "Carica un altro CSV di UNIO…" : "Carica il CSV di UNIO…"}<input type="file" accept=".csv,text/csv" hidden data-cambia="confronto"></label>
      ${unio ? `<button class="btn pericolo piccolo" data-azione="togliConfronto">Azzera il confronto</button>` : ""}</div>
    ${unio ? esitoConfronto(ctx, confronto) : ""}
  </div>

  <div class="card"><h3>Rendiconto di gestione</h3><div class="scorri"><table class="rendiconto">
    ${intestazioneColonne(R, P)}
    ${tabellaSezione(R, P, ["E"], confronto)}
    ${rigaTotale("T01 Risultato gestione attività ordinaria e straordinaria (E01+E02+E03+E04)", R.entrate, P?.entrate, P)}
    ${tabellaSezione(R, P, ["U"], confronto)}
    ${rigaTotale("T02 Risultato uscite ordinarie e straordinarie (U01…U10)", R.uscite, P?.uscite, P)}
    ${rigaTotale(`F ${R.avanzo >= 0 ? "Avanzo" : "Disavanzo"} di gestione (T01 − T02)`, R.avanzo, P?.avanzo, P)}
  </table></div></div>

  <div class="card"><h3>Situazione patrimoniale</h3><div class="scorri"><table class="rendiconto">
    ${intestazioneColonne(R, P)}
    ${tabellaSezione(R, P, ["A"], confronto)}
    ${rigaTotale("Totale attività", R.attivita, P?.attivita, P)}
    ${tabellaSezione(R, P, ["PAT"], confronto)}
    ${tabellaSezione(R, P, ["P", "PG"], confronto)}
    ${rigaTotale("Totale passività", R.passivita, P?.passivita, P)}
    ${rigaTotale("Totale passività + capitale", R.passivitaPiuCapitale, P?.passivitaPiuCapitale, P)}
    ${rigaTotale("Avanzo/Disavanzo di gestione", R.avanzo, P?.avanzo, P)}
  </table></div></div>

  <div class="card"><h3>Collette</h3><div class="scorri"><table class="rendiconto">
    <tr><th>Colletta</th><th class="n">C1 Raccolte</th><th class="n">C2 Versate</th><th class="n">C3 Non versate anno prima</th><th class="n">Ancora da versare</th></tr>
    ${R.collette.map((x) => `<tr><td>${nomeConto(x.conto)} <span class="codice">${x.conto}</span></td>${cellaEuro(x.C1)}${cellaEuro(x.C2)}${cellaEuro(x.C3)}${cellaEuro(x.daVersare)}</tr>`).join("")}
    <tr class="grande-tot"><td>Totale</td>${cellaEuro(R.totaleCollette.C1)}${cellaEuro(R.totaleCollette.C2)}${cellaEuro(R.totaleCollette.C3)}${cellaEuro(R.totaleCollette.daVersare)}</tr>
  </table></div>
  <p class="hint">Importo ancora da versare = C3 + C1 − C2. Corrisponde alla voce PG1 dello stato patrimoniale.</p></div>

  <div class="card"><h3>Contributo diocesano</h3><table class="rendiconto">
    <tr><td>Base per il 3%: entrate ordinarie (E01), proventi ordinari (E03-01), proventi finanziari ordinari (E04-01) e da titoli (E04-02)</td>${cellaEuro(R.contributo.base3)}</tr>
    <tr class="tot"><td>Contributo 3%</td>${cellaEuro(R.contributo.contributo3)}</tr>
    <tr><td>Base per il 10%: eredità e alienazioni (E02-03), proventi straordinari (E03-02)</td>${cellaEuro(R.contributo.base10)}</tr>
    <tr class="tot"><td>Contributo 10%</td>${cellaEuro(R.contributo.contributo10)}</tr>
    <tr class="grande-tot"><td>Totale contributo diocesano</td>${cellaEuro(R.contributo.totale)}</tr>
  </table></div>

  <div class="card"><h3>Bilancio di previsione</h3>
    <p class="hint solo-schermo">Una cifra per ogni gruppo, come nella sezione "Bilancio di previsione" del Rendiconto UNIO. Si salva da sola.</p>
    <table class="rendiconto">
      ${GRUPPI.filter((g) => g.tipo === "E" || g.tipo === "U").map((g) => `<tr><td>${g.codice.slice(1)} ${esc(g.nome)}</td>
        <td class="n"><input type="text" inputmode="decimal" class="n previsione" value="${prev[g.codice] ? formatDecimale(prev[g.codice]) : ""}" placeholder="0,00"
          data-cambia="previsione" data-gruppo="${g.codice}" aria-label="Previsione ${esc(g.nome)}"><span class="solo-stampa">${eur(prev[g.codice] || 0)}</span></td></tr>
        ${g.codice === "E04" ? `<tr class="tot"><td>Totale entrate</td>${cellaEuro(tp.entrate)}</tr>` : ""}`).join("")}
      <tr class="tot"><td>Totale uscite</td>${cellaEuro(tp.uscite)}</tr>
      <tr class="grande-tot"><td>Avanzo/Disavanzo</td>${cellaEuro(tp.avanzo)}</tr>
    </table></div>

  <div class="card"><details data-chiave="analitico"><summary>Bilancio analitico (dettaglio per sottoconto)</summary>
    <div class="scorri"><table class="rendiconto">${VOCI.map((v) => {
      const sotto = [...R.sottoconti.entries()].filter(([c, s]) => voceDi(c) === v.codice && s !== 0).sort();
      if (!sotto.length) return "";
      return `<tr class="gruppo"><td colspan="2">${v.codice} ${esc(v.nome)}</td></tr>` +
        sotto.map(([c, s]) => `<tr><td><span class="codice">${c}</span> ${nomeConto(c)}</td>${cellaEuro(s)}</tr>`).join("");
    }).join("")}</table></div>
  </details></div>

  <p class="hint">Le sezioni "Scheda anagrafica" e "Altre informazioni" (situazione fiscale, assicurazioni, allegati) si compilano direttamente in UNIO.</p>`;
}

function esitoConfronto(ctx, righe) {
  if (!righe) return `<div class="avviso">Il file ${esc(unio.nomeFile)} è del ${unio.anno}, ma sta guardando il Rendiconto ${ctx.anno}. Cambi l'anno in alto.</div>`;
  const diverse = righe.filter((r) => !r.uguale);
  if (!diverse.length) return `<div class="ok">✓ Tutte le ${righe.length} voci coincidono con UNIO (file ${esc(unio.nomeFile)}).</div>`;
  return `<div class="avviso">${diverse.length} voci su ${righe.length} sono diverse da UNIO (file ${esc(unio.nomeFile)}).
      Cause frequenti: saldi di apertura diversi, movimenti non ancora riportati in UNIO o registrati su un'altra voce.</div>
    <div class="scorri"><table class="rendiconto"><tr><th>Voce</th><th class="n">Divisio</th><th class="n">UNIO</th><th class="n">Differenza</th></tr>
    ${diverse.map((r) => `<tr><td><span class="codice">${r.codice}</span> ${esc(r.nome)}</td>${cellaEuro(r.divisio)}${cellaEuro(r.unio)}${cellaEuro(r.divisio - r.unio)}</tr>`).join("")}</table></div>`;
}

export const cambia = {
  async confronto(el, ev, ctx) {
    const file = el.files[0];
    el.value = "";
    if (!file) return;
    const u = leggiSaldiUNIO(await file.text());
    if (!u.ok) { alert(u.errore); return; }
    unio = { ...u, nomeFile: file.name };
    ctx.aggiorna();
  },
  async previsione(el, ev, ctx) {
    const v = parseEuro(el.value);
    if (Number.isNaN(v)) { toast("Importo non valido"); return; }
    const prev = { ...ctx.arch.impostazione(`previsione-${ctx.anno}`, {}), [el.dataset.gruppo]: v };
    await ctx.arch.salvaImpostazione(`previsione-${ctx.anno}`, prev);
    ctx.aggiorna();
  },
};

export const azioni = {
  stampa() { window.print(); },
  togliConfronto(el, ev, ctx) { unio = null; toast("Confronto con UNIO azzerato"); ctx.aggiorna(); },
  vai: (el, ev, ctx) => ctx.vai(el.dataset.pagina),
  csv(el, ev, ctx) {
    const { R, P } = calcola(ctx);
    const par = ctx.arch.impostazione("parrocchia", {});
    scarica(`${ctx.anno}_${par.icsc || "parrocchia"}_rendiconto_Divisio.csv`, "﻿" + saldiCSV(R, { icsc: par.icsc || "", precedente: P }), "text/csv;charset=utf-8");
  },
};
