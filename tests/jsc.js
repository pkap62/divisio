// Punto di partenza per il motore JavaScript del Mac (jsc). Vedi esegui.sh.
import { esegui } from "./tutti.js";
esegui((t) => print(t)).then((ok) => { if (!ok) throw new Error("Alcuni test sono falliti"); });
