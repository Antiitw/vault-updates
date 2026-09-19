const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = {
  invoke: [
    'settings:get', 'settings:save',
    'auth:isUnlocked', 'auth:isInitialized', 'auth:setup', 'auth:login', 'auth:changePassword',
    'files:list', 'files:add', 'files:delete', 'files:getPath', 'files:decrypt', 'files:getThumbBase64', 'files:readContent',
    'notes:list', 'notes:add', 'notes:delete', 'notes:update',
    'passwords:list', 'passwords:add', 'passwords:delete', 'passwords:update', 'passwords:toggleFavorite',
    'folders:list', 'folders:add', 'folders:delete',
    'stats:get',
    'window:minimize', 'window:maximize', 'window:close',
    'app:lock',
    'update:check', 'update:install',
    'webauthn:hasCredential', 'webauthn:register', 'webauthn:authenticate',
    'vault:export',
    'dialog:openFiles'
  ],
  on: [
    'update:status'
  ]
};

function isAllowed(channel, type) {
  return ALLOWED_CHANNELS[type] && ALLOWED_CHANNELS[type].includes(channel);
}

contextBridge.exposeInMainWorld('vaultAPI', {
  invoke: (channel, ...args) => {
    if (!isAllowed(channel, 'invoke')) {
      return Promise.reject(new Error(`Blocked IPC: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel, callback) => {
    if (!isAllowed(channel, 'on')) {
      return;
    }
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  randomBytes: (size) => {
    const arr = new Uint8Array(size);
    crypto.getRandomValues(arr);
    return arr;
  },

  platform: process.platform
});
