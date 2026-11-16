// Unione dei dati scritti da più computer (es. tramite una cartella condivisa di Google Drive).
// Ogni record (movimento, sottoconto, impostazione) porta con sé:
//   modificatoIl: data e ora dell'ultima modifica (ISO)   autore: chi l'ha modificato
//   eliminato: true se è stato cancellato (resta come "segnaposto" perché gli altri lo sappiano)
// Regola: per ogni record vince la modifica più recente. L'unione dà lo stesso risultato
// in qualunque ordine si leggano i file e anche se si legge due volte lo stesso file.

export const CHIAVI = { conti: "codice", movimenti: "id", impostazioni: "chiave", fatture: "id" };

export function piuRecente(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = a.modificatoIl ?? "", tb = b.modificatoIl ?? "";
  if (ta !== tb) return ta > tb ? a : b;
  const sa = JSON.stringify(a), sb = JSON.stringify(b);   // parità: scelta stabile e uguale per tutti
  return sa >= sb ? a : b;
}

export function unisciElenco(chiave, ...elenchi) {
  const m = new Map();
  for (const elenco of elenchi) for (const r of elenco ?? []) m.set(r[chiave], piuRecente(m.get(r[chiave]), r));
  return [...m.values()];
}

/** Unisce più insiemi di dati {conti, movimenti, impostazioni, fatture}. */
export function unisciDati(...insiemi) {
  const out = {};
  for (const [tab, chiave] of Object.entries(CHIAVI)) out[tab] = unisciElenco(chiave, ...insiemi.map((d) => d?.[tab]));
  return out;
}

/** Stessi dati sempre nello stesso ordine (per confrontarli e per scrivere file stabili). */
export function ordinaDati(d) {
  const out = {};
  for (const [tab, chiave] of Object.entries(CHIAVI)) out[tab] = [...(d?.[tab] ?? [])].sort((a, b) => String(a[chiave]).localeCompare(String(b[chiave])));
  return out;
}

/** Come unisciDati(a, b), ma dice anche quanti record di `a` sono cambiati o si sono aggiunti. */
export function unisciContando(a, b) {
  const dati = unisciDati(a, b);
  let cambiati = 0;
  for (const [tab, chiave] of Object.entries(CHIAVI)) {
    const prima = new Map((a?.[tab] ?? []).map((r) => [r[chiave], JSON.stringify(r)]));
    for (const r of dati[tab]) if (prima.get(r[chiave]) !== JSON.stringify(r)) cambiati++;
  }
  return { dati, cambiati };
}

/** Data e ora di modifica sempre successive alla precedente, anche con due modifiche nello stesso millisecondo. */
export function nuovoIstante(precedente, adesso = new Date()) {
  let t = adesso.getTime();
  if (precedente) t = Math.max(t, new Date(precedente).getTime() + 1);
  return new Date(t).toISOString();
}

/** Identificativo unico per un nuovo movimento, anche se creato contemporaneamente su un altro computer. */
export function nuovoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
