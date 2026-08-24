import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'documentos';

let containerClient = null;
let accountName = null;
let sharedKeyCredential = null;

export const usaAzure = Boolean(connectionString);

if (usaAzure) {
  try {
    const blobService = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobService.getContainerClient(containerName);
    // Extrai account name/key da connection string para SAS (download seguro)
    const partes = Object.fromEntries(
      connectionString.split(';').filter(Boolean).map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), p.slice(i + 1)];
      })
    );
    accountName = partes.AccountName;
    if (partes.AccountKey) {
      sharedKeyCredential = new StorageSharedKeyCredential(partes.AccountName, partes.AccountKey);
    }
    console.log(`Storage: Azure Blob (${containerName})`);
  } catch (err) {
    console.error('Falha ao iniciar Azure Storage — usando disco local.', err.message);
    containerClient = null;
  }
} else {
  console.log('Storage: disco local (uploads/). Defina AZURE_STORAGE_CONNECTION_STRING para usar Azure.');
}

export function isAzureRef(ref) {
  return typeof ref === 'string' && ref.startsWith('azure:');
}

export function blobNameFromRef(ref) {
  return isAzureRef(ref) ? ref.slice('azure:'.length) : null;
}

function safeName(original) {
  return String(original || 'arquivo')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .slice(0, 120);
}

/** Garante container existe (idempotente). */
export async function ensureContainer() {
  if (!containerClient) return;
  await containerClient.createIfNotExists();
}

/**
 * Salva arquivo (buffer do multer memoryStorage).
 * Retorna ref para gravar em arquivo_path: "azure:blobName" ou caminho local.
 */
export async function saveFile({ buffer, originalname, mimetype, userId, tipo }) {
  const ext = path.extname(originalname || '').toLowerCase() || '';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nome = safeName(originalname || `doc${ext}`);

  if (containerClient) {
    await ensureContainer();
    const blobName = `candidatos/${userId}/${tipo}/${stamp}-${nome}`;
    const block = containerClient.getBlockBlobClient(blobName);
    await block.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimetype || 'application/octet-stream' },
    });
    return `azure:${blobName}`;
  }

  const localName = `doc-${stamp}${ext}`;
  const localPath = path.join(uploadsDir, localName);
  await fs.promises.writeFile(localPath, buffer);
  return localPath;
}

/** Remove arquivo antigo (Azure ou disco). Ignora erros. */
export async function deleteFile(ref) {
  if (!ref) return;
  try {
    if (isAzureRef(ref) && containerClient) {
      await containerClient.getBlockBlobClient(blobNameFromRef(ref)).deleteIfExists();
      return;
    }
    if (fs.existsSync(ref)) await fs.promises.unlink(ref);
  } catch {
    /* best-effort */
  }
}

/** Indica se a ref ainda aponta para um arquivo existente. */
export async function fileExists(ref) {
  if (!ref) return false;
  if (isAzureRef(ref)) {
    if (!containerClient) return false;
    return containerClient.getBlockBlobClient(blobNameFromRef(ref)).exists();
  }
  return fs.existsSync(ref);
}

/**
 * Envia o arquivo na resposta HTTP (stream Azure ou download local).
 */
export async function sendFile(res, ref, downloadName) {
  if (isAzureRef(ref)) {
    if (!containerClient) throw new Error('Azure Storage não configurado.');
    const blob = containerClient.getBlockBlobClient(blobNameFromRef(ref));
    const props = await blob.getProperties();
    const download = await blob.download(0);
    res.setHeader('Content-Type', props.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadName || 'documento')}"`
    );
    if (props.contentLength != null) res.setHeader('Content-Length', props.contentLength);
    download.readableStreamBody.pipe(res);
    return;
  }
  res.download(ref, downloadName || 'documento');
}

/** URL SAS temporária (opcional, para pré-visualização). */
export function sasUrl(ref, minutos = 15) {
  if (!isAzureRef(ref) || !sharedKeyCredential || !accountName) return null;
  const blobName = blobNameFromRef(ref);
  const expiresOn = new Date(Date.now() + minutos * 60_000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    sharedKeyCredential
  ).toString();
  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sas}`;
}
