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
  const stato = { conti: new Map(), movimenti: new Map(), impostazioni: new Map(), fatture: new Map() };
  const ascoltatori = new Set();
  let chi = autore || "Utente";

  async function ricarica() {
    const [conti, movimenti, impostazioni, fatture] = await Promise.all(db.TABELLE.map((t) => db.leggiTutto(conn, t)));
    stato.conti = new Map(conti.map((c) => [c.codice, c]));
    stato.movimenti = new Map(movimenti.map((m) => [m.id, m]));
    stato.impostazioni = new Map(impostazioni.map((i) => [i.chiave, i]));
    stato.fatture = new Map(fatture.map((f) => [f.id, f]));
  }
  const avvisa = () => ascoltatori.forEach((f) => f());

  await ricarica();
  if (stato.conti.size === 0) {
    // Sottoconti che ogni parrocchia sceglie se usare: all'inizio non sono in uso.
    // PayPal (Impostazioni → Cassa e banche) e Gestione teatro (Piano dei conti → "in uso").
    const DA_SCEGLIERE = ["A02-01-03", "P02-05-04"];
    const iniziali = sottocontiIniziali().map((c) => ({ ...c, ...(DA_SCEGLIERE.includes(c.codice) ? { attivo: false } : {}), modificatoIl: ORIGINE, autore: "Divisio" }));
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

    /** Fatture dello scadenzario (escluse quelle tolte). */
    fatture() { return [...stato.fatture.values()].filter((f) => !f.eliminato); },
    fattura(id) { const f = stato.fatture.get(id); return f && !f.eliminato ? f : undefined; },
    /** Impostazioni la cui chiave inizia con un prefisso (es. "fornitore:"). */
    impostazioniCon(prefisso) { return [...stato.impostazioni.values()].filter((i) => i.chiave.startsWith(prefisso) && i.valore != null); },

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

    /**
     * Salva insieme, in un'unica operazione, fatture, movimenti e impostazioni (es. "fattura pagata" + la sua uscita):
     * o si salva tutto o niente, così fattura e contabilità non restano mai a metà.
     * { fatture:[…], movimenti:[…], movimentiDaEliminare:[id], impostazioni:[{chiave, valore}] }
     */
    async salvaInsieme({ fatture = [], movimenti = [], movimentiDaEliminare = [], impostazioni = [] }) {
      let t = null;
      const marcaInOrdine = (prec) => {
        t = nuovoIstante([t, prec?.modificatoIl].filter(Boolean).sort().at(-1));
        return { modificatoIl: t, autore: chi };
      };
      const scr = { fatture: [], movimenti: [], impostazioni: [] };
      for (const m of movimenti) {
        const prec = m.id ? stato.movimenti.get(m.id) : undefined;
        const r = { ...m, id: m.id || nuovoId(), creatoIl: prec?.creatoIl ?? new Date().toISOString(), ...marcaInOrdine(prec) };
        delete r.eliminato;
        scr.movimenti.push(r);
      }
      for (const id of movimentiDaEliminare) {
        const prec = stato.movimenti.get(id);
        if (prec && !prec.eliminato) scr.movimenti.push({ ...prec, eliminato: true, ...marcaInOrdine(prec) });
      }
      for (const f of fatture) {
        const prec = f.id ? stato.fatture.get(f.id) : undefined;
        scr.fatture.push({ ...f, id: f.id || nuovoId(), creatoIl: prec?.creatoIl ?? f.creatoIl ?? new Date().toISOString(), ...marcaInOrdine(prec) });
      }
      for (const { chiave, valore } of impostazioni) scr.impostazioni.push({ chiave, valore, ...marcaInOrdine(stato.impostazioni.get(chiave)) });
      await db.scriviInsieme(conn, scr);
      for (const r of scr.movimenti) stato.movimenti.set(r.id, r);
      for (const r of scr.fatture) stato.fatture.set(r.id, r);
      for (const r of scr.impostazioni) stato.impostazioni.set(r.chiave, r);
      avvisa();
      return scr;
    },

    /** Tutti i dati, compresi i segnaposto dei movimenti eliminati (servono per unire i computer). */
    esporta() {
      return { conti: [...stato.conti.values()], movimenti: [...stato.movimenti.values()], impostazioni: [...stato.impostazioni.values()], fatture: [...stato.fatture.values()] };
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
