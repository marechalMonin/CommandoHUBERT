/* Règles de désamorçage du GCA (mod VRT EOD Hand Entry), reprises du terminal de la section Génie.
   ─────────────────────────────────────────────────────────────────────
   C'est LE fichier à modifier si les règles changent.

   IED CÂBLE : chaque fil (rouge, bleu, jaune, noir) est dans l'un des 4 états :
     B = Bon état      E = Effiloché      M = Mal branché / desserré      U = Brûlé
   Une règle = { n, texte, couper, test }
     n      : numéro de la règle
     texte  : condition affichée à l'opérateur
     couper : "rouge", "bleu", "jaune", "noir" — ou null pour « bonne chance »
     test   : condition ; f.rouge, f.bleu, f.jaune, f.noir valent "B", "E", "M" ou "U"
   Toutes les règles qui correspondent sont affichées.
   ───────────────────────────────────────────────────────────────────── */
(() => {
  // Nombre de fils de la liste qui sont dans l'état donné.
  const nb = (fils, etat) => fils.filter(x => x === etat).length;

  window.IED_ETATS = {
    B: "Good Condition / Bon état",
    E: "Frayed / Effiloché",
    M: "Loose / Mal branché ou desserré",
    U: "Scorched / Brûlé"
  };

  window.IED_FILS = {
    rouge: "ROUGE 🔴",
    bleu: "BLEU 🔵",
    jaune: "JAUNE 🟡",
    noir: "NOIR ⚫"
  };

  window.IED_REGLES_CABLE = [
    { n: 1, couper: "noir", texte: "Rouge effiloché + Jaune desserré",
      test: f => f.rouge === "E" && f.jaune === "M" },
    { n: 2, couper: "rouge", texte: "Rouge non desserré + au moins 2 fils en bon état parmi Bleu / Jaune / Noir",
      test: f => f.rouge !== "M" && nb([f.bleu, f.jaune, f.noir], "B") >= 2 },
    { n: 3, couper: "jaune", texte: "Bleu brûlé + Jaune en bon état",
      test: f => f.bleu === "U" && f.jaune === "B" },
    { n: 4, couper: "bleu", texte: "Noir desserré + au moins 2 fils effilochés parmi Rouge / Bleu / Jaune",
      test: f => f.noir === "M" && nb([f.rouge, f.bleu, f.jaune], "E") >= 2 },
    { n: 5, couper: "rouge", texte: "Rouge effiloché + Bleu desserré + Jaune en bon état + Noir desserré",
      test: f => f.rouge === "E" && f.bleu === "M" && f.jaune === "B" && f.noir === "M" },
    { n: 6, couper: "bleu", texte: "Rouge desserré + Noir en bon état",
      test: f => f.rouge === "M" && f.noir === "B" },
    { n: 7, couper: "jaune", texte: "Exactement 3 fils brûlés",
      test: f => nb([f.rouge, f.bleu, f.jaune, f.noir], "U") === 3 },
    { n: 8, couper: "noir", texte: "Rouge desserré + Jaune effiloché + Bleu en bon état + Noir brûlé",
      test: f => f.rouge === "M" && f.jaune === "E" && f.bleu === "B" && f.noir === "U" },
    { n: 9, couper: "noir", texte: "Aucun fil en bon état",
      test: f => nb([f.rouge, f.bleu, f.jaune, f.noir], "B") === 0 },
    { n: 10, couper: "bleu", texte: "Rouge brûlé + exactement 1 fil desserré parmi Bleu / Jaune / Noir",
      test: f => f.rouge === "U" && nb([f.bleu, f.jaune, f.noir], "M") === 1 },
    { n: 11, couper: "noir", texte: "Rouge en bon état + Jaune brûlé",
      test: f => f.rouge === "B" && f.jaune === "U" },
    { n: 12, couper: "rouge", texte: "Bleu effiloché + Noir brûlé",
      test: f => f.bleu === "E" && f.noir === "U" },
    { n: 13, couper: "jaune", texte: "Rouge desserré + au moins 2 fils brûlés parmi Bleu / Jaune / Noir + Noir non effiloché",
      test: f => f.rouge === "M" && nb([f.bleu, f.jaune, f.noir], "U") >= 2 && f.noir !== "E" },
    { n: 14, couper: "bleu", texte: "Rouge en bon état + Bleu pas en bon état + Jaune effiloché + Noir desserré",
      test: f => f.rouge === "B" && f.bleu !== "B" && f.jaune === "E" && f.noir === "M" },
    { n: 15, couper: "rouge", texte: "Jaune en bon état + Bleu desserré + Rouge non effiloché",
      test: f => f.jaune === "B" && f.bleu === "M" && f.rouge !== "E" },
    { n: 16, couper: "jaune", texte: "Rouge effiloché + Bleu desserré + Jaune brûlé",
      test: f => f.rouge === "E" && f.bleu === "M" && f.jaune === "U" },
    { n: 17, couper: null, texte: "Tous les fils en bon état",
      test: f => nb([f.rouge, f.bleu, f.jaune, f.noir], "B") === 4 }
  ];

  /* IED TUYAUX : somme = PVC + LOT + REV + switchs allumés + correction */
  window.IED_TUYAUX = {
    rev: { A: 0, B: 1, C: 2 },
    switchs: { A: 1, B: 2, C: 4 },
    correction: -8
  };
})();
