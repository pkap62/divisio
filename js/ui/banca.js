// Pagina "Banca": caricamento degli estratti conto (CSV o Excel di qualunque banca), revisione e registrazione.
// Regola: in contabilità non entra nulla finché l'utente non controlla e conferma. Si può scartare tutto,
// togliere singoli movimenti e, anche dopo, togliere un'intera importazione.

import { tabellaDaTesto, testoDelFile, leggiEstratto, impronta, CAMPI, saldoFinale } from "../dominio/estrattoConto.js";
import { preparaRighe, completa, aggiornaStato, movimentoProposta, datiBanca, modalitaDaTesto, ricorda, importazioni, maiuscole, CASSA_CONTANTI } from "../dominio/banca.js";
import { segnaPagata, tornaDaPagare, CONTO_TEATRO } from "../dominio/scadenzario.js";
import { chiaveFornitore } from "../dominio/fatture.js";
import { verificaMovimento } from "../dominio/scritture.js";
import { movimentiAnno, totaliPerConto, saldo } from "../dominio/saldi.js";
import { isCassaBanca, casseInOrdine, tipoDi } from "../dominio/piano.js";
import { nuovoId } from "../dominio/unione.js";
import { esc, eur, dataIt, oggiISO, opzioniConti, toast, $ } from "./util.js";
import { teatro } from "./fatture.js";

let imp = null;   // importazione in corso: { nomeFile, tabella, lettura, colonne, riga, cassa, righe, filtro, ricorda, errore }

const banche = (arch) => casseInOrdine(arch.contiAttivi()).filter((c) => c.codice !== CASSA_CONTANTI);
const casse = (arch) => casseInOrdine(arch.contiAttivi());
const n_ = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const CHIAVE_FORMATO = "formato-banca:";

/* ---------- lettura del file ---------- */

async function tabellaDelFile(file) {
  const nome = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.pdf$/.test(nome)) throw new Error("Il PDF dell'estratto conto non si può leggere: dalla banca online scarichi i movimenti in formato CSV o Excel.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {   // ZIP: Excel .xlsx
    const { leggiXlsx } = await import("../dati/xlsx.js");
    return leggiXlsx(bytes);
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error("È un file Excel del tipo vecchio (.xls): lo apra con Excel e lo salvi come «Cartella di lavoro di Excel (.xlsx)» o come CSV, poi lo carichi di nuovo.");
  }
  return tabellaDaTesto(testoDelFile(bytes));
}

/** Formato già visto (titoli uguali a un file precedente): colonne scelte e banca. */
function formatoRicordato(arch, tabella) {
  for (let i = 0; i < Math.min(tabella.length, 40); i++) {
    if (!tabella[i].some((c) => String(c).trim())) continue;
    const f = arch.impostazione(CHIAVE_FORMATO + impronta(tabella[i]));
    if (f?.colonne) return { ...f, riga: i };
  }
  return null;
}

async function carica(file, ctx) {
  if (!file) return;
  imp = { nomeFile: file.name, inLettura: true, righe: [], filtro: "tutti", ricorda: true };
  ctx.aggiorna();
  let tabella;
  try { tabella = await tabellaDelFile(file); }
  catch (e) { console.error(e); imp = { nomeFile: file.name, errore: e.message || "Il file non si riesce a leggere." }; ctx.aggiorna(); return; }
  const noto = formatoRicordato(ctx.arch, tabella);
  const lettura = noto ? leggiEstratto(tabella, { colonne: structuredClone(noto.colonne), riga: noto.riga }) : leggiEstratto(tabella);
  const bs = banche(ctx.arch);
  const cassa = noto?.cassa && bs.some((b) => b.codice === noto.cassa) ? noto.cassa : bs.length === 1 ? bs[0].codice : "";
  imp = { nomeFile: file.name, tabella, lettura, noto: Boolean(noto), colonne: structuredClone(lettura.colonne ?? {}), riga: lettura.rigaTitoli ?? -1,
    cassa, righe: [], filtro: "tutti", ricorda: true, colonneAperte: !lettura.ok || lettura.indovinate };
  prepara(ctx);
  ctx.aggiorna();
}

/** Calcola le proposte per ogni riga (serve sapere su quale banca si sta caricando). */
function prepara(ctx) {
  const { arch } = ctx;
  if (!imp?.lettura?.ok || !imp.cassa) { if (imp) imp.righe = []; return; }
  const t = teatro(arch);
  const memorie = new Map(arch.impostazioniCon("banca:").map((i) => [i.chiave, i.valore]));
  const fornitori = new Map(arch.impostazioniCon("fornitore:").map((i) => [i.chiave, { chiave: i.chiave, nome: i.valore.nome, voce: i.valore.voce, quotaTeatro: t.attivo ? i.valore.quotaTeatro : 0 }]));
  for (const f of arch.fatture()) {   // fornitori di fatture già pagate, anche se non "ricordati"
    const k = chiaveFornitore(f);
    const voce = f.rate.find((r) => r.voce)?.voce;
    if (!fornitori.has(k) && voce) fornitori.set(k, { chiave: k, nome: f.fornitore, voce, quotaTeatro: 0 });
  }
  imp.righe = preparaRighe(imp.lettura.righe, {
    cassa: imp.cassa, movimenti: arch.movimenti(), fatture: arch.fatture(), memorie, fornitori: [...fornitori.values()],
    contiAttivi: new Set(arch.contiAttivi().map((c) => c.codice)), casse: casse(arch).map((c) => c.codice),
  }).map((p) => ({ ...p, quotaTeatro: t.attivo ? p.quotaTeatro : 0 }));
}

/* ---------- viste ---------- */

export function vista(ctx) {
  const { arch } = ctx;
  return `
  <h2>Estratti conto della banca</h2>
  <p class="lead">Carichi i movimenti scaricati dalla banca online: Divisio propone come registrarli, lei controlla e conferma.
    <b>In contabilità non entra nulla finché non conferma.</b></p>
  ${imp && !imp.errore ? "" : banche(arch).length ? vistaCarica() : `<div class="card avviso"><b>Prima aggiunga la banca.</b> In Impostazioni → Cassa e banche scriva il nome del conto corrente
    (per esempio «Banco BPM»), poi torni qui. <div class="riga-bottoni"><button class="btn" data-azione="vaiImpostazioni">Vai alle Impostazioni</button></div></div>`}
  ${imp ? vistaImportazione(ctx) : ""}
  ${vistaFatte(ctx)}
  ${vistaRicordati(arch)}`;
}

function vistaCarica() {
  return `<div class="card zona-file" id="zona-banca">
    <h3>Carica un estratto conto</h3>
    <ol class="passi">
      <li>Nella banca online cerchi l'elenco dei movimenti del conto e lo scarichi in formato <b>CSV</b> o <b>Excel</b> (per esempio un trimestre).</li>
      <li>Trascini qui il file, oppure lo scelga dal computer.</li>
      <li>Controlli le proposte di Divisio, corregga quelle sbagliate e confermi.</li>
    </ol>
    <div class="riga-bottoni stretta"><label class="btn">Scegli il file…<input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.htm,.html,text/csv" hidden data-cambia="file"></label></div>
    <p class="hint">Vanno bene i file di tutte le banche: Divisio riconosce da solo le colonne e ricorda le scelte per le volte successive.
      Il file viene letto solo su questo computer e non viene conservato.</p>
  </div>`;
}

function vistaImportazione(ctx) {
  const { arch } = ctx;
  if (imp.errore) return `<div class="card"><div class="errore"><b>${esc(imp.nomeFile)}</b>: ${esc(imp.errore)}</div>
    <div class="riga-bottoni"><button class="btn sec" data-azione="scarta">Chiudi</button></div></div>`;
  if (imp.inLettura) return `<div class="card"><div class="nota">Lettura di ${esc(imp.nomeFile)}…</div></div>`;
  const l = imp.lettura;
  const bs = banche(arch);
  const date = l.ok ? l.righe.map((r) => r.data).sort() : [];
  return `<div class="card evidenza" id="importazione">
    <div class="riga"><h3 class="spazio">${esc(imp.nomeFile)}</h3><button class="btn sec piccolo" data-azione="scarta">Scarta l'importazione</button></div>
    ${l.ok ? `<p>${n_(l.righe.length, "movimento", "movimenti")} dal ${dataIt(date[0])} al ${dataIt(date.at(-1))}${l.scartate.length ? ` · ${n_(l.scartate.length, "riga non letta", "righe non lette")}` : ""}.
      ${imp.noto ? `<span class="pill ok-pill">formato già conosciuto</span>` : ""}</p>` : `<div class="errore">${esc(l.errore)}</div>`}
    ${l.ok && l.scartate.length ? `<details data-chiave="scartate"><summary>Righe non lette</summary><ul>${l.scartate.map((s) => `<li>Riga ${s.n}: ${esc(s.motivo)} – <span class="hint">${esc(s.testo.slice(0, 160))}</span></li>`).join("")}</ul></details>` : ""}
    ${vistaColonne()}
    ${l.ok ? `<label class="campo">Su quale conto della parrocchia sono questi movimenti?</label>
      <div class="scelta">${bs.map((c) => `<button type="button" class="${c.codice === imp.cassa ? "on sposta" : ""}" data-azione="cassa" data-v="${c.codice}">${esc(c.nome)}</button>`).join("")}</div>
      ${imp.cassa ? "" : `<div class="avviso">Scelga il conto: poi Divisio prepara le proposte.</div>`}` : ""}
  </div>
  ${imp.righe.length ? vistaRighe(ctx) : ""}`;
}

/** Abbinamento delle colonne del file alle informazioni di Divisio (si apre da solo quando Divisio non è sicuro). */
function vistaColonne() {
  const l = imp.lettura;
  if (!l.numeroColonne) return "";
  const titoli = imp.riga >= 0 ? imp.tabella[imp.riga] ?? [] : [];
  const esempio = (i) => { const r = imp.tabella.slice(imp.riga + 1).find((x) => String(x[i] ?? "").trim()); return r ? String(r[i]).slice(0, 30) : ""; };
  const nomeCol = (i) => `${i + 1}. ${String(titoli[i] ?? "").trim() || "(senza titolo)"}${esempio(i) ? ` – es. ${esempio(i)}` : ""}`;
  const opz = (campo) => `<option value="">— nessuna —</option>` + Array.from({ length: l.numeroColonne }, (_, i) =>
    `<option value="${i}" ${imp.colonne[campo]?.[0] === i ? "selected" : ""}>${esc(nomeCol(i))}</option>`).join("");
  const righeTitoli = imp.tabella.slice(0, 15).map((r, i) => `<option value="${i}" ${imp.riga === i ? "selected" : ""}>Riga ${i + 1}: ${esc(r.filter((x) => String(x).trim()).join(" · ").slice(0, 80))}</option>`).join("");
  return `<details ${imp.colonneAperte ? "open" : ""} data-chiave="colonne"><summary>Colonne del file${l.indovinate ? " (da controllare)" : ""}</summary>
    ${l.indovinate ? `<div class="avviso">Divisio non ha trovato i titoli delle colonne e le ha indovinate guardando i dati: controlli che siano giuste.</div>`
      : `<p class="hint">Divisio ha riconosciuto le colonne così. Se qualcosa non va, lo corregga e prema «Rileggi»: la scelta sarà ricordata per i prossimi file di questa banca.</p>`}
    <label class="campo" for="b-riga">Riga con i titoli delle colonne</label>
    <select id="b-riga" data-cambia="rigaTitoli"><option value="-1" ${imp.riga < 0 ? "selected" : ""}>— il file non ha titoli —</option>${righeTitoli}</select>
    <div class="griglia g2">${Object.entries(CAMPI).map(([k, nome]) => `<div><label class="campo" for="b-col-${k}">${esc(nome)}</label>
      <select id="b-col-${k}" data-cambia="colonna" data-campo="${k}">${opz(k)}</select></div>`).join("")}</div>
    <p class="hint">Serve la data e l'importo con il segno (oppure le due colonne di uscite e entrate). La descrizione aiuta Divisio a capire di cosa si tratta.</p>
    <div class="riga-bottoni"><button class="btn sec" data-azione="rileggi">Rileggi con queste colonne</button></div>
  </details>`;
}

const FILTRI = [["tutti", "Tutti"], ["da-completare", "Da completare"], ["pronto", "Pronti"], ["fattura", "Fatture"], ["esclusi", "Non registrati"]];
const conFattura = (p) => p.stato === "fattura" && p.usaFattura;
const nelFiltro = (p, f) => f === "tutti" || (f === "esclusi" ? !p.includi : !p.includi ? false
  : f === "fattura" ? conFattura(p) : f === "da-completare" ? !completa(p) : completa(p) && !conFattura(p));

function vistaRighe(ctx) {
  const conta = Object.fromEntries(FILTRI.map(([k]) => [k, imp.righe.filter((p) => nelFiltro(p, k)).length]));
  const lista = imp.righe.filter((p) => nelFiltro(p, imp.filtro));
  return `<div class="card" id="revisione">
    <h3>Controlli e confermi</h3>
    <p class="hint">Per ogni movimento Divisio propone la voce e spiega perché. Le correzioni valgono anche per gli altri movimenti con lo stesso nome
      e Divisio le ricorderà la prossima volta. Tolga la spunta ai movimenti da non registrare.</p>
    <div class="scelta filtro-fatture">${FILTRI.map(([k, nome]) => `<button class="${imp.filtro === k ? "on sposta" : ""}" data-azione="filtro" data-v="${k}">${nome} (${conta[k]})</button>`).join("")}</div>
    ${lista.length ? `<div class="scorri"><table class="banca"><tr><th></th><th>Data</th><th>Movimento</th><th>Come registrarlo</th><th class="n">Importo</th></tr>
      ${lista.map((p) => rigaHTML(p, ctx)).join("")}</table></div>` : `<p class="hint">Nessun movimento in questo elenco.</p>`}
  </div>
  <div class="card evidenza" id="riepilogo-banca">${riepilogoHTML(ctx)}</div>`;
}

const PILLE = { ricordato: ["ok-pill", "ricordato"], fornitore: ["ok-pill", "fornitore conosciuto"], parole: ["", "proposta"], copiato: ["", "come l'altro"], scelto: ["ok-pill", "scelto"], nessuno: ["presto-pill", "da scegliere"] };

function rigaHTML(p, ctx) {
  const { arch } = ctx;
  const t = teatro(arch);
  const id = esc(p.id);
  const nome = p.controparte?.nome ? maiuscole(p.controparte.nome) : "";
  let come = "";
  if (!p.includi) {
    come = p.giaRegistrato ? `<div class="nota piccola">${esc(p.motivo)}</div><p class="hint">Non verrà registrato di nuovo. Se è un movimento diverso, lo spunti.</p>`
      : `<p class="hint">Non verrà registrato.</p>`;
  } else if (p.stato === "fattura" && p.usaFattura) {
    const f = arch.fattura(p.fattura.id);
    come = `<div class="ok piccola">${esc(p.motivo)}</div>
      <label class="spunta-riga piccola"><input type="checkbox" checked data-cambia="usaFattura" data-r="${id}"> Segna pagata la fattura${f?.rate.length > 1 ? ` (rata ${p.fattura.n})` : ""} e registra l'uscita</label>
      ${selettoreVoce(p, ctx)}${t.attivo ? selettoreTeatro(p) : ""}`;
  } else {
    const segno = p.importo > 0;
    come = `<select class="piccolo" data-cambia="tipo" data-r="${id}" aria-label="Tipo di movimento">
        <option value="${segno ? "entrata" : "uscita"}" ${p.tipo !== "spostamento" ? "selected" : ""}>${segno ? "Entrata" : "Uscita"}</option>
        <option value="spostamento" ${p.tipo === "spostamento" ? "selected" : ""}>${segno ? "Soldi arrivati da un'altra cassa" : "Soldi passati a un'altra cassa"}</option></select>
      ${p.tipo === "spostamento" ? selettoreAltra(p, ctx) : selettoreVoce(p, ctx)}
      ${t.attivo && p.tipo === "uscita" ? selettoreTeatro(p) : ""}
      ${p.fattura ? `<p class="hint">Divisio pensava fosse il pagamento di una fattura: <a href="#" data-azione="rimettiFattura" data-r="${id}">rimetti</a>.</p>` : ""}`;
  }
  const [classe, testo] = PILLE[p.livello] ?? PILLE.nessuno;
  const motivo = p.includi && !(p.stato === "fattura" && p.usaFattura) ? `<div class="hint">${completa(p) ? `<span class="pill ${classe}">${testo}</span> ` : `<span class="pill presto-pill">da scegliere</span> `}${esc(p.motivo)}</div>` : "";
  return `<tr id="r-${id}" class="${p.includi ? "" : "esclusa"} ${p.includi && !completa(p) ? "incompleta" : ""}">
    <td><input type="checkbox" class="spunta-grande" ${p.includi ? "checked" : ""} data-cambia="includi" data-r="${id}" aria-label="Registra questo movimento"></td>
    <td class="nowrap">${dataIt(p.data)}</td>
    <td>${nome ? `<b>${esc(nome)}</b>` : ""}
      ${p.includi ? `<input type="text" class="descr-banca" value="${esc(p.descr)}" data-input="descr" data-r="${id}" aria-label="Descrizione">` : `<div>${esc(p.descr)}</div>`}
      <div class="hint testo-banca">${esc(p.descrizione)}${p.categoria ? ` · <i>${esc(p.categoria)}</i>` : ""}</div></td>
    <td class="come">${come}${motivo}</td>
    <td class="n ${p.importo > 0 ? "pos" : "neg"}">${p.importo > 0 ? "+" : "−"}${eur(Math.abs(p.importo))}</td></tr>`;
}

function selettoreVoce(p, ctx) {
  const entrata = p.importo > 0;
  const tipi = entrata ? ["E", "PG", "A", "P"] : ["U", "PG", "A", "P"];
  const escludi = (c) => isCassaBanca(c) || tipoDi(c) === "PAT" || (entrata ? tipoDi(c) === "U" : tipoDi(c) === "E");
  return `<select class="piccolo ${p.voce ? "" : "incerto"}" data-cambia="voce" data-r="${esc(p.id)}" aria-label="Voce">${opzioniConti(ctx.arch.contiAttivi(), { tipi, escludi, selezionato: p.voce })}</select>`;
}

function selettoreAltra(p, ctx) {
  const altre = casse(ctx.arch).filter((c) => c.codice !== imp.cassa);
  return `<select class="piccolo ${p.altra ? "" : "incerto"}" data-cambia="altra" data-r="${esc(p.id)}" aria-label="${p.importo > 0 ? "Da dove arrivano" : "Dove vanno"}">
    <option value="">${p.importo > 0 ? "— da dove arrivano? —" : "— dove vanno? —"}</option>
    ${altre.map((c) => `<option value="${c.codice}" ${c.codice === p.altra ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>`;
}

function selettoreTeatro(p) {
  const q = Number(p.quotaTeatro) || 0;
  const valori = [[0, "Della parrocchia"], [50, "Metà parrocchia e metà teatro"], [100, "Del teatro"]];
  if (!valori.some(([v]) => v === q)) valori.push([q, `Teatro ${q}%`]);
  return `<select class="piccolo" data-cambia="quota" data-r="${esc(p.id)}" aria-label="Di chi è la spesa">${valori.map(([v, n]) => `<option value="${v}" ${v === q ? "selected" : ""}>${n}</option>`).join("")}</select>`;
}

/** Totali, controllo del saldo e pulsanti finali. */
function riepilogoHTML(ctx) {
  const { arch } = ctx;
  const scelte = imp.righe.filter((p) => p.includi);
  const mancano = scelte.filter((p) => !completa(p));
  const somma = (fn) => scelte.filter(fn).reduce((s, p) => s + Math.abs(p.importo), 0);
  const fatture = scelte.filter((p) => p.stato === "fattura" && p.usaFattura).length;
  const esclusi = imp.righe.length - scelte.length;
  const nomeBanca = arch.nomeConto(imp.cassa);
  // saldo della banca in Divisio dopo la registrazione, alla data dell'ultimo movimento del file
  const ultima = imp.righe.map((p) => p.data).sort().at(-1);
  const anno = ultima.slice(0, 4);
  const nuovi = scelte.filter((p) => p.data.slice(0, 4) === anno).map((p) => ({ data: p.data, righe: [{ conto: imp.cassa, dare: Math.max(0, p.importo), avere: Math.max(0, -p.importo) }] }));
  const prima = movimentiAnno(arch.movimenti(), anno).filter((m) => m.data <= ultima);
  const dopo = saldo(imp.cassa, totaliPerConto([...prima, ...nuovi.filter((m) => m.data <= ultima)]));
  const sf = saldoFinale(imp.lettura.righe);
  const controllo = sf && sf.data === ultima
    ? (sf.saldo === dopo ? `<div class="ok">✓ Dopo la registrazione il saldo di ${esc(nomeBanca)} in Divisio al ${dataIt(ultima)} sarà <b>${eur(dopo)}</b>: coincide con quello della banca.</div>`
      : `<div class="avviso">Dopo la registrazione il saldo di ${esc(nomeBanca)} in Divisio al ${dataIt(ultima)} sarà <b>${eur(dopo)}</b>, ma per la banca è <b>${eur(sf.saldo)}</b> (differenza ${eur(dopo - sf.saldo)}).
         Controlli i movimenti non registrati e i saldi di apertura (Impostazioni).</div>`)
    : `<div class="nota">Dopo la registrazione il saldo di ${esc(nomeBanca)} in Divisio al ${dataIt(ultima)} sarà <b>${eur(dopo)}</b>.
       Lo confronti con il saldo scritto nell'estratto conto: se non coincide, controlli i movimenti non registrati e i saldi di apertura (Impostazioni).</div>`;
  if (!scelte.length && imp.righe.every((p) => p.giaRegistrato)) {
    return `<h3>Riepilogo</h3><div class="ok">Tutti i movimenti di questo file sono già in Divisio: non c'è niente da registrare.</div>
      <div class="riga-bottoni"><button class="btn sec" data-azione="scarta">Chiudi</button></div>`;
  }
  return `<h3>Riepilogo</h3>
    <p>Verranno registrati <b>${n_(scelte.length, "movimento", "movimenti")}</b>: entrate ${eur(somma((p) => p.importo > 0 && p.tipo !== "spostamento"))},
      uscite ${eur(somma((p) => p.importo < 0 && p.tipo !== "spostamento"))}, spostamenti tra casse ${eur(somma((p) => p.tipo === "spostamento"))}${fatture ? `; ${n_(fatture, "fattura segnata pagata", "fatture segnate pagate")}` : ""}.
      ${esclusi ? `Non registrati: ${esclusi}.` : ""}</p>
    ${controllo}
    ${mancano.length ? `<div class="avviso">Manca la voce per ${n_(mancano.length, "movimento", "movimenti")}: la scelga oppure tolga la spunta. <a href="#" data-azione="filtro" data-v="da-completare">Mostrali</a></div>` : ""}
    <label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="ricorda" ${imp.ricorda ? "checked" : ""}>
      Ricorda le scelte: la prossima volta Divisio le proporrà già per gli stessi nomi</label>
    <div class="riga-bottoni"><button class="btn" data-azione="registra" ${!scelte.length || mancano.length ? "disabled" : ""}>Registra ${n_(scelte.length, "movimento", "movimenti")} in contabilità</button>
      <button class="btn sec" data-azione="scarta">Scarta l'importazione</button></div>`;
}

function vistaFatte(ctx) {
  const el = importazioni(ctx.arch.movimenti());
  if (!el.length) return "";
  return `<div class="card"><details data-chiave="importazioni" ${imp ? "" : "open"}><summary>Estratti conto già caricati (${el.length})</summary>
    <table>${el.map((i) => `<tr><td>${esc(i.file || "estratto conto")}<br><span class="hint">${esc(ctx.arch.nomeConto(i.cassa))} · dal ${dataIt(i.dal)} al ${dataIt(i.al)} · caricato il ${new Date(i.il).toLocaleDateString("it-IT")}</span></td>
      <td class="n">${n_(i.n, "movimento", "movimenti")}</td>
      <td class="n"><button class="btn pericolo piccolo" data-azione="togliImportazione" data-id="${esc(i.id)}">Togli dalla contabilità</button></td></tr>`).join("")}</table>
    <p class="hint">«Togli dalla contabilità» elimina tutti i movimenti registrati da quel file (le fatture pagate tornano "da pagare"). Le scelte ricordate restano.</p>
  </details></div>`;
}

function vistaRicordati(arch) {
  const el = arch.impostazioniCon("banca:");
  if (!el.length) return "";
  const nomeScelta = (s) => (s.tipo === "spostamento" ? `spostamento con ${arch.nomeConto(s.altra)}` : `${arch.nomeConto(s.voce)} <span class="codice">${s.voce}</span>`);
  return `<div class="card"><details data-chiave="ricordati-banca"><summary>Nomi ricordati dagli estratti conto (${el.length})</summary>
    <p class="hint">Per questi nomi Divisio propone già la scelta fatta l'ultima volta.</p>
    <table>${el.sort((a, b) => String(a.valore.nome).localeCompare(String(b.valore.nome))).map((i) => `<tr><td>${esc(i.valore.nome || i.chiave.slice(6))}</td>
      <td>${(i.valore.scelte ?? []).map((s) => `${nomeScelta(s)}${s.firma ? ` <span class="hint">(«${esc(s.firma)}»)</span>` : ""}`).join("<br>")}</td>
      <td class="n"><button class="btn sec piccolo" data-azione="dimentica" data-chiave="${esc(i.chiave)}">Dimentica</button></td></tr>`).join("")}</table>
  </details></div>`;
}

/* ---------- aggiornamenti parziali (senza ridisegnare tutta la pagina) ---------- */

const riga = (el) => imp.righe.find((p) => p.id === el.dataset.r);

function ridisegnaRighe(ctx, ids) {
  for (const id of ids) {
    const p = imp.righe.find((x) => x.id === id);
    const tr = document.getElementById("r-" + id);
    if (!p || !tr) continue;
    // resta visibile anche se non è più di questo elenco, finché non si cambia elenco
    tr.outerHTML = rigaHTML(p, ctx);
  }
  const r = $("#riepilogo-banca");
  if (r) r.innerHTML = riepilogoHTML(ctx);
  const filtri = $("#revisione .filtro-fatture");
  if (filtri) filtri.innerHTML = FILTRI.map(([k, nome]) => `<button class="${imp.filtro === k ? "on sposta" : ""}" data-azione="filtro" data-v="${k}">${nome} (${imp.righe.filter((p) => nelFiltro(p, k)).length})</button>`).join("");
}

/** Dopo una scelta: la stessa vale per gli altri movimenti dello stesso nome (e della stessa causale) ancora da decidere. */
function propaga(p) {
  if (!p.chiave) return [];
  const cambiati = [];
  for (const x of imp.righe) {
    if (x === p || !x.includi || x.chiave !== p.chiave || x.firma !== p.firma || Math.sign(x.importo) !== Math.sign(p.importo)) continue;
    if (!["nessuno", "copiato"].includes(x.livello) || x.stato === "fattura") continue;
    Object.assign(x, { tipo: p.tipo, voce: p.voce, altra: p.altra, quotaTeatro: p.quotaTeatro, livello: "copiato",
      motivo: `Come per l'altro movimento ${p.controparte?.nome ? "di " + maiuscole(p.controparte.nome) : "uguale"} del ${dataIt(p.data)}.` });
    Object.assign(x, aggiornaStato(x));
    cambiati.push(x.id);
  }
  return cambiati;
}

function dopoScelta(p, ctx) {
  p.livello = "scelto";
  p.motivo = "Scelta da lei.";
  Object.assign(p, aggiornaStato(p));
  const altri = propaga(p);
  ridisegnaRighe(ctx, [p.id, ...altri]);
  if (altri.length) toast(`Stessa scelta anche per ${n_(altri.length, "altro movimento", "altri movimenti")}${p.controparte?.nome ? " di " + maiuscole(p.controparte.nome) : ""}`);
}

/* ---------- trascinamento del file ---------- */
export function dopo(ctx) {
  const zona = $("#zona-banca");
  if (zona) {
    const su = (ev) => { ev.preventDefault(); zona.classList.add("sopra"); };
    zona.addEventListener("dragenter", su);
    zona.addEventListener("dragover", su);
    zona.addEventListener("dragleave", (ev) => { if (!zona.contains(ev.relatedTarget)) zona.classList.remove("sopra"); });
    zona.addEventListener("drop", (ev) => { ev.preventDefault(); zona.classList.remove("sopra"); carica(ev.dataTransfer.files[0], ctx).catch((e) => toast("Errore: " + e.message)); });
  }
  if (imp?.scorri) { imp.scorri = false; $("#importazione")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

/* ---------- eventi ---------- */

export const input = {
  descr(el) { const p = riga(el); if (p) p.descr = el.value; },
};

export const cambia = {
  file(el, ev, ctx) { const f = el.files[0]; el.value = ""; return carica(f, ctx).then(() => { if (imp) { imp.scorri = true; ctx.aggiorna(); } }); },
  includi(el, ev, ctx) {
    const p = riga(el);
    p.includi = el.checked;
    if (p.includi && p.giaRegistrato) { p.stato = "da-completare"; p.giaRegistrato = null; p.motivo = "Lo ha spuntato lei: scelga la voce."; Object.assign(p, aggiornaStato(p)); }
    ridisegnaRighe(ctx, [p.id]);
  },
  tipo(el, ev, ctx) { const p = riga(el); p.tipo = el.value; if (p.tipo === "spostamento") p.voce = ""; else p.altra = ""; dopoScelta(p, ctx); },
  voce(el, ev, ctx) { const p = riga(el); p.voce = el.value; if (p.stato === "fattura") { Object.assign(p, aggiornaStato(p)); ridisegnaRighe(ctx, [p.id]); return; } dopoScelta(p, ctx); },
  altra(el, ev, ctx) { const p = riga(el); p.altra = el.value; dopoScelta(p, ctx); },
  quota(el, ev, ctx) { const p = riga(el); p.quotaTeatro = Number(el.value) || 0; if (p.stato === "fattura") { ridisegnaRighe(ctx, [p.id]); return; } dopoScelta(p, ctx); },
  usaFattura(el, ev, ctx) {
    const p = riga(el);
    p.usaFattura = el.checked;
    if (!p.usaFattura) {
      Object.assign(p, { tipo: "uscita", stato: "da-completare", livello: p.voce ? "fornitore" : "nessuno", motivo: p.voce ? "Voce proposta per questo fornitore." : "Scelga la voce." });
      Object.assign(p, aggiornaStato(p));
    }
    ridisegnaRighe(ctx, [p.id]);
  },
  ricorda(el) { imp.ricorda = el.checked; },
  colonna(el) { const i = el.value === "" ? null : Number(el.value); if (i === null) delete imp.colonne[el.dataset.campo]; else imp.colonne[el.dataset.campo] = [i]; },
  rigaTitoli(el, ev, ctx) { imp.riga = Number(el.value); ctx.aggiorna(); },
};

export const azioni = {
  vaiImpostazioni: (el, ev, ctx) => ctx.vai("impostazioni"),
  filtro(el, ev, ctx) { imp.filtro = el.dataset.v; ctx.aggiorna(); $("#revisione")?.scrollIntoView({ block: "start" }); },
  cassa(el, ev, ctx) { imp.cassa = el.dataset.v; prepara(ctx); ctx.aggiorna(); },
  rileggi(el, ev, ctx) {
    imp.lettura = leggiEstratto(imp.tabella, { colonne: structuredClone(imp.colonne), riga: imp.riga });
    imp.colonneCambiate = true;
    imp.colonneAperte = !imp.lettura.ok;
    prepara(ctx);
    ctx.aggiorna();
    toast(imp.lettura.ok ? `Riletto: ${n_(imp.lettura.righe.length, "movimento", "movimenti")}` : imp.lettura.errore);
  },
  rimettiFattura(el, ev, ctx) { const p = riga(el); Object.assign(p, { usaFattura: true, stato: "fattura", tipo: "uscita", altra: "" }); ridisegnaRighe(ctx, [p.id]); },
  scarta(el, ev, ctx) {
    if (imp?.righe?.some((p) => p.livello === "scelto") && !confirm("Scartare l'importazione? Le scelte fatte su questo file andranno perse e in contabilità non verrà registrato nulla.")) return;
    imp = null;
    ctx.aggiorna();
    toast("Importazione scartata: in contabilità non è cambiato nulla");
  },
  async registra(el, ev, ctx) {
    const { arch } = ctx;
    const scelte = imp.righe.filter((p) => p.includi);
    if (scelte.some((p) => !completa(p))) { toast("Mancano alcune voci"); return; }
    const t = teatro(arch);
    const contoTeatro = t.conto || CONTO_TEATRO;
    const importazione = { id: nuovoId(), file: imp.nomeFile, il: new Date().toISOString() };
    const movimenti = [], fatture = new Map(), memorie = new Map(), fornitori = new Map();
    const oggi = oggiISO();
    for (const p of scelte) {
      let m;
      if (p.stato === "fattura" && p.usaFattura) {
        const f = fatture.get(p.fattura.id) ?? arch.fattura(p.fattura.id);
        const rata = f?.rate.find((r) => r.n === p.fattura.n);
        if (!rata) { toast(`La fattura del movimento del ${dataIt(p.data)} non c'è più nello scadenzario`); return; }
        let esito;
        try { esito = segnaPagata(f, p.fattura.n, { data: p.data, modalita: modalitaDaTesto(p.descrizione) || rata.modalita, cassa: imp.cassa, voce: p.voce, quotaTeatro: t.attivo ? p.quotaTeatro : 0, contoTeatro }); }
        catch (e) { toast(`${dataIt(p.data)}: ${e.message}`); return; }
        fatture.set(f.id, esito.fattura);
        m = { ...esito.movimento, banca: datiBanca(p, imp.cassa, importazione) };
        if (imp.ricorda) fornitori.set(chiaveFornitore(f), { nome: f.fornitore, voce: p.voce || arch.impostazione(chiaveFornitore(f))?.voce || "", ...(t.attivo ? { quotaTeatro: p.quotaTeatro } : {}) });
      } else m = movimentoProposta(p, imp.cassa, importazione, { contoTeatro });
      const err = verificaMovimento(m, { conti: arch.conti });
      if (err.length) { toast(`Movimento del ${dataIt(p.data)} (${p.descr}): ${err[0]}`); return; }
      movimenti.push(m);
      if (imp.ricorda && p.chiave && !(p.stato === "fattura" && p.usaFattura && !p.voce)) memorie.set(p.chiave, ricorda(memorie.get(p.chiave) ?? arch.impostazione(p.chiave), p, oggi));
    }
    const impostazioni = [...[...memorie].map(([chiave, valore]) => ({ chiave, valore })), ...[...fornitori].map(([chiave, valore]) => ({ chiave, valore }))];
    const titoli = imp.riga >= 0 ? imp.tabella[imp.riga] : null;
    if (titoli) impostazioni.push({ chiave: CHIAVE_FORMATO + impronta(titoli), valore: { colonne: imp.lettura.colonne, cassa: imp.cassa } });
    el.disabled = true;
    await arch.salvaInsieme({ movimenti, fatture: [...fatture.values()], impostazioni });
    const anni = [...new Set(movimenti.map((m) => m.data.slice(0, 4)))];
    imp = null;
    toast(`Registrati ${n_(movimenti.length, "movimento", "movimenti")} ✓${anni.length > 1 || anni[0] !== String(ctx.anno) ? ` (anno ${anni.join(", ")})` : ""}`);
    ctx.aggiorna();
  },
  async togliImportazione(el, ev, ctx) {
    const { arch } = ctx;
    const mov = arch.movimenti().filter((m) => m.banca?.importazione === el.dataset.id);
    if (!mov.length) return;
    const conFattura = mov.filter((m) => m.fattura);
    if (!confirm(`Togliere dalla contabilità i ${mov.length} movimenti registrati da «${mov[0].banca.file}»?${conFattura.length ? `\n\n${n_(conFattura.length, "fattura tornerà", "fatture torneranno")} "da pagare".` : ""}\n\nSe li aveva già passati a UNIO, la pagina "Per UNIO" preparerà la correzione.`)) return;
    const fatture = new Map();
    for (const m of conFattura) {
      const f = fatture.get(m.fattura.id) ?? arch.fattura(m.fattura.id);
      if (f) fatture.set(f.id, tornaDaPagare(f, m.fattura.rata).fattura);
    }
    await arch.salvaInsieme({ fatture: [...fatture.values()], movimentiDaEliminare: mov.map((m) => m.id) });
    toast(`Tolti ${n_(mov.length, "movimento", "movimenti")} dalla contabilità`);
    ctx.aggiorna();
  },
  async dimentica(el, ev, ctx) {
    await ctx.arch.salvaImpostazione(el.dataset.chiave, null);
    toast("Nome dimenticato");
    ctx.aggiorna();
  },
};
