/* Agenda des Game Masters (admin.html, onglet Agenda).
   Chaque GM indique, jour par jour, s'il est présent, absent ou peut-être.
   Les réponses sont partagées par la base Firebase du front, nœud "agenda"
   (lecture publique, écriture limitée aux valeurs attendues : règles dans l'onglet Agenda).
   Données : agenda/AAAA-MM-JJ/pseudo = "present" | "absent" | "peut-etre". */
(() => {
  "use strict";

  const racine = document.getElementById("agenda");
  if (!racine) return;

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
      if (!rep.ok) throw new Error(rep.status === 401 || rep.status === 403 ? "écriture refusée par la base (règles à mettre à jour)" : "réponse " + rep.status);
      $("agendaMessage").hidden = true;
    } catch (e) {
      appliquer("put", "/" + jour + "/" + etat.pseudo, avant);
      rendre();
      $("agendaMessage").textContent = "Réponse non enregistrée : " + e.message + ".";
      $("agendaMessage").hidden = false;
    }
  }

  /* ---------- Affichage ---------- */

  function reponses(jour) {
    const d = etat.donnees[jour];
    if (!d || typeof d !== "object") return [];
    return Object.entries(d)
      .filter(([, v]) => ETATS[v])
      .sort((a, b) => ORDRE.indexOf(a[1]) - ORDRE.indexOf(b[1]) || a[0].localeCompare(b[0], "fr"));
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
        const ul = el("ul", "rep");
        for (const [p, v] of rep) {
          const li = el("li", "pastille " + ETATS[v].classe + (p === etat.pseudo ? " moi" : ""), ETATS[v].ico + " " + p);
          li.title = p + " : " + ETATS[v].nom;
          ul.append(li);
        }
        b.append(ul);
        const n = rep.filter(([, v]) => v === "present").length;
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

  function ouvrirJour(k) {
    if (!etat.pseudo) {
      $("agendaMessage").textContent = "Indiquez d’abord votre pseudo GM pour répondre.";
      $("agendaMessage").hidden = false;
      $("agendaPseudo").focus();
      return;
    }
    etat.jourOuvert = k;
    remplirDialogue();
    const dlg = $("dlgJour");
    if (!dlg.open) dlg.showModal();
  }

  function remplirDialogue() {
    const k = etat.jourOuvert;
    const [a, m, j] = k.split("-").map(Number);
    const d = new Date(a, m - 1, j);
    const titre = fmtLong.format(d);
    $("titreJour").textContent = titre.charAt(0).toUpperCase() + titre.slice(1);
    const mien = etat.donnees[k] ? etat.donnees[k][etat.pseudo] : null;
    $("dlgJour").querySelectorAll("[data-etat]").forEach(b => b.classList.toggle("actif", b.dataset.etat === mien));
    $("btnEffacer").hidden = !mien;

    const zone = $("reponsesJour");
    zone.textContent = "";
    const rep = reponses(k);
    if (!rep.length) zone.append(el("p", "muted", "Personne n’a encore répondu pour ce jour."));
    for (const [p, v] of rep) {
      const ligne = el("div", "rep-ligne");
      ligne.append(el("span", "pastille " + ETATS[v].classe, ETATS[v].ico + " " + ETATS[v].nom), el("span", "", p + (p === etat.pseudo ? " (vous)" : "")));
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
  dlg.querySelectorAll("[data-etat]").forEach(b => b.addEventListener("click", () => { ecrire(etat.jourOuvert, b.dataset.etat); dlg.close(); }));
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
