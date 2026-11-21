// Pagina "Per UNIO": file riepilogativo da importare in UNIO, foglio guida e registro degli invii.

import { TRIMESTRI, periodo, preparaInvio, senzaCassa, descrizioneRiga, csvImportazione, inviiDi } from "../dominio/ponte.js";
import { casseInOrdine } from "../dominio/piano.js";
import { totaliRighe } from "../dominio/scritture.js";
import { esc, eur, dataIt, scarica, toast, locale } from "./util.js";
import { tabellaRighe } from "./elenco.js";

const sel = { cassa: null, trimestre: null };
const fatti = new Set();   // caselle "fatto" del foglio guida (solo su questo schermo)

const casse = (arch) => casseInOrdine(arch.contiAttivi());
const invii = (arch) => arch.impostazione("unio-invii", []);
export const primoAnnoUNIO = (arch) => arch.impostazione("unio-dal", 2027);
const trimestreCorrente = () => `T${Math.floor(new Date().getMonth() / 3) + 1}`;

export function prepara(ctx, opz = {}) {
  if (opz.cassa) sel.cassa = opz.cassa;
  if (opz.trimestre) sel.trimestre = opz.trimestre;
}

function dati(ctx) {
  const cs = casse(ctx.arch);
  if (!sel.cassa || !cs.some((c) => c.codice === sel.cassa)) sel.cassa = cs[0]?.codice;
  if (!sel.trimestre) sel.trimestre = trimestreCorrente();
  const p = periodo(ctx.anno, sel.trimestre);
  const tutti = ctx.arch.movimenti();
  const inv = preparaInvio(tutti, invii(ctx.arch), sel.cassa, p);
  const righe = inv.righe.map((r) => ({ ...r, descr: descrizioneRiga(r, ctx.arch.nomeConto(r.codice), p) }));
  return { p, cs, righe, inv, manuali: senzaCassa(tutti, p) };
}

const quando = (x) => new Date(x.quando).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const chiaveFatto = (r) => `${sel.cassa}|${sel.trimestre}|${r.codice}|${r.dir}|${r.importo}`;

export function vista(ctx) {
  const { p, cs, righe, inv, manuali } = dati(ctx);
  const nomeCassa = esc(ctx.arch.nomeConto(sel.cassa));
  const ultimo = inv.precedenti.at(-1);
  const tot = (d) => righe.filter((r) => r.dir === d).reduce((s, r) => s + r.importo, 0);
  const statoTrimestre = (t) => {
    const x = inviiDi(invii(ctx.arch), sel.cassa, periodo(ctx.anno, t)).at(-1);
    return x ? ` – importato il ${new Date(x.quando).toLocaleDateString("it-IT")}` : "";
  };

  return `
  <h2>Prepara i dati per UNIO</h2>
  <p class="lead">Divisio riassume i movimenti di una cassa o banca in poche righe, una per voce.
    In UNIO si carica il file e per ogni riga si sceglie il codice scritto all'inizio.</p>
  <p class="hint solo-schermo">C'è anche un secondo modo, per chi non vuole registrare nulla in UNIO: a fine anno si ricopiano a mano le cifre del Rendiconto di Divisio
    nel Rendiconto Parrocchiale di UNIO. Attenzione: funziona solo se in UNIO non c'è <b>nessuna</b> registrazione. Vedi la <a href="guida.html#trimestre" target="_blank" rel="noopener">Guida, capitolo 12</a>.</p>

  ${ctx.anno < primoAnnoUNIO(ctx.arch) ? `<div class="nota solo-schermo">Il passaggio dei dati a UNIO tramite Divisio parte dal <b>${primoAnnoUNIO(ctx.arch)}</b>.
    I movimenti del ${ctx.anno} sono già stati inseriti direttamente in UNIO: per quest'anno non importi nulla. Se vuole, può controllarli con il confronto (facoltativo) nella pagina Rendiconto.</div>` : ""}
  <div class="card solo-schermo">
    <div class="griglia g2">
      <div><label class="campo">Cassa o banca</label><div class="scelta">${cs.map((c) =>
        `<button type="button" class="${c.codice === sel.cassa ? "on sposta" : ""}" data-azione="cassa" data-v="${c.codice}">${esc(c.nome)}</button>`).join("")}</div></div>
      <div><label class="campo" for="u-trim">Trimestre</label><select id="u-trim" data-cambia="trimestre">${Object.entries(TRIMESTRI).map(([k, t]) =>
        `<option value="${k}" ${k === sel.trimestre ? "selected" : ""}>${t[2]} ${ctx.anno}${statoTrimestre(k)}</option>`).join("")}</select></div>
    </div>
    ${!ultimo ? `<div class="nota">Questo trimestre di ${nomeCassa} non è ancora stato importato in UNIO.
        Importi solo movimenti che <b>non</b> sono già in UNIO (per esempio, non quelli del 2026 inseriti direttamente in UNIO).</div>`
      : !righe.length ? `<div class="ok">✓ Importato in UNIO il ${quando(ultimo)} da ${esc(ultimo.autore || "—")}. Non ci sono novità da aggiungere.</div>`
      : `<div class="avviso">Già importato in UNIO il ${quando(ultimo)} da ${esc(ultimo.autore || "—")}. Dopo, alcuni movimenti sono cambiati:
          qui sotto ci sono <b>solo le differenze</b> da aggiungere in UNIO.</div>`}
    ${righe.length ? `
    <h3 style="margin-top:18px">Come si fa</h3>
    <ol class="passi">
      <li>Prema <b>"Scarica il file per UNIO"</b> (finisce nella cartella Download).</li>
      <li>In UNIO: <b>Partita Doppia</b> → quadratino giallo <b>"Importazione Prima Nota"</b>. Come descrizione scriva per esempio "${esc(p.nome)}";
        come conto di riferimento scelga <b>${nomeCassa}</b> <span class="codice">${sel.cassa.split("-").join(" – ")}</span>, poi carichi il file.</li>
      <li>Per ogni riga scelga in UNIO il <b>Gruppo, Conto e Sottoconto</b> scritti tra parentesi quadre (li trova anche nel foglio guida qui sotto) e completi l'importazione.</li>
      <li>Torni qui e prema <b>"Ho importato in UNIO"</b>: la prossima volta Divisio preparerà solo le novità.</li>
      <li>Se vuole controllare (facoltativo): in UNIO esporti il CSV dei saldi e lo carichi nella pagina <a href="#" data-azione="vai" data-pagina="rendiconto">Rendiconto</a>.</li>
    </ol>
    <div class="riga-bottoni"><button class="btn" data-azione="scarica">Scarica il file per UNIO</button>
      <button class="btn sec" data-azione="stampa">Stampa il foglio guida</button>
      <button class="btn sec" data-azione="fatto">Ho importato in UNIO</button></div>` : ""}
  </div>

  <div class="card"><h3>Foglio guida · ${nomeCassa} · ${esc(p.nome)}</h3>
    ${righe.length ? `<div class="scorri"><table class="rendiconto">
      <tr><th>Data</th><th>Descrizione</th><th class="n">Uscite</th><th class="n">Entrate</th><th>Da scegliere in UNIO</th><th>Fatto</th></tr>
      ${righe.map((r, i) => `<tr><td class="nowrap">${dataIt(r.data)}</td><td>${esc(r.descr)}</td>
        <td class="n">${r.dir === "U" ? eur(r.importo) : ""}</td><td class="n">${r.dir === "E" ? eur(r.importo) : ""}</td>
        <td><b class="nowrap">${r.codice.split("-").join(" – ")}</b><br><span class="hint">${esc(ctx.arch.nomeConto(r.codice))}</span></td>
        <td><input type="checkbox" class="spunta-grande" data-cambia="spunta" data-i="${i}" ${fatti.has(chiaveFatto(r)) ? "checked" : ""} aria-label="Riga ${i + 1} fatta"></td></tr>`).join("")}
      <tr class="tot"><td colspan="2">Totale (${righe.length} righe)</td>${`<td class="n">${eur(tot("U"))}</td><td class="n">${eur(tot("E"))}</td>`}<td colspan="2"></td></tr>
    </table></div>` : `<p class="hint">Niente da importare per ${nomeCassa} in questo trimestre.</p>`}
    ${inv.altrove.length ? `<div class="nota">${inv.altrove.length === 1 ? "1 spostamento" : `${inv.altrove.length} spostamenti`} tra casse e banche di questo trimestre
      non compaiono qui: si importano nel file del conto che <b>riceve</b> i soldi, così non vengono contati due volte.</div>` : ""}
    ${manuali.length ? `<div class="avviso">Questi movimenti non toccano né cassa né banca: in UNIO vanno inseriti a mano in Partita Doppia
      (vale per tutte le casse, li trova anche negli altri fogli):</div>
      ${manuali.map((m) => `<details><summary>${dataIt(m.data)} · ${esc(m.descr)} · ${eur(totaliRighe(m.righe).dare)}</summary>${tabellaRighe(m.righe, ctx.arch)}</details>`).join("")}` : ""}
  </div>

  ${inv.precedenti.length ? `<div class="card solo-schermo"><details data-chiave="storico-unio"><summary>Importazioni già fatte per ${nomeCassa}, ${esc(p.nome)}</summary>
    <ul>${inv.precedenti.map((x) => `<li>${quando(x)} – ${esc(x.autore || "—")} – ${x.righeInviate?.length ?? "?"} righe</li>`).join("")}</ul>
    <button class="btn pericolo piccolo" data-azione="annullaUltimo">Annulla l'ultima ("non l'ho importata davvero")</button>
  </details></div>` : ""}
  <p class="hint solo-schermo">Divisio prepara i dati per UNIO a partire dall'anno
    <select data-cambia="dal" aria-label="Primo anno" style="width:auto;font-size:15px;padding:4px 8px">${[2026, 2027, 2028, 2029].map((a) =>
      `<option ${a === primoAnnoUNIO(ctx.arch) ? "selected" : ""}>${a}</option>`).join("")}</select> e ricorda i trimestri da portare in UNIO nella pagina Inizio.</p>
  ${vistaAzzeraInvii(ctx)}`;
}

const inviiAnno = (arch, anno) => invii(arch).filter((x) => x.anno === anno);

function vistaAzzeraInvii(ctx) {
  const n = inviiAnno(ctx.arch, ctx.anno).length;
  if (!n) return "";
  return `<div class="card solo-schermo"><details data-chiave="azzera-invii"><summary>Azzera le importazioni segnate del ${ctx.anno}</summary>
    <p>Divisio ricorda ${n === 1 ? "1 importazione segnata" : `${n} importazioni segnate`} con «Ho importato in UNIO» nel ${ctx.anno} (tutte le casse e banche)
      e prepara solo le novità. Azzerando, Divisio dimentica queste importazioni e prepara di nuovo i file <b>completi</b> di ogni trimestre.</p>
    <p class="hint">Serve, per esempio, se ha cancellato le importazioni in UNIO o se ricomincia la prova da capo. In UNIO non cambia nulla:
      se quei dati sono ancora in UNIO, importandoli di nuovo risulterebbero doppi.</p>
    <button class="btn pericolo" data-azione="azzeraInvii">Azzera le importazioni segnate del ${ctx.anno}</button></details></div>`;
}

export const azioni = {
  async azzeraInvii(el, ev, ctx) {
    const n = inviiAnno(ctx.arch, ctx.anno).length;
    if (!n || !confirm(`Dimenticare le ${n} importazioni in UNIO segnate nel ${ctx.anno}?\n\nDivisio preparerà di nuovo i file completi di ogni trimestre. In UNIO non cambia nulla.`)) return;
    await ctx.arch.salvaImpostazione("unio-invii", invii(ctx.arch).filter((x) => x.anno !== ctx.anno));
    toast("Importazioni segnate azzerate ✓");
    ctx.aggiorna();
  },
  cassa(el, ev, ctx) { sel.cassa = el.dataset.v; ctx.aggiorna(); },
  vai: (el, ev, ctx) => ctx.vai(el.dataset.pagina),
  stampa() { window.print(); },
  scarica(el, ev, ctx) {
    const { p, righe } = dati(ctx);
    const nome = ctx.arch.nomeConto(sel.cassa).normalize("NFD").replace(/[^\w]+/g, "_");
    scarica(`UNIO_${nome}_${sel.trimestre}_${p.anno}.csv`, csvImportazione(righe), "text/csv;charset=utf-8");
    toast("File scaricato (cartella Download) ✓");
  },
  async fatto(el, ev, ctx) {
    const { p, righe, inv } = dati(ctx);
    if (!righe.length) return;
    if (!confirm(`Confermi di aver importato in UNIO le ${righe.length} righe di ${ctx.arch.nomeConto(sel.cassa)} (${p.nome})?\n\nDa ora Divisio preparerà solo le novità.`)) return;
    const voce = { anno: p.anno, trimestre: sel.trimestre, cassa: sel.cassa, quando: new Date().toISOString(), autore: locale.leggi("autore", ""),
      fotografia: inv.fotografia, righeInviate: righe.map(({ codice, dir, importo }) => ({ codice, dir, importo })) };
    await ctx.arch.salvaImpostazione("unio-invii", [...invii(ctx.arch), voce]);
    toast("Segnato come importato in UNIO ✓");
    ctx.aggiorna();
  },
  async annullaUltimo(el, ev, ctx) {
    const { inv } = dati(ctx);
    const ultimo = inv.precedenti.at(-1);
    if (!ultimo || !confirm(`Annullare l'importazione segnata il ${quando(ultimo)}?\n\nLo faccia solo se quelle righe NON sono state davvero importate in UNIO.`)) return;
    await ctx.arch.salvaImpostazione("unio-invii", invii(ctx.arch).filter((x) => x !== ultimo && x.quando !== ultimo.quando));
    toast("Annullato");
    ctx.aggiorna();
  },
};

export const cambia = {
  async dal(el, ev, ctx) { await ctx.arch.salvaImpostazione("unio-dal", Number(el.value)); ctx.aggiorna(); },
  trimestre(el, ev, ctx) { sel.trimestre = el.value; ctx.aggiorna(); },
  spunta(el, ev, ctx) { const r = dati(ctx).righe[el.dataset.i]; if (el.checked) fatti.add(chiaveFatto(r)); else fatti.delete(chiaveFatto(r)); },
};
