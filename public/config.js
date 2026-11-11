// Toute la configuration du club est ici. Après modification : npx wrangler deploy.
// Les textes s'écrivent entre apostrophes ; s'ils en contiennent une, utiliser des guillemets ("L'Échiquier").
window.CONFIG = {
  // Saison : à changer chaque rentrée, avec la liste des groupes (les anciennes données sont alors écartées)
  saison: '2026-2027',
  // Nom de l'appli (titre de la page et nom une fois installée sur le téléphone)
  appli: 'PV FFE Domloup',
  club: {
    // Début du nom des équipes dans les classements FFE (« Domloup » pour « Domloup 3 ») ; affiché dans l'en-tête
    nom: 'Domloup',
    nomComplet: 'Échiquier Domloupéen',
    // Fiche club : https://echecs.asso.fr/ListeEquipes.aspx?ClubRef=REF
    ref: 1918,
    // Image du dossier public/ affichée dans l'en-tête ('' pour ne pas en afficher)
    logo: 'logo.png',
  },
  // Couleurs : bandeau du haut, couleur d'accent (soulignements, équipes du club), boutons principaux
  couleurs: { entete: '#161616', accent: '#f6c500', bouton: '#0070c0' },
  // Groupes suivis (https://echecs.asso.fr/Equipes.aspx?Groupe=ID). Les équipes du club,
  // leurs identifiants et ceux des adversaires sont retrouvés automatiquement.
  groupes: [31, 1710, 3291, 3290, 1708, 2970],
  // Nombre d'échiquiers proposé par défaut sur la feuille de match (modifiable dans la feuille)
  echiquiers: 5,
};
