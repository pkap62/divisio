// Tabella dei movimenti, usata in "Inizio" e in "Movimenti".

import { analizza, totaliRighe } from "../dominio/scritture.js";
import { esc, eur, dataIt } from "./util.js";

export function descrivi(m, arch) {
  const a = analizza(m);
  const nome = (c) => esc(arch.nomeConto(c));
  if (a.tipo === "apertura") return { ...a, voce: "Saldi di apertura", cassa: "" };
  if (a.tipo === "spostamento") return { ...a, voce: "Spostamento", cassa: `${nome(a.da)} → ${nome(a.verso)}` };
  const voce = a.voci.length === 1 ? `${nome(a.voci[0].conto)} <span class="codice">${a.voci[0].conto}</span>` : "Più voci";
  return { ...a, voce, cassa: a.casse.map((r) => nome(r.conto)).join(", ") || "—" };
}

export function tabellaRighe(righe, arch) {
  const { dare, avere } = totaliRighe(righe);
  return `<table class="righe"><tr><th>Conto</th><th class="n">Dare</th><th class="n">Avere</th></tr>
    ${righe.map((r) => `<tr><td>${esc(arch.nomeConto(r.conto))} <span class="codice">${r.conto}</span></td>
      <td class="n">${r.dare ? eur(r.dare) : ""}</td><td class="n">${r.avere ? eur(r.avere) : ""}</td></tr>`).join("")}
    <tr class="tot"><td>Totale ${dare === avere ? "✓" : "✗"}</td><td class="n">${eur(dare)}</td><td class="n">${eur(avere)}</td></tr></table>`;
}

/** progressivo (facoltativo): Map id → saldo della cassa scelta dopo quel movimento, mostrato in una colonna in più. */
export function tabellaMovimenti(lista, arch, { dettagli = false, progressivo = null } = {}) {
  if (!lista.length) return `<p class="hint">Nessun movimento.</p>`;
  return `<div class="scorri"><table class="movimenti">
    <tr><th>Data</th><th>Descrizione</th><th>Voce</th><th>Cassa / banca</th><th class="n">Importo</th>${progressivo ? `<th class="n">Saldo dopo</th>` : ""}</tr>
    ${lista.map((m) => {
      const d = descrivi(m, arch);
      const classe = d.segno > 0 ? "pos" : d.segno < 0 ? "neg" : "";
      return `<tr><td class="nowrap">${dataIt(m.data)}</td><td>${esc(m.descr)}${m.fattura ? ` <span class="pill">da fattura</span>` : ""}
        ${dettagli ? `<details><summary>Dettagli</summary>${tabellaRighe(m.righe, arch)}
          <p class="hint">Inserito da ${esc(m.autore ?? "—")} · ultima modifica ${m.modificatoIl ? new Date(m.modificatoIl).toLocaleString("it-IT") : "—"}</p>
          ${m.tipo === "apertura"
            ? `<p class="hint">I saldi di apertura si cambiano da Impostazioni.</p>`
            : `<div class="riga-bottoni"><button class="btn sec piccolo" data-azione="modifica" data-id="${esc(m.id)}">Modifica</button>
               ${m.fattura ? "" : `<button class="btn sec piccolo" data-azione="copia" data-id="${esc(m.id)}">Registra di nuovo uguale</button>`}
               <button class="btn pericolo piccolo" data-azione="elimina" data-id="${esc(m.id)}">Elimina</button></div>`}
        </details>` : ""}</td>
        <td>${d.voce}</td><td>${d.cassa}</td><td class="n ${classe}">${d.segno > 0 ? "+" : d.segno < 0 ? "−" : ""}${eur(d.importo)}</td>${progressivo
          ? `<td class="n ${(progressivo.get(m.id) ?? 0) < 0 ? "neg" : ""}">${progressivo.has(m.id) ? eur(progressivo.get(m.id)) : ""}</td>` : ""}</tr>`;
    }).join("")}</table></div>`;
}
