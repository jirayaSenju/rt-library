/**
 * CommonJS Version of Torrent Source Resolver for Node.js / Electron Main / Unit Tests.
 */

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function extractDirName(pathStr, nameStr) {
  if (!pathStr || !pathStr.includes('/')) return null;
  const parts = pathStr.split('/');
  parts.pop();
  const dir = parts.join('/');
  if (!dir || dir === nameStr) return null;
  return dir;
}

function extractFileExtension(filename) {
  if (!filename || !filename.includes('.')) return 'FILE';
  const ext = filename.split('.').pop() || 'FILE';
  if (ext.length > 8 || /\s/.test(ext)) return 'FILE';
  return ext.toUpperCase();
}

function resolveTorrentDisplayData(params) {
  const catalog = params.catalog || null;
  const p2p = params.torrentMetadata || null;

  let resolvedFiles = null;
  let filesSource = null;

  const hasP2PFiles = Boolean(
    p2p &&
    p2p.metadataStatus === 'complete' &&
    Array.isArray(p2p.files) &&
    p2p.files.length > 0
  );

  if (hasP2PFiles && p2p && p2p.files) {
    resolvedFiles = p2p.files.map((f) => {
      const pathStr = f.path || f.name || '';
      const nameStr = f.name || pathStr.split('/').pop() || pathStr;
      const len = typeof f.length === 'number' && f.length >= 0 ? Math.floor(f.length) : 0;
      return {
        name: nameStr,
        path: pathStr,
        length: len,
        sizeStr: formatBytes(len),
        extension: extractFileExtension(nameStr),
        dirPath: extractDirName(pathStr, nameStr),
      };
    });
    filesSource = 'torrent';
  } else if (catalog && Array.isArray(catalog.fileList) && catalog.fileList.length > 0) {
    resolvedFiles = catalog.fileList.map((f) => {
      const pathStr = f.path || f.name || '';
      const nameStr = f.name || pathStr.split('/').pop() || pathStr;
      const len = typeof f.sizeBytes === 'number' && f.sizeBytes >= 0
        ? Math.floor(f.sizeBytes)
        : typeof f.length === 'number' && f.length >= 0
        ? Math.floor(f.length)
        : typeof f.size === 'number' && f.size >= 0
        ? Math.floor(f.size)
        : 0;

      const sizeStr = typeof f.size === 'string' && f.size
        ? f.size
        : len > 0
        ? formatBytes(len)
        : null;

      return {
        name: nameStr,
        path: pathStr,
        length: len,
        sizeStr,
        extension: extractFileExtension(nameStr),
        dirPath: extractDirName(pathStr, nameStr),
      };
    });
    filesSource = 'catalog';
  }

  const fileCount =
    (resolvedFiles ? resolvedFiles.length : null) ??
    p2p?.fileCount ??
    catalog?.fileCount ??
    null;

  let totalSizeBytes = null;
  let totalSizeSource = null;
  let totalSizeFormatted = '—';

  if (p2p?.totalSizeBytes && typeof p2p.totalSizeBytes === 'number' && p2p.totalSizeBytes > 0) {
    totalSizeBytes = Math.floor(p2p.totalSizeBytes);
    totalSizeSource = 'torrent';
    totalSizeFormatted = formatBytes(totalSizeBytes);
  } else if (catalog?.sizeBytes && typeof catalog.sizeBytes === 'number' && catalog.sizeBytes > 0) {
    totalSizeBytes = Math.floor(catalog.sizeBytes);
    totalSizeSource = 'catalog';
    totalSizeFormatted = formatBytes(totalSizeBytes);
  } else {
    const catalogFilesSum = resolvedFiles && resolvedFiles.length > 0
      ? resolvedFiles.reduce((acc, f) => acc + (f.length || 0), 0)
      : 0;

    const catalogTotalSizeBytes = catalog?.fileListTotalSizeBytes || catalogFilesSum;

    if (catalogTotalSizeBytes > 0) {
      totalSizeBytes = Math.floor(catalogTotalSizeBytes);
      totalSizeSource = 'catalog-files';
      totalSizeFormatted = formatBytes(totalSizeBytes);
    } else if (catalog?.size && typeof catalog.size === 'string' && catalog.size !== 'N/A') {
      totalSizeBytes = null;
      totalSizeSource = 'catalog';
      totalSizeFormatted = catalog.size;
    }
  }

  return {
    totalSizeBytes,
    totalSizeFormatted,
    totalSizeSource,

    files: resolvedFiles,
    filesSource,
    fileCount,

    seeds: p2p?.seeds ?? null,
    leechers: p2p?.leechers ?? null,
    peers: p2p?.peers ?? null,

    swarmUpdatedAt: p2p?.swarmFetchedAt ?? null,
    metadataStatus: p2p?.metadataStatus ?? null,
    swarmStatus: p2p?.swarmStatus ?? null,
  };
}

module.exports = {
  formatBytes,
  extractDirName,
  extractFileExtension,
  resolveTorrentDisplayData,
};
