// Edge function "triagem-edital-v2": igual à "triagem-edital", mas lê MAIS do PNCP:
//  - todos os itens da compra (descrição, quantidade, unidade, valor unitário/total, material ou serviço)
//  - a lista completa de anexos e até 3 PDFs (edital + termo de referência/anexos)
//  - campos extras da compra (SRP, amparo legal, modo de disputa, instrumento, última atualização)
// Só administradores. Não usa IA. A função antiga continua no ar como reserva.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_PDF = 6 * 1024 * 1024;          // por arquivo
const MAX_PDF_TOTAL = 10 * 1024 * 1024;   // soma dos PDFs devolvidos
const MAX_HTML = 2 * 1024 * 1024;
const MAX_ITENS = 1000;
const UA = "Mozilla/5.0 (compatible; RadarTransformare/1.0)";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function hostSeguro(h: string): boolean {
  h = h.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (h.includes(":") || h.startsWith("[")) return false;
  return true;
}

async function buscar(url: string, ms = 20000): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Endereço inválido");
  if (!hostSeguro(u.hostname)) throw new Error("Endereço não permitido");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    let atual = url;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(atual, { signal: ctl.signal, redirect: "manual", headers: { "User-Agent": UA, Accept: "*/*" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const prox = new URL(r.headers.get("location")!, atual);
        if (!hostSeguro(prox.hostname)) throw new Error("Redirecionamento não permitido");
        atual = prox.toString();
        continue;
      }
      return r;
    }
    throw new Error("Redirecionamentos demais");
  } finally { clearTimeout(t); }
}

async function lerLimitado(r: Response, max: number): Promise<Uint8Array> {
  const reader = r.body!.getReader();
  const partes: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await reader.cancel(); } catch (_) {} throw new Error("Arquivo grande demais"); }
    partes.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
function b64(u: Uint8Array): string {
  let s = ""; const n = 0x8000;
  for (let i = 0; i < u.length; i += n) s += String.fromCharCode(...u.subarray(i, i + n));
  return btoa(s);
}
function htmlParaTexto(h: string): string {
  return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&ordm;/g, "º").replace(/&[a-z]+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
const isoData = (s?: string | null) => (s ? String(s).slice(0, 10) : "");
const cortar = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);

// Itens da compra (paginado). Tenta as duas rotas públicas do PNCP.
async function lerItens(cnpj: string, ano: string, seq: string, avisos: string[]) {
  const rotas = [
    (p: number) => `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=${p}&tamanhoPagina=100`,
    (p: number) => `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=${p}&tamanhoPagina=100`,
  ];
  for (const rota of rotas) {
    try {
      const todos: any[] = [];
      for (let p = 1; p <= 10; p++) {
        const r = await buscar(rota(p));
        if (!r.ok) { if (p === 1) throw new Error("PNCP respondeu " + r.status); break; }
        const lista = await r.json();
        const arr = Array.isArray(lista) ? lista : (Array.isArray(lista?.data) ? lista.data : []);
        todos.push(...arr);
        if (arr.length < 100 || todos.length >= MAX_ITENS) break;
      }
      return todos.slice(0, MAX_ITENS).map((i: any) => ({
        n: i.numeroItem ?? null,
        descricao: cortar(i.descricao, 400),
        qtd: num(i.quantidade),
        unidade: cortar(i.unidadeMedida, 40),
        vu: num(i.valorUnitarioEstimado),
        vt: num(i.valorTotal),
        tipo: cortar(i.materialOuServicoNome || (i.materialOuServico === "S" ? "Serviço" : i.materialOuServico === "M" ? "Material" : ""), 20),
        categoria: cortar(i.itemCategoriaNome, 60),
        criterio: cortar(i.criterioJulgamentoNome, 60),
        situacao: cortar(i.situacaoCompraItemNome, 40),
        sigiloso: i.orcamentoSigiloso === true,
        info: cortar(i.informacaoComplementar, 300),
        ncm: cortar(i.ncmNbsDescricao, 120),
      }));
    } catch (_) { /* tenta a próxima rota */ }
  }
  avisos.push("Não consegui ler os itens da compra no PNCP — confira a tabela de itens na página do edital.");
  return [];
}

async function porPncp(cnpj: string, ano: string, seq: string) {
  const base = `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`;
  const avisos: string[] = [];
  const r = await buscar(base);
  if (!r.ok) throw new Error("PNCP respondeu " + r.status + " — confira o número/link");
  const c = await r.json();
  const meta = {
    edital: `${c.numeroCompra || seq}/${c.anoCompra || ano}`,
    modalidade_pncp: c.modalidadeNome || "",
    instrumento: c.tipoInstrumentoConvocatorioNome || "",
    modo_disputa: c.modoDisputaNome || "",
    amparo_legal: c.amparoLegal?.nome || "",
    srp: c.srp === true,
    orgao: c.orgaoEntidade?.razaoSocial || "",
    unidade: c.unidadeOrgao?.nomeUnidade || "",
    objeto: c.objetoCompra || "",
    uf: c.unidadeOrgao?.ufSigla || "",
    cidade: c.unidadeOrgao?.municipioNome || "",
    prazo: isoData(c.dataEncerramentoPropostaPncp),
    abertura: isoData(c.dataAberturaProposta),
    publicacao: isoData(c.dataPublicacaoPncp),
    atualizacao: isoData(c.dataAtualizacao),
    valor_estimado: typeof c.valorTotalEstimado === "number" ? c.valorTotalEstimado : null,
    situacao_pncp: c.situacaoCompraNome || "",
    link_pncp: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`,
    link_origem: c.linkSistemaOrigem || "",
    informacao: c.informacaoComplementar || "",
  };
  const itens = await lerItens(cnpj, ano, seq, avisos);

  let pdf: { nome: string; base64: string } | null = null;
  const pdfsExtra: { nome: string; base64: string }[] = [];
  const anexos: { titulo: string; tipo: string }[] = [];
  try {
    const ra = await buscar(`https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`);
    if (ra.ok) {
      const lista = await ra.json();
      const arqs = (Array.isArray(lista) ? lista : []).filter((a: any) => a.statusAtivo !== false);
      arqs.forEach((a: any) => anexos.push({ titulo: cortar(a.titulo, 120), tipo: cortar(a.tipoDocumentoNome || a.tipoDocumentoDescricao, 60) }));
      const ed = arqs.find((a: any) => /edital|chamamento|credenciamento/i.test(a.titulo || "")) || arqs[0];
      const extras = arqs.filter((a: any) => a !== ed && /termo|refer[eê]ncia|projeto b[aá]sico|anexo|tabela|valores|minuta/i.test(a.titulo || "")).slice(0, 2);
      let total = 0;
      const baixar = async (a: any) => {
        const url = a.url || a.uri || `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos/${a.sequencialDocumento}`;
        const rd = await buscar(url, 30000);
        if (!rd.ok) { avisos.push("Não consegui baixar o anexo “" + cortar(a.titulo, 60) + "” no PNCP."); return null; }
        const bytes = await lerLimitado(rd, MAX_PDF);
        if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") { avisos.push("O anexo “" + cortar(a.titulo, 60) + "” não é um PDF legível — envie o arquivo."); return null; }
        total += bytes.length;
        return { nome: a.titulo || "anexo.pdf", base64: b64(bytes) };
      };
      if (ed) {
        try { pdf = await baixar(ed); } catch (e) { avisos.push("Edital do PNCP: " + (e as Error).message + " — envie o PDF."); }
      } else avisos.push("O PNCP não lista anexos para esta compra — envie o PDF.");
      for (const a of extras) {
        if (total >= MAX_PDF_TOTAL) break;
        try { const x = await baixar(a); if (x) pdfsExtra.push(x); } catch (e) { avisos.push("Anexo “" + cortar(a.titulo, 60) + "”: " + (e as Error).message); }
      }
    } else avisos.push("Não consegui listar os anexos do PNCP — envie o PDF.");
  } catch (e) { avisos.push("Anexos do PNCP indisponíveis (" + (e as Error).message + ") — envie o PDF."); }
  return { tipo: "pncp", meta, itens, anexos, pdf, pdfs_extra: pdfsExtra, texto: [meta.objeto, meta.informacao].filter(Boolean).join("\n"), avisos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ ok: false, erro: "Entre como administrador." }, 401);
    const { data: adm } = await sb.rpc("is_admin");
    if (adm !== true) return json({ ok: false, erro: "Apenas administradores." }, 403);

    const body = await req.json().catch(() => ({}));
    const entrada = String(body.url || "").trim();
    if (!entrada) return json({ ok: false, erro: "Informe o link ou o número do edital." }, 400);

    let m = entrada.match(/editais\/(\d{14})\/(\d{4})\/(\d+)/);
    if (m) return json({ ok: true, ...(await porPncp(m[1], m[2], m[3])) });
    m = entrada.match(/(\d{14})-\d+-0*(\d+)\/(\d{4})/);
    if (m) return json({ ok: true, ...(await porPncp(m[1], m[3], m[2])) });

    if (!/^https?:\/\//i.test(entrada)) return json({ ok: false, erro: "Cole um link (http/https) ou o número PNCP." }, 400);
    const r = await buscar(entrada);
    if (!r.ok) return json({ ok: false, erro: "O site respondeu " + r.status + ". Baixe o PDF e envie o arquivo." });
    const tipo = (r.headers.get("content-type") || "").toLowerCase();
    if (tipo.includes("pdf") || /\.pdf(\?|$)/i.test(entrada)) {
      const bytes = await lerLimitado(r, MAX_PDF);
      return json({ ok: true, tipo: "pdf", meta: {}, itens: [], anexos: [], pdf: { nome: entrada.split("/").pop() || "edital.pdf", base64: b64(bytes) }, pdfs_extra: [], texto: "", avisos: [] });
    }
    const bytes = await lerLimitado(r, MAX_HTML);
    const html = new TextDecoder("utf-8").decode(bytes);
    const texto = htmlParaTexto(html);
    const pdfs = [...html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].slice(0, 8).map((x) => { try { return new URL(x[1], entrada).toString(); } catch (_) { return ""; } }).filter(Boolean);
    const avisos = texto.length < 400 ? ["A página trouxe pouco texto (pode depender de JavaScript). Baixe o PDF e envie o arquivo."] : [];
    return json({ ok: true, tipo: "html", meta: {}, itens: [], anexos: [], pdf: null, pdfs_extra: [], texto: texto.slice(0, 300000), pdfs, avisos });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message || "Falha ao buscar o link." });
  }
});
