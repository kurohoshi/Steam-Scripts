const steamToolsUtils = {
    INV_FETCH_DELAY1: 3*1000, // for trade offer window or own inv
    INV_FETCH_DELAY2: 60*1000, // for others' regular inv
    FETCH_DELAY: 1000,
    sleep: function(ms) {
       return new Promise(resolve => setTimeout(resolve, ms));
    },
    deepClone(obj) {
       // Consider structuredClone()?
       // or something custom for performance?
       return JSON.parse(JSON.stringify(obj));
    },
    getSessionId: function() {
       return unsafeWindow.g_sessionID;
    },
    getMySteamId: function() {
       return unsafeWindow.g_steamID;
    },
    isSteamId64Format: function(str) {
       return /76561\d{12}/.test(str);
    },
    getSteamProfileId64: function(steamid3) {
       return '76561'+(parseInt(steamid3)+197960265728);
    },
    getSteamProfileId3: function(steamid64) {
       return String(parseInt(steamid64.substring(5))-197960265728);
    },
    getSteamLanguage: function() {
       return unsafeWindow.g_strLanguage;
    },
    isSimplyObject: function(obj) {
       return typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
    },
    isEmptyObject: function(obj) {
       for(let x in obj) {
          if(Object.hasOwn(obj, x)) {
             return false;
          }
       } return true;
    },
    isOutdatedDays: function(epochTime, days) {
       return epochTime < Date.now()-days*24*60*60*1000;
    },
    isOutdatedHours: function(epochTime, hours) {
       return epochTime < Date.now()-hours*60*60*1000;
    },
    generateExportDataElement: function(name, filename, data) {
       if(!data) {
          console.warn('exportConfig(): config not found, no configurations to be exported!');
          return;
       }
 
       let tmpElem = document.createElement('a');
       tmpElem.setAttribute('id', 'export-'+name);
       tmpElem.setAttribute('href', 'data:application/json;charset=utf-8,'+ encodeURIComponent(JSON.stringify(data)));
       tmpElem.setAttribute('download', filename+'.json');
       return tmpElem;
    },
    generateImportDataElement: function(name) {
       let tmpElem = document.createElement('input');
       tmpElem.setAttribute('id', 'import-'+name);
       tmpElem.setAttribute('type', 'file');
       tmpElem.setAttribute('accept', 'application/json');
       return tmpElem;
    }
 };