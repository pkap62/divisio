// Accesso a IndexedDB (il database interno del browser), senza librerie esterne.

const NOME = "divisio";
const VERSIONE = 2;
// Dati della parrocchia (finiscono nelle copie e nella condivisione).
export const TABELLE = ["conti", "movimenti", "impostazioni"];
// "locale": cose di QUESTO computer (es. la cartella condivisa scelta), mai copiate altrove.

const promessa = (req) => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });
const fine = (tx) => new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error("Operazione annullata")); });

export function apri(nome = NOME) {
  const req = indexedDB.open(nome, VERSIONE);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("conti")) db.createObjectStore("conti", { keyPath: "codice" });
    if (!db.objectStoreNames.contains("movimenti")) db.createObjectStore("movimenti", { keyPath: "id" });
    if (!db.objectStoreNames.contains("impostazioni")) db.createObjectStore("impostazioni", { keyPath: "chiave" });
    if (!db.objectStoreNames.contains("locale")) db.createObjectStore("locale", { keyPath: "chiave" });
  };
  return promessa(req);
}

export const leggiTutto = (db, tabella) => promessa(db.transaction(tabella).objectStore(tabella).getAll());

export async function scrivi(db, tabella, valore) {
  const tx = db.transaction(tabella, "readwrite");
  const chiave = promessa(tx.objectStore(tabella).put(valore));
  await fine(tx);
  return chiave;
}

export async function scriviMolti(db, tabella, valori) {
  const tx = db.transaction(tabella, "readwrite");
  for (const v of valori) tx.objectStore(tabella).put(v);
  await fine(tx);
}

export async function elimina(db, tabella, chiave) {
  const tx = db.transaction(tabella, "readwrite");
  tx.objectStore(tabella).delete(chiave);
  await fine(tx);
}

/**
 * Unisce dei record a quelli già salvati, in un'unica operazione: per ognuno legge quello attuale
 * e lo sostituisce solo se `vince(attuale, nuovo)` sceglie il nuovo. Restituisce i record scritti.
 * Farlo dentro la stessa operazione evita di perdere una modifica fatta nello stesso istante.
 */
export function unisciRecord(db, tabella, records, vince) {
  return new Promise((ok, ko) => {
    const tx = db.transaction(tabella, "readwrite");
    const s = tx.objectStore(tabella);
    const scritti = [];
    for (const r of records) {
      const req = s.get(r[s.keyPath]);
      req.onsuccess = () => {
        const attuale = req.result;
        if (vince(attuale, r) === r && JSON.stringify(attuale) !== JSON.stringify(r)) { s.put(r); scritti.push(r); }
      };
    }
    tx.oncomplete = () => ok(scritti);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error("Operazione annullata"));
  });
}

/** Sostituisce TUTTI i dati in un'unica operazione: o riesce tutto o non cambia niente. */
export async function sostituisciTutto(db, dati) {
  const tx = db.transaction(TABELLE, "readwrite");
  for (const t of TABELLE) {
    const s = tx.objectStore(t);
    s.clear();
    for (const v of dati[t]) s.put(v);
  }
  await fine(tx);
}
