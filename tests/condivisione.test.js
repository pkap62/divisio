// Condivisione tra più computer simulati, con una cartella "finta" in memoria.
import { test, uguale, vero, contiene } from "./mini.js";
import { creaCondivisione, nomeFile } from "../js/dati/condivisione.js";
import { unisciContando, nuovoIstante } from "../js/dominio/unione.js";
import { scritturaSemplice } from "../js/dominio/scritture.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";

/** Cartella condivisa finta: conta anche le scritture. */
function cartellaFinta() {
  const file = new Map();
  return {
    file, scritture: 0,
    async elenca() { return [...file.keys()].map((nome) => ({ nome, leggi: async () => file.get(nome) })); },
    async scrivi(nome, testo) { this.scritture++; file.set(nome, testo); },
  };
}

/** Computer finto: un archivio in memoria con la stessa logica di unione dell'archivio vero. */
function computer(nome, cartella) {
  let dati = { conti: sottocontiIniziali().map((c) => ({ ...c, modificatoIl: "2000-01-01T00:00:00.000Z", autore: "Divisio" })), movimenti: [], impostazioni: [] };
  const arch = {
    esporta: () => dati,
    async unisci(d) { const r = unisciContando(dati, d); dati = r.dati; return r.cambiati; },
  };
  const c = creaCondivisione({ arch, cartella, dispositivo: `${nome}-0000-dispositivo`, autore: () => nome });
  const trova = (id) => dati.movimenti.find((m) => m.id === id);
  return {
    c, arch, trova,
    movimenti: () => dati.movimenti.filter((m) => !m.eliminato),
    registra(id, descr, importo) {
      const prec = trova(id);
      const m = { id, data: "2026-03-01", descr, tipo: "entrata", autore: nome, modificatoIl: nuovoIstante(prec?.modificatoIl),
        righe: scritturaSemplice({ tipo: "entrata", importo, voce: "E01-02-01", cassa: "A02-01-01" }) };
      dati = { ...dati, movimenti: [...dati.movimenti.filter((x) => x.id !== id), m] };
    },
    elimina(id) {
      const prec = trova(id);
      dati = { ...dati, movimenti: [...dati.movimenti.filter((x) => x.id !== id), { ...prec, eliminato: true, modificatoIl: nuovoIstante(prec.modificatoIl) }] };
    },
  };
}

test("condivisione: ogni computer scrive solo il proprio file", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart), pc = computer("PC", cart);
  mac.registra("m1", "colletta", 1000);
  await mac.c.sincronizza();
  await pc.c.sincronizza();
  uguale([...cart.file.keys()].sort(), [nomeFile("Mac-0000-dispositivo"), nomeFile("PC-0000-dispositivo")].sort());
  uguale(pc.movimenti().map((m) => m.descr), ["colletta"], "il PC riceve il movimento del Mac");
});

test("condivisione: registrazioni contemporanee su due computer non si perdono", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart), pc = computer("PC", cart);
  mac.registra("m1", "offerta funerale", 5000);
  pc.registra("p1", "bolletta luce", 3000);
  await Promise.all([mac.c.sincronizza(), pc.c.sincronizza()]);
  await mac.c.sincronizza(); await pc.c.sincronizza();
  uguale(mac.movimenti().map((m) => m.id).sort(), ["m1", "p1"]);
  uguale(pc.movimenti().map((m) => m.id).sort(), ["m1", "p1"]);
});

test("condivisione: correzioni ed eliminazioni arrivano agli altri", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart), pc = computer("PC", cart);
  mac.registra("m1", "offerta", 5000);
  await mac.c.sincronizza(); await pc.c.sincronizza();
  pc.registra("m1", "offerta funerale (corretta)", 6000);
  await pc.c.sincronizza(); await mac.c.sincronizza();
  uguale(mac.trova("m1").descr, "offerta funerale (corretta)");
  mac.elimina("m1");
  await mac.c.sincronizza(); await pc.c.sincronizza();
  uguale(pc.movimenti().length, 0, "eliminato anche sul PC");
});

test("condivisione: stessa correzione in contemporanea → vince l'ultima", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart), pc = computer("PC", cart);
  mac.registra("m1", "originale", 1000);
  await mac.c.sincronizza(); await pc.c.sincronizza();
  mac.registra("m1", "corretto dal Mac", 1100);
  await new Promise((r) => setTimeout(r, 5));
  pc.registra("m1", "corretto dal PC", 1200);
  await Promise.all([mac.c.sincronizza(), pc.c.sincronizza()]);
  await mac.c.sincronizza(); await pc.c.sincronizza();
  uguale(mac.trova("m1").descr, "corretto dal PC");
  uguale(pc.trova("m1").descr, "corretto dal PC");
});

test("condivisione: un computer nuovo riceve tutto, e chi perde i dati li ritrova dal proprio file", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart);
  for (let i = 0; i < 50; i++) mac.registra(`m${i}`, `mov ${i}`, 100 + i);
  await mac.c.sincronizza();
  const nuovo = computer("Nuovo", cart);
  await nuovo.c.sincronizza();
  uguale(nuovo.movimenti().length, 50);
  const macRifatto = computer("Mac", cart);       // stesso computer con il browser svuotato
  await macRifatto.c.sincronizza();
  uguale(macRifatto.movimenti().length, 50);
});

test("condivisione: se non cambia niente il file non viene riscritto", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart);
  mac.registra("m1", "x", 100);
  await mac.c.sincronizza();
  const prima = cart.scritture;
  await mac.c.sincronizza(); await mac.c.sincronizza();
  uguale(cart.scritture, prima);
  mac.registra("m2", "y", 200);
  await mac.c.sincronizza();
  uguale(cart.scritture, prima + 1);
});

test("condivisione: file rovinati o estranei vengono ignorati con un avviso", async () => {
  const cart = cartellaFinta();
  const mac = computer("Mac", cart);
  cart.file.set("divisio-rotto.json", "{ mezzo file");
  cart.file.set("divisio-altro.json", JSON.stringify({ app: "Altro" }));
  cart.file.set("appunti.txt", "non c'entra");
  const sbagliato = { app: "Divisio", formato: 1, dati: { conti: [], impostazioni: [], movimenti: [{ id: "z", data: "2026-01-01", descr: "sbilanciato", tipo: "pd", righe: [{ conto: "A02-01-01", dare: 100, avere: 0 }, { conto: "E01-02-01", dare: 0, avere: 90 }] }] } };
  cart.file.set("divisio-sbagliato.json", JSON.stringify(sbagliato));
  mac.registra("m1", "x", 100);
  const esito = await mac.c.sincronizza();
  uguale(esito.avvisi.length, 3);
  contiene(esito.avvisi, "non leggibile");
  contiene(esito.avvisi, "non è un file di Divisio");
  contiene(esito.avvisi, "ignorato");
  uguale(mac.movimenti().map((m) => m.id), ["m1"], "nessun dato sbagliato entra");
});

test("condivisione: se la cartella non risponde lo stato lo dice e i dati restano", async () => {
  const mac = computer("Mac", { async elenca() { throw new Error("Cartella non raggiungibile"); }, async scrivi() {} });
  mac.registra("m1", "x", 100);
  const esito = await mac.c.sincronizza();
  uguale(esito.errore, "Cartella non raggiungibile");
  uguale(mac.c.stato.problema, "Cartella non raggiungibile");
  uguale(mac.movimenti().length, 1);
});
