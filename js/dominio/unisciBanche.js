// Numeri delle banche: Divisio dà a ogni banca aggiunta il primo numero libero (A02-01-02, 03…), ma è un numero provvisorio.
// Quello che conta è il numero che la stessa banca ha in UNIO: quando arrivano i movimenti di UNIO, Divisio si adegua da solo.
// - la banca ha in UNIO un altro numero → si uniscono sul numero di UNIO (unisciBanche);
// - il numero di UNIO in Divisio è di un'altra banca (es. PayPal) → quella passa a un numero libero (spostaBanca), poi si carica.
// Si tiene sempre il codice di UNIO (così i file per UNIO usano il conto giusto) e il nome scelto in Divisio.

import { isCassaBanca, nuovoCodiceSottoconto } from "./piano.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// parole che non distinguono una banca dall'altra
const GENERICHE = new Set(["banca", "banco", "bank", "di", "del", "della", "dei", "delle", "la", "il", "spa", "s", "p", "a", "societa", "cooperativa", "italia", "italiana", "conto", "corrente", "c", "cc"]);
const parole = (nome) => norm(nome).split(/[^a-z0-9]+/).filter((p) => p && !GENERICHE.has(p));
// nome che dice davvero quale banca è (non solo «Banca» o «Conto corrente»)
const distintivo = (nome) => parole(nome).length > 0;

/** Vero se due nomi indicano la stessa banca (es. «Banco BPM» e «Banco BPM S.p.A.»). */
export function stessaBanca(a, b) {
  const x = parole(a), y = parole(b);
  if (!x.length || !y.length) return norm(a).trim() === norm(b).trim();
  return x.join(" ") === y.join(" ");
}

/** Righe di un movimento con il codice cambiato; più righe della banca tenuta si sommano in una (es. saldi di apertura, spostamenti tra le due). */
function righeUnite(righe, da, verso) {
  const nuove = righe.map((r) => (r.conto === da ? { ...r, conto: verso } : r));
  const sue = nuove.filter((r) => r.conto === verso);
  if (sue.length < 2) return nuove;
  const netto = sue.reduce((s, r) => s + r.dare - r.avere, 0);
  const primo = nuove.indexOf(sue[0]);
  const altre = nuove.filter((r) => r.conto !== verso);
  if (netto === 0) return altre;
  const nota = sue.find((r) => r.nota)?.nota;
  altre.splice(Math.min(primo, altre.length), 0, { conto: verso, dare: Math.max(netto, 0), avere: Math.max(-netto, 0), ...(nota ? { nota } : {}) });
  return altre;
}

/** Sostituisce il codice da → verso dentro un valore qualunque (impostazioni ricordate). */
function sostituisci(v, da, verso) {
  if (v === da) return verso;
  if (Array.isArray(v)) return v.map((x) => sostituisci(x, da, verso));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sostituisci(x, da, verso)]));
  return v;
}

/**
 * Prepara l'unione: la banca «da» diventa la banca «verso».
 * dati = { conti: Map codice → conto, movimenti, fatture, impostazioni: [{chiave, valore}] }; nome = nome da dare alla banca tenuta.
 * Se «verso» non c'è ancora, la banca cambia solo numero (vedi spostaBanca).
 * Restituisce { conti, movimenti, movimentiDaEliminare, fatture, impostazioni, conta: {movimenti, fatture, impostazioni, eliminati} }
 * pronto per salvaInsieme. I movimenti che diventano uno spostamento dalla banca a sé stessa si eliminano.
 */
export function unisciBanche(dati, da, verso, nome) {
  if (!isCassaBanca(da) || !isCassaBanca(verso) || da === verso) throw new Error("Scelga due casse o banche diverse.");
  const cDa = dati.conti.get(da), cVerso = dati.conti.get(verso);
  if (!cDa) throw new Error("Una delle due banche non esiste.");

  const movimenti = [], movimentiDaEliminare = [];
  for (const m of dati.movimenti) {
    if (m.eliminato || !m.righe.some((r) => r.conto === da)) continue;
    const righe = righeUnite(m.righe, da, verso);
    const nuovo = { ...m, righe, ...(m.banca?.cassa === da ? { banca: { ...m.banca, cassa: verso } } : {}) };
    if (righe.length < 2 || righe.every((r) => r.conto === verso)) movimentiDaEliminare.push(m.id);
    else movimenti.push(nuovo);
  }
  const fatture = [];
  for (const f of dati.fatture) {
    if (f.eliminato || !f.rate.some((r) => r.cassa === da)) continue;
    fatture.push({ ...f, rate: f.rate.map((r) => (r.cassa === da ? { ...r, cassa: verso } : r)) });
  }
  // solo le memorie degli estratti conto (scelte e formati dei file); i dati di UNIO e gli invii a UNIO restano com'erano
  const impostazioni = [];
  for (const i of dati.impostazioni) {
    if (!/^(banca:|formato-banca:)/.test(i.chiave) || i.valore == null) continue;
    const valore = sostituisci(i.valore, da, verso);
    if (JSON.stringify(valore) !== JSON.stringify(i.valore)) impostazioni.push({ chiave: i.chiave, valore });
  }
  const base = cVerso && !cVerso.eliminato ? cVerso : { ...cDa, codice: verso };
  const tenuto = { ...base, nome: String(nome || base.nome).trim(), attivo: true, ordine: Math.min(base.ordine ?? Infinity, cDa.ordine ?? Infinity) };
  if (!Number.isFinite(tenuto.ordine)) delete tenuto.ordine;
  delete tenuto.eliminato;
  const conti = [tenuto, { ...cDa, attivo: false, eliminato: true }];
  return { conti, movimenti, movimentiDaEliminare, fatture, impostazioni,
    conta: { movimenti: movimenti.length, eliminati: movimentiDaEliminare.length, fatture: fatture.length, impostazioni: impostazioni.length } };
}

/** La banca cambia numero (con tutti i suoi movimenti, fatture pagate e scelte ricordate): passa al codice libero «verso». */
export const spostaBanca = (dati, da, verso) => unisciBanche(dati, da, verso, dati.conti.get(da)?.nome);

/**
 * Cosa sistemare quando si caricano movimenti da UNIO, banca per banca.
 * nomiUNIO: Map codice → nome nel file di UNIO; contiDivisio: Map codice → conto; codiciUNIO: codici usati nel file.
 * Restituisce un elenco di:
 * - { tipo: "sposta", unio, nomeUNIO, divisio, nomeDivisio, verso, proposta: true }: in Divisio il numero di UNIO è di un'altra banca,
 *   che passa al numero libero «verso» prima di caricare;
 * - { tipo: "unisci", unio, nomeUNIO, divisio, nomeDivisio, proposta }: la stessa banca ha in Divisio un altro numero;
 *   dopo il caricamento si unisce sul numero di UNIO. proposta = true se i nomi dicono la stessa banca
 *   (altrimenti si mostrano le possibilità, senza spunta).
 */
export function banchePerUNIO(nomiUNIO, contiDivisio, codiciUNIO) {
  const vivo = (c) => c && !c.eliminato;
  const inUNIO = [...codiciUNIO].filter((c) => isCassaBanca(c) && c !== "A02-01-01").sort();
  const divisio = [...contiDivisio.values()].filter((c) => isCassaBanca(c.codice) && c.codice !== "A02-01-01" && c.attivo !== false && vivo(c) && !codiciUNIO.has(c.codice));
  const occupati = new Set([...contiDivisio.keys(), ...codiciUNIO]);
  const coppie = [];
  for (const codice of inUNIO) {
    const qui = vivo(contiDivisio.get(codice)) ? contiDivisio.get(codice) : null;
    const nomeUNIO = nomiUNIO.get(codice) ?? qui?.nome ?? codice;
    // lo stesso numero, ma in Divisio è un'altra banca in uso (i due nomi dicono banche diverse)
    const altraBanca = qui && qui.attivo !== false && distintivo(qui.nome) && distintivo(nomeUNIO) && !stessaBanca(qui.nome, nomeUNIO);
    if (altraBanca) {
      const verso = nuovoCodiceSottoconto("A02-01", occupati);
      if (!verso) continue;
      occupati.add(verso);
      coppie.push({ tipo: "sposta", unio: codice, nomeUNIO, divisio: codice, nomeDivisio: qui.nome, verso, proposta: true });
    } else if (qui && qui.attivo !== false) continue;   // già in uso con lo stesso numero: tutto a posto
    const simili = divisio.filter((c) => stessaBanca(c.nome, nomeUNIO));
    const scelte = simili.length || altraBanca ? simili : divisio;
    for (const c of scelte) coppie.push({ tipo: "unisci", unio: codice, nomeUNIO, divisio: c.codice, nomeDivisio: c.nome, proposta: simili.length === 1 });
  }
  return coppie;
}

/**
 * Stessa banca con due numeri, già in Divisio (successo con le versioni fino alla 0.13): uno ha i movimenti caricati da UNIO,
 * l'altro è stato aggiunto in Divisio e non ne ha. Restituisce le coppie { da, verso, nome } da unire sul numero di UNIO.
 * Solo quando non ci sono dubbi: nomi della stessa banca e una sola coppia possibile per ciascuna.
 */
export function banchePerUnire(contiDivisio, movimenti) {
  const uso = new Map();
  for (const m of movimenti) {
    if (m.eliminato) continue;
    for (const c of new Set(m.righe.map((r) => r.conto).filter(isCassaBanca))) {
      const u = uso.get(c) ?? { n: 0, unio: 0 };
      u.n++; if (m.origine === "UNIO") u.unio++;
      uso.set(c, u);
    }
  }
  const banche = [...contiDivisio.values()].filter((c) => isCassaBanca(c.codice) && c.codice !== "A02-01-01" && !c.eliminato && distintivo(c.nome));
  const daUNIO = banche.filter((c) => uso.get(c.codice)?.unio);
  const soloDivisio = banche.filter((c) => c.attivo !== false && !uso.get(c.codice)?.unio);
  const coppie = [];
  for (const v of daUNIO) {
    const simili = soloDivisio.filter((d) => stessaBanca(d.nome, v.nome));
    if (simili.length !== 1 || daUNIO.filter((x) => stessaBanca(x.nome, simili[0].nome)).length !== 1) continue;
    coppie.push({ da: simili[0].codice, verso: v.codice, nome: simili[0].nome });
  }
  return coppie;
}

/** Banche non in uso che nessun movimento né fattura usa: si possono togliere del tutto, così il loro numero torna libero. */
export function bancheInutili(contiDivisio, movimenti, fatture) {
  const usati = new Set();
  for (const m of movimenti) if (!m.eliminato) for (const r of m.righe) usati.add(r.conto);
  for (const f of fatture) if (!f.eliminato) for (const r of f.rate ?? []) if (r.cassa) usati.add(r.cassa);
  return [...contiDivisio.values()].filter((c) => isCassaBanca(c.codice) && c.codice !== "A02-01-01" && c.attivo === false && !c.eliminato && !usati.has(c.codice));
}
