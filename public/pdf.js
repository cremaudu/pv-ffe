/* Feuille de match papier (modèle EquipesPV.aspx de la FFE) en PDF A4 paysage, sans dépendance.
   Polices standard Helvetica : rien à embarquer, mais il faut leurs largeurs (caractères 32 à 126) pour centrer. */
const LARGEURS = {
  F1: '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number),
  F2: '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number),
};
LARGEURS.F3 = LARGEURS.F1; // oblique : mêmes largeurs

// Caractères hors Latin-1 présents dans l'encodage WinAnsi des PDF
const WINANSI = { '€': 0x80, '…': 0x85, 'Œ': 0x8c, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Ÿ': 0x9f, 'Š': 0x8a, 'š': 0x9a, 'Ž': 0x8e, 'ž': 0x9e };

function pdfFeuille({ date, lieu, competition, ronde, gauche, droite, joueursG, joueursD, echiquiers, pied }) {
  const W = 842, H = 595, K = 0.748; // K : points par pixel de la page FFE (1000 px de large)
  const X0 = (W - 1000 * K) / 2, HL = 22.5;
  const ops = ['1.2 w'];
  const normal = (s) => String(s ?? '').normalize('NFC');
  const octets = (s) => [...normal(s)].map((c) => {
    const n = WINANSI[c] ?? c.codePointAt(0);
    return n > 255 ? '?' : /[()\\]/.test(c) ? '\\' + c : String.fromCharCode(n);
  }).join('');
  const largeur = (s, f, t, esp) => [...normal(s)].reduce((l, c) => l + (LARGEURS[f][c.normalize('NFD').charCodeAt(0) - 32] ?? 556) * t / 1000 + esp, 0);
  // Texte placé dans [x, x + l] ; y = ligne de base depuis le haut de la page. Trop long : réduit pour tenir.
  const texte = (s, x, l, y, { f = 'F1', t = 10, esp = 0, al = 'c' } = {}) => {
    if (!s) return;
    let w = largeur(s, f, t, esp);
    if (w > l - 4) { const r = (l - 4) / w; t *= r; esp *= r; w = l - 4; }
    const px = al === 'c' ? x + (l - w + esp) / 2 : x + 3;
    ops.push(`BT /${f} ${t.toFixed(2)} Tf ${esp.toFixed(2)} Tc ${px.toFixed(2)} ${(H - y).toFixed(2)} Td (${octets(s)}) Tj ET`);
  };
  const cadre = (x, y, l, h) => ops.push(`${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${l.toFixed(2)} ${h.toFixed(2)} re S`);
  const ligne = (x, y, largeurs, textes, styles = [], h = HL) => largeurs.forEach((px, i) => {
    const l = px * K, st = styles[i] ?? styles[0] ?? {};
    cadre(x, y, l, h);
    texte(textes[i], x, l, y + h / 2 + (st.t ?? 10) * 0.36, st);
    x += l;
  });

  const titre = { f: 'F2', t: 19, esp: 5 }, info = { f: 'F2', t: 11.5, esp: 1.5 }, gras = { f: 'F2', t: 9.5 };
  texte('FEDERATION FRANCAISE DES ECHECS', 0, W, 52, titre);
  texte('FEUILLE DE MATCH', 0, W, 80, titre);
  const tete = [115, 385, 390, 110];
  ligne(X0, 92, tete, ['DATE', 'LIEU', 'COMPETITION', 'RONDE'], [info]);
  ligne(X0, 92 + HL, tete, [date, lieu, competition, String(ronde)], [info]);

  const col = [30, 265, 72, 60, 32, 31]; // 490 px par équipe, 20 px entre les deux
  const Y = 92 + 2 * HL + 8;
  let y;
  [[X0, gauche, joueursG, 'IMPAIRS', 0], [X0 + 510 * K, droite, joueursD, 'PAIRS', 1]].forEach(([x, equipe, joueurs, parite, cote]) => {
    y = Y;
    ligne(x, y, [459, 31], ['CLUB AYANT LES BLANCS SUR LES ECHIQUIERS ' + parite, 'S'], [gras]);
    ligne(x, (y += HL), [459, 31], [equipe, ''], [{ ...info, al: 'g' }]);
    ligne(x, (y += HL), col, ['', 'Nom et Prénom', 'Code FFE', 'Elo', 'C*', 'R'], [gras, { ...gras, al: 'g' }, gras, gras, gras, gras]);
    for (let i = 0; i < echiquiers; i++) {
      const j = joueurs[i] ?? {};
      ligne(x, (y += HL), col, [`${i + 1} ${(i + cote) % 2 ? 'N' : 'B'}`, j.nom, j.code, j.elo], [gras, { al: 'g' }, {}, {}]);
    }
    ligne(x, (y += HL), [490], ['GAIN : 1 - PERTE : 0 - NULL (pas comptabilisé) - Forfait 0 ou -1 suivant le cas (cf. Livre FFE)'], [{ t: 7.5, al: 'g' }], 14);
  });

  // Les noms et signatures s'écrivent à la main à droite des libellés
  y += 14;
  const tiers = [X0, X0 + 380 * K, X0 + 690 * K];
  ['Nom du Capitaine :', "Nom de l'Arbitre :", 'Nom du Capitaine :'].forEach((s, i) => texte(s, tiers[i], 300, y + 20, { al: 'g' }));
  tiers.forEach((x) => texte('Signature :', x, 200, y + 52, { al: 'g' }));
  y += 85;
  texte("Le nom de l'Arbitre doit être inscrit avant le début du match", X0, 400 * K, y, { t: 9 });
  texte('C* : contrôle des licences', X0 + 400 * K, 200 * K, y, { t: 9 });
  texte("L'Arbitre doit cocher cette case afin d'attester le contrôle", X0 + 600 * K, 400 * K, y, { t: 9 });
  (pied ?? []).forEach((s, i) => texte(s, X0, 1000 * K, y + 18 + 13 * i, { f: 'F3' }));

  // Assemblage du fichier : 1 caractère = 1 octet
  const flux = ops.join('\n');
  const police = (n) => `<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`;
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>`,
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    police('Helvetica'), police('Helvetica-Bold'), police('Helvetica-Oblique'),
  ];
  let pdf = '%PDF-1.4\n';
  const pos = objets.map((o, i) => { const p = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return p; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([Uint8Array.from(pdf, (c) => c.charCodeAt(0))], { type: 'application/pdf' });
}

// iPhone/iPad : feuille de partage (Imprimer, Fichiers…). Android : téléchargement. Ordinateur : nouvel onglet.
async function ouvrirPdf(blob, nom) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (ios) {
    const files = [new File([blob], nom, { type: blob.type })];
    if (navigator.canShare?.({ files })) {
      try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 600000);
  if (!/Android/.test(navigator.userAgent) && window.open(url, '_blank')) return;
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.append(a); a.click(); a.remove();
}
