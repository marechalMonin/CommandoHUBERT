/* Agenda des Game Masters (admin.html, onglet Agenda).
   Chaque GM indique, jour par jour et créneau par créneau, s'il est présent, absent ou peut-être.
   Les réponses sont partagées par la base Firebase du front, nœud "agenda"
   (lecture publique, écriture limitée aux valeurs attendues : règles dans l'onglet Agenda).

   Données : agenda/AAAA-MM-JJ/pseudo =
     - "present" | "absent" | "peut-etre"            → toute la journée
     - { soiree: "present", nuit: "peut-etre", … }   → créneau par créneau (clé = id du créneau ci-dessous) */
(() => {
  "use strict";

  const racine = document.getElementById("agenda");
  if (!racine) return;

  /* Les créneaux horaires. Pour les changer : modifier cette liste (id en minuscules, sans accent,
     tiret autorisé). Les règles de la base acceptent n'importe quel id de cette forme. */
  const CRENEAUX = [
    { id: "matin", nom: "Matin", heures: "9h – 12h" },
    { id: "apres-midi", nom: "Après-midi", heures: "14h – 18h" },
    { id: "soiree", nom: "Soirée", heures: "20h – 23h" },
    { id: "nuit", nom: "Nuit", heures: "23h – 2h" }
  ];

  const ETATS = {
    present: { nom: "Présent", classe: "vert", ico: "✔" },
    "peut-etre": { nom: "Peut-être", classe: "jaune", ico: "?" },
    absent: { nom: "Absent", classe: "rouge", ico: "✘" }
  };
  const ORDRE = ["present", "peut-etre", "absent"];
  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const SEMAINES = 5;
  const CLE_PSEUDO = "ch_agenda_pseudo";

  const CONFIG = {
    base: (racine.dataset.agenda || "").replace(/\/+$/, ""),
    intervalle: Number(racine.dataset.intervalle) || 60 // secondes entre deux relectures (sans flux continu)
  };

  const etat = {
    donnees: {},
    decalage: 0, // semaines par rapport à la semaine en cours
    pseudo: "",
    jourOuvert: null,
    statut: "chargement",
    message: "",
    modeFlux: false,
    minuterie: null
  };

  const $ = id => document.getElementById(id);

  // Construit un élément avec du texte (jamais de HTML injecté).
  function el(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  /* ---------- Dates (heure locale) ---------- */

  const aujourdhui = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const ajouter = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const lundiDe = d => ajouter(d, -((d.getDay() + 6) % 7));
  const cle = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const memeJour = (a, b) => cle(a) === cle(b);
  const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const fmtMois = new Intl.DateTimeFormat("fr-FR", { month: "short" });

  /* ---------- Réponses : "present" (journée) ou { creneau: etat } ---------- */

  // Statut de chaque créneau pour une valeur brute de la base ; null quand non renseigné.
  function statutsDe(valeur) {
    const s = {};
    for (const c of CRENEAUX) {
      if (typeof valeur === "string") s[c.id] = ETATS[valeur] ? valeur : null;
      else s[c.id] = valeur && typeof valeur === "object" && ETATS[valeur[c.id]] ? valeur[c.id] : null;
    }
    return s;
  }

  // Le statut commun à tous les créneaux, ou null si la réponse varie (ou est incomplète).
  function uniforme(statuts) {
    const valeurs = CRENEAUX.map(c => statuts[c.id]);
    return valeurs[0] && valeurs.every(v => v === valeurs[0]) ? valeurs[0] : null;
  }

  // Forme compacte à enregistrer : chaîne si toute la journée, objet sinon, null si vide.
  function compacter(statuts) {
    const u = uniforme(statuts);
    if (u) return u;
    const o = {};
    for (const c of CRENEAUX) if (statuts[c.id]) o[c.id] = statuts[c.id];
    return Object.keys(o).length ? o : null;
  }

  const estValide = v => typeof v === "string" ? !!ETATS[v] : !!v && typeof v === "object" && Object.values(v).some(x => ETATS[x]);

  /* ---------- Pseudo ---------- */

  // Clé Firebase sûre : lettres, chiffres, tiret, souligné ; accents retirés ; 24 caractères max.
  function nettoyer(p) {
    return (p || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  }

  function pseudosConnus() {
    const s = new Set();
    for (const jour of Object.values(etat.donnees)) if (jour && typeof jour === "object") Object.keys(jour).forEach(p => s.add(p));
    if (etat.pseudo) s.add(etat.pseudo);
    return [...s].sort((a, b) => a.localeCompare(b, "fr"));
  }

  function majPseudo(valeur, enregistrer) {
    etat.pseudo = nettoyer(valeur);
    if (enregistrer) {
      try { localStorage.setItem(CLE_PSEUDO, etat.pseudo); } catch (e) { /* stockage indisponible */ }
    }
    $("agendaQui").textContent = etat.pseudo ? "Vous répondez en tant que " + etat.pseudo + "." : "Indiquez votre pseudo pour répondre.";
    rendre();
  }

  /* ---------- Lecture ---------- */

  function majStatut(statut, message) {
    etat.statut = statut;
    etat.message = message || "";
    const z = $("agendaStatut");
    z.dataset.etat = statut;
    z.textContent = {
      chargement: "Connexion…",
      direct: "Partagé en direct",
      lecture: "Partagé (relecture toutes les " + CONFIG.intervalle + " s)",
      coupure: "Connexion interrompue, nouvelle tentative…",
      refuse: "Base non configurée pour l’agenda",
      erreur: "Agenda indisponible"
    }[statut] || statut;
    $("agendaMessage").textContent = etat.message;
    $("agendaMessage").hidden = !etat.message;
  }

  function afficherMessage(texte) {
    $("agendaMessage").textContent = texte;
    $("agendaMessage").hidden = !texte;
  }

  async function lire() {
    if (!CONFIG.base) return majStatut("erreur", "Aucune adresse de base (attribut data-agenda).");
    try {
      const rep = await fetch(CONFIG.base + ".json", { cache: "no-store" });
      if (rep.status === 401 || rep.status === 403) {
        return majStatut("refuse", "La lecture du nœud « agenda » est refusée : les règles de la base doivent être mises à jour (voir « Configuration de la base » plus bas).");
      }
      if (!rep.ok) throw new Error("réponse " + rep.status);
      etat.donnees = (await rep.json()) || {};
      if (!etat.modeFlux) majStatut("lecture");
      rendre();
    } catch (e) {
      majStatut("erreur", "Lecture impossible (" + e.message + ").");
    }
  }

  function planifier() {
    clearTimeout(etat.minuterie);
    etat.minuterie = setTimeout(() => { lire(); planifier(); }, CONFIG.intervalle * 1000);
  }

  // Applique un événement du flux Firebase (put / patch) à l'arbre local.
  function appliquer(type, chemin, data) {
    const parts = (chemin || "/").split("/").filter(Boolean);
    if (type === "put" && !parts.length) { etat.donnees = data || {}; return; }
    let noeud = etat.donnees;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!noeud[parts[i]] || typeof noeud[parts[i]] !== "object") noeud[parts[i]] = {};
      noeud = noeud[parts[i]];
    }
    if (type === "patch") {
      const cible = parts.length ? (noeud[parts[parts.length - 1]] = noeud[parts[parts.length - 1]] || {}) : etat.donnees;
      for (const k in data) data[k] == null ? delete cible[k] : (cible[k] = data[k]);
    } else if (data == null) {
      delete noeud[parts[parts.length - 1]];
    } else {
      noeud[parts[parts.length - 1]] = data;
    }
  }

  function ouvrirFlux() {
    if (!CONFIG.base || !("EventSource" in window)) return false;
    let es;
    try { es = new EventSource(CONFIG.base + ".json"); } catch (e) { return false; }
    etat.modeFlux = true;
    const surMessage = type => evt => {
      try {
        const m = JSON.parse(evt.data);
        appliquer(type, m.path, m.data);
        rendre();
      } catch (e) { /* message illisible : ignoré */ }
    };
    es.addEventListener("put", surMessage("put"));
    es.addEventListener("patch", surMessage("patch"));
    const repli = () => { es.close(); etat.modeFlux = false; lire(); planifier(); };
    es.addEventListener("cancel", repli);
    es.addEventListener("auth_revoked", repli);
    es.onopen = () => majStatut("direct");
    es.onerror = () => {
      // EventSource se reconnecte seul. Si la base refuse (règles), on retombe en lecture simple pour avoir le message.
      if (es.readyState === EventSource.CLOSED) return repli();
      if (etat.statut === "chargement") return repli();
      majStatut("coupure");
    };
    return true;
  }

  /* ---------- Écriture ---------- */

  // Enregistre la réponse complète du GM pour un jour : chaîne, objet par créneau, ou null pour effacer.
  async function ecrire(jour, valeur) {
    if (!etat.pseudo) return;
    const url = CONFIG.base + "/" + jour + "/" + encodeURIComponent(etat.pseudo) + ".json?print=silent";
    const avant = etat.donnees[jour] ? etat.donnees[jour][etat.pseudo] : undefined;
    // Mise à jour immédiate, annulée si la base refuse.
    appliquer("put", "/" + jour + "/" + etat.pseudo, valeur);
    rendre();
    try {
      const rep = await fetch(url, valeur == null
        ? { method: "DELETE" }
        : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valeur) });
      if (!rep.ok) {
        if (rep.status === 401 || rep.status === 403) {
          throw new Error(typeof valeur === "object" && valeur
            ? "écriture par créneau refusée par la base : les règles doivent être mises à jour (voir « Configuration de la base »)"
            : "écriture refusée par la base (règles à mettre à jour)");
        }
        throw new Error("réponse " + rep.status);
      }
      afficherMessage("");
    } catch (e) {
      appliquer("put", "/" + jour + "/" + etat.pseudo, avant);
      rendre();
      afficherMessage("Réponse non enregistrée : " + e.message + ".");
    }
  }

  // Modifie un seul créneau de la réponse du GM (null = effacer ce créneau).
  function ecrireCreneau(jour, idCreneau, valeur) {
    const actuel = etat.donnees[jour] ? etat.donnees[jour][etat.pseudo] : undefined;
    const statuts = statutsDe(actuel);
    statuts[idCreneau] = valeur;
    return ecrire(jour, compacter(statuts));
  }

  /* ---------- Affichage ---------- */

  // Réponses d'un jour : [[pseudo, statuts, uniforme], …] triées (présents d'abord).
  function reponses(jour) {
    const d = etat.donnees[jour];
    if (!d || typeof d !== "object") return [];
    return Object.entries(d)
      .filter(([, v]) => estValide(v))
      .map(([p, v]) => { const s = statutsDe(v); return [p, s, uniforme(s)]; })
      .sort((a, b) => rang(a) - rang(b) || a[0].localeCompare(b[0], "fr"));
  }

  // Rang de tri : meilleur statut atteint sur la journée.
  function rang([, statuts]) {
    const r = Object.values(statuts).filter(Boolean).map(v => ORDRE.indexOf(v));
    return r.length ? Math.min(...r) : ORDRE.length;
  }

  function chip(pseudo, valeur) {
    const li = el("li", "pastille " + ETATS[valeur].classe + (pseudo === etat.pseudo ? " moi" : ""), ETATS[valeur].ico + " " + pseudo);
    li.title = pseudo + " : " + ETATS[valeur].nom;
    return li;
  }

  // Lignes d'une case : « Journée » pour les réponses uniformes, puis un créneau par ligne.
  function lignesJour(rep) {
    const lignes = [];
    const journee = rep.filter(([, , u]) => u);
    if (journee.length) lignes.push({ nom: "Journée", chips: journee.map(([p, , u]) => chip(p, u)) });
    for (const c of CRENEAUX) {
      const ici = rep.filter(([, s, u]) => !u && s[c.id]);
      if (ici.length) {
        ici.sort((a, b) => ORDRE.indexOf(a[1][c.id]) - ORDRE.indexOf(b[1][c.id]) || a[0].localeCompare(b[0], "fr"));
        lignes.push({ nom: c.nom, chips: ici.map(([p, s]) => chip(p, s[c.id])) });
      }
    }
    return lignes;
  }

  function rendre() {
    const grille = $("agendaGrille");
    grille.textContent = "";
    const ajd = aujourdhui();
    const debut = ajouter(lundiDe(ajd), etat.decalage * 7);
    const fin = ajouter(debut, SEMAINES * 7 - 1);
    $("agendaPeriode").textContent = "Du " + fmtCourt.format(debut) + " au " + fmtCourt.format(fin) + " " + fin.getFullYear();
    $("agendaAujourdhui").disabled = etat.decalage === 0;

    for (let i = 0; i < SEMAINES * 7; i++) {
      const d = ajouter(debut, i);
      const k = cle(d);
      const passe = d < ajd;
      const b = el("button", "jour" + (passe ? " passe" : "") + (memeJour(d, ajd) ? " aujourdhui" : ""));
      b.type = "button";
      b.disabled = passe;
      b.dataset.jour = k;
      b.setAttribute("aria-label", fmtLong.format(d));

      const tete = el("div", "tete");
      tete.append(el("span", "jsem", JOURS[i % 7]), el("span", "num", String(d.getDate())));
      if (i === 0 || d.getDate() === 1) tete.append(el("span", "mois", fmtMois.format(d)));
      if (memeJour(d, ajd)) tete.append(el("span", "badge", "Aujourd’hui"));
      b.append(tete);

      const rep = reponses(k);
      if (rep.length) {
        const corps = el("div", "corps");
        for (const l of lignesJour(rep)) {
          const ligne = el("div", "cren");
          ligne.append(el("span", "cren-nom", l.nom));
          const ul = el("ul", "rep");
          ul.append(...l.chips);
          ligne.append(ul);
          corps.append(ligne);
        }
        b.append(corps);
        const n = rep.filter(([, s]) => Object.values(s).includes("present")).length;
        if (n) b.append(el("span", "compte", n + " présent" + (n > 1 ? "s" : "")));
      } else if (!passe) {
        b.append(el("span", "vide", "—"));
      }
      b.addEventListener("click", () => ouvrirJour(k));
      grille.append(b);
    }

    // Liste des pseudos déjà vus, pour le champ pseudo.
    const dl = $("agendaPseudos");
    dl.textContent = "";
    for (const p of pseudosConnus()) { const o = el("option"); o.value = p; dl.append(o); }

    if (etat.jourOuvert) remplirDialogue();
  }

  /* ---------- Fenêtre d'un jour ---------- */

  function ouvrirJour(k) {
    if (!etat.pseudo) {
      afficherMessage("Indiquez d’abord votre pseudo GM pour répondre.");
      $("agendaPseudo").focus();
      return;
    }
    etat.jourOuvert = k;
    remplirDialogue();
    const dlg = $("dlgJour");
    if (!dlg.open) dlg.showModal();
  }

  // Construit une fois la grille des créneaux de la fenêtre.
  function construireCreneaux() {
    const zone = $("creneauxJour");
    zone.textContent = "";
    for (const c of CRENEAUX) {
      const ligne = el("div", "cren-ligne");
      const nom = el("div", "cren-titre");
      nom.append(el("strong", "", c.nom), el("small", "", c.heures));
      ligne.append(nom);
      const boutons = el("div", "cren-boutons");
      for (const v of ORDRE) {
        const b = el("button", "", ETATS[v].ico);
        b.type = "button";
        b.dataset.creneau = c.id;
        b.dataset.etat = v;
        b.title = ETATS[v].nom;
        b.setAttribute("aria-label", c.nom + " : " + ETATS[v].nom);
        b.addEventListener("click", () => {
          const actuel = etat.donnees[etat.jourOuvert] ? etat.donnees[etat.jourOuvert][etat.pseudo] : undefined;
          const deja = statutsDe(actuel)[c.id] === v;
          ecrireCreneau(etat.jourOuvert, c.id, deja ? null : v); // recliquer = effacer ce créneau
        });
        boutons.append(b);
      }
      ligne.append(boutons);
      zone.append(ligne);
    }
  }

  function remplirDialogue() {
    const k = etat.jourOuvert;
    const [a, m, j] = k.split("-").map(Number);
    const d = new Date(a, m - 1, j);
    const titre = fmtLong.format(d);
    $("titreJour").textContent = titre.charAt(0).toUpperCase() + titre.slice(1);

    const brut = etat.donnees[k] ? etat.donnees[k][etat.pseudo] : undefined;
    const miens = statutsDe(brut);
    const u = uniforme(miens);
    const dlg = $("dlgJour");
    dlg.querySelectorAll(".choix-etat [data-etat]").forEach(b => {
      b.classList.toggle("actif", b.dataset.etat === u);
      b.setAttribute("aria-pressed", b.dataset.etat === u);
    });
    dlg.querySelectorAll("#creneauxJour [data-creneau]").forEach(b => {
      const on = miens[b.dataset.creneau] === b.dataset.etat;
      b.classList.toggle("actif", on);
      b.setAttribute("aria-pressed", on);
    });
    $("btnEffacer").hidden = !estValide(brut);

    const zone = $("reponsesJour");
    zone.textContent = "";
    const rep = reponses(k);
    if (!rep.length) zone.append(el("p", "muted", "Personne n’a encore répondu pour ce jour."));
    for (const [p, s, uni] of rep) {
      const ligne = el("div", "rep-ligne");
      ligne.append(el("span", "rep-qui", p + (p === etat.pseudo ? " (vous)" : "")));
      const detail = el("span", "rep-detail");
      if (uni) {
        detail.append(el("span", "pastille " + ETATS[uni].classe, ETATS[uni].ico + " " + ETATS[uni].nom + " toute la journée"));
      } else {
        for (const c of CRENEAUX) if (s[c.id]) detail.append(el("span", "pastille " + ETATS[s[c.id]].classe, ETATS[s[c.id]].ico + " " + c.nom));
      }
      ligne.append(detail);
      zone.append(ligne);
    }
  }

  /* ---------- Démarrage ---------- */

  $("agendaPrec").addEventListener("click", () => { etat.decalage -= 1; rendre(); });
  $("agendaSuiv").addEventListener("click", () => { etat.decalage += 1; rendre(); });
  $("agendaAujourdhui").addEventListener("click", () => { etat.decalage = 0; rendre(); });

  const champ = $("agendaPseudo");
  champ.addEventListener("change", () => { majPseudo(champ.value, true); champ.value = etat.pseudo; });

  const dlg = $("dlgJour");
  construireCreneaux();
  // Toute la journée : une réponse, et la fenêtre se ferme.
  dlg.querySelectorAll(".choix-etat [data-etat]").forEach(b => b.addEventListener("click", () => { ecrire(etat.jourOuvert, b.dataset.etat); dlg.close(); }));
  $("btnEffacer").addEventListener("click", () => { ecrire(etat.jourOuvert, null); dlg.close(); });
  dlg.querySelectorAll("[data-fermer]").forEach(b => b.addEventListener("click", () => dlg.close()));
  dlg.addEventListener("close", () => { etat.jourOuvert = null; });

  try { champ.value = localStorage.getItem(CLE_PSEUDO) || ""; } catch (e) { /* stockage indisponible */ }
  majPseudo(champ.value, false);

  // À minuit, le calendrier avance d'un jour tout seul.
  function attendreMinuit() {
    const prochain = ajouter(aujourdhui(), 1);
    setTimeout(() => { rendre(); attendreMinuit(); }, prochain - Date.now() + 1000);
  }
  attendreMinuit();

  if (!ouvrirFlux()) { lire(); planifier(); }
})();
