// Caricamento in Divisio dei movimenti già registrati in UNIO (pagina Movimenti), con anteprima e annullamento.
// Le righe con lo stesso "Numero registrazione" formano un solo movimento: Causale → causale, Commento → descrizione,
// Commento riga → dettaglio di ogni riga.

import { leggiEstrattoConto, aMovimenti, separaDoppioniDivisio } from "../dominio/importaUNIO.js";
import { movimentiAnno } from "../dominio/saldi.js";
import { nuovoIstante } from "../dominio/unione.js";
import { esc, eur, dataIt, locale, toast } from "./util.js";
import { isCassaBanca } from "../dominio/piano.js";
import { trovaMovimentoSimile, importoConSegno } from "../dominio/doppioni.js";
import { banchePerUNIO, unisciBanche, spostaBanca } from "../dominio/unisciBanche.js";

let anteprima = null;   // { nomeFile, errore } oppure { nomeFile, anno, movimenti, problemi, nomiDiversi, nuovi, giaPresenti, altriDellAnno, usaNomi, ... }
let aperto = false;      // riquadro aperto nella pagina Movimenti
/** Il riquadro si vede se è stato aperto o se c'è un'anteprima da confermare. */
export const riquadroAperto = () => aperto || Boolean(anteprima);
export function apriRiquadro() { aperto = true; }

const daUNIO = (arch) => arch.movimenti().filter((m) => m.origine === "UNIO");
const TIPI = { entrata: ["entrata", "entrate"], uscita: ["uscita", "uscite"], spostamento: ["spostamento", "spostamenti"], pd: ["in partita doppia", "in partita doppia"] };
const n_ = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
/** Movimenti che verranno caricati: non i possibili doppioni, a meno che l'utente li abbia spuntati. */
const daCaricare = (a) => a.movimenti.filter((m) => !a.forse.has(m.id) || a.caricaForse.has(m.id));

/**
 * Possibili doppioni tra il file di UNIO e i movimenti inseriti in Divisio (stesso importo e stessa data, o stessa descrizione):
 * Map id del movimento di UNIO → testo. Non si confrontano quelli già caricati prima da UNIO (erano già stati accettati).
 */
function possibiliDoppioni(movimenti, arch) {
  const propri = arch.movimenti().filter((m) => m.origine !== "UNIO");
  const usati = new Set(), forse = new Map();
  for (const m of movimenti) {
    if (arch.movimento(m.id)) continue;
    const s = trovaMovimentoSimile({ data: m.data, importo: importoConSegno(m), descrizioni: [m.descr] }, propri, { esclusi: usati });
    if (s) { usati.add(s.movimento.id); forse.set(m.id, s.testo); }
  }
  return forse;
}

export function vistaCard(ctx) {
  const caricati = daUNIO(ctx.arch);
  const anni = [...new Set(caricati.map((m) => m.data.slice(0, 4)))].sort();
  return `<div class="card evidenza" id="carica-unio"><div class="riga"><h3 class="spazio">Caricare i movimenti già inseriti in UNIO</h3>
      ${anteprima ? "" : `<button class="btn sec piccolo" data-azione="chiudiUNIO">Chiudi</button>`}</div>
    <ol class="passi">
      <li>In UNIO esporti i movimenti della <b>Prima Nota</b> (file <b>AMM_PRIMA_NOTA</b>; va bene anche l'estratto conto <b>AMM_ESTRATTOCONTO</b> con <b>tutti i conti</b>).</li>
      <li>Lo carichi qui sotto: prima di caricare, Divisio le mostra cosa contiene.</li>
      <li><i>Facoltativo:</i> in UNIO esporti anche il CSV dei saldi del Rendiconto e lo carichi nella pagina Rendiconto per il confronto.</li>
    </ol>
    <p class="hint">Le righe di UNIO con lo stesso <b>numero di registrazione</b> diventano un solo movimento: la <b>causale</b> resta la causale,
      il <b>commento</b> diventa la descrizione («Che cos'è?») e il <b>commento di riga</b> il dettaglio di ogni riga (es. «Esequie Mario Rossi»).
      Caricando di nuovo lo stesso file (o uno più recente) i movimenti si aggiornano, senza doppioni.</p>
    ${caricati.length ? `<div class="ok">✓ Già caricati da UNIO: ${n_(caricati.length, "movimento", "movimenti")} (${anni.join(", ")}).</div>
      <div class="riga-bottoni"><button class="btn sec" data-azione="apriRendicontoUNIO" data-anno="${anni.at(-1)}">Confronta nel Rendiconto ${anni.at(-1)}</button>
      <button class="btn pericolo" data-azione="togliUNIO">Togli i movimenti caricati da UNIO</button></div>` : ""}
    <div class="riga-bottoni"><label class="btn ${caricati.length ? "sec" : ""}">Scegli il file di UNIO…<input type="file" accept=".csv,text/csv" hidden data-cambia="fileUNIO"></label></div>
    ${anteprima ? vistaAnteprima(ctx) : ""}
  </div>`;
}

function vistaAnteprima(ctx) {
  const a = anteprima;
  if (a.errore) return `<div class="errore">${esc(a.nomeFile)}: ${esc(a.errore)}</div>`;
  const perTipo = Object.entries(a.movimenti.reduce((t, m) => ({ ...t, [m.tipo]: (t[m.tipo] || 0) + 1 }), {}))
    .map(([t, n]) => n_(n, ...(TIPI[t] ?? [t, t]))).join(", ");
  const date = a.movimenti.map((m) => m.data).sort();
  return `<div class="nota"><b>${esc(a.nomeFile)}</b> – anno ${a.anno}: <b>${n_(a.movimenti.length, "movimento", "movimenti")}</b> (${perTipo}),
      dal ${dataIt(date[0])} al ${dataIt(date.at(-1))}. Tutti in quadratura.</div>
    ${a.problemi.length ? `<div class="avviso">${a.problemi.length === 1 ? "1 registrazione di UNIO non verrà caricata" : `${a.problemi.length} registrazioni di UNIO non verranno caricate`}:</div>
      <details><summary>Vedi quali e perché</summary><ul>${a.problemi.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></details>` : ""}
    ${a.saltate.length ? `<div class="nota">${a.saltate.length === 1 ? "1 registrazione di UNIO è già" : `${a.saltate.length} registrazioni di UNIO sono già`} in Divisio
        (riepiloghi arrivati in UNIO dalla pagina «Per UNIO», oppure fatture già segnate pagate in Divisio): ${a.saltate.length === 1 ? "non verrà caricata" : "non verranno caricate"}, per non contarle due volte.</div>
      <details><summary>Vedi quali</summary><ul>${a.saltate.map((r) => `<li>${dataIt(r.data)} – ${esc(r.descr)}</li>`).join("")}</ul></details>` : ""}
    ${a.daDivisio ? `<div class="nota">${a.daDivisio === 1 ? "1 registrazione arrivata" : `${a.daDivisio} registrazioni arrivate`} in UNIO da Divisio
        ${a.daDivisio === 1 ? "verrà caricata come riepilogo" : "verranno caricate come riepiloghi"}, perché in Divisio quei movimenti non ci sono più.</div>` : ""}
    ${a.giaPresenti ? `<div class="nota">${a.giaPresenti === 1 ? "1 di questi movimenti era già stato caricato: verrà aggiornato, non duplicato." : `${a.giaPresenti} di questi movimenti erano già stati caricati: verranno aggiornati, non duplicati.`}</div>` : ""}
    ${a.altriDellAnno ? `<div class="avviso">Nel ${a.anno} ci sono già ${a.altriDellAnno} movimenti inseriti a mano in Divisio: si sommeranno a quelli di UNIO.</div>` : ""}
    ${a.nuovi.length ? `<div class="nota">${a.nuovi.length === 1 ? "Verrà aggiunto 1 sottoconto che esiste" : `Verranno aggiunti ${a.nuovi.length} sottoconti che esistono`} solo in UNIO: ${a.nuovi.map((x) => `${esc(x.nome)} <span class="codice">${x.codice}</span>`).join(", ")}.</div>` : ""}
    ${a.nomiDiversi.length ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="usaNomi" ${a.usaNomi ? "checked" : ""}>
        Usa in Divisio i nomi dei sottoconti di UNIO (${a.nomiDiversi.length}):
        ${a.nomiDiversi.map((x) => `«${esc(x.attuale)}» → «${esc(x.unio)}»`).join(", ")}</label>` : ""}
    ${a.forse.size ? `<div class="avviso">${a.forse.size === 1 ? "1 registrazione di UNIO potrebbe essere un doppione" : `${a.forse.size} registrazioni di UNIO potrebbero essere doppioni`}
        di movimenti inseriti a mano in Divisio (stesso importo e stessa data, oppure stessa descrizione).
        Senza spunta non verranno caricate; spunti quelle che sono davvero movimenti diversi.</div>
      <ul class="elenco-forse">${a.movimenti.filter((m) => a.forse.has(m.id)).map((m) => `<li><label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="caricaForse" data-id="${esc(m.id)}" ${a.caricaForse.has(m.id) ? "checked" : ""}>
        <span><b>${dataIt(m.data)} – ${esc(m.descr)}</b><br><span class="hint">${esc(a.forse.get(m.id))}</span></span></label></li>`).join("")}</ul>` : ""}
    ${vistaBanche(a)}
    <details><summary>Vedi le registrazioni come entreranno in Divisio</summary>${tabellaAnteprima(a)}</details>
    ${a.conCausali && !ctx.arch.impostazione("causale-unio", false) ? `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="accendiCausale" ${a.accendiCausale ? "checked" : ""}>
        Il file ha le causali: mostrale anche nella pagina Registra (si può cambiare in Impostazioni)</label>` : ""}
    <div class="riga-bottoni"><button class="btn" data-azione="caricaUNIO" ${daCaricare(a).length ? "" : "disabled"}>Carica ${n_(daCaricare(a).length, "movimento", "movimenti")}</button>
      <button class="btn sec" data-azione="annullaAnteprima">Annulla</button></div>`;
}

/** Banche: il numero giusto è quello di UNIO. Divisio propone di spostare o unire le banche che hanno un altro numero. */
function vistaBanche(a) {
  if (!a.banche.length) return "";
  const sposta = a.banche.filter((b) => b.tipo === "sposta");
  const unisci = a.banche.filter((b) => b.tipo === "unisci");
  const htmlSposta = sposta.map((b) => `<div class="avviso">In UNIO il numero <b>${b.unio}</b> è «${esc(b.nomeUNIO)}», ma in Divisio è «${esc(b.nomeDivisio)}».
      Vale il numero di UNIO: «${esc(b.nomeDivisio)}» passa al numero ${b.verso}, con tutti i suoi movimenti, e ${b.unio} diventa «${esc(b.nomeUNIO)}».</div>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="spostaBanca" data-unio="${b.unio}" ${b.sposta ? "checked" : ""}>
      <span>Prima di caricare, sposta «${esc(b.nomeDivisio)}» al numero ${b.verso}</span></label>`).join("");
  const perUNIO = [...new Set(unisci.map((b) => b.unio))];
  const htmlUnisci = perUNIO.map((codice) => {
    const coppie = unisci.filter((b) => b.unio === codice);
    const nomeUNIO = coppie[0].nomeUNIO;
    return `<div class="avviso">In UNIO la banca «${esc(nomeUNIO)}» ha il numero <b>${codice}</b>.
        ${coppie.length === 1 && coppie[0].proposta ? `In Divisio la stessa banca sembra «${esc(coppie[0].nomeDivisio)}», con il numero <b>${coppie[0].divisio}</b>.` : "È una di queste banche di Divisio?"}
        Se sono la stessa banca, conviene unirle sul numero di UNIO: altrimenti i movimenti restano divisi fra due numeri
        (in Movimenti, scegliendo la banca, non si vedrebbero tutti) e i file per UNIO userebbero il conto sbagliato.</div>
      ${coppie.map((b) => `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="unisciBanca" data-unio="${b.unio}" data-divisio="${b.divisio}" ${b.unisci ? "checked" : ""}>
        <span>Dopo il caricamento, unisci «${esc(b.nomeDivisio)}» (${b.divisio}) di Divisio con «${esc(b.nomeUNIO)}» (${b.unio}) di UNIO: resta il numero ${b.unio}, con il nome «${esc(b.nomeDivisio)}»</span></label>`).join("")}`;
  }).join("");
  return htmlSposta + htmlUnisci;
}

/** Ogni registrazione: data, numero, causale, descrizione, righe (voce, dettaglio, importo) e cassa o banca. */
function tabellaAnteprima(a) {
  const nome = (c) => esc(a.nomi.get(c) ?? c);
  return `<div class="scorri"><table class="anteprima-unio"><tr><th>Data</th><th>N.</th><th>Causale</th><th>Descrizione</th><th>Righe (voce · dettaglio)</th><th>Cassa / banca</th><th class="n">Importo</th></tr>
    ${a.movimenti.map((m) => {
      const voci = m.righe.filter((r) => !isCassaBanca(r.conto)), casse = m.righe.filter((r) => isCassaBanca(r.conto));
      const righe = (voci.length ? voci : m.righe).map((r) => `<div>${nome(r.conto)}${r.nota ? ` · <i>${esc(r.nota)}</i>` : ""}
        <span class="hint">${r.avere ? "+" : "−"}${eur(r.avere || r.dare)}</span></div>`).join("");
      const netto = casse.reduce((s, r) => s + r.dare - r.avere, 0);
      return `<tr><td class="nowrap">${dataIt(m.data)}</td><td>${esc(m.id.split("-").at(-1))}</td><td>${esc(m.causale ?? "")}</td><td>${esc(m.descr)}</td>
        <td>${righe}</td><td>${voci.length ? casse.map((r) => nome(r.conto)).join(", ") : ""}</td>
        <td class="n ${netto > 0 ? "pos" : netto < 0 ? "neg" : ""}">${netto ? (netto > 0 ? "+" : "−") + eur(Math.abs(netto)) : ""}</td></tr>`;
    }).join("")}</table></div>`;
}

export const cambia = {
  async fileUNIO(el, ev, ctx) {
    const file = el.files[0];
    el.value = "";
    if (!file) return;
    const l = leggiEstrattoConto(await file.text());
    if (!l.ok) { anteprima = { nomeFile: file.name, errore: l.errore }; ctx.aggiorna(); return; }
    const { daCaricare, saltate } = separaDoppioniDivisio(l.registrazioni, ctx.arch.movimenti(), ctx.arch.fatture());
    const movimenti = aMovimenti(daCaricare, l.anno);
    const conti = ctx.arch.conti;
    // banche con un numero in UNIO e un altro in Divisio (es. A02-01-02 in UNIO, A02-01-04 aggiunta in Divisio),
    // o con il numero che in UNIO è di un'altra banca
    const banche = banchePerUNIO(l.nomi, conti, new Set(movimenti.flatMap((m) => m.righe.map((r) => r.conto))))
      .map((b) => (b.tipo === "sposta" ? { ...b, sposta: true } : { ...b, unisci: b.proposta }));
    const spostati = new Set(banche.filter((b) => b.tipo === "sposta").map((b) => b.divisio));
    anteprima = {
      nomeFile: file.name, anno: l.anno, movimenti, problemi: l.problemi, usaNomi: true, saltate, nomi: l.nomi,
      conCausali: movimenti.some((m) => m.causale), accendiCausale: true,
      daDivisio: daCaricare.filter((r) => r.daDivisio).length,
      nomiDiversi: [...l.nomi].filter(([c, n]) => conti.has(c) && !spostati.has(c) && conti.get(c).nome !== n).map(([codice, unio]) => ({ codice, attuale: conti.get(codice).nome, unio })),
      nuovi: [...l.nomi].filter(([c]) => !conti.has(c)).map(([codice, nome]) => ({ codice, nome })),
      giaPresenti: movimenti.filter((m) => ctx.arch.movimento(m.id)).length,
      forse: possibiliDoppioni(movimenti, ctx.arch), caricaForse: new Set(),
      banche,
      altriDellAnno: movimentiAnno(ctx.arch.movimenti(), l.anno).filter((m) => m.origine !== "UNIO" && m.tipo !== "apertura").length,
    };
    ctx.aggiorna();
  },
  usaNomi(el) { anteprima.usaNomi = el.checked; },
  unisciBanca(el, ev, ctx) {
    // per ogni codice di UNIO si unisce al massimo una banca di Divisio
    for (const b of anteprima.banche) if (b.tipo === "unisci" && b.unio === el.dataset.unio) b.unisci = el.checked && b.divisio === el.dataset.divisio;
    ctx.aggiorna();
  },
  spostaBanca(el, ev, ctx) {
    for (const b of anteprima.banche) if (b.tipo === "sposta" && b.unio === el.dataset.unio) b.sposta = el.checked;
    ctx.aggiorna();
  },
  caricaForse(el, ev, ctx) { if (el.checked) anteprima.caricaForse.add(el.dataset.id); else anteprima.caricaForse.delete(el.dataset.id); ctx.aggiorna(); },
  accendiCausale(el) { anteprima.accendiCausale = el.checked; },
};

export const azioni = {
  apriUNIO(el, ev, ctx) { aperto = true; ctx.aggiorna(); document.getElementById("carica-unio")?.scrollIntoView({ block: "start" }); },
  chiudiUNIO(el, ev, ctx) { aperto = false; anteprima = null; ctx.aggiorna(); },
  annullaAnteprima(el, ev, ctx) { anteprima = null; ctx.aggiorna(); },
  async caricaUNIO(el, ev, ctx) {
    const a = anteprima;
    if (!a?.movimenti) return;
    el.disabled = true;
    const autore = locale.leggi("autore", "") || "Utente";
    const ora = new Date().toISOString();
    let t = null;
    const marca = () => (t = nuovoIstante(t));
    const movimenti = daCaricare(a).map((m) => ({ ...m, creatoIl: ora, modificatoIl: marca(), autore }));
    const saltati = a.movimenti.length - movimenti.length;
    const daSpostare = a.banche.filter((b) => b.tipo === "sposta" && b.sposta);
    const daUnire = a.banche.filter((b) => b.tipo === "unisci" && b.unisci);
    const datiBanche = (arch) => ({ conti: arch.conti, movimenti: arch.movimenti(), fatture: arch.fatture(), impostazioni: [...arch.impostazioniCon("banca:"), ...arch.impostazioniCon("formato-banca:")] });
    const salvaBanche = (u) => ctx.arch.salvaInsieme({ conti: u.conti, movimenti: u.movimenti, movimentiDaEliminare: u.movimentiDaEliminare, fatture: u.fatture, impostazioni: u.impostazioni });
    const n = await ctx.arch.insieme(`Caricamento di ${n_(movimenti.length, "movimento", "movimenti")} da UNIO`, async () => {
      // 1. le banche di Divisio che hanno il numero che in UNIO è di un'altra banca passano al numero dopo l'ultima banca
      for (const b of daSpostare) {
        if (ctx.arch.conti.has(b.divisio) && !ctx.arch.conti.has(b.verso)) await salvaBanche(spostaBanca(datiBanche(ctx.arch), b.divisio, b.verso));
      }
      // 2. sottoconti nuovi e nomi di UNIO (dopo gli spostamenti: il numero lasciato libero prende il nome di UNIO)
      const attuali = ctx.arch.conti;
      const spostati = new Set(daSpostare.map((b) => b.divisio));
      const conti = [...a.nomi]
        .filter(([c, nome]) => !attuali.has(c) || spostati.has(c) || (a.usaNomi && attuali.get(c).nome !== nome))
        .map(([codice, nome]) => (attuali.has(codice) && !spostati.has(codice)
          ? { ...attuali.get(codice), nome, modificatoIl: marca(), autore }
          : { codice, nome, attivo: true, modificatoIl: marca(), autore }));
      // le casse e banche usate dai movimenti di UNIO tornano in uso (altrimenti quei movimenti non si potrebbero scegliere)
      const casseUNIO = new Set(movimenti.flatMap((m) => m.righe.map((r) => r.conto)).filter(isCassaBanca));
      for (const c of casseUNIO) {
        const gia = conti.find((x) => x.codice === c), qui = attuali.get(c);
        if (gia) gia.attivo = true;
        else if (qui && qui.attivo === false) conti.push({ ...qui, attivo: true, modificatoIl: marca(), autore });
      }
      const cambiati = await ctx.arch.unisci({ conti, movimenti, impostazioni: [] }, { etichetta: "da UNIO" });
      if (a.conCausali && a.accendiCausale && !ctx.arch.impostazione("causale-unio", false)) await ctx.arch.salvaImpostazione("causale-unio", true);
      // 3. la stessa banca con un altro numero in Divisio si unisce sul numero di UNIO
      for (const b of daUnire) {
        if (!ctx.arch.conti.has(b.unio) || !ctx.arch.conti.has(b.divisio)) continue;
        await salvaBanche(unisciBanche(datiBanche(ctx.arch), b.divisio, b.unio, b.nomeDivisio));
      }
      return cambiati;
    });
    anteprima = null;
    aperto = false;
    toast(`${movimenti.length === 1 ? "Caricato 1 movimento" : `Caricati ${movimenti.length} movimenti`} da UNIO ✓${saltati ? ` (${n_(saltati, "possibile doppione saltato", "possibili doppioni saltati")})` : ""}`
      + daSpostare.map((b) => `. «${b.nomeDivisio}» ora ha il numero ${b.verso}`).join("")
      + daUnire.map((b) => `. Banche unite: «${b.nomeDivisio}» ora ha il numero di UNIO ${b.unio}`).join(""));
    if (!n) toast("Nessun cambiamento: i movimenti erano già tutti caricati");
    ctx.aggiorna();
  },
  async togliUNIO(el, ev, ctx) {
    const caricati = daUNIO(ctx.arch);
    if (!confirm(`Togliere da Divisio i ${caricati.length} movimenti caricati da UNIO?\n\nIn UNIO non cambia nulla. I movimenti inseriti a mano in Divisio restano.`)) return;
    const autore = locale.leggi("autore", "") || "Utente";
    let t = null;
    await ctx.arch.unisci({ conti: [], impostazioni: [], movimenti: caricati.map((m) => ({ ...m, eliminato: true, modificatoIl: (t = nuovoIstante(t ?? m.modificatoIl)), autore })) },
      { etichetta: `Tolti ${n_(caricati.length, "movimento caricato", "movimenti caricati")} da UNIO` });
    toast("Movimenti di UNIO tolti");
    ctx.aggiorna();
  },
  apriRendicontoUNIO(el, ev, ctx) {
    ctx.anno = Number(el.dataset.anno);
    locale.scrivi("anno", ctx.anno);
    ctx.vai("rendiconto");
  },
};
