/**
 * `PdfRendererService` — render de documentos clínicos.
 *
 * **Decisão pragmática Fase 6:** Puppeteer NÃO está nas deps do `apps/api`
 * (verificado em `package.json`). Em vez de adicionar a lib (que tem
 * footprint pesado: Chromium ~150MB) e atrasar a entrega, geramos:
 *   1. **HTML completo** com cabeçalho do hospital + dados do documento +
 *      assinatura digital (quando assinado). Salvo em volume bind
 *      (`/app/apps/api/storage/documentos/`) com extensão `.html`.
 *   2. **PDF placeholder** (mini wrapper PDF 1.4 ASCII com texto
 *      embutido) servido com content-type `application/pdf`. Suficiente
 *      para validar contrato HTTP. Em Fase 7/13 troca por Puppeteer.
 *
 * Trade-off: o PDF gerado **não é production-grade**. Atestados/receitas
 * NÃO devem ser entregues ao paciente em produção sem Puppeteer/PDFKit
 * real. O endpoint `/v1/documentos/:uuid/pdf` retorna o placeholder.
 *
 * Storage: `${PEP_STORAGE_DIR}/<uuid>.{html,pdf}`. Default
 * `apps/api/storage/documentos/`. Em Fase 7+, troca por MinIO/S3 SDK.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

export interface DocumentoTemplateInput {
  tipo: string;
  pacienteNome: string;
  pacienteCpf?: string | null;
  pacienteNascimento?: string | null;
  emissorNome: string;
  emissorRegistro?: string | null;
  dataEmissao: string;
  conteudo: Record<string, unknown>;
  assinatura?: {
    titular: string;
    emissor: string;
    timestamp: string;
    algoritmo: string;
    hashPrefix: string;
    simulado: boolean;
  };
  hospitalNome?: string;
}

@Injectable()
export class PdfRendererService {
  private readonly logger = new Logger(PdfRendererService.name);
  private readonly storageDir: string;

  constructor() {
    this.storageDir =
      process.env.PEP_STORAGE_DIR ??
      join(process.cwd(), 'apps', 'api', 'storage', 'documentos');
  }

  /**
   * Gera HTML + PDF e salva no storage. Retorna URL relativa
   * (`/storage/documentos/<uuid>.pdf`) para gravar em
   * `documentos_emitidos.pdf_url`.
   */
  async renderEPersistir(
    uuid: string,
    input: DocumentoTemplateInput,
  ): Promise<{ pdfUrl: string; htmlPath: string; pdfPath: string }> {
    await fs.mkdir(this.storageDir, { recursive: true });

    const html = renderHtmlTemplate(input);
    const htmlPath = join(this.storageDir, uuid + '.html');
    await fs.writeFile(htmlPath, html, 'utf8');

    const pdfBytes = renderPdfPlaceholder(input);
    const pdfPath = join(this.storageDir, uuid + '.pdf');
    await fs.writeFile(pdfPath, pdfBytes);

    this.logger.log(
      { uuid, tipo: input.tipo, htmlBytes: html.length, pdfBytes: pdfBytes.length },
      'Documento clínico renderizado',
    );

    const pdfUrl = '/storage/documentos/' + uuid + '.pdf';
    return { pdfUrl, htmlPath, pdfPath };
  }

  /**
   * Lê o PDF gerado anteriormente. Usado pelo endpoint /pdf.
   */
  async readPdf(uuid: string): Promise<Buffer> {
    const pdfPath = join(this.storageDir, uuid + '.pdf');
    return fs.readFile(pdfPath);
  }

  /** Para testes — diretório efetivo. */
  getStorageDir(): string {
    return this.storageDir;
  }
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

function renderHtmlTemplate(input: DocumentoTemplateInput): string {
  const titulo = TITULOS[input.tipo] ?? input.tipo;
  const corpo = renderCorpo(input);
  const assinatura = input.assinatura !== undefined
    ? renderAssinatura(input.assinatura)
    : '<p class="aviso">Documento NÃO ASSINADO — sem validade legal.</p>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width:780px; margin:30px auto; color:#222; }
  header { border-bottom:2px solid #444; padding-bottom:8px; margin-bottom:18px; }
  h1 { font-size:18pt; margin:0; }
  h2 { font-size:13pt; margin:16px 0 6px; }
  .meta { font-size:9pt; color:#555; }
  .corpo { line-height:1.5; font-size:11pt; }
  .assinatura { margin-top:30px; border-top:1px dashed #888; padding-top:8px; font-size:9pt; color:#444; }
  .aviso { color:#a00; font-weight:bold; }
  pre { white-space:pre-wrap; font-family:inherit; }
  ul { margin:4px 0 4px 16px; }
</style>
</head>
<body>
<header>
  <h1>${esc(input.hospitalNome ?? 'HMS-BR — Hospital de Demonstração')}</h1>
  <p class="meta">Documento: ${esc(titulo)} • Emissão: ${esc(input.dataEmissao)}</p>
</header>
<section class="paciente">
  <h2>Paciente</h2>
  <p>${esc(input.pacienteNome)}${input.pacienteCpf !== null && input.pacienteCpf !== undefined ? ' • CPF ' + esc(input.pacienteCpf) : ''}${input.pacienteNascimento !== null && input.pacienteNascimento !== undefined ? ' • Nasc. ' + esc(input.pacienteNascimento) : ''}</p>
</section>
<section class="emissor">
  <h2>Emissor</h2>
  <p>${esc(input.emissorNome)}${input.emissorRegistro !== null && input.emissorRegistro !== undefined ? ' • ' + esc(input.emissorRegistro) : ''}</p>
</section>
<section class="corpo">
  <h2>${esc(titulo)}</h2>
  ${corpo}
</section>
<section class="assinatura">
  ${assinatura}
</section>
</body>
</html>`;
}

const TITULOS: Record<string, string> = {
  ATESTADO: 'Atestado Médico',
  RECEITA_SIMPLES: 'Receita Médica',
  RECEITA_CONTROLADO: 'Receita de Medicamento Controlado (Portaria 344)',
  DECLARACAO: 'Declaração',
  ENCAMINHAMENTO: 'Encaminhamento',
  RESUMO_ALTA: 'Resumo de Alta',
  OUTRO: 'Documento Clínico',
};

function renderCorpo(input: DocumentoTemplateInput): string {
  const c = input.conteudo;
  switch (input.tipo) {
    case 'ATESTADO':
      return atestadoHtml(c);
    case 'RECEITA_SIMPLES':
    case 'RECEITA_CONTROLADO':
      return receitaHtml(c, input.tipo === 'RECEITA_CONTROLADO');
    case 'DECLARACAO':
      return declaracaoHtml(c);
    case 'ENCAMINHAMENTO':
      return encaminhamentoHtml(c);
    case 'RESUMO_ALTA':
      return resumoAltaHtml(c);
    default:
      return '<pre>' + esc(JSON.stringify(c, null, 2)) + '</pre>';
  }
}

function atestadoHtml(c: Record<string, unknown>): string {
  const dias = numStr(c.diasAfastamento);
  const cid = strOrEmpty(c.diagnosticoCid);
  const obs = strOrEmpty(c.observacao);
  return `<p>Atesto, para os devidos fins, que o paciente esteve sob meus cuidados,
necessitando de afastamento de suas atividades por <strong>${esc(dias)} dia(s)</strong>.</p>
${cid !== '' ? `<p>Hipótese diagnóstica: <strong>${esc(cid)}</strong> (CID-10).</p>` : ''}
${obs !== '' ? `<p>${esc(obs)}</p>` : ''}`;
}

function receitaHtml(c: Record<string, unknown>, controlado: boolean): string {
  const meds = Array.isArray(c.medicamentos)
    ? (c.medicamentos as Array<Record<string, unknown>>)
    : [];
  const items = meds
    .map((m) => {
      const nome = strOrEmpty(m.nome);
      const dose = strOrEmpty(m.dose);
      const via = strOrEmpty(m.via);
      const freq = strOrEmpty(m.frequencia);
      const dur = strOrEmpty(m.duracao);
      return `<li><strong>${esc(nome)}</strong> ${esc(dose)} — ${esc(via)} ${esc(freq)} • ${esc(dur)}</li>`;
    })
    .join('');
  const seq = controlado ? strOrEmpty(c.numeroSequencial) : '';
  const tarja = controlado ? strOrEmpty(c.tarjaTipo) : '';
  return `${controlado ? `<p class="aviso">Receita controlada (Portaria 344) — Tarja ${esc(tarja)} • Nº ${esc(seq)}</p>` : ''}
<ul>${items}</ul>`;
}

function declaracaoHtml(c: Record<string, unknown>): string {
  return `<p>${esc(strOrEmpty(c.texto))}</p>
<p><em>Finalidade: ${esc(strOrEmpty(c.finalidade))}</em></p>`;
}

function encaminhamentoHtml(c: Record<string, unknown>): string {
  return `<p>Encaminho o paciente para avaliação em <strong>${esc(strOrEmpty(c.especialidade))}</strong>.</p>
<p>Urgência: <strong>${esc(strOrEmpty(c.urgencia))}</strong>.</p>
<p>Motivo: ${esc(strOrEmpty(c.motivo))}</p>`;
}

function resumoAltaHtml(c: Record<string, unknown>): string {
  const cids = Array.isArray(c.diagnosticosCID) ? (c.diagnosticosCID as unknown[]) : [];
  const procs = strOrEmpty(c.procedimentosRealizados);
  const presc = strOrEmpty(c.prescricoesEmAlta);
  const rec = strOrEmpty(c.recomendacoes);
  return `<h3>Diagnósticos</h3>
<ul>${cids.map((d) => '<li>' + esc(String(d)) + '</li>').join('')}</ul>
<h3>Procedimentos realizados</h3>
<p>${esc(procs)}</p>
<h3>Prescrições em alta</h3>
<p>${esc(presc)}</p>
<h3>Recomendações</h3>
<p>${esc(rec)}</p>`;
}

function renderAssinatura(a: NonNullable<DocumentoTemplateInput['assinatura']>): string {
  const aviso = a.simulado
    ? '<p class="aviso">Assinatura SIMULADA (ambiente de desenvolvimento — sem validade legal).</p>'
    : '';
  return `<p><strong>Assinado digitalmente</strong></p>
<p>Titular: ${esc(a.titular)}</p>
<p>Emissor: ${esc(a.emissor)}</p>
<p>Data/Hora: ${esc(a.timestamp)} • Algoritmo: ${esc(a.algoritmo)}</p>
<p>Hash: ${esc(a.hashPrefix)}…</p>
${aviso}`;
}

function strOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}
function numStr(v: unknown): string {
  return typeof v === 'number' ? String(v) : strOrEmpty(v);
}

/**
 * Mini-PDF placeholder. Não é PDF "real" no sentido completo, mas é um
 * documento PDF 1.4 válido com texto embutido — suficiente para
 * validar o contrato HTTP / abrir em viewer simples. Production usa
 * Puppeteer/PDFKit (Fase 13).
 */
function renderPdfPlaceholder(input: DocumentoTemplateInput): Buffer {
  const titulo = TITULOS[input.tipo] ?? input.tipo;
  const linhas: string[] = [
    'HMS-BR Documento Clinico',
    'Tipo: ' + titulo,
    'Paciente: ' + input.pacienteNome,
    'Emissor: ' + input.emissorNome,
    'Data: ' + input.dataEmissao,
    '',
    'Conteudo (resumo):',
    JSON.stringify(input.conteudo).slice(0, 250),
  ];
  if (input.assinatura !== undefined) {
    linhas.push('');
    linhas.push('Assinado: ' + input.assinatura.titular);
    linhas.push('Hash: ' + input.assinatura.hashPrefix);
    linhas.push('Em: ' + input.assinatura.timestamp);
  } else {
    linhas.push('');
    linhas.push('*** NAO ASSINADO ***');
  }
  return buildPdf(linhas);
}

function buildPdf(linhas: string[]): Buffer {
  // PDF 1.4 mínimo: 1 página, fonte Helvetica, BT/ET com TD por linha.
  const safe = linhas.map((l) => l.replace(/[()\\]/g, ' '));
  let textOps = 'BT /F1 11 Tf 50 780 Td 14 TL\n';
  textOps += '(' + safe[0] + ') Tj\n';
  for (let i = 1; i < safe.length; i++) {
    textOps += 'T* (' + safe[i] + ') Tj\n';
  }
  textOps += 'ET';

  const stream = textOps;
  const objects: string[] = [];
  // Object 1: Catalog
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  // Object 2: Pages
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  // Object 3: Page
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
  // Object 4: Content stream
  objects[4] =
    '<< /Length ' + Buffer.byteLength(stream, 'utf8') + ' >>\nstream\n' + stream + '\nendstream';
  // Object 5: Font
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  // Monta PDF
  const header = '%PDF-1.4\n%\xC2\xA1\xC2\xB1\n';
  let body = '';
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(header + body, 'utf8');
    body += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(header + body, 'utf8');
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  const trailer =
    'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  return Buffer.from(header + body + xref + trailer, 'binary');
}
