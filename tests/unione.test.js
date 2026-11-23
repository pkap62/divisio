import { sottocontiIniziali, contiVisibili } from "../js/dominio/piano.js";
import { test, uguale, vero, casuale } from "./mini.js";
import { unisciDati, nuovoIstante, nuovoId } from "../js/dominio/unione.js";

const mov = (id, descr, quando, autore = "A", extra = {}) => ({ id, descr, modificatoIl: quando, autore, ...extra });
const dati = (movimenti, conti = [], impostazioni = []) => ({ conti, movimenti, impostazioni });
const ordina = (d) => JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [...v].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])));

test("unione: movimenti diversi di due computer si sommano", () => {
  const r = unisciDati(dati([mov("1", "offerta", "2026-03-01T10:00:00.000Z")]), dati([mov("2", "luce", "2026-03-01T10:05:00.000Z", "B")]));
  uguale(r.movimenti.map((m) => m.id).sort(), ["1", "2"]);
});

test("unione: sullo stesso movimento vince la modifica più recente", () => {
  const vecchio = mov("1", "offerta", "2026-03-01T10:00:00.000Z", "A");
  const nuovo = mov("1", "offerta funerale", "2026-03-01T11:00:00.000Z", "B");
  uguale(unisciDati(dati([vecchio]), dati([nuovo])).movimenti, [nuovo]);
  uguale(unisciDati(dati([nuovo]), dati([vecchio])).movimenti, [nuovo]);
});

test("unione: una cancellazione si propaga, una modifica successiva la supera", () => {
  const m = mov("1", "offerta", "2026-03-01T10:00:00.000Z");
  const canc = mov("1", "offerta", "2026-03-02T10:00:00.000Z", "B", { eliminato: true });
  uguale(unisciDati(dati([m]), dati([canc])).movimenti[0].eliminato, true);
  const ripristino = mov("1", "offerta corretta", "2026-03-03T10:00:00.000Z", "A");
  uguale(unisciDati(dati([canc]), dati([ripristino])).movimenti, [ripristino]);
});

test("unione: stesso risultato in qualunque ordine e leggendo due volte lo stesso file", () => {
  const rnd = casuale(3);
  const fai = (autore) => dati(Array.from({ length: 40 }, (_, i) =>
    mov(String(Math.floor(rnd() * 25)), `${autore}${i}`, `2026-01-0${1 + Math.floor(rnd() * 9)}T00:00:00.000Z`, autore, rnd() < 0.2 ? { eliminato: true } : {})),
    [{ codice: "U08-01-01", nome: autore, modificatoIl: `2026-02-0${1 + Math.floor(rnd() * 9)}T00:00:00.000Z` }],
    [{ chiave: "parrocchia", valore: autore, modificatoIl: `2026-02-0${1 + Math.floor(rnd() * 9)}T00:00:00.000Z` }]);
  const a = fai("A"), b = fai("B"), c = fai("C");
  const r1 = ordina(unisciDati(a, b, c));
  uguale(ordina(unisciDati(c, a, b)), r1, "ordine diverso");
  uguale(ordina(unisciDati(unisciDati(a, b), c)), r1, "a gruppi");
  uguale(ordina(unisciDati(a, b, c, b, a)), r1, "file letti due volte");
});

test("istanti di modifica sempre crescenti e identificativi unici", () => {
  const t1 = nuovoIstante(null, new Date("2026-03-01T10:00:00.000Z"));
  const t2 = nuovoIstante(t1, new Date("2026-03-01T10:00:00.000Z"));
  vero(t2 > t1, "stesso millisecondo");
  uguale(nuovoIstante(t2, new Date("2026-03-01T09:00:00.000Z")) > t2, true, "orologio indietro");
  const ids = new Set(Array.from({ length: 1000 }, nuovoId));
  uguale(ids.size, 1000);
});

test("piano dei conti: un sottoconto eliminato dal parroco sparisce anche dai collaboratori", () => {
  const iniziali = sottocontiIniziali();
  vero(!iniziali.some((c) => ["U02-03-05", "U02-03-06", "U02-03-07"].includes(c.codice)), "le parrocchie nuove non ricevono sottoconti di una parrocchia");
  const vecchio = "2000-01-01T00:00:00.000Z";
  const collaboratore = { conti: [{ codice: "U02-03-05", nome: "Rimborso COLF", attivo: true, modificatoIl: vecchio }, { codice: "U02-03-09", nome: "Aggiunto", attivo: true, modificatoIl: "2026-11-01T10:00:00.000Z" }] };
  const parroco = { conti: [{ codice: "U02-03-05", nome: "Rimborso COLF", attivo: false, eliminato: true, modificatoIl: "2026-11-23T10:00:00.000Z" }] };
  const uniti = unisciDati(collaboratore, parroco);
  const conti = new Map(uniti.conti.map((c) => [c.codice, c]));
  uguale([...contiVisibili(conti, []).keys()], ["U02-03-09"], "eliminato: non si vede più; quello aggiunto resta");
  const usato = [{ righe: [{ conto: "U02-03-05", dare: 100, avere: 0 }] }];
  vero(contiVisibili(conti, usato).has("U02-03-05"), "se un movimento lo usa resta visibile");
});
