/* PV FFE — interface mobile. Données : relais /api (pages publiques FFE), cache localStorage. */
const CFG = window.CONFIG;
const $vue = document.getElementById('vue');
const $modal = document.getElementById('modal');
// Identité du club (config.js) : titre, en-tête, couleurs
{
  const c = CFG.couleurs ?? {}, r = document.documentElement.style;
  if (c.entete) { r.setProperty('--noir', c.entete); document.querySelector('meta[name="theme-color"]').content = c.entete; }
  if (c.accent) r.setProperty('--jaune', c.accent);
  if (c.bouton) r.setProperty('--bleu', c.bouton);
  document.title = CFG.appli ?? 'PV FFE';
  document.getElementById('club').textContent = CFG.club.nom;
  const logo = document.getElementById('logo');
  if (CFG.club.logo) { logo.src = CFG.club.logo; logo.alt = CFG.club.nomComplet ?? CFG.club.nom; logo.hidden = false; }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Tout ce que le téléphone garde est rangé sous la saison de config.js : la FFE réattribue les numéros
// de groupe d'une saison à l'autre. Au changement de saison, les anciennes données sont effacées.
const SAISON = CFG.saison + '|';
const lire = (k, d = null) => { try { return JSON.parse(localStorage.getItem(SAISON + k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(SAISON + k, JSON.stringify(v)); } catch {} };
const oublier = (k) => { try { localStorage.removeItem(SAISON + k); } catch {} };
try { Object.keys(localStorage).filter((k) => !k.startsWith(SAISON)).forEach((k) => localStorage.removeItem(k)); } catch {}

async function api(path, init) {
  let r;
  try { r = await fetch('/api/' + path, init); } catch (e) {
    if (init) throw new Error('réseau indisponible');
    await new Promise((ok) => setTimeout(ok, 1500));
    r = await fetch('/api/' + path).catch(() => { throw new Error('réseau indisponible'); });
  }
  const d = await r.json();
  if (!r.ok) throw new Error(d.erreur || r.status);
  // Âge de la copie du relais, en ms (0 si la donnée vient d'être lue sur le site FFE)
  api.age = 1000 * (+r.headers.get('X-Age') || 0);
  return d;
}
// Données en cache d'abord (affichage immédiat), puis rafraîchissement réseau.
const enCache = (path) => lire('c:' + path)?.d ?? null;
const etat = {}; // path -> 'charge' | 'erreur : ...' | ''
// copieSeule : ne jamais demander de relecture du site FFE (fiches clubs et joueurs, rechargées le lundi par le relais)
async function charger(path, dureeMs, fresh, copieSeule) {
  if (etat[path] === 'charge') return;
  const c = lire('c:' + path);
  if (!fresh && c && Date.now() - c.t < dureeMs) return;
  etat[path] = 'charge';
  rendre();
  // Une réponse vide (page FFE en erreur) ne remplace pas de bonnes données.
  const garder = (d, t) => { if (Array.isArray(d) ? d.length || !c : d.rondes?.length || !c) ecrire('c:' + path, { t, d }); };
  try {
    // 1) copie du relais : immédiate. 2) si elle est trop vieille, relecture du site FFE (~30 s).
    let d = await api(path + (fresh ? '?fresh' : ''));
    const ageCopie = api.age;
    garder(d, Date.now() - ageCopie);
    if (ageCopie > dureeMs && !copieSeule) {
      rendre();
      d = await api(path + '?fresh');
      garder(d, Date.now());
    }
    etat[path] = '';
  } catch (e) { etat[path] = 'erreur : ' + e.message; }
  rendre();
}
const age = (path) => {
  const t = lire('c:' + path)?.t;
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};
const MIN = 60000, H = 3600000;
const pGroupe = (id) => 'groupe/' + id;
const pClub = (ref) => `club/${ref}/equipes`;
const pJoueurs = (id) => `equipe/${id}/joueurs`;
const estClub = (nom) => nom.startsWith(CFG.club.nom);
const joue = (m, nom) => m.dom === nom || m.ext === nom;

// Équipes du club dans les groupes suivis : [{ id, nom, groupe, division, groupeNom }]
function equipesClub() {
  const liste = enCache(pClub(CFG.club.ref));
  if (liste) return liste.filter((e) => CFG.groupes.includes(e.groupe)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));
  // Secours tant que la fiche club n'est pas chargée : noms lus dans les classements
  return CFG.groupes.flatMap((g) => (enCache(pGroupe(g))?.classement ?? []).filter((e) => estClub(e.equipe)).map((e) => ({ id: 0, nom: e.equipe, groupe: g })));
}
// Identifiant FFE d'une équipe d'un groupe (via la fiche de son club)
function idEquipe(nom, groupe) {
  const ref = enCache(pGroupe(groupe))?.classement.find((e) => e.equipe === nom)?.clubRef;
  return (ref && enCache(pClub(ref))?.find((e) => e.nom === nom && e.groupe === groupe)?.id) || 0;
}

/* ---------- Vue Résultats ---------- */
let sel = lire('sel', { ronde: 0, equipe: '', groupe: 0 }); // équipe affichée, ou ronde compilée

function ligneMatch(m, fort) {
  return `<tr class="${fort ? 'club' : ''}"><td class="dom">${esc(m.dom)}</td><td class="sc">${/\d/.test(m.sd) ? esc(m.sd) + ' - ' + esc(m.se) : '-'}</td><td class="ext">${esc(m.ext)}</td></tr>`;
}

function vueResultats() {
  const eqs = equipesClub();
  if (!sel.ronde && !eqs.some((e) => e.nom === sel.equipe && e.groupe === sel.groupe) && eqs[0]) sel = { ronde: 0, equipe: eqs[0].nom, groupe: eqs[0].groupe };
  const nbRondes = Math.max(0, ...CFG.groupes.map((g) => enCache(pGroupe(g))?.rondes.length ?? 0));
  const enCours = Object.values(etat).includes('charge');
  let h = `<div class="chips">${eqs.map((e) => `<button data-e="${esc(e.nom)}" data-g="${e.groupe}" class="${!sel.ronde && e.nom === sel.equipe && e.groupe === sel.groupe ? 'actif' : ''}">${esc(e.nom)}</button>`).join('')}</div>`;
  h += `<div class="chips">${Array.from({ length: nbRondes }, (_, i) => `<button data-r="${i + 1}" class="${sel.ronde === i + 1 ? 'actif' : ''}">Ronde ${i + 1}</button>`).join('')}</div>`;
  h += `<p class="note ligne"><span>${enCours ? 'Actualisation… (le site FFE est lent)' : ''}</span><button class="btn" id="maj">Actualiser</button></p>`;

  if (sel.ronde) {
    h += `<div class="carte"><h2>Ronde ${sel.ronde} — équipes de ${esc(CFG.club.nom)}</h2><table class="cal">`;
    for (const e of eqs) {
      const m = enCache(pGroupe(e.groupe))?.rondes.find((r) => r.n === sel.ronde)?.matchs.find((m) => joue(m, e.nom));
      h += `<tr><td colspan="3" class="div">${esc(e.nom)}${e.division ? ' · ' + esc(e.division) : ''}</td></tr>`;
      h += m ? ligneMatch(m, false) : '<tr><td colspan="3" class="note">Pas de match</td></tr>';
    }
    h += '</table></div>';
  } else if (sel.groupe) {
    const path = pGroupe(sel.groupe), g = enCache(path);
    if (g) {
      h += `<p class="note">${esc(g.titre)} — ${age(path)}</p>`;
      h += `<div class="carte"><h2>Classement</h2><table><tr><th class="n">Pl.</th><th>Équipe</th><th class="n">Pts</th><th class="n">J.</th><th class="n">Diff.</th><th class="n">P.</th><th class="n">C.</th></tr>
        ${g.classement.map((e) => `<tr class="${e.equipe === sel.equipe ? 'club' : ''}"><td class="n">${e.pl}</td><td>${esc(e.equipe)}</td><td class="n">${esc(e.pts)}</td><td class="n">${esc(e.j)}</td><td class="n">${esc(e.d)}</td><td class="n">${esc(e.p)}</td><td class="n">${esc(e.c)}</td></tr>`).join('')}</table></div>`;
      h += `<div class="carte"><h2>Calendrier</h2>${g.rondes.map((r) => `<h3 class="ronde">${r.matchs.some((m) => /\d/.test(m.sd)) ? `<button class="btn" data-detail="${r.n}">Ronde ${r.n} — détail des parties ›</button>` : `Ronde ${r.n}`}</h3><table class="cal">${r.matchs.map((m) => ligneMatch(m, joue(m, sel.equipe))).join('')}</table>`).join('')}</div>`;
    } else h += `<p class="note ${etat[path]?.startsWith('erreur') ? 'err' : ''}">${esc(etat[path] && etat[path] !== 'charge' ? etat[path] : 'Chargement…')}</p>`;
  }
  $vue.innerHTML = h;
  const choisir = (s) => { sel = s; ecrire('sel', sel); rendre(); };
  $vue.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => choisir({ ronde: 0, equipe: b.dataset.e, groupe: +b.dataset.g })));
  $vue.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => choisir({ ...sel, ronde: +b.dataset.r })));
  document.getElementById('maj').onclick = () => chargerTout(true);
  $vue.querySelectorAll('[data-detail]').forEach((b) => (b.onclick = () => detailRonde(sel.groupe, +b.dataset.detail, sel.equipe)));
}

// Popup : parties de chaque match d'une ronde (page « Ronde n » du site FFE)
async function detailRonde(groupe, n, equipe) {
  const path = `groupe/${groupe}/ronde/${n}`;
  const fermer = () => { $modal.hidden = true; $modal.innerHTML = ''; if (attente) rendre(); };
  const dessiner = (corps) => {
    $modal.hidden = false;
    $modal.innerHTML = `<div class="carte large"><div class="ligne"><h2 style="margin:0;flex:1">Ronde ${n}</h2><button class="btn" id="fermer">Fermer</button></div>${corps}</div>`;
    document.getElementById('fermer').onclick = fermer;
  };
  const contenu = (matchs) => [...matchs].sort((a, b) => joue(b, equipe) - joue(a, equipe)).map((m) => `<table class="cal detail">
    <tr class="club"><td class="dom">${esc(m.dom)}</td><td class="sc">${esc(m.score)}</td><td class="ext">${esc(m.ext)}</td></tr>
    ${m.parties.map((p) => `<tr><td class="dom">${esc(p.g)}</td><td class="sc">${esc(p.res)}</td><td class="ext">${esc(p.d)}</td></tr>`).join('')}</table>`).join('');
  $modal.onclick = (e) => { if (e.target === $modal) fermer(); };
  const c = lire('c:' + path);
  dessiner(c ? contenu(c.d) : '<p class="note">Chargement… (le site FFE est lent)</p>');
  // Une ronde complète ne change plus : pas de nouvelle requête pendant une semaine
  if (c && Date.now() - c.t < (c.d.every((m) => /\d/.test(m.score)) ? 168 * H : 10 * MIN)) return;
  try {
    const d = await api(path);
    if (d.length) ecrire('c:' + path, { t: Date.now(), d });
    if (!$modal.hidden) dessiner(d.length ? contenu(d) : '<p class="note">Aucun détail publié pour cette ronde.</p>');
  } catch (e) { if (!c && !$modal.hidden) dessiner(`<p class="err">Erreur : ${esc(e.message)}</p>`); }
}

async function chargerTout(fresh) {
  // Un par un : le site FFE supporte mal les requêtes parallèles. Groupe affiché d'abord.
  await charger(pClub(CFG.club.ref), 6 * H, false, true);
  const ordre = [...new Set([session?.equipe.groupe, sel.groupe, ...CFG.groupes].filter(Boolean))];
  for (const g of ordre) await charger(pGroupe(g), 10 * MIN, fresh);
}

/* ---------- Connexion capitaine ---------- */
// Identifiants gardés en mémoire seulement : redemandés à chaque ouverture de l'appli.
let session = null; // { equipe, login, password, verif: 'encours' | 'ok' | 'inconnu' }
let msgConnexion = '';

function vueConnexion() {
  const eqs = equipesClub().filter((e) => e.id);
  const dernier = lire('derniereEquipe');
  const avant = ['cEq', 'cLogin', 'cPwd'].map((id) => document.getElementById(id)?.value);
  $vue.innerHTML = `<form class="carte" id="cnx"><h2>Saisie d'une feuille de match</h2>
    <label>Équipe</label><select id="cEq">${eqs.map((e) => `<option value="${e.id}" ${e.id === dernier ? 'selected' : ''}>${esc(e.nom)} — ${esc(e.division)}</option>`).join('')}</select>
    <label>Code FFE (identifiant du site fédéral)</label><input id="cLogin" autocomplete="username" autocapitalize="characters" required>
    <label>Mot de passe FFE</label><input id="cPwd" type="password" autocomplete="current-password" required>
    ${msgConnexion ? `<p class="err">${esc(msgConnexion)}</p>` : ''}
    <p class="ligne"><button class="btn plein" ${eqs.length ? '' : 'disabled'}>Entrer</button>
      <button type="button" class="btn" id="demo" ${eqs.length ? '' : 'disabled'}>Mode démo (sans identifiants)</button></p>
    <p class="note">${eqs.length ? 'Les identifiants sont vérifiés auprès de la FFE et ne sont pas conservés : ils sont redemandés à chaque ouverture.' : 'Chargement de la liste des équipes… (le site FFE est lent)'}</p></form>`;
  ['cEq', 'cLogin', 'cPwd'].forEach((id, i) => { if (avant[i]) document.getElementById(id).value = avant[i]; });
  document.getElementById('demo').onclick = () => {
    session = { equipe: eqs.find((e) => e.id === +document.getElementById('cEq').value), demo: true, verif: 'demo' };
    msgConnexion = ''; ronde = 0; recap = false;
    rendre(); chargerFeuille();
  };
  document.getElementById('cnx').onsubmit = (ev) => {
    ev.preventDefault();
    const equipe = eqs.find((e) => e.id === +document.getElementById('cEq').value);
    const s = (session = { equipe, login: document.getElementById('cLogin').value.trim(), password: document.getElementById('cPwd').value, verif: 'encours' });
    ecrire('derniereEquipe', equipe.id);
    msgConnexion = ''; ronde = 0; recap = false;
    document.activeElement?.blur();
    rendre(); chargerFeuille();
    // Vérification en arrière-plan (jusqu'à une minute le soir) : la saisie commence tout de suite.
    api('connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: s.login, password: s.password }) })
      .then((r) => {
        if (session !== s) return;
        if (r.ok) s.verif = 'ok';
        else { session = null; msgConnexion = 'Identifiants refusés par la FFE.'; }
      })
      .catch(() => { if (session === s) s.verif = 'inconnu'; })
      .finally(rendre);
  };
}

/* ---------- Vue Feuille de match ---------- */
const RES = [['GainBlanc', '1 - 0'], ['Nulle', '½ - ½'], ['GainNoir', '0 - 1']];
const RES_AUTRES = [
  ['GainBlancForfait', 'Gain gauche par forfait'], ['GainNoirForfait', 'Gain droite par forfait'],
  ['DoubleDefaite', 'Double défaite'], ['NonAttribue', 'Non attribué'], ['Ajourne', 'Ajourné'],
];
const LIB_RES = Object.fromEntries([...RES, ...RES_AUTRES]);
let ronde = 0;
let recap = false;

const monMatch = (r) => r.matchs.find((m) => joue(m, session.equipe.nom));
const dejaSaisie = (r) => { const m = monMatch(r); return !m || /\d/.test(m.sd); };
const cleFeuille = () => `feuille${session.demo ? '-demo' : ''}:${session.equipe.id}:${ronde}`;
// Un seul objet en mémoire par feuille : les mises à jour asynchrones (codes FFE) ne s'écrasent pas.
let courante = { cle: null, f: null };
function feuille() {
  if (courante.cle !== cleFeuille() || !lire(cleFeuille())) courante = { cle: cleFeuille(), f: feuilleStockee() };
  return courante.f;
}
function feuilleStockee() {
  const f = lire(cleFeuille());
  if (f) return f;
  const m = monMatch(enCache(pGroupe(session.equipe.groupe)).rondes.find((r) => r.n === ronde));
  return {
    gauche: m.dom, droite: m.ext,
    ech: Array.from({ length: CFG.echiquiers }, () => ({ g: null, d: null, res: '' })),
    capG: null, capD: null, arbitre: null, commentaire: '',
  };
}
const sauver = (f) => ecrire(cleFeuille(), f);
const clubRef = (equipe) => enCache(pGroupe(session.equipe.groupe))?.classement.find((e) => e.equipe === equipe)?.clubRef ?? '';
const joueursDe = (equipe) => { const id = idEquipe(equipe, session.equipe.groupe); return id ? enCache(pJoueurs(id)) ?? [] : []; };
const code = (j) => (j?.ffe ? j.ffe.split(' - ')[0] : '');

// Règle FFE (inc_equipe.js) : seules les victoires comptent, forfaits compris ; une nulle ne rapporte rien.
function score(f) {
  let g = 0, d = 0;
  for (const e of f.ech) {
    if (e.res === 'GainBlanc' || e.res === 'GainBlancForfait') g++;
    else if (e.res === 'GainNoir' || e.res === 'GainNoirForfait') d++;
  }
  return [g, d];
}

// Liste déroulante de personnes : joueurs d'une ou plusieurs équipes + recherche libre
function selPersonne(equipes, j, attr, autre = 'Autre joueur (recherche)…') {
  const groupes = equipes.map((eq) => [eq, joueursDe(eq)]);
  const connu = j && groupes.some(([, l]) => l.some((p) => p.nom === j.nom));
  const opts = (eq, l) => l.map((p) => `<option value="${esc(p.nom)}" data-eq="${esc(eq)}" ${j?.nom === p.nom ? 'selected' : ''}>${esc(p.nom)} (${esc(p.elo)})</option>`).join('');
  return `<select ${attr}><option value="">— choisir —</option>
    ${groupes.length > 1 ? groupes.map(([eq, l]) => `<optgroup label="${esc(eq)}">${opts(eq, l)}</optgroup>`).join('') : opts(...groupes[0])}
    ${j && !connu ? `<option value="${esc(j.nom)}" selected>${esc(j.nom)}</option>` : ''}
    <option value="__autre">${autre}</option></select>`;
}

const lib = (j) => j?.ffe ?? j?.nom ?? '?';
function texteRecap(f) {
  const [g, d] = score(f);
  const l = [`Ronde ${ronde} — ${f.gauche} ${g} - ${d} ${f.droite}`, ''];
  f.ech.forEach((e, i) => l.push(`${i + 1}. ${lib(e.g)}  [${LIB_RES[e.res] ?? '?'}]  ${lib(e.d)}`));
  l.push('', `Capitaines : ${lib(f.capG)} / ${lib(f.capD)}`, `Arbitre : ${f.arbitre?.ffe ?? 'aucun'}`);
  if (f.commentaire) l.push('Commentaire : ' + f.commentaire);
  return l.join('\n');
}

function manques(f) {
  const m = [];
  f.ech.forEach((e, i) => {
    if (!e.res) m.push(`résultat éch. ${i + 1}`);
    if (!/Forfait|NonAttribue|DoubleDefaite/.test(e.res) && (!code(e.g) || !code(e.d))) m.push(`code FFE éch. ${i + 1}`);
  });
  const codes = f.ech.flatMap((e) => [code(e.g), code(e.d)]).filter(Boolean);
  const doubles = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
  if (doubles.length) m.push('joueur en double (' + doubles.join(', ') + ')');
  if (!f.capG?.ffe) m.push('capitaine ' + f.gauche);
  if (!f.capD?.ffe) m.push('capitaine ' + f.droite);
  if (!f.arbitre?.ffe) m.push('arbitre FFE');
  return m;
}

function etatJoueurs(equipe) {
  const g = session.equipe.groupe, id = idEquipe(equipe, g);
  const path = id ? pJoueurs(id) : pClub(clubRef(equipe));
  if (id && enCache(path)) return '';
  return etat[path]?.startsWith('erreur') ? `<p class="err">Joueurs de ${esc(equipe)} : ${esc(etat[path])} <button class="btn" data-retry>Réessayer</button></p>`
    : `<p class="note">Chargement des joueurs de ${esc(equipe)}… (le site FFE est lent ; la recherche « Autre joueur » fonctionne déjà)</p>`;
}

function vueFeuille() {
  if (!session) return vueConnexion();
  const eq = session.equipe, g = enCache(pGroupe(eq.groupe));
  const verif = { encours: 'vérification des identifiants…', ok: 'identifiants vérifiés ✓', inconnu: 'identifiants non vérifiés (FFE injoignable)', demo: 'mode démo : aucun envoi possible' }[session.verif];
  let h = `<p class="note ligne"><b>${esc(eq.nom)}</b><span>${verif}</span><button class="btn" id="quitter">Quitter</button></p>`;
  if (!g) { $vue.innerHTML = h + '<p class="note">Chargement du calendrier… (le site FFE est lent)</p>'; brancherQuitter(); return; }
  const libres = g.rondes.filter((r) => !dejaSaisie(r));
  if (!libres.some((r) => r.n === ronde)) ronde = libres[0]?.n ?? 0;
  h += `<div class="chips">${g.rondes.map((r) => `<button data-r="${r.n}" ${dejaSaisie(r) ? 'disabled' : ''} class="${r.n === ronde ? 'actif' : ''}">Ronde ${r.n}</button>`).join('')}</div>`;
  if (!ronde) { $vue.innerHTML = h + '<p class="note">Toutes les rondes sont déjà saisies sur le site de la FFE.</p>'; brancherQuitter(); return; }
  const f = feuille();
  const [sg, sd] = score(f);

  if (recap) {
    const m = manques(f);
    const occupe = envoi?.encours;
    h += `<div class="carte"><h2>Récapitulatif</h2><pre id="txt">${esc(texteRecap(f))}</pre>
      ${f.envoyee ? `<p class="ok">Feuille enregistrée sur le site FFE le ${esc(f.envoyee)}.</p>` : ''}
      ${m.length ? `<p class="err">Il manque : ${esc(m.join(', '))}</p>` : '<p class="note">Feuille complète.</p>'}
      <div class="ligne"><button class="btn" id="retour" ${occupe ? 'disabled' : ''}>Modifier</button><button class="btn" id="copier">Copier</button></div>
      <div class="ligne" style="margin-top:10px">
        <button class="btn" id="tester" ${occupe || session.demo ? 'disabled' : ''}>Tester sans enregistrer</button>
        <button class="btn plein" id="envoyer" ${occupe || m.length || f.envoyee || session.demo ? 'disabled' : ''}>Envoyer à la FFE</button></div>
      ${session.demo ? '<p class="note">Mode démo : le test et l’envoi demandent une connexion avec les identifiants FFE.</p>' : ''}
      <p class="note">« Tester » ouvre le formulaire FFE sur ce match sans rien enregistrer. « Envoyer » l'enregistre : la feuille part au directeur de groupe. Compter 4 à 5 minutes le soir.</p>
      ${vueEnvoi()}</div>`;
    $vue.innerHTML = h;
    document.getElementById('retour').onclick = () => { recap = false; envoi = null; rendre(); };
    document.getElementById('copier').onclick = (e) => navigator.clipboard?.writeText(texteRecap(f)).then(() => (e.target.textContent = 'Copié'));
    document.getElementById('tester').onclick = () => envoyer(f, false);
    document.getElementById('envoyer').onclick = (e) => {
      if (e.target.dataset.sur) envoyer(f, true);
      else { e.target.dataset.sur = 1; e.target.textContent = 'Confirmer l’envoi définitif'; }
    };
  } else {
    h += `<div class="carte"><h2>${esc(f.gauche)} — ${esc(f.droite)}</h2>
      <p class="note">À gauche : l'équipe qui a les Blancs au 1er échiquier. « 1 - 0 » = gain du joueur de gauche. Score du match : seules les victoires comptent (règle FFE).</p>
      <div class="score">${sg} - ${sd}</div>
      <div class="ligne"><button class="btn" id="inverser">Inverser gauche / droite</button>
        <span class="note">Échiquiers :</span><button class="btn" id="moins">−</button><b>${f.ech.length}</b><button class="btn" id="plus">+</button></div>
      ${etatJoueurs(f.gauche)}${etatJoueurs(f.droite)}
      ${f.ech.map((e, i) => `<div class="ech"><div class="num">Échiquier ${i + 1}</div>
        <div class="joueur"><span class="coul ${i % 2 ? 'n' : 'b'}"></span>${selPersonne([f.gauche], e.g, `data-j="${i}:g"`)}<span class="code">${esc(code(e.g))}</span></div>
        <div class="joueur"><span class="coul ${i % 2 ? 'b' : 'n'}"></span>${selPersonne([f.droite], e.d, `data-j="${i}:d"`)}<span class="code">${esc(code(e.d))}</span></div>
        <div class="res">${RES.map(([v, t]) => `<button data-res="${i}:${v}" class="${e.res === v ? 'actif' : ''}">${t}</button>`).join('')}
          <select data-autre="${i}"><option value="">Autre</option>${RES_AUTRES.map(([v, t]) => `<option value="${v}" ${e.res === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      </div>`).join('')}
      <div class="ech">
        <label>Capitaine ${esc(f.gauche)}</label><div class="joueur">${selPersonne([f.gauche], f.capG, 'data-cap="capG"')}</div>
        <label>Capitaine ${esc(f.droite)}</label><div class="joueur">${selPersonne([f.droite], f.capD, 'data-cap="capD"')}</div>
        <label>Arbitre</label><div class="joueur">${selPersonne([f.gauche, f.droite], f.arbitre, 'id="arbitre"', 'Autre arbitre (recherche)…')}</div>
        ${f.arbitre?.inconnu ? `<p class="err">${esc(f.arbitre.nom)} n'est pas arbitre à la FFE : l'envoi est bloqué tant qu'aucun arbitre FFE n'est choisi.</p>` : f.arbitre?.ffe ? `<p class="note">${esc(f.arbitre.ffe)}</p>` : ''}
        <label>Commentaire et réclamations</label><textarea id="com" rows="2">${esc(f.commentaire)}</textarea>
      </div>
      <div class="ligne" style="margin-top:10px"><button class="btn plein" id="recap">Récapitulatif</button><button class="btn" id="vider">Effacer la feuille</button></div>
      <p class="note">Enregistré automatiquement sur ce téléphone.</p></div>`;
    $vue.innerHTML = h;

    document.getElementById('inverser').onclick = () => {
      [f.gauche, f.droite] = [f.droite, f.gauche];
      [f.capG, f.capD] = [f.capD, f.capG];
      const inv = { GainBlanc: 'GainNoir', GainNoir: 'GainBlanc', GainBlancForfait: 'GainNoirForfait', GainNoirForfait: 'GainBlancForfait' };
      f.ech.forEach((e) => { [e.g, e.d] = [e.d, e.g]; e.res = inv[e.res] ?? e.res; });
      sauver(f); rendre();
    };
    document.getElementById('plus').onclick = () => { if (f.ech.length < 10) f.ech.push({ g: null, d: null, res: '' }); sauver(f); rendre(); };
    document.getElementById('moins').onclick = () => { if (f.ech.length > 1) f.ech.pop(); sauver(f); rendre(); };
    $vue.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = () => chargerFeuille()));
    $vue.querySelectorAll('[data-res]').forEach((b) => (b.onclick = () => {
      const [i, v] = b.dataset.res.split(':');
      f.ech[i].res = f.ech[i].res === v ? '' : v;
      sauver(f); rendre();
    }));
    $vue.querySelectorAll('[data-autre]').forEach((s) => (s.onchange = () => { f.ech[s.dataset.autre].res = s.value; sauver(f); rendre(); }));
    // actions = recherches FFE à essayer dans l'ordre pour retrouver le code (j1 joueur, jr capitaine, ar arbitre)
    const choisir = (s, equipe, actions, poser) => {
      if (s.value === '__autre') return chercher(actions[0], clubRef(equipe), (ligne) => { poser(depuisLigne(ligne)); sauver(f); rendre(); }, rendre);
      if (!s.value) { poser(null); sauver(f); return rendre(); }
      const j = { nom: s.value };
      const club = clubRef(s.selectedOptions[0].dataset.eq ?? equipe);
      poser(j); sauver(f); rendre();
      // La recherche FFE ne porte que sur le nom de famille (les mots en majuscules).
      const famille = j.nom.split(' ').filter((m, i) => i === 0 || m === m.toUpperCase()).join(' ');
      (async () => {
        for (const a of actions) {
          const l = await api(`recherche?action=${a}&club=${a === 'ar' ? '' : club}&q=${encodeURIComponent(famille)}`);
          const ligne = l.find((x) => x.includes(j.nom));
          if (ligne) { j.ffe = ligne; sauver(f); return rendre(); }
        }
        j.inconnu = true; sauver(f); rendre();
      })().catch(() => {});
    };
    $vue.querySelectorAll('[data-j]').forEach((s) => (s.onchange = () => {
      const [i, c] = s.dataset.j.split(':');
      choisir(s, c === 'g' ? f.gauche : f.droite, ['j1'], (j) => (f.ech[i][c] = j));
    }));
    $vue.querySelectorAll('[data-cap]').forEach((s) => (s.onchange = () => {
      const k = s.dataset.cap;
      choisir(s, k === 'capG' ? f.gauche : f.droite, ['jr'], (j) => (f[k] = j));
    }));
    const arb = document.getElementById('arbitre');
    arb.onchange = () => choisir(arb, f.gauche, ['ar'], (j) => (f.arbitre = j));
    document.getElementById('com').oninput = (e) => { f.commentaire = e.target.value; sauver(f); };
    document.getElementById('recap').onclick = () => { recap = true; rendre(); window.scrollTo(0, 0); };
    document.getElementById('vider').onclick = (e) => {
      if (e.target.dataset.sur) { oublier(cleFeuille()); rendre(); }
      else { e.target.dataset.sur = 1; e.target.textContent = 'Confirmer l’effacement'; }
    };
  }
  $vue.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { ronde = +b.dataset.r; recap = false; rendre(); chargerFeuille(); }));
  brancherQuitter();
}
function brancherQuitter() {
  document.getElementById('quitter').onclick = () => { session = null; msgConnexion = ''; rendre(); };
}

/* ---------- Envoi du PV : rejoue le formulaire SaisiePV.aspx étape par étape via le relais ---------- */
let envoi = null; // { encours, reel, etapes: [{ t, etat }], erreur, bilan, bilanOk, detail }
const PF = 'ctl00$ContentPlaceHolderMain$';
const post = (path, data) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function vueEnvoi() {
  if (!envoi) return '';
  const ic = { fait: '✓', encours: '…', erreur: '✗' };
  return `<div class="ech"><div class="num">${envoi.reel ? 'Envoi à la FFE' : 'Test sans enregistrement'}</div>
    ${envoi.etapes.map((e) => `<div class="etape ${e.etat}">${ic[e.etat]} ${esc(e.t)}</div>`).join('')}
    ${envoi.erreur ? `<p class="err">${esc(envoi.erreur)}</p>` : ''}
    ${envoi.bilan ? `<p class="${envoi.bilanOk ? 'ok' : 'err'}">${esc(envoi.bilan)}</p>` : ''}
    ${envoi.detail ? `<pre>${esc(envoi.detail)}</pre>` : ''}</div>`;
}

// Valeurs finales du formulaire FFE pour une feuille (mêmes calculs que inc_equipe.js, règle « Adulte »)
function champsFeuille(f) {
  const [g, d] = score(f);
  const c = {};
  f.ech.forEach((e, i) => {
    const r = `${PF}RepeaterBoards$ctl${String(i).padStart(2, '0')}$`;
    c[r + 'TextNrFFEBl'] = e.g?.ffe ?? '';
    c[r + 'DropDownResult'] = e.res || 'None';
    c[r + 'TextNrFFENr'] = e.d?.ffe ?? '';
  });
  c[PF + 'DropPtsBl$DropDownDecimal'] = g.toFixed(1);
  c[PF + 'DropPtsNr$DropDownDecimal'] = d.toFixed(1);
  c[PF + 'DropPtsMatchBl$DropDownNumeric'] = g > d ? '3' : g < d ? '1' : '2';
  c[PF + 'DropPtsMatchNr$DropDownNumeric'] = d > g ? '3' : d < g ? '1' : '2';
  c[PF + 'TextCapitaineBl'] = f.capG?.ffe ?? '';
  c[PF + 'TextCapitaineNr'] = f.capD?.ffe ?? '';
  c[PF + 'TextArbitre'] = f.arbitre?.ffe ?? '';
  c[PF + 'TextCommentaire'] = f.commentaire ?? '';
  return c;
}

async function envoyer(f, reel) {
  const s = session, eq = s.equipe;
  const e = (envoi = { encours: true, reel, etapes: [] });
  let form;
  // Une étape = une requête FFE (~30 s). Les étapes de préparation sont retentées une fois ; l'enregistrement jamais.
  const etape = async (t, fn, essais = 2) => {
    const et = { t, etat: 'encours' };
    e.etapes.push(et); rendre();
    for (let n = 1; ; n++) {
      try { form = await fn(); break; } catch (err) {
        if (n >= essais || /refus|expir|invalide/.test(err.message)) { et.etat = 'erreur'; throw err; }
      }
    }
    et.etat = 'fait'; rendre();
  };
  const choisir = (cible, valeur) => () => post('pv/etape', { cookie: form.cookie, cible, champs: { ...form.champs, [PF + cible]: valeur } });
  const option = (cible, texte) => {
    const o = form.options[cible]?.find((o) => sansAccent(o.t) === sansAccent(texte));
    if (!o) throw new Error(`« ${texte} » introuvable dans la liste ${cible} du formulaire FFE`);
    return o.v;
  };
  try {
    await etape('Connexion et ouverture du formulaire', () => post('pv/ouvrir', { login: s.login, password: s.password }));
    await etape('Compétition : ' + eq.competition, choisir('SelectCompetition', option('SelectCompetition', eq.competition)));
    await etape('Division : ' + eq.division, choisir('SelectDivision', option('SelectDivision', eq.division)));
    await etape('Groupe : ' + eq.groupeNom, choisir('SelectGroupe', String(eq.groupe)));
    if (!form.pret) throw new Error('Le formulaire de saisie ne s’est pas ouvert. Réponse FFE : ' + form.texte.slice(0, 300));
    for (const [cible, nom] of [['DropDownEquipeBlanc', f.gauche], ['DropDownEquipeNoir', f.droite]]) {
      const v = option(cible, nom);
      if (form.champs[PF + cible] !== v) await etape('Équipe : ' + nom, choisir(cible, v));
    }
    if (form.echiquiers !== f.ech.length) throw new Error(`Le formulaire FFE attend ${form.echiquiers} échiquiers, la feuille en a ${f.ech.length}.`);
    if (form.regle && form.regle !== 'Adulte') throw new Error(`Barème « ${form.regle} » non géré par l'appli : saisir cette feuille sur le site FFE.`);
    const valeurs = champsFeuille(f);
    const inconnus = Object.keys(valeurs).filter((k) => !(k in form.champs) && !k.endsWith('TextCommentaire')); // commentaire facultatif
    if (inconnus.length) throw new Error('Champs absents du formulaire FFE : ' + inconnus.map((k) => k.replace(PF, '')).join(', '));
    if (!reel) {
      e.bilanOk = true;
      e.bilan = 'Test réussi : le formulaire FFE est ouvert sur le bon match et prêt à recevoir la feuille. Rien n’a été enregistré.';
      e.detail = Object.entries(valeurs).map(([k, v]) => `${k.replace(PF, '').replace('RepeaterBoards$', '')} = ${v}`).join('\n');
    } else {
      await etape('Enregistrement de la feuille', () => post('pv/etape', { cookie: form.cookie, cible: 'LinkCmdSave', confirme: true, champs: { ...form.champs, ...valeurs } }), 1);
      e.bilanOk = /enregistr/i.test(form.texte) && !/erreur|incorrect|invalide|inconnu/i.test(form.texte);
      e.bilan = e.bilanOk ? 'La FFE confirme l’enregistrement.' : 'Réponse FFE à vérifier ci-dessous : l’enregistrement n’est pas confirmé.';
      e.detail = form.texte.slice(0, 700);
      if (e.bilanOk) { f.envoyee = new Date().toLocaleString('fr-FR'); sauver(f); charger(pGroupe(eq.groupe), 0, true); }
    }
  } catch (err) {
    e.erreur = err.message;
    if (reel && e.etapes.at(-1)?.t.startsWith('Enregistrement')) e.erreur += ' — Ne pas renvoyer sans avoir vérifié sur le site FFE si la feuille est passée.';
  }
  e.encours = false;
  rendre();
}

// "Y22506 - PIHAN Daniel 1613" ou "J52814 - NOM Prénom - Arbitre…" -> { nom, ffe }
function depuisLigne(ligne) {
  return { nom: (ligne.split(' - ')[1] ?? ligne).replace(/\s+\d+$/, ''), ffe: ligne };
}

function chercher(action, club, surChoix, surAnnul) {
  $modal.hidden = false;
  $modal.innerHTML = `<div class="carte"><h2>Rechercher : ${action === 'ar' ? 'arbitre' : 'joueur'}</h2>
    <input id="q" placeholder="Code FFE ou début du nom de famille" autocomplete="off">
    <ul id="resq"></ul><button class="btn" id="fermer">Annuler</button></div>`;
  const q = document.getElementById('q'), ul = document.getElementById('resq');
  const fermer = () => { $modal.hidden = true; $modal.innerHTML = ''; };
  let t, n = 0;
  q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const v = q.value.trim(), moi = ++n;
      if (v.length < 2) return (ul.innerHTML = '');
      ul.innerHTML = '<li class="note">Recherche…</li>';
      try {
        const l = await api(`recherche?action=${action}&club=${action === 'ar' ? '' : club}&q=${encodeURIComponent(v)}`);
        if (moi !== n) return;
        ul.innerHTML = l.length ? l.map((x) => `<li>${esc(x)}</li>`).join('') : '<li class="note">Aucun résultat (essayer le code FFE)</li>';
        ul.querySelectorAll('li:not(.note)').forEach((li) => (li.onclick = () => { fermer(); surChoix(li.textContent); }));
      } catch (e) { ul.innerHTML = `<li class="note err">Erreur : ${esc(e.message)}</li>`; }
    }, 300);
  };
  document.getElementById('fermer').onclick = () => { fermer(); surAnnul?.(); };
  q.focus();
}

// Charge calendrier, fiches clubs et listes de joueurs des deux équipes de la feuille en cours
async function chargerFeuille() {
  const s = session;
  if (!s) return;
  await charger(pGroupe(s.equipe.groupe), 10 * MIN);
  if (session !== s || !ronde) return;
  const f = feuille();
  for (const eq of [f.gauche, f.droite]) {
    const ref = clubRef(eq);
    if (ref) await charger(pClub(ref), 6 * H, false, true);
    const id = idEquipe(eq, s.equipe.groupe);
    if (id) await charger(pJoueurs(id), 6 * H, false, true);
  }
}

/* ---------- Navigation ---------- */
let vue = lire('vue', 'resultats');
let attente = false;
function rendre() {
  // Ne pas redessiner sous les doigts pendant une saisie de texte ou une recherche
  if (!$modal.hidden || $vue.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) { attente = true; return; }
  attente = false;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
  vue === 'feuille' ? vueFeuille() : vueResultats();
}
document.addEventListener('focusout', () => setTimeout(() => attente && rendre(), 400));
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  vue = b.dataset.vue; ecrire('vue', vue); document.activeElement?.blur(); rendre();
  if (vue === 'feuille') chargerFeuille();
}));

rendre();
chargerTout();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
