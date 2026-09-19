// Repris à l'identique partout où l'app rappelle le modèle de confidentialité
// (accueil, ajout de cadeau, personnes, partage, bas de la liste) : toutes
// les listes sont chiffrées au repos côté serveur (voir
// worker/crypto.ts), mais le seul contrôle d'accès reste le code à 6
// caractères — quiconque l'obtient peut voir et modifier la liste.
export const PRIVACY_HINT =
  "Les données sont chiffrées sur le serveur, mais toute personne avec le code peut voir et modifier la liste normalement.";
