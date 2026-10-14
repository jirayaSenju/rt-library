/**
 * State machine and error definitions for RT-Library Self-Updater.
 */

const UpdaterState = {
  IDLE: 'IDLE',
  CHECKING: 'CHECKING',
  UP_TO_DATE: 'UP_TO_DATE',
  UPDATE_AVAILABLE: 'UPDATE_AVAILABLE',
  DOWNLOADING: 'DOWNLOADING',
  DOWNLOADED: 'DOWNLOADED',
  INSTALLING: 'INSTALLING',
  ERROR: 'ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
};

const UpdaterErrorCode = {
  DEV_MODE_UNSUPPORTED: 'DEV_MODE_UNSUPPORTED',
  UNSUPPORTED_INSTALL_TYPE: 'UNSUPPORTED_INSTALL_TYPE',
  READ_ONLY_LOCATION: 'READ_ONLY_LOCATION',
  UPDATE_CHECK_FAILED: 'UPDATE_CHECK_FAILED',
  UPDATE_DOWNLOAD_FAILED: 'UPDATE_DOWNLOAD_FAILED',
  UPDATE_INSTALL_FAILED: 'UPDATE_INSTALL_FAILED',
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  RELEASE_METADATA_INVALID: 'RELEASE_METADATA_INVALID',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  UNKNOWN: 'UNKNOWN',
};

function createInitialStatus(currentVersion = '1.0.0') {
  return {
    state: UpdaterState.IDLE,
    currentVersion,
    availableVersion: null,
    releaseDate: null,
    releaseNotes: null,
    downloadUrl: null,
    progress: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    errorCode: null,
    errorMessage: null,
    lastCheckedAt: null,
    isSupported: true,
    channel: 'stable',
  };
}

module.exports = {
  UpdaterState,
  UpdaterErrorCode,
  createInitialStatus,
};

