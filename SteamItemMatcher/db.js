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
               // NOTE: not keys/indices, we create our own key on add(), then create our own keyrange later
               this.db.createObjectStore("profiles");
               this.db.createObjectStore("badgepages");
               this.db.createObjectStore("app_data");
               this.db.createObjectStore("item_descripts");
               this.db.createObjectStore("inventories");
               this.db.createObjectStore("item_matcher_results");
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
   get: function(ObjStoreName, keys, successCb) {
      const MAX_REQ = 10;
      if(typeof keys === "string") {
         keys = [keys];
      }

      return new Promise((resolve, reject) => {
         if(!this.isSetup()) {
            resolve();
            return;
         }

         let result = {};
         let transactions = Array(Math.ceil(keys.length/MAX_REQ));
         for(let i=0; i<transactions.length; ) {
            transactions[i] = new Promise((res, rej) => {
               let trans = this.db.transaction([ObjStoreName], "readonly");
               trans.oncomplete = event => {
                  res();
               }
               
               for(let j=i*MAX_REQ, lim=(i+1)*MAX_REQ; j<keys.length && j<lim; j++) {
                  let objStoreReq = trans.objectStore(ObjStoreName).get(keys[j]);
                  objStoreReq.onsuccess = event => {
                     let cbResult;
                     if(typeof successCb === 'function') {
                        cbResult = successCb(event);
                     }
                     if(cbResult === undefined) {
                        cbResult = event.target.result;
                     }
                     result[keys[j]] = cbResult;
                  }
                  objStoreReq.onerror = event => {
                     rej();
                  }
               }
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
   getProfiles: async function(profileids) {
      return await this.get("profiles", profileids);
   },
   setProfile: async function(profile) {
      let savedData = await this.get("profiles", profile.id);
      savedData = savedData[profile.id] ? savedData[profile.id] : {};
      savedData.id         = profile.id || savedData.id;
      savedData.url        = profile.url || savedData.url;
      savedData.name       = profile.name || savedData.name;
      savedData.pfp        = profile.pfp || savedData.pfp;
      savedData.state      = profile.state || savedData.state;
      savedData.tradeToken = profile.tradeToken || savedData.tradeToken;
      savedData.friends    = profile.friends || savedData.friends;

      await this.set("profiles", savedData, profile.id);
   },
   getBadgepages: async function(profileids) {
      return await this.get("badgepages", profileids);
   },
   setBadgepages: async function(profile) {
      let savedData = await this.get("badgepages", profile.id);
      if(savedData[profile.id]) {
         savedData = savedData[profile.id];
         for(let [rarity, appList] of profile.badgepages.entries()) {
            for(let [appid, data] of Object.entries(appList)) {
               savedData[rarity][appid] = data;
            }
         }
      } else {
         savedData = profile.badgepages;
      }

      await this.set("badgepages", savedData, profile.id);
   },
   getAppDatas: async function(appids) {
      return await this.get("app_data", appids);
   },
   setAppData: async function(appid) {
      let savedData = await this.get("app_data", appid);
      if(savedData[appid]) {
         savedData = savedData[appid];
         let data = Profile.appMetaData[appid];
         savedData.appid = data.appid || savedData.appid;
         savedData.name  = data.name || savedData.name;
         savedData.cards = data.cards || savedData.cards;
         for(let [rarity, badgeList] of Object.entries(data.badges)) {
            for(let [level, imgLink] of Object.entries(badgeList)) {
               savedData.badges[rarity][level] = imgLink;
            }
         }
      } else {
         savedData = Profile.appMetaData[appid];
      }

      await this.set("app_data", savedData, appid);
   },
   getItemDescripts: async function(appid, contextid, classids) {
      let getList = classids.map(x => `${appid}_${contextid}_${x}`);
      return await this.get("item_descripts", getList);
   },
   setItemDescripts: function(item, contextid, appid) {
      let key = `${item.appid || appid}_${item.contextid || contextid}_${item.classid}`;
      let savedData = await this.get("item_descripts", key);
      if(savedData[key]) {
         savedData = savedData[key];
         Object.assign(savedData, item);
      } else {
         savedData = item;
      }

      await this.set("item_descripts", savedData, key);
   },
   getProfileInventories: async function(profileid, appid, contextids) {
      let getList = contextids.map(x => `${profileid}_${appid}_${x}`);
      return await this.get("inventories", getList);
   },
   setProfileInventory: async function(profile, contextid, appid) {
      // No need to update sublevel data, overwrite all old data
      await this.set("inventories", profile.inventory, `${profile.id}_${appid}_${contextid}`);
   },
   getMatchResults: async function(profileid1, profileid2List) {
      let getList = profileid2List.map(x => `${profileid1}_${x}`);
      return await this.get("item_matcher_results", getList);
   },
   setMatchResult: async function(result) {
      // No need to update sublevel data, overwrite all old data
      await this.set("item_matcher_results", result, `${result.inventory1.meta.profileid}_${result.inventory2.meta.profileid}`);
   },
};
