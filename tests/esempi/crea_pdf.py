import zlib, sys
def pdf(contenuto, immagine=None):
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    res = b"<< /Font << /F1 5 0 R >> " + (b"/XObject << /Im1 6 0 R >> " if immagine else b"") + b">>"
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources " + res + b" /Contents 4 0 R >>")
    z = zlib.compress(contenuto)
    objs.append(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(z) + z + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    if immagine:
        w,h,data = immagine
        zi = zlib.compress(data)
        objs.append(b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 8 /Length %d /Filter /FlateDecode >>\nstream\n" % (w,h,len(zi)) + zi + b"\nendstream")
    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; offs=[]
    for i,o in enumerate(objs,1):
        offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs)+1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs)+1, x)
    return out
def esc(s): return s.replace("\\","\\\\").replace("(","\\(").replace(")","\\)").encode("cp1252")
righe = [
 (50,790,16,"Idraulica Prova S.r.l."),
 (50,772,10,"Via degli Esempi 12 - 50100 Firenze"),
 (50,758,10,"Partita IVA 05555555555"),
 (330,700,10,"Spett.le Parrocchia di San Esempio"),
 (330,686,10,"Codice fiscale 90000000000"),
 (50,640,14,"FATTURA"),
 (50,620,10,"Numero documento: 45/2026"),
 (250,620,10,"Data documento: 28/10/2026"),
 (50,580,10,"Descrizione"), (420,580,10,"Importo"),
 (50,562,10,"Riparazione caldaia locali parrocchiali e sostituzione valvola"), (420,562,10,"250,00"),
 (50,500,10,"Imponibile"), (420,500,10,"250,00"),
 (50,484,10,"IVA 22%"), (420,484,10,"55,00"),
 (50,466,11,"Totale documento"), (420,466,11,"305,00"),
 (50,420,10,"Modalita' di pagamento: bonifico bancario"),
 (50,404,10,"Data scadenza: 27/11/2026"),
]
c = b"".join(b"BT /F1 %d Tf %d %d Td (" % (s,x,y) + esc(t) + b") Tj ET\n" for x,y,s,t in righe)
open(sys.argv[1]+"/fattura-idraulico.pdf","wb").write(pdf(c))
w=h=60; data=bytes((x*7+y*3)%256 for y in range(h) for x in range(w))
open(sys.argv[1]+"/fattura-scansione.pdf","wb").write(pdf(b"q 400 0 0 400 100 300 cm /Im1 Do Q\n", (w,h,data)))
