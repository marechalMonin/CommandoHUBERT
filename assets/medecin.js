/* Page Régiment médical : dossiers médicaux RP et suivi des visites.
   Les données restent dans le navigateur (localStorage) ; export / import en .json. */
(() => {
  const session = Auth.session();
  if (!session) return;
  Auth.barre("medecin");

  const CLE = "ch_dossiers_medicaux";

  /* ---------- Listes déroulantes (modifiables) ---------- */
  const OUI_NON = ["OUI", "NON"];
  const CONDITIONS = ["BONNE", "MOYENNE", "MAUVAISE"];
  const SANGS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "INCONNU"];
  const SUIVI = ["FAIT", "À FAIRE", "NON CONCERNÉ"];
  const BILANS = ["RAS", "ANOMALIE", "À REFAIRE"];
  const MOTIFS = ["Visite de contrôle", "Rappel", "Blessure au combat", "Retour d'OPEX", "Suivi psychologique", "Autre"];
  const GRADES = ["Recrue", "Mousse", "Matelot", "Matelot Breveté", "Quartier Maitre 2nde Classe",
    "Quartier Maitre 1ère Classe", "Second Maitre", "Maitre", "Premier Maitre", "Maitre Principal", "Major",
    "Enseigne de Vaisseau 1ère Classe", "Lieutenant de Vaisseau", "Capitaine de Corvette", "Vice Amiral", "Amiral"];
  const POLES = ["Aucun", "Génie", "Logistique", "Blindé", "Aéro", "Médic", "GAS", "Police Militaire"];
  const APTITUDES = {
    "APTE": "vert",
    "APTE AVEC RESTRICTIONS": "jaune",
    "INAPTE TEMPORAIRE": "rouge",
    "INAPTE": "rouge"
  };
  const NON_EVALUE = "NON ÉVALUÉ";
  const LISTE_APT = Object.keys(APTITUDES);

  /* ---------- Structure du dossier ----------
     Un champ = [clé, libellé, type]. Type : absent = texte court, "long" = zone de texte,
     "date", un tableau = liste déroulante, { libre: [...] } = texte avec suggestions. */
  const SECTIONS = [
    { titre: "📌 Informations du joueur", champs: [
      ["age", "Âge RP"], ["sexe", "Sexe RP", ["MASCULIN", "FÉMININ"]],
      ["nationalite", "Nationalité RP"], ["sang", "Groupe sanguin", SANGS],
      ["signes", "Signes particuliers"], ["vaccins", "Vaccins à jour", OUI_NON],
      ["poids", "Poids RP"], ["taille", "Taille RP"]] },
    { titre: "🚑 Informations médicales", champs: [
      ["allergies", "Allergies", "long"], ["traitements", "Traitements en cours", "long"],
      ["antMedicaux", "Antécédents médicaux", "long"], ["antChirurgicaux", "Antécédents chirurgicaux", "long"],
      ["handicap", "Handicap / particularité physique", "long"], ["maladies", "Maladies connues", "long"]] },
    { titre: "🩸 État de santé RP", champs: [
      ["physique", "Condition physique", CONDITIONS], ["mentale", "Condition mentale", CONDITIONS],
      ["addictions", "Addictions"], ["phobies", "Phobies"]] },
    { titre: "📞 Contact d'urgence RP", champs: [
      ["urgNom", "Nom du contact"], ["urgLien", "Lien avec la personne"], ["urgNumero", "Numéro / Fréquence radio"]] },
    { titre: "🪖 Informations militaires / terrain", champs: [
      ["grade", "Grade", GRADES], ["pole", "Pôle / Section", POLES],
      ["specialite", "Spécialité"], ["restrictions", "Restrictions opérationnelles", "long"]] },
    { titre: "📝 Observations médicales", champs: [
      ["observations", "Observations", "long"]] },
    { titre: "✅ Validation de la première consultation", champs: [
      ["valMedecin", "Médecin", { libre: [] }], ["valDate", "Date", "date"],
      ["valAptitude", "Aptitude", LISTE_APT], ["valSignature", "Signature Médecin", { libre: [] }]] }
  ];

  const SECTIONS_VISITE = [
    { titre: "🗓️ Suivi", champs: [
      ["date", "Date", "date"], ["motif", "Type / Motif", { libre: MOTIFS }],
      ["vaccination", "Vaccination", SUIVI], ["bilan", "Bilan sanguin", SUIVI],
      ["irm", "IRM", SUIVI], ["autre", "Autre"]] },
    { titre: "💉 Vaccination / Examens / Interventions", champs: [
      ["tetanos", "Tétanos", OUI_NON], ["hepatiteB", "Hépatite B", OUI_NON],
      ["rappel", "Rappel effectué", OUI_NON], ["bilanResultat", "Bilan sanguin (résultat)", BILANS],
      ["irmDetail", "IRM (compte-rendu)", "long"], ["bloc", "Bloc opératoire", "long"],
      ["blessures", "Blessures au combat", "long"], ["psy", "Suivi psychologique", "long"],
      ["compteRendu", "Compte-rendu / Observations", "long"]] },
    { titre: "✅ Conclusion", champs: [
      ["aptitude", "Aptitude après visite", LISTE_APT], ["prochain", "Prochain contrôle", "date"],
      ["signature", "Signature Médecin", { libre: [] }]] }
  ];

  const cles = sections => sections.flatMap(s => s.champs.map(c => c[0]));
  const CLES_DOSSIER = ["pseudoRp", "pseudoArma", ...cles(SECTIONS)];
  const CLES_VISITE = cles(SECTIONS_VISITE);

  /* ---------- Outils ---------- */
  const $ = id => document.getElementById(id);
  const ech = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const aujourdhui = () => new Date().toLocaleDateString("fr-CA");
  const dateFr = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  };
  const pastille = apt => '<span class="pastille ' + (APTITUDES[apt] || "") + '">' + ech(apt) + "</span>";

  /* ---------- Données ---------- */
  let dossiers = charger();
  let courant = null;

  function charger() {
    try {
      const d = JSON.parse(localStorage.getItem(CLE));
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  }

  function sauver() {
    dossiers.sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true }));
    try {
      localStorage.setItem(CLE, JSON.stringify(dossiers));
    } catch (e) {
      alert("Enregistrement impossible dans ce navigateur : " + e.message);
    }
  }

  function prochainNumero() {
    const max = dossiers.reduce((m, d) => Math.max(m, parseInt((/^MED-(\d+)$/.exec(d.id) || [])[1], 10) || 0), 0);
    return "MED-" + String(max + 1).padStart(3, "0");
  }

  // Visites dans l'ordre chronologique (Visite 1 = la plus ancienne).
  const visitesDe = d => [...(d.visites || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  function aptitude(d) {
    const derniere = visitesDe(d).filter(v => v.aptitude).pop();
    return (derniere && derniere.aptitude) || d.valAptitude || NON_EVALUE;
  }

  // Noms déjà utilisés comme médecin / signature, proposés à la saisie.
  function medecinsConnus() {
    const noms = new Set([session.identifiant]);
    for (const d of dossiers) {
      [d.valMedecin, d.valSignature, ...(d.visites || []).map(v => v.signature)].forEach(n => n && noms.add(n));
    }
    return [...noms];
  }

  /* ---------- Formulaires générés depuis la structure ---------- */
  function champHtml(prefixe, [cle, libelle, type]) {
    const id = prefixe + cle;
    let saisie;
    if (Array.isArray(type)) {
      saisie = '<select id="' + id + '" name="' + cle + '"><option value=""></option>' +
        type.map(o => "<option>" + ech(o) + "</option>").join("") + "</select>";
    } else if (type === "long") {
      saisie = '<textarea id="' + id + '" name="' + cle + '" maxlength="2000"></textarea>';
    } else if (type === "date") {
      saisie = '<input id="' + id + '" name="' + cle + '" type="date">';
    } else if (type && type.libre) {
      const options = type.libre.length ? type.libre : medecinsConnus();
      saisie = '<input id="' + id + '" name="' + cle + '" maxlength="80" list="' + id + '-liste" autocomplete="off">' +
        '<datalist id="' + id + '-liste">' + options.map(o => '<option value="' + ech(o) + '">').join("") + "</datalist>";
    } else {
      saisie = '<input id="' + id + '" name="' + cle + '" maxlength="160">';
    }
    return '<div class="champ' + (type === "long" ? " large" : "") + '"><label for="' + id + '">' + ech(libelle) + "</label>" + saisie + "</div>";
  }

  const sectionsHtml = (prefixe, sections) => sections.map(s =>
    '<h3 class="titre-section">' + ech(s.titre) + '</h3><div class="grille-form">' +
    s.champs.map(c => champHtml(prefixe, c)).join("") + "</div>").join("");

  /* ---------- Liste ---------- */
  function afficherListe() {
    const q = $("recherche").value.trim().toLowerCase();
    const filtre = $("filtreAptitude").value;
    const visibles = dossiers
      .filter(d => !filtre || aptitude(d) === filtre)
      .filter(d => !q || [d.id, d.pseudoRp, d.pseudoArma, d.grade, d.pole].join(" ").toLowerCase().includes(q));

    $("liste").innerHTML = visibles.map(d =>
      '<li><button type="button" data-id="' + ech(d.id) + '"' + (d.id === courant ? ' class="actif"' : "") + ">" +
      "<span><strong>" + ech(d.id) + " — " + ech(d.pseudoRp) + "</strong><small>" +
      ech(d.pseudoArma || "—") + "</small></span>" + pastille(aptitude(d)) + "</button></li>").join("");

    $("listeVide").hidden = visibles.length > 0;
    $("listeVide").textContent = dossiers.length ? "Aucun dossier ne correspond." : "Aucun dossier pour le moment.";
  }

  /* ---------- Détail ---------- */
  function infoHtml(d, [cle, libelle, type]) {
    const valeur = type === "date" ? dateFr(d[cle]) : d[cle];
    return '<div class="info' + (type === "long" ? " large" : "") + '"><dt>' + ech(libelle) + "</dt><dd>" + (ech(valeur) || "—") + "</dd></div>";
  }

  // N'affiche que les champs renseignés d'une visite, pour garder des cartes lisibles.
  function visiteHtml(v, numero) {
    const lignes = SECTIONS_VISITE.flatMap(s => s.champs)
      .filter(c => !["date", "motif", "aptitude", "signature"].includes(c[0]) && v[c[0]])
      .map(c => "<p><b>" + ech(c[1]) + " :</b> " + ech(c[2] === "date" ? dateFr(v[c[0]]) : v[c[0]]) + "</p>").join("");
    return '<article class="visite"><div class="visite-tete"><div><strong>Visite ' + numero + " — " + (dateFr(v.date) || "sans date") +
      (v.motif ? " — " + ech(v.motif) : "") + "</strong>" +
      (v.signature ? '<div class="muted" style="font-size:.88rem;margin-top:3px">Signature : ' + ech(v.signature) + "</div>" : "") +
      "</div>" + (v.aptitude ? pastille(v.aptitude) : "") + "</div>" + lignes +
      '<div class="actions" style="margin-top:10px">' +
      '<button class="btn btn-secondary btn-petit" data-action="modifier-visite" data-visite="' + ech(v.id) + '">Modifier</button>' +
      '<button class="btn btn-danger btn-petit" data-action="supprimer-visite" data-visite="' + ech(v.id) + '">Supprimer</button>' +
      "</div></article>";
  }

  function afficherDetail() {
    const d = dossiers.find(x => x.id === courant);
    if (!d) {
      courant = null;
      $("detail").innerHTML = '<div class="vide">Sélectionnez un dossier dans la liste, ou créez-en un nouveau.</div>';
      return;
    }
    const visites = visitesDe(d);

    $("detail").innerHTML =
      '<div class="entete-page" style="margin-bottom:0"><div>' +
      '<span class="pastille">' + ech(d.id) + "</span> " + pastille(aptitude(d)) +
      '<h2 style="margin:10px 0 4px">' + ech(d.pseudoRp) + "</h2>" +
      '<p>Pseudo Arma : ' + (ech(d.pseudoArma) || "—") + "</p></div>" +
      '<div class="actions">' +
      '<button class="btn btn-secondary btn-petit" data-action="modifier-dossier">Modifier</button>' +
      '<button class="btn btn-secondary btn-petit" data-action="imprimer">Imprimer</button>' +
      '<button class="btn btn-danger btn-petit" data-action="supprimer-dossier">Supprimer</button></div></div>' +

      SECTIONS.map(s => '<h3 class="titre-section">' + ech(s.titre) + '</h3><dl class="infos">' +
        s.champs.map(c => infoHtml(d, c)).join("") + "</dl>").join("") +

      '<div class="entete-page" style="margin:0"><h3 class="titre-section" style="flex:1;margin:0">🗓️ Suivi des visites</h3>' +
      '<div class="actions"><button class="btn btn-primary btn-petit" data-action="nouvelle-visite">+ Nouvelle visite</button></div></div>' +
      (visites.length ? visites.map((v, i) => visiteHtml(v, i + 1)).reverse().join("")
        : '<div class="vide">Aucune visite de suivi enregistrée.</div>') +

      (d.modifieLe ? '<p class="muted" style="font-size:.85rem;margin:16px 0 0">Dernière sauvegarde : ' +
        dateFr(d.modifieLe) + (d.modifiePar ? " par " + ech(d.modifiePar) : "") + "</p>" : "");
  }

  function rafraichir() { afficherListe(); afficherDetail(); }

  function enregistrer(d) {
    d.modifieLe = aujourdhui();
    d.modifiePar = session.identifiant;
    sauver();
    rafraichir();
  }

  /* ---------- Dossier : création / modification ---------- */
  let dossierEdite = null;

  function ouvrirDossier(d) {
    dossierEdite = d ? d.id : null;
    $("titreDossier").textContent = d ? "Dossier " + d.id : "Nouveau dossier — " + prochainNumero();
    $("champsDossier").innerHTML =
      '<div class="grille-form">' +
      '<div class="champ"><label for="d_pseudoRp">Pseudo RP *</label><input id="d_pseudoRp" name="pseudoRp" required maxlength="60"></div>' +
      '<div class="champ"><label for="d_pseudoArma">Pseudo Arma</label><input id="d_pseudoArma" name="pseudoArma" maxlength="60"></div>' +
      "</div>" + sectionsHtml("d_", SECTIONS);
    const form = $("formDossier");
    if (d) CLES_DOSSIER.forEach(c => { form.elements[c].value = d[c] || ""; });
    $("dlgDossier").showModal();
  }

  $("formDossier").addEventListener("submit", e => {
    const form = e.target;
    let d = dossiers.find(x => x.id === dossierEdite);
    if (!d) {
      d = { id: prochainNumero(), visites: [] };
      dossiers.push(d);
    }
    CLES_DOSSIER.forEach(c => { d[c] = form.elements[c].value.trim(); });
    courant = d.id;
    enregistrer(d);
  });

  /* ---------- Visite : création / modification ---------- */
  let visiteEditee = null;

  function ouvrirVisite(d, v) {
    visiteEditee = v ? v.id : null;
    $("titreVisite").textContent = (v ? "Modifier la visite" : "Nouvelle visite") + " — " + d.id + " " + d.pseudoRp;
    $("champsVisite").innerHTML = sectionsHtml("v_", SECTIONS_VISITE);
    const form = $("formVisite");
    if (v) CLES_VISITE.forEach(c => { form.elements[c].value = v[c] || ""; });
    else {
      form.elements.date.value = aujourdhui();
      form.elements.signature.value = session.identifiant;
    }
    $("dlgVisite").showModal();
  }

  $("formVisite").addEventListener("submit", e => {
    const form = e.target;
    const d = dossiers.find(x => x.id === courant);
    if (!d) return;
    d.visites = d.visites || [];
    let v = d.visites.find(x => x.id === visiteEditee);
    if (!v) {
      v = { id: uid() };
      d.visites.push(v);
    }
    CLES_VISITE.forEach(c => { v[c] = form.elements[c].value.trim(); });
    enregistrer(d);
  });

  document.querySelectorAll("[data-fermer]").forEach(b =>
    b.addEventListener("click", () => b.closest("dialog").close()));

  /* ---------- Actions ---------- */
  $("liste").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    courant = b.dataset.id;
    rafraichir();
  });

  $("detail").addEventListener("click", e => {
    const b = e.target.closest("button[data-action]");
    const d = dossiers.find(x => x.id === courant);
    if (!b || !d) return;
    const v = (d.visites || []).find(x => x.id === b.dataset.visite);

    switch (b.dataset.action) {
      case "modifier-dossier": ouvrirDossier(d); break;
      case "imprimer": window.print(); break;
      case "nouvelle-visite": ouvrirVisite(d, null); break;
      case "modifier-visite": if (v) ouvrirVisite(d, v); break;
      case "supprimer-dossier":
        if (confirm("Supprimer définitivement le dossier " + d.id + " (" + d.pseudoRp + ") et toutes ses visites ?")) {
          dossiers = dossiers.filter(x => x.id !== d.id);
          courant = null;
          sauver();
          rafraichir();
        }
        break;
      case "supprimer-visite":
        if (v && confirm("Supprimer la visite du " + (dateFr(v.date) || "?") + " ?")) {
          d.visites = d.visites.filter(x => x.id !== v.id);
          enregistrer(d);
        }
        break;
    }
  });

  $("btnNouveau").addEventListener("click", () => ouvrirDossier(null));
  $("recherche").addEventListener("input", afficherListe);
  $("filtreAptitude").addEventListener("change", afficherListe);

  /* ---------- Export / import ---------- */
  $("btnExporter").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ type: "commando-hubert-dossiers", exporteLe: aujourdhui(), dossiers }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dossiers-medicaux-" + aujourdhui() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("btnImporter").addEventListener("click", () => $("fichierImport").click());

  const texte = (v, max) => String(v == null ? "" : v).slice(0, max);

  // Ne garde d'un dossier importé que les champs connus, sous forme de texte.
  function nettoyer(d) {
    const propre = { id: texte(d.id, 12), modifieLe: texte(d.modifieLe, 10), modifiePar: texte(d.modifiePar, 60) };
    CLES_DOSSIER.forEach(c => { propre[c] = texte(d[c], 2000); });
    propre.visites = (Array.isArray(d.visites) ? d.visites : []).filter(v => v && typeof v === "object").map(v => {
      const pv = { id: texte(v.id, 40) || uid() };
      CLES_VISITE.forEach(c => { pv[c] = texte(v[c], 2000); });
      return pv;
    });
    return propre;
  }

  $("fichierImport").addEventListener("change", async e => {
    const fichier = e.target.files[0];
    e.target.value = "";
    if (!fichier) return;
    try {
      const contenu = JSON.parse(await fichier.text());
      const recus = Array.isArray(contenu) ? contenu : contenu.dossiers;
      if (!Array.isArray(recus)) throw new Error("format non reconnu");
      const propres = recus.filter(d => d && typeof d === "object" && /^MED-\d+$/.test(d.id) && d.pseudoRp).map(nettoyer);

      const existants = propres.filter(p => dossiers.some(d => d.id === p.id)).length;
      const ecraser = existants === 0 ||
        confirm(existants + " dossier(s) existent déjà dans ce navigateur.\nOK : les remplacer par la version importée.\nAnnuler : garder les versions actuelles.");
      let ajoutes = 0, remplaces = 0;
      for (const p of propres) {
        const i = dossiers.findIndex(d => d.id === p.id);
        if (i === -1) { dossiers.push(p); ajoutes++; }
        else if (ecraser) { dossiers[i] = p; remplaces++; }
      }
      sauver();
      rafraichir();
      alert("Import terminé : " + ajoutes + " dossier(s) ajouté(s), " + remplaces + " remplacé(s).");
    } catch (err) {
      alert("Import impossible : " + err.message);
    }
  });

  /* ---------- Démarrage ---------- */
  $("filtreAptitude").insertAdjacentHTML("beforeend",
    [...LISTE_APT, NON_EVALUE].map(a => "<option>" + ech(a) + "</option>").join(""));
  rafraichir();
})();
