const SteamToolsDbManager = {
   db: undefined,
   setup: function() {
      return new Promise((resolve, reject) => {
         if(this.db) {
            resolve();
            return;
         }

         const dbReq = indexedDB.open("SteamTools", 1);

         dbReq.onblocked = event => {
            alert("New Steam Tools database version detected, please close all tabs of this site!");
         }

         dbReq.onupgradeneeded = event => {
            this.db = event.target.result;

            if(event.oldVersion === 0) {
               // NOTE: objconfig should be validated
               for(let objConfig of DB_OBJECTSTORE_CONFIGS) {
                  if(!objConfig.keypath && !objConfig.autoincr) {
                     this.db.createObjectStore(objConfig.name);
                  } else {
                     let options = {};
                     if(typeof objConfig.keypath === 'string') {
                        options.keyPath = objConfig.keypath;
                     }
                     if(objConfig.autoincr) {
                        options.autoincr = true;
                     }
                     let newObjStore = this.db.createObjectStore(objConfig.name, options);
                     if(objConfig.indices && Array.isArray(objConfig.indices)) {
                        for(let indexerEntry of objConfig.indices) {
                           newObjStore.createIndex(indexerEntry.name, indexerEntry.keyPath, indexerEntry.options);
                        }
                     }
                  }
               }
            }
         }

         dbReq.onsuccess = event => {
            this.db = event.target.result;
            this.db.onversionchange = event => {
               this.db = this.db.close();
               console.log("A new version of this page is ready. Please reload or close this tab!");
            }
            console.log("Database is set up!");
            resolve();
         }

         dbReq.onerror = event => {
            reject("Error opening database. Error code: " + event.target.errorCode);
         }
      });
   },
   isSetup: function() {
      if(!this.db) {
         console.warn("Database not detected, maybe run setup or reload page?");
         return false;
      }

      return true;
   },
   // get multiple: probably used indexrange+getAll, or iteratively execute get with the same or batches of transactions
   get: function(ObjStoreName, indexName, keys, successCb) {
      const MAX_REQ = 10;
      if(!Array.isArray(keys)) {
         keys = [keys];
      }

      return new Promise((resolve, reject) => {
         if(!this.isSetup()) {
            resolve();
            return;
         }

         let result = {};

         let transactions = Array(Math.ceil(keys.length/MAX_REQ));
         for(let i=0; i<transactions.length; i++) {
            transactions[i] = new Promise((res, rej) => {

               let trans = this.db.transaction([ObjStoreName], "readonly");
               trans.oncomplete = event => {
                  res();
               }
               const getValue = (transaction, startIndex, offset) => {
                  let objStoreReq = transaction.objectStore(ObjStoreName);
                  if(indexName) {
                     objStoreReq = objStoreReq.index(indexName);
                  }
                  objStoreReq = objStoreReq.get(keys[startIndex+offset]);
                  objStoreReq.onsuccess = (event) => {
                     let cbResult;
                     if(typeof successCb === 'function') {
                        cbResult = successCb(event);
                     }
                     cbResult ??= event.target.result;
                     result[keys[startIndex+offset]] = cbResult;

                     if((offset+1 < MAX_REQ) && (startIndex+offset+1<keys.length)) {
                        getValue(event.target.transaction, startIndex, offset+1);
                     }
                  }
                  objStoreReq.onerror = (event) => {
                     rej();
                  }
               };
               getValue(trans, i*MAX_REQ, 0);
            });
         }
         Promise.all(transactions).then(() => resolve(result));
      });
   },
   set: function(ObjStoreName, data, key, successCb) {
      return new Promise((resolve, reject) => {
         if(!this.isSetup()) {
            resolve();
            return;
         }

         let objStoreReq = this.db
            .transaction([ObjStoreName], "readwrite")
            .objectStore(ObjStoreName)
            .put(data, key);

         objStoreReq.onsuccess = event => {
            let cbResult;
            if(typeof successCb === 'function') {
               successCb(event);
            }
            resolve();
         }
         objStoreReq.onerror = event => {
            reject();
         }
      });
   },
   getProfiles: async function(profileids, useURL=false) {
      return useURL
         ? (await this.get("profiles", 'url', profileids))
         : (await this.get("profiles", undefined, profileids));
   },
   setProfile: async function(profile) {
      let savedData = await this.get("profiles", undefined, profile.id);
      savedData = savedData[profile.id] ?? {};
      savedData.id         = profile.id         ?? savedData.id;
      savedData.url        = profile.url        ?? savedData.url;
      savedData.name       = profile.name       ?? savedData.name;
      savedData.pfp        = profile.pfp        ?? savedData.pfp;
      savedData.state      = profile.state      ?? savedData.state;
      savedData.tradeToken = profile.tradeToken ?? savedData.tradeToken;
      savedData.friends    = profile.friends    ?? savedData.friends;
      savedData.last_updated = profile.last_updated ?? savedData.last_updated;

      await this.set("profiles", savedData, profile.id);
   },
   getBadgepages: async function(profileids) {
      return await this.get("badgepages", undefined, profileids);
   },
   setBadgepages: async function(profileid, badgepages) {
      let savedData = await this.get("badgepages", undefined, profileid);
      if(savedData[profileid]) {
         savedData = savedData[profileid];
         for(let [rarity, appList] of badgepages.entries()) {
            for(let [appid, data] of Object.entries(appList)) {
               if(data.last_updated>savedData[rarity][appid].last_updated) {
                  savedData[rarity][appid] = data;
               }
            }
         }
      } else {
         savedData = badgepages;
      }

      await this.set("badgepages", savedData, profileid);
   },
   getAppDatas: async function(appids) {
      return await this.get("app_data", undefined, appids);
   },
   setAppData: async function(appid, appdata) {
      let savedData = await this.get("app_data", undefined, appid);
      if(savedData[appid]) {
         savedData = savedData[appid];
         savedData.appid ??= appdata.appid;
         savedData.name  ??= appdata.name;
         if(appdata.badges) {
            savedData.badges ??= { normal: {}, foil: {} };
            for(let rarity in appdata.badges) {
               for(let level in appdata.badges[rarity]) {
                  savedData.badges[rarity][level] ??= appdata.badges[rarity][level];
               }
            }
         }
         if(appdata.cards) {
            savedData.cards ??= [];
            for(let i=0; i<appdata.cards.length; i++) {
               savedData.cards[i] ??= {};
               for(let prop in appdata.cards[i]) {
                  savedData.cards[i][prop] ??= appdata.cards[i][prop];
               }
            }
         }
      } else {
         savedData = appdata;
      }

      await this.set("app_data", savedData, appid);
   },
   getItemDescripts: async function(appid, contextid, classids) {
      let getList = classids.map(x => `${appid}_${contextid}_${x}`);
      return await this.get("item_descripts", undefined, getList);
   },
   setItemDescripts: async function(item, contextid, appid) {
      let key = `${item.appid || appid}_${item.contextid || contextid}_${item.classid}`;
      let savedData = await this.get("item_descripts", undefined, key);
      if(savedData[key]) {
         savedData = savedData[key];
         Object.assign(savedData, item);
      } else {
         savedData = item;
      }

      await this.set("item_descripts", savedData, key);
   },
   getProfileInventories: async function(profileid, appid, contextids) {
      let getList = Array.isArray(contextids) ? contextids.map(x => `${profileid}_${appid}_${x}`) : `${profileid}_${appid}_${contextids}`;
      return await this.get("inventories", undefined, getList);
   },
   setProfileInventory: async function(inventoryData, profileid, appid, contextid) {
      // No need to update sublevel data, overwrite all old data
      await this.set("inventories", inventoryData, `${profileid}_${appid}_${contextid}`);
   },
   getMatchResults: async function(profileid1, profileid2List) {
      let getList = Array.isArray(profileid2List) ? profileid2List.map(x => `${profileid1}_${x}`) : `${profileid1}_${profileid2List}`;
      return await this.get("item_matcher_results", undefined, getList);
   },
   setMatchResult: async function(result) {
      // No need to update sublevel data, overwrite all old data
      await this.set("item_matcher_results", result, `${result.inventory1.meta.profileid}_${result.inventory2.meta.profileid}`);
   },
};
