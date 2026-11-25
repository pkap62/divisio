// L'archivio della parrocchia: tiene i dati in memoria e li salva subito nel browser (IndexedDB).
// Ogni modifica registra quando e da chi è stata fatta, così in futuro i dati di più
// computer si potranno unire (vedi dominio/unione.js).

import * as db from "./db.js";
import { sottocontiIniziali, cassePredefiniteDaTogliere, contiVisibili } from "../dominio/piano.js";
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
    visibili = null;
  }
  // Sottoconti da mostrare (senza quelli tolti): ricalcolati solo quando cambia qualcosa.
  let visibili = null;
  const conti = () => (visibili ??= contiVisibili(stato.conti, stato.movimenti.values()));
  const avvisa = () => { visibili = null; ascoltatori.forEach((f) => f()); };

  await ricarica();
  if (stato.conti.size === 0) {
    // Sottoconti che ogni parrocchia sceglie se usare: all'inizio non sono in uso.
    // Gestione teatro (Piano dei conti → "in uso"). Le banche (anche PayPal) si aggiungono da Impostazioni → Cassa e banche.
    const DA_SCEGLIERE = ["P02-05-04"];
    const iniziali = sottocontiIniziali().map((c) => ({ ...c, ...(DA_SCEGLIERE.includes(c.codice) ? { attivo: false } : {}), modificatoIl: ORIGINE, autore: "Divisio" }));
    await db.scriviMolti(conn, "conti", iniziali);
    await ricarica();
  }
  // Fino alla 0.6.1 c'erano già "Banca" (A02-01-02) e "PayPal" (A02-01-03): se nessuno li ha mai toccati
  // né usati, si tolgono, così resta solo la cassa e le banche prendono i numeri man mano che si aggiungono.
  // Restano come segnaposto "eliminato", perché anche gli altri computer della parrocchia li tolgano.
  const daTogliere = cassePredefiniteDaTogliere(stato.conti, stato.movimenti.values(), ORIGINE);
  if (daTogliere.length) {
    await db.scriviMolti(conn, "conti", daTogliere.map((c) => ({ ...c, eliminato: true, attivo: false, modificatoIl: nuovoIstante(c.modificatoIl), autore: "Divisio" })));
    await ricarica();
  }

  const marca = (precedente) => ({ modificatoIl: nuovoIstante(precedente?.modificatoIl), autore: chi });

  /* ---------- annullare l'ultima operazione ----------
   * Ogni operazione dell'utente ricorda com'erano i record prima: {etichetta, quando, cambi:[{tab, chiave, prima, dopo}]}.
   * Annullare rimette i record com'erano, con una data di modifica nuova (così l'annullamento arriva anche agli altri
   * computer della parrocchia). Vale finché Divisio resta aperto; l'elenco si svuota ricaricando la pagina. */
  const MAX_ANNULLA = 30;
  const annullabili = [];
  let gruppo = null;   // operazione in corso fatta di più scritture (vedi insieme)
  const chiaveDi = (tab, r) => r[CHIAVI[tab]];
  function ricordaCambi(etichetta, tab, scritti, prima) {
    const cambi = scritti.map((r) => ({ tab, chiave: chiaveDi(tab, r), prima: prima.get(chiaveDi(tab, r)), dopo: r }));
    if (!cambi.length) return;
    if (gruppo) { gruppo.cambi.push(...cambi); return; }
    annullabili.push({ etichetta, quando: new Date().toISOString(), cambi });
    if (annullabili.length > MAX_ANNULLA) annullabili.shift();
  }
  /** Copia dei record attuali (prima della modifica) per le chiavi indicate. */
  const fotografia = (tab, chiavi) => new Map(chiavi.map((k) => [k, stato[tab].get(k)]));
  const nome = (m) => `«${String(m?.descr ?? "").slice(0, 60)}»`;

  return {
    impostaAutore(nome) { chi = nome || "Utente"; },
    get autore() { return chi; },
    ascolta(f) { ascoltatori.add(f); return () => ascoltatori.delete(f); },

    /** Map codice → sottoconto (anche quelli non più in uso; non quelli tolti). */
    get conti() { return conti(); },
    contiAttivi() { return [...conti().values()].filter((c) => c.attivo !== false); },
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
      ricordaCambi(prec && !prec.eliminato ? `Modifica del movimento ${nome(record)}` : `Registrazione del movimento ${nome(record)}`, "movimenti", [record], new Map([[record.id, prec]]));
      stato.movimenti.set(record.id, record);
      avvisa();
      return record;
    },

    async eliminaMovimento(id) {
      const prec = stato.movimenti.get(id);
      if (!prec) return;
      const record = { ...prec, eliminato: true, ...marca(prec) };
      await db.scrivi(conn, "movimenti", record);
      ricordaCambi(`Eliminazione del movimento ${nome(prec)}`, "movimenti", [record], new Map([[id, prec]]));
      stato.movimenti.set(id, record);
      avvisa();
    },

    async salvaConto(c) {
      const record = { ...stato.conti.get(c.codice), ...c, ...marca(stato.conti.get(c.codice)) };
      delete record.eliminato;   // un numero tolto può tornare a servire per una banca nuova
      await db.scrivi(conn, "conti", record);
      ricordaCambi(`Modifica del sottoconto «${record.nome}»`, "conti", [record], fotografia("conti", [record.codice]));
      stato.conti.set(record.codice, record);
      avvisa();
    },

    /** Toglie del tutto un sottoconto non usato. Resta un segnaposto "eliminato", perché lo tolgano anche gli altri computer della parrocchia. */
    async eliminaConto(codice) {
      const prec = stato.conti.get(codice);
      if (!prec || prec.eliminato) return;
      const record = { ...prec, eliminato: true, attivo: false, ...marca(prec) };
      await db.scrivi(conn, "conti", record);
      ricordaCambi(`Eliminazione del sottoconto «${prec.nome}»`, "conti", [record], new Map([[codice, prec]]));
      stato.conti.set(codice, record);
      avvisa();
    },

    async salvaImpostazione(chiave, valore, { etichetta = "Modifica delle impostazioni" } = {}) {
      const record = { chiave, valore, ...marca(stato.impostazioni.get(chiave)) };
      await db.scrivi(conn, "impostazioni", record);
      ricordaCambi(etichetta, "impostazioni", [record], fotografia("impostazioni", [chiave]));
      stato.impostazioni.set(chiave, record);
      avvisa();
    },

    /**
     * Salva insieme, in un'unica operazione, fatture, movimenti e impostazioni (es. "fattura pagata" + la sua uscita):
     * o si salva tutto o niente, così fattura e contabilità non restano mai a metà.
     * { fatture:[…], movimenti:[…], movimentiDaEliminare:[id], impostazioni:[{chiave, valore}] }
     */
    async salvaInsieme({ fatture = [], movimenti = [], movimentiDaEliminare = [], impostazioni = [], conti = [], etichetta = "" }) {
      let t = null;
      const marcaInOrdine = (prec) => {
        t = nuovoIstante([t, prec?.modificatoIl].filter(Boolean).sort().at(-1));
        return { modificatoIl: t, autore: chi };
      };
      const scr = { fatture: [], movimenti: [], impostazioni: [], conti: [] };
      for (const c of conti) scr.conti.push({ ...c, ...marcaInOrdine(stato.conti.get(c.codice)) });
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
      if (!gruppo) gruppo = { etichetta: etichetta || descriviInsieme(scr, stato), cambi: [], proprio: true };
      for (const tab of ["conti", "fatture", "movimenti", "impostazioni"]) ricordaCambi("", tab, scr[tab], fotografia(tab, scr[tab].map((r) => chiaveDi(tab, r))));
      if (gruppo.proprio) { delete gruppo.proprio; const g = gruppo; gruppo = null; if (g.cambi.length) { annullabili.push({ ...g, quando: new Date().toISOString() }); if (annullabili.length > MAX_ANNULLA) annullabili.shift(); } }
      for (const r of scr.movimenti) stato.movimenti.set(r.id, r);
      for (const r of scr.fatture) stato.fatture.set(r.id, r);
      for (const r of scr.impostazioni) stato.impostazioni.set(r.chiave, r);
      for (const r of scr.conti) stato.conti.set(r.codice, r);
      avvisa();
      return scr;
    },

    /** Tutti i dati, compresi i segnaposto dei movimenti eliminati (servono per unire i computer). */
    esporta() {
      return { conti: [...stato.conti.values()], movimenti: [...stato.movimenti.values()], impostazioni: [...stato.impostazioni.values()], fatture: [...stato.fatture.values()] };
    },

    /** Sostituisce tutto (ripristino da copia di sicurezza). */
    async sostituisci(dati) { await db.sostituisciTutto(conn, dati); annullabili.length = 0; await ricarica(); avvisa(); },

    /**
     * Aggiunge i dati di un altro computer, tenendo per ogni record la modifica più recente.
     * Restituisce quanti record sono cambiati.
     * opz.etichetta: se c'è, è un'operazione dell'utente (es. caricamento da UNIO) e si può annullare;
     * senza, sono dati arrivati dagli altri computer.
     */
    async unisci(dati, { etichetta = "" } = {}) {
      let cambiati = 0;
      const prima = etichetta && !gruppo ? (gruppo = { etichetta, cambi: [], proprio: true }) : null;
      for (const [tab, chiave] of Object.entries(CHIAVI)) {
        const foto = etichetta ? fotografia(tab, (dati?.[tab] ?? []).map((r) => r[chiave])) : null;
        const scritti = await db.unisciRecord(conn, tab, dati?.[tab] ?? [], piuRecente);
        if (foto) ricordaCambi("", tab, scritti, foto);
        for (const r of scritti) stato[tab].set(r[chiave], r);
        cambiati += scritti.length;
      }
      if (prima) { gruppo = null; if (prima.cambi.length) { delete prima.proprio; annullabili.push({ ...prima, quando: new Date().toISOString() }); if (annullabili.length > MAX_ANNULLA) annullabili.shift(); } }
      if (cambiati) avvisa();
      return cambiati;
    },

    /**
     * Esegue fn come una sola operazione da annullare tutta insieme (es. "saldi di apertura": elimina il vecchio e salva il nuovo).
     */
    async insieme(etichetta, fn) {
      if (gruppo) return fn();
      const g = (gruppo = { etichetta, cambi: [] });
      try { return await fn(); }
      finally {
        gruppo = null;
        if (g.cambi.length) { annullabili.push({ ...g, quando: new Date().toISOString() }); if (annullabili.length > MAX_ANNULLA) annullabili.shift(); avvisa(); }
      }
    },

    /** L'ultima operazione che si può annullare: {etichetta, quando} oppure null. */
    get ultimaAnnullabile() { const u = annullabili.at(-1); return u ? { etichetta: u.etichetta, quando: u.quando } : null; },

    /**
     * Annulla l'ultima operazione: rimette i record com'erano prima.
     * Se nel frattempo uno di quei record è stato cambiato di nuovo (anche da un altro computer), non annulla nulla
     * e restituisce {ok:false, motivo}, per non cancellare il lavoro fatto dopo.
     */
    async annullaUltima() {
      const u = annullabili.at(-1);
      if (!u) return { ok: false, motivo: "Non c'è nessuna operazione da annullare." };
      // ogni record deve essere ancora come l'ha lasciato l'ultima scrittura di questa operazione
      const ultimo = new Map(u.cambi.map((c) => [`${c.tab}|${c.chiave}`, c]));
      const cambiatoDopo = [...ultimo.values()].some((c) => stato[c.tab].get(c.chiave)?.modificatoIl !== c.dopo.modificatoIl);
      if (cambiatoDopo) {
        annullabili.pop();
        avvisa();
        return { ok: false, motivo: `Non si può annullare «${u.etichetta}»: nel frattempo quei dati sono stati cambiati di nuovo (forse da un altro computer della parrocchia).` };
      }
      // per ogni record conta com'era prima della PRIMA scrittura di questa operazione
      const primo = new Map();
      for (const c of u.cambi) { const k = `${c.tab}|${c.chiave}`; if (!primo.has(k)) primo.set(k, c); }
      let t = null;
      const marcaInOrdine = (attuale) => { t = nuovoIstante([t, attuale?.modificatoIl].filter(Boolean).sort().at(-1)); return { modificatoIl: t, autore: chi }; };
      const scr = { conti: [], movimenti: [], impostazioni: [], fatture: [] };
      for (const c of primo.values()) {
        const attuale = stato[c.tab].get(c.chiave);
        let r;
        if (c.prima) { r = { ...c.prima, ...marcaInOrdine(attuale) }; if (!c.prima.eliminato) delete r.eliminato; }
        else if (c.tab === "impostazioni") r = { chiave: c.chiave, valore: null, ...marcaInOrdine(attuale) };
        else r = { ...attuale, eliminato: true, ...(c.tab === "conti" ? { attivo: false } : {}), ...marcaInOrdine(attuale) };
        scr[c.tab].push(r);
      }
      await db.scriviInsieme(conn, scr);
      for (const [tab, righe] of Object.entries(scr)) for (const r of righe) stato[tab].set(chiaveDi(tab, r), r);
      annullabili.pop();
      avvisa();
      return { ok: true, etichetta: u.etichetta };
    },

    /** Cose che valgono solo per questo computer (es. la cartella condivisa scelta). */
    locale: {
      leggi: async (chiave) => (await db.leggiTutto(conn, "locale")).find((x) => x.chiave === chiave)?.valore,
      scrivi: (chiave, valore) => db.scrivi(conn, "locale", { chiave, valore }),
      elimina: (chiave) => db.elimina(conn, "locale", chiave),
    },
  };
}

/** Nome breve di un'operazione fatta con salvaInsieme, quando chi la chiama non lo indica. */
function descriviInsieme(scr, stato) {
  const nuovi = scr.movimenti.filter((r) => !r.eliminato), tolti = scr.movimenti.filter((r) => r.eliminato);
  const f = scr.fatture;
  const n = (k, uno, molti) => (k === 1 ? `1 ${uno}` : `${k} ${molti}`);
  if (f.length && nuovi.length && f.length === 1) return `Fattura ${f[0].fornitore || ""} segnata pagata`.replace(/\s+/g, " ");
  if (f.length && !scr.movimenti.length) {
    if (f.every((x) => x.eliminato)) return f.length === 1 ? `Fattura ${f[0].fornitore || ""} tolta dallo scadenzario` : `${f.length} fatture tolte dallo scadenzario`;
    return f.every((x) => !stato.fatture.has(x.id)) ? `Aggiunta di ${n(f.length, "fattura", "fatture")} allo scadenzario` : `Modifica di ${n(f.length, "fattura", "fatture")}`;
  }
  if (tolti.length && !nuovi.length) return tolti.length === 1 ? `Eliminazione del movimento «${tolti[0].descr}»` : `Eliminazione di ${tolti.length} movimenti`;
  if (nuovi.length) return nuovi.length === 1 ? `Registrazione del movimento «${nuovi[0].descr}»` : `Registrazione di ${nuovi.length} movimenti`;
  return "Modifica dei dati";
}
