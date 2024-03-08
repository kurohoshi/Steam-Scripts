// ==UserScript==
// @name         Steam Tools (PLACEHOLDER)
// @namespace    https://steamcommunity.com/id/KuroHoshiZ/
// @version      2024-02-19
// @description  Set of tools to help with Steam Community activities
// @author       KurohoshiZ
// @match        *://steamcommunity.com/*
// @exclude      https://steamcommunity.com/chat/
// @exclude      https://steamcommunity.com/tradeoffer/
// @icon         https://avatars.akamai.steamstatic.com/5d8f69062e0e8f51e500cecc6009547675ebc93c_full.jpg
// @grant        GM.xmlHttpRequest
// @grant        GM_log
// ==/UserScript==

// Script inspired by the following Userscripts:
// https://github.com/Rudokhvist/ASF-STM/
// https://github.com/Tithen-Firion/STM-UserScript

const globalSettings = {};
const GLOBALSETTINGSDEFAULTS = {};
const MAIN_ELEM = document.querySelector('#responsive_page_template_content');
const TOOLS_MENU = [
   { name: 'Main Page', href: 'https://steamcommunity.com/groups/tradingcards/discussions/2/3201493200068346848/', htmlString: undefined, entryFn: undefined},
   { name: 'Matcher', href: undefined, htmlString: undefined, entryFn: gotoMatcherConfigPage},
   { name: 'Booster Crafter', href: 'https://steamcommunity.com/tradingcards/boostercreator/enhanced', htmlString: undefined, entryFn: undefined},
];
const DB_OBJECTSTORE_CONFIGS = [
   { name: 'config',         keypath: undefined, autoincr: undefined },
   { name: 'profiles',       keypath: undefined, autoincr: undefined },
   { name: 'badgepages',     keypath: undefined, autoincr: undefined },
   { name: 'app_data',       keypath: undefined, autoincr: undefined },
   { name: 'item_descripts', keypath: undefined, autoincr: undefined },
   { name: 'inventories',    keypath: undefined, autoincr: undefined },
   { name: 'item_matcher_results', keypath: undefined, autoincr: undefined }
];

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
      return window.g_sessionID;
   },
   getMySteamId: function() {
      return window.g_steamID;
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
   }
};

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
               // NOTE: no keys/indices, we create our own key on add(), then create our own keyrange later?
               // NTOE: objconfig should be validated
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
                     this.db.createObjectStore(objConfig.name, options);
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
   get: function(ObjStoreName, keys, successCb) {
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
                  const objStoreReq = transaction.objectStore(ObjStoreName).get(keys[startIndex+offset]);
                  objStoreReq.onsuccess = (event) => {
                     let cbResult;
                     if(typeof successCb === 'function') {
                        cbResult = successCb(event);
                     }
                     if(cbResult === undefined) {
                        cbResult = event.target.result;
                     }
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
   }
};

SteamToolsDbManager.getToolConfig = async function(toolname) {
   return await this.get('config', toolname);
}

SteamToolsDbManager.setToolConfig = async function(toolname) {
   await this.set('config', globalSettings[toolname], toolname);
}

async function generateExportConfigElement(toolname, filename) {
   let config = await SteamToolsDbManager.getToolConfig(toolname);
   if(!config[toolname]) {
      console.warn('exportConfig(): config not found, no configurations to be exported!');
      return;
   }

   let tmpElem = document.createElement('a');
   tmpElem.setAttribute('id', 'export-'+toolname+'-config');
   tmpElem.setAttribute('href', 'data:application/json;charset=utf-8,'+ encodeURIComponent(JSON.stringify(config[toolname])));
   tmpElem.setAttribute('download', filename+'.json');
   return tmpElem;
}

/*******************************************************/
/**************** Booster Crafter BEGIN ****************/
/*******************************************************/
function generateBoosterCrafterElements() {
   // resize
   for(let minioption of document.getElementsByClassName('minioption')) {
      minioption.style.width = '150px';
      minioption.style.marginBottom = '40px';
   }
   document.querySelector('.booster_creator_right').style.width = '530px';

   // insert new elements
   let HTMLString = '<div class="enhanced-options">'
   +    '<div class="btn_purple btn_medium"><span>Add to Favorites</span></div>'
   +    '<div class="btn_purple btn_medium"><span>Add to List</span></div>'
   + '</div>';
   document.querySelector('.booster_game_selector').insertAdjacentHTML('afterend', HTMLString);

   // add event listeners
}

function setupBoosterCrafter() {
   generateBoosterCrafterElements();
}

if(window.location.pathname.includes('/tradingcards/boostercreator/enhanced')) {
   setupBoosterCrafter();
}

/*******************************************************/
/***************** Booster Crafter END *****************/
/*******************************************************/

/****************************************************/
/**************** Item Matcher BEGIN ****************/
/****************************************************/
class Profile {
   static MasterProfileList = [];
   static appMetaData = {}; // Can be put into its own class
   static itemDescriptions = {}; // Can be put into its own class
   static utils = steamToolsUtils;

   static MAX_ITEM_COUNT = 4000;
   static ITEM_TYPE_MAP = {
      item_class_2:  "card",
      item_class_3:  "background",
      item_class_4:  "emoticon",
      item_class_5:  "booster",
      item_class_7:  "gem",
      item_class_8:  "profile_mod",
      item_class_10: "sale_item",
      item_class_11: "sticker",
      item_class_12: "chat_effect",
      item_class_13: "mini_profile",
      item_class_14: "profile_frame",
      item_class_15: "animated_avatar",
      card:            "item_class_2",
      background:      "item_class_3",
      emoticon:        "item_class_4",
      booster:         "item_class_5",
      gem:             "item_class_7",
      profile_mod:     "item_class_8",
      sale_item:       "item_class_10",
      sticker:         "item_class_11",
      chat_effect:     "item_class_12",
      mini_profile:    "item_class_13",
      profile_frame:   "item_class_14",
      animated_avatar: "item_class_15"
   }
   static ITEM_TYPE_ORDER = {
      gem: 1,
      card: 3,
      background: 4,
      emoticon: 5,
      sticker: 6
   }
   static ITEM_RARITY_MAP = {
      droprate_0: 0,
      droprate_1: 1,
      droprate_2: 2,
      cardborder_0: 0,
      cardboard_1: 1,
      common:   0,
      uncommon: 1,
      rare:     2,
      normal:   0,
      foil:     1
   }

   id;
   url;
   name;
   pfp;
   state;
   tradeToken;

   friends;

   inventory;
   badgepages = [{}, {}];

   constructor(props) {
      if( !props.id && !props.url ) {
         throw "new Profile(): id and url are both not provided! Profile not created.";
      }

      // Check if id is proper

      this.id         = props.id;
      this.url        = props.url;
      this.name       = props.name;
      this.pfp        = props.pfp;
      this.state      = props.state;
      this.tradeToken = props.tradeToken;
   }

   async getTradeFriends() {
      let addToList = async (props, prop) => {
         let foundMaster = Profile.MasterProfileList.find(x => x[prop] === props[prop]);
         if(!foundMaster) {
            let newProf = await Profile.addNewProfile(props);
            if(newProf !== undefined) {
               this.friends.push(newProf);
            }
         } else {
            this.friends.push(foundMaster);
         }
      }

      if(!(await this.isMe())) {
         console.warn("getTradeFriends(): This is not user's profile! Try using getFriends() instead");
         return;
      }

      console.log("Updating friends list...");

      console.log("getTradeFriends(): Fetching friends list");
      let response = await fetch("https://steamcommunity.com/actions/PlayerList/?type=friends");
      await Profile.utils.sleep(Profile.utils.FETCH_DELAY);

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      this.friends = [];
      for(let profile of [...doc.querySelectorAll(".FriendBlock")]) {
         let newProps = {};

         newProps.pfp = profile.querySelector("img").src.replace(/(https:\/\/avatars\.akamai\.steamstatic\.com\/)|(_medium\.jpg)/g, '');
         newProps.state = profile.classList.contains("in-game")
            ? 2 : profile.classList.contains("online")
            ? 1 : profile.classList.contains("offline")
            ? 0 : null;
            newProps.name = profile.querySelector('.friendBlockContent').firstChild.textContent.trim();
         let profileString = profile.querySelector('a').href.replace(/https:\/\/steamcommunity\.com\//g, '');
         if(profileString.startsWith('profiles')) {
            newProps.id = profileString.replace(/^profiles\//g, '');
            await addToList(newProps, "id");
         } else if(profileString.startsWith('id')) {
            newProps.url = profileString.replace(/^id\//g, '');
            await addToList(newProps, "url");
         } else {
            console.warn(`getTradeFriends(): ${profileString} is neither id or custom URL, investigate!`);
         }
      }

      console.log("Friends list updated!");
   }

   async isMe() {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      return this.id === Profile.utils.getMySteamId();
   }

   async isFriend(profile) {
      if(!this.friends) {
         await this.getTradeFriends();
      }
      if(this.friends.some(x => x.id === profile.id || x.url === profile.url)) {
         return true;
      }
      if( !(profile.id || profile.url) ) {
         await Profile.findMoreDataForProfile(profile);
      } else {
         return false;
      }
      if(this.friends.some(x => x.id === profile.id || x.url === profile.url)) {
         return true;
      }

      return false;
   }

   static async loadProfiles(profileids) {
      let dataset = await SteamToolsDbManager.getProfiles(profileids);

      for(let data in dataset) {
         let profile = Profile.MasterProfileList.find(x => x.id === data.id);
         if(profile) {
            if(profile.id === undefined) {
               profile.id = data.id;
            }
            if(profile.url === undefined) {
               profile.url = data.url;
            }
            if(profile.name === undefined) {
               profile.name = data.name;
            }
            if(profile.pfp === undefined) {
               profile.pfp = data.pfp;
            }
            if(profile.state === undefined) {
               profile.state = data.state;
            }
            if(profile.tradeToken === undefined) {
               profile.tradeToken = data.tradeToken;
            }
            if(profile.friends === undefined) {
               profile.friends = data.friends;
            }
         } else {
           profile = new Profile(props);
           Profile.MasterProfileList.push(profile);
         }

         // fetch badgepages and inventories? app metadata? item descriptions?
      }
   }

   async saveProfile() {
      await SteamToolsDbManager.setProfile(this);
   }

   static async findProfile(str) {
      if(typeof str !== 'string') {
         throw "findProfile(): Parameter is not a string!";
      }

      let profile;
      if(/76561\d{12}/.test(str)) {
         if(!(profile = Profile.MasterProfileList.find(x => x.id === str))) {
            console.log(`findProfile(): No profile found for id ${str}. Creating new profile...`);
            profile = await Profile.addNewProfile({id: str});
         }
      }
      if(!profile) {
         if(!(profile = Profile.MasterProfileList.find(x => x.url === str))) {
            console.log(`findProfile(): No profile found for url ${str}. Creating new profile...`);
            profile = await Profile.addNewProfile({url: str});
         }
      }

      if(!profile) {
         console.warn("findProfile(): Unable to find or create a Profile instance!");
      }
      return profile;
   }

   static async addNewProfile(props) {
      try {
         if( !(await Profile.findMoreDataForProfile(props)) ) {
            throw "addNewProfile(): invalid profile";
         }
         Profile.MasterProfileList.push(new Profile(props));

         return Profile.MasterProfileList[Profile.MasterProfileList.length-1];
      } catch(e) {
         console.error(e);
         return undefined;
      }
   }

   static #mergeProfiles(id, url) {
      // merge together profile instances that are duplicate due to obtaining id and url separately without each others other info
   }

   static async findMoreDataForProfile(profile) {
      if(!profile.id && !profile.url) {
         console.error("findMoreDataForProfile(): Needs an id or url!");
         return false;
      }
      let urlID = profile.id || profile.url;
      console.log(`findMoreDataForProfile(): Fetching profile page of ${urlID}`);
      let response = await fetch(`https://steamcommunity.com/${profile.id !== undefined ? 'profiles' : 'id'}/${urlID}/`);
      await Profile.utils.sleep(Profile.utils.FETCH_DELAY);

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      let profilePage = doc.querySelector('#responsive_page_template_content > script:nth-child(1)');
      if(!profilePage) {
         console.error("findMoreDataForProfile(): invalid URL");
         return false;
      }

      let profiledata = profilePage.textContent.match(/(?<=g_rgProfileData = ){.+}(?=;\n)/g);
      if(!profiledata) {
         console.error("findMoreDataForProfile(): profile data object not found!");
         return false;
      }

      profiledata = JSON.parse( profiledata[0].replace(/,"summary":.+(?=}$)/g, '') );

      profile.id = profiledata.steamid;
      profiledata.url = profiledata.url.replace(/https:\/\/steamcommunity\.com\//g, '');
      switch(true) {
         case profiledata.url.startsWith('id'):
            profile.url = profiledata.url.replace(/(^id\/)|(\/$)/g, '');
         case profiledata.url.startsWith('profiles'): // assuming no customURL if url uses profileid
            profile.name = profiledata.personaname;
            break;
         default:
            console.warn(`findMoreDataForProfile(): ${JSON.stringify(profiledata)} is neither id or custom URL, investigate!`);
            break;
      }

      profiledata = doc.querySelector('.profile_header .playerAvatar');
      profile.pfp = profiledata.querySelector('img').src.replace(/(https:\/\/avatars\.akamai\.steamstatic\.com\/)|(_full\.jpg)/g, '');
      profile.state = profiledata.classList.contains("in-game")
         ? 2 : profiledata.classList.contains("online")
         ? 1 : profiledata.classList.contains("offline")
         ? 0 : null;

      return true;
   }

   async canTrade(partner) {
      return (await this.isFriend(partner) || partner.tradeToken !== undefined);
   }

   static async addTradeURL(url) {
      url = url.trim();
      if(!/(?<=^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?)partner=\d+&token=.{8}$/.test(url)) {
         console.error("addTradeURL(): invalid trade URL, trade token not added");
         return;
      }

      let parsedData = url.match(/partner=\d+|token=.+$/g);
      let id = Profile.utils.getSteamProfileId64(parsedData[0].replace(/partner=/g, ''));
      let token = parsedData[1].replace(/token=/g, '');

      let profile = Profile.MasterProfileList.find(x => x.id === id);
      if(!profile) {
         await Profile.addNewProfile({id: id, tradeToken: token});
      } else {
         profile.tradeToken = token;
      }

      console.log(`addTradeURL(): Trade token added to ${id}.`);
   }

   /***********************************************************************/
   /***************************** App Methods *****************************/
   /***********************************************************************/
   static async loadAppMetaData(appids) {
      let dataset = await SteamToolsDbManager.getAppDatas(appids);

      for(let data in dataset) {
         if(Profile.appMetaData[data.appid]) {
            // update existing meta data
         } else {
            Profile.appMetaData[data.appid] = data;
         }
      }
   }

   static async saveAppMetaData(appid) {
      await SteamToolsDbManager.setAppData(Profile.appMetaData[appid]);
   }

   updateAppMetaData(appid, key, val) {
      if(!Profile.appMetaData[appid]) {
         Profile.appMetaData[appid] = {appid: appid};
      }
      Profile.appMetaData[appid][key] = val;
   }

   static async loadItemDescription(classids) {
      let dataset = await SteamToolsDbManager.getItemDescripts(753, 6, classids); // hardcoded for now

      for(let data in dataset) {
         if(Profile.itemDescriptions[data.classid]) {
            // update existing meta data
         } else {
            Profile.itemDescriptions[data.classid] = data;
         }
      }
   }

   static async saveItemDescription(classid) {
      await SteamToolsDbManager.setItemDescript(Profile.itemDescriptions[classid], 6, 753);
   }

   updateItemDescription(classid, dataObject) {
      if(!Profile.itemDescriptions[classid]) {
         Profile.itemDescriptions[classid] = {};
      }
      Object.assign(Profile.itemDescriptions[classid], dataObject);
   }

   /***********************************************************************/
   /************************** Inventory Methods **************************/
   /***********************************************************************/
   /*               method | hasAssetList | includesNontradableItems | items
    *     -----------------|--------------|--------------------------|------
    *         getInventory |     yes      |           yes            | all
    *    getTradeInventory |     yes      |           no             | all
    *    getBadgepageStock |     no       |           yes            | cards
    */
   resetInventory() {
      // itemType(obj) -> rarity(arr) -> app(obj) -> classitem(arr) -> assets(arr)
      // The bare minimum structure for inventory
      this.inventory = {
         data: {
            gem:        [{}],
            card:       [{}, {}],
            background: [{}, {}, {}],
            emoticon:   [{}, {}, {}]
         },
         size: undefined,
         last_updated: undefined,
         tradable_only: undefined
      };
   }

   async loadInventory() {
      let data = await SteamToolsDbManager.getProfileInventories(this.id, 753, 6);

      if(!this.inventory || this.inventory.last_updated<data.last_updated) {
         this.inventory = data;
      }
   }

   async saveInventory() {
      await SteamToolsDbManager.setProfileInventory(this.inventory, this.id, 753, 6);
   }

   async getProfileInventory(method="trade", refProfile) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if((await this.isMe()) || method === "inventory") {
         if(!(await this.isMe())) {
            console.warn(`getProfileStock(): profile is not me, rate limit might be hit!`);
         }

         await this.getInventory();
      } else if(method === "trade") {
         await this.getTradeInventory(refProfile);
      } else {
         console.error("getProfileStock(): invalid method of obtaining inventory!");
      }
   }

   async getInventorySize() {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }
      console.log(`getinventorysize(): Fetching inventory of ${this.id}`);
      let response = await fetch(`https://steamcommunity.com/inventory/${this.id}/753/6?l=${Profile.utils.getSteamLanguage()}&count=1`);
      await Profile.utils.sleep((await this.isMe()) ? Profile.utils.INV_FETCH_DELAY1 : Profile.utils.INV_FETCH_DELAY2);
      let resdata = await response.json();

      this.inventory.size = resdata.total_inventory_count;
   }

   // should be reserved for own inv or low count inv
   async getInventory(last_itemType = undefined, count = Number.MAX_SAFE_INTEGER) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if(!(await this.isMe())) {
         console.warn("getInventory(): Inventory fetch is not user, careful of rate limits!");
      }

      let data = [];
      let counter = 0;
      let resdata = {};
      let last_itemType_index = Profile.ITEM_TYPE_ORDER[last_itemType] || Number.MAX_SAFE_INTEGER;

      this.resetInventory();

      do {
         console.log(`getinventory(): Fetching inventory of ${this.id}, starting at ${counter}`);
         let response = await fetch("https://steamcommunity.com/inventory/" + this.id + "/753/6?"
            + "l=" + Profile.utils.getSteamLanguage()
            + "&count=" + ( (count-counter < Profile.MAX_ITEM_COUNT) ? count-counter : Profile.MAX_ITEM_COUNT )
            + (resdata.last_assetid ? `&start_assetid=${resdata.last_assetid}` : "")
         );
         if(response.status == 429) {
            throw "Steam Inventory Fetch: Too Many Requests!";
         } else if(response.status == 401) {
            throw "Steam Inventory Fetch: Missing Parameters, or Steam is complaining about nothing.";
         }
         await Profile.utils.sleep((await this.isMe()) ? Profile.utils.INV_FETCH_DELAY1 : Profile.utils.INV_FETCH_DELAY2);
         resdata = await response.json();

         counter += resdata.assets.length;

         // group up assets into their respective descriptions
         for(let i=0; i<resdata.assets.length; i++) {
            let asset = resdata.assets[i];
            let desc = resdata.descriptions.find(x => x.classid === asset.classid && x.instanceid === asset.instanceid);

            let itemType = desc.tags.find(x => x.category === "item_class");
            if(!itemType) {
               console.warn(`getInventory(): No item_type tag found for description:`);
               console.log(desc);
               continue;
            }

            let rarity = itemType.internal_name === "item_class_2"
               ? desc.tags.find(x => x.category === "cardborder")
               : desc.tags.find(x => x.category === "droprate");
            if(!rarity) {
               console.warn(`getInventory(): No rarity-related tag found for description:`);
               console.log(desc);
               continue;
            }

            itemType = Profile.ITEM_TYPE_MAP[itemType.internal_name];
            rarity = Profile.ITEM_RARITY_MAP[rarity.internal_name] || parseInt(rarity.internal_name.replace(/\D+/g, ''));
            if(!this.inventory.data[itemType]) {
               this.inventory.data[itemType] = [{}];
            } else if(this.inventory.data[itemType].length <= rarity) {
               this.inventory.data[itemType].push( ...Array(rarity-this.inventory.data[itemType].length+1).fill({}) );
            }

            let itemList = this.inventory.data[itemType][rarity];
            if(typeof itemList !== 'object' || Array.isArray(itemList) || itemList === null) {
               console.error(`getInventory(): No object found for item subgroup: ${itemType.internal_name} ${rarity.internal_name}`);
               continue;
            }

            let appname = desc.tags.find(x => x.category === "Game");
            if(!appname) {
               console.warn(`getInventory(): No game name tag found for description:`);
               console.log(desc);
               appname = {internal_name: ""};
            }
            this.updateAppMetaData(desc.market_fee_app, "name", appname.internal_name);

            asset.amount = parseInt(asset.amount);
            if(itemList[desc.market_fee_app]) { // app subgroup exists
               let classItemGroup = itemList[desc.market_fee_app].find(x => x.classid === asset.classid);
               if(classItemGroup) { // class item subgroup exists
                  if(desc.tradable) {
                     classItemGroup.tradables.push({ assetid: asset.assetid, count: asset.amount });
                  }
                  classItemGroup.count += asset.amount;
               } else { // class item subgroup does not exist
                  itemList[desc.market_fee_app].push({
                     classid: asset.classid,
                     tradables: desc.tradable ? [{ assetid: asset.assetid, count: asset.amount }]: [],
                     count: asset.amount
                  });
               }
            } else { // app subgroup does not exist
               itemList[desc.market_fee_app] = [{
                  classid: asset.classid,
                  tradables: desc.tradable ? [{ assetid: asset.assetid, count: asset.amount }]: [],
                  count: asset.amount
               }]
            }

            this.updateItemDescription(desc.classid, desc);
         }

         // Assume inventory is always received in the same order every single time
         let last_descript_tags = resdata.descriptions[resdata.descriptions.length-1].tags;
         let last_type = last_descript_tags.find(x => x.category === "item_class");
         if((Profile.ITEM_TYPE_ORDER[Profile.ITEM_TYPE_MAP[last_type.internal_name]] || -1) > last_itemType_index) {
            break;
         }
      } while(counter < count && resdata.more_items);

      this.inventory.size = resdata.total_inventory_count;
      this.inventory.last_updated = Date.now();
      this.inventory.tradable_only = false;
   }

   async getTradeInventory(myProf, last_itemType = undefined, count = Number.MAX_SAFE_INTEGER) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if(await this.isMe()) {
         console.warn("getTradeInventory(): Inventory fetch is user, getInventory() is recommended instead");
      } else if(typeof myProf === "string") {
         if(!(myProf = await Profile.findProfile(myProf))) {
            console.error("getTradeInventory(): Invalid profile string! Aborting...");
            return;
         }
      } else if(!(myProf instanceof Profile)) {
         console.error("getTradeInventory(): Inventory fetch is not user, but own profile was not provided! Aborting...");
         return;
      }

      let data = [];
      let counter = 0;
      let resdata = { more_start: 0 };
      let last_descript;
      let last_itemType_index = Profile.ITEM_TYPE_ORDER[last_itemType] || Number.MAX_SAFE_INTEGER;

      let currentPathSearch = window.location.pathname + window.location.search;
      let partnerString = `?partner=${Profile.utils.getSteamProfileId3(this.id)}`;
      let tokenString = (await this.isMe()) ? undefined : this.tradeToken;
      tokenString = !tokenString || (await myProf.isFriend(this.id)) ? '' : `&token=${tokenString}`;

      this.resetInventory();

      // NOTE: Only shows tradable items, make sure user knows
      do {
         console.log(`getTradeInventory(): Fetching inventory of ${this.id}, starting at ${resdata.more_start}`);
         let response;
         if(await this.isMe()) {
            response = await fetch("https://steamcommunity.com/profiles/" + this.id + "/inventory/json/753/6/?"
               + "l=" + Profile.utils.getSteamLanguage()
               + "&trading=1"
               + (resdata.more ? `&start=${resdata.more_start}` : "")
            );
         } else {
            window.history.replaceState(null, '', '/tradeoffer/new/' + partnerString + tokenString);
            response = await fetch("https://steamcommunity.com/tradeoffer/new/partnerinventory/?"
               + "sessionid=" + Profile.utils.getSessionId()
               + "&partner=" + this.id
               + "&appid=753&contextid=6"
               + "&l=" + Profile.utils.getSteamLanguage()
               + (resdata.more ? `&start=${resdata.more_start}` : '')
            );
            window.history.replaceState(null, '', currentPathSearch);
         }
         if(response.status == 429) {
            throw "Steam Inventory Fetch: Too Many Requests!";
         } else if(response.status == 401) {
            throw "Steam Inventory Fetch: Missing Parameters, or Steam is complaining about nothing.";
         }

         await Profile.utils.sleep(Profile.utils.INV_FETCH_DELAY1);
         resdata = await response.json();

         for(let asset of Object.values(resdata.rgInventory)) {
            let desc = resdata.rgDescriptions[last_descript = `${asset.classid}_${asset.instanceid}`];

            let itemType = desc.tags.find(x => x.category === "item_class");
            if(!itemType) {
               console.warn(`getInventory(): No item_type tag found for description:`);
               console.log(desc);
               continue;
            }

            let rarity = itemType.internal_name === "item_class_2"
               ? desc.tags.find(x => x.category === "cardborder")
               : desc.tags.find(x => x.category === "droprate");
            if(!rarity) {
               console.warn(`getInventory(): No rarity-related tag found for description:`);
               console.log(desc);
               continue;
            }

            itemType = Profile.ITEM_TYPE_MAP[itemType.internal_name];
            rarity = Profile.ITEM_RARITY_MAP[rarity.internal_name] || parseInt(rarity.internal_name.replace(/\D+/g, ''));
            if(!this.inventory.data[itemType]) {
               this.inventory.data[itemType] = [{}];
            } else if(this.inventory.data[itemType].length <= rarity) {
               this.inventory.data[itemType].push( ...Array(rarity-this.inventory.data[itemType].length+1).fill({}) );
            }

            let itemList = this.inventory.data[itemType][rarity];
            if(typeof itemList !== 'object' || Array.isArray(itemList) || itemList === null) {
               console.error(`getInventory(): No object found for item subgroup: ${itemType.internal_name} ${rarity.internal_name}`);
               continue;
            }

            let appname = desc.tags.find(x => x.category === "Game");
            if(!appname) {
               console.warn(`getInventory(): No game name tag found for description:`);
               console.log(desc);
               appname = {internal_name: ""};
            }
            this.updateAppMetaData(desc.market_fee_app, "name", appname.internal_name);

            asset.amount = parseInt(asset.amount);
            if(itemList[desc.market_fee_app]) { // app subgroup exists
               let classItemGroup = itemList[desc.market_fee_app].find(x => x.classid === asset.classid);
               if(classItemGroup) { // class item subgroup exists
                  if(desc.tradable) {
                     classItemGroup.tradables.push({ assetid: asset.id, count: asset.amount });
                  }
                  classItemGroup.count += asset.amount;
               } else { // class item subgroup does not exist
                  itemList[desc.market_fee_app].push({
                     classid: asset.classid,
                     tradables: desc.tradable ? [{ assetid: asset.id, count: asset.amount }]: [],
                     count: asset.amount
                  });
               }
            } else { // app subgroup does not exist
               itemList[desc.market_fee_app] = [{
                  classid: asset.classid,
                  tradables: desc.tradable ? [{ assetid: asset.id, count: asset.amount }]: [],
                  count: asset.amount
               }];
            }

            this.updateItemDescription(desc.classid, desc);
         }

         // Assume inventory is always received in the same order every single time
         let last_descript_tags = resdata.rgDescriptions[last_descript].tags;
         let last_type = last_descript_tags.find(x => x.category === "item_class");
         if((Profile.ITEM_TYPE_ORDER[Profile.ITEM_TYPE_MAP[last_type.internal_name]] || -1) > last_itemType_index) {
            break;
         }
      } while(counter < count && resdata.more);

      this.inventory.size = null;
      this.inventory.last_updated = Date.now();
      this.inventory.tradable_only = true;
   }

   async loadBadgepages() {
      let dataset = await SteamToolsDbManager.getBadgepages(this.id);

      for(let [rarity, applist] in Object.entries(dataset)) {
         for(let [appid, data] in Object.entries(applist)) {
            if(data.last_updated>this.badgepages[rarity][appid].last_updated) {
               this.badgepages[rarity][appid] = data;
            }
         }
      }
   }

   async saveBadgepages() {
      await SteamToolsDbManager.setBadgepages(this.id, this.badgepages);
   }

   async getBadgepageStock(appid, foil=false) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      console.log(`getBadgepageStock(): getting badgepage of app ${appid} from profile ${this.id}`);
      let response = await fetch(`https://steamcommunity.com/profiles/${this.id}/gamecards/${appid}/${foil ? "?border=1" : ""}`);
      await Profile.utils.sleep(Profile.utils.FETCH_DELAY);

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      // check if private profile

      let rarity = foil ? 1 : 0;
      let newData = {};
      let name = doc.querySelector("a.whiteLink:nth-child(5)").textContent.trim();
      this.updateAppMetaData(appid, "name", name);
      let cardData = Profile.appMetaData[appid].cards ? Profile.appMetaData[appid].cards : [];

      newData.data = [...doc.querySelectorAll(".badge_card_set_card")].map((x, i) => {
         let count = x.children[1].childNodes.length === 5 ? parseInt(x.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
         if(isNaN(count)) {
            console.warn(`getBadgepageStock(): Error getting card count for appid ${appid} at index ${i}`);
         }
         if(!cardData[i]) {
            cardData.push({
               name: x.children[1].childNodes[x.children[1].childNodes.length-3].textContent.trim()
            });
         }
         if(!cardData[i][`img${rarity}`]) {
            cardData[i][`img${rarity}`] = x.children[0].querySelector(".gamecard").src.replace(/https\:\/\/community\.akamai\.steamstatic\.com\/economy\/image\//g, '');
         }
         return { count: parseInt(count) };
      });
      newData.last_updated = Date.now();

      this.updateAppMetaData(appid, "cards", cardData);
      this.badgepages[rarity][appid] = newData;
   }

   async getBadgepageStockAll(list, foil=false) {
      for(let appid of list) {
         await this.getBadgepageStock(appid, foil);
      }
   }

   // Only gets apps where user does not have max badge level
   async getApplistFromBadgepage(stacker=true) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }
      if(!(await this.isMe())) {
         console.error("getApplistFromBadgepage(): Profile is not user's! This method is reserved for the user only.");
         return;
      }

      let list = { normal: [], foil: [] };
      let page = 1;
      let more = true;

      // TODO: include a hard limit to stop unwanted requests
      while(more) {
         console.log(`getApplistFromBadgepage(): getting badgepage ${page} from profile ${this.id}`);
         let response = await fetch(`https://steamcommunity.com/profiles/${this.id}/badges/?p=${page++}`);
         await Profile.utils.sleep(Profile.utils.FETCH_DELAY);

         let parser = new DOMParser();
         let doc = parser.parseFromString(await response.text(), "text/html");

         let badges = doc.querySelectorAll(".badge_row");
         for(let i=0; i<badges.length; i++) {
            if(!badges[i].querySelector(".owned")) {
               // end of craftable badges, assuming its always ordered this way
               return list;
            }

            let badgeProgress = badges[i].querySelector(".badge_progress_info");
            if(!badgeProgress) {
               continue;
            }

            badgeProgress = badgeProgress.textContent.trim();
            if( !((stacker && badgeProgress === "Ready") || (/^[^0]/.test(badgeProgress))) ) {
               continue;
            }

            let badgeLink = badges[i].querySelector(".badge_row_overlay").href.replace(/https?:\/\/steamcommunity\.com\/((id)|(profiles))\/[^\/]+\/gamecards\//g, '');
            let badgeAppid = badgeLink.match(/^\d+/g)[0];
            if(badgeLink.endsWith("border=1")) {
               list.foil.push(badgeAppid);
            } else {
               list.normal.push(badgeAppid);
            }
         }

         // alternatively, we can check the "Showing n1-n2 of n badges" to see if n2 === n
         let pageNav = doc.querySelectorAll(".pagebtn");
         if(pageNav[pageNav.length-1].classList.contains("disabled")) {
            more = false;
         }
      }

      return list;
   }

   verifyDescripts(descript1, descript2) {
      for(let prop in descript2) {
         if(!Object.hasOwn(descript1, prop)) {
            console.warn(`verifyDescripts(): Property ${prop} does not exist in both descriptions!`);
            console.log(descript1);
            console.log(descript2);
         }
      }
      for(let prop in descript1) {
         if(!Object.hasOwn(descript2, prop)) {
            console.warn(`verifyDescripts(): Property ${prop} does not exist in both descriptions!`);
            console.log(descript1);
            console.log(descript2);
            continue;
         }
         if(prop === "descriptions" || prop === "owner_actions") {
            if(JSON.stringify(descript1[prop]) !== JSON.stringify(descript2[prop])) {
               console.warn(`verifyDescripts(): Property ${prop} does not have same values!`);
               console.log(descript1);
               console.log(descript2);
            }
         } else if(prop === "tags") {
            for(let tag of descript1[prop]) {
               let found = descript2[prop].find(x => x.category === tag.category);
               if(!found || found.internal_name !== tag.internal_name) {
                  console.warn(`verifyDescripts(): Property ${prop} does not have same values!`);
                  console.log(descript1);
                  console.log(descript2);
               }
            }
         } else {
            if((typeof descript1[prop] === "object" && descript1[prop] !== null)
               || (typeof descript2[prop] === "object" && descript2[prop] !== null)) {
               console.warn(`verifyDescripts(): Property ${prop} is an unchecked object!`);
               console.log(descript1);
               console.log(descript2);
            } else {
               if(descript1[prop] !== descript1[prop]) {
                  console.warn(`verifyDescripts(): Property ${prop} does not have same values!`);
                  console.log(descript1);
                  console.log(descript2);
               }
            }
         }
      }
   }
}

SteamToolsDbManager.getProfiles = async function(profileids) {
   return await this.get("profiles", profileids);
}
SteamToolsDbManager.setProfile = async function(profile) {
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
}
SteamToolsDbManager.getBadgepages = async function(profileids) {
   return await this.get("badgepages", profileids);
}
SteamToolsDbManager.setBadgepages = async function(profileid, badgepages) {
   let savedData = await this.get("badgepages", profileid);
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
}
SteamToolsDbManager.getAppDatas = async function(appids) {
   return await this.get("app_data", appids);
}
SteamToolsDbManager.setAppData = async function(appdata) {
   let savedData = await this.get("app_data", appdata.appid);
   if(savedData[appdata.appid]) {
      savedData = savedData[appdata.appid];
      savedData.appid = appdata.appid || savedData.appid;
      savedData.name  = appdata.name || savedData.name;
      savedData.cards = appdata.cards || savedData.cards;
      for(let [rarity, badgeList] of Object.entries(appdata.badges)) {
         for(let [level, imgLink] of Object.entries(badgeList)) {
            savedData.badges[rarity][level] = imgLink;
         }
      }
   } else {
      savedData = appdata;
   }

   await this.set("app_data", savedData, savedData.appid);
}
SteamToolsDbManager.getItemDescripts = async function(appid, contextid, classids) {
   let getList = classids.map(x => `${appid}_${contextid}_${x}`);
   return await this.get("item_descripts", getList);
}
SteamToolsDbManager.setItemDescripts = async function(item, contextid, appid) {
   let key = `${item.appid || appid}_${item.contextid || contextid}_${item.classid}`;
   let savedData = await this.get("item_descripts", key);
   if(savedData[key]) {
      savedData = savedData[key];
      Object.assign(savedData, item);
   } else {
      savedData = item;
   }

   await this.set("item_descripts", savedData, key);
}
SteamToolsDbManager.getProfileInventories = async function(profileid, appid, contextids) {
   let getList = contextids.map(x => `${profileid}_${appid}_${x}`);
   return await this.get("inventories", getList);
}
SteamToolsDbManager.setProfileInventory = async function(inventoryData, profileid, appid, contextid) {
   // No need to update sublevel data, overwrite all old data
   await this.set("inventories", inventoryData, `${profileid}_${appid}_${contextid}`);
}
SteamToolsDbManager.getMatchResults = async function(profileid1, profileid2List) {
   let getList = profileid2List.map(x => `${profileid1}_${x}`);
   return await this.get("item_matcher_results", getList);
}
SteamToolsDbManager.setMatchResult = async function(result) {
   // No need to update sublevel data, overwrite all old data
   await this.set("item_matcher_results", result, `${result.inventory1.meta.profileid}_${result.inventory2.meta.profileid}`);
}

GLOBALSETTINGSDEFAULTS.matcher = {
   config: {
      matchGroup: {
         label: 'Match With',
         id: 'matchgroup',
         options: [
            { name: 'friends', id: 'match-friends', label: 'Friends', value: true },
            { name: 'asfAny', id: 'match-asf-bots-any', label: 'ASF Any Bots', value: true },
            { name: 'asfFair', id: 'match-asf-bots-fair', label: 'ASF Fair Bots', value: false },
            { name: 'custom', id: 'match-user-list', label: 'My List', value: true }
         ]
      },
      ignoreGroup: {
         label: 'Ignore Profiles On',
         id: 'ignoregroup',
         options: [{ name: 'blacklist', id: 'match-ignore-blacklist', label: 'Blacklist', value: true }]
      },
      matchItemType: {
         label: 'Match Item Types',
         id: 'itemgroup',
         options: [
            // { name: 'gem', id: 'match-gems', label: 'Gems', value: false },
            // { name: 'booster', id: 'match-booster', label: 'Booster Packs', value: false },
            { name: 'card', id: 'match-card', label: 'Trading Cards', value: true },
            { name: 'background', id: 'match-background', label: 'Backgrounds', value: true },
            { name: 'emoticon', id: 'match-emoticon', label: 'Emoticons', value: true },
            // { name: 'saleItem', id: 'match-sale-item', label: 'Sale Items', value: false }
         ]
      },
      matchApp: {
         label: 'Match Apps On',
         id: 'appgroup',
         options: [
            { name: 'badgepage', id: 'match-badgepage', label: 'My Badge Page', value: false },
            { name: 'custom', id: 'match-user-app-list', label: 'My App List', value: false }
         ]
      }
   },
   lists: {
      matchlist: 'Matchlist',
      blacklist: 'Blacklist',
      applist: 'Apps'
      /* tabGroup: { label: string, data: [] }*/
   },
   currentTab: 'matchlist'
};
const MatcherConfigShortcuts = {};

async function gotoMatcherConfigPage() {
   const generateConfigHeaderString = (id, title) => `<div class="matcher-config-header" data-id="${id}"><span>${title}</span></div>`;
   const generateConfigButtonString = (id, label) => `<div class="matcher-config-option"><input type="checkbox" class="button" data-id="${id}"><label for="${id}">${label}</label></div>`;
   const generateConfigButtonsString = (checkList) => checkList.map(x => generateConfigButtonString(x.id, x.label)).join('');
   const generateConfigButtonGroupString = (groups) => Object.values(globalSettings.matcher.config).map(x => {
      return `<div class="matcher-config-group">${generateConfigHeaderString(x.id, x.label)}${generateConfigButtonsString(x.options)}</div>`
   }).join('');
   const generateConfigListTabs = (list) => {
      let HTMLString = '';
      for(let listGroup in list) {
         HTMLString += `<div class="matcher-conf-list-tab" data-list-name="${listGroup}">${list[listGroup]}</div>`;
         list[listGroup] = { label: list[listGroup], data: [] };
      }
      return HTMLString;
   };
   const generateConfigListGroups = (list) => {
      let HTMLString = '';
      for(let listGroup in list) {
         HTMLString += `<div class="matcher-conf-list-entry-group" data-list-name="${listGroup}"></div>`;
      }
      return HTMLString;
   }

   console.log('Setting up Matcher Configuration!');

   if(!MAIN_ELEM) {
      alert('Main element no found, Matcher Configuration will not be set up');
      console.warn('gotoMatcherConfigPage(): Main element no found, Matcher Configuration will not be set up!');
      return;
   }
   MAIN_ELEM.innerHTML = '';

   let config = await SteamToolsDbManager.getToolConfig('matcher');
   if(config.matcher) {
      globalSettings.matcher = config.matcher;
   } else {
      globalSettings.matcher = steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.matcher);
   }

   let matcherConfigHTMLString = '<div class="matcher-config">'
   +    '<div class="matcher-config-title"><span>Matcher Configuration</span></div>'
   +    '<div class="matcher-options">'
   +       generateConfigButtonGroupString()
   +    '</div>'
   +       '<div class="matcher-config-group">'
   +          '<div class="matcher-config-header"><span>Import/Export Settings</span></div>'
   +          '<div class="matcher-config-option">'
   +             '<button id="matcher-config-import" class="blue">Import Settings</button>'
   +             '<button id="matcher-config-export" class="blue">Export Settings</button>'
   +          '</div>'
   +       '</div>'
   +       '<div class="matcher-setting center">'
   +          '<button id="matcher-reset-settings" class="blue">Reset</button>'
   +          '<button id="matcher-save-settings" class="green">Save</button>'
   +       '</div>'
   +    '</div>'
   +    '<div class="matcher-conf-list">'
   +       '<div class="matcher-conf-list-header">'
   +          generateConfigListTabs(globalSettings.matcher.lists)
   +       '</div>'
   +       '<div class="conf-list-entry-action add">'
   +          '<div class="conf-list-entry-action-add">'
   +             '<div class="entry-action-add"></div>'
   +          '</div>'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div class="entry-action-del"></div>'
   +             '<div class="entry-action-edit"></div>'
   +          '</div>'
   +       '</div>'
   +       '<div class="matcher-conf-list-list">'
   +          '<div class="conf-list-entry-form-container">'
   +             '<div class="conf-list-entry-form">'
   +                '<input type="text" id="entry-form-id" placeholder="temp">'
   +                '<textarea name="" id="entry-form-descript" placeholder="Note (Optional)"></textarea>'
   +                '<div class="entry-form-action">'
   +                   '<button id="conf-list-entry-form-cancel" class="red">Cancel</button>'
   +                   '<button id="conf-list-entry-form-add" class="green">Add</button>'
   +                '</div>'
   +             '</div>'
   +          '</div>'
   +          '<div class="conf-list-overlay">'
   +             '<div class="content-loader"></div>'
   +             '<div class="conf-list-dialog">'
   +                '<div>Entry already exists, overwrite?</div>'
   +                '<div id="conf-list-entry-old" class="matcher-conf-list-entry"></div>'
   +                '<div class="conf-list-dialog-divider">'
   +                   '<div class="dbl-arrows down"></div>'
   +                '</div>'
   +                '<div id="conf-list-entry-new" class="matcher-conf-list-entry"></div>'
   +                '<div class="conf-list-dialog-action">'
   +                   '<button class="red wide">No</button>'
   +                   '<button class="green wide">Yes</button>'
   +                '</div>'
   +             '</div>'
   +          '</div>'
   +          '<div class="matcher-conf-list-entries custom-scroll">'
   +             generateConfigListGroups(globalSettings.matcher.lists)
   +          '</div>'
   +       '</div>'
   +    '</div>'
   + '</div>';

   MAIN_ELEM.insertAdjacentHTML("afterbegin", matcherConfigHTMLString);

   for(let buttonGroup of MAIN_ELEM.querySelectorAll('.matcher-config-group')) {
      buttonGroup.addEventListener('change', matcherConfigUpdateChecklistListener);
   }
   MAIN_ELEM.querySelector('#matcher-config-import').addEventListener('click', matcherConfigImportListener);
   MAIN_ELEM.querySelector('#matcher-config-export').addEventListener('click', matcherConfigExportListener);
   MAIN_ELEM.querySelector('.matcher-reset-settings').addEventListener('click', matcherConfigLoadListener);
   MAIN_ELEM.querySelector('.matcher-save-settings').addEventListener('click', matcherConfigSaveListener);
   MAIN_ELEM.querySelector('.matcher-conf-list-header').addEventListener('click', matcherConfigSelectListTabListener);
   MAIN_ELEM.querySelector('.entry-action-add').addEventListener('click', matcherConfigAddListEntryListener);
   MAIN_ELEM.querySelector('.entry-action-edit').addEventListener('click', matcherConfigEditListEntryListener);
   MAIN_ELEM.querySelector('.entry-action-del').addEventListener('click', matcherConfigDeleteListEntryListener);
   MAIN_ELEM.querySelector('.matcher-conf-list-entries').addEventListener('click', matcherConfigSelectListEntryListener);
   MAIN_ELEM.querySelector('#conf-list-entry-form-cancel').addEventListener('click', matcherConfigEntryFormCancelListener);
   MAIN_ELEM.querySelector('#conf-list-entry-form-add').addEventListener('click', matcherConfigEntryFormAddListener);

   // apply event listeners to go onto other actions like default matching, single account matching, resetting configs to default settings, etc

   MatcherConfigShortcuts.listActionBarElem = MAIN_ELEM.querySelector('.conf-list-entry-action');
   MatcherConfigShortcuts.listFormContainerElem = MAIN_ELEM.querySelector('.conf-list-entry-form-container');
   MatcherConfigShortcuts.listOverlayElem = MAIN_ELEM.querySelector('.conf-list-overlay');
   MatcherConfigShortcuts.listDialogElem = MAIN_ELEM.querySelector('.conf-list-dialog');
   MatcherConfigShortcuts.listElems = {};
   for(let entryGroup in globalSettings.matcher.lists) {
      MatcherConfigShortcuts.listElems[entryGroup] = MAIN_ELEM.querySelector(`.matcher-conf-list-entry-group[data-list-name=${entryGroup}]`);
   }

   matcherConfigLoadUI();
}

function matcherConfigLoadUI() {
   const configMenuElem = MAIN_ELEM.querySelector('.matcher-config');
   if(!configMenuElem) {
      console.warn('updateMatcherConfigUI(): Config menu not found, UI will not be updated');
      return;
   }

   for(let optionGroup of Object.values(globalSettings.matcher.config)) {
      for(let option of optionGroup.options) {
         configMenuElem.querySelector('#'+option.id).checked = option.value;
      }
   }

   // generate lists

   matcherConfigShowActiveList();
}

function matcherConfigSetEntryActionBar(actionBarName) {
   let listActionElem = MAIN_ELEM.querySelector('.conf-list-entry-action');
   if(actionBarName === 'add') {
      listActionElem.classList.remove('modify');
      listActionElem.classList.add('add');
   } else if(actionBarName === 'modify') {
      listActionElem.classList.remove('add');
      listActionElem.classList.add('modify');
   } else {
      console.warn('matcherConfigSetEntryActionBar(): Action bar name not implemented, nothing will change!');
   }
}

// needs testing
function matcherConfigSelectListTabListener(event) {
   console.log(event.target); // debugging
   if(!event.target.matches('.matcher-conf-list-tab') || event.target.matches('.active')) {
      return;
   }

   event.currentTarget.querySelector(`.matcher-conf-list-tab.active`).classList.remove('active');
   event.target.classList.add('active');
   globalSettings.matcher.currentTab = event.target.dataset.listName;

   if(MatcherConfigShortcuts.selectedListEntryElem) {
      MatcherConfigShortcuts.selectedListEntryElem.classList.remove('selected');
      MatcherConfigShortcuts.selectedListEntryElem = undefined;

      MatcherConfigShortcuts.listFormContainerElem.classList.add('hidden');
      matcherConfigResetEntryForm();
      matcherConfigSetEntryActionBar('add');
   }

   matcherConfigShowActiveList();
}

function matcherConfigResetEntryForm() {
   let currentTab = globalSettings.matcher.currentTab;

   let entryFormElem = MAIN_ELEM.querySelector('.conf-list-entry-form');
   let currentFormType = entryFormElem.dataset.type;

   if(currentFormType !== currentTab) {
      // set innerHTML to wipe everything and change form
      entryFormElem.innerHTML = '';
      if(currentTab === 'matchlist' || currentTab === 'blacklist') {
         entryFormElem.innerHTML = '<input type="text" id="entry-form-id" placeholder="profileid/customUrlid">'
            + '<textarea name="" id="entry-form-descript" placeholder="Note (Optional)"></textarea>';
      } else if(currentTab === 'applist') {
         entryFormElem.innerHTML = '<input type="text" id="entry-form-id" placeholder="appid">'
            + '<textarea name="" id="entry-form-descript" placeholder="Note (Optional)"></textarea>';
      } else {
         console.warn('matcherConfigResetEntryForm(): Tab reset not implemented, form will not be generated!');
         return;
      }

      let entryFormActionHTMLString = '<div class="entry-form-action">'
      +    '<button id="conf-list-entry-form-cancel" class="red">Cancel</button>'
      +    '<button id="conf-list-entry-form-add" class="green">Add</button>'
      + '</div>';
      entryFormElem.insertAdjacentHTML(entryFormActionHTMLString);

      entryFormElem.dataset.type = currentTab;
   } else {
      // reset input values
      if(currentTab === 'matchlist' || currentTab === 'blacklist') {
         entryFormElem.querySelector('#entry-form-id').value = '';
         entryFormElem.querySelector('#entry-form-descript').value = '';
      } else if(currentTab === 'applist') {
         entryFormElem.querySelector('#entry-form-id').value = '';
         entryFormElem.querySelector('#entry-form-descript').value = '';
      } else {
         console.warn('matcherConfigResetEntryForm(): Tab reset not implemented, form will not be generated!');
         return;
      }
   }
}

function matcherConfigShowActiveList() {
   let currentTab = globalSettings.matcher.currentTab;
   for(let listGroup of MAIN_ELEM.querySelectorAll(`.matcher-conf-list-entry-group`)) {
      if(!currentTab || currentTab.dataset.listName !== listGroup.dataset.listName) {
         listGroup.classList.remove('active');
      } else {
         listGroup.classList.add('active');
      }
   }
}

function matcherConfigSelectListEntryListener(event) {
   console.log(event.target);
   let entryElem = event.target;
   while(!entryElem.matches('.matcher-conf-list-entries')) {
      if(entryElem.matches('.matcher-conf-list-entry')) {
         break;
      } else {
         entryElem = entryElem.parentElement;
      }
   }
   if(!event.target.matches('.matcher-conf-list-entry')) {
      return;
   }

   if(entryElem.classList.contains('selected')) {
      entryElem.classList.remove('selected');
      MatcherConfigShortcuts.selectedListEntryElem = undefined;

      matcherConfigResetEntryForm();
      matcherConfigSetEntryActionBar('add');
   } else {
      if(MatcherConfigShortcuts.selectedListEntryElem) {
         MatcherConfigShortcuts.selectedListEntryElem.classList.remove('selected');
      }

      MatcherConfigShortcuts.selectedListEntryElem = entryElem;
      entryElem.classList.add('selected');
      matcherConfigSetEntryActionBar('modify');
   }
}

// needs testing
function matcherConfigUpdateChecklistListener(event) {
   console.log(event.currentTarget); // debugging
   if(!event.currentTarget.matches('.matcher-config-option')) {
      return;
   }
   let groupId = event.currentTarget.dataset.id;
   let optionId = event.target.dataset.id;

   for(let group in Object.values(globalSettings.matcher.config)) {
      if(group.id === groupId) {
         group.options.find(x => x.id === optionId).value = event.target.checked;
      }
   }
}

// add new config list entry, populated input values persist when form is minimized
function matcherConfigAddListEntryListener(event) {
   MatcherConfigShortcuts.listFormContainerElem.classList.toggle('hidden');
}

// modify selected HTML that is selected
function matcherConfigEditListEntryListener(event) {
   /* edit selected entry, prefilled with selected entry info */
   let currentTab = globalSettings.matcher.currentTab;
   if(!MatcherConfigShortcuts.listFormContainerElem.matches('.hidden')) {
      MatcherConfigShortcuts.listFormContainerElem.classList.add('hidden');
      return;
   }

   if(!MatcherConfigShortcuts.selectedListEntryElem) {
      console.log('matcherConfigEditListEntryListener(): No entry selected, nothing can be edited...');
      return;
   }

   if(currentTab === 'matchlist' || currentTab === 'blacklist') {
      MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.profileid;
      MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
   } else if(currentTab === 'applist') {
      MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
      MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
   } else {
      console.warn('matcherConfigEditListEntryListener(): Entry edit prefill not implemented, form will not be prefilled!');
      return;
   }

   MatcherConfigShortcuts.listFormContainerElem.classList.remove('hidden');
}

// delete selected HTML elements
function matcherConfigDeleteListEntryListener(event) {
   if(!MatcherConfigShortcuts.selectedListEntryElem) {
      console.log('matcherConfigDeleteListEntryListener(): No entry selected, nothing is removed...');
      return;
   }
   let listGroup = MatcherConfigShortcuts.selectedListEntryElem.parentElement.dataset.listName;
   if(!globalSettings.matcher.lists[listGroup]) {
      console.warn('matcherConfigDeleteListEntryListener(): List not found, something is wrong!');
      return;
   }

   if(listGroup === 'matchlist' || listGroup === 'blacklist') {
      let profileid = MatcherConfigShortcuts.selectedListEntryElem.dataset.profileid;
      let selectedIndex = globalSettings.matcher.lists[listGroup].findIndex(x => x.profileid === profileid);
      if(selectedIndex === -1) {
         console.warn('matcherConfigDeleteListEntryListener(): Profileid not found, which means list and data are not synced!');
         return;
      }
      globalSettings.matcher.lists[listGroup].splice(selectedIndex, 1);
      MatcherConfigShortcuts.selectedListEntryElem.remove();
   } else if(listGroup === 'applist') {
      let appid = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
      let selectedIndex = globalSettings.matcher.lists[listGroup].findIndex(x => x.appid === appid);
      if(selectedIndex === -1) {
         console.warn('matcherConfigDeleteListEntryListener(): Appid not found, which means list and data are not synced!');
         return;
      }
      globalSettings.matcher.lists[listGroup].splice(selectedIndex, 1);
      MatcherConfigShortcuts.selectedListEntryElem.remove();
   } else {
      console.warn('matcherConfigDeleteListEntryListener(): List deletion not implemented, nothing will be changed!');
   }
}

async function matcherConfigEntryFormAddListener(event) {
   // NOTE: Ideally have a new absolute positioned layer to lock out editing/selection in form of loading until a conclusion is reached
   /* validate data, then add to current list */
   // disable action bar when this is still processing

   let currentTab = globalSettings.matcher.currentTab;

   if(currentTab === 'matchlist' || currentTab === 'blacklist') {
      MatcherConfigShortcuts.listActionBarElem.classList.add('disabled');
      MatcherConfigShortcuts.listOverlayElem.classList.add('active');

      const formElem = MatcherConfigShortcuts.listFormContainerElem.querySelector('.conf-list-entry-form');
      let profileValue = formElem.querySelector('#entry-form-id').value;
      let description = formElem.querySelector('#entry-form-descript').value;
      let profileEntry;

      if(steamToolsUtils.isSteamId64Format(profileValue)) {
         profileEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.profileid === profileValue);
      }

      if(profileEntry) {
         // app found: prompt user if they want to overwrite existing data
         // fill dialog with necessary info
         // unhide dialog

         const profileEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-profileid=${profileEntry.profileid}]`);
         profileEntryElem.textContent = description;
         profileEntry.descript = description;

         return;
      } else {
         let profile = await Profile.findProfile(profileValue);
         if(profile) {
            profileEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.profileid === profile.id);
            if(profileEntry) {
               // app found: prompt user if they want to overwrite existing data
               // fill dialog with necessary info
               // unhide dialog

               const profileEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-profileid=${profileEntry.profileid}]`);
               profileEntryElem.textContent = description;
               profileEntry.descript = description;

               return;
            } else {
               let entryGroupElem = MatcherConfigShortcuts.listElems[currentTab];
               let entryHTMLString = `<div class="matcher-conf-list-entry" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
               +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" class="avatar offline">`
               +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
               +    '</a>'
               +    `<div class="conf-list-entry-name">${profile.name}</div>`
               +    `<div class="conf-list-entry-descript">${description}</div>`
               + '</div>';

               entryGroupElem.insertAdjacentHTML('afterbegin', entryHTMLString);
            }
         } else {
            alert('No valid profile found. Data will not be added!');
         }
      }

      MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
      MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
      MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
   } else if(currentTab === 'applist') {
      MatcherConfigShortcuts.listActionBarElem.classList.add('disabled');
      MatcherConfigShortcuts.listOverlayElem.classList.add('active');

      const formElem = MatcherConfigShortcuts.listFormContainerElem.querySelector('.conf-list-entry-form');
      let appid = parseInt(formElem.querySelector('#entry-form-id').value);
      let description = formElem.querySelector('#entry-form-descript').value;
      let appidEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.appid === appid);

      if(appidEntry) {
         // app found: prompt user if they want to overwrite existing data
         // fill dialog with necessary info
         // unhide dialog

         const appidEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-appid=${appidEntry.appid}]`);
         appidEntryElem.textContent = description;
         appidEntry.descript = description;

         return;
      } else {
         let appdata = await Profile.findAppMetaData(appid);
         if(!appdata) {
            // no appdata exists, could possibly mean that community data was nuked (eg 梦中女孩) even if the items still exist
            // therefore don't reject entry submission and add entry
            let entryHTMLString = `<div class="matcher-conf-list-entry" data-appid="${appid}" data-name="">`
            +    '<a class="app-header"></a>'
            +    `<div class="conf-list-entry-profile">${appid}</div>`
            +    `<div class="conf-list-entry-descript">${description}</div>`
            + '</div>';

            MatcherConfigShortcuts.listElems[currentTab].insertAdjacentHTML('beforeend', entryHTMLString);
            globalSettings.matcher.lists[currentTab].data.push({ appid: appid, descript: description });
         } else {
            let insertBeforeThisEntry;
            for(let entryElem of MatcherConfigShortcuts.listElems[currentTab].querySelectorAll(`.matcher-conf-list-entry`)) {
               if(entryElem.dataset.name && appdata.name.localeCompare(entryElem.dataset.name) < 0) {
                  insertBeforeThisEntry = entryElem;
                  break;
               }
            }
            let entryHTMLString = `<div class="matcher-conf-list-entry" data-appid="${appdata.appid}" data-name="${appdata.name}">`
            +    `<a href="https://steamcommunity.com/my/gamecards/${appdata.appid}}/" class="app-header">`
            +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
            +    '</a>'
            +    `<div class="conf-list-entry-name">${appdata.name}</div>`
            +    `<div class="conf-list-entry-descript">${description}</div>`
            + '</div>';

            insertBeforeThisEntry.insertAdjacentHTML('beforebegin', entryHTMLString);
            let entryIndex = globalSettings.matcher.lists[currentTab].data.findIndex(x => x.appid === parseInt(insertBeforeThisEntry.dataset.appid));
            globalSettings.matcher.lists[currentTab].data.splice(entryIndex-1, 0, { appid: appdata.appid, descript: description });
         }

         MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
         MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
         MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
      }
   } else {
      console.warn('matcherConfigEntryFormAddListener(): Tab entry submission not implemented, no entry modified/added!');
   }
}

function matcherConfigEntryFormCancelListener(event) {
   let currentTab = globalSettings.matcher.currentTab;
   if(currentTab === 'matchlist' || currentTab === 'blacklist') {
      MAIN_ELEM.querySelector('#entry-form-id').value = '';
      MAIN_ELEM.querySelector('#entry-form-descript').value = '';
   } else if(currentTab === 'applist') {
      MAIN_ELEM.querySelector('#entry-form-id').value = '';
      MAIN_ELEM.querySelector('#entry-form-descript').value = '';
   } else {
      console.warn('matcherConfigEntryFormCancelListener(): Entry form cancel not implemented, form will not be cleared!');
   }

   MatcherConfigShortcuts.listFormContainerElem.classList.add('hidden');
}

function matcherConfigListDialogCancelListener(event) {
   MAIN_ELEM.getElementById('conf-list-entry-new').innerHTML = '';
   MatcherConfigShortcuts.listDialogElem.classList.remove('active');
   MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
   MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
   MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
}

function matcherConfigListDialogConfirmListener(event) {
   MatcherConfigShortcuts.selectedListEntryElem.innerHTML = MAIN_ELEM.getElementById('conf-list-entry-new').innerHTML;
   MAIN_ELEM.getElementById('conf-list-entry-new').innerHTML = '';
   MatcherConfigShortcuts.listDialogElem.classList.remove('active');
   MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
   MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
   MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
}

function matcherConfigImportListener() {
   const isValidConfigObject = obj => {
      if(!obj.config || !steamToolsUtils.isSimplyObject(obj.config)) {
         return false;
      }
      for(let options in obj.config) {
         if(!Array.isArray(options)) {
            return false;
         }
         for(let option of options) {
            if(typeof option.name !== 'string' || typeof option.id !== 'string' || typeof option.label !== 'string' || typeof option.value !== 'boolean') {
               return false;
            }
         }
      }

      if(obj.lists && steamToolsUtils.isSimplyObject(obj.lists)) {
         return false;
      }
      for(let list in obj.lists) {
         if(!Array.isArray(obj.lists[list])) {
            return false;
         }
      }

      return true;
   }

   let file = this.files[0];
   if(file.type !== 'application/json') {
      console.warn('importMatcherConfigListener(): file type is not JSON, config not loaded!');
   }

   const reader = new FileReader();
   reader.onload = (event) => {
      let loadedConfig = JSON.parse(event.target.result);
      if(isValidConfigObject(loadedConfig)) {
         globalSettings.matcher = loadedConfig;
         matcherConfigLoadUI();
      }
   }
   reader.readAsText(file);
}

async function matcherConfigExportListener() {
   let dlElement = await generateExportConfigElement('matcher', 'SteamMatcherConfig');
   if(!dlElement) {
      return;
   }
   dlElement.click();
}

async function matcherConfigSaveListener() {
   await SteamToolsDbManager.setToolConfig('matcher');
}

async function matcherConfigLoadListener() {
   let config = await SteamToolsDbManager.getToolConfig('matcher');
   if(config.matcher) {
      globalSettings.matcher = config.matcher;
      matcherConfigLoadUI();
   }
}

function resetDefaultMatcherConfigListener() {
   // prompt user to confirm action

   globalSettings.matcher = steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.matcher);
   matcherConfigLoadUI();
}

/****************************************************/
/***************** Item Matcher END *****************/
/****************************************************/

/***********************************************/
/**************** Main Function ****************/
/***********************************************/
function generateSuperNav() {
   let navContainer = document.querySelector("#global_header .supernav_container");
   if(navContainer === null) {
      return;
   }

   let htmlStringHeader = '<a class="menuitem supernav " data-tooltip-type="selector" data-tooltip-content=".submenu_tools">TOOLS</a>';
   let htmlMenu = document.createElement("div");
   htmlMenu.setAttribute("class", "submenu_tools");
   htmlMenu.setAttribute("style", "display: none;");
   htmlMenu.setAttribute("data-submenuid", "tools");
   for(let toolMenuEntry of TOOLS_MENU) {
      htmlMenu.insertAdjacentHTML("beforeend", `<a class="submenuitem" name="${toolMenuEntry.name.toLowerCase().replace(/\s/g, '-')}" ${toolMenuEntry.href ? `href="${toolMenuEntry.href}"` : ''}>${toolMenuEntry.htmlString || toolMenuEntry.name}</a>`);
      if(!toolMenuEntry.href && toolMenuEntry.entryFn) {
         htmlMenu.lastElementChild.addEventListener("click", toolMenuEntry.entryFn);
      }
   }

   let nextNavHeader = navContainer.querySelector(".submenu_username");
   nextNavHeader.insertAdjacentElement("afterend", htmlMenu);
   nextNavHeader.insertAdjacentHTML("afterend", htmlStringHeader);

   unsafeWindow.$J(function($) {
      $('#global_header .supernav').v_tooltip({'location':'bottom', 'destroyWhenDone': false, 'tooltipClass': 'supernav_content', 'offsetY':-6, 'offsetX': 1, 'horizontalSnap': 4, 'tooltipParent': '#global_header .supernav_container', 'correctForScreenSize': false});
   });
}

function main() {
   SteamToolsDbManager.setup();
   generateSuperNav();
}

main();
