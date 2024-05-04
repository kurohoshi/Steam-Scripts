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
// @grant        GM_addStyle
// @grant        GM_log
// ==/UserScript==

// Script inspired by the following Userscripts:
// https://github.com/Rudokhvist/ASF-STM/
// https://github.com/Tithen-Firion/STM-UserScript

const globalSettings = {};
const GLOBALSETTINGSDEFAULTS = {};
const TOOLS_MENU = [
   { name: 'Main Page', href: 'https://steamcommunity.com/groups/tradingcards/discussions/2/3201493200068346848/', htmlString: undefined, entryFn: undefined},
   { name: 'Matcher', href: undefined, htmlString: undefined, entryFn: gotoMatcherConfigPage},
   { name: 'Booster Crafter', href: 'https://steamcommunity.com/tradingcards/boostercreator/enhanced', htmlString: undefined, entryFn: undefined},
];
const DB_OBJECTSTORE_CONFIGS = [
   { name: 'config',         keypath: undefined, autoincr: undefined },
   { name: 'profiles',       keypath: undefined, autoincr: undefined, indices: [
      { name: 'url', keyPath: 'url', options: undefined }
   ]},
   { name: 'badgepages',     keypath: undefined, autoincr: undefined },
   { name: 'app_data',       keypath: undefined, autoincr: undefined },
   { name: 'item_descripts', keypath: undefined, autoincr: undefined },
   { name: 'inventories',    keypath: undefined, autoincr: undefined },
   { name: 'item_matcher_results', keypath: undefined, autoincr: undefined },
   { name: 'item_nameids', keypath: undefined, autoincr: undefined }
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
                  let newObjStore;
                  if(!objConfig.keypath && !objConfig.autoincr) {
                     newObjStore = this.db.createObjectStore(objConfig.name);
                  } else {
                     let options = {};
                     if(typeof objConfig.keypath === 'string') {
                        options.keyPath = objConfig.keypath;
                     }
                     if(objConfig.autoincr) {
                        options.autoincr = true;
                     }
                     newObjStore = this.db.createObjectStore(objConfig.name, options);
                  }

                  if(objConfig.indices && Array.isArray(objConfig.indices)) {
                     for(let indexerEntry of objConfig.indices) {
                        newObjStore.createIndex(indexerEntry.name, indexerEntry.keyPath, indexerEntry.options);
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
   }
};

SteamToolsDbManager.getToolConfig = async function(toolname) {
   return await this.get('config', undefined, toolname);
}

SteamToolsDbManager.setToolConfig = async function(toolname) {
   await this.set('config', globalSettings[toolname], toolname);
}

// pointless promisified export to be consistent with import
function exportConfig(toolname, filename) {
   return new Promise((resolve, reject) => {
      let dlElement = steamToolsUtils.generateExportDataElement(toolname+'-config', filename, globalSettings[toolname]);
      if(!dlElement) {
         return;
      }
      dlElement.click();
   });
}

function importConfig(toolname) {
   const isValidConfigObject = obj => {
      if(obj.config && !steamToolsUtils.isSimplyObject(obj.config)) {
         return false;
      }
      for(let optionGroup of Object.values(obj.config)) {
         if(!steamToolsUtils.isSimplyObject(optionGroup) || !Array.isArray(optionGroup.options)) {
            return false;
         }
         for(let option of optionGroup.options) {
            if(typeof option.name !== 'string' || typeof option.id !== 'string' || typeof option.label !== 'string' || typeof option.value !== 'boolean') {
               return false;
            }
         }
      }

      if(obj.lists && !steamToolsUtils.isSimplyObject(obj.lists)) {
         return false;
      }
      for(let list of Object.values(obj.lists)) {
         if(!steamToolsUtils.isSimplyObject(list) || !Array.isArray(list.data)) {
            return false;
         }
      }

      return true;
   }

   return new Promise((resolve, reject) => {
      let ulElement = steamToolsUtils.generateImportDataElement(toolname+'-config');
      if(!ulElement) {
         console.warn('importConfig(): Element not created, abort!');
         return;
      }

      ulElement.addEventListener('change', (inputEvent) => {
         if(!inputEvent.currentTarget.files.length) {
            console.warn('importConfig(): No file selected!');
            return;
         }

         let file = inputEvent.currentTarget.files[0];
         if(file.type !== 'application/json') {
            console.warn('importConfig(): file type is not JSON, config not loaded!');
            return;
         }

         const reader = new FileReader();
         reader.onload = (readerEvent) => {
            let loadedConfig = JSON.parse(readerEvent.target.result);
            if(isValidConfigObject(loadedConfig)) {
               globalSettings[toolname] = loadedConfig;
               resolve(loadedConfig);
            } else {
               reject('importConfig(): Error loading config!');
            }
         }
         reader.readAsText(file);
      });
      ulElement.click();
   });
}

SteamToolsDbManager.getProfiles = async function(profileids, useURL=false) {
   return useURL
      ? (await this.get("profiles", 'url', profileids))
      : (await this.get("profiles", undefined, profileids));
}
SteamToolsDbManager.setProfile = async function(profile) {
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
}
SteamToolsDbManager.getBadgepages = async function(profileids) {
   return await this.get("badgepages", undefined, profileids);
}
SteamToolsDbManager.setBadgepages = async function(profileid, badgepages) {
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
}
SteamToolsDbManager.getAppDatas = async function(appids) {
   return await this.get("app_data", undefined, appids);
}
SteamToolsDbManager.setAppData = async function(appdata) {
   let savedData = await this.get("app_data", undefined, appdata.appid);
   savedData = savedData[appdata.appid];

   if(savedData) {
      savedData.appid = appdata.appid ?? savedData.appid;
      savedData.name  = appdata.name  ?? savedData.name;
      for(let i=0; i<appdata.cards.length; i++) {
         Object.assign(savedData.cards[i], appdata.cards[i]);
      }
      for(let [rarity, badgeList] of Object.entries(appdata.badges)) {
         Object.assign(savedData.badges[rarity], badgeList);
      }
   } else {
      savedData = appdata;
   }

   await this.set("app_data", savedData, savedData.appid);
}
SteamToolsDbManager.getItemDescripts = async function(appid, contextid, classids) {
   let getList = classids.map(x => `${appid}_${contextid}_${x}`);
   return await this.get("item_descripts", undefined, getList);
}
SteamToolsDbManager.setItemDescripts = async function(item, contextid, appid) {
   let key = `${item.appid || appid}_${item.contextid || contextid}_${item.classid}`;
   let savedData = await this.get("item_descripts", undefined, key);
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
   return await this.get("inventories", undefined, getList);
}
SteamToolsDbManager.setProfileInventory = async function(inventoryData, profileid, appid, contextid) {
   // No need to update sublevel data, overwrite all old data
   await this.set("inventories", inventoryData, `${profileid}_${appid}_${contextid}`);
}
SteamToolsDbManager.getMatchResults = async function(profileid1, profileid2List) {
   let getList = profileid2List.map(x => `${profileid1}_${x}`);
   return await this.get("item_matcher_results", undefined, getList);
}
SteamToolsDbManager.setMatchResult = async function(result) {
   // No need to update sublevel data, overwrite all old data
   await this.set("item_matcher_results", result, `${result.inventory1.meta.profileid}_${result.inventory2.meta.profileid}`);
}
SteamToolsDbManager.getItemNameIds = async function(appid, hashnames) {
   let hashList = hashnames.map(x => `${appid}/${x}`);
   return await this.get("item_nameids", undefined, hashList);
}
SteamToolsDbManager.setItemNameId = async function(appid, hashname, item_nameid) {
   await this.set("item_nameids", item_nameid, `${appid}/${hashname}`);
}

/***********************************************************/
/**************** Badgepage Filtering BEGIN ****************/
/***********************************************************/
function getCardStock(pageElem) {
   if(!pageElem.querySelector('.badge_card_set_cards')) {
      return null;
   }

   let cardStock = [];
   for(let cardEntry of pageElem.querySelectorAll('.badge_card_set_card')) {
      let cardAmount = cardEntry.children[1].childNodes.length === 5 ? parseInt(cardEntry.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
      cardStock.push(parseInt(cardAmount));
   }

   return cardStock;
}

async function setupBadgepageFilter() {
   globalSettings.badgepageFilter = {
      itemIds: {},
      cardInfoList: [],
      appid: document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0],
      isFoilPage: window.location.search.includes('border=1'),
      friendsCardStock: {},
      myCardStock: getCardStock(document),
      myMissingCards: new Set(),
      myPossibleCards: new Set()
   };

   let { myCardStock, myMissingCards, myPossibleCards } = globalSettings.badgepageFilter;
   for(let i=0; i<myCardStock.length; i++) {
      if(myCardStock[i]>=2) {
         myPossibleCards.add(i);
      } else if(myCardStock[i]==0) {
         myMissingCards.add(i);
      }
   }

   for(let cardEntry of document.querySelectorAll('.badge_card_set_card')) {
      let textNodes = cardEntry.querySelector('.badge_card_set_text').childNodes;
      globalSettings.badgepageFilter.cardInfoList.push({
         name: textNodes[textNodes.length-3].textContent.trim(),
         img: cardEntry.querySelector('img').src
   });
}

   for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
      let itemId = parseInt(missingCardElem.querySelector('img').id.slice(9));
      let index = parseInt(missingCardElem.querySelector('.badge_card_collect_text > :last-child').textContent.match(/\d+/))-1;
      globalSettings.badgepageFilter.itemIds[index] = itemId;
   }

   addColorFilterSvg(document.getElementById('responsive_page_template_content'));
   GM_addStyle(cssGlobal);
   GM_addStyle(cssEnhanced);
   GM_addStyle(cssMatcher);

   let friendFilterHTMLString = '<div class="enhanced-options right">'
   +    '<button id="friend-filter" class="purple wide">Filter Friends</button>'
   +    '<button id="good-swaps" class="purple wide">Display Good Swaps</button>'
   +    '<button id="balance-cards" class="purple wide">Balance Cards</button>'
   + '</div>';
   let headerLinkElem = document.querySelector('.badge_cards_to_collect');
   headerLinkElem.insertAdjacentHTML('beforebegin', friendFilterHTMLString);
   document.getElementById('friend-filter').addEventListener('click', badgepageFilterFilterFriendsWithCardsListener);
   document.getElementById('good-swaps').addEventListener('click', badgepageFilterShowGoodSwapsListener);
   document.getElementById('balance-cards').addEventListener('click', badgepageFilterBalanceCardsListener);
}

async function badgepageFilterFetchFriend(profileContainerElem)  {
   const getPossibleMatches = (stock, partnerMissingCards, partnerPossibleCards) => {
      let minVal = Math.min(...stock);
      let lowestCards = new Set(stock.reduce((arr, x, i) => {
         if(x==minVal) {
            arr.push(i)
         }
         return arr;
      }, []));
      let possibleCards = Array(stock.length);
      for(let i=0; i<possibleCards.length; i++) {
         possibleCards[i] = [];
      }
      for(let partnerMissingCard of partnerMissingCards) {
         for(let partnerPossibleCard of partnerPossibleCards) {
            if(partnerMissingCard==partnerPossibleCard) {
               throw 'getPossibleMatches(): Missing card and possible card cannot have same index in both, something is wrong!';
            }

            if(stock[partnerMissingCard]<2) {
               continue;
            }

            if(stock[partnerMissingCard]-stock[partnerPossibleCard]>=2) {
               possibleCards[partnerMissingCard].push(partnerPossibleCard);
            }
         }
      }

      return { lowestCards, possibleCards };
   };

   let { friendsCardStock, isFoilPage, myMissingCards, myPossibleCards} = globalSettings.badgepageFilter;
   let profileElem = profileContainerElem.querySelector('.persona');
   let profileUrl = profileElem.href.match(/(id|profiles)\/[^/]+$/g);

   if(!Object.hasOwn(friendsCardStock, profileUrl)) {
      let [ steamId3, appid, itemId ] = profileContainerElem.querySelector('.btn_grey_grey ').onclick.toString().match(/\d+/g);
      let profileBadgepageLink = profileElem.href + '/gamecards/' + appid + '/' + (isFoilPage ? '?border=1' : '');
      let response = await fetch(profileBadgepageLink);

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      if(!doc.querySelector('.badge_gamecard_page')) {
         friendsCardStock[profileUrl] = null;
         return;
      }

      let profileAvatarElem = doc.querySelector('.profile_small_header_texture .playerAvatar');
      let profileName = doc.querySelector('.profile_small_header_texture .profile_small_header_name').textContent.trim();
      let profileState = profileAvatarElem.classList.contains('offline')
         ? 'offline' : profileAvatarElem.classList.contains('online')
         ? 'online' : profileAvatarElem.classList.contains('in-game')
         ? 'in-game' : null;
      let profileImgLink = profileAvatarElem.children[profileAvatarElem.children.length-1].src.replace('_medium', '');

      let profileCardStock = getCardStock(doc);
      let { lowestCards: profileMissingCards, possibleCards: profilePossibleCards } = profileCardStock
         ? getPossibleMatches(profileCardStock, myMissingCards, myPossibleCards)
         : { lowestCards: null, possibleCards: null };

      friendsCardStock[profileUrl] = {
         id3: steamId3,
         name: profileName,
         profileLink: profileElem.href,
         pfp: profileImgLink,
         state: profileState,
         stock: profileCardStock,
         lowestCards: profileMissingCards,
         possibleCards: profilePossibleCards
      }
   }

   return friendsCardStock[profileUrl];
}

// provides only mutually beneficial matches with any duplicates cards being fair game
async function badgepageFilterFilterFriendsWithCardsListener() {
   // remove/disable button

   let { friendsCardStock } = globalSettings.badgepageFilter;

   for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
      let index = missingCardElem.querySelector('.badge_card_collect_text').lastElementChild.textContent.match(/^\d+/g)[0];
      index = parseInt(index)-1;

      for(let profileContainerElem of missingCardElem.querySelectorAll('.badge_friendwithgamecard')) {
         let profileElem = profileContainerElem.querySelector('.persona');
         let profileUrl = profileElem.href.match(/(id|profiles)\/[^/]+$/g);

         await badgepageFilterFetchFriend(profileContainerElem);

         if(!friendsCardStock[profileUrl]?.stock) {
            profileContainerElem.style.backgroundColor = '#111';
         } else if(!friendsCardStock[profileUrl]?.possibleCards?.[index].length) {
            profileContainerElem.style.display = 'none';
         }
      }
   }
}

// provides only mutually beneficial matches with any duplicates cards being fair game
async function badgepageFilterShowGoodSwapsListener() {
   const generateMatchItemsHTMLString = (indices, priority) => {
      let { cardInfoList } = globalSettings.badgepageFilter;
      return indices.map(x => `<div class="match-item${priority.has(x)?' good':''}" title="${cardInfoList[x].name}"><img src="${cardInfoList[x].img + '/96fx96f?allow_animated=1' }" alt="${cardInfoList[x].name}"></div>`).join('');
   };
   const generateMatchRowHTMLString = (profileid3, index, goodMatches, priority) => {
      let { appid, itemIds } = globalSettings.badgepageFilter;
      return '<div class="match-item-row align-right">'
      +    '<div class="match-item-list left">'
      +       generateMatchItemsHTMLString(goodMatches, priority)
      +    '</div>'
      +    `<div class="match-item-action trade" title="Offer a Trade..." onclick="StartTradeOffer( ${profileid3}, {for_tradingcard: '${appid + '_' + itemIds[index]}'} );"></div>`
      +    '<div class="match-item-list right">'
      +       generateMatchItemsHTMLString([index], priority)
      +    '</div>'
      + '</div>';
   };
   const generateMatchRowsHTMLString = (profileid3, matches, priority) => matches.map((x, i) => x.length ? generateMatchRowHTMLString(profileid3, i, x, priority) : '').join('');

   // remove/disable button

   let HTMLString = '<div class="badge_detail_tasks footer"></div>'
   + '<div id="good-swaps-results" class="enhanced-section">'
   +    '<div class="enhanced-header">Good Matches</div>'
   +    '<div class="enhanced-body"></div>'
   + '</div>'
   + '<div class="userscript-throbber">'
   +    '<div class="throbber-bar"></div><div class="throbber-bar"></div><div class="throbber-bar"></div>'
   + '</div>';
   document.querySelector('.badge_row_inner').insertAdjacentHTML('beforeend', HTMLString);

   let { friendsCardStock } = globalSettings.badgepageFilter;
   let processedFriends = new Set();
   let goodSwapListElem = document.querySelector('#good-swaps-results > .enhanced-body');

   for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
      let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g);
      if(processedFriends.has(profileUrl)) {
         continue;
      }

      await badgepageFilterFetchFriend(profileElem);
      let profile = friendsCardStock[profileUrl];

      if(!profile?.stock) {
         continue;
      } else if(!profile?.possibleCards?.some(x => x.length)) {
         continue;
      }

      let profileGoodSwapHTMLString = '<div class="match-container-outer">'
      +    '<div class="match-container max3">'
      +       '<div class="match-header">'
      +          '<div class="match-name">'
      +             `<a href="${profile.profileLink}" class="avatar ${profile.state ?? 'offline'}">`
      +                `<img src="${profile.pfp}">`
      +             '</a>'
      +             profile.name
      +          '</div>'
      +       '</div>'
      +       generateMatchRowsHTMLString(profile.id3, profile.possibleCards, profile.lowestCards)
      +    '</div>'
      + '</div>';
      goodSwapListElem.insertAdjacentHTML('beforeend', profileGoodSwapHTMLString);
   }

   document.querySelector('.userscript-throbber').remove();
}

async function badgepageFilterBalanceCardsListener() {
   const generateMatchItemsHTMLString = (matchResult, leftSide=true) => {
      const generateMatchItemHTMLString = (qty, i) => {
         return `<div class="match-item" data-qty="${Math.abs(qty)}" title="${cardInfoList[i].name}"><img src="${cardInfoList[i].img + '/96fx96f?allow_animated=1' }" alt="${cardInfoList[i].name}"></div>`
      };
      let { cardInfoList } = globalSettings.badgepageFilter;
      return matchResult.map((swapAmount, index) =>
         leftSide ? (swapAmount<0 ? generateMatchItemHTMLString(swapAmount, index) : '') : (swapAmount>0 ? generateMatchItemHTMLString(swapAmount, index) : '')
      ).join('');
   };
   const generateMatchRowHTMLString = (matchResult) => {
      return '<div class="match-item-row align-right">'
      +    '<div class="match-item-list left">'
      +       generateMatchItemsHTMLString(matchResult, true)
      +    '</div>'
      +    `<div class="match-item-action trade"></div>`
      +    '<div class="match-item-list right">'
      +       generateMatchItemsHTMLString(matchResult, false)
      + '</div>';
   };

   let HTMLString = '<div class="badge_detail_tasks footer"></div>'
   + '<div id="balance-results" class="enhanced-section">'
   +    '<div class="enhanced-header">Balanced Matches</div>'
   +    '<div class="enhanced-body"></div>'
   + '</div>'
   + '<div class="userscript-throbber">'
   +    '<div class="throbber-bar"></div><div class="throbber-bar"></div><div class="throbber-bar"></div>'
   + '</div>';
   document.querySelector('.badge_row_inner').insertAdjacentHTML('beforeend', HTMLString);

   let { myCardStock, friendsCardStock } = globalSettings.badgepageFilter;
   let processedFriends = new Set();
   let balanceMatchingListElem = document.querySelector('#balance-results > .enhanced-body');

   for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
      let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g);
      if(processedFriends.has(profileUrl)) {
         continue;
      }

      await badgepageFilterFetchFriend(profileElem);
      let profile = friendsCardStock[profileUrl];

      if(!profile?.stock) {
         continue;
      }

      let balanceResult = Matcher.balanceVariance(myCardStock, profile.stock);
      if(!balanceResult.swap.some(x => x)) {
         continue;
      }

      let profileBalancedMatchingHTMLString = '<div class="match-container-outer">'
      +    '<div class="match-container">'
      +       '<div class="match-header">'
      +          '<div class="match-name">'
      +             `<a href="${profile.profileLink}" class="avatar ${profile.state ?? 'offline'}">`
      +                `<img src="${profile.pfp}">`
      +             '</a>'
      +             profile.name
      +          '</div>'
      +       '</div>'
      +       generateMatchRowHTMLString(balanceResult.swap)
      +    '</div>'
      + '</div>';
      balanceMatchingListElem.insertAdjacentHTML('beforeend', profileBalancedMatchingHTMLString);
   }

   document.querySelector('.userscript-throbber').remove();
}

/***********************************************************/
/***************** Badgepage Filtering END *****************/
/***********************************************************/

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
   static me;
   static MasterProfileList = [];
   static appMetaData = {}; // Can be put into its own class // should use map
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
   pastNames = [];
   last_updated = 0;

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
      this.pastNames  = props.pastNames;
      this.last_updated = props.last_updated;

      // Bad place for a single execution block, find a better place
      if(!Profile.me) {
         Profile.findProfile(Profile.utils.getMySteamId()).then((profile) => {
            if(profile instanceof Profile) {
               Profile.me = profile;
            } else {
               console.error('new Profile(): Couldn\'n find user profile! Something is probably wrong!');
            }
         });
      }
   }

   async getTradeFriends() {
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
         let profileString = profile.querySelector('a').href.replace(/^https:\/\/steamcommunity\.com\//g, '');
         if(profileString.startsWith('profiles')) {
            let id = profileString.replace(/^profiles\//g, '');
            let foundProfile = await Profile.findProfile(id);
            this.friends.push(foundProfile);
         } else if(profileString.startsWith('id')) {
            let url = profileString.replace(/^id\//g, '');
            let foundProfile = await Profile.findProfile(url);
            this.friends.push(foundProfile);
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
         if(!(await this.isMe())) {
            console.error('isFriend(): Method ran on a profile that is not user\'s, exiting!');
            return;
         }
         await this.getTradeFriends(); // A more generic friends list finding is required
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

   static async loadProfiles(profileStrings, useURL=false) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      let dataset = await SteamToolsDbManager.getProfiles(profileStrings, useURL);

      for(let id in dataset) {
         if(!dataset[id]) {
            continue;
         }
         let data = dataset[id];
         let profile = Profile.MasterProfileList.find(x => x.id === data.id);
         if(profile) {
            profile.id         ??= data.id;
            profile.url        ??= data.url;
            profile.name       ??= data.name;
            profile.pfp        ??= data.pfp;
            profile.state      ??= data.state;
            profile.tradeToken ??= data.tradeToken;
            profile.friends    ??= data.friends;
            profile.last_updated ??= data.last_updated;
         } else {
            profile = new Profile(data);
            Profile.MasterProfileList.push(profile);
         }

         if(Profile.utils.isOutdated(profile.last_updated, 7)) {
            await Profile.findMoreDataForProfile(profile);
         }

         // fetch badgepages and inventories? app metadata? item descriptions?
      }
   }

   async saveProfile() {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      await SteamToolsDbManager.setProfile(this);
   }

   static async findProfile(str) {
      if(typeof str !== 'string') {
         throw "findProfile(): Parameter is not a string!";
      }

      let profile;
      if(Profile.utils.isSteamId64Format(str)) {
         profile = Profile.MasterProfileList.find(x => x.id === str);
         if(!profile) {
            await Profile.loadProfiles(str);
            profile = Profile.MasterProfileList.find(x => x.id === str);
            if(!(profile)) {
               console.log(`findProfile(): No profile found for id ${str}. Creating new profile...`);
               profile = await Profile.addNewProfile({id: str});
            }
         }
      }
      if(!profile) {
         profile = Profile.MasterProfileList.find(x => x.url === str);
         if(!profile) {
            await Profile.loadProfiles(str, true);
            profile = Profile.MasterProfileList.find(x => x.url === str);
            if(!(profile)) {
               console.log(`findProfile(): No profile found for url ${str}. Creating new profile...`);
               profile = await Profile.addNewProfile({url: str});
            }
         }
      }

      if(!profile) {
         console.warn("findProfile(): Unable to find or create a Profile instance!");
         return;
      }

      if(!Profile.me && profile.isMe()) {
         Profile.me = profile;
      }

      return profile;
   }

   static async addNewProfile(props) {
      try {
         if( !(await Profile.findMoreDataForProfile(props)) ) {
            throw "addNewProfile(): invalid profile";
         }

         let newProfile = new Profile(props);
         Profile.MasterProfileList.push(newProfile);
         await newProfile.saveProfile();
         return newProfile;
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

      let profiledata = profilePage.textContent
         .match(/g_rgProfileData = {[^;]+?}/g)
         .replace(/^g_rgProfileData = /, '');
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
            if(profile.pastNames && Array.isArray(profile.pastNames) && profile.pastNames[length-1] !== profile.name) {
               profile.pastNames.push(profile.name);
            }
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

      profile.last_updated = Date.now();
      if(profile instanceof Profile) {
         await profile.saveProfile();
      }

      return true;
   }

   async canTrade(partner) {
      return (await this.isFriend(partner) || partner.tradeToken !== undefined);
   }

   static async addTradeURL(data) {
      let id, token;
      if(typeof data === 'string') {
         data = data.trim();
         if(!/^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=.{8}$/.test(data)) {
            console.error("addTradeURL(): invalid trade URL, trade token not added");
            return;
         }

         data = data.replace('https://steamcommunity.com/tradeoffer/new/?', '');
         let parsedData = data.split('&');
         id = Profile.utils.getSteamProfileId64(parsedData[0].replace('partner=', ''));
         token = parsedData[1].replace('token=', '');
      } else if(Profile.utils.isSimplyObject(data)) {
         ({ partner: id, token } = data);
         id = Profile.utils.getSteamProfileId64(id);
      } else {
         console.warn('addTradeURL(): Invalid datatype provided!')
         return;
      }

      let profile = await Profile.findProfile(id);
      if(!profile) {
         console.warn(`addTradeURL(): Profile ${id} not found. Please doublecheck that trade url is valid!`);
         return;
      }

      if(profile.tradeToken !== token) {
         profile.tradeToken = token;
         await profile.saveProfile();
         console.log(`addTradeURL(): Trade token added to ${id}.`);
      }
   }

   /***********************************************************************/
   /***************************** App Methods *****************************/
   /***********************************************************************/
   static async findAppMetaData(appid) {
      if(!Profile.appMetaData[appid]) {
         await Profile.loadAppMetaData(appid);
      }

      // attempt to use user's own badgepage to scrape basic app data
      if(!Profile.appMetaData[appid]) {
         let myProfile;
         if(!Profile.me) {
            myProfile = await Profile.findProfile(Profile.utils.getMySteamId());
         }

         if(!myProfile) {
            console.error('findAppMetaData(): Somehow user\'s profile cannot be found!');
            return;
         }
         await myProfile.getBadgepageStock(appid);
      }

      return Profile.appMetaData[appid];
   }

   static async loadAppMetaData(appids) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      let dataset = await SteamToolsDbManager.getAppDatas(appids);

      for(let appid in dataset) {
         let existingData = Profile.appMetaData[appid];
         if(existingData) {
            existingData.name ??= dataset[appid].name;
            Object.assign(existingData.badges.normal, dataset[appid].badges.normal);
            Object.assign(existingData.badges.foil, dataset[appid].badges.foil);
            for(let [cardIndex, card] of dataset[appid].cards.entries()) {
               Object.assign(existingData.cards[cardIndex], card);
            }
         } else {
            Profile.appMetaData[appid] = dataset[appid];
         }
      }
   }

   static async saveAppMetaData(appid) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      await SteamToolsDbManager.setAppData(Profile.appMetaData[appid]);
   }

   // change to find app meta data
   async updateAppMetaData(appid, key, val) {
      if(!Profile.appMetaData[appid]) {
         await Profile.findAppMetaData(appid);
      }
      Profile.appMetaData[appid] ??= {appid: appid};
      Profile.appMetaData[appid][key] = val;
   }

   static async loadItemDescription(appid, contextid, classids) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      let dataset = await SteamToolsDbManager.getItemDescripts(appid, contextid, classids); // hardcoded for now

      for(let data in dataset) {
         if(Profile.itemDescriptions[data.classid]) {
            // update existing meta data
         } else {
            Profile.itemDescriptions[data.classid] = data;
         }
      }
   }

   static async saveItemDescription(classid) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      await SteamToolsDbManager.setItemDescript(Profile.itemDescriptions[classid], 6, 753);
   }

   updateItemDescription(classid, dataObject) {
      Profile.itemDescriptions[classid] ??= {};
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
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      let data = await SteamToolsDbManager.getProfileInventories(this.id, 753, 6);

      if(!this.inventory || this.inventory.last_updated<data.last_updated) {
         this.inventory = data;
      }
   }

   async saveInventory() {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

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
      let last_itemType_index = Profile.ITEM_TYPE_ORDER[last_itemType] ?? Number.MAX_SAFE_INTEGER;

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
            rarity = Profile.ITEM_RARITY_MAP[rarity.internal_name] ?? parseInt(rarity.internal_name.replace(/\D+/g, ''));
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
      let last_itemType_index = Profile.ITEM_TYPE_ORDER[last_itemType] ?? Number.MAX_SAFE_INTEGER;

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
            rarity = Profile.ITEM_RARITY_MAP[rarity.internal_name] ?? parseInt(rarity.internal_name.replace(/\D+/g, ''));
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
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

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
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

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

      // check if private profile here

      let rarity = foil ? 1 : 0;
      let newData = {};
      let name = doc.querySelector("a.whiteLink:nth-child(5)").textContent.trim();
      this.updateAppMetaData(appid, "name", name);
      let cardData = Profile.appMetaData[appid].cards ?? [];

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
         if(!cardData[i][`img_card${rarity}`]) {
            cardData[i][`img_card${rarity}`] = x.children[0].querySelector(".gamecard").src.replace(/https:\/\/community\.akamai\.steamstatic\.com\/economy\/image\//g, '');
         }
         let img_full = x.querySelector('.with_zoom');
         if(img_full) {
            img_full = img_full.outerHTML.match(/onclick="[^"]+"/g)[0];
            img_full = img_full.replaceAll('&quot;', '"');
            img_full = img_full.match(/[^/]+\.jpg/g)[0];
            img_full = img_full.replace('.jpg', '');
            cardData[i][`img_full${rarity}`] = img_full;
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

            let badgeLink = badges[i].querySelector(".badge_row_overlay").href.replace(/https?:\/\/steamcommunity\.com\/((id)|(profiles))\/[^/]+\/gamecards\//g, '');
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


let Matcher = {
   MAX_MATCH_ITER: 5,
   MATCH_TYPE_LIST: ["card", "background", "emoticon"],
   matchResultsList: {},
   utils: steamToolsUtils,
   exists: function(profile1, profile2, existanceLevel) {
      let currentLevel;
      if(!this.matchResultsList[profile1] || !this.matchResultsList[profile1][profile2]) {
         console.warn(`exists(): No entry for ${profile1}-${profile2} pair!`);
         currentLevel = 0; // no pair exists, return falsy
      } else if(!this.matchResultsList[profile1][profile2].results) {
         console.warn(`exists(): No match results for ${profile1}-${profile2} pair!`);
         currentLevel = 1; // level 1 existance, match results doesn't exist for some reason
      } else if(!this.matchResultsList[profile1][profile2].tradable) {
         console.warn(`exists(): ${profile1}-${profile2} pair do not have assetids for trade!`);
         currentLevel = 2; // level 2 existance, trade offer will not be able to be generated
      } else if(!this.matchResultsList[profile1][profile2].validated) {
         console.warn(`exists(): No match validation results for ${profile1}-${profile2} pair!`);
         currentLevel = 3; // level 3 existance, match results aren't validated
      } else {
         currentLevel = 4;
      }

      return existanceLevel < currentLevel;
   },
   getInventory: async function(profile, ref) {
      function* itemSetsIter() {
         for(let type in this.data) {
            for (let rarity=0; rarity<this.data[type].length; rarity++) {
               for(let appid in this.data[type][rarity]) {
                  yield [this.data[type][rarity][appid], appid, rarity, type];
               }
            }
         }
      }

      let profile1, profile2;
      if(!(profile instanceof Profile)) {
         profile1 = await Profile.findProfile(profile);
         if(!profile1) {
            throw `matcher.getInventory(): Profile ${profile} is invalid!`;
         }
      } else {
         profile1 = profile;
      }
      if(ref !== undefined) {
         if(!(ref instanceof Profile)) {
            profile2 = await Profile.findProfile(ref);
            if(!profile2) {
               throw `matcher.getInventory(): Profile ${ref} is invalid!`;
            }
         } else {
            profile2 = ref;
         }
      }

         await profile1.getProfileInventory("trade", ref);
         if(!profile1.inventory) {
            throw `matcher.getInventory(): Getting inventory for ${((profile instanceof Profile) ? profile.id : profile)} failed!`;
         }

      let inventory = this.utils.deepClone(profile1.inventory);
      inventory.itemsets = itemSetsIter;
      inventory.meta = { profileid: profile1.id };
      return inventory;
   },
   matchInv: async function(profile1, profile2, { helper=false, autoValidate=false } = { helper: false, autoValidate: false }) {
      let fillMissingItems = (target, source) => {
         for(let i=0; i<source.length; i++) {
            if(!target.some(x => x.classid === source[i].classid)) {
               target.push({ classid: source[i].classid, tradables: [], count: 0 });
            }
         }
      }

      if(typeof profile1 !== 'string' && !(profile1 instanceof Profile)) {
         throw "matchInv(): No profiles provided. inventories not set!";
      } else if(typeof profile2 !== 'string' && !(profile2 instanceof Profile)) {
         helper = profile2?.helper ?? helper;
         autoValidate = profile2?.autoValidate ?? autoValidate;
         profile2 = profile1;
         profile1 = Profile.me || this.utils.getMySteamId();
      }

      let inventory1;
      let inventory2;

      try {
         inventory1 = await this.getInventory(profile1);
         inventory2 = await this.getInventory(profile2, profile1);
      } catch(e) {
         console.error(e);
         return;
      }


      if(this.matchResultsList[inventory1.meta.profileid]) {
         if(this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid]) {
            console.warn(`matchInv(): Item Matcher for ${inventory1.meta.profileid}-${inventory2.meta.profileid} already exists!`);
         }
         this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid] = {};
      } else {
         this.matchResultsList[inventory1.meta.profileid] = { [inventory2.meta.profileid]: {} };
      }

      this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid] = {
         inventory1: inventory1,
         inventory2: inventory2,
         results: {}
      };

      for (let [set1, appid, rarity, itemType] of inventory1.itemsets()) {
         if(!this.MATCH_TYPE_LIST.includes(itemType)) {
            // console.log(`matchInv(): Is of type ${itemType}, skipping...`)
            continue;
         }

         if(!inventory2.data[itemType]?.[rarity]?.[appid]) {
            // console.log("No Match!");
            continue;
         }
         let set2 = inventory2.data[itemType][rarity][appid];

         fillMissingItems(set1, set2);
         fillMissingItems(set2, set1);

         if(set1.length !== set2.length) {
            // This shouldn't happen. If it does then it needs to be fixed
            console.error(`matchInv(): Item type ${itemType} from app ${appid} does not have equal length of items, cannot be compared!`);
            console.log(set1);
            console.log(set2);
            continue;
         } else if(set1.length === 1) {
            // console.log(`matchInv(): Item type ${itemType} from app ${appid} only has 1 item, nothing to compare. skipping...`);
            continue;
         }

         let swap = Array(set1.length).fill(0);
         let history = [];

         set1.sort((a, b) => a.classid.localeCompare(b.classid));
         set2.sort((a, b) => a.classid.localeCompare(b.classid));

         // Alternate balancing priority
         for (let i = 0; i<this.MAX_MATCH_ITER; i++) {
            let flip = i%2;
            let swapset1 = set1.map((x, i) => x.count + swap[i]);
            let swapset2 = set2.map((x, i) => x.count - swap[i]);
            let balanceResult = this.balanceVariance((flip ? swapset2 : swapset1), (flip ? swapset1 : swapset2), helper);
            if(!balanceResult.history.length) {
               break;
            }

            for(let x=0; x<swap.length; x++) {
               swap[x] += (flip ? -balanceResult.swap[x] : balanceResult.swap[x]);
            }
            for(let y=0; y<balanceResult.history.length; y++) {
               history.push([balanceResult.history[y][flip], balanceResult.history[y][1-flip]]);
            }
         }

         if(swap.some(x => x)) {
            this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid].results[`${itemType}_${rarity}_${appid}`] = { swap, history };
         }
      }

      this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid].tradable = true;
      if(autoValidate) {
         this.validate(inventory1.meta.profileid, inventory2.meta.profileid);
      }

      return this.matchResultsList[inventory1.meta.profileid][inventory2.meta.profileid];
   },
   balanceVariance: function(set1, set2, helper=false) {
      function binSwap(bin, index, higher=true, lutIndex) {
         let offset = higher ? 1 : -1
         let tmp = bin[index];
         let next = index + offset;
         if(higher) {
            while(next<bin.length && tmp[1]>=bin[next][1]) {
               binIndices[bin[next][0]][lutIndex] -= offset;
               bin[next-offset] = bin[next];
               next += offset;
            }
         } else {
            while(next>=0 && tmp[1]<=bin[next][1]) {
               binIndices[bin[next][0]][lutIndex] -= offset;
               bin[next-offset] = bin[next];
               next += offset;
            }
         }
         if(next-offset-index) {
            binIndices[tmp[0]][lutIndex] = next-offset;
            bin[next-offset] = tmp;
         }
      }

      if(!Array.isArray(set1) || !Array.isArray(set2) || set1.some(x => typeof x !== "number") || set2.some(x => typeof x !== "number") || set1.length !== set2.length) {
         console.error("balanceVariance(): Invalid sets! Sets must be an array of numbers with the same length!");
         return;
      }

      let setlen = set1.length;
      let bin1 = set1.map((x, i) => [i, x]).sort((a, b) => a[1]-b[1]);
      let bin2 = set2.map((x, i) => [i, x]).sort((a, b) => a[1]-b[1]);
      if( bin1[0][1] === bin1[bin1.length-1][1] ) {
         return { swap: Array(setlen).fill(0),  history: [] };
      }
      let history = [];

      // LUT for bin indices
      var binIndices = new Array(setlen);
      for(let i=0; i<binIndices.length; i++) {
         binIndices[i] = new Array(2);
      }
      for(let i=0; i<binIndices.length; i++) {
         binIndices[bin1[i][0]][0] = i;
         binIndices[bin2[i][0]][1] = i;
      }

      // prioritize lowest dupe gains for both sides as early as possible
      for(let max=1, maxlen=setlen*2; max<maxlen; max++) {
         let i     = max<=setlen ? 0 : max-setlen;
         let start = i;
         let end   = max<=setlen ? max : setlen;
         while(i<end) {
            let j = end-1-i+start;
            if(bin1[i][0] === bin2[j][0]) { // don't swap same item
               i++;
               continue;
            }

            let bin1_j_elem = bin1[binIndices[bin2[j][0]][0]];
            let bin2_i_elem = bin2[binIndices[bin1[i][0]][1]];

            if(!bin1_j_elem[1] || !bin2_i_elem[1]) { // someone doesn't have the item to swap, skip
               i++;
               continue;
            }

            // compare variance change before and after swap for both parties
            // [<0] good swap (variance will decrease)
            // [=0] neutral swap (variance stays the same)
            // [>0] bad swap (variance will increase)

            // simplified from (x1+1)**2+(x2-1)**2 ?? x1**2 + x2**2  -->  x1-x2+1 ?? 0
            let bin1vardiff =      bin1[i][1] -bin1_j_elem[1] +1;
            // simplified from (x1-1)**2+(x2+1)**2 ?? x1**2 + x2**2  --> -x1+x2+1 ?? 0
            let bin2vardiff = -bin2_i_elem[1]     +bin2[j][1] +1;

            // accept the swap if variances for either parties is lowered, but not if both variances doesn't change, otherwise continue to next item pair to be compared
            if (((helper || bin1vardiff <= 0) && bin2vardiff <= 0) && !(bin1vardiff === 0 && bin2vardiff === 0)) {
               bin1[i][1]++;
               binSwap(bin1, i, true, 0);
               bin1_j_elem[1]--;
               binSwap(bin1, binIndices[bin1_j_elem[0]][0], false, 0);

               bin2[j][1]++;
               binSwap(bin2, j, true, 1);
               bin2_i_elem[1]--;
               binSwap(bin2, binIndices[bin2_i_elem[0]][1], false, 1);
               history.push([bin2[j][0], bin1[i][0]]);
            } else {
               i++;
            }
         }
      }

      return {
         swap: bin1.sort((a, b) => a[0]-b[0]).map((x, i) => x[1] - set1[i]),
         history
      };
   },
   validate: function(profile1, profile2) {
      let roundZero = (num) => {
         return num<1e-10 && num>-1e-10 ? 0.0 : num;
      }

      if(!this.exists(profile1, profile2, 1)) {
         return;
      }

      let group1 = this.matchResultsList[profile1][profile2].inventory1.data;
      let group2 = this.matchResultsList[profile1][profile2].inventory2.data;

      for(let [category, set] of Object.entries(this.matchResultsList[profile1][profile2].results)) {
         let [itemType, rarity, appid] = category.split('_');
         let set1 = group1[itemType][rarity][appid];
         let set2 = group2[itemType][rarity][appid];

         set.avg = [
            set1.reduce((a, b) => a + b.count, 0.0) / set1.length,
            set2.reduce((a, b) => a + b.count, 0.0) / set2.length,
         ];
         set.variance = [
            [
               roundZero((set1.reduce((a, b) => a + (b.count ** 2), 0.0) / set1.length) - (set.avg[0] ** 2)),
               roundZero((set1.reduce((a, b, i) => a + ((b.count+set.swap[i]) ** 2), 0.0) / set1.length) - (set.avg[0] ** 2))
            ],
            [
               roundZero((set2.reduce((a, b) => a + (b.count ** 2), 0.0) / set2.length) - (set.avg[1] ** 2)),
               roundZero((set2.reduce((a, b, i) => a + ((b.count-set.swap[i]) ** 2), 0.0) / set2.length) - (set.avg[1] ** 2))
            ]
         ];
         set.stddev = [
            [
               Math.sqrt(set.variance[0][0]),
               Math.sqrt(set.variance[0][1])
            ],
            [
               Math.sqrt(set.variance[1][0]),
               Math.sqrt(set.variance[1][1])
            ]
         ];

         set.isValid = set.swap.some(x => x) && !set.swap.reduce((a, b) => a+b, 0)
            && set.variance[0][0]>=set.variance[0][1] && set.variance[1][0]>=set.variance[1][1];
         if(!set.isValid) {
            console.warn(`validate(): Swap may not be valid! `
               + ` no swap: ${set.swap.some(x => x)} `
               + ` swap sum: ${set.swap.reduce((a, b) => a+b, 0)} `
               + ` var1diff: ${set.variance[0][1]-set.variance[0][0]} `
               + ` var2diff: ${set.variance[1][1]-set.variance[1][0]} `
            );
         }
      }

      this.matchResultsList[profile1][profile2].validated = true;
   },
   generateRequestPayload: async function(profile1, profile2, message="", reverse=true) {
      // https://steamcommunity.com/tradeoffer/new/?partner=[STEAM3_ID]&forum_owner=[forum_owner]&forum_topic=[gidtopic]
      // steamid_owner = "10358279"+(forum_owner+1429521408)

      // POST https://steamcommunity.com/tradeoffer/new/send
      // Request payload
      // let reqPayload = {
      //    sessionid: "[SESSION_ID]",
      //    serverid: "1",
      //    partner: "[PROFILE_ID]",
      //    tradeoffermessage: "[MESSAGE_STRING]"
      //    json_tradeoffer: {
      //       newversion: true,
      //       version: [ARBITRARY_NUMBER],
      //       me: {
      //          assets: [{ appid: [INV_APPID], contextid: "[INV_CONTEXTID]"", amount: [AMOUNT], assetid: "[ASSET_ID]" }],
      //          currency: [],
      //          ready: false
      //       },
      //       them: {
      //          assets: [{ appid: [INV_APPID], contextid: "[INV_CONTEXTID]"", amount: [AMOUNT], assetid: "[ASSET_ID]" }],
      //          currency: [],
      //          ready: false
      //       }
      //    },
      //    captcha: "",
      //    trade_offer_create_params: {"trade_offer_access_token":"[TRADE_TOKEN]"} // using trade link url
      //    trade_offer_create_params: {} // empty when trading as friends
      //    trade_offer_create_params: {
      //       trading_topic: { // using game's trade forum trade link
      //          steamid_owner:"[steamid_owner]",
      //          forumtype:"Trading",
      //          gidfeature:-1,
      //          gidtopic:"[gidtopic]"
      //       }
      //    }
      // }
      let generateTradeOfferContentsWithHistory = (profile1, profile2, reverse=true) => {
         let itemContents = { me: [], them: [] };

         for(let [category, set] in Object.entries(this.matchResultsList[profile1][profile2].results)) {
            let [itemType, rarity, appid] = category.split('_');
            let tracker = Array(set.length).fill(0);

            for(let i=0; i<set.history.length; i++) {
               // Add assets based on the swap history order
               // NOTE: need to deal with swapping back and forth of same items
               // IDEA: if tracker is positive/negative and the asset will decrease the tracker amount, find last asset of that item added on the opposite side and replace with the item to be swapped with
               // CONCERN: This messes up the historical order of the item swaps, may cause some unintended consequences
            }
         }
      }

      let generateTradeOfferContents = (profile1, profile2, reverse=true) => {
         let getAssets = (appid, contextid, item, amount, reverse=true) => {
            let itemList = [];
            let amt = 0;
            let assetIndex= reverse ? item.tradables.length-1 : 0;
            while(amt<amount) {
               if(assetIndex<0 || assetIndex>=item.tradables.length) {
                  console.warn(`generateTradeOfferContents(): Not enough tradable assets for class ${item.classid} of app ${appid}!`);
                  return undefined;
               }

               let amountToAdd = item.tradables[assetIndex].count<(amount-amt) ? item.tradables[assetIndex].count : amount-amt;
               // might need to stringify a couple of values for consistency
               itemList.push({ appid: appid, contextid: contextid, amount: amountToAdd, assetid: item.tradables[assetIndex].assetid });

               amt += amountToAdd;
               assetIndex += reverse ? -1 : 1;
            }

            return itemList;
         }

         let itemContents = { me: [], them: [] };
         let inv1 = this.matchResultsList[profile1][profile2].inventory1.data;
         let inv2 = this.matchResultsList[profile1][profile2].inventory2.data;

         for(let [category, set] of Object.entries(this.matchResultsList[profile1][profile2].results)) { // figure out a way to generate filtered item list
            if(typeof set !== "object" || set.isValid === false || !set.swap.some(x => x)) {
               continue;
            }
            let [itemType, rarity, appid] = category.split('_');
            let swapAssets = { me: [], them: [] };
            let invalid = false;

            for(let swapIndex=0; swapIndex<set.swap.length; swapIndex++) {
               let swapTotal = set.swap[swapIndex];
               let assets, side;
               if(swapTotal === 0) {
                  continue;
               } else if(swapTotal < 0) {
                  if( !(assets = getAssets(753, 6, inv1[itemType][rarity][appid][swapIndex], -swapTotal)) ) { // hardcoded for now, should be changed to make more flexible
                     invalid = true;
                     break;
                  }
                  side = "me";
               } else if(swapTotal > 0) {
                  if( !(assets = getAssets(753, 6, inv2[itemType][rarity][appid][swapIndex], swapTotal)) ) { // hardcoded for now, should be changed to make more flexible
                     invalid = true;
                     break;
                  }
                  side = "them";
               }

               swapAssets[side].push(...assets);
            }

            if(!invalid) {
               itemContents.me.push(...swapAssets.me);
               itemContents.them.push(...swapAssets.them);
            }
         }

         return {
            newversion: true,
            version: itemContents.me.length + itemContents.them.length + 1,
            me: {
               assets: itemContents.me,
               currecy: [],
               ready: false
            },
            them: {
               assets: itemContents.them,
               currecy: [],
               ready: false
            }
         }
      }

      // figure out a good way to include game trade post params as a way to send trade offers
      let generateTradeOfferCreateParams = async (profile1, profile2) => {
         // preliminary checks means profile2 is either friend or has trade token
         return (await profile1.isFriend(profileid2))
            ? {}
            : { trade_offer_access_token: profile2.tradeToken };
      }

      if(typeof profile1 === "string") {
         profile1 = await Profile.findProfile(profile1);
      }
      if(typeof profile2 === "string") {
         profile2 = await Profile.findProfile(profile2);
      }

      if(!this.exists(profile1.id, profile2.id, 3)) {
         return;
      }
      if(!(await profile1.canTrade(profile2))) {
         console.error("generateRequestPayload(): profile2 is not a friend of profile1, or profile2 does not have a trade token. Aborting!");
         return;
      }

      let tradeOfferContents = generateTradeOfferContents(profile1.id, profile2.id, reverse);
      if(tradeOfferContents.version === 1) {
         console.warn("generateRequestPayload(): contents are empty; no items will be traded; payload will not be generated!");
         this.matchResultsList[profile1.id][profile2.id].payload = null;
         return;
      }

      return this.matchResultsList[profile1.id][profile2.id].payload = {
         sessionid: this.utils.getSessionId(),
         serverid: 1,
         partner: profile2.id,
         tradeoffermessage: String(message),
         json_tradeoffer: tradeOfferContents,
         captcha: "",
         trade_offer_create_params: (await generateTradeOfferCreateParams())
      }
   },
   // -1: not nplus, 0: set1 nplus only, 1: set2 nplus only, 2: both nplus
   isASFNeutralPlus: function(profile1, profile2) {
      function calcNeutrality(invSet, matchSet, primary=true) {
         let neutrality = 0;
         let setbefore = invSet.map(x => x.count);
         let setafter = setbefore.map((x, i) => x+(primary ? matchSet.swap[i] : -matchSet.swap[i])).sort((a, b) => a-b);
         setbefore.sort((a, b) => a-b);
         for(let i=0; i<setbefore.length; i++) {
            neutrality += (setafter[i] - setbefore[i]);
            if(neutrality < 0) {
               break;
            }
         }
         return neutrality;
      }

      if(!this.exists(profile1, profile2, 2)) {
         return;
      }

      let {inventory1: { data: inv1 }, inventory2: { data: inv2 }, result} = this.matchResultsList[profile1][profile2];
      for(let [category, set] of Object.entries(result)) {
         let [itemType, rarity, appid] = category.split('_');
         set.asfnplus = -1;

         if(!set.swap.some(x => x) || !set.swap.reduce((a, b) => a+b, 0)) {
            console.warn(`isASFNeutralPlus(): Match result for ${category} doesn't qualify!`);
            continue;
         }

         if(!inv1[itemType] || !inv1[itemType][rarity] || !inv1[itemType][rarity][appid] ||
            !inv2[itemType] || !inv2[itemType][rarity] || !inv2[itemType][rarity][appid]) {
            console.warn(`isASFNeutralPlus(): Set ${category} doesn't exist in both profiles! Skipping`);
            continue;
         }

         let neutrality = calcNeutrality(inv1[itemType][rarity][appid], set, true);
         if(neutrality === 0) {
            set.asfnplus = 0;
         } else {
            console.warn(`isASFNeutralPlus(): Neutrality calculation result for set1 of ${category} is ${neutrality}.`);
         }

         neutrality = calcNeutrality(inv2[itemType][rarity][appid], set, false);
         if(neutrality === 0) {
            set.asfnplus += 2;
         } else {
            console.warn(`isASFNeutralPlus(): Neutrality calculation result for set2 of ${category} is ${neutrality}.`);
         }
      }
   },
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
            // { name: 'badgepage', id: 'match-badgepage', label: 'My Badge Page', value: false },
            { name: 'custom', id: 'match-user-app-list', label: 'My App List', value: false }
         ]
      }
   },
   lists: {
      matchlist: { label: 'Matchlist', data: [] },
      blacklist: { label: 'Blacklist', data: [] },
      applist: { label: 'Apps', data: [] }
   },
   currentTab: 'matchlist'
};
const MatcherConfigShortcuts = {};

async function gotoMatcherConfigPage() {
   const generateConfigHeaderString = (title) => `<div class="matcher-config-header"><span>${title}</span></div>`;
   const generateConfigButtonString = (id, label) => `<div class="matcher-config-option"><input type="checkbox" class="button" id="${id}"><label for="${id}">${label}</label></div>`;
   const generateConfigButtonsString = (checkList) => checkList.map(x => generateConfigButtonString(x.id, x.label)).join('');
   const generateConfigButtonGroupString = () => Object.values(globalSettings.matcher.config).map(x => {
      return `<div class="matcher-config-group" data-id="${x.id}">${generateConfigHeaderString(x.label)}${generateConfigButtonsString(x.options)}</div>`
   }).join('');
   const generateConfigListTabs = (list) => {
      let HTMLString = '';
      for(let listGroup in list) {
         HTMLString += `<div class="matcher-conf-list-tab" data-list-name="${listGroup}">${list[listGroup].label}</div>`;
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

   MatcherConfigShortcuts.MAIN_ELEM = document.querySelector('#responsive_page_template_content');

   if(!MatcherConfigShortcuts.MAIN_ELEM) {
      alert('Main element no found, Matcher Configuration will not be set up');
      console.warn('gotoMatcherConfigPage(): Main element no found, Matcher Configuration will not be set up!');
      return;
   }

   // set up css styles for this feature
   GM_addStyle(cssMatcher);

   MatcherConfigShortcuts.MAIN_ELEM.innerHTML = '';
   document.body.classList.remove('profile_page'); // profile page causes bg color to be black

   let config = await SteamToolsDbManager.getToolConfig('matcher');
   if(config.matcher) {
      globalSettings.matcher = config.matcher;
   } else {
      globalSettings.matcher = steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.matcher);
   }

   let matcherConfigHTMLString = '<svg class="solid-clr-filters">'
   +    '<filter id="filter-red" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0.8   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-red-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   1   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-green" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0.8   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-green-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   1   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   0.8   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-blue-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   1   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-steam-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0.77   0 0 0 0   0.76   0 0 0 0   0.75   0 0 0 1   0" />'
   +    '</filter>'
   + '</svg>'
   + '<div class="matcher-config">'
   +    '<div class="matcher-config-title"><span>Matcher Configuration</span></div>'
   +    '<div class="matcher-options">'
   +       generateConfigButtonGroupString()
   +       '<div class="matcher-config-group">'
   +          '<div class="matcher-config-header">'
   +             '<span>Configuration Settings</span>'
   +          '</div>'
   +          '<div class="matcher-config-btn-group">'
   +             '<button id="matcher-config-import" class="blue">Import Settings</button>'
   +             '<button id="matcher-config-export" class="blue">Export Settings</button>'
   +          '</div>'
   +          '<div class="matcher-config-btn-group right">'
   +             '<button id="matcher-config-reset" class="blue">Reload Settings</button>'
   +             '<button id="matcher-config-save" class="green">Save Settings</button>'
   +          '</div>'
   +       '</div>'
   +       '<div class="matcher-config-actions">'
   +          '<div class="matcher-config-action">'
   +             '<button id="matcher-config-match-full" class="purple max">Full Match</button>'
   +          '</div>'
   +          '<div class="h-break">OR</div>'
   +          '<div class="matcher-config-action">'
   +             '<input type="text" name="match-profileid" id="match-single-profileid" placeholder="profileid/customUrlId">'
   +             '<button id="matcher-config-match-one" class="purple">Match</button>'
   +          '</div>'
   +       '</div>'
   +    '</div>'
   +    '<div class="matcher-conf-list">'
   +       '<div class="matcher-conf-list-header">'
   +          generateConfigListTabs(globalSettings.matcher.lists)
   +       '</div>'
   +       '<div class="conf-list-entry-action add">'
   +          '<div class="conf-list-entry-action-add">'
   +             '<div id="entry-action-add"></div>'
   +          '</div>'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div id="entry-action-del"></div>'
   +             '<div id="entry-action-edit"></div>'
   +          '</div>'
   +          '<div class="conf-list-entry-action-disabled"></div>'
   +       '</div>'
   +       '<div class="matcher-conf-list-list">'
   +          '<div class="conf-list-entry-form-container">'
   +             '<div class="conf-list-entry-form">'
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
   +                   '<button id="conf-list-dialog-cancel" class="red wide">No</button>'
   +                   '<button id="conf-list-dialog-confirm" class="green wide">Yes</button>'
   +                '</div>'
   +             '</div>'
   +          '</div>'
   +          '<div class="matcher-conf-list-entries custom-scroll">'
   +             generateConfigListGroups(globalSettings.matcher.lists)
   +          '</div>'
   +       '</div>'
   +    '</div>'
   + '</div>';

   MatcherConfigShortcuts.MAIN_ELEM.insertAdjacentHTML("afterbegin", matcherConfigHTMLString);

   for(let buttonGroup of MatcherConfigShortcuts.MAIN_ELEM.querySelectorAll('.matcher-config-group')) {
      buttonGroup.addEventListener('change', matcherConfigUpdateChecklistListener);
   }
   document.getElementById('matcher-config-import').addEventListener('click', matcherConfigImportListener);
   document.getElementById('matcher-config-export').addEventListener('click', matcherConfigExportListener);
   document.getElementById('matcher-config-reset').addEventListener('click', matcherConfigLoadListener);
   document.getElementById('matcher-config-save').addEventListener('click', matcherConfigSaveListener);
   MatcherConfigShortcuts.MAIN_ELEM.querySelector('.matcher-conf-list-header').addEventListener('click', matcherConfigSelectListTabListener);
   document.getElementById('entry-action-add').addEventListener('click', matcherConfigAddListEntryListener);
   document.getElementById('entry-action-edit').addEventListener('click', matcherConfigEditListEntryListener);
   document.getElementById('entry-action-del').addEventListener('click', matcherConfigDeleteListEntryListener);
   MatcherConfigShortcuts.MAIN_ELEM.querySelector('.matcher-conf-list-entries').addEventListener('click', matcherConfigSelectListEntryListener);
   document.getElementById('conf-list-dialog-cancel').addEventListener('click', matcherConfigListDialogCancelListener);
   document.getElementById('conf-list-dialog-confirm').addEventListener('click', matcherConfigListDialogConfirmListener);
   document.getElementById('matcher-config-match-full').addEventListener('click', matcherConfigFullMatchListener);
   document.getElementById('matcher-config-match-one').addEventListener('click', matcherConfigSingleMatchListener);
   // apply event listeners to go onto other actions like default matching, single account matching, input trade url links to add trade tokens, etc

   MatcherConfigShortcuts.listActionBarElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-action');
   MatcherConfigShortcuts.listFormContainerElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-form-container');
   MatcherConfigShortcuts.listOverlayElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-overlay');
   MatcherConfigShortcuts.listDialogElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-dialog');
   MatcherConfigShortcuts.listElems = {};
   for(let entryGroup in globalSettings.matcher.lists) {
      MatcherConfigShortcuts.listElems[entryGroup] = MatcherConfigShortcuts.MAIN_ELEM.querySelector(`.matcher-conf-list-entry-group[data-list-name=${entryGroup}]`);
   }

   matcherConfigLoadUI();
}

async function matcherConfigLoadUI() {
   MatcherConfigShortcuts.listOverlayElem.classList.add('active');

   const configMenuElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.matcher-config');
   if(!configMenuElem) {
      console.warn('updateMatcherConfigUI(): Config menu not found, UI will not be updated');
      return;
   }

   for(let optionGroup of Object.values(globalSettings.matcher.config)) {
      for(let option of optionGroup.options) {
         document.getElementById(option.id).checked = option.value;
      }
   }

   // generate lists
   for(let [listName, listGroup] of Object.entries(globalSettings.matcher.lists)) {
      let entryGroupElem = MatcherConfigShortcuts.listElems[listName];
      let entriesHTMLString = [];
      for(let data of listGroup.data) {
         if(listName === 'matchlist' || listName === 'blacklist') {
            let profile = await Profile.findProfile(data.profileid);
            if(!profile) {
               console.warn('matcherConfigLoadUI(): No profile found, skipping this entry...');
            }

            let tradeTokenWarning = listName === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
            let entryHTMLString = `<div class="matcher-conf-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
            +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar offline">`
            +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
            +    '</a>'
            +    `<div class="conf-list-entry-name" title="${profile.name}" >${profile.name}</div>`
            +    `<div class="conf-list-entry-descript">${data.descript}</div>`
            + '</div>';

            entriesHTMLString.push({key1: profile.id, key2: null, string: entryHTMLString});
         } else if(listName === 'applist') {
            let entryHTMLString;
            let appdata = await Profile.findAppMetaData(data.appid);
            if(!appdata) {
               entryHTMLString = `<div class="matcher-conf-list-entry" data-appid="${data.appid}" data-name="">`
               +    '<a class="app-header"></a>'
               +    `<div class="conf-list-entry-profile">${data.appid}</div>`
               +    `<div class="conf-list-entry-descript">${data.descript}</div>`
               + '</div>';
            } else {
               entryHTMLString = `<div class="matcher-conf-list-entry" data-appid="${appdata.appid}" data-name="${appdata.name}">`
               +    `<a href="https://steamcommunity.com/my/gamecards/${appdata.appid}}/" target="_blank" rel="noopener noreferrer" class="app-header">`
               +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
               +    '</a>'
               +    `<div class="conf-list-entry-name">${appdata.name}</div>`
               +    `<div class="conf-list-entry-descript">${data.descript}</div>`
               + '</div>';
            }


            entriesHTMLString.push({key1: appdata?.name ?? '', key2: data.appid, string: entryHTMLString});
         } else {
            console.warn('matcherConfigLoadUI(): HTML generation for a list not implemented, that list will be empty!');
            break;
         }
      }

      if(listName === 'applist') {
         entriesHTMLString.sort((a, b) => a.key1==='' ? a.key2-b.key2 : a.key1-b.key1);
      }

      entryGroupElem.insertAdjacentHTML('afterbegin', entriesHTMLString.reduce((str, entry) => str+entry.string, ''));
   }

   // set active tab
   if(globalSettings.matcher.currentTab) {
      MatcherConfigShortcuts.MAIN_ELEM.querySelector(`.matcher-conf-list-tab[data-list-name=${globalSettings.matcher.currentTab}]`).classList.add('active');
      matcherConfigShowActiveList();
   }

   matcherConfigResetEntryForm();

   MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
}

function matcherConfigSetEntryActionBar(actionBarName) {
   let listActionElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-action');
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

   event.currentTarget.querySelector(`.matcher-conf-list-tab.active`)?.classList.remove('active');
   event.target.classList.add('active');
   globalSettings.matcher.currentTab = event.target.dataset.listName;

   if(MatcherConfigShortcuts.selectedListEntryElem) {
      MatcherConfigShortcuts.selectedListEntryElem.classList.remove('selected');
      MatcherConfigShortcuts.selectedListEntryElem = undefined;

      MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
      matcherConfigResetEntryForm();
      matcherConfigSetEntryActionBar('add');
   }

   matcherConfigResetEntryForm();
   matcherConfigShowActiveList();
}

function matcherConfigResetEntryForm() {
   let currentTab = globalSettings.matcher.currentTab;

   let entryFormElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-form');
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
      entryFormElem.insertAdjacentHTML('beforeend', entryFormActionHTMLString);
      document.getElementById('conf-list-entry-form-cancel').addEventListener('click', matcherConfigEntryFormCancelListener);
      document.getElementById('conf-list-entry-form-add').addEventListener('click', matcherConfigEntryFormAddListener);

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
   for(let listGroup of MatcherConfigShortcuts.MAIN_ELEM.querySelectorAll(`.matcher-conf-list-entry-group`)) {
      if(currentTab !== listGroup.dataset.listName) {
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
   if(!entryElem.matches('.matcher-conf-list-entry')) {
      return;
   }

   matcherConfigSelectListEntry(entryElem);
}

function matcherConfigSelectListEntry(entryElem, toggle=true) {
   if(!entryElem.classList.contains('selected')) {
      if(MatcherConfigShortcuts.selectedListEntryElem) {
         MatcherConfigShortcuts.selectedListEntryElem.classList.remove('selected');
      }

      MatcherConfigShortcuts.selectedListEntryElem = entryElem;
      entryElem.classList.add('selected');
      matcherConfigSetEntryActionBar('modify');
   } else if(toggle) {
      entryElem.classList.remove('selected');
      MatcherConfigShortcuts.selectedListEntryElem = undefined;

      matcherConfigResetEntryForm();
      matcherConfigSetEntryActionBar('add');
   }
}

// needs testing
function matcherConfigUpdateChecklistListener(event) {
   console.log(event.currentTarget); // debugging
   if(!event.target.matches('input')) {
      return;
   }
   let groupId = event.currentTarget.dataset.id;
   let optionId = event.target.id;

   for(let group of Object.values(globalSettings.matcher.config)) {
      if(group.id === groupId) {
         group.options.find(x => x.id === optionId).value = event.target.checked;
      }
   }
}

// add new config list entry, populated input values persist when form is minimized
function matcherConfigAddListEntryListener(event) {
   MatcherConfigShortcuts.listFormContainerElem.classList.toggle('active');
}

// modify selected HTML that is selected
function matcherConfigEditListEntryListener(event) {
   /* edit selected entry, prefilled with selected entry info */
   let currentTab = globalSettings.matcher.currentTab;
   if(MatcherConfigShortcuts.listFormContainerElem.matches('.active')) {
      MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
      return;
   }

   if(!MatcherConfigShortcuts.selectedListEntryElem) {
      console.log('matcherConfigEditListEntryListener(): No entry selected, nothing can be edited...');
      return;
   }

   if(currentTab === 'matchlist' || currentTab === 'blacklist') {
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.profileid;
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
   } else if(currentTab === 'applist') {
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
   } else {
      console.warn('matcherConfigEditListEntryListener(): Entry edit prefill not implemented, form will not be prefilled!');
      return;
   }

   MatcherConfigShortcuts.listFormContainerElem.classList.add('active');
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
      let selectedIndex = globalSettings.matcher.lists[listGroup].data.findIndex(x => x.profileid === profileid);
      if(selectedIndex === -1) {
         console.warn('matcherConfigDeleteListEntryListener(): Profileid not found, which means list and data are not synced!');
         return;
      }
      globalSettings.matcher.lists[listGroup].data.splice(selectedIndex, 1);
      MatcherConfigShortcuts.selectedListEntryElem.remove();
      MatcherConfigShortcuts.selectedListEntryElem = undefined;
      matcherConfigSetEntryActionBar('add');
   } else if(listGroup === 'applist') {
      let appid = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
      let selectedIndex = globalSettings.matcher.lists[listGroup].data.findIndex(x => x.appid === appid);
      if(selectedIndex === -1) {
         console.warn('matcherConfigDeleteListEntryListener(): Appid not found, which means list and data are not synced!');
         return;
      }
      globalSettings.matcher.lists[listGroup].data.splice(selectedIndex, 1);
      MatcherConfigShortcuts.selectedListEntryElem.remove();
      MatcherConfigShortcuts.selectedListEntryElem = undefined;
      matcherConfigSetEntryActionBar('add');
   } else {
      console.warn('matcherConfigDeleteListEntryListener(): List deletion not implemented, nothing will be changed!');
   }
}

async function matcherConfigEntryFormAddListener(event) {
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
         let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-profileid="${profileEntry.profileid}"]`);
         MatcherConfigShortcuts.entryEditOld = profileEntry;
         MatcherConfigShortcuts.entryEditNew = { descript: description };
         matcherConfigSelectListEntry(selectedEntryElem, false);
         document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
         document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
         document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
         MatcherConfigShortcuts.listDialogElem.classList.add('active');
         return;
      } else {
         let profile = await Profile.findProfile(profileValue);
         if(profile) {
            profileEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.profileid === profile.id);
            if(profileEntry) {
               // app found: prompt user if they want to overwrite existing data
               let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-profileid="${profileEntry.profileid}"]`);
               MatcherConfigShortcuts.entryEditOld = profileEntry;
               MatcherConfigShortcuts.entryEditNew = { descript: description };
               matcherConfigSelectListEntry(selectedEntryElem, false);
               document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
               document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
               document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
               MatcherConfigShortcuts.listDialogElem.classList.add('active');
               return;
            } else {
               let entryGroupElem = MatcherConfigShortcuts.listElems[currentTab];
               let tradeTokenWarning = currentTab === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
               let entryHTMLString = `<div class="matcher-conf-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
               +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar offline">`
               +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
               +    '</a>'
               +    `<div class="conf-list-entry-name" title="${profile.name}" >${profile.name}</div>`
               +    `<div class="conf-list-entry-descript">${description}</div>`
               + '</div>';

               entryGroupElem.insertAdjacentHTML('afterbegin', entryHTMLString);
               globalSettings.matcher.lists[currentTab].data.push({ profileid: profile.id, descript: description });
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
         let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.matcher-conf-list-entry[data-appid="${appidEntry.appid}"]`);
         MatcherConfigShortcuts.entryEditOld = appidEntry;
         MatcherConfigShortcuts.entryEditNew = { descript: description };
         matcherConfigSelectListEntry(selectedEntryElem, false);
         document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
         document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
         document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
         MatcherConfigShortcuts.listDialogElem.classList.add('active');
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
            +    `<a href="https://steamcommunity.com/my/gamecards/${appdata.appid}}/" target="_blank" rel="noopener noreferrer" class="app-header">`
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
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = '';
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = '';
   } else if(currentTab === 'applist') {
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = '';
      MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = '';
   } else {
      console.warn('matcherConfigEntryFormCancelListener(): Entry form cancel not implemented, form will not be cleared!');
   }

   MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
}

function matcherConfigListDialogCancelListener(event) {
   MatcherConfigShortcuts.listDialogElem.classList.remove('active');
   document.getElementById('conf-list-entry-old').innerHTML = '';
   document.getElementById('conf-list-entry-new').innerHTML = '';
   MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
   MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
   //MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
   MatcherConfigShortcuts.entryEditOld = undefined;
   MatcherConfigShortcuts.entryEditNew = undefined;
}

function matcherConfigListDialogConfirmListener(event) {
   Object.assign(MatcherConfigShortcuts.entryEditOld, MatcherConfigShortcuts.entryEditNew);
   MatcherConfigShortcuts.selectedListEntryElem.innerHTML = document.getElementById('conf-list-entry-new').innerHTML;
   MatcherConfigShortcuts.listDialogElem.classList.remove('active');
   document.getElementById('conf-list-entry-old').innerHTML = '';
   document.getElementById('conf-list-entry-new').innerHTML = '';
   MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
   MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
   MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
   matcherConfigResetEntryForm();
   MatcherConfigShortcuts.entryEditOld = undefined;
   MatcherConfigShortcuts.entryEditNew = undefined;
}

async function matcherConfigImportListener() {
   await importConfig('matcher');
   matcherConfigLoadUI();
}

async function matcherConfigExportListener() {
   exportConfig('matcher', 'SteamMatcherConfig');
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

function matcherConfigFullMatchListener() {
   console.warn('matcherConfigFullMatchListener(): Not Implemented Yet!');

   // check if settings are the same in db, prompt user to save if they want
   // generate matcher page with a loading animation
   // defer to an in-progress matching function
}

async function matcherConfigSingleMatchListener() {
   // verify that the provided profileid/customurl is valid, cancel if invalid
   // check if settings are the same in db, prompt user to save if they want
   // generate matcher page with a loading animation
   // defer to an in-progress matching function
   MatcherConfigShortcuts.configMenu.classList.add('overlay');
   MatcherConfigShortcuts.matchSingleProfileProfileid.value = MatcherConfigShortcuts.matchSingleProfileProfileid.value.trim();
   let profile = await Profile.findProfile(MatcherConfigShortcuts.matchSingleProfileProfileid.value);
   if( !profile || (await profile.isMe()) ) {
      alert('Invalid profile!');
      MatcherConfigShortcuts.configMenu.classList.remove('overlay');
      return;
   }

   let savedConfig = await SteamToolsDbManager.getToolConfig('matcher');
   if(JSON.stringify(globalSettings.matcher) !== JSON.stringify(savedConfig.matcher)) {
      let userPrompt = prompt('WARNING: Settings have not been saved! Save now? (y/n/cancel)');
      if(!userPrompt[0].localeCompare('y', 'en', { sensitivity: 'base' })) {
         await SteamToolsDbManager.setToolConfig('matcher');
         console.log('matcherConfigSingleMatchListener(): Saved Settings. Continuing to matching process...');
      } else if(!userPrompt[0].localeCompare('n', 'en', { sensitivity: 'base' })) {
         console.log('matcherConfigSingleMatchListener(): Settings will not be saved. Continuing to matching process...');
      } else if(!userPrompt[0].localeCompare('c', 'en', { sensitivity: 'base' })) {
         console.log('matcherConfigSingleMatchListener(): Cancelled. Matching will not continue...');
         MatcherConfigShortcuts.configMenu.classList.remove('overlay');
         return;
      } else {
         console.log('matcherConfigSingleMatchListener(): Invalid input. Matching will not continue...');
         MatcherConfigShortcuts.configMenu.classList.remove('overlay');
         return;
      }
   }

   await matcherStartMatching(profile);
}

async function matcherStartMatching(profile) {
   const generateMatchGroupString = (groupName) => `<div class="match-group" data-group="${groupName}"></div>`;
   const generateMatchNameHeaderString = (profile, reverseDirection=false) => {
      return `<div class="match-name${reverseDirection?' align-right':''}">`
      +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}/` : `profiles/${profile.id}/`}" class="avatar ${profile.getStateString()}">`
      +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
      +    '</a>'
      +    profile.name
      + '</div>'
   };
   const generateMatchContainerString = (profile1, profile2) => {
      return '<div class="match-container-outer loading">'
      +    `<div class="match-container grid" data-profileid1="${profile1.id}" data-profileid2="${profile2.id}">`
      +       '<div class="match-header">'
      +          generateMatchNameHeaderString(profile1, true)
      +          '<div class="match-item-action trade"></div>'
      +          generateMatchNameHeaderString(profile2)
      +       '</div>'
      +    '</div>'
      +    '<div class="userscript-overlay">'
      +       '<div class="userscript-throbber">'
      +          '<div class="throbber-bar"></div><div class="throbber-bar"></div><div class="throbber-bar"></div>'
      +       '</div>'
      +    '</div>'
      + '</div>'
   };

   GM_addStyle(cssMatcher);

   console.warn('matcherStartMatching(): Not Implemented Yet!');
   // UI setup (remove tool supernav)
   Object.keys(MatcherConfigShortcuts).forEach(key => (key === 'MAIN_ELEM') || delete MatcherConfigShortcuts[key]);
   MatcherConfigShortcuts.MAIN_ELEM.innerHTML = '<div class="match-results">'
   + '</div>';

   addColorFilterSvg(MatcherConfigShortcuts.MAIN_ELEM);

   MatcherConfigShortcuts.results = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.match-results');
   MatcherConfigShortcuts.resultGroups = {};

   if(!Profile.me) {
      await Profile.addNewProfile(steamToolsUtils.getMySteamId());
   }

   if(profile) {
      MatcherConfigShortcuts.results.insertAdjacentHTML('beforeend', generateMatchGroupString('single'));
      MatcherConfigShortcuts.resultGroups.single = MatcherConfigShortcuts.results.querySelector('[data-group="single"]');
      MatcherConfigShortcuts.resultGroups.single.insertAdjacentHTML('beforeend', generateMatchContainerString(Profile.me, profile));

      await matcherMatchProfile();

      let emptyContainer = MatcherConfigShortcuts.resultGroups.single.querySelector('.match-container-outer.loading');
      if(emptyContainer) {
         emptyContainer.remove();
      }
   }

   // friend group matching
   //    generate match block on document
   //    check against blacklist
   //    begin matching (no trade token is necessary)
   // asf group matching
   //    generate match block on document
   //    grab asf profile from the asf api if needed
   //    check for any/fair group selection from config
   //    check against blacklist
   //    find asf profiles and add their trade tokens as well
   //    begin matching (trade token should already be auto added from the asf data)
   // custom list
   //    generate match block on document
   //    check against blacklist
   //    begin matching (trade token should be provided by the user)

   // finish matching process here
}

async function matcherMatchProfile() {
   const generateItemTypeContainerString = (itemType) => `<div class="match-item-type" data-type="${itemType}"></div>`;
   const generateRarityContainerString = (rarity) => `<div class="match-item-rarity" data-rarity="${rarity}"></div>`;
   const generateAppContainerString = (appid) => `<div class="match-item-app" data-appid="${appid}"></div>`;
   const generateItemListContainerString = (itemType, rarity, appid, swapList) => {
      return '<div class="match-item-list left">'
      +    generateAppItemsString(itemType, rarity, appid, swapList, true)
      + '</div>'
      + '<div class="match-item-action trade"></div>'
      + '<div class="match-item-list right">'
      +    generateAppItemsString(itemType, rarity, appid, swapList, false)
      + '</div>';
   };
   const generateAppItemsString = (itemType, rarity, appid, swapList, leftSide=true) => {
      const getClassid = (index) => matchResult.inventory1.data[itemType][rarity][appid][index].classid;
      const generateAppItemString = (qty, i) => {
         let itemClassid = getClassid(i);
         let itemDescription = Profile.itemDescriptions[itemClassid];
         return `<div class="match-item" data-classid="${itemClassid}" data-qty="${Math.abs(qty)}" title="${itemDescription.name}">`
         +    `<img src="${'https://community.cloudflare.steamstatic.com/economy/image/'+itemDescription.icon_url+'/96fx96f?allow_animated=1'}" alt="${itemDescription.name}">`
         +    `<div class="match-item-name">${itemDescription.name}</div>`
         + '</div>';
      };

      return swapList.map((swapAmount, index) =>
         leftSide ? (swapAmount<0 ? generateAppItemString(swapAmount, index) : '') : (swapAmount>0 ? generateAppItemString(swapAmount, index) : '')
      ).join('');
   }

   let shortcuts = {};
   let loadingContainer = MatcherConfigShortcuts.results.querySelector('.match-container-outer.loading > .match-container');
   if(!loadingContainer) {
      console.warn('matcherMatchProfile(): No loading container found!');
      return;
   }

   let matchResult = await Matcher.matchInv(loadingContainer.dataset.profileid1, loadingContainer.dataset.profileid2);
   if(!matchResult || steamToolsUtils.isEmptyObject(matchResult.results)) {
      console.warn('matcherMatchProfile(): No results to be rendered');
      return;
   }

   for(let result in matchResult.results) {
      let [itemType, rarity, appid] = result.split('_');

      shortcuts[itemType] ??= { elem: null, rarities: {} };
      if(!shortcuts[itemType].elem) {
         loadingContainer.insertAdjacentHTML('beforeend', generateItemTypeContainerString(itemType));
         shortcuts[itemType].elem = loadingContainer.querySelector(`[data-type="${itemType}"]`);
      }
      shortcuts[itemType].rarities[rarity] ??= { elem: null, appids: {} };
      if(!shortcuts[itemType].rarities[rarity].elem) {
         shortcuts[itemType].elem.insertAdjacentHTML('beforeend', generateRarityContainerString(rarity));
         shortcuts[itemType].rarities[rarity].elem = shortcuts[itemType].elem.querySelector(`[data-rarity="${rarity}"]`);
      }
      shortcuts[itemType].rarities[rarity].appids[appid] ??= { elem: null };
      if(!shortcuts[itemType].rarities[rarity].appids[appid].elem) {
         shortcuts[itemType].rarities[rarity].elem.insertAdjacentHTML('beforeend', generateAppContainerString(appid));
         shortcuts[itemType].rarities[rarity].appids[appid].elem = shortcuts[itemType].rarities[rarity].elem.querySelector(`[data-appid="${appid}"]`);
      }
      shortcuts[itemType].rarities[rarity].appids[appid].elem.insertAdjacentHTML('beforeend', generateItemListContainerString(itemType, rarity, appid, matchResult.results[result].swap));
   }

   console.log(matchResult);
   console.log(Profile.itemDescriptions)


   loadingContainer.parentElement.classList.remove('loading');
}
/************************************************/
/*************** Item Matcher END ***************/
/************************************************/

/************************************************/
/**************** Scrapers BEGIN ****************/
/************************************************/
const DataCollectors = {};
DataCollectors.scrapePage = async function() {
   const SCRAPER_LUT = [
      { regex: /^\/(id|profiles)\/[^/]+\/?$/, fnName: 'scrapeProfileData' },
      { regex: /^\/(id|profiles)\/[^/]+\/gamecards\/\d+\/?$/, fnName: 'scrapeBadgepage' },
      { regex: /^\/market\/listings\/\d+\/[^/]+\/?$/, fnName: 'scrapeItemNameId' }
   ];

   await this.scrapeTradeTokens();

   for(let scraperEntry of SCRAPER_LUT) {
      if(scraperEntry.regex.test(window.location.pathname)) {
         console.log('detected valid scraping target')
         await this[scraperEntry.fnName]();
      }
   }
}
DataCollectors.scrapeProfileData = async function() {
   console.log('scraping profile data')
   if(!/^\/(id|profiles)\/[^/]+\/?$/.test( window.location.pathname)) {
      return;
   }

   let profileData = steamToolsUtils.deepClone(unsafeWindow.g_rgProfileData);
   let profile = await SteamToolsDbManager.getProfiles(profileData.steamid);
   profile = profile[profileData.steamid] ?? {};

   profile.id ??= profileData.steamid;

   profileData.url = profileData.url.replace(/https:\/\/steamcommunity\.com\//g, '');
   switch(true) {
      case profileData.url.startsWith('id'):
         profile.url = profileData.url.replace(/(^id\/)|(\/$)/g, '');
      case profileData.url.startsWith('profiles'): // assuming no customURL if url uses profileid
         profile.name = profileData.personaname;
         if(profile.pastNames && Array.isArray(profile.pastNames) && profile.pastNames[length-1] !== profile.name) {
            profile.pastNames.push(profile.name);
         }
         break;
      default:
         console.warn(`findMoreDataForProfile(): ${JSON.stringify(profileData)} is neither id or custom URL, investigate!`);
         break;
   }

   profileData = document.querySelector('.profile_header .playerAvatar');
   profile.pfp = profileData.querySelector('img').src.replace(/(https:\/\/avatars\.akamai\.steamstatic\.com\/)|(_full\.jpg)/g, '');
   profile.state = profileData.classList.contains("in-game")
      ? 2 : profileData.classList.contains("online")
      ? 1 : profileData.classList.contains("offline")
      ? 0 : null;

   profile.last_updated = Date.now();

   await SteamToolsDbManager.setProfile(profile);
}
DataCollectors.scrapeBadgepage = async function() {
   console.log('scraping badgepage data')

   let appid = window.location.pathname
      .replace(/^\/(id|profiles)\/[^/]+\/gamecards\//, '')
      .match(/^\d+/);
   if(!appid || appid.length>1) {
      console.warn('scrapeItemNameId(): No appid found, or multiple appids found, investigate!');
      return;
   }
   appid = parseInt(appid);

   if(document.querySelector('.profile_fatalerror')) {
      return;
   }

   let savedData = await SteamToolsDbManager.getAppDatas(appid);
   savedData = savedData[appid] ?? { appid: appid, badges: { normal: {}, foil: {} }, cards: [] };

   let isFoil = window.location.search.includes("border=1");

   savedData.name ??= document.querySelector('a.whiteLink:nth-child(5)').textContent;

   let level = document.querySelector('.badge_info_description :nth-child(2)')?.textContent.trim().match(/\d+/g)[0];
   if(level && !savedData.badges[isFoil?'foil':'normal'][level]) {
      let badgeImg = document.querySelector('.badge_icon');
      badgeImg = badgeImg ? badgeImg.src.replace('https://cdn.akamai.steamstatic.com/steamcommunity/public/images/items/', '') : undefined;
      savedData.badges[isFoil?'foil':'normal'][level] = badgeImg.replace(/^\d+\//, '').replace('.png', '');
   }

   let cardStock = [];
   for(let [index, cardEntry] of document.querySelectorAll('.badge_card_set_card').entries()) {
      cardStock[index] = cardEntry.children[1].childNodes.length === 5 ? parseInt(cardEntry.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
      savedData.cards[index] ??= {};
      savedData.cards[index].name = cardEntry.children[1].childNodes[cardEntry.children[1].childNodes.length-3].textContent.trim();
      savedData.cards[index][`img_card${isFoil?1:0}`] ??= cardEntry.children[0].querySelector('.gamecard').src.replace(/https:\/\/community\.(cloudflare|akamai)\.steamstatic.com\/economy\/image\//g, '');
      if(!savedData.cards[index][`img_full${isFoil?1:0}`]) {
         let img_full = cardEntry.querySelector('.with_zoom');
         if(img_full) {
            img_full = img_full.outerHTML.match(/onclick="[^"]+"/g)[0];
            img_full = img_full.replaceAll('&quot;', '"');
            img_full = img_full.match(/[^/]+\.jpg/g)[0];
            img_full = img_full.replace('.jpg', '');
            savedData.cards[index][`img_full${isFoil?1:0}`] = img_full;
         }
      }
   }

   console.log(savedData);
   await SteamToolsDbManager.setAppData(savedData);
}
DataCollectors.scrapeItemNameId = async function() {
   console.log('scraping item nameid data')

   let pathhashname = window.location.pathname
      .replace(/^\/market\/listings\//, '')
      .match(/^d+\/[^/]+/);
   if(!pathhashname || pathhashname.length>1) {
      console.warn('scrapeItemNameId(): No hashname found, or multiple hashnamess found, investigate!');
      return;
   }

   let itemNameId = document.body.querySelector('.responsive_page_template_content > script:last-of-type').textContent
      .match(/Market_LoadOrderSpread\(\s*?\d+\s*?\)/g)
      .match(/\d+/);
   if(!itemNameId || itemNameId.length!==2) {
      console.warn('scrapeItemNameId(): No id found, or unexpected number of ids found, investigate!');
      return;
   }

   let [hashAppid, hashname] = decodeURIComponent(pathhashname[0]).split('/');
   console.log(hashAppid, hashname, itemNameId[0]);
   await SteamToolsDbManager.setItemNameId(hashAppid, hashname, itemNameId[0]);
}
DataCollectors.scrapeTradeTokens = async function() {
   let tradeURLStrings = document.getElementById('responsive_page_template_content').innerHTML.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d{8}&amp;token=\w{8}/g);
   if(tradeURLStrings) {
      for(let urlString of tradeURLStrings) {
         urlString = urlString.replaceAll('&amp;', '&');
         await Profile.addTradeURL(urlString);
      }
   }
   let tradeObjectStrings = document.getElementById('responsive_page_template_content').innerHTML.match(/ShowTradeOffer\([^{]*?{[^}]*?}[^)]*?\)/g);
   if(tradeObjectStrings) {
      for(let objString of tradeObjectStrings) {
         objString = objString.match(/{[^}]*?}/g)[0].replaceAll('&quot;', '"');
         objString = JSON.parse(objString);
         await Profile.addTradeURL(objString);
      }
   }
}
/************************************************/
/***************** Scrapers END *****************/
/************************************************/

/************************************************/
/**************** Main Functions ****************/
/************************************************/
function addColorFilterSvg(elem) {
   const svgString = '<svg class="solid-clr-filters">'
   +    '<filter id="filter-red" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0.8   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-red-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   1   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-green" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0.8   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-green-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   1   0 0 0 0   0   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   0.8   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-blue-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   1   0 0 0 1   0" />'
   +    '</filter>'
   +    '<filter id="filter-steam-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0.77   0 0 0 0   0.76   0 0 0 0   0.75   0 0 0 1   0" />'
   +    '</filter>'
   +       '<filter id="filter-steam-sky-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +       '<feColorMatrix type="matrix" values="0 0 0 0   0.328   0 0 0 0   0.6445   0 0 0 0   0.828   0 0 0 1   0" />'
   +    '</filter>'
   + '</svg>';

   elem.insertAdjacentHTML('afterbegin', svgString);
}

function generateSuperNav() {
   let navContainer = document.querySelector("#global_header .supernav_container");
   if(!navContainer) {
      return;
   }

   let nextNavHeader = navContainer.querySelector(".submenu_username");
   if(!nextNavHeader) {
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

   nextNavHeader.insertAdjacentElement("afterend", htmlMenu);
   nextNavHeader.insertAdjacentHTML("afterend", htmlStringHeader);

   unsafeWindow.$J(function($) {
      $('#global_header .supernav').v_tooltip({'location':'bottom', 'destroyWhenDone': false, 'tooltipClass': 'supernav_content', 'offsetY':-6, 'offsetX': 1, 'horizontalSnap': 4, 'tooltipParent': '#global_header .supernav_container', 'correctForScreenSize': false});
   });
}

async function main() {
   await SteamToolsDbManager.setup();
   await DataCollectors.scrapePage();

   generateSuperNav();
}

setTimeout(main, 0); // macrotask

/***************************************************/
/****************** CSS Functions ******************/
/***************************************************/
function cssAddOverlay() {
   let innerHTMLString = '';
   let overlayState;
   if(arguments.length>0 && typeof arguments[arguments.length-1] === 'object') {
      overlayState = arguments[arguments.length-1].initialState ?? '';
   } else {
      overlayState = '';
   }

   if(arguments.length>1 || arguments.length===1 && typeof arguments[0]!=='object') {
      for(let i=0; i<arguments.length; i++) {
         if(typeof arguments[i] === 'string') {
            innerHTMLString += arguments[i];
         }
      }
   }

   return `<div class="userscript-overlay ${overlayState}">`
   +    innerHTMLString
   + '</div>';
}
function cssAddThrobber() {
   return '<div class="userscript-throbber">'
   +    '<div class="throbber-bar"></div>'
   +    '<div class="throbber-bar"></div>'
   +    '<div class="throbber-bar"></div>'
   + '</div>';
}

/**************************************************/
/**************************************************/
/******************* CSS Styles *******************/
/**************************************************/
/**************************************************/
const cssGlobal = `.userscript-svg-assets {
   width: 0;
   height: 0;
   position: absolute;
   z-index: -10;
}
.userscript-vars {
   --btn-bg-clr-purple: linear-gradient( to bottom, #6C2DC7 5%, #2E1A47 95%);
   --btn-bg-clr-hvr-purple: linear-gradient( to bottom, #D891EF 5%, #8467D7 95%);
   --btn-clr-purple: lavender;
   --btn-bg-clr-blue: linear-gradient( to bottom, rgba(47,137,188,1) 5%, rgba(23,67,92,1) 95%);
   --btn-bg-clr-hvr-blue: linear-gradient( to bottom, rgba(102,192,244,1) 5%, rgba(47,137,188,1) 95%);
   --btn-clr-blue: #A4D7F5;
   --btn-clr-hvr-blue: white;
   --btn-bg-clr-green: linear-gradient( to bottom, #a4d007 5%, #536904 95%);
   --btn-bg-clr-hvr-green: linear-gradient( to bottom, #b6d908 5%, #80a006 95%);
   --btn-clr-green: #D2E885;
   --btn-clr-hvr-green: white;
   --btn-bg-clr-red: linear-gradient( to bottom, #c03535 5%, #480505 95%);
   --btn-bg-clr-hvr-red: linear-gradient( to bottom, #ff5e5e 5%, #c20000 95%);
   --btn-clr-red: rgb(255, 181, 181);
   --scrollbar-bar-clr: #5e4391;
   --scrollbar-gutter-clr: #e0d4f7;
   --list-bg-clr-purple: #351a77;
}

.userscript-section {
   min-height: 10rem;
}

.userscript-config {
   --config-col: 2;
   --config-col-height: 32rem;
   margin-inline: auto;
   margin-block: 2.5rem;
   padding: 15px;
   /* min-width: 680px; */
   min-width: 775px; /* cap to prevent layout overflow on left side userscript config */
   max-width: 946px;
   background-color: #262627;
   border-left: 1px solid #101010;
   border-right: 1px solid #545454;
   box-shadow: inset 0 -1px 3px #101010;
   display: grid;
   grid-template-columns: repeat(var(--config-col), minmax(0, 1fr));
   grid-template-rows: min-content var(--config-col-height);
   gap: 0.625rem;
   color: #ddd;
}

.disabled,
.overlay {
   position: relative;

   > .userscript-overlay {
      display: flex;
   }
}
.userscript-config-title {
   grid-column: 1/-1;
   font-size: xx-large;
   text-align: center;
}
.userscript-options {
   height: max-content;
   display: inline-flex;
   flex-direction: column;
   gap: 0.5rem;
}
.userscript-config-group {
   padding: 0.375rem;
   border: solid 1px #808080;
}
.userscript-config-option {
   display: inline-block;
   margin-top: 0.375rem;
}
.userscript-config-option ~ .userscript-config-option {
   display: inline-block;
   margin-left: 0.375rem;
}
.userscript-config-btn-group {
   display: inline-flex;
   margin-top: 0.375rem;
   gap: 0.25rem;
}
.userscript-config-btn-group.right {
   float: right;
}

.userscript-config-actions {
   padding: 0.375rem;
}
.userscript-config-action {
   margin-inline: auto;
   text-align: center;

   * ~ * {
      margin-left: 0.375rem;
   }
}
.userscript-overlay {
   display: none;
   background-color: rgba(0, 0, 0, 0.8);
   border-radius: inherit;
   position: absolute;
   top: 0;
   bottom: 0;
   left: 0;
   right: 0;
   flex-direction: column;
   justify-content: center;
   align-items: center;
   z-index: 5;
}

/****** Button Style Toggle Button START ******/
.userscript-config input[type="checkbox"].button {
   opacity: 0;
   position: absolute;
   z-index: -1;
}
.userscript-config input[type="checkbox"].button + label {
   padding: .375rem;
   display: inline-block;
   user-select: none;
   background-color: #111;
   border-radius: 3px;
   color: #969696;
}
.userscript-config input[type="checkbox"].button:active + label:active {
   box-shadow: inset 0 0 0.1875rem 0.125rem rgba(0, 0, 0, 0.2);
   color: #808080;
}
.userscript-config input[type="checkbox"].button:checked:active + label:active {
   /* background: var(--btn-bg-clr-green); */
   box-shadow: inset 0 0 0.1875rem 0.125rem rgba(0, 0, 0, 0.2);
   color: var(--btn-clr-green);
}
.userscript-config input[type="checkbox"].button:checked + label {
   background: var(--btn-bg-clr-purple);
   color: var(--btn-clr-purple);
}
/****** Button Style Toggle Button END ******/

/****** Text Input START ******/
input.userscript-input[type="text"] {
   width: 75%;
   min-width: 15rem;
   max-width: 20rem;
   color: #ddd;
   background-color: rgba(0, 0, 0, 1);
   border: 1px solid #000;
   /* border-radius: 0 0 3px 3px; */
   box-shadow: 1px 1px 0px #1b1b1b;
}

textarea.userscript-input {
   /* width: 85%; */
   padding: 3px;
   color: white;
   background-color: rgba(0, 0, 0, 1);
   border: 1px solid #000;
   /* border-radius: 0 0 3px 3px; */
   box-shadow: 1px 1px 0px #1b1b1b;
   resize: none;
}
/* .userscript-config textarea:focus {
   outline: auto rgba(47,137,188,1);
} */

input.userscript-input[type="number"] {
   width: 4rem;
   color: #ddd;
   background-color: rgba(0, 0, 0, 1);
   border: 1px solid #000;
   box-shadow: 1px 1px 0px #1b1b1b;
   font-size: large;
}
input.userscript-input[type="range"] {
   width: 75%;
}
/****** Text Input END ******/

/****** Custom Scrollbar END ******/
.userscript-custom-scroll {
   scrollbar-width: thin;
   scrollbar-color: var(--scrollbar-bar-clr) transparent;
}
/****** Custom Scrollbar END ******/

/****** Radio Style Toggle Button START ******/
.userscript-config input[type="checkbox"].radio {
   opacity: 0;
   position: absolute;
   z-index: -1;
}
.userscript-config input[type="checkbox"].radio + label {
   display: inline-block;
   user-select: none;
}
.userscript-config input[type="checkbox"].radio + label:before {
   display: inline-block;
   content: "";
   width: 10px;
   height: 10px;
   margin: 3px 3px 3px 4px;
   vertical-align: text-top;
   background: #111;
   border: 0.125rem solid #3a3a3a;
   border-radius: 50%;
}
.userscript-config input[type="checkbox"].radio + label:hover:before,
.userscript-config input[type="checkbox"].radio:checked + label:hover:before {
   background: var(--btn-bg-clr-hvr-purple);
}
.userscript-config input[type="checkbox"].radio + label:active:before,
.userscript-config input[type="checkbox"].radio:active + label:active:before,
.userscript-config input[type="checkbox"].radio:checked + label:before {
   background: var(--btn-bg-clr-purple);
}
/****** Radio Style Toggle Button END ******/

/***** Horizontal rule with text START *****/
.h-break {
   margin-block: 0.25rem;
   overflow: hidden;
   font-size: large;
   text-align: center;
   /* display: block; */
}
.h-break:before,
.h-break:after {
   content: "";
   display: inline-block;
   /* background-color: #808080; */
   background-color: #6C2DC7;
   height: 0.125rem;
   width: 50%;
   position: relative;
   vertical-align: middle;
}
.h-break:before {
   right: 0.5rem;
   margin-left: -50%;
}
.h-break:after {
   left: 0.5rem;
   margin-right: -50%;
}
/****** Horizontal rule with text END ******/

/***** Throbber START *****/
.loading .userscript-throbber {
   display: block;
}
.userscript-throbber {
   margin-inline: auto;
   padding: 1rem;
   display: none;
   width: max-content;
   height: 4.25rem;

   .throbber-bar {
      display: inline-block;
      width: 0.75rem;
      height: 4.25rem;
      background-color: #6C2DC7;
      transform: scaleY(0.6);
      animation: throbber 1s ease-in-out infinite;
   }

   .throbber-bar:nth-child(2) { animation-delay: 0.16s; }
   .throbber-bar:nth-child(3) { animation-delay: 0.32s; }
   .throbber-bar:nth-child(4) { animation-delay: 0.48s; }

   .throbber-bar + .throbber-bar {
      margin-left: 0.375rem;
   }
}
@keyframes throbber {
   0%    { transform: scaleY(0.6) }
   30%   { transform: scaleY(1) }
   55%   { transform: scaleY(0.6) }
   100%  { transform: scaleY(0.6) }
}
/****** Throbber END ******/

/***** animated bar loader START *****/
.loading .animated-bar-loader {
   display: block;
}
.animated-bar-loader {
   display: none;
   height: 0.25rem;
   width: 100%;
   background: linear-gradient(to right,#4f1a98, #4f1a98 40%, #8757ca 50%, #4f1a98 60%, #4f1a98 100%);
   background-size: 300%;
   animation: moveFade 2s linear infinite;
}
.animated-bar-loader.top {
   position: absolute;
   top: 0;
   z-index: inherit;
}
@keyframes moveFade {
   0%   { background-position: right }
   100%  { background-position: left }
}
/****** animated bar loader END ******/

/*********** Filtered Icons START ***********/
.userscript-bg-filtered {
   height: inherit;
   background-color: initial !important;
   background-repeat: no-repeat;
   background-position: center center;
   background-size: 16px;
   filter: url(#filter-dark-gray);
}
.userscript-bg-filtered:hover {
   filter: url(#filter-steam-gray);
}
.userscript-bg-filtered:active {
   filter: url(#filter-dark-gray);
}
/* Why we can't refer to svg elements with their id is beyond me */
.userscript-bg-filtered.download {
   background-image: url("data:image/svg+xml, %3Csvg class='svg-download' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 29' fill='none'%3E%3Cpath fill='currentColor' fill-rule='evenodd' clip-rule='evenodd' d='M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z'%3E%3C/path%3E%3Cpath fill='currentColor' d='M17 12.1716 L21.5858 7.58578 L24.4142 10.4142 L15 19.8284 L5.58582 10.4142 L8.41424 7.58578 L13 12.1715 V0 H17 V12.1716 Z'%3E%3C/path%3E%3C/svg%3E");
}
.userscript-bg-filtered.upload {
   background-image: url("data:image/svg+xml, %3Csvg class='svg-upload' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 29' fill='none'%3E%3Cpath fill='currentColor' fill-rule='evenodd' clip-rule='evenodd' d='M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z'%3E%3C/path%3E%3Cpath fill='currentColor' d='M17 7.6568 L21.5858 12.24262 L24.4142 9.4142 L15 0 L5.58582 9.4142 L8.41424 12.24262 L13 7.6568 V19.8284 H17 V7.6568 Z'%3E%3C/path%3E%3C/svg%3E");
}
.userscript-bg-filtered.cross {
   background-image: url("data:image/svg+xml, %3Csvg class='svg-x' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30' fill='none'%3E%3Cpath fill='currentColor' d='M29.12 4.41 L25.59 0.880005 L15 11.46 L4.41 0.880005 L0.880005 4.41 L11.46 15 L0.880005 25.59 L4.41 29.12 L15 18.54 L25.59 29.12 L29.12 25.59 L18.54 15 L29.12 4.41 Z'%3E%3C/path%3E%3C/svg%3E");
}
.userscript-bg-filtered.reload {
   background-image: url("data:image/svg+xml, %3Csvg class='svg-reload' version='1.1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='none' stroke='currentColor' stroke-width='30' stroke-linecap='round' stroke-miterlimit='10' d='M229.809 147.639 A103.5 103.5 0 1 1 211 66.75'%3E%3C/path%3E%3Cpolygon fill='currentColor' points='147.639,108.361 245.755,10.166 245.834,108.361'%3E%3C/polygon%3E%3C/svg%3E");
}
.userscript-bg-filtered.reload-2 {
   background-image: url("data:image/svg+xml, %3Csvg class='svg-reload-2' version='1.1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='none' stroke='currentColor' stroke-width='30' stroke-linecap='round' stroke-miterlimit='10' d='M229.809,147.639 c-9.178,47.863-51.27,84.027-101.809,84.027 c-57.253,0-103.667-46.412-103.667-103.666 S70.747,24.334,128,24.334 c34.107,0,64.368,16.472,83.261,41.895'%3E%3C/path%3E%3Cpolygon fill='currentColor' points='147.639,108.361 245.755,10.166 245.834,108.361'%3E%3C/polygon%3E%3C/svg%3E");
}
.userscript-bg-filtered.edit {
   background-image: url("https://community.akamai.steamstatic.com/public/images/skin_1/notification_icon_edit_dark.png?v=1");
   filter: url(#filter-green);
}
.userscript-bg-filtered.edit:hover {
   filter: url(#filter-green-bright);
}
.userscript-bg-filtered.edit:active {
   filter: url(#filter-green);
}
.userscript-bg-filtered.delete {
   background-image: url("https://community.akamai.steamstatic.com/public/images/skin_1/notification_icon_trash_bright.png?v=1");
   filter: url(#filter-red);
}
.userscript-bg-filtered.delete:hover {
   filter: url(#filter-red-bright);
}
.userscript-bg-filtered.delete:active {
   filter: url(#filter-red);
}
.userscript-bg-filtered.search {
   background-image: url("https://community.akamai.steamstatic.com/public/images//sharedfiles/searchbox_workshop_submit.gif");
   /* filter: url(#filter-steam-gray); */
}
.userscript-bg-filtered.search:hover {
   /* filter: url(#filter-steam-gray); */
}
.userscript-bg-filtered.search:active {
   /* filter: url(#filter-steam-gray); */
}
/************ Filtered Icons END ************/

.userscript-btn {
   padding: 0.25rem;
   border: 1px solid #3a3a3a;
   border-radius: 3px;
}
.userscript-btn:disabled {
   opacity: 0.45;
}
.userscript-btn.green:hover {
   background: var(--btn-bg-clr-hvr-green);
   color: var(--btn-clr-hvr-green);
}
.userscript-btn.green,
.userscript-btn.green:active,
.userscript-btn.green:disabled:hover {
   background: var(--btn-bg-clr-green);
   color: var(--btn-clr-green);
}
.userscript-btn.blue:hover {
   background: var(--btn-bg-clr-hvr-blue);
   color: var(--btn-clr-hvr-blue);
}
.userscript-btn.blue,
.userscript-btn.blue:active,
.userscript-btn.blue:disabled:hover {
   background: var(--btn-bg-clr-blue);
   color: var(--btn-clr-blue);
}
.userscript-btn.purple:hover {
   background: var(--btn-bg-clr-hvr-purple);
   color: white;
}
.userscript-btn.purple,
.userscript-btn.purple:active,
.userscript-btn.purple:disabled:hover {
   background: var(--btn-bg-clr-purple);
   color: var(--btn-clr-purple);
}
.userscript-btn.red:hover {
   background: var(--btn-bg-clr-hvr-red);
   color: white;
}
.userscript-btn.red,
.userscript-btn.red:active,
.userscript-btn.red:disabled:hover {
   background: var(--btn-bg-clr-red);
   color: var(--btn-clr-red);
}
.userscript-btn.wide {
   padding: 0.25rem 1rem;
}
.userscript-btn.max {
   width: 100%;
}


.userscript-config-list {
   display: flex;
   flex-direction: column;
}
.userscript-config-list-header {
   background-color: rgba(0, 0, 0, 0.4);
   height: 2rem;
   line-height: 2rem;
   color: #ddd;
   text-align: center;
   user-select: none;

   /* > *:before {
      content: "";
      display: block;
      height: 0.0625rem;
      background: linear-gradient(to right, #00ccff, #3366ff);
   } */
   > .userscript-config-list-title {
      display: block;
   }

}
.userscript-config-list-header.tabs {
   display: flex;
   justify-content: flex-start;

   > * {
      padding: 0 0.5rem;
   }
   > *:hover,
   > *.active {
      background: rgba(0, 0, 0, 0) linear-gradient(to bottom, #2E1A47, #6C2DC7) repeat scroll 0 0;
   }
}
.userscript-config-list-list {
   background-color: rgba(0, 0, 0, 0.4);
   border: 1px solid #000;
   border-radius: 0 0 3px 3px;
   box-shadow: 1px 1px 0px #1b1b1b;
   flex: 1;
   min-height: 0; /* This is the most stupidest flex quirk */
   position: relative;
   > * {
      box-sizing: border-box;
   }
}
.conf-list-entry-action {
   height: 2rem;
   line-height: 2rem;
   text-align: center;
   background-color: black;
   box-shadow: 1px 0px 0px #1b1b1b;
   position: relative;
}
.conf-list-entry-action.add > .conf-list-entry-action-add {
   display: block;
}
.conf-list-entry-action.modify > .conf-list-entry-action-modify {
   display: flex;
}
.conf-list-entry-action-add {
   --psign-size: 1.5rem;
   --psign-clr-purple: #4f1a98;
   --psign-clr-hvr-purple: #9467d7;
   display: none;
   height: 100%;
   width: 100%;
   position: relative;

   .entry-action.add {
      height: inherit;
      width: 64px;
      margin-inline: auto;
   }
   .entry-action.add::before {
      display: block;
      content: '';
      height: calc(var(--psign-size)/4);
      width: var(--psign-size);
      border-radius: calc(var(--psign-size)/8);
      background-color: var(--psign-clr-purple);
      position: absolute;
      top: calc(50% - var(--psign-size)/8);
      left: calc(50% - var(--psign-size)/2);
      z-index: 2;
   }
   .entry-action.add::after {
      display: block;
      content: '';
      height: var(--psign-size);
      width: calc(var(--psign-size)/4);
      border-radius: calc(var(--psign-size)/8);
      background-color: var(--psign-clr-purple);
      position: absolute;
      top: calc(50% - var(--psign-size)/2);
      left: calc(50% - var(--psign-size)/8);
      z-index: 2;
   }
   .entry-action.add:hover::before,
   .entry-action.add:hover::after {
      background-color: var(--psign-clr-hvr-purple);
   }
}
.conf-list-entry-action-modify {
   display: none;
   height: 100%;
   width: 100%;
   justify-content: space-evenly;

   > * {
      height: inherit;
      width: 64px;
   }
}
.entry-action {
   color: #555;
   user-select: none;
}
.entry-action:hover {
   background-color: var(--list-bg-clr-purple);
   color: #ddd;
}
.entry-action:active {
   background-color: #150933;
   color: #aaa;
}
.conf-list-entry-action.text > .conf-list-texts {
   display: flex;
}
.conf-list-texts {
   display: none;
   height: 100%;
   width: 100%;
   justify-content: space-evenly;
}
.conf-list-text {
   display: inline-block;
}
.conf-list-text.gem-amount {
   background-image: url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8iguA3lGE31m8SwryYL6ab2O6ZodaLCW2STx-shtuc5THG1xUwl4WzR1J_3JnXcaJie/56fx56f?allow_animated=1");
   background-repeat: no-repeat;
   background-size: 2rem;
   padding-left: 2.125rem;
   width: auto;
}
.conf-list-text.gem-amount:before {
   content: attr(data-qty);
}

.conf-list-entry-form-container.active {
   display: initial;
}
.conf-list-entry-form-container {
   display: none;
   height: 100%;
   width: 100%;
   background-color: rgba(0, 0, 0, 0.8);
   border-radius: inherit;
   position: absolute;
   top: 0;
   z-index: 3;
}
.conf-list-entry-form {
   display: flex;
   flex-direction: column;
   padding: 3rem;
   gap: 0.5rem;

   > * {
      display: block;
   }
   .entry-form-action {
      display: flex;
      justify-content: center;
      gap: 3rem;
   }
}

.loading > .userscript-loader,
.dialog > .userscript-dialog {
      display: flex;
}
.userscript-loader,
.userscript-dialog {
   padding: 5%;
   width: 90%;
   max-height: 90%;
   display: none;
   flex: 1;
   justify-content: center;
   flex-direction: column;
   gap: 0.75rem;
   align-items: center;
   text-align: center;
   font-size: large;
}

.userscript-dialog-container {
   display: flex;
   justify-content: space-evenly;
   align-self: stretch;
}
.userscript-dialog-container.full {
   flex: 1;
   min-height: 0;
   overflow-y: auto;
}
.userscript-dialog-list {
   margin: 0;
   text-align: initial;
   font-size: small;
   overflow-y: auto;
   padding-left: 1.75rem;

   li {
      padding-block: 0.1875rem;
   }
   li:nth-child(odd) {
      background-color: var(--list-bg-clr-purple);
   }
   li:nth-child(even) {
      background-color: #111;
   }
}
.userscript-dialog-list.no-marker {
   padding: 0;
   list-style-type: none;
}

.userscript-dialog-table-container {
   display: block;
   width:75%;
   overflow-y: auto;
}
.userscript-dialog-table {
   width: 100%;
   color: #ddd;
   font-size: x-small;
   border-spacing: 0;
   border: 1px solid #262627;
   position: relative;

   thead {
      position: sticky;
      top: 0;

      th,
      td {
         background-color: #111 !important;
         /* color: var(--list-bg-clr-purple); */
         text-align: center;
      }
   }
   tr:nth-child(odd) > * {
      background-color: var(--list-bg-clr-purple);
   }
   tr:nth-child(even) > * {
      background-color: #111;
   }
   th,
   td {
      padding: 0.1875rem;
      border: 1px solid #262627;
      text-align: initial;
   }
}

#app-search-results.userscript-dialog-container {
   display: flex;
   flex-direction: column;
   justify-content: flex-start;
   align-self: stretch;
   font-size: initial;
   text-align: initial;
}
.app-list-row {
   height: 3rem;
   width: 100%;
   display: flex;
   justify-content: left;
   align-items: center;
   gap: 0.5rem;
   cursor: default;

   .app-header {
      height: 3rem;
   }
   .app-name {
      text-overflow: ellipsis;
   }
}
.app-list-row:hover {
   background-color: var(--list-bg-clr-purple);
}

.dbl-arrows {
   display: inline-block;
   width: 15px;
   height: 16px;
   background-image: url('https://community.cloudflare.steamstatic.com/public/shared/images/buttons/icon_double_arrows.png');
}
.dbl-arrows.down {
   background-position: 15px 0px;
}
/* .conf-list-entry-form.active {
   display: flex;
} */
.userscript-config-list-entries {
   height: 100%;
   border-radius: inherit;
   overflow: auto;
   overscroll-behavior: contain;
}
.userscript-config-list-entry-group {
   display: none;
   /* padding: 0.25rem;
   flex-direction: column;
   gap: 0.25rem; */
}
.userscript-config-list-entry-group.active {
   display: flex;
}
.userscript-config-list-entry {
   padding: 0.25rem;
   display: flex;
   align-items: center;
   gap: .25rem;
   background-color: #222;
   border: 1px solid #000;
   border-radius: 0.25rem;
   position: relative;

   > * {
      flex: 0 0 auto;
   }
   > .conf-list-entry-name {
      width: 4rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
   }
   > .conf-list-entry-descript {
      margin-left: 0.75rem;
      word-break: break-all;
      flex: 1;
   }
}
.userscript-config-list-entry.warn::after {
   --label-size: 1.5rem;
   display: inline-block;
   width: var(--label-size);
   height: var(--label-size);
   color: #111;
   content: '⚠';
   font-size: x-large;
   background-color: yellow;
   border-radius: 0.5rem;
   text-align: center;
   line-height: var(--label-size);
   border: 0.25rem solid black;
}
.userscript-config-list-entry.selected {
   background: #43167b;
}`;

const cssMatcher = `.match-results {
   margin: 3rem;
   padding: 2rem;
   color: white;
}

.match-group {
   display: flex;
   justify-content: center;
   gap: 1.5rem;
}

.match-container-outer {
   --img-item-width: 96px;
   padding: 1px;
   /* min-width: 650px;
   max-width: 1035px; */
   background: linear-gradient( to bottom, #383939 5%, #000000 95%);
   border-radius: 5px;
   display: inline-block;
}
.match-container-outer.loading {
   min-width: 40rem;
   min-height: 10rem;
   position: relative;

   > .match-container {
      min-height: 10rem;
   }
   > .userscript-overlay {
      display: flex;
   }
}

.match-container {
   padding: 0.625rem;
   background: linear-gradient( to bottom, #232424 5%, #141414 95%);
   border-radius: 5px;

   img {
      display: block;
   }
}
.match-container.max3{
   .match-item-list {
      max-width: calc(var(--img-item-width)*3);
   }
}
.match-container.max4{
   .match-item-list {
      max-width: calc(var(--img-item-width)*4);
   }
}
.match-container.grid {
   display: grid;
   /* grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr); */
   grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
   gap: 5px;

   .match-header {
      /* background-color: lightgreen; */
      /* display: grid; */
      grid-column: 1 / -1;
      /* grid-template-columns: subgrid; */
      /* grid-template-rows: max-content; */
      /* justify-items: center; */
      /* align-items: center; */
   }
}
.match-container.flex {
   display: flex;
   flex-direction: column;
}
.match-container:empty {
   min-width: calc(var(--img-item-width)*3);
}

.match-header {
   /* background-color: lightgreen; */
   display: flex;
   justify-content: center;
}

.avatar {
   margin: 0 0.375rem;
   display: inline-block;
   padding: 1px;

   img {
      display: block;
      height: 2rem;
      width: 2rem;
      padding: 0.0625rem;
   }
}
.avatar.offline {
   background: linear-gradient( to bottom, rgba(106,106,106,1) 5%, rgba(85,85,85,1) 95%);
}
.avatar.online {
   background: linear-gradient( to bottom, rgba(83,164,196,1) 5%, rgba(69,128,151,1) 95%);
}
.avatar.ingame {
   background: linear-gradient( to bottom, rgba(143,185,59,1) 5%, rgba(110,140,49,1) 95%);
}
.match-name {
   display: flex;
   color: #ddd;
   place-items: center;
   /* background: linear-gradient( to bottom, rgba(33,101,138,1) 5%, rgba(23,67,92,1) 95%); */
   flex: 1 0 0;
   padding-inline: 0.75rem;
   justify-content: center;
}
.match-name.align-right {
   flex-direction: row-reverse;
}

.match-item-type {
   display: grid;
   grid-column: 1 / -1;
   grid-template-columns: subgrid;
   /* subgrid gaps overrides main grid gap values */
   row-gap: 5px;
}
.match-item-type::before {
   content: "";
   margin: 2px;
   /* height: 2px; */
   height: 1px;
   /* background: linear-gradient(to right, rgba(255, 255, 255, 0) 0%, rgb(125, 125, 125) 25%, rgb(125, 125, 125) 75%, rgba(255, 255, 255, 0) 100%); */
   background-color: #333;
   border-top: 1px solid #000;
   display: grid;
   grid-template-columns: subgrid;
   grid-column: 1 / -1;
}
.match-item-rarity {
   display: grid;
   grid-column: 1 / -1;
   grid-template-columns: subgrid;
   row-gap: 5px;
}
.match-item-app {
   display: grid;
   grid-column: 1 / -1;
   grid-template-columns: subgrid;
}
.match-item-row {
   margin-top: 0.75rem;
   display: flex;
   align-items: center;
}

/*Maybe use media queries to help with sizing and alignment*/
.match-item-list {
   /* min-width: var(--img-item-width); */
   max-width: calc(var(--img-item-width)*5);
   padding: 6px 2px 6px 4px;
   background-color: black;
   border-radius: 5px;
   display: flex;
   flex-wrap: wrap;
   /* display: inline-grid;
   grid-template-columns: repeat(auto-fill, var(--img-item-width)); */
   row-gap: 15px;
   align-content: center;

   @media (max-width: 2100px ) {
      max-width: calc(var(--img-item-width)*4);
   }
   @media (max-width: 1700px ) {
      max-width: calc(var(--img-item-width)*3);
   }
   @media (max-width: 1300px ) {
      max-width: calc(var(--img-item-width)*2);
   }
   @media (max-width: 900px ) {
      max-width: var(--img-item-width);
   }
}
.match-item-list.left {
   /* ideally we want to calculate the correct right and left margins to have equal free space on the edge of the lists */
   justify-self: flex-end;
   justify-content: flex-end;
   align-items: flex-start;
   /* background: linear-gradient( to left, transparent 0, rgba(33,101,138,0.75) 60px); */
   background: linear-gradient( to left, transparent 0, rgba(41,41,41,1) 60px);
}
.match-item-list.right {
   justify-self: flex-start;
   justify-content: flex-start;
   align-items: flex-start;
   /* background: linear-gradient( to right, transparent 0, rgba(33,101,138,0.75) 60px); */
   background: linear-gradient( to right, transparent 0, rgba(41,41,41,1) 60px);
}

.match-item {
   --left-offset: 6px;
   --right-offset: 8px;
   min-width: 6rem;
   min-height: 6rem;
   display: inline-block;
   position: relative;

   .match-item-qty {
      height: 22px;
      width: 22px;
      font-size: small;
      text-align: center;
      display: block;
      position: absolute;
      right: var(--right-offset);
      top: 0;
      border-radius: 0 0 0 22px;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1;
   }

   img:before {
      content: "";
      display: block;
      position: absolute;
      right: var(--right-offset);
      left: var(--left-offset);
      top: 0;
      bottom: 0;
      /* Change to something similar to steam trading card bg */
      background-color: grey;
      text-align: center;
   }

   .match-item-name {
      padding-inline: 0.25rem;
      height: 20px;
      font-size: x-small;
      line-height: 20px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      position: absolute;
      right: var(--right-offset);
      left: var(--left-offset);
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1;
   }
}
.match-item.good {
   background: linear-gradient(to right, rgba(0,0,0,0) 0, gold 6%, gold 91%, rgba(0,0,0,0) 98%)
}
.match-item[data-qty]:before {
   content: attr(data-qty);
   height: 20px;
   width: 20px;
   line-height: 20px;
   font-size: x-small;
   text-align: center;
   display: block;
   position: absolute;
   right: var(--right-offset);
   top: 0;
   border-radius: 0 0 0 8px;
   background: rgba(0, 0, 0, 0.75);
   z-index: 1;
}

.match-item:hover > .match-item-name {
   display: block;
}

.match-item-action {
   align-self: center;
   background-color: rgba(0, 0, 0, 0.4);
}
.match-item-action.trade:before {
   content: "";
   display: block;
   padding: 8px 4px;
   width: 24px;
   height: 16px;
   background: no-repeat url("https://community.cloudflare.steamstatic.com/public/images/skin_1/icon_tradeoffer.png");
   border-radius: 3px;
   rotate: 90deg;
   transform: scaleX(-1);
   background-position: center center;
}
.match-item-action.trade:hover:before {
   filter: url(#filter-steam-sky-blue);
}

.match-icon {
   padding: 8px 4px;
   background: rgba(0, 0, 0, 0.4);
   border-radius: 3px;
   rotate: 90deg;
   transform: scaleX(-1);
}

.match-icon:hover {
   background: #54a5d4;
}`;

const cssEnhanced = `.enhanced-section {
   .enhanced-header {
      text-align: center;
      font-size: xx-large;
      color: white;
   }
   .enhanced-body {
      padding: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
   }
   .btn_medium {
      padding: 4px;
   }
}

.enhanced-goostatus-container,
.enhanced-options,
.enhanced-area {
   color: #ddd;
}

.enhanced-goostatus-container {
   min-height: 10rem;
   max-width: 36rem;
}
.enhanced-goostatus {
   display: grid;
   grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.2fr);
   align-items: center;
   gap: 0.5rem;
   background-color: rgba(0, 0, 0, 0.2);
   padding: 0.5rem;
   color: #67c1f5;

   .enhanced-goostatus-row {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      align-items: center;
   }
   .enhanced-goostatus-row[data-type="nontradable"] .enhanced-goostatus-text {
      color: rgb(167, 81, 36);
   }
   .enhanced-goostatus-section {
      display: flex;
      gap: 0.375rem;
      height: 3.5rem;
      padding: 0.25rem 0.25rem 0.25rem 0.5rem;
      background-color: rgba(0, 0, 0, 0.6);
      border-radius: 0.25rem;
   }
   .enhanced-goostatus-section[data-type="sack"]:before {
      display: inline-block;
      content: "";
      height: 3.5rem;
      width: 3.5rem;
      background: no-repeat url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8j1vFi-EEWgy8C1rHEO7KL7a_BvdKjHWmSRkb934LhoHXvlxRl05GmE1J_3JkUojTQy/56fx56f?allow_animated=1");
      background-size: contain;
      background-position-y: -0.25rem;
   }
   .enhanced-goostatus-section[data-type="goo"]:before {
      display: inline-block;
      content: "";
      height: 3.5rem;
      width: 3.5rem;
      background: no-repeat url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8iguA3lGE31m8SwryYL6ab2O6ZodaLCW2STx-shtuc5THG1xUwl4WzR1J_3JnXcaJie/56fx56f?allow_animated=1");
      background-size: contain;
      background-position-y: 0.125rem;
   }
   .enhanced-goostatus-text {
      display: inline-block;
      font-size: x-large;
      line-height: 3.5rem;
   }
}

.enhanced-options {
   display: flex;
   padding: 0.25rem;
   gap: 1rem;
   justify-content: space-around;

   button {
      border-radius: 0.125rem;
      border: none;
      padding: 0.375rem 0.625rem;
      display: inline-block;
      cursor: pointer;
      text-decoration: none;
      color: var(--btn-clr-purple);
      background: var(--btn-bg-clr-purple);
   }

   button:hover {
      background: var(--btn-bg-clr-hvr-purple);
      color: white;
   }
}
.enhanced-options.right {
   justify-content: right;
}

.enhanced-area {
   --booster-img-width: 75px;
   margin: 1rem 1rem 0;
   padding: 1.125rem;
   display: grid;
   grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
   gap: 2rem 1rem;
   background-color: rgba( 0, 0, 0, 0.2 );
   align-items: center;

   > .wide {
      grid-column: 1 / -1;
   }
}

.enhanced-action {
   padding: 0.625rem;
   background-color: rgba(0, 0, 0, 0.6);
   border-radius: 0.375rem;
   border: 0;
   color: white;
}
.enhanced-action:disabled {
   opacity: 0.45;
}
.enhanced-action:hover {
   background-color: #67c1f5;
}
.enhanced-action:disabled:hover,
.enhanced-action:active {
   background-color: rgba(0, 0, 0, 0.6);
}


.enhanced-list-container {
   height: 29.625rem;

   .userscript-config-list-entry.booster {
      position: relative;
   }
   .userscript-config-list-entry.booster[data-cost]:after {
      --img-offset: 0.6875rem;
      --text-offset: 1.625rem;
      content: attr(data-cost);
      height: 1.5rem;
      line-height: 1.5rem;
      display: block;
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding-left: calc(var(--img-offset) + var(--text-offset));
      background-image: url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8iguA3lGE31m8SwryYL6ab2O6ZodaLCW2STx-shtuc5THG1xUwl4WzR1J_3JnXcaJie/56fx56f?allow_animated=1");
      background-repeat: no-repeat;
      background-size: 1.5rem;
      background-position-x: var(--img-offset);
      background-color: rgba(0, 0, 0, 0.8);
      z-index: 3;
   }
   .userscript-config-list-entry.booster[data-cooldown-timer]:after {
      color: #555;
   }
   .userscript-config-list-entry.booster[data-cooldown-timer]:before {
      padding-bottom: 1.5rem;
      content: attr(data-cooldown-timer);
      /* height: 1.5rem; */
      /* text-align: center; */
      /* line-height: 1.5rem; */
      display: flex;
      justify-content: center;
      align-items: center;
      position: absolute;
      inset: 0 0 0 0;
      background-color: rgba(0, 0, 0, 0.8);
      z-index: 1;
   }
   .userscript-config-list-entry.booster[data-qty-tradable]:before,
   .userscript-config-list-entry.booster[data-qty-nontradable]:after {
      height: 1.25rem;
      font-size: small;
      line-height: 1.25rem;
      display: block;
      position: absolute;
   }
   .userscript-config-list-entry.booster[data-qty-tradable]:before {
      content: attr(data-qty-tradable);
      background-color: rgba(0, 0, 0, 0.75);
      padding-right: 52%;
      text-align: right;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
   }
   .userscript-config-list-entry.booster[data-qty-nontradable]:after {
      content: "+" attr(data-qty-nontradable);
      color: rgb(167, 81, 36);
      text-align: left;
      left: 50%;
      right: 0;
      bottom: 0;
      z-index: 1;
   }
   .userscript-config-list-entry.booster[data-qty-nontradable="0"]:after {
      display: none;
   }
   .userscript-config-list-entry.booster[data-qty-nontradable="0"]:before {
      padding: 0;
      text-align: center;
   }
   .userscript-config-list-entry.card[data-qty]:before {
      display: block;
      content: attr(data-qty);
      padding: 0.25rem;
      background-color: rgba(0, 0, 0, 0.75);
      border-radius: inherit;
      font-size: small;
      text-align: center;
      position: absolute;
      top: 0;
      right: 0;
      z-index: 1;
   }
   .userscript-config-list-entry.card[data-foil]:before {
      color: gold;
   }
}

.userscript-config-list-entries.tile {
   height: 100%;
   padding: 0.25rem;
   display: flex;
   gap: 0.25rem;
   flex-wrap: wrap;
   align-content: start;
}`;
