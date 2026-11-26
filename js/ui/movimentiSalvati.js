// Riquadro "Carica movimenti salvati" della pagina Movimenti: da una copia di sicurezza o da un CSV scaricato da Divisio.

import { leggiMovimentiSalvati, confrontaSalvati } from "../dominio/movimentiSalvati.js";
import { nuovoIstante } from "../dominio/unione.js";
import { esc, dataIt, toast, locale } from "./util.js";

let aperto = false;
let anteprima = null;   // { nomeFile, errore } oppure { nomeFile, tipo, salvatoIl, movimenti, contiNuovi, problemi, fattureStaccate, anni: Set, carica: Set }
const n_ = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

export const riquadroSalvatiAperto = () => aperto;

/** Movimenti degli anni scelti, divisi in nuovi / già in Divisio / forse già in Divisio. */
function situazione(a, arch) {
  const scelti = a.movimenti.filter((m) => a.anni.has(m.data.slice(0, 4)));
  return confrontaSalvati(scelti, arch.movimenti());
}
const daCaricare = (a, s) => s.nuovi.filter((m) => !s.forse.has(m.id) || a.carica.has(m.id));

export function vistaCard(ctx) {
  return `<div class="card evidenza" id="carica-salvati"><div class="riga"><h3 class="spazio">Caricare movimenti salvati</h3>
      ${anteprima?.movimenti ? "" : `<button class="btn sec piccolo" data-azione="chiudiSalvati">Chiudi</button>`}</div>
    <p>Può caricare uno di questi file:</p>
    <ul>
      <li>una <b>copia di sicurezza</b> di Divisio (file <b>.json</b>, per esempio quella scaricata prima di azzerare):
        si riprendono <b>solo i movimenti</b>, esattamente com'erano; fatture, impostazioni e piano dei conti restano come sono adesso;</li>
      <li>un file scaricato qui con <b>«Scarica in CSV (Excel)»</b>, anche modificato in Excel: tornano entrate, uscite e spostamenti
        (i saldi di apertura no, perché il CSV ne ha solo il totale).</li>
    </ul>
    <p class="hint">I movimenti che ci sono già in Divisio non si caricano di nuovo. Quelli che forse ci sono già (stesso importo e stessa data,
      o stessa descrizione a pochi giorni) si mostrano: li carica solo se li spunta. Si può annullare con «↶ Annulla».</p>
    <div class="riga-bottoni"><label class="btn">Scegli il file…<input type="file" accept=".json,.csv,application/json,text/csv" hidden data-cambia="fileSalvati"></label></div>
    ${anteprima ? vistaAnteprima(ctx) : ""}
  </div>`;
}

function vistaAnteprima(ctx) {
  const a = anteprima;
  if (a.errore) return `<div class="avviso"><b>${esc(a.nomeFile)}</b>: ${esc(a.errore)}</div>`;
  const s = situazione(a, ctx.arch);
  const carica = daCaricare(a, s);
  const anni = [...new Set(a.movimenti.map((m) => m.data.slice(0, 4)))].sort();
  const quanti = (anno) => a.movimenti.filter((m) => m.data.startsWith(anno)).length;
  return `<div class="nota"><b>${esc(a.nomeFile)}</b> – ${a.tipo === "copia" ? `copia di sicurezza${a.salvatoIl ? ` del ${new Date(a.salvatoIl).toLocaleString("it-IT")}` : ""}` : "file CSV scaricato da Divisio"}:
      ${n_(a.movimenti.length, "movimento", "movimenti")}.</div>
    ${anni.length > 1 ? `<p>Anni da caricare:</p><div class="riga">${anni.map((y) => `<label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="annoSalvati" data-anno="${y}" ${a.anni.has(y) ? "checked" : ""}>
        ${y} (${quanti(y)})</label>`).join("")}</div>` : ""}
    <ul>
      <li><b>${n_(carica.length, "movimento da caricare", "movimenti da caricare")}</b></li>
      ${s.gia.length ? `<li>${n_(s.gia.length, "movimento c'è già", "movimenti ci sono già")} in Divisio: non si caricano.</li>` : ""}
      ${a.contiNuovi.length ? `<li>Verranno rimessi in uso ${n_(a.contiNuovi.length, "sottoconto usato", "sottoconti usati")} da questi movimenti: ${a.contiNuovi.map((c) => `${esc(c.nome)} <span class="codice">${c.codice}</span>`).join(", ")}.</li>` : ""}
      ${a.fattureStaccate ? `<li>${n_(a.fattureStaccate, "uscita era collegata", "uscite erano collegate")} a una fattura che ora nello scadenzario non risulta pagata:
        ${a.fattureStaccate === 1 ? "si carica" : "si caricano"} come ${a.fattureStaccate === 1 ? "movimento normale" : "movimenti normali"}; lo scadenzario resta com'è.</li>` : ""}
    </ul>
    ${s.forse.size ? `<div class="avviso">${s.forse.size === 1 ? "1 movimento potrebbe essere già in Divisio" : `${s.forse.size} movimenti potrebbero essere già in Divisio`}: non ${s.forse.size === 1 ? "verrà caricato" : "verranno caricati"}, a meno che lo spunti.</div>
      <ul class="elenco-forse">${s.nuovi.filter((m) => s.forse.has(m.id)).map((m) => `<li><label class="spunta-riga"><input type="checkbox" class="spunta-grande" data-cambia="caricaSalvato" data-id="${esc(m.id)}" ${a.carica.has(m.id) ? "checked" : ""}>
        <span><b>${dataIt(m.data)} – ${esc(m.descr)}</b><br><span class="hint">${esc(s.forse.get(m.id))}</span></span></label></li>`).join("")}</ul>` : ""}
    ${a.problemi.length ? `<details ${a.problemi.length <= 3 ? "open" : ""}><summary>${n_(a.problemi.length, "riga non caricata o da controllare", "righe non caricate o da controllare")}</summary>
      <ul>${a.problemi.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></details>` : ""}
    <div class="riga-bottoni"><button class="btn" data-azione="caricaSalvati" ${carica.length ? "" : "disabled"}>Carica ${n_(carica.length, "movimento", "movimenti")}</button>
      <button class="btn sec" data-azione="annullaSalvati">Annulla</button></div>`;
}

export const cambia = {
  async fileSalvati(el, ev, ctx) {
    const file = el.files[0];
    el.value = "";
    if (!file) return;
    const l = leggiMovimentiSalvati(await file.text(), { conti: ctx.arch.conti, fatture: ctx.arch.fatture() });
    if (!l.ok) { anteprima = { nomeFile: file.name, errore: l.errore }; ctx.aggiorna(); return; }
    if (!l.movimenti.length) { anteprima = { nomeFile: file.name, errore: ["Nel file non c'è nessun movimento da caricare.", ...l.problemi].join(" ") }; ctx.aggiorna(); return; }
    anteprima = { nomeFile: file.name, ...l, anni: new Set(l.movimenti.map((m) => m.data.slice(0, 4))), carica: new Set() };
    ctx.aggiorna();
  },
  annoSalvati(el, ev, ctx) { if (el.checked) anteprima.anni.add(el.dataset.anno); else anteprima.anni.delete(el.dataset.anno); ctx.aggiorna(); },
  caricaSalvato(el, ev, ctx) { if (el.checked) anteprima.carica.add(el.dataset.id); else anteprima.carica.delete(el.dataset.id); ctx.aggiorna(); },
};

export const azioni = {
  apriSalvati(el, ev, ctx) { aperto = true; ctx.aggiorna(); document.getElementById("carica-salvati")?.scrollIntoView({ block: "start" }); },
  chiudiSalvati(el, ev, ctx) { aperto = false; anteprima = null; ctx.aggiorna(); },
  annullaSalvati(el, ev, ctx) { anteprima = null; ctx.aggiorna(); },
  async caricaSalvati(el, ev, ctx) {
    const a = anteprima;
    if (!a?.movimenti) return;
    const carica = daCaricare(a, situazione(a, ctx.arch));
    if (!carica.length) return;
    el.disabled = true;
    const autore = locale.leggi("autore", "") || "Utente";
    const ora = new Date().toISOString();
    let t = null;
    const marca = () => ({ modificatoIl: (t = nuovoIstante(t)), autore });
    const movimenti = carica.map((m) => ({ ...m, creatoIl: m.creatoIl ?? ora, ...marca() }));
    const conti = a.contiNuovi.map((c) => ({ ...c, ...marca() }));
    const etichetta = `Caricamento di ${n_(movimenti.length, "movimento salvato", "movimenti salvati")} (${a.nomeFile})`;
    await ctx.arch.unisci({ conti, movimenti, impostazioni: [] }, { etichetta });
    anteprima = null;
    aperto = false;
    const anni = [...new Set(movimenti.map((m) => m.data.slice(0, 4)))].sort();
    toast(`${movimenti.length === 1 ? "Caricato 1 movimento" : `Caricati ${movimenti.length} movimenti`} ✓ (${anni.join(", ")})`);
    ctx.aggiorna();
  },
};
