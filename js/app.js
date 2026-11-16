// Avvio di Divisio: apre l'archivio, disegna le pagine e smista i clic.

import { apriArchivio } from "./dati/archivio.js";
import { esc, locale, toast, $ } from "./ui/util.js";
import * as inizio from "./ui/inizio.js";
import * as registra from "./ui/registra.js";
import * as movimenti from "./ui/movimenti.js";
import * as rendiconto from "./ui/rendiconto.js";
import * as unio from "./ui/unio.js";
import * as impostazioni from "./ui/impostazioni.js";
import * as condivisione from "./ui/condivisione.js";

export const VERSIONE = "0.5.2";

const PAGINE = {
  inizio: { modulo: inizio, nome: "Inizio" },
  registra: { modulo: registra, nome: "Registra" },
  movimenti: { modulo: movimenti, nome: "Movimenti" },
  rendiconto: { modulo: rendiconto, nome: "Rendiconto" },
  unio: { modulo: unio, nome: "Per UNIO" },
  impostazioni: { modulo: impostazioni, nome: "Impostazioni" },
};

const ctx = {
  arch: null,
  pagina: "inizio",
  anno: locale.leggi("anno", new Date().getFullYear()),
  vai(pagina, opz = {}) {
    ctx.pagina = PAGINE[pagina] ? pagina : "inizio";
    PAGINE[ctx.pagina].modulo.prepara?.(ctx, opz);
    disegna();
    window.scrollTo(0, 0);
    $("#principale").focus({ preventScroll: true });
  },
  aggiorna() { disegna(true); },
  aggiornaIntestazione() { disegnaIntestazione(); },
};

function anniDisponibili() {
  const corrente = new Date().getFullYear();
  const anni = new Set([corrente, corrente - 1, ctx.anno]);
  for (const m of ctx.arch.movimenti()) anni.add(Number(m.data.slice(0, 4)));
  return [...anni].sort((a, b) => b - a);
}

function disegnaIntestazione() {
  const nome = ctx.arch.impostazione("parrocchia", {}).nome || "La mia parrocchia";
  $("#nome-parrocchia").textContent = nome;
  $("#anno").innerHTML = anniDisponibili().map((a) => `<option value="${a}" ${a === ctx.anno ? "selected" : ""}>Anno ${a}</option>`).join("");
  $("#menu").innerHTML = Object.entries(PAGINE).map(([k, p]) =>
    `<button data-pagina="${k}" ${k === ctx.pagina ? 'class="on" aria-current="page"' : ""}>${p.nome}</button>`).join("");
  $("#stato-condivisione").innerHTML = condivisione.indicatore();
}

/** Quando arrivano dati dagli altri computer: ridisegna, ma non mentre si sta scrivendo in un campo. */
function dopoCondivisione(esito = {}) {
  $("#stato-condivisione").innerHTML = condivisione.indicatore();
  if (!esito.arrivati) { if (ctx.pagina === "impostazioni" && !staScrivendo()) disegna(true); return; }
  if (ctx.pagina === "registra" || staScrivendo()) { toast("Sono arrivati aggiornamenti dagli altri computer"); return; }
  disegna(true);
  toast("Aggiornato con i dati degli altri computer ✓");
}
const staScrivendo = () => { const a = document.activeElement; return a && $("#principale").contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };

function disegna(mantieni = false) {
  const main = $("#principale");
  // ricorda quali sezioni erano aperte e dove si era arrivati
  const aperte = mantieni ? new Set([...main.querySelectorAll("details[data-chiave][open]")].map((d) => d.dataset.chiave)) : new Set();
  const y = window.scrollY;
  disegnaIntestazione();
  const m = PAGINE[ctx.pagina].modulo;
  main.innerHTML = m.vista(ctx);
  for (const d of main.querySelectorAll("details[data-chiave]")) if (aperte.has(d.dataset.chiave)) d.open = true;
  if (mantieni) window.scrollTo(0, y);
  m.dopo?.(ctx);
}

/* ---------- smistamento degli eventi verso la pagina attiva ---------- */
function collega() {
  const main = $("#principale");
  const gestisci = (tipo, attributo) => (ev) => {
    const el = ev.target.closest(`[${attributo}]`);
    if (!el || !main.contains(el)) return;
    const fn = PAGINE[ctx.pagina].modulo[tipo]?.[el.getAttribute(attributo)];
    if (!fn) return;
    if (tipo === "azioni") ev.preventDefault();
    Promise.resolve(fn(el, ev, ctx)).catch((e) => { console.error(e); toast("Si è verificato un errore: " + e.message); });
  };
  main.addEventListener("click", gestisci("azioni", "data-azione"));
  main.addEventListener("input", gestisci("input", "data-input"));
  main.addEventListener("change", gestisci("cambia", "data-cambia"));

  $("#stato-condivisione").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-condivisione]");
    if (!b) return;
    if (b.dataset.condivisione === "riattiva") { await condivisione.riattiva(); disegna(true); }
    else ctx.vai("impostazioni");
  });
  $("#menu").addEventListener("click", (ev) => { const b = ev.target.closest("[data-pagina]"); if (b) ctx.vai(b.dataset.pagina); });
  $("#anno").addEventListener("change", (ev) => {
    ctx.anno = Number(ev.target.value);
    locale.scrivi("anno", ctx.anno);
    ctx.vai(ctx.pagina);
  });
}

async function avvia() {
  try {
    ctx.arch = await apriArchivio({ autore: locale.leggi("autore", "") });
  } catch (e) {
    console.error(e);
    $("#principale").innerHTML = `<div class="card errore"><h3>Divisio non riesce a salvare i dati in questo browser</h3>
      <p>Succede con le finestre "in incognito" o se il browser blocca i dati dei siti. Apra Divisio in una finestra normale di Chrome o Edge.</p>
      <p class="hint">${esc(e.message)}</p></div>`;
    return;
  }
  collega();
  ctx.vai("inizio");
  condivisione.inizializza(ctx, dopoCondivisione).catch((e) => { console.error(e); toast("Condivisione non disponibile: " + e.message); });
  // chiede al browser di non cancellare mai i dati da solo
  navigator.storage?.persist?.().catch(() => {});
  // funzionamento senza internet e installazione come app (solo da indirizzo sicuro, o in prova con ?app)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.search.includes("app"))) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker non attivo", e));
  }
}

avvia();
