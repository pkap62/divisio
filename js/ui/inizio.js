// Pagina "Inizio": saldi, pulsanti principali, controlli, ultimi movimenti.

import { riepilogoAnno, movimentiAnno, totaliPerConto, saldo } from "../dominio/saldi.js";
import { isCassaBanca } from "../dominio/piano.js";
import { quadra } from "../dominio/scritture.js";
import { perData } from "../dominio/csv.js";
import { esc, eur, locale } from "./util.js";
import { tabellaMovimenti } from "./elenco.js";
import { promemoria, TRIMESTRI } from "../dominio/ponte.js";
import { primoAnnoUNIO } from "./unio.js";
import { oggiISO } from "./util.js";
import { problemi as problemiFatture, elencoScadenze } from "./fatture.js";
import { riepilogo as riepilogoFatture } from "../dominio/scadenzario.js";

export function vista({ arch, anno }) {
  const tutti = arch.movimenti();
  const dellAnno = movimentiAnno(tutti, anno);
  const r = riepilogoAnno(tutti, anno);
  const tot = totaliPerConto(dellAnno);
  const casse = arch.contiAttivi().filter((c) => isCassaBanca(c.codice));
  const ultimi = dellAnno.filter((m) => m.tipo !== "apertura").sort(perData).reverse().slice(0, 6);
  const apertura = arch.movimento(`apertura-${anno}`);
  const ultimaCopia = locale.leggi("ultimaCopia", null);
  const giorni = ultimaCopia ? Math.floor((Date.now() - new Date(ultimaCopia)) / 864e5) : null;
  const tuttiInQuadratura = tutti.every((m) => quadra(m.righe));
  const perUNIO = anno >= primoAnnoUNIO(arch)
    ? promemoria(tutti, arch.impostazione("unio-invii", []), { anno, casse: casse.map((c) => c.codice), oggi: oggiISO() }) : [];

  const sf = riepilogoFatture(elencoScadenze(arch));
  const pf = problemiFatture(arch);
  const novita = locale.leggi("novita-viste", "") !== "0.6";

  return `
  <div class="avviso sperimentale"><b>Divisio è in fase sperimentale.</b> Controlli sempre movimenti, totali e Rendiconto prima di usarli
    (per esempio prima di riportarli in UNIO). Il programma è offerto così com'è: l'autore non si assume responsabilità per eventuali errori.</div>
  ${novita && locale.leggi("autore", "") ? `<div class="card evidenza"><div class="riga"><h3 class="spazio">Novità di Divisio 0.6: fatture e scadenze</h3>
    <button class="btn sec piccolo" data-azione="novitaViste">Ho capito</button></div>
    <p>Nella nuova pagina <a href="#" data-azione="vai" data-pagina="fatture">Fatture</a> si caricano le fatture ricevute (XML di Aruba o PDF, anche molte insieme).
      Restano nello <b>scadenzario</b> come "da pagare"; quando le segna come pagate, Divisio propone la voce di spesa e, solo dopo la sua conferma,
      registra l'uscita. Tutto è spiegato nella <a href="guida.html#fatture" target="_blank" rel="noopener">Guida</a>.</p></div>` : ""}
  ${!locale.leggi("autore", "") ? `<div class="card evidenza"><h3>Benvenuto in Divisio</h3>
    <p>Per cominciare, scriva il suo nome: servirà a sapere chi ha inserito ogni movimento.
      Tutte le istruzioni sono nella <a href="guida.html" target="_blank" rel="noopener">Guida</a> (anche da stampare).</p>
    <div class="riga"><input type="text" id="nome-autore" placeholder="es. don Mario" style="max-width:320px">
    <button class="btn" data-azione="salvaNome">Salva</button></div></div>` : ""}
  <h2>Anno ${anno}</h2>
  <p class="lead">La situazione della parrocchia in questo momento.</p>
  <div class="griglia g4">
    ${casse.map((c) => `<div class="card saldo"><div class="etichetta">${esc(c.nome)}</div><div class="valore ${saldo(c.codice, tot) < 0 ? "neg" : ""}">${eur(saldo(c.codice, tot))}</div></div>`).join("")}
    <div class="card saldo totale"><div class="etichetta">Totale disponibile</div><div class="valore">${eur(casse.reduce((s, c) => s + saldo(c.codice, tot), 0))}</div></div>
  </div>
  <div class="azioni-grandi">
    <button class="grande entrata" data-azione="nuovo" data-tipo="entrata">+ Entrata<small>offerte, collette, contributi…</small></button>
    <button class="grande uscita" data-azione="nuovo" data-tipo="uscita">− Uscita<small>bollette, acquisti, rimborsi…</small></button>
    <button class="grande sposta" data-azione="nuovo" data-tipo="spostamento">⇄ Sposta soldi<small>es. contanti versati in banca</small></button>
  </div>
  <div class="griglia g2">
    <div class="card"><h3>L'anno ${anno} finora</h3>
      <table><tr><td>Entrate</td><td class="n pos">${eur(r.entrate)}</td></tr>
      <tr><td>Uscite</td><td class="n neg">${eur(r.uscite)}</td></tr>
      <tr class="tot"><td>${r.avanzo >= 0 ? "Avanzo" : "Disavanzo"}</td><td class="n">${eur(r.avanzo)}</td></tr></table>
      ${r.colletteDaVersare > 0 ? `<div class="avviso">Collette ancora da versare alla Diocesi: <b>${eur(r.colletteDaVersare)}</b></div>` : ""}
    </div>
    <div class="card"><h3>Controlli</h3>
      ${tuttiInQuadratura ? `<div class="ok">✓ Tutti i movimenti sono in quadratura (Dare = Avere)</div>` : `<div class="errore">✗ C'è un movimento non in quadratura</div>`}
      ${r.quadra ? `<div class="ok">✓ I conti tornano: Attività = Passività + Patrimonio + Avanzo</div>` : `<div class="errore">✗ Lo stato patrimoniale non torna</div>`}
      ${perUNIO.map((x) => `<div class="avviso">Per UNIO: ${esc(arch.nomeConto(x.cassa))}, ${TRIMESTRI[x.trimestre][2]} –
        ${x.stato === "modificato" ? "ci sono modifiche dopo l'ultima importazione" : "da preparare e importare"}.
        <a href="#" data-azione="perUNIO" data-cassa="${x.cassa}" data-trimestre="${x.trimestre}">Apri</a></div>`).join("")}
      ${pf.length ? `<div class="errore">Fatture: scadenzario e contabilità non coincidono (${pf.length}). <a href="#" data-azione="vai" data-pagina="fatture">Sistema</a></div>` : ""}
      ${sf.scadute ? `<div class="avviso">Fatture scadute da pagare: <b>${sf.scadute}</b> (${eur(sf.totaleScadute)}). <a href="#" data-azione="vai" data-pagina="fatture">Apri lo scadenzario</a></div>` : ""}
      ${sf.presto ? `<div class="avviso">Fatture in scadenza entro 7 giorni: <b>${sf.presto}</b> (${eur(sf.totalePresto)}). <a href="#" data-azione="vai" data-pagina="fatture">Apri lo scadenzario</a></div>` : ""}
      ${apertura ? "" : `<div class="avviso">Mancano i saldi di apertura del ${anno}: senza, i saldi di cassa e banca partono da zero.
        <a href="#" data-azione="vai" data-pagina="impostazioni">Inseriscili</a> (anche più avanti).</div>`}
      ${giorni === null ? `<div class="avviso">Non è ancora stata fatta una copia di sicurezza su questo computer. <a href="#" data-azione="vai" data-pagina="impostazioni">Falla ora</a></div>`
        : giorni > 7 ? `<div class="avviso">L'ultima copia di sicurezza è di ${giorni} giorni fa. <a href="#" data-azione="vai" data-pagina="impostazioni">Fanne una nuova</a></div>`
        : `<div class="ok">✓ Copia di sicurezza fatta ${giorni === 0 ? "oggi" : giorni === 1 ? "ieri" : `${giorni} giorni fa`}</div>`}
    </div>
  </div>
  <div class="card"><h3>Ultimi movimenti</h3>${tabellaMovimenti(ultimi, arch)}
    <p class="piede"><a href="#" data-azione="vai" data-pagina="movimenti">Vedi tutti i movimenti →</a> ·
    <a href="#" data-azione="vai" data-pagina="rendiconto">Vedi il Rendiconto →</a></p></div>`;
}

export const azioni = {
  nuovo: (el, ev, ctx) => ctx.vai("registra", { tipo: el.dataset.tipo }),
  vai: (el, ev, ctx) => ctx.vai(el.dataset.pagina),
  novitaViste(el, ev, ctx) { locale.scrivi("novita-viste", "0.6"); ctx.aggiorna(); },
  perUNIO: (el, ev, ctx) => ctx.vai("unio", { cassa: el.dataset.cassa, trimestre: el.dataset.trimestre }),
  salvaNome(el, ev, ctx) {
    const nome = document.getElementById("nome-autore").value.trim();
    if (!nome) return;
    locale.scrivi("autore", nome);
    ctx.arch.impostaAutore(nome);
    ctx.aggiorna();
  },
};
