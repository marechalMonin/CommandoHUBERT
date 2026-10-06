/* Comptes de l'espace membres.
   Les mots de passe ne sont PAS dans ce fichier : seules leurs empreintes (PBKDF2-SHA256) y figurent.
   Pour ajouter un compte ou changer un mot de passe : ouvrir outil-identifiants.html,
   générer la ligne, puis la coller (ou remplacer l'ancienne) dans la liste ci-dessous.
   roles possibles : "medecin" (page Médecins), "gca" (page GCA). */
window.COMPTES = [
  {"identifiant":"medecin","roles":["medecin"],"sel":"28f4bbd43952fedd4e1fff54d3a756bf","empreinte":"133163fa3a5d05441c798e54d8f44028f726399a4be2da8b5ad2141b79aa90f6"},
  {"identifiant":"gca","roles":["gca"],"sel":"0132be3352c8c31a5c6f6d5b95d78443","empreinte":"30039e83f0c27c14a4c8243c16c29bf3e03c7b392792a26e9c83baced11fa3af"},
  {"identifiant":"etat-major","roles":["medecin","gca"],"sel":"a791f6fdacf4b65c836b5a7988b2ebd8","empreinte":"433701741a3c0678ba8ba3c9deb9f72ef7217fd15ea9d92d609522218322c79d"}
];