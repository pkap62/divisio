// Ponte verso UNIO: i movimenti di una cassa/banca in un trimestre diventano poche righe
// riepilogative (una per sottoconto e direzione) da caricare con "Importazione Prima Nota".
// In UNIO, per ogni riga, si sceglie il sottoconto indicato tra parentesi quadre.
//
// Regole:
//  - un movimento che tocca più casse/banche (es. contanti versati in banca) va in UN SOLO file:
//    quello del conto che riceve i soldi; negli altri compare solo come nota;
//  - i movimenti senza cassa né banca (es. ammortamenti) vanno inseriti a mano in UNIO;
//  - dopo "Ho importato in UNIO", Divisio salva una FOTOGRAFIA del riepilogo (cioè quello che UNIO
//    ora contiene per quella cassa e quel trimestre); le volte successive prepara solo le DIFFERENZE
//    rispetto all'ultima fotografia (movimenti aggiunti, corretti o eliminati): nulla viene contato due volte.

import { isCassaBanca } from "./piano.js";
import { formatDecimale } from "./importi.js";

export const TRIMESTRI = {
  T1: ["01-01", "03-31", "1° trimestre", "1° trim."],
  T2: ["04-01", "06-30", "2° trimestre", "2° trim."],
  T3: ["07-01", "09-30", "3° trimestre", "3° trim."],
  T4: ["10-01", "12-31", "4° trimestre", "4° trim."],
};

export function periodo(anno, trimestre) {
  const [da, a, nome, breve] = TRIMESTRI[trimestre];
  return { anno, trimestre, da: `${anno}-${da}`, a: `${anno}-${a}`, nome: `${nome} ${anno}`, breve: `${breve} ${anno}` };
}

/** A quale cassa/banca "appartiene" un movimento nel ponte UNIO (null se non tocca casse). */
export function cassaDelMovimento(m) {
  const casse = [...new Set(m.righe.filter((r) => isCassaBanca(r.conto)).map((r) => r.conto))].sort();
  if (!casse.length) return null;
  const netto = (c) => m.righe.filter((r) => r.conto === c).reduce((s, r) => s + r.dare - r.avere, 0);
  return casse.find((c) => netto(c) > 0) ?? casse[0];
}

const inPeriodo = (m, p) => !m.eliminato && m.tipo !== "apertura" && m.data >= p.da && m.data <= p.a;

/**
 * Riepilogo dei movimenti di una cassa in un periodo.
 * righe: [{codice, dir:"E"|"U", importo, n, data}] — E = soldi entrati nella cassa, U = usciti.
 */
export function riepilogoCassa(movimenti, cassa, p) {
  const gruppi = new Map(), altrove = [];
  for (const m of movimenti) {
    if (!inPeriodo(m, p) || !m.righe.some((r) => r.conto === cassa)) continue;
    if (cassaDelMovimento(m) !== cassa) { altrove.push(m); continue; }
    for (const r of m.righe) {
      if (r.conto === cassa) continue;
      for (const [dir, importo] of [["E", r.avere], ["U", r.dare]]) {
        if (!importo) continue;
        const k = `${r.conto}|${dir}`;
        const g = gruppi.get(k) ?? { codice: r.conto, dir, importo: 0, n: 0, data: "" };
        g.importo += importo;
        g.n++;
        if (m.data > g.data) g.data = m.data;
        gruppi.set(k, g);
      }
    }
  }
  const righe = [...gruppi.values()].sort((x, y) => x.codice.localeCompare(y.codice) || x.dir.localeCompare(y.dir));
  return { righe, altrove };
}

/** Movimenti del periodo senza cassa né banca: in UNIO vanno inseriti a mano. */
export const senzaCassa = (movimenti, p) => movimenti.filter((m) => inPeriodo(m, p) && cassaDelMovimento(m) === null);

/**
 * Righe ancora da importare: riepilogo attuale meno l'ultima fotografia (quello che UNIO contiene già).
 * Una diminuzione diventa una riga di correzione nella direzione opposta sullo stesso sottoconto.
 * dataRettifica: data da usare quando un sottoconto non ha più movimenti nel periodo.
 */
export function daInviare(righeAttuali, fotografia = [], dataRettifica) {
  const gia = new Map(fotografia.map((r) => [`${r.codice}|${r.dir}`, r.importo]));
  const attuali = new Map(righeAttuali.map((r) => [`${r.codice}|${r.dir}`, r]));
  const out = [];
  for (const k of new Set([...attuali.keys(), ...gia.keys()])) {
    const a = attuali.get(k), [codice, dir] = k.split("|");
    const delta = (a?.importo ?? 0) - (gia.get(k) ?? 0);
    if (delta > 0) out.push({ codice, dir, importo: delta, n: a.n, data: a.data, rettifica: gia.has(k) });
    if (delta < 0) out.push({ codice, dir: dir === "E" ? "U" : "E", importo: -delta, n: 0, data: a?.data ?? dataRettifica, rettifica: true });
  }
  return out.sort((x, y) => x.codice.localeCompare(y.codice) || x.dir.localeCompare(y.dir));
}

/** Descrizione della riga: il codice da scegliere in UNIO viene per primo. */
export function descrizioneRiga(r, nomeSottoconto, p) {
  const testo = r.rettifica
    ? `[${r.codice}] ${nomeSottoconto} – correzione ${p.breve}`
    : `[${r.codice}] ${nomeSottoconto} – ${p.breve} (${r.n} mov.)`;
  return testo.replace(/[;"\r\n]/g, " ").slice(0, 120);
}

const dataIt = (d) => d.split("-").reverse().join("/");

/** File per UNIO, nello stesso formato del file già importato con successo in UNIO. */
export function csvImportazione(righe) {
  const q = (s) => `"${String(s).replace(/"/g, "'")}"`;
  const linee = [`"DATA";"DESCRIZIONE";"USCITE";"ENTRATE"`,
    ...righe.map((r) => [q(dataIt(r.data)), q(r.descr), q(r.dir === "U" ? formatDecimale(r.importo) : ""), q(r.dir === "E" ? formatDecimale(r.importo) : "")].join(";"))];
  return "﻿" + linee.join("\r\n") + "\r\n";
}

/** Registro degli invii {anno, trimestre, cassa, quando, autore, fotografia, righeInviate}: quelli della stessa cassa e trimestre, dal più vecchio. */
export const inviiDi = (invii, cassa, p) => (invii ?? []).filter((x) => x.cassa === cassa && x.anno === p.anno && x.trimestre === p.trimestre)
  .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));

/** Quello che UNIO contiene già per quella cassa e quel trimestre (ultima fotografia, o niente). */
export const ultimaFotografia = (invii, cassa, p) => inviiDi(invii, cassa, p).at(-1)?.fotografia ?? [];

/** Quello che resta da inviare per una cassa e un trimestre. */
export function preparaInvio(movimenti, invii, cassa, p) {
  const { righe, altrove } = riepilogoCassa(movimenti, cassa, p);
  const precedenti = inviiDi(invii, cassa, p);
  return { fotografia: righe.map(({ codice, dir, importo }) => ({ codice, dir, importo })), altrove, precedenti,
    righe: daInviare(righe, ultimaFotografia(invii, cassa, p), p.a) };
}

/**
 * Promemoria: trimestri da portare in UNIO.
 *  "da-preparare": trimestre finito, ci sono movimenti, mai importato
 *  "modificato":   già importato, ma poi i movimenti sono cambiati
 */
export function promemoria(movimenti, invii, { anno, casse, oggi }) {
  const out = [];
  for (const t of Object.keys(TRIMESTRI)) {
    const p = periodo(anno, t);
    for (const cassa of casse) {
      const { righe, precedenti } = preparaInvio(movimenti, invii, cassa, p);
      if (precedenti.length) { if (righe.length) out.push({ cassa, trimestre: t, stato: "modificato" }); }
      else if (righe.length && p.a < oggi) out.push({ cassa, trimestre: t, stato: "da-preparare" });
    }
  }
  return out;
}
