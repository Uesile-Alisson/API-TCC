require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { setServers } = require('node:dns');
const { GridFSBucket, MongoClient, ObjectId } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const API_BASE_URL =
  process.env.REAL_GRIDFS_API_BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}/api`;
const LOGIN = process.env.REAL_GRIDFS_LOGIN ?? 'admin';
const PASSWORD =
  process.env.REAL_GRIDFS_PASSWORD ??
  process.env.DEV_ADMIN_PASSWORD ??
  'Admin@123';
const MONGODB_DATABASE = process.env.MONGODB_DATABASE ?? 'tsea';
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  'tmp',
  'real-gridfs-validation',
);
const PDF_CONTENT_TYPE = 'application/pdf';
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

setServers(['8.8.8.8', '1.1.1.1']);

function print(label, value) {
  process.stdout.write(`${label} ${JSON.stringify(value)}\n`);
}

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assertCondition(condition, message, details) {
  if (!condition) {
    fail(message, details);
  }
}

function toSafeReport(report) {
  return {
    id_relatorio: report.id_relatorio,
    id_processo: report.id_processo,
    id_alarme: report.id_alarme,
    formato_relatorio: report.formato_relatorio,
    nome_arquivo: report.nome_arquivo,
    content_type: report.content_type,
    bucket_name: report.bucket_name,
    storage_provider: report.storage_provider,
    tamanho_bytes: report.tamanho_bytes?.toString?.() ?? report.tamanho_bytes,
    gridfs_file_id: report.gridfs_file_id ? 'present' : null,
  };
}

function toPublicReportSummary(report) {
  return {
    id_relatorio: report.id_relatorio,
    formato: getReportFormat(report),
    tipo_relatorio: report.tipo_relatorio,
    id_processo: report.id_processo,
    id_alarme: report.id_alarme,
    nome_arquivo: report.nome_arquivo,
    content_type: report.content_type,
    hasGridFsLeak: Object.prototype.hasOwnProperty.call(
      report,
      'gridfs_file_id',
    ),
  };
}

async function readStreamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function detectSignature(buffer) {
  if (buffer.subarray(0, 4).toString('utf8') === '%PDF') {
    return 'PDF';
  }

  if (buffer.subarray(0, 2).toString('utf8') === 'PK') {
    return 'ZIP_OPENXML';
  }

  return 'UNKNOWN';
}

function normalizeGeneratedReports(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.relatorios)) {
    return payload.relatorios;
  }

  return payload ? [payload] : [];
}

function getReportFormat(report) {
  return report.formato ?? report.formato_relatorio ?? report.format;
}

function assertPublicReportsDoNotLeakGridFs(reports, label) {
  for (const report of reports) {
    assertCondition(
      !Object.prototype.hasOwnProperty.call(report, 'gridfs_file_id'),
      `${label} vazou gridfs_file_id na resposta publica.`,
      toPublicReportSummary(report),
    );
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    fail(`${response.status} ${response.statusText}`, { url, payload });
  }

  return payload;
}

async function fetchFile(url, token, filename) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type');
  const contentDisposition = response.headers.get('content-disposition');

  if (!response.ok) {
    fail(`${response.status} ${response.statusText}`, {
      url,
      body: buffer.toString('utf8', 0, Math.min(buffer.length, 500)),
    });
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(target, buffer);

  return {
    status: response.status,
    ok: response.ok,
    contentType,
    contentDisposition,
    bytes: buffer.length,
    signature: detectSignature(buffer),
    output: target,
  };
}

function assertFileResult(result, expected) {
  assertCondition(result.ok, `${expected.label} respondeu erro HTTP.`, result);
  assertCondition(result.bytes > 0, `${expected.label} retornou arquivo vazio.`, result);
  assertCondition(
    result.contentType?.includes(expected.contentType),
    `${expected.label} retornou content-type inesperado.`,
    result,
  );
  assertCondition(
    result.contentDisposition?.includes(expected.disposition),
    `${expected.label} retornou content-disposition inesperado.`,
    result,
  );
  assertCondition(
    result.signature === expected.signature,
    `${expected.label} retornou assinatura inesperada.`,
    result,
  );
}

async function validateStoredReport({ prisma, mongoDb, reportId, expected }) {
  const report = await prisma.relatorios.findUnique({
    where: { id_relatorio: reportId },
    select: {
      id_relatorio: true,
      id_processo: true,
      id_alarme: true,
      formato_relatorio: true,
      nome_arquivo: true,
      content_type: true,
      bucket_name: true,
      storage_provider: true,
      tamanho_bytes: true,
      gridfs_file_id: true,
    },
  });

  assertCondition(report, `${expected.label} nao existe no PostgreSQL.`, {
    reportId,
  });
  assertCondition(
    report.formato_relatorio === expected.formato,
    `${expected.label} tem formato divergente no PostgreSQL.`,
    toSafeReport(report),
  );
  assertCondition(
    report.content_type === expected.contentType,
    `${expected.label} tem content_type divergente no PostgreSQL.`,
    toSafeReport(report),
  );
  assertCondition(
    report.storage_provider === 'GRIDFS',
    `${expected.label} nao esta marcado como GRIDFS.`,
    toSafeReport(report),
  );
  assertCondition(
    Number(report.tamanho_bytes) > 0,
    `${expected.label} tem tamanho_bytes invalido.`,
    toSafeReport(report),
  );
  assertCondition(
    typeof report.gridfs_file_id === 'string' && ObjectId.isValid(report.gridfs_file_id),
    `${expected.label} nao possui gridfs_file_id valido.`,
    toSafeReport(report),
  );

  if (expected.id_processo !== undefined) {
    assertCondition(
      report.id_processo === expected.id_processo,
      `${expected.label} nao esta vinculado ao processo esperado.`,
      toSafeReport(report),
    );
  }

  if (expected.id_alarme !== undefined) {
    assertCondition(
      report.id_alarme === expected.id_alarme,
      `${expected.label} nao esta vinculado ao alarme esperado.`,
      toSafeReport(report),
    );
  }

  const bucketName = report.bucket_name ?? 'relatorios';
  const fileId = new ObjectId(report.gridfs_file_id);
  const fileRecord = await mongoDb
    .collection(`${bucketName}.files`)
    .findOne({ _id: fileId });

  assertCondition(fileRecord, `${expected.label} nao existe no GridFS.`, {
    id_relatorio: report.id_relatorio,
    bucketName,
  });
  assertCondition(
    fileRecord.length > 0,
    `${expected.label} tem length invalido no GridFS.`,
    { id_relatorio: report.id_relatorio, bucketName, length: fileRecord.length },
  );

  const bucket = new GridFSBucket(mongoDb, { bucketName });
  const buffer = await readStreamToBuffer(bucket.openDownloadStream(fileId));
  const signature = detectSignature(buffer);

  assertCondition(
    buffer.length === fileRecord.length,
    `${expected.label} tem tamanho baixado divergente do GridFS.`,
    {
      id_relatorio: report.id_relatorio,
      gridFsLength: fileRecord.length,
      downloadedBytes: buffer.length,
    },
  );
  assertCondition(
    signature === expected.signature,
    `${expected.label} tem assinatura divergente no GridFS.`,
    { id_relatorio: report.id_relatorio, signature },
  );

  print(expected.printLabel, {
    ok: true,
    report: toSafeReport(report),
    gridfs: {
      exists: true,
      bucketName,
      filename: fileRecord.filename,
      contentType: fileRecord.contentType,
      length: fileRecord.length,
      downloadedBytes: buffer.length,
      signature,
    },
  });

  return report;
}

async function findLatestReport(prisma, where) {
  return prisma.relatorios.findFirst({
    where,
    select: {
      id_relatorio: true,
      id_processo: true,
      id_alarme: true,
      formato_relatorio: true,
      content_type: true,
    },
    orderBy: { id_relatorio: 'desc' },
  });
}

async function getToken() {
  const signin = await fetchJson(`${API_BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN, senha: PASSWORD }),
  });

  assertCondition(signin.access_token, 'Login nao retornou access_token.', {
    login: signin.usuario?.login,
  });

  print('api_login', {
    ok: true,
    login: signin.usuario?.login,
    nivel_acesso: signin.usuario?.nivel_acesso?.nome,
    primeiro_acesso: signin.usuario?.primeiro_acesso,
  });

  return signin.access_token;
}

async function validateProcessReports({ prisma, mongoDb, token }) {
  const candidateProcess = await prisma.processos.findFirst({
    where: {
      status_processo: { in: ['CONCLUIDO', 'FALHA', 'INTERROMPIDO'] },
      relatorios: { none: { formato_relatorio: 'PDF' } },
    },
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
    },
    orderBy: { id_processo: 'desc' },
  });
  let processReports = [];

  if (candidateProcess) {
    const generated = await fetchJson(
      `${API_BASE_URL}/relatorios/processos/${candidateProcess.id_processo}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formatos: ['PDF', 'XLSX'],
          observacao: 'validacao real MongoDB GridFS via script',
        }),
      },
    );

    processReports = normalizeGeneratedReports(generated);
    assertPublicReportsDoNotLeakGridFs(processReports, 'relatorio de processo');
    print('api_generate_process_report', {
      ok: true,
      id_processo: candidateProcess.id_processo,
      reports: processReports.map(toPublicReportSummary),
    });
  } else {
    print('api_generate_process_report', {
      ok: true,
      reusedExistingReports: true,
      reason: 'Nenhum processo finalizado sem PDF encontrado.',
    });
  }

  const generatedPdf = processReports.find(
    (report) => getReportFormat(report) === 'PDF',
  );
  const generatedXlsx = processReports.find(
    (report) => getReportFormat(report) === 'XLSX',
  );
  const pdfReport =
    generatedPdf ??
    (await findLatestReport(prisma, {
      tipo_relatorio: 'PROCESSO',
      formato_relatorio: 'PDF',
      id_processo: { not: null },
    }));
  const xlsxReport =
    generatedXlsx ??
    (await findLatestReport(prisma, {
      tipo_relatorio: 'PROCESSO',
      formato_relatorio: 'XLSX',
      id_processo: { not: null },
    }));

  assertCondition(pdfReport?.id_relatorio, 'Nao ha relatorio PDF de processo real.', {
    generated: processReports.map(toPublicReportSummary),
  });
  assertCondition(xlsxReport?.id_relatorio, 'Nao ha relatorio XLSX de processo real.', {
    generated: processReports.map(toPublicReportSummary),
  });

  const storedPdf = await validateStoredReport({
    prisma,
    mongoDb,
    reportId: pdfReport.id_relatorio,
    expected: {
      label: 'PDF de processo',
      printLabel: 'gridfs_process_pdf_report',
      formato: 'PDF',
      contentType: PDF_CONTENT_TYPE,
      signature: 'PDF',
      id_processo: pdfReport.id_processo,
    },
  });
  await validateStoredReport({
    prisma,
    mongoDb,
    reportId: xlsxReport.id_relatorio,
    expected: {
      label: 'XLSX de processo',
      printLabel: 'gridfs_process_xlsx_report',
      formato: 'XLSX',
      contentType: XLSX_CONTENT_TYPE,
      signature: 'ZIP_OPENXML',
      id_processo: xlsxReport.id_processo,
    },
  });

  const preview = await fetchFile(
    `${API_BASE_URL}/relatorios/${storedPdf.id_relatorio}/preview`,
    token,
    `process-preview-${storedPdf.id_relatorio}.pdf`,
  );
  assertFileResult(preview, {
    label: 'Preview PDF de processo',
    contentType: PDF_CONTENT_TYPE,
    disposition: 'inline',
    signature: 'PDF',
  });
  print('api_preview_process_pdf', preview);

  const download = await fetchFile(
    `${API_BASE_URL}/relatorios/${xlsxReport.id_relatorio}/download`,
    token,
    `process-download-${xlsxReport.id_relatorio}.xlsx`,
  );
  assertFileResult(download, {
    label: 'Download XLSX de processo',
    contentType: XLSX_CONTENT_TYPE,
    disposition: 'attachment',
    signature: 'ZIP_OPENXML',
  });
  print('api_download_process_xlsx', download);
}

async function validateAlarmReport({ prisma, mongoDb, token }) {
  const candidateAlarm = await prisma.alarmes.findFirst({
    where: {
      excluido_em: null,
      status_alarme: 'RESOLVIDO',
      relatorios: { none: { formato_relatorio: 'PDF' } },
    },
    select: {
      id_alarme: true,
      tipo_alarme: true,
      severidade: true,
      status_alarme: true,
    },
    orderBy: { id_alarme: 'desc' },
  });

  let alarmReports = [];

  if (candidateAlarm) {
    const generated = await fetchJson(
      `${API_BASE_URL}/relatorios/alarmes/${candidateAlarm.id_alarme}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formato: 'PDF',
          observacao: 'validacao real de Alarme PDF MongoDB GridFS via script',
        }),
      },
    );

    alarmReports = normalizeGeneratedReports(generated);
    assertPublicReportsDoNotLeakGridFs(alarmReports, 'relatorio de alarme');
    print('api_generate_alarm_report', {
      ok: true,
      id_alarme: candidateAlarm.id_alarme,
      reports: alarmReports.map(toPublicReportSummary),
    });
  } else {
    print('api_generate_alarm_report', {
      ok: true,
      reusedExistingReports: true,
      reason: 'Nenhum alarme sem PDF encontrado.',
    });
  }

  const generatedPdf = alarmReports.find(
    (report) => getReportFormat(report) === 'PDF',
  );
  const pdfReport =
    generatedPdf ??
    (await findLatestReport(prisma, {
      tipo_relatorio: 'ALARME',
      formato_relatorio: 'PDF',
      id_alarme: { not: null },
    }));

  assertCondition(pdfReport?.id_relatorio, 'Nao ha relatorio PDF de alarme real.', {
    reports: alarmReports.map(toPublicReportSummary),
  });
  assertCondition(
    pdfReport.id_alarme ?? candidateAlarm?.id_alarme,
    'Relatorio PDF de alarme nao possui vinculo com alarme.',
    toPublicReportSummary(pdfReport),
  );

  const storedPdf = await validateStoredReport({
    prisma,
    mongoDb,
    reportId: pdfReport.id_relatorio,
    expected: {
      label: 'PDF de alarme',
      printLabel: 'gridfs_alarm_pdf_report',
      formato: 'PDF',
      contentType: PDF_CONTENT_TYPE,
      signature: 'PDF',
      id_alarme: pdfReport.id_alarme ?? candidateAlarm?.id_alarme,
    },
  });

  const preview = await fetchFile(
    `${API_BASE_URL}/relatorios/${storedPdf.id_relatorio}/preview`,
    token,
    `alarm-preview-${storedPdf.id_relatorio}.pdf`,
  );
  assertFileResult(preview, {
    label: 'Preview PDF de alarme',
    contentType: PDF_CONTENT_TYPE,
    disposition: 'inline',
    signature: 'PDF',
  });
  print('api_preview_alarm_pdf', preview);

  const download = await fetchFile(
    `${API_BASE_URL}/relatorios/${storedPdf.id_relatorio}/download`,
    token,
    `alarm-download-${storedPdf.id_relatorio}.pdf`,
  );
  assertFileResult(download, {
    label: 'Download PDF de alarme',
    contentType: PDF_CONTENT_TYPE,
    disposition: 'attachment',
    signature: 'PDF',
  });
  print('api_download_alarm_pdf', download);
}

async function main() {
  const hasMongo = Boolean(process.env.MONGODB_URI);
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  let mongo;
  let prisma;

  print('env', {
    MONGODB_URI: hasMongo,
    DATABASE_URL: hasDatabase,
    JWT_SECRET: Boolean(process.env.JWT_SECRET),
    apiBaseUrl: API_BASE_URL,
    mongoDatabase: MONGODB_DATABASE,
  });

  assertCondition(
    hasMongo && hasDatabase,
    'MONGODB_URI e DATABASE_URL precisam estar configuradas.',
    { MONGODB_URI: hasMongo, DATABASE_URL: hasDatabase },
  );

  try {
    mongo = new MongoClient(process.env.MONGODB_URI);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

    await mongo.connect();
    await prisma.$connect();

    const mongoDb = mongo.db(MONGODB_DATABASE);
    const collections = await mongoDb.listCollections().toArray();
    const relatoriosFilesCount = await mongoDb
      .collection('relatorios.files')
      .countDocuments()
      .catch(() => null);

    print('mongo', {
      connected: true,
      database: MONGODB_DATABASE,
      collections: collections.length,
      relatoriosFiles: relatoriosFilesCount,
    });

    const latestReports = await prisma.relatorios.findMany({
      select: {
        id_relatorio: true,
        id_processo: true,
        id_alarme: true,
        formato_relatorio: true,
        nome_arquivo: true,
        content_type: true,
        bucket_name: true,
        storage_provider: true,
        tamanho_bytes: true,
        gridfs_file_id: true,
      },
      take: 5,
      orderBy: { id_relatorio: 'desc' },
    });
    const activeAlarmCount = await prisma.alarmes.count({
      where: { excluido_em: null },
    });
    const alarmReportCount = await prisma.relatorios.count({
      where: {
        tipo_relatorio: 'ALARME',
        formato_relatorio: 'PDF',
        id_alarme: { not: null },
      },
    });

    print('postgres', {
      connected: true,
      latestReports: latestReports.map(toSafeReport),
    });
    print('alarm_preflight', {
      activeAlarmCount,
      alarmReportCount,
    });

    assertCondition(
      activeAlarmCount > 0 || alarmReportCount > 0,
      'Nao ha alarme real nem PDF de alarme existente para validar.',
      { activeAlarmCount, alarmReportCount },
    );

    const token = await getToken();

    await validateProcessReports({ prisma, mongoDb, token });
    await validateAlarmReport({ prisma, mongoDb, token });

    print('validation_complete', { ok: true });
  } finally {
    await prisma?.$disconnect().catch(() => undefined);
    await mongo?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(
    `validation_failed ${JSON.stringify({
      name: error.name,
      message: error.message,
      details: error.details,
    })}\n`,
  );
  process.exit(1);
});
