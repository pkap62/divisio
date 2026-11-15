// Piccoli aiuti per l'interfaccia.

import { formatEuro } from "../dominio/importi.js";
import { VOCI, voceDi } from "../dominio/piano.js";

export const $ = (s, radice = document) => radice.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const eur = formatEuro;
export const cellaEuro = (c, classe = "") => `<td class="n ${c === 0 ? "zero" : ""} ${classe}">${formatEuro(c)}</td>`;
export const dataIt = (d) => (d ? d.split("-").reverse().join("/") : "");
export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const due = (n) => String(n).padStart(2, "0");
export function oggiISO() { const d = new Date(); return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`; }

/** Data proposta per un nuovo movimento dell'anno scelto: oggi, se l'anno è quello in corso. */
export function dataPerAnno(anno) {
  const oggi = oggiISO(), corrente = Number(oggi.slice(0, 4));
  if (anno === corrente) return oggi;
  return anno < corrente ? `${anno}-12-31` : `${anno}-01-01`;
}

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

export function scarica(nome, testo, tipo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([testo], { type: tipo }));
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Preferenze di QUESTO computer (nome di chi lo usa, anno scelto, ultima copia). */
export const locale = {
  leggi(chiave, predefinito) { try { const v = localStorage.getItem("divisio." + chiave); return v === null ? predefinito : JSON.parse(v); } catch { return predefinito; } },
  scrivi(chiave, valore) { try { localStorage.setItem("divisio." + chiave, JSON.stringify(valore)); } catch { /* memoria non disponibile: pazienza */ } },
};

/**
 * <option> dei sottoconti raggruppati per voce del Rendiconto.
 * tipi: ordine dei tipi da mostrare (es. ["E","PG","A","P"]); escludi: funzione codice → true per nascondere;
 * cerca: testo per filtrare; selezionato: codice da tenere comunque visibile.
 */
export function opzioniConti(conti, { tipi, escludi = () => false, cerca = "", selezionato = "", vuota = "— scegli la voce —" }) {
  const q = norm(cerca).trim();
  const perVoce = new Map();
  for (const c of conti) {
    if (escludi(c.codice) && c.codice !== selezionato) continue;
    const v = voceDi(c.codice);
    if (q && c.codice !== selezionato && !norm(`${c.nome} ${c.codice} ${VOCI.find((x) => x.codice === v)?.nome}`).includes(q)) continue;
    if (!perVoce.has(v)) perVoce.set(v, []);
    perVoce.get(v).push(c);
  }
  let html = `<option value="">${esc(vuota)}</option>`;
  for (const t of tipi) {
    for (const v of VOCI.filter((x) => x.tipo === t)) {
      const elenco = perVoce.get(v.codice);
      if (!elenco) continue;
      html += `<optgroup label="${esc(v.codice + " · " + v.nome)}">${elenco.sort((a, b) => a.codice.localeCompare(b.codice))
        .map((c) => `<option value="${c.codice}" ${c.codice === selezionato ? "selected" : ""}>${esc(c.nome)} (${c.codice})</option>`).join("")}</optgroup>`;
    }
  }
  return html;
}
