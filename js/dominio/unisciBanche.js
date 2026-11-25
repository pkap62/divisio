// Due nomi per la stessa banca: unire due casse o banche in una sola.
// Succede quando la banca è stata aggiunta in Divisio (che le dà il primo numero libero, es. A02-01-04)
// e in UNIO la stessa banca ha un altro codice (es. A02-01-02): i movimenti caricati da UNIO finiscono su un codice,
// quelli scritti in Divisio o presi dagli estratti conto sull'altro.
// Si tiene il codice di UNIO (così i file per UNIO usano il conto giusto) e il nome scelto dall'utente;
// tutto quello che usava l'altro codice passa a quello tenuto.

import { isCassaBanca } from "./piano.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// parole che non distinguono una banca dall'altra
const GENERICHE = new Set(["banca", "banco", "bank", "di", "del", "della", "dei", "delle", "la", "il", "spa", "s", "p", "a", "societa", "cooperativa", "italia", "italiana", "conto", "corrente", "c", "cc"]);
const parole = (nome) => norm(nome).split(/[^a-z0-9]+/).filter((p) => p && !GENERICHE.has(p));

/** Vero se due nomi indicano la stessa banca (es. «Banca BPM» e «Banco BPM»). */
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
 * Restituisce { conti, movimenti, movimentiDaEliminare, fatture, impostazioni, conta: {movimenti, fatture, impostazioni, eliminati} }
 * pronto per salvaInsieme. I movimenti che diventano uno spostamento dalla banca a sé stessa si eliminano.
 */
export function unisciBanche(dati, da, verso, nome) {
  if (!isCassaBanca(da) || !isCassaBanca(verso) || da === verso) throw new Error("Scelga due casse o banche diverse.");
  const cDa = dati.conti.get(da), cVerso = dati.conti.get(verso);
  if (!cDa || !cVerso) throw new Error("Una delle due banche non esiste.");

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
  const tenuto = { ...cVerso, nome: String(nome || cVerso.nome).trim(), attivo: true, ordine: Math.min(cVerso.ordine ?? Infinity, cDa.ordine ?? Infinity) };
  if (!Number.isFinite(tenuto.ordine)) delete tenuto.ordine;
  delete tenuto.eliminato;
  const conti = [tenuto, { ...cDa, attivo: false, eliminato: true }];
  return { conti, movimenti, movimentiDaEliminare, fatture, impostazioni,
    conta: { movimenti: movimenti.length, eliminati: movimentiDaEliminare.length, fatture: fatture.length, impostazioni: impostazioni.length } };
}

/**
 * Coppie da proporre quando si caricano movimenti da UNIO: una banca del file di UNIO che in Divisio non c'è o non è in uso,
 * e una banca in uso in Divisio con un altro codice, che UNIO non usa. proposta = true se i nomi dicono la stessa banca.
 * nomiUNIO: Map codice → nome nel file di UNIO; contiDivisio: Map codice → conto; codiciUNIO: codici usati nel file.
 */
export function banchePerUNIO(nomiUNIO, contiDivisio, codiciUNIO) {
  const inUNIO = [...codiciUNIO].filter((c) => isCassaBanca(c) && c !== "A02-01-01");
  const divisio = [...contiDivisio.values()].filter((c) => isCassaBanca(c.codice) && c.codice !== "A02-01-01" && c.attivo !== false && !c.eliminato && !codiciUNIO.has(c.codice));
  const coppie = [];
  for (const codice of inUNIO) {
    const qui = contiDivisio.get(codice);
    if (qui && qui.attivo !== false && !qui.eliminato) continue;   // già in uso con lo stesso codice: tutto a posto
    const nomeUNIO = nomiUNIO.get(codice) ?? qui?.nome ?? codice;
    const simili = divisio.filter((c) => stessaBanca(c.nome, nomeUNIO));
    for (const c of simili.length ? simili : divisio) coppie.push({ unio: codice, nomeUNIO, divisio: c.codice, nomeDivisio: c.nome, proposta: simili.length === 1 });
  }
  return coppie;
}
