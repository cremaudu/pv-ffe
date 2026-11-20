// Configuration du calendrier. Après modification : npx wrangler deploy -c calendrier/wrangler.jsonc
// Les textes s'écrivent entre apostrophes ; s'ils en contiennent une, utiliser des guillemets ("L'Échiquier").
window.CONFIG = {
  // Nom de l'appli (titre de la page et nom une fois installée sur le téléphone)
  appli: 'Calendrier FFE',
  // Ligues affichées, par leur code FFE. Codes possibles : ARA, BFC, BRE, CRS, CVL, EST, HDF, IDF, NAQ, NOR, OCC, PAC, PDL
  ligues: ['BRE', 'PDL', 'NOR'],
  // Couleurs : bandeau du haut, couleur d'accent, liens et boutons
  couleurs: { entete: '#161616', accent: '#f6c500', bouton: '#0070c0' },
};
