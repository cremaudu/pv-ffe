// Relais FFE : lit les pages publiques d'echecs.asso.fr et les renvoie en JSON.
// Aucune écriture vers la FFE ici (l'envoi du PV sera un module séparé).
const FFE = 'https://www.echecs.asso.fr/';
const UA = 'Mozilla/5.0 (PV-FFE relais)';

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', Eacute: 'É' };
const decode = (s) =>
  s.replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&(\w+);/g, (m, n) => ENT[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);

export function parseGroupe(html) {
  const rondes = [];
  const parts = html.split(/Ronde&nbsp;(\d+)/);
  for (let i = 1; i < parts.length; i += 2) {
    const matchs = [];
    for (const m of parts[i + 1].matchAll(/<tr id="[^"]*RowMatch"[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = cells(m[1]).map(decode);
      if (c.length >= 5) matchs.push({ dom: c[0], sd: c[1], se: c[3], ext: c[4] });
    }
    if (matchs.length) rondes.push({ n: +parts[i], matchs });
  }
  const classement = [];
  const re = /<td align=right>(\d+)<\/td>\s*<td align=left><a[^>]*ClubRef=(\d+)[^>]*>([^<]+)<\/a><\/td>((?:\s*<td align=right>[^<]*<\/td>){5})/g;
  for (const m of html.matchAll(re)) {
    const v = cells(m[4]).map(decode);
    classement.push({ pl: +m[1], clubRef: +m[2], equipe: decode(m[3]), pts: v[0], j: v[1], d: v[2], p: v[3], c: v[4] });
  }
  const titre = [...html.matchAll(/<option selected="selected" value="\d+">([^<]+)<\/option>/g)].map((m) => decode(m[1]));
  return { titre: titre.join(' · '), rondes, classement };
}

// Page de détail d'une ronde : [{ dom, score, ext, parties: [{ g, res, d }] }]
export function parseRonde(html) {
  const matchs = [];
  for (const m of html.matchAll(/<tr id="[^"]*RepeaterRonde[^"]*RowMatch(Titre|Detail)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = cells(m[2]).map(decode);
    if (c.length < 3) continue;
    if (m[1] === 'Titre') matchs.push({ dom: c[0], score: c[1], ext: c[2], parties: [] });
    else matchs.at(-1)?.parties.push({ g: c[0], res: c[1], d: c[2] });
  }
  return matchs;
}

export function parseJoueurs(html) {
  const out = [];
  for (const m of html.matchAll(/<tr class=liste_(?:clair|fonce)>([\s\S]*?)<\/tr>/g)) {
    const raw = cells(m[1]);
    if (raw.length < 10) continue;
    const c = raw.map(decode);
    out.push({ nom: c[1], elo: c[4], cat: c[7], club: c[9], id: +(raw[3].match(/Id=(\d+)/)?.[1] ?? 0) });
  }
  return out;
}

export function parseClub(html) {
  const out = [];
  const re = /<td align=left><a href="ListeJoueurs\.aspx\?Action=EQUIPE&(?:amp;)?Equipe=(\d+)"[^>]*>([^<]+)<\/a><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*><a[^>]*Groupe=(\d+)[^>]*>([^<]*)<\/a>/g;
  for (const m of html.matchAll(re)) {
    out.push({ id: +m[1], nom: decode(m[2]), competition: decode(m[3]), division: decode(m[4]), groupe: +m[5], groupeNom: decode(m[6]) });
  }
  return out;
}

/* ---------- Partie authentifiée : connexion et formulaire SaisiePV.aspx ---------- */
const P = 'ctl00$ContentPlaceHolderMain$';
const CIBLES = ['SelectCompetition', 'SelectDivision', 'SelectGroupe', 'DropDownEquipeBlanc', 'DropDownEquipeNoir', 'LinkCmdSave'];
const attr = (tag, n) => tag.match(new RegExp('\\s' + n + '="([^"]*)"', 'i'))?.[1];
const val = (s) => decode(s ?? '');
const fusion = (cookie, r) => {
  const jar = new Map((cookie ? cookie.split('; ') : []).map((c) => [c.split('=')[0], c]));
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(';')[0]; jar.set(kv.split('=')[0], kv); }
  return [...jar.values()].join('; ');
};

// Lit le formulaire ASP.NET comme le ferait un navigateur : champs envoyés, listes et leurs options.
export function parseForm(html) {
  const i = html.indexOf('id="aspnetForm"');
  const h = i < 0 ? '' : html.slice(i);
  const champs = {}, options = {};
  for (const m of h.matchAll(/<input\b[^>]*>/gi)) {
    const t = m[0], name = attr(t, 'name'), type = (attr(t, 'type') ?? 'text').toLowerCase();
    if (!name || /\sdisabled/i.test(t) || !['hidden', 'text'].includes(type)) continue;
    champs[name] = name.startsWith('__') ? attr(t, 'value') ?? '' : val(attr(t, 'value'));
  }
  // Les attributs d'un textarea peuvent contenir « > » (script de limite de longueur) : le contenu est ce qui suit le dernier « > ».
  for (const m of h.matchAll(/<textarea\b([\s\S]*?)<\/textarea>/gi)) {
    const name = attr(m[1], 'name'), fin = m[1].lastIndexOf('>');
    if (name && fin >= 0) champs[name] = val(m[1].slice(fin + 1));
  }
  for (const m of h.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attr(m[1], 'name');
    if (!name) continue;
    const opts = [...m[2].matchAll(/<option\b([^>]*)>([^<]*)/gi)].map((o) => ({ v: val(attr(o[1], 'value')), t: val(o[2]), s: /selected/i.test(o[1]) }));
    const court = name.replace(P, '');
    if (CIBLES.includes(court)) options[court] = opts.map(({ v, t }) => ({ v, t }));
    if (!/\sdisabled/i.test(m[1])) champs[name] = (opts.find((o) => o.s) ?? opts[0])?.v ?? '';
  }
  const calc = h.match(/CalculerPoints\((\d+),\s*'(\w+)'\)/);
  const texte = decode(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<select[\s\S]*?<\/select>/gi, ' ').replace(/<[^>]+>/g, ' ')).split('Copyright')[0];
  return {
    champs, options, texte: texte.slice(0, 1500),
    echiquiers: Object.keys(champs).filter((k) => k.endsWith('$TextNrFFEBl')).length,
    regle: calc?.[2] ?? '',
    pret: (P + 'DropDownEquipeBlanc') in champs,
  };
}

// Connexion sur Connect.aspx. Renvoie le cookie de session, ou null si les identifiants sont refusés.
async function login(identifiant, password) {
  const h = { 'User-Agent': UA };
  const r1 = await fetch(FFE + 'Connect.aspx', { headers: h });
  const html = await r1.text();
  let cookie = fusion('', r1);
  const body = new URLSearchParams();
  for (const m of html.matchAll(/<input type="hidden" name="(__[A-Z]+)" id="[^"]*" value="([^"]*)"/g)) body.set(m[1], m[2]);
  body.set(P + 'TextLogin', identifiant);
  body.set(P + 'TextPassword', password);
  body.set(P + 'ImgCmdConnect.x', '10');
  body.set(P + 'ImgCmdConnect.y', '10');
  const r2 = await fetch(FFE + 'Connect.aspx', {
    method: 'POST', redirect: 'manual', body,
    headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
  });
  cookie = fusion(cookie, r2);
  if (r2.status >= 300 && r2.status < 400) return cookie;
  if (!r2.ok) throw new Error('FFE ' + r2.status);
  return (await r2.text()).includes('TextPassword') ? null : cookie;
}

// Une requête sur SaisiePV.aspx (GET d'ouverture ou postback). Une redirection = session perdue.
async function saisie(cookie, body) {
  const r = await fetch(FFE + 'SaisiePV.aspx', {
    method: body ? 'POST' : 'GET', redirect: 'manual', body,
    headers: { 'User-Agent': UA, Cookie: cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  });
  if (r.status >= 300 && r.status < 400) throw new Error('session FFE expirée');
  if (!r.ok) throw new Error('FFE ' + r.status);
  return { cookie: fusion(cookie, r), ...parseForm(await r.text()) };
}

/* ---------- Pages publiques : copie durable dans KV (env.CACHE) ----------
   Le relais sert toujours sa copie si elle existe (réponse immédiate) et indique son âge (en-tête X-Age).
   La copie est renouvelée par ?fresh (bouton Actualiser, ou appli quand la copie est trop vieille)
   et par la tâche planifiée du lundi matin (scheduled). */
const pGroupe = (id) => 'Equipes.aspx?Groupe=' + id;
const pClub = (ref) => 'ListeEquipes.aspx?ClubRef=' + ref;
const pJoueurs = (id) => 'ListeJoueurs.aspx?Action=EQUIPE&Equipe=' + id;

async function ffe(path, env, fresh) {
  if (!fresh) {
    const c = await env.CACHE.getWithMetadata('p:' + path);
    if (c.value) return { text: c.value, t: c.metadata?.t ?? 0 };
  }
  const r = await fetch(FFE + path, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('FFE ' + r.status);
  const text = await r.text();
  const t = Date.now();
  // Une page tronquée ou d'erreur ne remplace pas une bonne copie
  if (text.includes('id="aspnetForm"')) await env.CACHE.put('p:' + path, text, { metadata: { t } });
  return { text, t };
}

// Détail d'une ronde : postback public sur le lien « Ronde n » de la page du groupe
// force : ignore la copie existante sans relire la page du groupe (recharge du lundi)
async function detailRonde(groupe, n, env, fresh, force) {
  const cle = `r:${groupe}:${n}`;
  const c = await env.CACHE.getWithMetadata(cle, 'json');
  // Une ronde entièrement jouée ne change plus ; sinon la copie vaut 10 minutes
  if (!force && c.value && (c.metadata?.finie ? !fresh : Date.now() - c.metadata.t < 600000 && !fresh)) return { data: c.value, t: c.metadata.t, finie: c.metadata.finie };
  const { text: html } = await ffe(pGroupe(groupe), env, fresh);
  const cible = [...html.matchAll(/__doPostBack\('([^']*LinkCmdRonde)',''\)"[^>]*>\s*Ronde&nbsp;(\d+)/g)].find((x) => +x[2] === +n)?.[1];
  if (!cible) throw new Error('ronde inconnue');
  const body = new URLSearchParams(parseForm(html).champs);
  body.set('__EVENTTARGET', cible);
  body.set('__EVENTARGUMENT', '');
  const r = await fetch(FFE + pGroupe(groupe), { method: 'POST', body, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error('FFE ' + r.status);
  const data = parseRonde(await r.text());
  const t = Date.now(), finie = data.length > 0 && data.every((x) => /\d/.test(x.score));
  if (data.length) await env.CACHE.put(cle, JSON.stringify(data), { metadata: { t, finie } });
  return { data, t, finie };
}

const json = (data, status = 200, t) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(t ? { 'X-Age': String(Math.round((Date.now() - t) / 1000)) } : {}) },
  });
const page = async (path, parse, env, fresh) => { const { text, t } = await ffe(path, env, fresh); return json(parse(text), 200, t); };

/* ---------- Tâche planifiée : recharge toutes les copies le lundi matin ----------
   Le site FFE met ~30 s par page : chaque déclenchement (toutes les 5 min) traite quelques pages
   d'une file d'attente gardée dans KV, jusqu'à épuisement. */
const PAR_PASSAGE = 4;

// Club et groupes suivis : lus dans public/config.js pour ne pas dupliquer la configuration
let cfgMemo; // lue une fois par instance du worker (un déploiement en crée de nouvelles)
function config(env) {
  return (cfgMemo ??= (async () => {
    const js = await (await env.ASSETS.fetch(new Request('https://assets/config.js'))).text();
    return {
      saison: js.match(/saison:\s*'([^']+)'/)[1],
      club: +js.match(/ref:\s*(\d+)/)[1],
      groupes: js.match(/groupes:\s*\[([^\]]*)\]/)[1].split(',').map(Number).filter(Boolean),
    };
  })());
}

// Toutes les copies sont rangées sous la saison de config.js : la FFE réattribue les numéros de groupe
// d'une saison à l'autre, changer la saison repart donc de copies neuves.
async function parSaison(env) {
  const prefixe = (await config(env)).saison + ':';
  const kv = env.CACHE;
  return {
    ...env,
    CACHE: {
      get: (k, ...a) => kv.get(prefixe + k, ...a),
      getWithMetadata: (k, ...a) => kv.getWithMetadata(prefixe + k, ...a),
      put: (k, ...a) => kv.put(prefixe + k, ...a),
    },
  };
}

export async function recharger(envBrut, maintenant = Date.now()) {
  const env = await parSaison(envBrut);
  const cfg = await config(env);
  let e = await env.CACHE.get('cron:etat', 'json');
  // Nouveau cycle si le précédent a démarré il y a plus de 6 jours
  if (!e || maintenant - e.debut > 6 * 86400000) {
    e = { debut: maintenant, file: [pClub(cfg.club), ...cfg.groupes.map(pGroupe)], vus: [] };
    e.vus = [...e.file];
  }
  const ajouter = (x) => { if (!e.vus.includes(x)) { e.vus.push(x); e.file.push(x); } };
  for (let i = 0; i < PAR_PASSAGE && e.file.length; i++) {
    const item = e.file[0];
    try {
      if (item.startsWith('ronde:')) {
        const [, g, n, force] = item.split(':');
        await detailRonde(g, n, env, false, !!force); // sauf la dernière, les rondes terminées déjà copiées ne sont pas redemandées
      } else {
        const { text } = await ffe(item, env, true);
        let m;
        if ((m = item.match(/Groupe=(\d+)/))) {
          // Du groupe découlent : les clubs adverses, puis le détail des rondes jouées
          const g = parseGroupe(text);
          g.classement.forEach((c) => ajouter(pClub(c.clubRef)));
          const jouees = g.rondes.filter((r) => r.matchs.some((x) => /\d/.test(x.sd)));
          // La dernière ronde jouée est toujours rechargée (corrections tardives du directeur de groupe)
          jouees.forEach((r, i) => ajouter(`ronde:${m[1]}:${r.n}${i === jouees.length - 1 ? ":force" : ""}`));
        } else if (item.includes('ClubRef=')) {
          // Du club découlent : les listes de joueurs de ses équipes engagées dans les groupes suivis
          parseClub(text).filter((q) => cfg.groupes.includes(q.groupe)).forEach((q) => ajouter(pJoueurs(q.id)));
        }
      }
      e.file.shift();
    } catch {
      // Page en échec : remise en fin de file, 3 essais au plus
      e.file.shift();
      e.echecs = { ...e.echecs, [item]: (e.echecs?.[item] ?? 0) + 1 };
      if (e.echecs[item] < 3) e.file.push(item);
    }
  }
  e.maj = maintenant;
  await env.CACHE.put('cron:etat', JSON.stringify(e));
  return { reste: e.file.length, faits: e.vus.length - e.file.length };
}

export default {
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(recharger(env));
  },
  async fetch(req, envBrut, ctx) {
    const u = new URL(req.url);
    const fresh = u.searchParams.has('fresh');
    try {
      const env = await parSaison(envBrut);
      let m;
      if ((m = u.pathname.match(/^\/api\/groupe\/(\d+)\/ronde\/(\d+)$/))) {
        const d = await detailRonde(m[1], m[2], env, fresh);
        return json(d.data, 200, d.t);
      }
      if ((m = u.pathname.match(/^\/api\/groupe\/(\d+)$/))) return page(pGroupe(m[1]), parseGroupe, env, fresh);
      if ((m = u.pathname.match(/^\/api\/equipe\/(\d+)\/joueurs$/))) return page(pJoueurs(m[1]), parseJoueurs, env, fresh);
      if ((m = u.pathname.match(/^\/api\/club\/(\d+)\/equipes$/))) return page(pClub(m[1]), parseClub, env, fresh);
      // État de la recharge planifiée (diagnostic)
      if (u.pathname === '/api/cron') {
        const e = await env.CACHE.get('cron:etat', 'json');
        return json(e ? { debut: new Date(e.debut).toISOString(), maj: new Date(e.maj).toISOString(), faits: e.vus.length - e.file.length, reste: e.file.length, echecs: e.echecs ?? {} } : { etat: 'jamais lancée' });
      }
      if (req.method === 'POST') {
        const d = await req.json();
        if (u.pathname === '/api/connexion') {
          if (!d.login || !d.password) return json({ ok: false });
          return json({ ok: !!(await login(String(d.login), String(d.password))) });
        }
        // Ouvre le formulaire de saisie : connexion puis chargement de SaisiePV.aspx
        if (u.pathname === '/api/pv/ouvrir') {
          const cookie = await login(String(d.login ?? ''), String(d.password ?? ''));
          if (!cookie) return json({ erreur: 'identifiants refusés par la FFE' }, 403);
          return json(await saisie(cookie));
        }
        // Rejoue un postback du formulaire. L'enregistrement (LinkCmdSave) exige confirme: true.
        if (u.pathname === '/api/pv/etape') {
          if (!CIBLES.includes(d.cible) || !d.cookie || typeof d.champs !== 'object') return json({ erreur: 'requête invalide' }, 400);
          if (d.cible === 'LinkCmdSave' && d.confirme !== true) return json({ erreur: 'enregistrement non confirmé' }, 400);
          const body = new URLSearchParams(d.champs);
          body.set('__EVENTTARGET', P + d.cible);
          body.set('__EVENTARGUMENT', '');
          return json(await saisie(String(d.cookie), body));
        }
      }
      if (u.pathname === '/api/recherche') {
        // action : j1 = joueur (code FFE + Elo), jr = capitaine, ar = arbitre
        const action = u.searchParams.get('action');
        const club = u.searchParams.get('club') ?? '';
        const q = (u.searchParams.get('q') ?? '').trim();
        if (!['j1', 'jr', 'ar'].includes(action) || !/^\d*$/.test(club) || q.length < 2) return json([]);
        const qs = new URLSearchParams({ action, q, limit: '15' });
        if (club) qs.set('club', club);
        const r = await fetch(FFE + 'AutoComplete.ashx?' + qs, { headers: { 'User-Agent': UA } });
        return json((await r.text()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      }
      return json({ erreur: 'inconnu' }, 404);
    } catch (e) {
      return json({ erreur: String(e.message || e) }, 502);
    }
  },
};
