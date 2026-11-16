// Copia di sicurezza: un file .json con tutti i dati, e la sua rilettura.
// Gli stessi dati (conti, movimenti, impostazioni, fatture) sono quelli che i computer si scambiano.
// Formato 2 (Divisio 0.6): in più le fatture. Le copie di formato 1 si leggono ancora (senza fatture).

import { verificaMovimento } from "./scritture.js";
import { codiceValido } from "./piano.js";

export const FORMATO = 2;

export function creaBackup({ conti, movimenti, impostazioni, fatture = [] }, adesso = new Date()) {
  return { app: "Divisio", formato: FORMATO, salvatoIl: adesso.toISOString(), dati: { conti, movimenti, impostazioni, fatture } };
}

/** Controlla che un insieme di dati sia coerente. Restituisce l'elenco degli errori (al massimo 10). */
export function verificaDati(d) {
  if (!d || !Array.isArray(d.conti) || !Array.isArray(d.movimenti) || !Array.isArray(d.impostazioni)) return ["I dati sono incompleti."];
  const errori = [];
  for (const c of d.conti) if (!codiceValido(c.codice) || !String(c.nome ?? "").trim()) errori.push(`Sottoconto non valido: ${c.codice}`);
  for (const i of d.impostazioni) if (typeof i.chiave !== "string") errori.push("Impostazione non valida.");
  if (d.fatture !== undefined && !Array.isArray(d.fatture)) errori.push("Le fatture sono illeggibili.");
  const idFatture = new Set();
  for (const f of d.fatture ?? []) {
    if (typeof f.id !== "string" || !f.id || idFatture.has(f.id)) errori.push(`Fattura con identificativo non valido: ${f.id}`);
    idFatture.add(f.id);
    if (!f.eliminato && !Array.isArray(f.rate)) errori.push(`Fattura ${f.numero ?? ""} di ${f.fornitore ?? ""}: mancano le scadenze.`);
  }
  const conti = new Map(d.conti.map((c) => [c.codice, c]));
  const ids = new Set();
  for (const m of d.movimenti) {
    if (typeof m.id !== "string" || !m.id || ids.has(m.id)) errori.push(`Movimento con identificativo non valido: ${m.id}`);
    ids.add(m.id);
    if (m.eliminato) continue;
    const e = verificaMovimento(m, { conti });
    if (e.length) errori.push(`Movimento del ${m.data} «${m.descr}»: ${e.join(" ")}`);
  }
  return errori.slice(0, 10);
}

/**
 * Legge il testo di un file di copia. Restituisce {ok:true, dati, salvatoIl}
 * oppure {ok:false, errori:[…]} con spiegazioni comprensibili.
 */
export function leggiBackup(testo) {
  let j;
  try { j = JSON.parse(testo); } catch { return { ok: false, errori: ["Il file non è leggibile."] }; }
  if (!j || j.app !== "Divisio") return { ok: false, errori: ["Questo file non è una copia di Divisio."] };
  if (!(j.formato >= 1 && j.formato <= FORMATO)) return { ok: false, errori: ["La copia è stata fatta con una versione più nuova di Divisio: aggiorni l'app."] };
  const errori = verificaDati(j.dati);
  if (errori.length) return { ok: false, errori };
  return { ok: true, dati: { ...j.dati, fatture: j.dati.fatture ?? [] }, salvatoIl: j.salvatoIl };
}
