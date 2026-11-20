/* Calendrier FFE — tournois à cadence lente des ligues de config.js.
   Données : relais /api/tournois (préparé chaque nuit), copie dans localStorage pour un affichage immédiat. */
const CFG = window.CONFIG;
const $ = (id) => document.getElementById(id);
// Titre et couleurs (config.js)
{
  const c = CFG.couleurs ?? {}, r = document.documentElement.style;
  if (c.entete) { r.setProperty('--noir', c.entete); document.querySelector('meta[name="theme-color"]').content = c.entete; }
  if (c.accent) r.setProperty('--jaune', c.accent);
  if (c.bouton) r.setProperty('--bleu', c.bouton);
  document.title = $('titre').textContent = CFG.appli ?? 'Calendrier FFE';
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lire = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let cal = lire('calendrier'); // dernière réponse du relais : { t, ligues, tournois }
let ligue = lire('ligue', '');
let jeunes = lire('jeunes', CFG.jeunes ?? false); // championnats jeunes affichés
let etat = '';
const ouverts = new Set();

// Dates ISO (AAAA-MM-JJ) en clair, à midi pour éviter tout décalage horaire
const jour = (iso, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', o);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const quand = (t) => {
  const d = new Date(t), h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ecart = Math.round((new Date(iso(new Date()) + 'T12:00:00') - new Date(iso(d) + 'T12:00:00')) / 86400000);
  return (ecart === 0 ? "aujourd'hui" : ecart === 1 ? 'hier' : 'le ' + jour(iso(d), { day: 'numeric', month: 'long' })) + ' à ' + h;
};
// Notation FFE « 1h30 + [30''] » → « 1h30 + 30 s par coup »
const cadence = (s) => String(s ?? '').replace(/\[(\d+)''\]/g, '$1 s par coup');
// Championnat jeunes : catégorie d'âge dans le nom (« Manche Jeunes 2026 U10 », « Championnat Morbihan mixte 2026 U12 »)
// ou championnat dit « jeunes ». Un « Open Jeunes » de festival reste affiché.
const JEUNES = /\bU ?\d{1,2}\b|championnat.*\bjeunes\b/i;
// Texte FFE échappé, avec adresses web et e-mails cliquables (le découpage capture les liens aux indices impairs)
const lier = (s) => String(s ?? '').split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/)
  .map((p, i) => (i % 2 === 0 ? esc(p) : p.startsWith('http')
    ? `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`
    : `<a href="mailto:${esc(p)}">${esc(p)}</a>`)).join('');

function fiche(t) {
  const f = t.fiche;
  let h = '';
  if (f) {
    const infos = [['Dates', f.dates], ...f.infos].filter(([, v]) => v);
    const valeur = (l, v, lien) => (/^https?:/.test(lien ?? '') ? `<a href="${esc(lien)}" target="_blank" rel="noopener">${esc(v)}</a>` : l === 'Cadence' ? esc(cadence(v)) : lier(v));
    h += `<table>${infos.map(([l, v, lien]) => `<tr><th>${esc(l)}</th><td>${valeur(l, v, lien)}</td></tr>`).join('')}</table>`;
    if (f.annonce) {
      // Liens de l'annonce ([texte, adresse]) : rendus cliquables à leur place, sinon listés à la suite
      let a = lier(f.annonce);
      const reste = [];
      for (const [t, u] of f.liens ?? []) {
        const lien = `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || u)}</a>`;
        if (t && t !== u && a.includes(esc(t))) a = a.replace(esc(t), () => lien);
        else if (!f.annonce.includes(u)) reste.push(lien);
      }
      h += `<h3>Annonce</h3><p class="annonce">${a}</p>`;
      if (reste.length) h += `<h3>Liens</h3><p class="annonce">${reste.join('\n')}</p>`;
    }
  } else h += '<p class="note">Détails pas encore relus sur le site FFE.</p>';
  return h + `<p><a href="https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${t.ref}" target="_blank" rel="noopener">Fiche sur le site FFE ›</a></p>`;
}

function ligne(t, auj) {
  const f = t.fiche;
  const fin = f?.fin && f.fin !== t.debut ? f.fin : '';
  const resume = [`${t.ville} (${t.dep})`, f?.rondes && `${f.rondes} rondes`, f?.cadence && cadence(f.cadence)].filter(Boolean).join(' · ');
  return `<details class="tournoi" data-ref="${t.ref}" ${ouverts.has(t.ref) ? 'open' : ''}>
    <summary><span class="date">${esc(jour(t.debut))}${fin ? `<small>au ${esc(jour(fin))}</small>` : ''}</span>
      <span class="titre"><b>${esc(t.nom)}</b>${t.debut < auj ? ' <span class="badge">en cours</span>' : ''}<small>${esc(resume)}</small></span></summary>
    <div class="fiche">${fiche(t)}</div></details>`;
}

function rendre() {
  const ligues = cal?.ligues?.length ? cal.ligues : CFG.ligues.map((code) => ({ code, nom: code }));
  $('sous-titre').textContent = 'Cadence lente · ' + ligues.map((l) => l.nom).join(', ');
  const auj = iso(new Date());
  // Tournois pas encore terminés (la liste FFE n'est relue qu'une fois par nuit)
  const futurs = (cal?.tournois ?? []).filter((t) => t.debut && (t.fiche?.fin || t.debut) >= auj);
  const tous = jeunes ? futurs : futurs.filter((t) => !JEUNES.test(t.nom));
  if (ligue && !ligues.some((l) => l.code === ligue)) ligue = '';
  const compte = (code) => tous.filter((t) => t.ligue === code).length;
  $('ligues').innerHTML = (ligues.length > 1 ? [{ code: '', nom: 'Toutes', n: tous.length }, ...ligues] : ligues)
    .map((l) => `<button data-l="${l.code}" class="${l.code === ligue ? 'actif' : ''}">${esc(l.nom)} <small>${l.n ?? compte(l.code)}</small></button>`).join('');
  $('ligues').querySelectorAll('button').forEach((b) => (b.onclick = () => { ligue = b.dataset.l; ecrire('ligue', ligue); rendre(); }));

  const q = norm($('q').value.trim());
  const retenu = (t) => (!ligue || t.ligue === ligue)
    && (!q || norm([t.nom, t.ville, t.dep, t.fiche?.cadence, ...(t.fiche?.infos ?? []).map((x) => x[1])].join(' ')).includes(q));
  const visibles = tous.filter(retenu);
  // Case « championnats jeunes », avec le nombre de ceux masqués pour la ligue et la recherche en cours
  const masques = jeunes ? 0 : futurs.filter((t) => JEUNES.test(t.nom) && retenu(t)).length;
  $('jeunes-option').hidden = !futurs.some((t) => JEUNES.test(t.nom));
  $('jeunes').checked = jeunes;
  $('jeunes-txt').textContent = 'Afficher les championnats jeunes' + (masques ? ` (${masques})` : '');
  let h = '', mois = '';
  for (const t of visibles) {
    const m = t.debut.slice(0, 7);
    if (m !== mois) { mois = m; h += `<h2 class="mois">${esc(jour(m + '-01', { month: 'long', year: 'numeric' }))}</h2>`; }
    h += ligne(t, auj);
  }
  $('liste').innerHTML = h;

  const n = visibles.length;
  $('etat').className = 'note' + (etat.startsWith('Erreur') ? ' err' : '');
  $('etat').textContent = !cal ? etat || 'Chargement…'
    : !cal.t ? "Calendrier en préparation : le relais lit le site FFE (environ 30 s par page). Revenez dans un quart d'heure."
    : `${n} tournoi${n > 1 ? 's' : ''}${q ? ' trouvé' + (n > 1 ? 's' : '') : ''} · liste FFE relue ${quand(cal.t)}${etat ? ' · ' + etat : ''}`;
}

async function charger() {
  try {
    const r = await fetch('/api/tournois');
    const d = await r.json();
    if (!r.ok) throw new Error(d.erreur || r.status);
    // Une réponse vide ne remplace pas un calendrier déjà affiché
    if (d.tournois.length || !cal?.tournois?.length) { cal = d; ecrire('calendrier', d); }
    etat = '';
  } catch (e) { etat = cal ? 'hors ligne' : 'Erreur : ' + (e.message || 'réseau indisponible'); }
  rendre();
}

$('q').oninput = rendre;
$('jeunes').onchange = (e) => { jeunes = e.target.checked; ecrire('jeunes', jeunes); rendre(); };
$('liste').addEventListener('toggle', (e) => {
  const ref = +e.target.dataset?.ref;
  if (ref) e.target.open ? ouverts.add(ref) : ouverts.delete(ref);
}, true);
rendre();
charger();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
