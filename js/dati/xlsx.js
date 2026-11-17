// Lettura del primo foglio di un file Excel (.xlsx), senza librerie esterne.
// Un .xlsx è un archivio ZIP di file XML: si aprono solo quelli che servono (fogli, testi, formati delle celle).
// Per decomprimere si usa il browser (DecompressionStream); le altre funzioni sono semplici e si provano dal Terminale.

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Elenco dei file contenuti nello ZIP: Map nome → {metodo, compresso, inizio}. */
export function voci(b) {
  let fine = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { fine = i; break; }
  if (fine < 0) throw new Error("Il file non è un Excel .xlsx valido.");
  const n = u16(b, fine + 10);
  let p = u32(b, fine + 16);
  const out = new Map();
  for (let k = 0; k < n && u32(b, p) === 0x02014b50; k++) {
    const metodo = u16(b, p + 10), compresso = u32(b, p + 20), lNome = u16(b, p + 28), lExtra = u16(b, p + 30), lComm = u16(b, p + 32), locale = u32(b, p + 42);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + lNome));
    const inizio = locale + 30 + u16(b, locale + 26) + u16(b, locale + 28);
    out.set(nome, { metodo, compresso, inizio });
    p += 46 + lNome + lExtra + lComm;
  }
  return out;
}

async function estrai(b, voce) {
  const dati = b.subarray(voce.inizio, voce.inizio + voce.compresso);
  if (voce.metodo === 0) return new TextDecoder().decode(dati);
  if (voce.metodo !== 8) throw new Error("Compressione non supportata.");
  const flusso = new Blob([dati]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(flusso).arrayBuffer());
}

const entita = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const testoDi = (xml) => entita([...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => m[1]).join(""));

/** Testi condivisi del file (sharedStrings.xml). */
export const testiCondivisi = (xml) => [...String(xml ?? "").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => testoDi(m[1]));

/** Per ogni stile di cella (indice), true se è un formato di data. */
export function stiliData(xml) {
  const s = String(xml ?? "");
  const personali = new Map([...s.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), entita(m[2])]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(s)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => {
    const id = Number(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? 0);
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const codice = (personali.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    return /[dy]/i.test(codice) || /m{1,4}/i.test(codice) && !/0|#/.test(codice);
  });
}

const colonna = (rif) => { let n = 0; for (const c of rif.replace(/\d+$/, "")) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
const due = (n) => String(n).padStart(2, "0");
function dataExcel(x) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(x * 864e5));
  return `${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}-${due(d.getUTCDate())}`;
}

/** Righe del foglio come tabella: le date diventano "AAAA-MM-GG", i numeri restano numeri, il resto testo. */
export function righeDaFoglio(xml, testi = [], date = []) {
  const righe = [];
  for (const m of String(xml).matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const numero = Number(/\br="(\d+)"/.exec(m[1])?.[1] ?? righe.length + 1);
    const riga = [];
    for (const c of m[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attr = c[1], corpo = c[2] ?? "";
      const rif = /\br="([A-Z]+)\d*"/.exec(attr)?.[1];
      const i = rif ? colonna(rif) : riga.length;
      const tipo = /\bt="(\w+)"/.exec(attr)?.[1] ?? "n";
      const stile = Number(/\bs="(\d+)"/.exec(attr)?.[1] ?? 0);
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(corpo)?.[1];
      let valore = "";
      if (tipo === "s") valore = testi[Number(v)] ?? "";
      else if (tipo === "inlineStr") valore = testoDi(corpo);
      else if (tipo === "str" || tipo === "e") valore = entita(v ?? "");
      else if (tipo === "b") valore = v === "1" ? "VERO" : "FALSO";
      else if (v !== undefined && v !== "") { const x = Number(v); valore = date[stile] && x > 0 && x < 2958466 ? dataExcel(x) : x; }
      riga[i] = valore;
    }
    while (righe.length < numero - 1) righe.push([]);   // le righe vuote non sono scritte nel file
    righe.push(Array.from(riga, (x) => x ?? ""));
  }
  return righe;
}

/** Tabella del primo foglio di un .xlsx (bytes: Uint8Array). Solo nel browser. */
export async function leggiXlsx(bytes) {
  const z = voci(bytes);
  const leggi = async (nome) => (z.has(nome) ? estrai(bytes, z.get(nome)) : "");
  // il primo foglio, come lo indica la cartella di lavoro
  let foglio = "xl/worksheets/sheet1.xml";
  const wb = await leggi("xl/workbook.xml"), rel = await leggi("xl/_rels/workbook.xml.rels");
  const rid = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const target = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rel)?.[1]
    || rid && new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rel)?.[1];
  if (target) foglio = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  if (!z.has(foglio)) foglio = [...z.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k));
  if (!foglio) throw new Error("Nel file Excel non c'è nessun foglio.");
  return righeDaFoglio(await leggi(foglio), testiCondivisi(await leggi("xl/sharedStrings.xml")), stiliData(await leggi("xl/styles.xml")));
}
