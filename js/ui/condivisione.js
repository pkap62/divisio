// Condivisione tramite la cartella "Divisio" nel Google Drive della parrocchia:
// scelta della cartella, permessi del browser, stato e guida.

import { creaCondivisione, cartellaDaHandle } from "../dati/condivisione.js";
import { nuovoId } from "../dominio/unione.js";
import { esc, locale, toast } from "./util.js";

export const supportata = () => typeof window.showDirectoryPicker === "function";

// stato: "non-supportata" | "spenta" | "da-riattivare" | "attiva"
const S = { stato: "spenta", motore: null, handle: null, ctx: null, alCambio: null, togliAscolto: null };
/** C'è una cartella condivisa scelta (anche se va ancora riattivata). */
export const condivisioneImpostata = () => Boolean(S.handle);

async function idDispositivo(arch) {
  let id = await arch.locale.leggi("dispositivo");
  if (!id) { id = nuovoId(); await arch.locale.scrivi("dispositivo", id); }
  return id;
}

async function avvia() {
  const { arch } = S.ctx;
  S.motore?.ferma();
  S.togliAscolto?.();
  S.motore = creaCondivisione({ arch, cartella: cartellaDaHandle(S.handle), dispositivo: await idDispositivo(arch), autore: () => locale.leggi("autore", "") });
  S.motore.ascolta((stato, esito) => S.alCambio?.(esito));
  S.togliAscolto = arch.ascolta(() => S.motore?.programma());   // dopo ogni modifica locale
  S.stato = "attiva";
  S.alCambio?.({});
  await S.motore.avvia(30000);
}

/** All'avvio di Divisio: riprende la condivisione se era già stata attivata su questo computer. */
export async function inizializza(ctx, alCambio) {
  S.ctx = ctx;
  S.alCambio = alCambio;
  if (!supportata()) { S.stato = "non-supportata"; return; }
  S.handle = await ctx.arch.locale.leggi("cartella");
  if (!S.handle) { S.stato = "spenta"; return; }
  const permesso = await S.handle.queryPermission({ mode: "readwrite" });
  if (permesso === "granted") await avvia();
  else S.stato = "da-riattivare";   // il browser vuole un clic dell'utente per ridare il permesso
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.stato === "attiva") S.motore.sincronizza(); });
}

export async function riattiva() {
  if (!S.handle) return;
  if ((await S.handle.requestPermission({ mode: "readwrite" })) === "granted") { await avvia(); toast("Condivisione riattivata ✓"); }
  else toast("Senza il permesso Divisio non può usare la cartella condivisa.");
}

/** Piccola scritta nella testata. */
export function indicatore() {
  if (S.stato === "da-riattivare") return `<button class="nuvola avviso-nuvola" data-condivisione="riattiva">☁ Riattiva la condivisione</button>`;
  if (S.stato !== "attiva") return "";
  const st = S.motore?.stato;
  if (st?.problema) return `<button class="nuvola avviso-nuvola" data-condivisione="vai">☁ Condivisione: problema</button>`;
  const ora = st?.ultimaVolta ? new Date(st.ultimaVolta).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "…";
  return `<button class="nuvola" data-condivisione="vai" title="Dati condivisi con gli altri computer">☁ Condiviso · ${ora}</button>`;
}

export function vistaCard() {
  const titolo = `<h3>Lavorare insieme (Google Drive della parrocchia)</h3>`;
  if (S.stato === "non-supportata") {
    return `<div class="card">${titolo}<div class="avviso">Per lavorare insieme agli altri computer apra Divisio con <b>Google Chrome</b> o <b>Microsoft Edge</b>.</div></div>`;
  }
  if (S.stato === "spenta") {
    return `<div class="card">${titolo}
      <p>Lei e i collaboratori potete registrare anche nello stesso momento: ogni computer scrive il proprio file nella cartella condivisa e legge quelli degli altri.</p>
      <ol class="passi">
        <li>Nel Google Drive della parrocchia crei una cartella chiamata <b>Divisio</b> (basta farlo una volta) e la condivida con ogni collaboratore.</li>
        <li>Su ogni computer installi <b>Google Drive per desktop</b>: il parroco accede con l'<b>account della parrocchia</b>, un collaboratore con il <b>proprio account</b>.</li>
        <li><b>Solo per i collaboratori</b>: in drive.google.com → <i>Condivisi con me</i> → clic destro su <b>Divisio</b> →
          <i>Organizza</i> → <i>Aggiungi scorciatoia</i> → <i>Il mio Drive</i>. Senza questo passaggio la cartella non compare sul computer.</li>
        <li>Prema qui sotto <b>"Scegli la cartella condivisa"</b> e selezioni la cartella Divisio:
          sul Mac nel Finder alla voce "Google Drive" → "Il mio Drive"; su Windows nell'unità "Google Drive (G:)" → "Il mio Drive".</li>
        <li>Ripeta il punto 4 su ogni computer. Ricordi di scrivere il nome di chi lo usa (più in basso in questa pagina).</li>
      </ol>
      <div class="nota">Da quel momento i dati della parrocchia saranno salvati anche in quella cartella del Google Drive della parrocchia:
        li può vedere chi ha accesso all'account. Divisio non li invia da nessun'altra parte.</div>
      <div class="riga-bottoni"><button class="btn" data-azione="scegliCartella">Scegli la cartella condivisa</button></div></div>`;
  }
  if (S.stato === "da-riattivare") {
    return `<div class="card">${titolo}<div class="avviso">La condivisione con la cartella «${esc(S.handle?.name)}» è in pausa:
      il browser chiede di confermare il permesso.</div>
      <div class="riga-bottoni"><button class="btn" data-azione="riattivaCondivisione">Riattiva</button>
      <button class="btn sec" data-azione="scollega">Scollega questo computer</button></div></div>`;
  }
  const st = S.motore.stato;
  return `<div class="card">${titolo}
    <div class="ok">✓ Collegato alla cartella «${esc(S.handle.name)}»${st.ultimaVolta ? ` · ultimo aggiornamento ${new Date(st.ultimaVolta).toLocaleTimeString("it-IT")}` : ""}</div>
    ${st.problema ? `<div class="errore">La cartella non risponde: ${esc(st.problema)}. Controlli che Google Drive per desktop sia acceso.</div>` : ""}
    ${st.altri.length ? `<p class="hint">Altri computer che usano questa cartella:</p><ul>${st.altri.map((a) =>
        `<li>${esc(a.autore)} <span class="hint">– ultimo salvataggio ${a.salvatoIl ? new Date(a.salvatoIl).toLocaleString("it-IT") : "—"}</span></li>`).join("")}</ul>`
      : `<p class="hint">Per ora nessun altro computer usa questa cartella.</p>`}
    ${st.avvisi.map((a) => `<div class="avviso">${esc(a)}</div>`).join("")}
    <p class="hint">Divisio controlla gli aggiornamenti ogni 30 secondi e dopo ogni registrazione. Se due persone correggono lo stesso movimento, vale l'ultima correzione.</p>
    <div class="riga-bottoni"><button class="btn sec" data-azione="aggiornaOra">Aggiorna adesso</button>
      <button class="btn sec" data-azione="scollega">Scollega questo computer</button></div></div>`;
}

export const azioni = {
  async scegliCartella(el, ev, ctx) {
    let handle;
    try { handle = await window.showDirectoryPicker({ id: "divisio", mode: "readwrite" }); }
    catch { return; }   // l'utente ha annullato
    if (!locale.leggi("autore", "")) toast("Ricordi di scrivere il suo nome qui sotto: comparirà agli altri computer.");
    await ctx.arch.locale.scrivi("cartella", handle);
    S.handle = handle;
    await avvia();
    toast(`Collegato alla cartella «${handle.name}» ✓`);
    ctx.aggiorna();
  },
  async riattivaCondivisione(el, ev, ctx) { await riattiva(); ctx.aggiorna(); },
  async aggiornaOra(el, ev, ctx) {
    const esito = await S.motore?.sincronizza();
    toast(esito?.errore ? "La cartella non risponde" : esito?.arrivati ? `Arrivati ${esito.arrivati} aggiornamenti ✓` : "Tutto già aggiornato ✓");
    ctx.aggiorna();
  },
  async scollega(el, ev, ctx) {
    if (!confirm("Scollegare questo computer dalla cartella condivisa?\n\nI dati restano su questo computer e nella cartella, ma non verranno più aggiornati.")) return;
    S.motore?.ferma();
    S.togliAscolto?.();
    S.motore = null;
    await ctx.arch.locale.elimina("cartella");
    S.handle = null;
    S.stato = "spenta";
    toast("Computer scollegato");
    ctx.aggiorna();
  },
};
