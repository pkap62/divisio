// Mini sistema di test senza dipendenze: funziona nel browser e con il motore
// JavaScript del Mac (jsc).

const casi = [];
export function test(nome, fn) { casi.push({ nome, fn }); }

export function uguale(attuale, atteso, msg = "") {
  const a = JSON.stringify(attuale), b = JSON.stringify(atteso);
  if (a !== b) throw new Error(`${msg}\n    atteso:  ${b}\n    ottenuto: ${a}`);
}
export function vero(cond, msg = "condizione falsa") { if (!cond) throw new Error(msg); }
export function contiene(lista, testo, msg = "") {
  if (!lista.some((x) => String(x).includes(testo))) throw new Error(`${msg} manca «${testo}» in ${JSON.stringify(lista)}`);
}

/** Generatore pseudo-casuale ripetibile (stessi numeri a ogni esecuzione). */
export function casuale(seme = 42) {
  let s = seme >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export async function esegui(stampa) {
  let ok = 0;
  const falliti = [];
  for (const c of casi) {
    try { await c.fn(); ok++; stampa(`✓ ${c.nome}`); }
    catch (e) { falliti.push(c.nome); stampa(`✗ ${c.nome}\n    ${e.message}`); }
  }
  stampa(`\n${ok} superati, ${falliti.length} falliti su ${casi.length}`);
  return falliti.length === 0;
}
