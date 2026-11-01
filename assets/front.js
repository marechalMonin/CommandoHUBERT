/* Situation du front — suivi de la campagne « Front Dynamique » sur la page d'accueil.
   Le mod publie l'état du front (format décrit dans docs/flux-front.md) ; ce script le lit
   et met la page à jour tout seul.
   Source par défaut : data/front.json (données de démonstration).
   Pour passer en direct : mettre l'adresse du flux dans l'attribut data-source
   de <section id="front"> (index.html). */
(() => {
  "use strict";

  const racine = document.getElementById("front");
  if (!racine) return;

  const CONFIG = {
    source: racine.dataset.source || "data/front.json",
    // "auto" : flux continu (EventSource) pour une base Firebase, relecture périodique sinon.
    // "flux" ou "lecture" pour forcer l'un des deux.
    mode: racine.dataset.mode || "auto",
    intervalle: Number(racine.dataset.intervalle) || 120, // secondes entre deux relectures
    // « Sans nouvelles » : 2,5 fois la période de publication annoncée par le serveur, 150 s au moins.
    silenceMin: 150,
    journalMax: 6
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const COTE_CARTE = 1000; // plus grand côté de la carte, en unités SVG

  // Types de zone : libellé et genre (pour accorder « allié », « sécurisé »…).
  const TYPES_ZONE = {
    ville: { nom: "ville", feminin: true },
    village: { nom: "village", feminin: false },
    base: { nom: "base militaire", feminin: true },
    aerodrome: { nom: "aérodrome", feminin: false },
    port: { nom: "port", feminin: false },
    point: { nom: "point clé", feminin: false }
  };
  const TYPE_INCONNU = { nom: "zone", feminin: true };
  const TYPES_OP = {
    assaut: { nom: "Assaut", feminin: false },
    "contre-attaque": { nom: "Contre-attaque", feminin: true },
    attaque: { nom: "Attaque", feminin: true }
  };
  const COMBATS = new Set(["assaut", "contre-attaque", "menacee"]);

  const $ = id => document.getElementById(id);
  const el = {
    contexte: $("front-contexte"),
    statut: $("front-statut"),
    statutTexte: $("front-statut-texte"),
    rapport: $("front-rapport"),
    nJoueurs: $("front-n-joueurs"),
    nIa: $("front-n-ia"),
    nomJoueurs: $("front-nom-joueurs"),
    nomIa: $("front-nom-ia"),
    barre: $("front-barre"),
    total: $("front-total"),
    svg: $("front-svg"),
    info: $("front-info"),
    ops: $("front-ops"),
    journal: $("front-journal"),
    nZones: $("front-n-zones"),
    zones: $("front-zones-corps"),
    pied: $("front-pied"),
    annonce: $("front-annonce")
  };

  const etat = {
    donnees: null,     // situation normalisée, prête à afficher
    brut: null,        // dernier document reçu (utile en flux continu)
    erreur: null,      // dernier problème de lecture
    attente: false,    // la source répond mais n'a encore rien publié
    majVue: null,      // valeur de « maj » vue en dernier…
    majVueA: 0,        // …et l'heure (visiteur) à laquelle elle est apparue
    majChangee: false, // « maj » a changé pendant la visite : le serveur publie bien
    decalages: {},     // démo : décalage temporel par valeur de « maj »
    choisie: null,     // zone sélectionnée sur la carte
    chronos: [],       // comptes à rebours à rafraîchir chaque seconde
    modeFlux: false,
    annoncee: false,
    dernierTexte: null // dernier document lu, pour ignorer les relectures identiques
  };

  /* ---------- Outils ---------- */

  const liste = v => Array.isArray(v) ? v.filter(Boolean)
    : (v && typeof v === "object" ? Object.values(v).filter(Boolean) : []);
  const chaine = v => (typeof v === "string" || typeof v === "number") ? String(v) : "";
  const nombre = (v, defaut) => {
    const n = Number(v);
    return v !== null && v !== "" && Number.isFinite(n) ? n : defaut;
  };
  const borne = (n, min, max) => Math.min(max, Math.max(min, n));
  const camp = v => (v === "joueurs" || v === "ia") ? v : "neutre";
  const majuscule = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const deux = n => String(n).padStart(2, "0");
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const typeZone = t => TYPES_ZONE[t] || TYPE_INCONNU;

  function instant(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === "string" && v) {
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }

  function chrono(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${deux(m)}` : `${deux(m)}:${deux(s % 60)}`;
  }

  // 120 -> « 2 min », 90 -> « 90 s »
  function duree(secondes) {
    const s = Math.max(0, Math.round(secondes));
    return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`;
  }

  function ilYa(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return "à l'instant";
    if (s < 60) return `il y a ${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h${m % 60 ? " " + deux(m % 60) : ""}`;
    return `il y a ${Math.floor(h / 24)} j`;
  }

  const dateHeure = ms => new Date(ms).toLocaleString("fr-FR",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function h(tag, classe, parent) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (parent) parent.appendChild(n);
    return n;
  }

  function s(tag, attrs, parent) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function vider(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  /* ---------- Lecture du flux ---------- */

  function normaliser(brut) {
    const demo = brut.demo === true;
    const majBrute = instant(brut.maj);
    let decalage = 0;
    if (demo && majBrute !== null) {
      // La démo est rejouée « maintenant » : les chronos avancent normalement.
      if (!(majBrute in etat.decalages)) etat.decalages[majBrute] = Date.now() - majBrute;
      decalage = etat.decalages[majBrute];
    }
    const t = v => {
      const x = instant(v);
      return x === null ? null : x + decalage;
    };

    const zones = liste(brut.zones).map(z => ({
      id: chaine(z.id),
      nom: chaine(z.nom) || chaine(z.id),
      type: chaine(z.type),
      x: nombre(z.x, NaN),
      z: nombre(z.z, NaN),
      camp: camp(z.camp),
      etat: chaine(z.etat) || "calme",
      controle: borne(nombre(z.controle, 0), 0, 100),
      fob: z.fob === true,
      voisins: liste(z.voisins).map(chaine)
    })).filter(z => z.id);

    const operations = liste(brut.operations).map(o => ({
      id: chaine(o.id),
      type: chaine(o.type),
      zone: chaine(o.zone),
      attaquant: camp(o.attaquant),
      etat: chaine(o.etat) || "en-cours",
      debut: t(o.debut),
      fin: t(o.fin),
      vague: Math.round(nombre(o.vague, 0)),
      vagues: Math.round(borne(nombre(o.vagues, 0), 0, 12)),
      progression: o.progression === undefined || o.progression === null
        ? null : borne(nombre(o.progression, 0), 0, 100)
    })).filter(o => o.etat === "en-cours" || o.etat === "annoncee");

    const journal = liste(brut.journal).map(j => ({
      t: t(j.t),
      camp: camp(j.camp),
      zone: chaine(j.zone),
      type: chaine(j.type),
      texte: chaine(j.texte)
    })).filter(j => j.t !== null).sort((a, b) => b.t - a.t);

    const serveur = brut.serveur || {};
    const campagne = brut.campagne || {};
    const carte = brut.carte || {};
    const camps = brut.camps || {};

    return {
      demo,
      maj: t(brut.maj),
      intervalle: nombre(brut.intervalle, null),
      enLigne: serveur.enLigne !== false,
      joueurs: nombre(serveur.joueurs, null),
      joueursMax: nombre(serveur.joueursMax, null),
      map: chaine(campagne.map),
      saison: nombre(campagne.saison, null),
      jour: nombre(campagne.jour, null),
      largeur: nombre(carte.largeur, 0),
      hauteur: nombre(carte.hauteur, 0),
      noms: {
        joueurs: chaine((camps.joueurs || {}).nom) || "Commando",
        ia: chaine((camps.ia || {}).nom) || "Ennemi"
      },
      zones,
      parId: new Map(zones.map(z => [z.id, z])),
      operations,
      journal
    };
  }

  function recevoir(brut) {
    if (brut === null || typeof brut !== "object") {
      etat.attente = true; // base vide : le serveur n'a encore rien publié
      majStatut(Date.now());
      return;
    }
    try {
      const d = normaliser(brut);
      etat.donnees = d;
      etat.erreur = null;
      etat.attente = false;
      if (etat.majVueA === 0 || d.maj !== etat.majVue) {
        if (etat.majVueA !== 0) etat.majChangee = true;
        etat.majVue = d.maj;
        etat.majVueA = Date.now();
      }
      rendre(d);
    } catch (e) {
      etat.erreur = e;
      majStatut(Date.now());
    }
  }

  const estDistant = url => /^https?:\/\//i.test(url);

  async function lire() {
    const url = estDistant(CONFIG.source)
      ? CONFIG.source
      : CONFIG.source + (CONFIG.source.includes("?") ? "&" : "?") + "t=" + Date.now();
    try {
      const rep = await fetch(url, { cache: "no-store" });
      if (!rep.ok) throw new Error(`réponse ${rep.status}`);
      const texte = await rep.text();
      if (texte === etat.dernierTexte) {
        // Rien de neuf : on évite de redessiner la carte (et de perdre un survol en cours).
        etat.erreur = null;
        majStatut(Date.now());
        return;
      }
      recevoir(JSON.parse(texte));
      etat.dernierTexte = texte;
    } catch (e) {
      etat.erreur = e;
      if (!etat.donnees) afficherIndisponible();
      majStatut(Date.now());
    }
  }

  let minuteur = null;
  function planifier() {
    clearTimeout(minuteur);
    minuteur = setTimeout(async () => {
      if (!document.hidden) await lire();
      planifier();
    }, CONFIG.intervalle * 1000);
  }

  // Flux continu Firebase (Server-Sent Events) : événements put / patch avec { path, data }.
  function appliquer(type, chemin, valeur) {
    const cles = String(chemin || "/").split("/").filter(Boolean);
    if (!cles.length) {
      if (type === "put" || !etat.brut || typeof etat.brut !== "object") {
        etat.brut = type === "put" ? valeur : Object.assign({}, valeur);
      } else {
        for (const k in valeur) {
          if (valeur[k] === null) delete etat.brut[k];
          else etat.brut[k] = valeur[k];
        }
      }
      return;
    }
    if (!etat.brut || typeof etat.brut !== "object") etat.brut = {};
    let noeud = etat.brut;
    for (const k of cles.slice(0, -1)) {
      if (!noeud[k] || typeof noeud[k] !== "object") noeud[k] = {};
      noeud = noeud[k];
    }
    const der = cles[cles.length - 1];
    if (type === "put") {
      if (valeur === null) delete noeud[der];
      else noeud[der] = valeur;
    } else {
      if (!noeud[der] || typeof noeud[der] !== "object") noeud[der] = {};
      for (const k in valeur) {
        if (valeur[k] === null) delete noeud[der][k];
        else noeud[der][k] = valeur[k];
      }
    }
  }

  function ouvrirFlux() {
    if (!("EventSource" in window)) return false;
    let es;
    try {
      es = new EventSource(CONFIG.source);
    } catch (e) {
      return false;
    }
    etat.modeFlux = true;
    const surMessage = type => evt => {
      try {
        const m = JSON.parse(evt.data);
        appliquer(type, m.path, m.data);
        recevoir(etat.brut);
      } catch (e) {
        etat.erreur = e;
      }
    };
    es.addEventListener("put", surMessage("put"));
    es.addEventListener("patch", surMessage("patch"));
    const repli = () => {
      es.close();
      etat.modeFlux = false;
      lire();
      planifier();
    };
    es.addEventListener("cancel", repli);
    es.addEventListener("auth_revoked", repli);
    // EventSource se reconnecte seul ; on signale juste la coupure.
    es.onerror = () => {
      etat.erreur = new Error("flux interrompu");
      majStatut(Date.now());
    };
    es.onopen = () => {
      etat.erreur = null;
    };
    return true;
  }

  /* ---------- Affichage ---------- */

  function rendre(d) {
    const maintenant = Date.now();
    rendreContexte(d);
    const n = rendreRapport(d);
    rendreCarte(d);
    rendreOps(d, maintenant);
    rendreJournal(d, maintenant);
    rendreZones(d);
    rendrePied(d);
    majStatut(maintenant);
    if (etat.choisie && d.parId.has(etat.choisie)) montrerZone(etat.choisie);
    else afficherInfoDefaut();

    const combats = d.operations.filter(o => o.etat === "en-cours").length;
    const resume = `${pluriel(n.joueurs, "zone")} alliée${n.joueurs > 1 ? "s" : ""}, `
      + `${n.ia} ennemie${n.ia > 1 ? "s" : ""}, ${pluriel(combats, "combat")} en cours`;
    el.svg.setAttribute("aria-label", `Carte schématique du front : ${resume}.`);
    // Annonce discrète pour les lecteurs d'écran, seulement après la première mise à jour.
    if (etat.annoncee) el.annonce.textContent = `Situation du front mise à jour : ${resume}.`;
    etat.annoncee = true;
  }

  function rendreContexte(d) {
    const morceaux = [];
    if (d.map) morceaux.push(d.map);
    if (d.saison !== null) morceaux.push(`saison ${d.saison}`);
    if (d.jour !== null) morceaux.push(`jour ${d.jour} de campagne`);
    let texte = majuscule(morceaux.join(", "));
    if (d.enLigne && d.joueurs !== null) {
      texte += `${texte ? ". " : ""}${pluriel(d.joueurs, "joueur")} en ligne`
        + `${d.joueursMax ? ` sur ${d.joueursMax}` : ""}.`;
    }
    el.contexte.textContent = texte || "Campagne en cours.";
  }

  function rendreRapport(d) {
    const n = { joueurs: 0, ia: 0, neutre: 0 };
    d.zones.forEach(z => { n[z.camp]++; });
    el.nJoueurs.textContent = n.joueurs;
    el.nIa.textContent = n.ia;
    el.nomJoueurs.textContent = d.noms.joueurs;
    el.nomIa.textContent = d.noms.ia;

    const segments = ["joueurs", "neutre", "ia"].map(c => {
      const seg = el.barre.querySelector(`.seg.${c}`);
      seg.style.flexGrow = String(n[c]);
      seg.hidden = n[c] === 0;
      seg.classList.remove("debut", "fin");
      return seg;
    }).filter(seg => !seg.hidden);
    if (segments.length) {
      segments[0].classList.add("debut");
      segments[segments.length - 1].classList.add("fin");
    }
    el.barre.setAttribute("aria-label",
      `${n.joueurs} zones ${d.noms.joueurs}, ${n.neutre} neutres, ${n.ia} zones ${d.noms.ia}`);
    el.total.textContent = n.neutre
      ? `${pluriel(n.neutre, "zone")} neutre${n.neutre > 1 ? "s" : ""} sur ${d.zones.length}`
      : `${d.zones.length} zones au total`;
    el.rapport.hidden = d.zones.length === 0;
    return n;
  }

  function forme(g, type, x, y, c) {
    const classe = `forme ${c}`;
    if (type === "base" || type === "aerodrome") {
      return s("rect", { class: classe, x: x - 15, y: y - 15, width: 30, height: 30, rx: 5 }, g);
    }
    if (type === "point") {
      return s("path", { class: classe, d: `M${x} ${y - 17}L${x + 17} ${y}L${x} ${y + 17}L${x - 17} ${y}Z` }, g);
    }
    return s("circle", { class: classe, cx: x, cy: y, r: type === "ville" ? 19 : 13 }, g);
  }

  function rendreCarte(d) {
    const svg = el.svg;
    vider(svg);
    const placees = d.zones.filter(z => Number.isFinite(z.x) && Number.isFinite(z.z));
    if (!placees.length) {
      svg.setAttribute("viewBox", "0 0 1000 600");
      const t = s("text", { class: "vide", x: 500, y: 300, "text-anchor": "middle" }, svg);
      t.textContent = "Aucune zone publiée pour l'instant.";
      return;
    }

    let L = d.largeur;
    let H = d.hauteur;
    if (!(L > 0 && H > 0)) {
      L = Math.max(...placees.map(z => z.x)) * 1.08 + 300;
      H = Math.max(...placees.map(z => z.z)) * 1.08 + 300;
    }
    const k = COTE_CARTE / Math.max(L, H);
    const W = Math.round(L * k);
    const Hs = Math.round(H * k);
    svg.setAttribute("viewBox", `0 0 ${W} ${Hs}`);
    const px = z => z.x * k;
    const py = z => (H - z.z) * k;

    // Quadrillage kilométrique et repères, comme sur une carte d'état-major.
    const pas = 1000 * k;
    if (pas >= 25) {
      const grille = s("g", { class: "grille" }, svg);
      const reperes = s("g", { class: "repere" }, svg);
      for (let i = 1; i * pas < W; i++) {
        s("line", { x1: i * pas, y1: 0, x2: i * pas, y2: Hs }, grille);
        if (i % 2 === 0) s("text", { x: i * pas + 6, y: 24 }, reperes).textContent = deux(i);
      }
      for (let j = 1; j * pas < Hs; j++) {
        s("line", { x1: 0, y1: Hs - j * pas, x2: W, y2: Hs - j * pas }, grille);
        if (j % 2 === 0) s("text", { x: 8, y: Hs - j * pas - 6 }, reperes).textContent = deux(j);
      }
    }
    const nord = s("g", { class: "nord", transform: `translate(${W - 44} 58)` }, svg);
    s("path", { d: "M0 -30L10 0L0 -7L-10 0Z" }, nord);
    s("text", { x: 0, y: 26, "text-anchor": "middle" }, nord).textContent = "N";

    // Liaisons : même camp, ligne de front (camps opposés) ou liaison neutre.
    const liens = s("g", { class: "liens" }, svg);
    const vus = new Set();
    for (const z of placees) {
      for (const id of z.voisins) {
        const v = d.parId.get(id);
        if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.z)) continue;
        const cle = z.id < v.id ? `${z.id}|${v.id}` : `${v.id}|${z.id}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        let classe = "neutre";
        if (z.camp === v.camp) classe = z.camp;
        else if (z.camp !== "neutre" && v.camp !== "neutre") classe = "front";
        s("line", { class: `lien ${classe}`, x1: px(z), y1: py(z), x2: px(v), y2: py(v) }, liens);
      }
    }

    // Combats en cours : un anneau qui pulse, à la couleur de l'attaquant.
    const attaquants = new Map();
    d.operations.forEach(o => {
      if (o.zone && !attaquants.has(o.zone)) attaquants.set(o.zone, o.attaquant);
    });
    const pulses = s("g", { class: "pulses" }, svg);
    for (const z of placees) {
      if (!COMBATS.has(z.etat) && !attaquants.has(z.id)) continue;
      const att = attaquants.get(z.id) || (z.camp === "joueurs" ? "ia" : "joueurs");
      s("circle", { class: `pulse ${att}`, cx: px(z), cy: py(z), r: 26 }, pulses);
    }

    const groupe = s("g", { class: "zones" }, svg);
    for (const z of placees) {
      const x = px(z);
      const y = py(z);
      const fragile = z.etat === "fragile" || z.etat === "contre-attaque";
      const g = s("g", {
        class: `zone${fragile ? " fragile" : ""}${etat.choisie === z.id ? " choisie" : ""}`,
        "data-id": z.id
      }, groupe);
      s("circle", { class: "cible", cx: x, cy: y, r: 40 }, g);
      forme(g, z.type, x, y, z.camp);
      if (z.fob) s("path", { class: "fob", d: drapeau(x, y, 19), "data-cx": x, "data-cy": y }, g);
      const aGauche = x > W - 240;
      const majeure = z.type === "ville" || z.type === "base" || z.type === "aerodrome";
      const lbl = s("text", {
        class: `lbl${majeure ? "" : " mineur"}`,
        x: x + (aGauche ? -28 : 28),
        y: y + 9,
        "text-anchor": aGauche ? "end" : "start",
        "data-cx": x,
        "data-cy": y
      }, g);
      lbl.textContent = z.nom;
    }
    requestAnimationFrame(placerEtiquettes);
  }

  // Drapeau de FOB planté juste au-dessus du symbole (r : demi-hauteur du symbole).
  const drapeau = (x, y, r) => `M${x} ${y - r - 3}V${y - r - 29}L${x + 18} ${y - r - 22}L${x} ${y - r - 15}`;

  // Place chaque nom à droite, à gauche, au-dessus ou au-dessous de son symbole,
  // à la première position libre ; un nom secondaire sans place est masqué (il reste dans le tableau).
  function placerEtiquettes() {
    const svg = el.svg;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const cadre = svg.getBoundingClientRect();
    if (!vb || !vb.width || !cadre.width) return;
    const ech = cadre.width / vb.width; // pixels à l'écran par unité SVG
    const rel = r => ({ g: r.left - cadre.left, d: r.right - cadre.left, h: r.top - cadre.top, b: r.bottom - cadre.top });
    const chevauche = (a, b) => a.g < b.d + 3 && a.d + 3 > b.g && a.h < b.b + 3 && a.b + 3 > b.h;
    const demiHauteur = n => n ? n.getBoundingClientRect().height / 2 / ech : 15;

    // Les symboles grossissent sur petit écran : on recale les drapeaux sur leur taille réelle.
    svg.querySelectorAll(".zone .fob").forEach(f => {
      f.setAttribute("d", drapeau(Number(f.dataset.cx), Number(f.dataset.cy),
        demiHauteur(f.parentNode.querySelector(".forme"))));
    });

    const obstacles = [];
    svg.querySelectorAll(".zone .forme, .zone .fob, .nord").forEach(n => {
      obstacles.push(rel(n.getBoundingClientRect()));
    });
    const etiquettes = Array.from(svg.querySelectorAll(".zone .lbl"))
      .sort((a, b) => a.classList.contains("mineur") - b.classList.contains("mineur"));

    for (const t of etiquettes) {
      t.classList.remove("cache");
      if (getComputedStyle(t).display === "none") continue;
      const r = demiHauteur(t.parentNode.querySelector(".forme"));
      const cx = Number(t.dataset.cx);
      const cy = Number(t.dataset.cy);
      const fs = parseFloat(getComputedStyle(t).fontSize) || 25;
      const essais = [
        [cx + r + fs * 0.35, cy + fs * 0.35, "start"],
        [cx - r - fs * 0.35, cy + fs * 0.35, "end"],
        [cx, cy - r - fs * 0.5, "middle"],
        [cx, cy + r + fs * 1.2, "middle"],
        [cx + r * 0.7, cy - r - fs * 0.4, "start"],
        [cx + r * 0.7, cy + r + fs * 1.1, "start"],
        [cx - r * 0.7, cy - r - fs * 0.4, "end"],
        [cx - r * 0.7, cy + r + fs * 1.1, "end"]
      ];
      const poser = ([x, y, ancre]) => {
        t.setAttribute("x", x);
        t.setAttribute("y", y);
        t.setAttribute("text-anchor", ancre);
        return rel(t.getBoundingClientRect());
      };
      const aire = (a, b) => Math.max(0, Math.min(a.d, b.d) - Math.max(a.g, b.g))
        * Math.max(0, Math.min(a.b, b.b) - Math.max(a.h, b.h));
      let retenu = null;
      let moinsPire = null;
      for (const essai of essais) {
        const b = poser(essai);
        const dedans = b.g >= 2 && b.h >= 2 && b.d <= cadre.width - 2 && b.b <= cadre.height - 2;
        if (dedans && !obstacles.some(o => chevauche(b, o))) {
          retenu = b;
          break;
        }
        // Faute de place libre : la position qui recouvre le moins les autres éléments.
        const score = (dedans ? 0 : 1e9) + obstacles.reduce((somme, o) => somme + aire(b, o), 0);
        if (!moinsPire || score < moinsPire.score) moinsPire = { score, essai };
      }
      if (!retenu) {
        if (t.classList.contains("mineur")) {
          t.classList.add("cache");
          continue;
        }
        retenu = poser(moinsPire.essai);
      }
      obstacles.push(retenu);
    }
  }

  let attenteRedim = null;
  window.addEventListener("resize", () => {
    clearTimeout(attenteRedim);
    attenteRedim = setTimeout(placerEtiquettes, 150);
  });

  function texteChrono(o, maintenant) {
    const type = TYPES_OP[o.type] || { feminin: true };
    if (o.etat === "annoncee") {
      return o.debut && o.debut > maintenant ? `début dans ${chrono(o.debut - maintenant)}` : "début imminent";
    }
    if (o.fin) return o.fin > maintenant ? `fin dans ${chrono(o.fin - maintenant)}` : "fin imminente";
    if (o.debut) return `${type.feminin ? "lancée" : "lancé"} ${ilYa(maintenant - o.debut)}`;
    return "";
  }

  function titreOp(o) {
    const type = TYPES_OP[o.type] || { nom: "Opération", feminin: true };
    let qui = "";
    if (o.attaquant === "joueurs") qui = type.feminin ? " alliée" : " allié";
    if (o.attaquant === "ia") qui = type.feminin ? " ennemie" : " ennemi";
    const annonce = o.etat === "annoncee" ? (type.feminin ? " annoncée" : " annoncé") : "";
    return type.nom + qui + annonce;
  }

  function rangOp(o) {
    if (o.etat === "en-cours" && o.attaquant === "ia") return 0; // défendre d'abord
    if (o.etat === "annoncee") return 1;
    return 2;
  }

  function rendreOps(d, maintenant) {
    vider(el.ops);
    etat.chronos = [];
    const ops = d.operations.slice().sort((a, b) => rangOp(a) - rangOp(b) || (a.debut || 0) - (b.debut || 0));
    if (!ops.length) {
      h("li", "front-vide", el.ops).textContent = "Aucun combat en cours : le front est calme.";
      return;
    }
    for (const o of ops) {
      const z = d.parId.get(o.zone);
      const li = h("li", "front-op", el.ops);
      li.dataset.attaquant = o.attaquant;
      if (o.etat === "annoncee") li.classList.add("annoncee");

      const titre = h("p", "front-op-titre", li);
      titre.textContent = `${titreOp(o)} sur ${z ? z.nom : "une zone inconnue"}`;

      const meta = h("p", "front-op-meta", li);
      if (o.vagues > 0) {
        const pips = h("span", "front-vagues", meta);
        pips.setAttribute("aria-hidden", "true");
        for (let i = 0; i < o.vagues; i++) h("i", i < o.vague ? "faite" : "", pips);
        h("span", "", meta).textContent = `vague ${o.vague} sur ${o.vagues}`;
      }
      if (o.progression !== null) {
        h("span", "", meta).textContent = `capture à ${Math.round(o.progression)} %`;
      }
      const c = h("span", "front-chrono", meta);
      c.textContent = texteChrono(o, maintenant);
      etat.chronos.push({ el: c, op: o });

      if (o.progression !== null) {
        const jauge = h("div", "front-jauge", li);
        jauge.setAttribute("aria-hidden", "true");
        h("span", "", jauge).style.width = `${o.progression}%`;
      }
      if (z) {
        li.tabIndex = 0;
        li.title = "Voir la zone sur la carte";
        const montrer = () => choisir(z.id, true);
        li.addEventListener("click", montrer);
        li.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            montrer();
          }
        });
      }
    }
  }

  function texteJournal(d, j) {
    if (j.texte) return j.texte;
    const z = d.parId.get(j.zone);
    return `${majuscule(j.type || "événement")}${z ? ` : ${z.nom}` : ""}`;
  }

  function rendreJournal(d, maintenant) {
    vider(el.journal);
    const items = d.journal.slice(0, CONFIG.journalMax);
    if (!items.length) {
      h("li", "front-vide", el.journal).textContent = "Rien à signaler pour l'instant.";
      return;
    }
    for (const j of items) {
      const li = h("li", "", el.journal);
      h("span", `front-puce ${j.camp}`, li).setAttribute("aria-hidden", "true");
      h("span", "front-j-texte", li).textContent = texteJournal(d, j);
      const t = h("time", "", li);
      t.dateTime = new Date(j.t).toISOString();
      t.dataset.t = String(j.t);
      t.textContent = ilYa(maintenant - j.t);
    }
  }

  function libelleEtat(z) {
    const fem = typeZone(z.type).feminin;
    switch (z.etat) {
      case "assaut": return "assaut en cours";
      case "fragile": return "prise récente, fragile";
      case "contre-attaque": return "contre-attaque en cours";
      case "securisee": return fem ? "sécurisée" : "sécurisé";
      case "menacee": return fem ? "menacée" : "menacé";
      default: return "";
    }
  }

  function descriptionZone(z) {
    const type = typeZone(z.type);
    if (z.camp === "neutre") {
      return `${z.nom} : ${type.nom} neutre${z.fob ? ", FOB établie" : ""}.`;
    }
    const adjectif = z.camp === "joueurs"
      ? (type.feminin ? "alliée" : "allié")
      : (type.feminin ? "ennemie" : "ennemi");
    const etatZone = libelleEtat(z);
    return `${z.nom} : ${type.nom} ${adjectif}${etatZone ? `, ${etatZone}` : ""}, `
      + `contrôle ${Math.round(z.controle)} %${z.fob ? ", FOB établie" : ""}.`;
  }

  function rendreZones(d) {
    vider(el.zones);
    el.nZones.textContent = `(${d.zones.length})`;
    const rang = z => COMBATS.has(z.etat) ? 0 : z.etat === "fragile" ? 1
      : z.camp === "joueurs" ? 2 : z.camp === "neutre" ? 3 : 4;
    const tri = d.zones.slice().sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, "fr"));
    for (const z of tri) {
      const tr = h("tr", "", el.zones);
      const th = h("th", "", tr);
      th.scope = "row";
      th.textContent = z.nom;
      h("small", "", th).textContent = majuscule(typeZone(z.type).nom);

      const tdCamp = h("td", "", tr);
      tdCamp.title = z.camp === "neutre" ? "Neutre" : d.noms[z.camp];
      h("span", `front-puce ${z.camp}`, tdCamp).setAttribute("aria-hidden", "true");
      tdCamp.append(" " + ({ joueurs: "Allié", ia: "Ennemi", neutre: "Neutre" })[z.camp]);

      h("td", "", tr).textContent = majuscule(libelleEtat(z) || "calme");
      h("td", "num", tr).textContent = z.camp === "neutre" ? "—" : `${Math.round(z.controle)} %`;
    }
  }

  function rendrePied(d) {
    if (d.demo) {
      el.pied.textContent = "Données de démonstration : le suivi passera en direct dès que le mod "
        + "Front Dynamique tournera sur le serveur.";
    } else if (etat.modeFlux) {
      el.pied.textContent = "Mise à jour en continu depuis le serveur de jeu.";
    } else {
      el.pied.textContent = `Mise à jour automatique toutes les ${duree(CONFIG.intervalle)}.`;
    }
  }

  function majStatut(maintenant) {
    const d = etat.donnees;
    let cle;
    let texte;
    if (!d) {
      if (etat.attente) {
        cle = "chargement";
        texte = "En attente du serveur";
      } else if (etat.erreur) {
        cle = "erreur";
        texte = "Flux indisponible";
      } else {
        cle = "chargement";
        texte = "Connexion…";
      }
    } else if (d.demo) {
      cle = "demo";
      texte = "Démonstration";
    } else if (!d.enLigne) {
      cle = "arret";
      texte = d.maj ? `Serveur arrêté, situation du ${dateHeure(d.maj)}` : "Serveur arrêté";
    } else {
      // ageServeur : âge annoncé par le serveur (« maj ») ; ageVu : depuis quand rien de neuf n'est arrivé ici.
      // Si « maj » change pendant la visite, le flux vit, même si les horloges ne sont pas à l'heure.
      const periode = d.intervalle > 0 ? d.intervalle : CONFIG.intervalle;
      const limite = Math.max(CONFIG.silenceMin, 2.5 * periode) * 1000;
      const ageVu = maintenant - etat.majVueA;
      const ageServeur = d.maj ? maintenant - d.maj : ageVu;
      const vivant = ageServeur <= limite || (etat.majChangee && ageVu <= limite);
      if (vivant) {
        cle = "direct";
        texte = `En direct, ${ilYa(ageServeur >= 0 && ageServeur <= limite ? ageServeur : ageVu)}`;
      } else {
        cle = "ancien";
        const age = etat.majChangee ? ageVu : Math.max(ageServeur, ageVu);
        texte = `Sans nouvelles ${ilYa(age).replace("il y a", "depuis")}`;
      }
    }
    el.statut.dataset.etat = cle;
    el.statutTexte.textContent = texte;
  }

  function afficherInfoDefaut() {
    el.info.textContent = "Touchez ou survolez une zone pour voir son état.";
  }

  function montrerZone(id) {
    const d = etat.donnees;
    const z = d && d.parId.get(id);
    if (z) el.info.textContent = descriptionZone(z);
  }

  function choisir(id, defiler) {
    etat.choisie = id;
    el.svg.querySelectorAll(".zone").forEach(g => g.classList.toggle("choisie", g.dataset.id === id));
    montrerZone(id);
    if (defiler) {
      const bas = el.svg.getBoundingClientRect().bottom;
      if (bas < 0 || el.svg.getBoundingClientRect().top > window.innerHeight) {
        el.svg.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  function afficherIndisponible() {
    vider(el.ops);
    h("li", "front-vide", el.ops).textContent = "Situation indisponible pour l'instant. Nouvel essai automatique dans "
      + `${duree(CONFIG.intervalle)}.`;
    vider(el.journal);
    el.info.textContent = "La carte s'affichera dès que le flux répondra.";
  }

  /* ---------- Interactions ---------- */

  el.svg.addEventListener("pointerover", e => {
    const g = e.target.closest && e.target.closest(".zone");
    if (g) montrerZone(g.dataset.id);
  });
  el.svg.addEventListener("pointerleave", () => {
    if (etat.choisie) montrerZone(etat.choisie);
    else afficherInfoDefaut();
  });
  el.svg.addEventListener("click", e => {
    const g = e.target.closest && e.target.closest(".zone");
    if (!g) return;
    if (etat.choisie === g.dataset.id) {
      etat.choisie = null;
      g.classList.remove("choisie");
      afficherInfoDefaut();
    } else {
      choisir(g.dataset.id, false);
    }
  });

  // Chronos et heures relatives : mis à jour chaque seconde, sans relire le flux.
  setInterval(() => {
    const maintenant = Date.now();
    majStatut(maintenant);
    for (const c of etat.chronos) c.el.textContent = texteChrono(c.op, maintenant);
    el.journal.querySelectorAll("time[data-t]").forEach(t => {
      t.textContent = ilYa(maintenant - Number(t.dataset.t));
    });
  }, 1000);

  /* ---------- Démarrage ---------- */

  const estFirebase = /firebaseio\.com|firebasedatabase\.app/i.test(CONFIG.source);
  const enFlux = CONFIG.mode === "flux" || (CONFIG.mode === "auto" && estFirebase);
  if (!(enFlux && ouvrirFlux())) {
    lire();
    planifier();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !etat.modeFlux) {
        lire();
        planifier();
      }
    });
  }
})();
