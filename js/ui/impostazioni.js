// Pagina "Impostazioni": copia di sicurezza, saldi di apertura, dati della parrocchia, piano dei conti.

import { creaBackup, leggiBackup } from "../dominio/backup.js";
import { scritturaApertura, CONTO_PATRIMONIO } from "../dominio/scritture.js";
import { parseEuro, formatDecimale } from "../dominio/importi.js";
import { GRUPPI, isCassaBanca, casseInOrdine, prossimoOrdineCassa, crescInDare, tipoDi, nuovoCodiceSottoconto } from "../dominio/piano.js";
import { esc, eur, oggiISO, scarica, toast, locale, opzioniConti, $ } from "./util.js";
import { vistaCard as cardCondivisione, azioni as azioniCondivisione } from "./condivisione.js";
import { vistaCard as cardImporta, azioni as azioniImporta, cambia as cambiaImporta } from "./importa.js";
import { teatro } from "./fatture.js";
import { VERSIONE } from "../versione.js";

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
      `${esc(c.nome)} <button class="btn sec piccolo" data-azione="bancaRimetti" data-codice="${c.codice}">Rimetti in uso</button>`).join(" ")}</p>` : ""}
  </div>`;
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

  ${cardImporta(ctx)}

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
      aggiungere o mettere "fuori uso" (non compaiono più negli elenchi, ma i movimenti già registrati restano).</p>
    ${GRUPPI.map((g) => `<details data-chiave="gruppo-${g.codice}"><summary>${g.codice} · ${esc(g.nome)}</summary>
      ${g.voci.map((v) => `<div class="voce-piano"><div class="riga"><b class="spazio">${v.codice} ${esc(v.nome)}</b>
          <button class="btn sec piccolo" data-azione="aggiungiSottoconto" data-voce="${v.codice}">+ Sottoconto</button></div>
        ${[...arch.conti.values()].filter((c) => c.codice.startsWith(v.codice + "-")).sort((a, b) => a.codice.localeCompare(b.codice)).map((c) => `
          <div class="sottoconto ${c.attivo === false ? "spento" : ""}"><span class="codice">${c.codice}</span>
            <input type="text" value="${esc(c.nome)}" data-cambia="rinomina" data-codice="${c.codice}" aria-label="Nome del sottoconto ${c.codice}">
            <label class="spunta"><input type="checkbox" ${c.attivo === false ? "" : "checked"} ${c.codice === CASSA ? "disabled" : ""} data-cambia="attivo" data-codice="${c.codice}"> in uso</label></div>`).join("")}
      </div>`).join("")}</details>`).join("")}
  </div>

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
  ...cambiaImporta,
  apConto(el) { AP.altre[el.dataset.i].conto = el.value; $("#ap-riepilogo").innerHTML = riepilogoApertura(); },
  async teatroAttivo(el, ev, ctx) {
    await ctx.arch.salvaImpostazione("teatro", { ...teatro(ctx.arch), attivo: el.checked });
    toast(el.checked ? "Fatture del teatro o di altre gestioni: scelta attivata ✓" : "Fatture del teatro o di altre gestioni: scelta spenta");
    ctx.aggiorna();
  },
  async teatroParole(el, ev, ctx) {
    const parole = el.value.split(",").map((p) => p.trim()).filter(Boolean);
    await ctx.arch.salvaImpostazione("teatro", { ...teatro(ctx.arch), parole });
    toast("Salvato ✓");
  },
  autore(el, ev, ctx) { const n = el.value.trim(); locale.scrivi("autore", n); ctx.arch.impostaAutore(n); toast("Nome salvato ✓"); },
  async parrocchia(el, ev, ctx) {
    const par = { ...ctx.arch.impostazione("parrocchia", {}), [el.dataset.campo]: el.value.trim() };
    await ctx.arch.salvaImpostazione("parrocchia", par);
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
    if (!confirm(`La copia del ${quando} contiene ${n} movimenti.\n\nSostituire TUTTI i dati attuali con quelli della copia?\n\nPer sicurezza Divisio scaricherà prima una copia dei dati di adesso.`)) return;
    salvaCopia(ctx, "prima-del-ripristino");
    await ctx.arch.sostituisci(r.dati);
    AP = null;
    toast("Copia ripristinata ✓");
    ctx.aggiorna();
  },
};

function salvaCopia(ctx, suffisso = "") {
  const ora = new Date();
  scarica(`Divisio-copia-${oggiISO()}${suffisso ? "-" + suffisso : ""}.json`, JSON.stringify(creaBackup(ctx.arch.esporta(), ora)), "application/json");
  locale.scrivi("ultimaCopia", ora.toISOString());
}

export const azioni = {
  ...azioniCondivisione,
  ...azioniImporta,
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
  async bancaRimetti(el, ev, ctx) {
    await ctx.arch.salvaConto({ codice: el.dataset.codice, attivo: true, ordine: prossimoOrdineCassa(ctx.arch.conti.values()) });
    toast(`${ctx.arch.nomeConto(el.dataset.codice)} di nuovo in uso ✓`);
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
