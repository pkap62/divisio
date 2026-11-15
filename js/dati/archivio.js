// L'archivio della parrocchia: tiene i dati in memoria e li salva subito nel browser (IndexedDB).
// Ogni modifica registra quando e da chi è stata fatta, così in futuro i dati di più
// computer si potranno unire (vedi dominio/unione.js).

import * as db from "./db.js";
import { sottocontiIniziali } from "../dominio/piano.js";
import { nuovoId, nuovoIstante, piuRecente, CHIAVI } from "../dominio/unione.js";

// I sottoconti di partenza hanno una data "antica": qualunque modifica dell'utente vince.
const ORIGINE = "2000-01-01T00:00:00.000Z";

export async function apriArchivio({ autore, nomeDb } = {}) {
  const conn = await db.apri(nomeDb);
  const stato = { conti: new Map(), movimenti: new Map(), impostazioni: new Map() };
  const ascoltatori = new Set();
  let chi = autore || "Utente";

  async function ricarica() {
    const [conti, movimenti, impostazioni] = await Promise.all(db.TABELLE.map((t) => db.leggiTutto(conn, t)));
    stato.conti = new Map(conti.map((c) => [c.codice, c]));
    stato.movimenti = new Map(movimenti.map((m) => [m.id, m]));
    stato.impostazioni = new Map(impostazioni.map((i) => [i.chiave, i]));
  }
  const avvisa = () => ascoltatori.forEach((f) => f());

  await ricarica();
  if (stato.conti.size === 0) {
    const iniziali = sottocontiIniziali().map((c) => ({ ...c, modificatoIl: ORIGINE, autore: "Divisio" }));
    await db.scriviMolti(conn, "conti", iniziali);
    await ricarica();
  }

  const marca = (precedente) => ({ modificatoIl: nuovoIstante(precedente?.modificatoIl), autore: chi });

  return {
    impostaAutore(nome) { chi = nome || "Utente"; },
    get autore() { return chi; },
    ascolta(f) { ascoltatori.add(f); return () => ascoltatori.delete(f); },

    /** Map codice → sottoconto (anche quelli non più in uso). */
    get conti() { return stato.conti; },
    contiAttivi() { return [...stato.conti.values()].filter((c) => c.attivo !== false); },
    nomeConto(codice) { return stato.conti.get(codice)?.nome ?? codice; },

    /** Movimenti validi (esclusi quelli eliminati). */
    movimenti() { return [...stato.movimenti.values()].filter((m) => !m.eliminato); },
    movimento(id) { const m = stato.movimenti.get(id); return m && !m.eliminato ? m : undefined; },

    impostazione(chiave, predefinito) { return stato.impostazioni.get(chiave)?.valore ?? predefinito; },

    async salvaMovimento(m) {
      const prec = m.id ? stato.movimenti.get(m.id) : undefined;
      const record = { ...m, id: m.id || nuovoId(), creatoIl: prec?.creatoIl ?? m.creatoIl ?? new Date().toISOString(), ...marca(prec) };
      delete record.eliminato;
      await db.scrivi(conn, "movimenti", record);
      stato.movimenti.set(record.id, record);
      avvisa();
      return record;
    },

    async eliminaMovimento(id) {
      const prec = stato.movimenti.get(id);
      if (!prec) return;
      const record = { ...prec, eliminato: true, ...marca(prec) };
      await db.scrivi(conn, "movimenti", record);
      stato.movimenti.set(id, record);
      avvisa();
    },

    async salvaConto(c) {
      const record = { ...stato.conti.get(c.codice), ...c, ...marca(stato.conti.get(c.codice)) };
      await db.scrivi(conn, "conti", record);
      stato.conti.set(record.codice, record);
      avvisa();
    },

    async salvaImpostazione(chiave, valore) {
      const record = { chiave, valore, ...marca(stato.impostazioni.get(chiave)) };
      await db.scrivi(conn, "impostazioni", record);
      stato.impostazioni.set(chiave, record);
      avvisa();
    },

    /** Tutti i dati, compresi i segnaposto dei movimenti eliminati (servono per unire i computer). */
    esporta() {
      return { conti: [...stato.conti.values()], movimenti: [...stato.movimenti.values()], impostazioni: [...stato.impostazioni.values()] };
    },

    /** Sostituisce tutto (ripristino da copia di sicurezza). */
    async sostituisci(dati) { await db.sostituisciTutto(conn, dati); await ricarica(); avvisa(); },

    /**
     * Aggiunge i dati di un altro computer, tenendo per ogni record la modifica più recente.
     * Restituisce quanti record sono cambiati.
     */
    async unisci(dati) {
      let cambiati = 0;
      for (const [tab, chiave] of Object.entries(CHIAVI)) {
        const scritti = await db.unisciRecord(conn, tab, dati?.[tab] ?? [], piuRecente);
        for (const r of scritti) stato[tab].set(r[chiave], r);
        cambiati += scritti.length;
      }
      if (cambiati) avvisa();
      return cambiati;
    },

    /** Cose che valgono solo per questo computer (es. la cartella condivisa scelta). */
    locale: {
      leggi: async (chiave) => (await db.leggiTutto(conn, "locale")).find((x) => x.chiave === chiave)?.valore,
      scrivi: (chiave, valore) => db.scrivi(conn, "locale", { chiave, valore }),
      elimina: (chiave) => db.elimina(conn, "locale", chiave),
    },
  };
}
