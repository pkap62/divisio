import { test, uguale, vero } from "./mini.js";
import { parseEuro, formatEuro, formatDecimale, formatUNIO } from "../js/dominio/importi.js";

test("importi: lettura dei modi comuni di scrivere un importo", () => {
  uguale(parseEuro("50"), 5000);
  uguale(parseEuro("50,5"), 5050);
  uguale(parseEuro("50,05"), 5005);
  uguale(parseEuro("1.250,50"), 125050);
  uguale(parseEuro("1250.50"), 125050);
  uguale(parseEuro("1.250"), 125000, "punto delle migliaia");
  uguale(parseEuro("1.250.000"), 125000000);
  uguale(parseEuro("€ 12,30"), 1230);
  uguale(parseEuro(" 7 "), 700);
  uguale(parseEuro("-5"), -500);
  uguale(parseEuro(""), 0);
});

test("importi: testi non validi vengono rifiutati", () => {
  for (const s of ["abc", "1,234", "12,3,4", "1..2", "5 euro"]) vero(Number.isNaN(parseEuro(s)), `«${s}» doveva essere rifiutato`);
});

test("importi: niente errori di arrotondamento (1,005 non esiste, 0,1 + 0,2 = 0,30)", () => {
  uguale(parseEuro("0,1") + parseEuro("0,2"), 30);
  uguale(parseEuro("1,15"), 115);
  uguale(parseEuro("4,35"), 435);
});

test("importi: scrittura in euro", () => {
  uguale(formatEuro(125050), "1.250,50 €");
  uguale(formatEuro(5), "0,05 €");
  uguale(formatEuro(0), "0,00 €");
  uguale(formatEuro(-1000), "-10,00 €");
  uguale(formatEuro(123456789), "1.234.567,89 €");
  uguale(formatDecimale(125050), "1250,50");
});

test("importi: formato dei CSV di UNIO", () => {
  uguale(formatUNIO(300250), "3002,5");
  uguale(formatUNIO(-300259), "-3002,59");
  uguale(formatUNIO(4674), "46,74");
  uguale(formatUNIO(485100), "4851");
  uguale(formatUNIO(0), "0");
  uguale(formatUNIO(10000), "100");
});
