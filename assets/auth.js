/* Connexion à l'espace membres.
   Le site est statique (GitHub Pages) : la vérification se fait dans le navigateur
   à partir des empreintes de assets/comptes.js. C'est une barrière d'accès RP,
   pas une protection forte : ne rien stocker de réellement confidentiel. */
const Auth = (() => {
  const CLE_SESSION = "ch_session";
  const CLE_ECHECS = "ch_echecs";
  const DUREE_SESSION = 8 * 60 * 60 * 1000;
  const ITERATIONS = 150000;
  const MAX_ECHECS = 5;
  const BLOCAGE = 30 * 1000;

  const ESPACES = {
    medecin: { page: "medecin.html", nom: "Régiment médical", ico: "🩺", desc: "Fiches médicales et visites" },
    gca: { page: "gca.html", nom: "GCA", ico: "💣", desc: "Règles de désamorçage IED" }
  };

  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const octets = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)));

  async function empreinte(motDePasse, selHex) {
    const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: octets(selHex), iterations: ITERATIONS }, cle, 256);
    return hex(bits);
  }

  function nouveauSel() {
    return hex(crypto.getRandomValues(new Uint8Array(16)));
  }

  function lire(cle) {
    try { return JSON.parse(sessionStorage.getItem(cle)); } catch (e) { return null; }
  }

  function session() {
    const s = lire(CLE_SESSION);
    if (!s || !Array.isArray(s.roles) || s.expire < Date.now()) return null;
    return s;
  }

  function attente() {
    const e = lire(CLE_ECHECS);
    return e && e.jusqua > Date.now() ? Math.ceil((e.jusqua - Date.now()) / 1000) : 0;
  }

  async function connecter(identifiant, motDePasse) {
    const reste = attente();
    if (reste) return { ok: false, message: "Trop de tentatives. Réessayez dans " + reste + " s." };

    const id = identifiant.trim().toLowerCase();
    const compte = (window.COMPTES || []).find(c => c.identifiant.toLowerCase() === id);
    // On calcule toujours une empreinte, même si l'identifiant est inconnu.
    const calcule = await empreinte(motDePasse, compte ? compte.sel : "00000000000000000000000000000000");

    if (!compte || calcule !== compte.empreinte) {
      const e = lire(CLE_ECHECS) || { n: 0 };
      e.n += 1;
      if (e.n >= MAX_ECHECS) { e.n = 0; e.jusqua = Date.now() + BLOCAGE; }
      sessionStorage.setItem(CLE_ECHECS, JSON.stringify(e));
      return { ok: false, message: "Identifiant ou mot de passe incorrect." };
    }

    sessionStorage.removeItem(CLE_ECHECS);
    const s = { identifiant: compte.identifiant, roles: compte.roles, expire: Date.now() + DUREE_SESSION };
    sessionStorage.setItem(CLE_SESSION, JSON.stringify(s));
    return { ok: true, session: s };
  }

  function deconnecter() {
    sessionStorage.removeItem(CLE_SESSION);
    location.href = "connexion.html";
  }

  /* À appeler dans le <head> des pages protégées. */
  function exiger(role) {
    const s = session();
    if (!s || !s.roles.includes(role)) {
      location.replace("connexion.html?retour=" + role);
      return null;
    }
    document.documentElement.classList.remove("verrou");
    return s;
  }

  /* Remplit la barre de navigation de l'espace membres. */
  function barre(roleActif) {
    const s = session();
    const nav = document.getElementById("navEspace");
    if (!s || !nav) return;
    nav.textContent = "";
    for (const role of s.roles) {
      const esp = ESPACES[role];
      if (!esp) continue;
      const a = document.createElement("a");
      a.href = esp.page;
      a.textContent = esp.ico + " " + esp.nom;
      if (role === roleActif) a.className = "actif";
      nav.append(a);
    }
    const qui = document.createElement("span");
    qui.className = "qui";
    qui.textContent = s.identifiant;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Déconnexion";
    b.addEventListener("click", deconnecter);
    nav.append(qui, b);
  }

  return { ESPACES, ITERATIONS, empreinte, nouveauSel, session, connecter, deconnecter, exiger, barre };
})();
