// Pagina "Impostazioni": copia di sicurezza, saldi di apertura, dati della parrocchia, piano dei conti.

import { creaBackup, leggiBackup, datiPerRipristino } from "../dominio/backup.js";
import { scritturaApertura, CONTO_PATRIMONIO } from "../dominio/scritture.js";
import { parseEuro, formatDecimale } from "../dominio/importi.js";
import { GRUPPI, isCassaBanca, casseInOrdine, prossimoOrdineCassa, crescInDare, tipoDi, nuovoCodiceSottoconto, voce, gruppo, contiUsati } from "../dominio/piano.js";
import { causaliPer, libera } from "../dominio/causali.js";
import { esc, eur, oggiISO, scarica, toast, locale, opzioniConti, $ } from "./util.js";
import { vistaCard as cardCondivisione, azioni as azioniCondivisione, condivisioneImpostata } from "./condivisione.js";
import { teatro } from "./fatture.js";
import { apriRiquadro as apriCaricaUNIO } from "./importa.js";
import { VERSIONE } from "../versione.js";
import { unisciBanche, stessaBanca } from "../dominio/unisciBanche.js";
import { ripartiDaZero, GRUPPI_IMPOSTAZIONI } from "../dominio/azzera.js";
import { tornaDaPagare } from "../dominio/scadenzario.js";

// Cestino rosso per eliminare un sottoconto (disegnato qui, senza file in più)
const ICONA_CESTINO = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

/* ---------- cassa e banche ---------- */
// La cassa è sempre presente; banche (e PayPal) si aggiungono, si rinominano e si tolgono.
// Negli elenchi compaiono nell'ordine in cui sono state aggiunte (vedi casseInOrdine).
const CASSA = "A02-01-01";
const VOCE_CASSE = "A02-01";
const BANCHE_PROPOSTE = [
  "Intesa Sanpaolo", "UniCredit", "BNL BNP Paribas", "Banco BPM", "Monte dei Paschi di Siena", "BPER Banca",
  "Crédit Agricole Italia", "Banca Popolare di Sondrio", "Banca Etica", "ChiantiBanca", "Banca di Cambiano",
  "Banco Fiorentino", "Banca Alta Toscana", "BancoPosta (Poste Italiane)", "PayPal",
];
const stessoNome = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function cardBanche(arch) {
  const tutti = casseInOrdine(arch.conti.values()).filter((c) => c.codice !== CASSA);
  const inUso = tutti.filter((c) => c.attivo !== false);
  const tolti = tutti.filter((c) => c.attivo === false);
  const proposte = BANCHE_PROPOSTE.filter((n) => !inUso.some((c) => stessoNome(c.nome, n)));
  return `
  <div class="card"><h3>Cassa e banche</h3>
    <p class="hint">Dove stanno i soldi della parrocchia. La <b>cassa</b> c'è sempre; poi aggiunga una riga per ogni banca o conto di appoggio
      (anche <b>PayPal</b>, se lo usa). Compariranno nelle registrazioni, nei saldi di apertura e nella pagina Per UNIO.</p>
    <div class="sottoconto"><span class="codice">${CASSA}</span><b class="spazio">${esc(arch.nomeConto(CASSA))}</b><span class="hint">sempre presente</span></div>
    ${inUso.map((c) => `<div class="sottoconto"><span class="codice">${c.codice}</span>
      <input type="text" value="${esc(c.nome)}" data-cambia="rinomina" data-codice="${c.codice}" aria-label="Nome della banca ${c.codice}">
      <button class="btn sec piccolo" data-azione="bancaTogli" data-codice="${c.codice}">Togli</button></div>`).join("")}
    ${inUso.length ? "" : `<p class="hint">Nessuna banca: per ora si usa solo la cassa.</p>`}
    <div class="riga" style="margin-top:12px">
      <input type="text" id="banca-nuova" list="banche-proposte" placeholder="Scelga dall'elenco o scriva il nome della banca" style="max-width:360px" aria-label="Nuova banca">
      <datalist id="banche-proposte">${proposte.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <button class="btn sec" data-azione="bancaAggiungi">+ Aggiungi</button>
    </div>
    ${tolti.length ? `<p class="hint">Non più in uso (i movimenti già registrati restano): ${tolti.map((c) =>
      `${esc(c.nome)} <span class="codice">${c.codice}</span> <button class="btn sec piccolo" data-azione="bancaRimetti" data-codice="${c.codice}">Rimetti in uso</button>`).join(" ")}</p>` : ""}
    ${vistaUnione(arch, tutti)}
  </div>`;
}

/* ---------- ripartire da zero ---------- */
// Scelte del riquadro "Ripartire da zero" (null = riquadro chiuso). I fornitori ricordati restano, se non si sceglie altrimenti.
let riparti = null;
const nuoveScelte = () => ({ movimenti: true, fatture: true, unio: true, previsioni: true, ricordati: false, capito: false });
const datiRiparti = (arch) => ({ movimenti: arch.movimenti(), fatture: arch.fatture(), impostazioni: arch.impostazioniCon("") });

function cardRiparti(arch) {
  if (!riparti) {
    return `<div class="card solo-schermo"><details data-chiave="riparti"><summary>Ripartire da zero</summary>
      <p>Cancella da Divisio i movimenti di <b>tutti gli anni</b> e le fatture dello scadenzario, per ricominciare da capo
        (per esempio dopo le prove). Restano i dati della parrocchia, cassa e banche, piano dei conti e impostazioni. In UNIO non cambia nulla.</p>
      <p class="hint">Per cancellare solo un anno: Movimenti → «Azzera i movimenti del …». Solo le fatture: Fatture → «Azzera lo scadenzario».</p>
      <button class="btn pericolo" data-azione="apriRiparti">Ripartire da zero…</button></details></div>`;
  }
  const d = datiRiparti(arch);
  const conta = (g) => d.impostazioni.filter((i) => GRUPPI_IMPOSTAZIONI[g].vale(i.chiave)).length;
  const n = (k, uno, molti) => (k === 1 ? `1 ${uno}` : `${k} ${molti}`);
  const voci = [
    ["movimenti", `Movimenti di tutti gli anni, anche i saldi di apertura (${n(d.movimenti.length, "movimento", "movimenti")})`],
    ["fatture", `Fatture dello scadenzario (${n(d.fatture.length, "fattura", "fatture")})`],
    ["unio", `Importazioni segnate per UNIO e segni «Rendiconto inviato» (${conta("unio")})`],
    ["previsioni", `Bilanci di previsione (${conta("previsioni")})`],
    ["ricordati", `Fornitori e nomi ricordati: voci proposte, PDF, estratti conto (${conta("ricordati")}). Se li tiene, Divisio continuerà a proporre le scelte già fatte.`],
  ];
  const niente = !voci.some(([k]) => riparti[k]);
  return `<div class="card evidenza solo-schermo" id="riparti"><h3>Ripartire da zero</h3>
    <p>Scelga cosa cancellare da Divisio:</p>
    ${voci.map(([k, testo]) => `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="ripartiScelta" data-k="${k}" ${riparti[k] ? "checked" : ""}> ${esc(testo)}</label>`).join("")}
    ${riparti.fatture && !riparti.movimenti ? `<div class="nota">Le uscite delle fatture già pagate restano in contabilità come movimenti normali.</div>` : ""}
    ${riparti.movimenti && !riparti.fatture ? `<div class="nota">Le fatture restano; quelle pagate tornano «da pagare», perché la loro uscita viene cancellata.</div>` : ""}
    <div class="avviso">Restano sempre: dati della parrocchia, cassa e banche, piano dei conti, impostazioni e collegamento per lavorare insieme.
      Se Divisio è condiviso, quello che cancella sparisce anche dagli altri computer.</div>
    <p>Prima di cancellare, Divisio scarica una <b>copia di sicurezza</b> (cartella Download): con quella, o subito con «↶ Annulla», si torna indietro.</p>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="ripartiCapito" ${riparti.capito ? "checked" : ""}> Ho capito: questi dati verranno cancellati da Divisio</label>
    <div class="riga-bottoni"><button class="btn pericolo" data-azione="confermaRiparti" ${riparti.capito && !niente ? "" : "disabled"}>Cancella e riparti da zero</button>
      <button class="btn sec" data-azione="chiudiRiparti">Annulla</button></div>
  </div>`;
}

/* ---------- due nomi per la stessa banca ---------- */
let unione = null;   // { tieni, unisci, nome } scelti nel riquadro "Due nomi per la stessa banca?"

/** Movimenti per ogni cassa o banca, e quanti caricati da UNIO. */
function usoCasse(arch) {
  const uso = new Map();
  for (const m of arch.movimenti()) for (const c of new Set(m.righe.map((r) => r.conto).filter(isCassaBanca))) {
    const u = uso.get(c) ?? { n: 0, unio: 0 };
    u.n++; if (m.origine === "UNIO") u.unio++;
    uso.set(c, u);
  }
  return uso;
}

/** Coppia proposta: due banche con lo stesso nome (es. «Banca BPM» e «Banco BPM»); si tiene quella usata da UNIO. */
function coppiaProposta(banche, uso) {
  for (const a of banche) for (const b of banche) {
    if (a.codice >= b.codice || !stessaBanca(a.nome, b.nome)) continue;
    const [tieni, unisci] = (uso.get(b.codice)?.unio ?? 0) > (uso.get(a.codice)?.unio ?? 0) ? [b, a] : [a, b];
    return { tieni: tieni.codice, unisci: unisci.codice, nome: (unisci.attivo !== false ? unisci : tieni).nome };
  }
  return null;
}

function vistaUnione(arch, banche) {
  if (banche.length < 2) return "";
  const uso = usoCasse(arch);
  const proposta = coppiaProposta(banche, uso);
  if (!unione || ![unione.tieni, unione.unisci].every((c) => banche.some((b) => b.codice === c))) unione = proposta ?? { tieni: banche[0].codice, unisci: banche[1].codice, nome: banche[0].nome };
  const etichetta = (c) => { const u = uso.get(c.codice); return `${c.nome} (${c.codice})${c.attivo === false ? " – non in uso" : ""} – ${u ? `${u.n} movimenti${u.unio ? `, ${u.unio} da UNIO` : ""}` : "nessun movimento"}`; };
  const opz = (scelto) => banche.map((c) => `<option value="${c.codice}" ${c.codice === scelto ? "selected" : ""}>${esc(etichetta(c))}</option>`).join("");
  return `<details data-chiave="unisci-banche" ${proposta ? "open" : ""} style="margin-top:14px"><summary>Due nomi per la stessa banca?</summary>
    ${proposta ? `<div class="avviso">«${esc(arch.nomeConto(proposta.tieni))}» (${proposta.tieni}) e «${esc(arch.nomeConto(proposta.unisci))}» (${proposta.unisci}) sembrano la stessa banca.
      I movimenti sono divisi fra i due codici: per esempio, scegliendo una delle due in Movimenti non si vedono quelli dell'altra.</div>` : ""}
    <p class="hint">Succede quando la banca è stata aggiunta in Divisio e in UNIO la stessa banca ha un altro codice.
      Tenga il codice <b>di UNIO</b> (quello dei movimenti caricati da UNIO): così anche i file per UNIO useranno il conto giusto.
      Tutti i movimenti, le fatture pagate e le scelte ricordate degli estratti conto passano alla banca tenuta; l'altro codice sparisce.
      Si può annullare con «↶ Annulla» in alto.</p>
    <div class="griglia g2">
      <div><label class="campo" for="u-tieni">Banca da tenere (codice di UNIO)</label><select id="u-tieni" data-cambia="unioneTieni">${opz(unione.tieni)}</select></div>
      <div><label class="campo" for="u-unisci">È la stessa banca di</label><select id="u-unisci" data-cambia="unioneUnisci">${opz(unione.unisci)}</select></div>
      <div><label class="campo" for="u-nome">Nome da usare</label><input id="u-nome" type="text" value="${esc(unione.nome)}" data-cambia="unioneNome"></div>
    </div>
    <div class="riga-bottoni"><button class="btn" data-azione="unisciBanche" ${unione.tieni === unione.unisci ? "disabled" : ""}>Unisci le due banche</button></div>
  </details>`;
}

/* ---------- causale come in UNIO (facoltativa, spenta all'inizio) ---------- */
function cardCausale(arch) {
  const attiva = Boolean(arch.impostazione("causale-unio", false));
  return `<div class="card"><h3>Causale come in UNIO</h3>
    <p class="hint">In UNIO ogni registrazione ha tre testi: la <b>causale</b> (sullo schermo di UNIO si chiama «Tipologia operazione», es. «Offerte per Sacramenti»),
      il <b>commento</b> («Descrizione», es. «Offerte funerali novembre») e il <b>commento di riga</b> («Descrizione dettaglio», es. «Esequie Mario Rossi»).
      Divisio ha sempre la descrizione e il dettaglio di ogni riga; la causale è facoltativa.</p>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="causaleAttiva" ${attiva ? "checked" : ""}>
      Nella pagina Registra mostra anche la causale</label>
    ${attiva ? `<p class="hint">In Registra si sceglie la causale dall'elenco della Diocesi, come in UNIO: poi l'elenco delle voci mostra <b>solo le voci di quella causale</b>
      (es. «EOO · Offerte ordinarie» → benedizioni, lumi votivi, offerte diverse…). Con «nessuna causale» si vedono tutte le voci.
      Se si sceglie prima la voce, Divisio propone la causale (prima quella già usata per quella voce, anche nei movimenti caricati da UNIO).
      La causale compare nei Dettagli dei movimenti, nella ricerca e nel file CSV.</p>
      ${elencoCausali(arch)}` : ""}
  </div>`;
}

// Elenco delle causali con le loro voci, solo da vedere: le causali le decide la Diocesi (in UNIO la parrocchia non le può cambiare).
function elencoCausali(arch) {
  const nome = (k) => (k.length === 3 ? gruppo(k)?.nome : k.length === 6 ? voce(k)?.nome : arch.nomeConto(k)) ?? k;
  const voci = (c) => {
    if (c.modo === "spostamento") return "cassa e banche";
    if (libera(c)) return "tutti i conti";
    const v = [...c.voci, ...c.extra].map((k) => `${esc(nome(k))} <span class="codice">${k}</span>`).join(", ");
    return c.modo === "pd" ? v : `${v} + cassa o banca`;
  };
  const tutte = causaliPer("pd", { teatro: teatro(arch).attivo });
  return `<details data-chiave="elenco-causali"><summary>Vedi le causali e le loro voci (${tutte.length})</summary>
    <p class="hint">Sono le causali della Diocesi di Firenze, come in UNIO. ${teatro(arch).attivo
      ? "Le causali del teatro (ETE, UTE) in Divisio hanno anche la cassa e le banche." : "Le causali del teatro (ETE, UTE) compaiono se è accesa la funzione «Fatture del teatro o di altre gestioni»."}
      Quelle segnate «solo partita doppia» si usano con «Sono pratico: usa la partita doppia».</p>
    <div class="scorri"><table class="righe"><tr><th>Causale</th><th>Tipo</th><th>Voci</th></tr>
      ${tutte.map((c) => `<tr><td><b>${esc(c.codice)}</b> · ${esc(c.descr)}</td><td>${esc(c.tipologia)}${c.modo === "pd" ? " <span class=\"hint\">(solo partita doppia)</span>" : ""}</td><td>${voci(c)}</td></tr>`).join("")}
    </table></div></details>`;
}

/* ---------- fatture del teatro o di altre gestioni (facoltativo, spento per tutti all'inizio) ---------- */
function cardTeatro(arch) {
  const t = teatro(arch);
  return `<div class="card"><h3>Fatture del teatro o di altre gestioni</h3>
    <p class="hint">Solo per le parrocchie che ricevono anche fatture di un teatro, un cinema o un'altra gestione separata.
      Se non serve, la lasci spenta: non comparirà da nessuna parte.</p>
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="teatroAttivo" ${t.attivo ? "checked" : ""}>
      Per ogni fattura chiedimi di chi è</label>
    ${t.attivo ? `<p>Quando carica le fatture (e quando le segna pagate) Divisio chiede di scegliere tra:</p>
      <ol class="passi">
        <li><b>Della parrocchia</b>: entra in contabilità per intero.</li>
        <li><b>Del teatro o di altra gestione</b>: non entra in contabilità; resta da parte, nell'elenco «Teatro e altre gestioni» della pagina Fatture.</li>
        <li><b>Al 50%</b>: il totale con l'IVA si divide a metà e in contabilità entra solo una metà.</li>
      </ol>
      <p class="hint">Divisio ricorda la scelta fatta per ogni fornitore e la volta dopo la propone già; lei la vede sempre e può confermarla o cambiarla.</p>
      <label class="campo" for="t-parole">Parole che indicano il teatro o l'altra gestione (facoltativo)</label>
      <input id="t-parole" type="text" value="${esc(t.parole.join(", "))}" placeholder="es. Sala della Comunità, cinema, teatro" data-cambia="teatroParole">
      <p class="hint">Separate da virgole. Se una fattura le contiene (nell'intestazione o nella descrizione), Divisio propone «del teatro o di altra gestione» e chiede di confermare.</p>` : ""}
  </div>`;
}

const CAMPI_PARROCCHIA = [
  ["nome", "Nome della parrocchia"], ["icsc", "Codice ICSC"], ["indirizzo", "Indirizzo"], ["comune", "Comune"],
  ["provincia", "Provincia"], ["codiceFiscale", "Codice fiscale"], ["telefono", "Telefono"], ["email", "E-mail"],
  ["parroco", "Parroco"], ["parrocoDal", "Parroco dal"],
];

/* ---------- saldi di apertura (modulo in compilazione) ---------- */
let AP = null;   // { anno, casse: {codice: testo}, altre: [{conto, importo}] }

function preparaApertura(ctx) {
  const m = ctx.arch.movimento(`apertura-${ctx.anno}`);
  const naturale = (r) => (crescInDare(r.conto) ? r.dare - r.avere : r.avere - r.dare);
  AP = { anno: ctx.anno, casse: {}, altre: [] };
  for (const r of m?.righe ?? []) {
    if (r.conto === CONTO_PATRIMONIO) continue;
    if (isCassaBanca(r.conto)) AP.casse[r.conto] = formatDecimale(naturale(r));
    else AP.altre.push({ conto: r.conto, importo: formatDecimale(naturale(r)) });
  }
}

function vociApertura() {
  return [...Object.entries(AP.casse).map(([conto, t]) => ({ conto, importo: parseEuro(t) })),
          ...AP.altre.filter((x) => x.conto).map((x) => ({ conto: x.conto, importo: parseEuro(x.importo) }))];
}

function riepilogoApertura() {
  const voci = vociApertura();
  if (voci.some((v) => Number.isNaN(v.importo))) return `<div class="errore">C'è un importo non valido.</div>`;
  const pat = scritturaApertura(voci).find((r) => r.conto === CONTO_PATRIMONIO);
  const valore = pat ? pat.avere - pat.dare : 0;
  return `<div class="nota">Patrimonio netto calcolato da Divisio: <b>${eur(valore)}</b></div>`;
}

export function prepara(ctx) { preparaApertura(ctx); }

export function vista(ctx) {
  const { arch, anno } = ctx;
  if (!AP || AP.anno !== anno) preparaApertura(ctx);
  const par = arch.impostazione("parrocchia", {});
  const casse = casseInOrdine(arch.contiAttivi());
  const ultimaCopia = locale.leggi("ultimaCopia", null);
  const altriConti = arch.contiAttivi();
  const usati = contiUsati(arch.movimenti());   // sottoconti usati da movimenti (di tutti gli anni): non si possono eliminare

  return `
  <h2>Impostazioni</h2>
  <p class="lead">Copie di sicurezza, saldi iniziali, dati della parrocchia e piano dei conti.</p>

  <div class="card"><h3>Copia di sicurezza</h3>
    <p>Salvi spesso una copia su file, per esempio su una chiavetta o in una cartella di Google Drive. Se il computer si rompe, con quel file si riparte.</p>
    <p class="hint">${ultimaCopia ? `Ultima copia da questo computer: ${new Date(ultimaCopia).toLocaleString("it-IT")}` : "Da questo computer non è ancora stata fatta nessuna copia."}</p>
    <div class="riga-bottoni"><button class="btn" data-azione="salvaCopia">Salva una copia su file</button>
      <label class="btn sec">Ripristina da file…<input type="file" accept=".json,application/json" hidden data-cambia="ripristina"></label></div>
  </div>

  ${cardCondivisione()}

  ${cardBanche(arch)}

  <div class="card"><h3>Saldi di apertura al 1° gennaio ${anno}</h3>
    <p class="hint">Quanto c'era davvero in cassa e in banca all'inizio dell'anno, ed eventuali collette, crediti o debiti rimasti dall'anno prima.
      Si possono inserire o correggere anche più avanti: i conti si aggiornano da soli. Per una banca "in rosso" scriva il segno meno.</p>
    <div class="griglia g4">${casse.map((c) => `<div><label class="campo" for="ap-${c.codice}">${esc(c.nome)}</label>
      <input id="ap-${c.codice}" type="text" inputmode="decimal" placeholder="0,00" value="${esc(AP.casse[c.codice] ?? "")}" data-input="apCassa" data-conto="${c.codice}"></div>`).join("")}</div>
    ${AP.altre.length ? `<table class="pd"><tr><th>Altro (collette da versare, crediti, debiti…)</th><th class="n">Importo</th><th></th></tr>
      ${AP.altre.map((x, i) => `<tr><td><select data-cambia="apConto" data-i="${i}" aria-label="Conto">${opzioniConti(altriConti, { tipi: ["PG", "A", "P"], escludi: (c) => isCassaBanca(c) || tipoDi(c) === "PAT", selezionato: x.conto, vuota: "— scegli —" })}</select></td>
        <td><input type="text" inputmode="decimal" class="n" value="${esc(x.importo)}" data-input="apImporto" data-i="${i}" aria-label="Importo"></td>
        <td><button class="btn pericolo piccolo" data-azione="apTogli" data-i="${i}" aria-label="Togli">✕</button></td></tr>`).join("")}</table>` : ""}
    <button class="btn sec piccolo" data-azione="apAggiungi">+ Aggiungi collette, crediti o debiti</button>
    <div id="ap-riepilogo">${riepilogoApertura()}</div>
    <div class="riga-bottoni"><button class="btn" data-azione="apSalva">Salva i saldi di apertura</button></div>
  </div>

  <div class="card"><h3>Caricare i movimenti da UNIO</h3>
    <p class="hint">Si fa dalla pagina <b>Movimenti</b>, con il pulsante «Carica da UNIO…».</p>
    <button class="btn sec" data-azione="vaiCaricaUNIO">Vai a Movimenti → Carica da UNIO</button></div>

  ${cardCausale(arch)}
  ${cardTeatro(arch)}

  <div class="card"><h3>Chi usa questo computer</h3>
    <p class="hint">Il nome resta su questo computer e compare accanto ai movimenti che inserisce.</p>
    <input type="text" value="${esc(locale.leggi("autore", ""))}" placeholder="es. don Mario" data-cambia="autore" style="max-width:320px" aria-label="Nome">
  </div>

  <div class="card"><h3>Dati della parrocchia</h3>
    <p class="hint">Serviranno per l'intestazione del Rendiconto.</p>
    <div class="griglia g2">${CAMPI_PARROCCHIA.map(([k, n]) => `<div><label class="campo" for="par-${k}">${n}</label>
      <input id="par-${k}" type="text" value="${esc(par[k] ?? "")}" data-cambia="parrocchia" data-campo="${k}"></div>`).join("")}</div>
  </div>

  <div class="card"><h3>Piano dei conti</h3>
    <p class="hint">Gruppi e voci sono quelli della Diocesi e non si cambiano. I sottoconti si possono rinominare (es. "Offerte diverse" → "Offerte per il presepe"),
      aggiungere, mettere "fuori uso" (non compaiono più negli elenchi, ma i movimenti già registrati restano) oppure <b>eliminare</b>, se nessun movimento li usa.
      I sottoconti aggiunti valgono solo per questa parrocchia; con la cartella condivisa i collaboratori vedono lo stesso piano dei conti.
      Cassa e banche si cambiano più sopra, in «Cassa e banche».</p>
    ${GRUPPI.map((g) => `<details data-chiave="gruppo-${g.codice}"><summary>${g.codice} · ${esc(g.nome)}</summary>
      ${g.voci.map((v) => `<div class="voce-piano"><div class="riga"><b class="spazio">${v.codice} ${esc(v.nome)}</b>
          <button class="btn sec piccolo" data-azione="aggiungiSottoconto" data-voce="${v.codice}">+ Sottoconto</button></div>
        ${[...arch.conti.values()].filter((c) => c.codice.startsWith(v.codice + "-")).sort((a, b) => a.codice.localeCompare(b.codice)).map((c) => `
          <div class="sottoconto ${c.attivo === false ? "spento" : ""}"><span class="codice">${c.codice}</span>
            <input type="text" value="${esc(c.nome)}" data-cambia="rinomina" data-codice="${c.codice}" aria-label="Nome del sottoconto ${c.codice}">
            <label class="spunta"><input type="checkbox" ${c.attivo === false ? "" : "checked"} ${c.codice === CASSA ? "disabled" : ""} data-cambia="attivo" data-codice="${c.codice}"> in uso</label>
            ${isCassaBanca(c.codice) ? "" : usati.has(c.codice)
              ? `<span class="hint" title="Un sottoconto usato da movimenti si può solo mettere fuori uso">usato nei movimenti</span>`
              : `<button class="cestino" data-azione="eliminaSottoconto" data-codice="${c.codice}" title="Elimina il sottoconto" aria-label="Elimina il sottoconto ${c.codice}">${ICONA_CESTINO}</button>`}</div>`).join("")}
      </div>`).join("")}</details>`).join("")}
  </div>

  ${cardRiparti(arch)}

  <div class="card"><h3>Informazioni</h3>
    <p><a href="guida.html" target="_blank" rel="noopener">Apri la guida di Divisio</a> (si può stampare o salvare in PDF).</p>
    <p class="hint">Divisio versione ${VERSIONE}. Per leggere i PDF usa il lettore di Mozilla (pdf.js), che lavora su questo computer.</p>
    <p class="hint" id="info-memoria">Controllo della memoria…</p>
    <p class="hint">I dati sono salvati in questo browser, su questo computer, e, se attivata, nella cartella condivisa del Google Drive della parrocchia. Nessun altro invio su internet.</p>
  </div>`;
}

export async function dopo() {
  const el = $("#info-memoria");
  if (!el || !navigator.storage?.persisted) { if (el) el.textContent = ""; return; }
  const protetta = await navigator.storage.persisted();
  el.textContent = protetta
    ? "✓ Memoria protetta: il browser non cancellerà i dati da solo."
    : "La memoria non è ancora protetta: installi Divisio come app (menu del browser → \"Installa\") e faccia spesso la copia di sicurezza.";
}

export const input = {
  apCassa(el) { AP.casse[el.dataset.conto] = el.value; $("#ap-riepilogo").innerHTML = riepilogoApertura(); },
  apImporto(el) { AP.altre[el.dataset.i].importo = el.value; $("#ap-riepilogo").innerHTML = riepilogoApertura(); },
};

export const cambia = {
  ripartiScelta(el, ev, ctx) { riparti[el.dataset.k] = el.checked; ctx.aggiorna(); },
  ripartiCapito(el, ev, ctx) { riparti.capito = el.checked; ctx.aggiorna(); },
  unioneTieni(el, ev, ctx) { unione.tieni = el.value; ctx.aggiorna(); },
  unioneUnisci(el, ev, ctx) { unione.unisci = el.value; ctx.aggiorna(); },
  unioneNome(el) { unione.nome = el.value; },
  apConto(el) { AP.altre[el.dataset.i].conto = el.value; $("#ap-riepilogo").innerHTML = riepilogoApertura(); },
  async causaleAttiva(el, ev, ctx) {
    await ctx.arch.salvaImpostazione("causale-unio", el.checked, { etichetta: el.checked ? "Causale come in UNIO accesa" : "Causale come in UNIO spenta" });
    toast(el.checked ? "Causale come in UNIO: attivata ✓ (la trova nella pagina Registra)" : "Causale come in UNIO: spenta");
    ctx.aggiorna();
  },
  async teatroAttivo(el, ev, ctx) {
    await ctx.arch.salvaImpostazione("teatro", { ...teatro(ctx.arch), attivo: el.checked }, { etichetta: el.checked ? "Fatture del teatro o di altre gestioni accese" : "Fatture del teatro o di altre gestioni spente" });
    toast(el.checked ? "Fatture del teatro o di altre gestioni: scelta attivata ✓" : "Fatture del teatro o di altre gestioni: scelta spenta");
    ctx.aggiorna();
  },
  async teatroParole(el, ev, ctx) {
    const parole = el.value.split(",").map((p) => p.trim()).filter(Boolean);
    await ctx.arch.salvaImpostazione("teatro", { ...teatro(ctx.arch), parole }, { etichetta: "Parole che indicano il teatro" });
    toast("Salvato ✓");
  },
  autore(el, ev, ctx) { const n = el.value.trim(); locale.scrivi("autore", n); ctx.arch.impostaAutore(n); toast("Nome salvato ✓"); },
  async parrocchia(el, ev, ctx) {
    const par = { ...ctx.arch.impostazione("parrocchia", {}), [el.dataset.campo]: el.value.trim() };
    await ctx.arch.salvaImpostazione("parrocchia", par, { etichetta: "Dati della parrocchia" });
    toast("Salvato ✓");
    ctx.aggiornaIntestazione();
  },
  async rinomina(el, ev, ctx) {
    const nome = el.value.trim();
    if (!nome) { el.value = ctx.arch.nomeConto(el.dataset.codice); return; }
    await ctx.arch.salvaConto({ codice: el.dataset.codice, nome });
    toast("Nome cambiato ✓");
  },
  async attivo(el, ev, ctx) {
    const ordine = el.checked && isCassaBanca(el.dataset.codice) ? { ordine: prossimoOrdineCassa(ctx.arch.conti.values()) } : {};
    await ctx.arch.salvaConto({ codice: el.dataset.codice, attivo: el.checked, ...ordine });
    el.closest(".sottoconto").classList.toggle("spento", !el.checked);
  },
  async ripristina(el, ev, ctx) {
    const file = el.files[0];
    el.value = "";
    if (!file) return;
    const r = leggiBackup(await file.text());
    if (!r.ok) { alert("Impossibile ripristinare:\n\n" + r.errori.join("\n")); return; }
    const quando = r.salvatoIl ? new Date(r.salvatoIl).toLocaleString("it-IT") : "data sconosciuta";
    const n = r.dati.movimenti.filter((m) => !m.eliminato).length;
    const condivisa = condivisioneImpostata();
    if (!confirm(`La copia del ${quando} contiene ${n} movimenti.\n\nSostituire TUTTI i dati attuali con quelli della copia?`
      + (condivisa ? "\n\nDivisio è condiviso con altri computer: anche loro riceveranno i dati della copia." : "")
      + "\n\nPer sicurezza Divisio scaricherà prima una copia dei dati di adesso.")) return;
    salvaCopia(ctx, "prima-del-ripristino");
    // date di modifica nuove: così la condivisione non riporta indietro i dati (vedi datiPerRipristino)
    await ctx.arch.sostituisci(datiPerRipristino(r.dati, ctx.arch.esporta(), { autore: locale.leggi("autore", "") || "Utente" }));
    AP = null;
    toast(`Copia ripristinata ✓ (${n} movimenti)`);
    ctx.aggiorna();
  },
};

export function salvaCopia(ctx, suffisso = "") {
  const ora = new Date();
  scarica(`Divisio-copia-${oggiISO()}${suffisso ? "-" + suffisso : ""}.json`, JSON.stringify(creaBackup(ctx.arch.esporta(), ora)), "application/json");
  locale.scrivi("ultimaCopia", ora.toISOString());
}

export const azioni = {
  ...azioniCondivisione,
  vaiCaricaUNIO(el, ev, ctx) { apriCaricaUNIO(); ctx.vai("movimenti"); },
  salvaCopia(el, ev, ctx) { salvaCopia(ctx); toast("Copia scaricata ✓ (cartella Download)"); ctx.aggiorna(); },
  apAggiungi(el, ev, ctx) { AP.altre.push({ conto: "", importo: "" }); ctx.aggiorna(); },
  apTogli(el, ev, ctx) { AP.altre.splice(Number(el.dataset.i), 1); ctx.aggiorna(); },
  async apSalva(el, ev, ctx) {
    const voci = vociApertura();
    if (voci.some((v) => Number.isNaN(v.importo))) { toast("C'è un importo non valido"); return; }
    const righe = scritturaApertura(voci);
    const id = `apertura-${ctx.anno}`;
    if (!righe.length) {
      if (ctx.arch.movimento(id)) await ctx.arch.eliminaMovimento(id);
      toast("Saldi di apertura azzerati");
    } else {
      await ctx.arch.salvaMovimento({ id, data: `${ctx.anno}-01-01`, descr: `Saldi di apertura ${ctx.anno}`, tipo: "apertura", righe });
      toast("Saldi di apertura salvati ✓");
    }
    preparaApertura(ctx);
    ctx.aggiorna();
  },
  async bancaAggiungi(el, ev, ctx) {
    const campo = $("#banca-nuova");
    const nome = campo.value.trim();
    if (!nome) { toast("Scelga o scriva il nome della banca"); campo.focus(); return; }
    const esistente = [...ctx.arch.conti.values()].find((c) => isCassaBanca(c.codice) && stessoNome(c.nome, nome));
    if (esistente && esistente.attivo !== false) { toast(`"${esistente.nome}" c'è già`); return; }
    if (esistente) {
      await ctx.arch.salvaConto({ codice: esistente.codice, attivo: true, ordine: prossimoOrdineCassa(ctx.arch.conti.values()) });
    } else {
      const codice = nuovoCodiceSottoconto(VOCE_CASSE, ctx.arch.conti.keys());
      if (!codice) { toast("Non si possono aggiungere altre banche"); return; }
      await ctx.arch.salvaConto({ codice, nome, attivo: true, ordine: prossimoOrdineCassa(ctx.arch.conti.values()) });
    }
    toast(`${nome} aggiunta ✓`);
    ctx.aggiorna();
  },
  async bancaTogli(el, ev, ctx) {
    const nome = ctx.arch.nomeConto(el.dataset.codice);
    if (!confirm(`Togliere "${nome}" dall'elenco?\n\nNon comparirà più tra le scelte, ma i movimenti già registrati restano. Si può rimettere in uso quando si vuole.`)) return;
    await ctx.arch.salvaConto({ codice: el.dataset.codice, attivo: false });
    toast(`${nome} tolta dall'elenco`);
    ctx.aggiorna();
  },
  apriRiparti(el, ev, ctx) { riparti = nuoveScelte(); ctx.aggiorna(); document.getElementById("riparti")?.scrollIntoView({ block: "start" }); },
  chiudiRiparti(el, ev, ctx) { riparti = null; ctx.aggiorna(); },
  async confermaRiparti(el, ev, ctx) {
    if (!riparti?.capito) return;
    const r = ripartiDaZero(datiRiparti(ctx.arch), riparti, tornaDaPagare);
    el.disabled = true;
    salvaCopia(ctx, "prima-di-ripartire-da-zero");
    await ctx.arch.salvaInsieme({ fatture: r.fatture, movimenti: r.movimenti, movimentiDaEliminare: r.movimentiDaEliminare, impostazioni: r.impostazioni,
      etichetta: "Ripartire da zero" });
    riparti = null;
    preparaApertura(ctx);
    toast(`Fatto: Divisio riparte da zero ✓ (${r.conta.movimenti} movimenti, ${r.conta.fatture} fatture cancellati). Copia di sicurezza nella cartella Download`);
    ctx.aggiorna();
  },
  async unisciBanche(el, ev, ctx) {
    const { tieni, unisci, nome } = unione ?? {};
    if (!tieni || !unisci || tieni === unisci) { toast("Scelga due banche diverse"); return; }
    if (!nome?.trim()) { toast("Scriva il nome da usare"); return; }
    const a = ctx.arch;
    let u;
    try { u = unisciBanche({ conti: a.conti, movimenti: a.movimenti(), fatture: a.fatture(), impostazioni: [...a.impostazioniCon("banca:"), ...a.impostazioniCon("formato-banca:")] }, unisci, tieni, nome); }
    catch (e) { toast(e.message); return; }
    const c = u.conta;
    if (!confirm(`Unire «${a.nomeConto(unisci)}» (${unisci}) dentro «${a.nomeConto(tieni)}» (${tieni}), con il nome «${nome.trim()}»?\n\n`
      + `${c.movimenti === 1 ? "1 movimento passa" : `${c.movimenti} movimenti passano`} a ${tieni}${c.eliminati ? `; ${c.eliminati} spostamenti fra le due banche spariscono (erano dalla banca a sé stessa)` : ""}`
      + `${c.fatture ? `; ${c.fatture} fatture pagate` : ""}. Il codice ${unisci} sparisce.\n\nSi può annullare con «↶ Annulla».`)) return;
    el.disabled = true;
    await a.salvaInsieme({ conti: u.conti, movimenti: u.movimenti, movimentiDaEliminare: u.movimentiDaEliminare, fatture: u.fatture, impostazioni: u.impostazioni,
      etichetta: `Unione delle banche ${unisci} e ${tieni} in «${nome.trim()}» (${tieni})` });
    unione = null;
    preparaApertura(ctx);
    toast(`Banche unite ✓ Ora c'è solo «${nome.trim()}» (${tieni})`);
    ctx.aggiorna();
  },
  async bancaRimetti(el, ev, ctx) {
    await ctx.arch.salvaConto({ codice: el.dataset.codice, attivo: true, ordine: prossimoOrdineCassa(ctx.arch.conti.values()) });
    toast(`${ctx.arch.nomeConto(el.dataset.codice)} di nuovo in uso ✓`);
    ctx.aggiorna();
  },
  async eliminaSottoconto(el, ev, ctx) {
    const codice = el.dataset.codice, nome = ctx.arch.nomeConto(codice);
    if (contiUsati(ctx.arch.movimenti()).has(codice)) { toast(`«${nome}» è usato da movimenti: si può solo mettere fuori uso`); return; }
    if (!confirm(`Eliminare il sottoconto «${nome}» (${codice})?\n\nNessun movimento lo usa. Sparirà dal piano dei conti di questa parrocchia (anche sugli altri computer collegati).\nSe servirà di nuovo, lo potrà aggiungere con «+ Sottoconto».`)) return;
    await ctx.arch.eliminaConto(codice);
    toast(`«${nome}» eliminato ✓`);
    ctx.aggiorna();
  },
  async aggiungiSottoconto(el, ev, ctx) {
    const codice = nuovoCodiceSottoconto(el.dataset.voce, ctx.arch.conti.keys());
    if (!codice) { toast("Questa voce ha già 99 sottoconti"); return; }
    const nome = prompt(`Nome del nuovo sottoconto (${codice}):`);
    if (!nome?.trim()) return;
    const ordine = isCassaBanca(codice) ? { ordine: prossimoOrdineCassa(ctx.arch.conti.values()) } : {};
    await ctx.arch.salvaConto({ codice, nome: nome.trim(), attivo: true, ...ordine });
    toast("Sottoconto aggiunto ✓");
    ctx.aggiorna();
  },
};
