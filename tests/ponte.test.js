// Ponte verso UNIO. Il test decisivo SIMULA l'import in UNIO: ogni riga del file diventa
// "Dare cassa / Avere sottoconto" (entrata) oppure "Dare sottoconto / Avere cassa" (uscita),
// e il Rendiconto che ne risulta deve essere identico a quello di Divisio.
import { test, uguale, vero, contiene, casuale } from "./mini.js";
import { riepilogoCassa, senzaCassa, daInviare, preparaInvio, csvImportazione, descrizioneRiga, periodo, cassaDelMovimento, promemoria, TRIMESTRI } from "../js/dominio/ponte.js";
import { scritturaSemplice, scritturaApertura, verificaMovimento } from "../js/dominio/scritture.js";
import { calcolaRendiconto } from "../js/dominio/rendiconto.js";
import { sottocontiIniziali, isCassaBanca, tipoDi } from "../js/dominio/piano.js";

const CASSA = "A02-01-01", BANCA = "A02-01-02", PAYPAL = "A02-01-03", CASSE = [CASSA, BANCA, PAYPAL];
let n = 0;
const s = (data, tipo, args, descr = "x") => ({ id: `p${++n}`, data, descr, tipo, righe: scritturaSemplice({ tipo, ...args }) });
const pd = (data, righe) => ({ id: `p${++n}`, data, descr: "pd", tipo: "pd", righe: righe.map(([conto, dare, avere]) => ({ conto, dare, avere })) });

/** Simula UNIO: dalle righe importate per una cassa ricostruisce le scritture in partita doppia. */
const importaInUNIO = (righe, cassa) => righe.map((r) => ({ id: `u${++n}`, data: r.data, descr: "import", tipo: "pd",
  righe: r.dir === "E" ? [{ conto: cassa, dare: r.importo, avere: 0 }, { conto: r.codice, dare: 0, avere: r.importo }]
                       : [{ conto: r.codice, dare: r.importo, avere: 0 }, { conto: cassa, dare: 0, avere: r.importo }] }));

const T2 = periodo(2026, "T2");

test("ponte: una riga per sottoconto e direzione, con numero di movimenti e ultima data", () => {
  const ms = [
    s("2026-04-14", "uscita", { importo: 5710, voce: "U08-01-04", cassa: BANCA }),
    s("2026-05-14", "uscita", { importo: 5710, voce: "U08-01-04", cassa: BANCA }),
    s("2026-06-11", "uscita", { importo: 6320, voce: "U08-01-04", cassa: BANCA }),
    s("2026-06-07", "entrata", { importo: 30000, voce: "E01-03-04", cassa: BANCA }),
    s("2026-04-12", "uscita", { importo: 48000, voce: "PG1-01-03", cassa: BANCA }),
    s("2026-04-20", "entrata", { importo: 9999, voce: "E01-02-01", cassa: CASSA }),       // altra cassa
    s("2026-07-01", "uscita", { importo: 1000, voce: "U08-01-04", cassa: BANCA }),        // altro trimestre
  ];
  const { righe } = riepilogoCassa(ms, BANCA, T2);
  uguale(righe, [
    { codice: "E01-03-04", dir: "E", importo: 30000, n: 1, data: "2026-06-07" },
    { codice: "PG1-01-03", dir: "U", importo: 48000, n: 1, data: "2026-04-12" },
    { codice: "U08-01-04", dir: "U", importo: 17740, n: 3, data: "2026-06-11" },
  ]);
});

test("ponte: lo spostamento tra casse va solo nel file di chi riceve i soldi", () => {
  const sp = s("2026-05-10", "spostamento", { importo: 150000, da: CASSA, verso: BANCA });
  uguale(cassaDelMovimento(sp), BANCA);
  uguale(riepilogoCassa([sp], BANCA, T2).righe, [{ codice: CASSA, dir: "E", importo: 150000, n: 1, data: "2026-05-10" }]);
  const inCassa = riepilogoCassa([sp], CASSA, T2);
  uguale(inCassa.righe, []);
  uguale(inCassa.altrove.length, 1);
});

test("ponte: i movimenti senza cassa sono elencati a parte", () => {
  const amm = pd("2026-06-30", [["U10-01-01", 30000, 0], ["P03-01-01", 0, 30000]]);
  uguale(senzaCassa([amm, s("2026-05-01", "entrata", { importo: 100, voce: "E01-02-01", cassa: CASSA })], T2).map((m) => m.id), [amm.id]);
});

test("ponte: descrizione con il codice all'inizio e file nel formato già accettato da UNIO", () => {
  const r = { codice: "U08-01-04", dir: "U", importo: 17740, n: 3, data: "2026-06-11" };
  uguale(descrizioneRiga(r, "Telefono e internet", T2), "[U08-01-04] Telefono e internet – 2° trim. 2026 (3 mov.)");
  uguale(descrizioneRiga({ ...r, rettifica: true }, "Telefono; internet", T2), "[U08-01-04] Telefono  internet – correzione 2° trim. 2026");
  const csv = csvImportazione([{ ...r, descr: 'Luce "marzo"' }, { codice: "E01-03-04", dir: "E", importo: 125050, data: "2026-06-07", descr: "Matrimoni" }]);
  vero(csv.startsWith("﻿"), "con BOM, come il file di esempio");
  uguale(csv.slice(1).split("\r\n"), [
    '"DATA";"DESCRIZIONE";"USCITE";"ENTRATE"',
    `"11/06/2026";"Luce 'marzo'";"177,40";""`,
    '"07/06/2026";"Matrimoni";"";"1250,50"',
    "",
  ]);
});

test("ponte: solo le differenze dopo un invio (aggiunte, correzioni, eliminazioni)", () => {
  const inviato = [{ codice: "U08-01-04", dir: "U", importo: 17740 }, { codice: "E01-03-04", dir: "E", importo: 30000 }, { codice: "U01-02-02", dir: "U", importo: 4500 }];
  const attuale = [
    { codice: "E01-03-04", dir: "E", importo: 30000, n: 1, data: "2026-06-07" },   // uguale → niente
    { codice: "U08-01-04", dir: "U", importo: 23450, n: 4, data: "2026-06-20" },   // +57,10
    { codice: "U05-03-01", dir: "U", importo: 122000, n: 1, data: "2026-06-15" },  // nuovo
  ];                                                                              // U01-02-02 eliminato → rettifica in entrata
  uguale(daInviare(attuale, inviato, "2026-06-30"), [
    { codice: "U01-02-02", dir: "E", importo: 4500, n: 0, data: "2026-06-30", rettifica: true },
    { codice: "U05-03-01", dir: "U", importo: 122000, n: 1, data: "2026-06-15", rettifica: false },
    { codice: "U08-01-04", dir: "U", importo: 5710, n: 4, data: "2026-06-20", rettifica: true },
  ]);
  uguale(daInviare(attuale, attuale), [], "nessuna differenza");
});

test("ponte: simulando l'import in UNIO, il Rendiconto è identico a quello di Divisio (anche dopo correzioni)", () => {
  const rnd = casuale(11);
  const conti = sottocontiIniziali().map((c) => c.codice);
  const voci = conti.filter((c) => !isCassaBanca(c) && tipoDi(c) !== "PAT");
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const data = () => `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`;
  const nuovo = () => {
    const tipo = pick(["entrata", "uscita", "spostamento", "pd", "pd-casse", "senza"]);
    const imp = 1 + Math.floor(rnd() * 300000);
    if (tipo === "entrata" || tipo === "uscita") return s(data(), tipo, { importo: imp, voce: pick(voci.filter((c) => tipoDi(c) !== (tipo === "entrata" ? "U" : "E"))), cassa: pick(CASSE) });
    if (tipo === "spostamento") { const da = pick(CASSE); return s(data(), tipo, { importo: imp, da, verso: pick(CASSE.filter((c) => c !== da)) }); }
    if (tipo === "senza") return pd(data(), [[pick(voci), imp, 0], [pick(voci), 0, imp]]);
    if (tipo === "pd-casse") { const [a, b] = [pick(CASSE), pick(CASSE)]; return pd(data(), [[a, imp + 500, 0], [pick(voci), 200, 0], [b, 0, imp + 300], [pick(voci), 0, 400]]); }
    const k = 1 + Math.floor(rnd() * 1000);   // pd con una cassa e più voci da entrambe le parti
    return pd(data(), [[pick(CASSE), imp, 0], [pick(voci), k, 0], [pick(voci), 0, imp + k]]);
  };
  const apertura = { id: "apertura-2026", data: "2026-01-01", descr: "ap", tipo: "apertura",
    righe: scritturaApertura([{ conto: CASSA, importo: 80000 }, { conto: BANCA, importo: 1000000 }, { conto: "PG1-01-08", importo: 30000 }]) };
  let divisio = [apertura, ...Array.from({ length: 600 }, nuovo)];
  for (const m of divisio) uguale(verificaMovimento(m), [], `movimento generato ${m.id}`);

  // ogni "giro": per ogni trimestre e cassa si prepara il file, lo si "importa" in UNIO e si salva la fotografia
  const inUNIO = [apertura];
  let invii = [];
  let istante = 0;
  const giro = () => {
    for (const t of Object.keys(TRIMESTRI)) {
      const p = periodo(2026, t);
      for (const cassa of CASSE) {
        const { righe, fotografia } = preparaInvio(divisio, invii, cassa, p);
        inUNIO.push(...importaInUNIO(righe, cassa));
        invii.push({ anno: 2026, trimestre: t, cassa, quando: String(++istante).padStart(6, "0"), fotografia });
      }
      for (const m of senzaCassa(divisio, p)) if (!inUNIO.includes(m)) inUNIO.push(m);   // inseriti a mano
    }
  };
  giro();
  const confronta = (msg) => {
    const R = calcolaRendiconto(divisio, 2026), U = calcolaRendiconto(inUNIO, 2026);
    for (const [k, v] of R.voci) uguale(U.voci.get(k), v, `${msg}: voce ${k}`);
    for (const c of CASSE) uguale(U.sottoconti.get(c) ?? 0, R.sottoconti.get(c) ?? 0, `${msg}: saldo ${c}`);
    vero(U.quadra, `${msg}: quadratura in UNIO`);
  };
  confronta("primo import");

  // poi si correggono importi, si eliminano e si aggiungono movimenti, e si rimanda solo la differenza
  divisio = divisio.map((m) => {
    if (m.tipo !== "entrata" && m.tipo !== "uscita") return m;
    const x = rnd();
    if (x < 0.15) return { ...m, eliminato: true };
    if (x < 0.35) { const imp = 1 + Math.floor(rnd() * 300000); return { ...m, righe: m.righe.map((r) => ({ ...r, dare: r.dare ? imp : 0, avere: r.avere ? imp : 0 })) }; }
    if (x < 0.45) return { ...m, righe: m.righe.map((r) => (isCassaBanca(r.conto) ? r : { ...r, conto: pick(voci.filter((c) => tipoDi(c) !== (m.tipo === "entrata" ? "U" : "E"))) })) };
    return m;
  });
  divisio.push(...Array.from({ length: 100 }, nuovo));
  giro();
  confronta("dopo le correzioni");
  const prima = inUNIO.length;
  giro();
  uguale(inUNIO.length, prima, "senza cambiamenti non si importa nulla");
});

test("ponte: promemoria dei trimestri da portare in UNIO", () => {
  const ms = [s("2026-02-01", "entrata", { importo: 100, voce: "E01-02-01", cassa: CASSA }), s("2026-11-01", "entrata", { importo: 100, voce: "E01-02-01", cassa: CASSA })];
  uguale(promemoria(ms, [], { anno: 2026, casse: CASSE, oggi: "2026-11-15" }), [{ cassa: CASSA, trimestre: "T1", stato: "da-preparare" }], "il 4° trimestre non è ancora finito");
  const invii = [{ anno: 2026, trimestre: "T1", cassa: CASSA, quando: "2026-04-02", fotografia: [{ codice: "E01-02-01", dir: "E", importo: 100 }] }];
  uguale(promemoria(ms, invii, { anno: 2026, casse: CASSE, oggi: "2026-11-15" }), []);
  ms.push(s("2026-03-01", "entrata", { importo: 50, voce: "E01-02-01", cassa: CASSA }));
  uguale(promemoria(ms, invii, { anno: 2026, casse: CASSE, oggi: "2026-11-15" }), [{ cassa: CASSA, trimestre: "T1", stato: "modificato" }]);
  contiene(Object.keys(TRIMESTRI), "T4");
});
