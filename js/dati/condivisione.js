// Lavorare in più persone tramite una cartella condivisa (es. Google Drive per desktop).
//
// Regola semplice che evita i conflitti: ogni computer scrive SOLO il proprio file
// "divisio-<computer>.json" e legge quelli degli altri. Ogni file contiene tutti i dati
// che quel computer conosce; l'unione tiene, per ogni record, la modifica più recente.
// Ogni file è anche una copia di sicurezza valida (si può ripristinare da Impostazioni).

import { creaBackup, verificaDati } from "../dominio/backup.js";
import { ordinaDati } from "../dominio/unione.js";

export const FILE_DIVISIO = /^divisio-.+\.json$/i;
export const nomeFile = (dispositivo) => `divisio-${String(dispositivo).slice(0, 8)}.json`;

/**
 * arch:       { esporta(), unisci(dati) → numero di record cambiati }
 * cartella:   { elenca() → [{nome, leggi()}], scrivi(nome, testo) }
 * dispositivo: identificativo di questo computer; autore(): nome di chi lo usa
 */
export function creaCondivisione({ arch, cartella, dispositivo, autore = () => "", adesso = () => new Date() }) {
  const mio = nomeFile(dispositivo);
  let ultimoScritto = null;            // contenuto dell'ultimo file scritto (per non riscriverlo uguale)
  let inCorso = null, ancora = false;
  const ascoltatori = new Set();
  const stato = { ultimaVolta: null, altri: [], avvisi: [], problema: null, arrivati: 0 };

  async function passaggio() {
    const avvisi = [], altri = [];
    let arrivati = 0;
    for (const f of await cartella.elenca()) {
      if (!FILE_DIVISIO.test(f.nome)) continue;
      let j;
      try { j = JSON.parse(await f.leggi()); } catch { avvisi.push(`${f.nome}: non leggibile in questo momento (forse Google Drive lo sta ancora scaricando).`); continue; }
      if (j?.app !== "Divisio" || !j.dati) { avvisi.push(`${f.nome}: non è un file di Divisio.`); continue; }
      const errori = verificaDati(j.dati);
      if (errori.length) { avvisi.push(`${f.nome}: ignorato (${errori[0]})`); continue; }
      if (f.nome === mio) { if (ultimoScritto === null) ultimoScritto = JSON.stringify(ordinaDati(j.dati)); }
      else altri.push({ nome: f.nome, autore: j.autore || "senza nome", salvatoIl: j.salvatoIl });
      arrivati += await arch.unisci(j.dati);
    }
    const dati = ordinaDati(arch.esporta());
    const testo = JSON.stringify(dati);
    let scritto = false;
    if (testo !== ultimoScritto) {
      await cartella.scrivi(mio, JSON.stringify({ ...creaBackup(dati, adesso()), tipo: "condivisione", dispositivo, autore: autore() }));
      ultimoScritto = testo;
      scritto = true;
    }
    return { arrivati, scritto, altri, avvisi };
  }

  /** Legge i file degli altri e aggiorna il proprio. Chiamate sovrapposte vengono accodate. */
  async function sincronizza() {
    if (inCorso) { ancora = true; return inCorso; }
    inCorso = (async () => {
      let esito;
      do {
        ancora = false;
        try {
          esito = await passaggio();
          Object.assign(stato, { ultimaVolta: adesso().toISOString(), altri: esito.altri, avvisi: esito.avvisi, problema: null, arrivati: esito.arrivati });
        } catch (e) {
          stato.problema = e?.message || String(e);
          esito = { errore: stato.problema };
        }
        ascoltatori.forEach((f) => f(stato, esito));
      } while (ancora);
      return esito;
    })().finally(() => { inCorso = null; });
    return inCorso;
  }

  let timerModifica = null, timerPeriodico = null;
  return {
    stato, mio, sincronizza,
    ascolta(f) { ascoltatori.add(f); return () => ascoltatori.delete(f); },
    /** Dopo una modifica locale: sincronizza fra poco (raggruppa più modifiche ravvicinate). */
    programma(ms = 2000) { clearTimeout(timerModifica); timerModifica = setTimeout(sincronizza, ms); },
    avvia(ogniMs = 30000) { clearInterval(timerPeriodico); timerPeriodico = setInterval(sincronizza, ogniMs); return sincronizza(); },
    ferma() { clearInterval(timerPeriodico); clearTimeout(timerModifica); },
  };
}

/** Cartella vera scelta dall'utente (Chrome/Edge: File System Access API). */
export function cartellaDaHandle(handle) {
  return {
    nome: handle.name,
    async elenca() {
      const out = [];
      for await (const [nome, h] of handle.entries()) {
        if (h.kind === "file" && FILE_DIVISIO.test(nome)) out.push({ nome, leggi: async () => (await h.getFile()).text() });
      }
      return out;
    },
    async scrivi(nome, testo) {
      const fh = await handle.getFileHandle(nome, { create: true });
      const w = await fh.createWritable();
      await w.write(testo);
      await w.close();
    },
  };
}
