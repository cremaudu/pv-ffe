// Relais du calendrier (Cloudflare Worker calendrier-ffe) : tournois à cadence lente annoncés sur echecs.asso.fr
// dans les ligues de calendrier/public/config.js, avec le détail de leur fiche.
// Le site FFE met ~30 s par page : tout est préparé par la tâche planifiée et servi depuis KV, jamais lu à la demande.
// Lecture seule : aucune page authentifiée, aucune écriture vers la FFE.
import { decode, cells, parseForm } from '../src/worker.js';

const FFE = 'https://www.echecs.asso.fr/';
const UA = 'Mozilla/5.0 (calendrier FFE relais)';
// Annonces « cadence lente » de toute la France (Tournois.aspx, bouton OK de « Cadence ») : tournois à venir, 40 par page
const LISTE = 'ListeTournois.aspx?Action=ANNONCE&Level=1';
const pFiche = (ref) => 'FicheTournoi.aspx?Ref=' + ref;

// Départements des ligues métropolitaines (régions de 2016), écrits comme dans la liste FFE.
// La FFE ne filtre pas ses annonces par ligue : le tri se fait ici, sur la colonne département.
export const LIGUES = {
  ARA: ['Auvergne-Rhône-Alpes', '01 03 07 15 26 38 42 43 63 69 73 74'],
  BFC: ['Bourgogne-Franche-Comté', '21 25 39 58 70 71 89 90'],
  BRE: ['Bretagne', '22 29 35 56'],
  CRS: ['Corse', '2A 2B'],
  CVL: ['Centre-Val de Loire', '18 28 36 37 41 45'],
  EST: ['Grand Est', '08 10 51 52 54 55 57 67 68 88'],
  HDF: ['Hauts-de-France', '02 59 60 62 80'],
  IDF: ['Île-de-France', '75 77 78 91 92 93 94 95'],
  NAQ: ['Nouvelle-Aquitaine', '16 17 19 23 24 33 40 47 64 79 86 87'],
  NOR: ['Normandie', '14 27 50 61 76'],
  OCC: ['Occitanie', '09 11 12 30 31 32 34 46 48 65 66 81 82'],
  PAC: ["Provence-Alpes-Côte d'Azur", '04 05 06 13 83 84'],
  PDL: ['Pays de la Loire', '44 49 53 72 85'],
};

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// « 21 », « novembre », « 2026 » → « 2026-11-21 » ('' si illisible)
const dateIso = (j, mois, annee) => {
  const m = MOIS.indexOf(sansAccent(mois ?? '')) + 1;
  return m && +j && annee ? `${annee}-${String(m).padStart(2, '0')}-${String(+j).padStart(2, '0')}` : '';
};
// Texte libre (annonce) : garde les retours à la ligne
const texte = (s) => s.split(/<br\s*\/?>|<\/p>|<\/div>/i).map(decode).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Une page de la liste des annonces. Les lignes « mois année » (RowRupture) donnent l'année des dates « 21 nov. ».
export function parseListe(html) {
  const tournois = [];
  let mois = [];
  for (const m of html.matchAll(/<tr id="[^"]*RowRupture"[^>]*>([\s\S]*?)<\/tr>|<tr class=liste_(?:clair|fonce)>([\s\S]*?)<\/tr>/g)) {
    if (m[1] != null) { mois = decode(m[1]).split(' '); continue; }
    const raw = cells(m[2]), c = raw.map(decode);
    const ref = +(raw[3]?.match(/FicheTournoi\.aspx\?Ref=(\d+)/)?.[1] ?? 0);
    if (ref) tournois.push({ ref, ville: c[1], dep: c[2], nom: c[3], debut: dateIso(c[4].match(/\d+/)?.[0], mois[0], mois[1]) });
  }
  // Flèche « page suivante » du bas de page : absente sur la dernière page
  return { tournois, suite: /PagerFooter','d'/.test(html) };
}

// Fiche d'un tournoi : dates, puis chaque ligne « libellé : valeur » dans l'ordre de la page (cadence, rondes, prix…)
export function parseFiche(html) {
  const span = (id) => html.match(new RegExp(`<span id="ctl00_ContentPlaceHolderMain_Label${id}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '';
  if (!html.includes('ContentPlaceHolderMain_LabelNom')) throw new Error('fiche illisible');
  const dates = decode(span('Dates'));
  const jours = [...dates.matchAll(/(\d{1,2}) (\p{L}+) (\d{4})/gu)].map((m) => dateIso(m[1], m[2], m[3])).filter(Boolean);
  const infos = [], champ = {};
  let annonce = '', liens = [];
  for (const m of html.matchAll(/<tr id="ctl00_ContentPlaceHolderMain_Row(\w+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = cells(m[2]);
    if (c.length !== 2) continue; // lignes sur deux colonnes seulement (pas les liens de résultats)
    if (m[1] === 'Annonce') {
      annonce = texte(c[1]);
      // Liens de l'annonce : [texte, adresse], pour les rendre cliquables à leur place dans le texte
      const vus = new Map();
      for (const l of c[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = new URL(decode(l[1]), FFE).href;
        if (/^https?:/.test(u) && !vus.has(u)) vus.set(u, [decode(l[2]), u]);
      }
      liens = [...vus.values()];
      continue;
    }
    const valeur = decode(c[1]);
    if (!valeur) continue;
    champ[m[1]] = valeur;
    // Certaines lignes sont un lien (règlement, annonce de l'organisateur en PDF) : adresse relative au site FFE
    const lien = c[1].match(/<a\b[^>]*href="([^"]+)"/i)?.[1];
    infos.push([decode(c[0]).replace(/\s*:$/, ''), valeur, ...(lien ? [new URL(decode(lien), FFE).href] : [])]);
  }
  return {
    dates, debut: jours[0] ?? '', fin: jours.at(-1) ?? '',
    cadence: champ.Cadence ?? '', rondes: champ.NbrRondes ?? '',
    infos, annonce, liens,
  };
}

async function lireFFE(path, body) {
  const r = await fetch(FFE + path, {
    method: body ? 'POST' : 'GET', body, signal: AbortSignal.timeout(90000),
    headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  });
  if (!r.ok) throw new Error('FFE ' + r.status);
  const html = await r.text();
  // Pied de page, présent sur toutes les pages (les fiches de tournoi n'ont pas de formulaire aspnetForm)
  if (!html.includes('id="ctl00_divfooter"')) throw new Error('page FFE tronquée');
  return html;
}

// Configuration lue dans calendrier/public/config.js (clés au nom unique, valeurs littérales simples)
let cfgMemo;
function config(env) {
  return (cfgMemo ??= (async () => {
    const js = await (await env.ASSETS.fetch(new Request('https://assets/config.js'))).text();
    const chaine = (cle) => js.match(new RegExp('^\\s*' + cle + ':\\s*([\'"])(.*?)\\1', 'm'))?.[2];
    const ligues = (js.match(/^\s*ligues:\s*\[([^\]]*)\]/m)?.[1].match(/[A-Z]{3}/g) ?? []).filter((c) => LIGUES[c]);
    const ligueDe = {};
    for (const c of ligues) for (const d of LIGUES[c][1].split(' ')) ligueDe[d] = c;
    return { appli: chaine('appli') ?? 'Calendrier FFE', entete: chaine('entete') ?? '#161616', ligues, ligueDe };
  })());
}

/* ---------- Tâche planifiée ----------
   Déclenchée toutes les 5 min, elle ne lance qu'un cycle par nuit (00h00-01h55 UTC), plus un tout premier
   dès le déploiement. Un cycle : les pages de la liste (la 1re en lecture simple, les suivantes par postback
   sur le formulaire de la 1re), puis les fiches nouvelles ou lues il y a plus d'une semaine. 4 pages par passage. */
const PAR_PASSAGE = 4;
const FICHE_VALIDE = 7 * 86400000;
const JOURS_FICHE = 120; // une fiche non relue disparaît de KV au bout de 4 mois (tournoi passé)

export async function recharger(env, maintenant = Date.now()) {
  const cfg = await config(env);
  let e = await env.CACHE.get('cron:etat', 'json');
  const jour = (t) => new Date(t).toISOString().slice(0, 10);
  const nuit = new Date(maintenant).getUTCHours() < 2;
  if (!e || (nuit && jour(e.debut) !== jour(maintenant))) e = { debut: maintenant, file: ['liste:1'], lignes: [], faits: 0, echecs: {} };
  if (!e.file.length) return { reste: 0, faits: e.faits }; // rien à faire : pas d'écriture KV
  let change = false;
  for (let i = 0; i < PAR_PASSAGE && e.file.length; i++) {
    const item = e.file[0];
    const [type, arg] = item.split(':');
    try {
      if (type === 'liste') {
        const n = +arg;
        let html;
        if (n === 1) {
          html = await lireFFE(LISTE);
          e.form = parseForm(html).champs;
        } else {
          const body = new URLSearchParams(e.form);
          body.set('__EVENTTARGET', 'ctl00$ContentPlaceHolderMain$PagerFooter');
          body.set('__EVENTARGUMENT', String(n));
          html = await lireFFE(LISTE, body);
        }
        const { tournois, suite } = parseListe(html);
        if (!tournois.length) throw new Error('liste vide');
        e.lignes.push(...tournois.filter((t) => cfg.ligueDe[t.dep]));
        if (suite && n < 30) e.file.push('liste:' + (n + 1));
        else {
          // Liste complète : elle remplace la précédente (une liste incomplète ne remplace rien)
          await env.CACHE.put('liste', JSON.stringify(e.lignes), { metadata: { t: maintenant } });
          for (const t of e.lignes) {
            const f = await env.CACHE.getWithMetadata('f:' + t.ref);
            if (!f.value || maintenant - (f.metadata?.t ?? 0) > FICHE_VALIDE) e.file.push('fiche:' + t.ref);
          }
          e.lignes = [];
          delete e.form;
          change = true;
        }
      } else if (type === 'fiche') {
        const f = parseFiche(await lireFFE(pFiche(arg)));
        await env.CACHE.put('f:' + arg, JSON.stringify(f), { metadata: { t: Date.now() }, expirationTtl: JOURS_FICHE * 86400 });
        change = true;
      }
      e.file.shift();
      e.faits++;
    } catch (err) {
      // Page en échec : remise en fin de file, 3 essais au plus
      e.file.shift();
      e.echecs[item] = (e.echecs[item] ?? 0) + 1;
      if (e.echecs[item] < 3) e.file.push(item);
    }
  }
  if (change) await publier(env, cfg);
  e.maj = maintenant;
  await env.CACHE.put('cron:etat', JSON.stringify(e));
  return { reste: e.file.length, faits: e.faits };
}

// Assemble liste et fiches en une seule réponse, servie telle quelle par /api/tournois
async function publier(env, cfg) {
  const l = await env.CACHE.getWithMetadata('liste', 'json');
  if (!l.value) return;
  const tournois = [];
  for (const t of l.value) {
    const fiche = await env.CACHE.get('f:' + t.ref, 'json');
    tournois.push({ ...t, ligue: cfg.ligueDe[t.dep] ?? '', ...(fiche ? { fiche } : {}) });
  }
  const t = l.metadata?.t ?? Date.now();
  await env.CACHE.put('calendrier', JSON.stringify({ t, ligues: liguesDe(cfg), tournois }), { metadata: { t } });
}
const liguesDe = (cfg) => cfg.ligues.map((code) => ({ code, nom: LIGUES[code][0] }));

const json = (data, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(recharger(env));
  },
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      if (u.pathname === '/manifest.webmanifest') {
        const cfg = await config(env);
        return new Response(JSON.stringify({
          name: cfg.appli, short_name: 'Calendrier', start_url: '/', display: 'standalone', background_color: '#f4f4f2', theme_color: cfg.entete,
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        }), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
      }
      // Calendrier assemblé par la tâche planifiée ; tant qu'il n'existe pas : liste vide, t = 0
      if (u.pathname === '/api/tournois') {
        const c = await env.CACHE.get('calendrier');
        return json(c ?? { t: 0, ligues: liguesDe(await config(env)), tournois: [] });
      }
      // État de la recharge planifiée (diagnostic)
      if (u.pathname === '/api/cron') {
        const e = await env.CACHE.get('cron:etat', 'json');
        return json(e ? { debut: new Date(e.debut).toISOString(), maj: new Date(e.maj).toISOString(), faits: e.faits, reste: e.file.length, file: e.file.slice(0, 10), echecs: e.echecs } : { etat: 'jamais lancée' });
      }
      return json({ erreur: 'inconnu' }, 404);
    } catch (e) {
      return json({ erreur: String(e.message || e) }, 502);
    }
  },
};
