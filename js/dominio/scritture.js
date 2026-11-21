// Scritture in partita doppia.
// Un movimento è { id?, data:"AAAA-MM-GG", descr, tipo, righe:[{conto, dare, avere}] }
// con importi in centesimi. Tipi: "entrata", "uscita", "spostamento", "pd" (partita doppia), "apertura".

import { codiceValido, crescInDare, isCassaBanca } from "./piano.js";
import { formatEuro } from "./importi.js";

export const CONTO_PATRIMONIO = "PAT-01-01";

/**
 * Modalità Entrate/Uscite → righe in partita doppia.
 *  entrata:     Dare cassa      / Avere voce
 *  uscita:      Dare voce       / Avere cassa
 *  spostamento: Dare verso      / Avere da
 */
export function scritturaSemplice({ tipo, importo, voce, cassa, da, verso }) {
  switch (tipo) {
    case "entrata": return [riga(cassa, importo, 0), riga(voce, 0, importo)];
    case "uscita": return [riga(voce, importo, 0), riga(cassa, 0, importo)];
    case "spostamento": return [riga(verso, importo, 0), riga(da, 0, importo)];
    default: throw new Error(`Tipo di movimento sconosciuto: ${tipo}`);
  }
}

const riga = (conto, dare, avere) => ({ conto, dare, avere });

/**
 * Entrata o uscita con più righe (come in UNIO: es. tre funerali in un solo movimento).
 * voci: [{voce, importo, nota?}] — la cassa riceve (o dà) il totale, ogni voce la sua parte.
 * nota è il dettaglio della riga (facoltativo). Con una sola voce e senza nota è uguale a scritturaSemplice.
 */
export function scritturaPiuVoci({ tipo, cassa, voci }) {
  if (tipo !== "entrata" && tipo !== "uscita") throw new Error(`Tipo di movimento non adatto a più voci: ${tipo}`);
  const totale = voci.reduce((s, v) => s + v.importo, 0);
  const righeVoci = voci.map((v) => {
    const r = tipo === "entrata" ? riga(v.voce, 0, v.importo) : riga(v.voce, v.importo, 0);
    const nota = String(v.nota ?? "").trim();
    return nota ? { ...r, nota } : r;
  });
  return tipo === "entrata" ? [riga(cassa, totale, 0), ...righeVoci] : [...righeVoci, riga(cassa, 0, totale)];
}

/**
 * Saldi di apertura → righe. Ogni voce è {conto, importo} con il segno "naturale"
 * (positivo = quanto c'è in cassa, quanto è dovuto, ecc.).
 * La differenza va nel Patrimonio netto, così la scrittura è sempre in quadratura.
 */
export function scritturaApertura(voci) {
  const righe = [];
  for (const { conto, importo } of voci) {
    if (!importo) continue;
    const inDare = crescInDare(conto) === importo > 0;
    righe.push(riga(conto, inDare ? Math.abs(importo) : 0, inDare ? 0 : Math.abs(importo)));
  }
  const { dare, avere } = totaliRighe(righe);
  if (dare !== avere) righe.push(riga(CONTO_PATRIMONIO, dare < avere ? avere - dare : 0, dare > avere ? dare - avere : 0));
  return righe;
}

export function totaliRighe(righe) {
  let dare = 0, avere = 0;
  for (const r of righe) { dare += r.dare; avere += r.avere; }
  return { dare, avere };
}

export const quadra = (righe) => { const t = totaliRighe(righe); return t.dare === t.avere; };

/**
 * Controlla un movimento prima di salvarlo. Restituisce l'elenco degli errori
 * (vuoto = tutto a posto). `conti` (facoltativo) è una Map codice → sottoconto;
 * `anno` (facoltativo) obbliga la data a stare in quell'anno.
 */
export function verificaMovimento(m, { conti, anno } = {}) {
  const errori = [];
  if (!String(m.descr ?? "").trim()) errori.push("Manca la descrizione.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data ?? "")) errori.push("Manca la data.");
  else if (anno && m.data.slice(0, 4) !== String(anno)) errori.push(`La data deve essere nell'anno ${anno}.`);

  const righe = Array.isArray(m.righe) ? m.righe : [];
  if (righe.length < 2) { errori.push("Servono almeno due righe."); return errori; }

  for (const r of righe) {
    if (conti ? !conti.has(r.conto) : !codiceValido(r.conto)) errori.push(`Il conto ${r.conto || "(vuoto)"} non esiste.`);
    if (![r.dare, r.avere].every((x) => Number.isInteger(x) && x >= 0)) errori.push("Una riga ha un importo non valido.");
    else if (r.dare > 0 && r.avere > 0) errori.push("Una riga non può avere sia Dare sia Avere.");
    else if (r.dare === 0 && r.avere === 0) errori.push("Una riga è senza importo.");
  }
  const { dare, avere } = totaliRighe(righe);
  if (dare !== avere) errori.push(`Dare (${formatEuro(dare)}) e Avere (${formatEuro(avere)}) non sono uguali: mancano ${formatEuro(Math.abs(dare - avere))} in ${dare > avere ? "Avere" : "Dare"}.`);
  else if (dare === 0) errori.push("L'importo deve essere maggiore di zero.");

  if (m.tipo === "spostamento" && righe[0].conto === righe[1].conto) errori.push("Scegliere due conti diversi per lo spostamento.");
  if ((m.tipo === "entrata" || m.tipo === "uscita") && righe.filter((r) => isCassaBanca(r.conto)).length !== 1) {
    errori.push("Indicare la cassa o la banca.");
  }
  return errori;
}

/**
 * Descrive un movimento per gli elenchi: tipo, importo, casse e voci coinvolte.
 * segno: +1 soldi entrati, -1 soldi usciti, 0 nessun cambiamento di cassa.
 */
export function analizza(m) {
  const casse = m.righe.filter((r) => isCassaBanca(r.conto));
  const voci = m.righe.filter((r) => !isCassaBanca(r.conto));
  const { dare } = totaliRighe(m.righe);
  if (m.tipo === "apertura") return { tipo: "apertura", importo: dare, segno: 0, casse, voci };
  if (casse.length === 2 && voci.length === 0) {
    return { tipo: "spostamento", importo: casse.find((r) => r.dare)?.dare ?? 0, segno: 0, casse, voci,
      da: casse.find((r) => r.avere)?.conto, verso: casse.find((r) => r.dare)?.conto };
  }
  if (casse.length === 0) return { tipo: "senzaCassa", importo: dare, segno: 0, casse, voci };
  const netto = casse.reduce((s, r) => s + r.dare - r.avere, 0);
  return { tipo: netto >= 0 ? "entrata" : "uscita", importo: Math.abs(netto), segno: Math.sign(netto), casse, voci };
}
