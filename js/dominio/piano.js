// Piano dei conti della Diocesi di Firenze (come in UNIO).
// Codice di un sottoconto: GRUPPO-CONTO-SOTTOCONTO, es. "U08-01-04".
// GRUPPO-CONTO (es. "U08-01") è la voce del Rendiconto.
// I nomi delle voci sono identici a quelli del Rendiconto UNIO.
// I nomi dei sottoconti qui sono di ESEMPIO: ogni parrocchia li rinomina o ne aggiunge
// dalle Impostazioni, e quei dati restano solo sul suo computer.

export const TIPI = {
  A: "Attività",
  PAT: "Patrimonio",
  P: "Passività",
  PG: "Partite di giro (collette)",
  E: "Entrate",
  U: "Uscite",
};

const PIANO = `
#A|A01|Immobilizzazioni
01|Terreni e fabbricati|01 Fabbricati ad uso pastorale;02 Altri fabbricati;03 Terreni
02|Impianti e strumentazioni|01 Attrezzature;02 Impianti
03|Automezzi|01 Automezzi
04|Immobilizzazioni immateriali|01 Immobilizzazioni immateriali
#A|A02|Attività correnti
01|Cassa e Conti Correnti|01 Cassa;02 Banca;03 PayPal
02|Titoli e investimenti|01 Titoli e investimenti 1;02 Titoli e investimenti 2
#A|A03|Crediti diversi
01|Crediti verso enti diocesani|01 Crediti verso la Diocesi
02|Crediti verso altri enti|01 Crediti verso altri enti
03|Crediti verso privati|01 Crediti verso affittuari;02 Crediti verso privati
#PAT|PAT|Patrimonio
01|Patrimonio netto anni precedenti|01 Patrimonio netto anni precedenti
#P|P01|Mutui e finanziamenti
01|Mutui e finanziamenti|01 Mutui;02 Finanziamenti
#P|P02|Debiti diversi
01|Debiti v/ Fornitori|01 Fornitore 1;02 Fornitore 2;03 Fornitore 3
02|Debiti per Prestiti ricevuti|01 Prestito dalla Diocesi;02 Prestiti da privati;03 Prestiti diversi
03|Debiti con erario e previdenza|01 Erario;10 Previdenza
04|Debiti per tassa diocesana|01 Tassa sul bilancio;02 Tassa su eredità, lasciti, alienazioni
05|Debiti diversi|01 Cauzioni affittuari;02 Debiti per lavori in corso;03 Debiti diversi;04 Gestione teatro
#P|P03|Fondi ammortamento e accantonamento
01|Fondi ammortamento|01 Fondi ammortamento
02|Fondi accantonamento|01 Fondo TFR;02 Fondo per lavori;03 Altri accantonamenti
#PG|PG1|Debiti per partite di giro (collette)
01|Collette Ordinarie|01 Seminario diocesano;02 Carità del Papa;03 Quaresima di carità;04 Terra Santa;05 Migranti;06 Università Cattolica;07 Avvento di fraternità;08 Giornata missionaria;09 Infanzia missionaria;10 Lebbrosi
02|Collette Straordinarie|01 Colletta straordinaria
#E|E01|Entrate ordinarie
01|Offerte S.Messe|01 Legati;02 Intenzioni Messe
02|Collette|01 Collette domenicali;02 Collette feriali
03|Offerte per sacramenti|01 Battesimi;02 Prime Comunioni;03 Cresime;04 Matrimoni;05 Funerali
04|Offerte diverse|01 Benedizioni famiglie;02 Offerte per lumi votivi;03 Offerte per la Caritas parrocchiale;04 Offerte per uso locali;05 Offerte parrocchiani;10 Offerte diverse
05|Contributi ordinari|01 Contributi ordinari di altra natura
#E|E02|Entrate straordinarie
01|Raccolte per iniziative straordinarie|01 Offerte per lavori autorizzati dalla Diocesi;02 Offerte per progetti
02|Contributi straordinari|01 Contributi dalla Diocesi;02 Contributi da enti pubblici;03 Altri contributi straordinari
03|Eredità e Alienazioni|01 Eredità;02 Proventi da alienazioni
#E|E03|Proventi da patrimonio immobiliare
01|Proventi ordinari|01 Locazioni immobili
02|Proventi straordinari|01 Plusvalenze su vendita immobili
#E|E04|Proventi finanziari
01|Proventi finanziari ordinari|01 Interessi attivi
02|Proventi finanziari straordinari da Titoli|01 Plusvalenze su titoli
03|Proventi finanziari straordinari|01 Rimborsi assicurativi per sinistri;02 Abbuoni e sopravvenienze attive
#U|U01|Spese per il culto e l'esercizio pastorale
01|Spese per attività pastorali|01 Catechesi adulti e ragazzi;02 Formazione;03 Oratorio e campi scuola;04 Pellegrinaggi;05 Feste parrocchiali;06 Iniziative pastorali diverse
02|Spese per il culto|01 Vino, ostie, libri liturgici;02 Fiori;03 Cera votiva;04 Lavanderia paramenti sacri;05 Spese varie per il culto
03|Spese per attività caritative|01 Caritas parrocchiale;02 Erogazioni caritative in denaro;03 Erogazioni caritative in natura;04 Uscite per progetti;05 Integrazione versamento giornate
#U|U02|Stipendi, remunerazioni, rimborsi
01|Stipendi|01 Stipendi;02 Contributi previdenziali dipendenti;03 Assicurazioni dipendenti;04 Quota annuale TFR
02|Remunerazioni|01 Remunerazione parroco;02 Remunerazione vicari parrocchiali
03|Rimborsi|01 Rimborso vitto sacerdoti;02 Rimborso viaggi;03 Rimborsi spese diverse;04 Rimborsi a sacerdoti occasionali;05 Rimborso COLF;06 Rimborso sacerdote collaboratore
#U|U03|Onorari e compensi professionali
01|Onorari e compensi prof.li|01 Onorari e compensi;02 Ritenute d'acconto
#U|U04|Mobili e attrezzature
01|Acquisto mobili e strumentazioni|01 Mobili e attrezzature – acquisti
#U|U05|Manutenzioni
01|Manutenzioni Immobili|01 Manutenzioni immobili
02|Manutenzioni mobili - strumentazioni - automezzi|01 Manutenzione mobili, strumentazioni, automezzi
03|Manutenzione impianti|01 Manutenzione impianti
#U|U06|Assicurazioni
01|Assicurazioni|01 Assicurazioni fabbricati;02 Assicurazioni automezzi;03 Assicurazioni diverse
#U|U07|Locazioni passive
01|Locazioni passive|01 Locazioni passive
#U|U08|Spese diverse
01|Utenze|01 Energia elettrica;02 Gas e combustibili;03 Acqua;04 Telefono e internet
02|Spese diverse|01 Cancelleria;02 Materiale per pulizie;03 Fotocopie e stampati;04 Spese postali;05 Vuotatura fosse biologiche;06 Servizio vigilanza;07 Spese bancarie;08 Noleggi e licenze;09 Spese diverse;10 Software
#U|U09|Oneri e imposte
01|Imposte e tasse|01 IMU;02 IRES;03 IRAP;04 TARI;05 COSAP;06 Bolli;07 Imposta di registro;08 Imposte diverse
02|Oneri finanziari|01 Interessi passivi su scoperto c/c;02 Interessi passivi su mutui;03 Interessi passivi su prestiti ricevuti
03|Altri oneri ordinari|01 Tassa diocesana sul bilancio;02 Tassa diocesana su eredità e alienazioni;03 Oneri diversi
04|Altri oneri straordinari|01 Minusvalenze su titoli e immobili;02 Abbuoni e sopravvenienze passive
#U|U10|Ammortamenti / accantonamenti
01|Ammortamenti|01 Ammortamenti
02|Accantonamenti|01 Quota annuale fondo TFR;02 Accantonamenti per lavori;03 Accantonamenti diversi
`;

/** Gruppi (es. U08) e voci del Rendiconto (es. U08-01): fissi, decisi dalla Diocesi. */
export const GRUPPI = [];
export const VOCI = [];
const SOTTOCONTI_ESEMPIO = [];

(function leggiPiano() {
  let gruppo = null;
  for (const riga of PIANO.trim().split("\n")) {
    if (riga.startsWith("#")) {
      const [tipo, codice, nome] = riga.slice(1).split("|");
      gruppo = { codice, nome, tipo, voci: [] };
      GRUPPI.push(gruppo);
      continue;
    }
    const [c, nome, sotto] = riga.split("|");
    const voce = { codice: `${gruppo.codice}-${c}`, gruppo: gruppo.codice, nome, tipo: gruppo.tipo };
    gruppo.voci.push(voce);
    VOCI.push(voce);
    for (const s of sotto.split(";")) {
      SOTTOCONTI_ESEMPIO.push({ codice: `${voce.codice}-${s.slice(0, 2)}`, nome: s.slice(3), attivo: true });
    }
  }
})();

const VOCE_PER_CODICE = new Map(VOCI.map((v) => [v.codice, v]));
const GRUPPO_PER_CODICE = new Map(GRUPPI.map((g) => [g.codice, g]));

/** Sottoconti di partenza per una parrocchia nuova (copie, si possono modificare). */
export function sottocontiIniziali() {
  return SOTTOCONTI_ESEMPIO.map((s) => ({ ...s }));
}

export const voceDi = (codice) => codice.slice(0, 6);
export const gruppoDi = (codice) => codice.slice(0, 3);
export const voce = (codiceVoce) => VOCE_PER_CODICE.get(codiceVoce);
export const gruppo = (codiceGruppo) => GRUPPO_PER_CODICE.get(codiceGruppo);

/** Tipo (A, PAT, P, PG, E, U) di un sottoconto o di una voce. */
export function tipoDi(codice) {
  const g = GRUPPO_PER_CODICE.get(gruppoDi(codice));
  return g ? g.tipo : undefined;
}

/** Casse, banche e conti di pagamento: sottoconti di "A02-01 Cassa e conti correnti". */
export const isCassaBanca = (codice) => codice.startsWith("A02-01-");

// Ordine di cassa e banche negli elenchi: la cassa sempre per prima, poi nell'ordine in cui sono state
// aggiunte (o rimesse in uso), indicato dal campo "ordine". Per i conti salvati prima che esistesse,
// vale il numero del codice; PayPal (sottoconto già previsto, scelto più tardi) va dopo le banche.
const CASSA_PRINCIPALE = "A02-01-01", PAYPAL = "A02-01-03";
const chiaveCassa = (c) => (c.codice === CASSA_PRINCIPALE ? -1 : c.ordine ?? (c.codice === PAYPAL ? 100 : Number(c.codice.slice(7))));
export const confrontaCasse = (a, b) => chiaveCassa(a) - chiaveCassa(b) || a.codice.localeCompare(b.codice);

/** Casse e banche fra i conti dati, nell'ordine in cui la parrocchia le ha aggiunte. */
export const casseInOrdine = (conti) => [...conti].filter((c) => isCassaBanca(c.codice)).sort(confrontaCasse);

/** Valore di "ordine" per una banca aggiunta o rimessa in uso adesso: dopo tutte le altre. */
export const prossimoOrdineCassa = (conti) => Math.max(0, ...casseInOrdine(conti).map(chiaveCassa)) + 1;

/** Attività e Uscite crescono in Dare; tutti gli altri in Avere. */
export const crescInDare = (codice) => ["A", "U"].includes(tipoDi(codice));

/** Primo numero libero per un nuovo sottoconto della voce (es. "U08-02-11"). */
export function nuovoCodiceSottoconto(codiceVoce, codiciEsistenti) {
  const usati = new Set([...codiciEsistenti].filter((c) => c.startsWith(codiceVoce + "-")).map((c) => Number(c.slice(7))));
  for (let n = 1; n <= 99; n++) if (!usati.has(n)) return `${codiceVoce}-${String(n).padStart(2, "0")}`;
  return null;
}

/** Il codice è un sottoconto valido di una voce esistente? */
export const codiceValido = (codice) => /^[A-Z0-9]{3}-\d{2}-\d{2}$/.test(codice) && VOCE_PER_CODICE.has(voceDi(codice));
