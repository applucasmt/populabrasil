export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Verificação Meta (Instagram/Facebook)
    if (request.method === 'GET' && url.pathname === '/meta') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
        return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // 2. Verificação TikTok
    if (request.method === 'GET' && url.pathname === '/tiktok') {
      return new Response('TikTok Webhook Verificado', { status: 200 });
    }

    if (request.method !== 'POST') return new Response('OK', { status: 200 });

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Bad request', { status: 400 });

    try {
      // ── META (Instagram + Facebook) ──
      if (body.object === 'instagram' || body.object === 'page') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field === 'comments' || change.field === 'feed') {
              const v = change.value;
              if (v.item === 'comment' || change.field === 'comments') {
                await processarComentario(env, {
                  autorId: v.from?.id,
                  autorUsername: v.from?.username || 'usuario',
                  autorNome: v.from?.name || v.from?.username || 'Seguidor',
                  texto: v.message || v.text || '',
                  foto: v.from?.id ? `https://graph.facebook.com/${v.from.id}/picture?type=large` : ''
                });
              }
            }
          }
        }
        return new Response('OK Meta', { status: 200 });
      }

      // ── TIKTOK ──
      if (body.event) {
        if (body.event === 'comment.create') {
          const c = body.data?.comment || {};
          await processarComentario(env, {
            autorId: c.user?.open_id,
            autorUsername: c.user?.display_name || 'usuario',
            autorNome: c.user?.display_name || 'Seguidor',
            texto: c.text || '',
            foto: '' // TikTok API pública não fornece foto
          });
        }
        return new Response('OK TikTok', { status: 200 });
      }

      return new Response('Ignored', { status: 200 });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }
};

// ─── Processa a Lógica do Morador ───
async function processarComentario(env, info) {
  // Detecta cidade e coordenadas
  const lugar = await buscarCidadeIBGE(info.texto);

  // Se achou a cidade, ganha casa. Senão, vai pro barco.
  const morador = {
    nome: info.autorNome,
    usuario: '@' + (info.autorUsername || 'usuario'),
    cidade: lugar?.nome || null,
    uf: lugar?.uf || null,
    lat: lugar?.lat || null,
    lon: lugar?.lon || null,
    foto: info.foto,
    comentou: !!lugar
  };

  await adicionarMorador(env, morador);
  return morador;
}

// ─── Consulta API do IBGE em tempo real ───
async function buscarCidadeIBGE(texto) {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t || t.length < 3) return null;

  // 1. Pega a lista de TODOS os municípios do IBGE
  // (O Cloudflare faz cache disso automaticamente, então não pesa)
  const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
  const municipios = await resp.json();

  // 2. Tenta achar o nome da cidade no comentário (ex: "sou de recife" -> "recife")
  let cidadeEncontrada = null;
  for (const m of municipios) {
    const nomeNorm = m.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Verifica se o comentário CONTÉM o nome da cidade
    if (t.includes(nomeNorm) && nomeNorm.length > 3) {
      cidadeEncontrada = m;
      break;
    }
  }

  if (!cidadeEncontrada) return null;

  const uf = cidadeEncontrada.microrregiao?.mesorregiao?.UF?.sigla 
          || cidadeEncontrada.regiao?.imediata?.regiao?.intermediaria?.UF?.sigla || '';
          
  // 3. Busca coordenadas via OpenStreetMap (Nominatim)
  const query = encodeURIComponent(`${cidadeEncontrada.nome}, ${uf}, Brasil`);
  const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
    headers: { 'User-Agent': 'Brasil3D-App' }
  });
  const geoData = await geoResp.json();

  if (geoData && geoData.length > 0) {
    return {
      nome: cidadeEncontrada.nome,
      uf: uf,
      lat: parseFloat(geoData[0].lat),
      lon: parseFloat(geoData[0].lon)
    };
  }

  return null;
}

// ─── Commit no GitHub ───
async function adicionarMorador(env, novoMorador) {
  const REPO = env.GITHUB_REPO;
  const PATH = 'data/moradores.json';
  const URL = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const headers = {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Brasil-3D-Worker',
    'Content-Type': 'application/json'
  };

  const resp = await fetch(URL, { headers });
  const atual = await resp.json();
  const conteudo = JSON.parse(atob(atual.content));

  // Evita duplicatas (se a pessoa comentar 2x)
  const jaExiste = conteudo.moradores.find(m => m.usuario === novoMorador.usuario);
  if (jaExiste) {
    // Atualiza a foto ou localização se necessário
    jaExiste.cidade = novoMorador.cidade || jaExiste.cidade;
    jaExiste.lat = novoMorador.lat || jaExiste.lat;
    jaExiste.lon = novoMorador.lon || jaExiste.lon;
    jaExiste.comentou = novoMorador.comentou || jaExiste.comentou;
  } else {
    conteudo.moradores.push(novoMorador);
  }

  await fetch(URL, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Novo morador automático: ${novoMorador.usuario}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(conteudo, null, 2)))),
      sha: atual.sha
    })
  });
}
