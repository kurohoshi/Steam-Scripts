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
   isOutdated: function(epochTime, days) {
      return epochTime < Date.now()-days*24*60*60*1000;
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

function matcherConfigSingleMatchListener() {
   console.warn('matcherConfigFullMatchListener(): Not Implemented Yet!');

   // verify that the provided profileid/customurl is valid, cancel if invalid
   // check if settings are the same in db, prompt user to save if they want
   // generate matcher page with a loading animation
   // defer to an in-progress matching function
}

function matcherStartMatching() {
   console.warn('matcherStartMatching(): Not Implemented Yet!');
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
   // after matching has finished, defer to a function to finish the matching process
}

function matcherFinishMatching() {
   console.warn('matcherFinishMatching(): Not Implemented Yet!');

   // wrap up any processes left over
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

main();

/**************************************************/
/**************************************************/
/******************* CSS Styles *******************/
/**************************************************/
/**************************************************/
const cssGlobal = `.solid-clr-filters {
   width: 0;
   height: 0;
   position: absolute;
}
.userscript-config {
   --config-col: 2;
   --config-col-height: 32rem;
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
}

.userscript-section {
   min-height: 10rem;
}

.userscript-config {
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
   color: white;
}

*.overlay {
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
.userscript-config input[type="text"] {
   width: 75%;
   min-width: 15rem;
   max-width: 20rem;
   color: white;
   background-color: rgba(0, 0, 0, 1);
   border: 1px solid #000;
   border-radius: 0 0 3px 3px;
   box-shadow: 1px 1px 0px #1b1b1b;
}

.userscript-config textarea {
   /* width: 85%; */
   padding: 3px;
   color: white;
   background-color: rgba(0, 0, 0, 1);
   border: 1px solid #000;
   border-radius: 0 0 3px 3px;
   box-shadow: 1px 1px 0px #1b1b1b;
   resize: none;
}
/* .userscript-config textarea:focus {
   outline: auto rgba(47,137,188,1);
} */
/****** Text Input END ******/

/****** Custom Scrollbar END ******/
.userscript-config .custom-scroll {
   scrollbar-width: thin;
   scrollbar-color: black transparent;
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
.userscript-throbber {
   margin-inline: auto;
   padding: 1rem;
   display: block;
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
   0%   { transform: scaleY(0.6) }
   30%   { transform: scaleY(1) }
   55%   { transform: scaleY(0.6) }
   100%  { transform: scaleY(0.6) }
}
/****** Throbber END ******/

.userscript-config {
   button {
      padding: 0.25rem;
      border: 1px solid #3a3a3a;
      border-radius: 3px;
   }
   button.green {
      background: var(--btn-bg-clr-green);
      color: var(--btn-clr-green);
   }
   button.green:hover {
      background: var(--btn-bg-clr-hvr-green);
      color: var(--btn-clr-hvr-green);
   }
   button.green:active {
      background: var(--btn-bg-clr-green);
      color: var(--btn-clr-green);
   }
   button.blue {
      background: var(--btn-bg-clr-blue);
      color: var(--btn-clr-blue);
   }
   button.blue:hover {
      background: var(--btn-bg-clr-hvr-blue);
      color: var(--btn-clr-hvr-blue);
   }
   button.blue:active {
      background: var(--btn-bg-clr-blue);
      color: var(--btn-clr-blue);
   }
   button.purple {
      background: var(--btn-bg-clr-purple);
      color: var(--btn-clr-purple);
   }
   button.purple:hover {
      background: var(--btn-bg-clr-hvr-purple);
      color: white;
   }
   button.purple:active {
      background: var(--btn-bg-clr-purple);
      color: var(--btn-clr-purple);
   }
   button.red {
      background: var(--btn-bg-clr-red);
      color: var(--btn-clr-red);
   }
   button.red:hover {
      background: var(--btn-bg-clr-hvr-red);
      color: white;
   }
   button.red:active {
      background: var(--btn-bg-clr-red);
      color: var(--btn-clr-red);
   }
   button.wide {
      padding: 0.25rem 1rem;
   }
   button.max {
      width: 100%;
   }
   .btn_medium {
      padding: 4px;
   }
}

.userscript-config-list {
   display: flex;
   flex-direction: column;
}
.userscript-config-list-header {
   background-color: rgba(0, 0, 0, 0.4);
   height: 2rem;
   line-height: 2rem;
   color: white;
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
.conf-list-entry-action.disabled > .conf-list-entry-action-disabled {
   display: block;
}
.conf-list-entry-action-add {
   --psign-size: 1.5rem;
   --psign-clr-purple: #4f1a98;
   --psign-clr-hvr-purple: #9467d7;
   display: none;
   height: 100%;
   width: 100%;
   position: relative;

   #entry-action-add {
      height: inherit;
      width: 64px;
      margin-inline: auto;
   }
   #entry-action-add::before {
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
   #entry-action-add::after {
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
   #entry-action-add:hover::before,
   #entry-action-add:hover::after {
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
   #entry-action-edit {
      background-image: url('https://community.akamai.steamstatic.com/public/images/skin_1/notification_icon_edit_dark.png?v=1');
      background-repeat: no-repeat;
      background-position: center center;
      filter: url(#filter-green);
   }
   #entry-action-edit:hover {
      filter: url(#filter-green-bright);
   }
   #entry-action-del {
      background-image: url('https://community.akamai.steamstatic.com/public/images/skin_1/notification_icon_trash_bright.png?v=1');
      background-repeat: no-repeat;
      background-position: center center;
      filter: url(#filter-red);
   }
   #entry-action-del:hover {
      filter: url(#filter-red-bright);
   }
}
.conf-list-entry-action-disabled {
   display: none;
   height: 100%;
   width: 100%;
   position: absolute;
   background-color: rgba(0, 0, 0, 0.75);
   z-index: 3;
   top: 0;
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
.conf-list-overlay {
   display: none;
   height: 100%;
   width: 100%;
   background-color: rgba(0, 0, 0, 0.8);
   border-radius: inherit;
   position: absolute;
   top: 0;
   z-index: 5;
}
.conf-list-overlay.active {
   display: initial;
}
.content-loader {
   height: 0.25rem;
   background: linear-gradient(to right,#4f1a98, #4f1a98 40%, #8757ca 50%, #4f1a98 60%, #4f1a98 100%);
   background-size: 300%;
   animation: moveFade 2s linear infinite;
}

@keyframes moveFade {
   0%   { background-position: right }
   100%  { background-position: left }
}
.conf-list-dialog {
   display: none;
   margin: 1rem;

   > * {
      margin-bottom: 0.75rem;
   }
}
.conf-list-dialog.active {
   display: block;
}
.conf-list-dialog-divider,
.conf-list-dialog-action {
   display: flex;
   justify-content: space-evenly;
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
   padding: 0.25rem;
   flex-direction: column;
   gap: 0.25rem;
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
   color: black;
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

   .align-right {
      justify-content: right;
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

const cssEnhanced = `
.enhanced-section {
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

.enhanced-goostatus-container {
   min-height: 10rem;
}
.enhanced-goostatus {
   display: grid;
   grid-template-columns: minmax(0, 1fr) 4rem minmax(0, 1fr);
   align-items: center;
   gap: 0.5rem;
   background-color: rgba(141, 37, 216, 0.342);
   padding: 0.5rem;

   .enhanced-goostatus-row {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      align-items: center;
   }
   .enhanced-goostatus-action {
      background-color: #333;
      border-radius: 0.25rem;
   }
   .enhanced-goostatus-section {
      height: 3.5rem;
      padding: 0.25rem;
      background-color: rgba(0, 0, 0, 0.4);
      border-radius: 0.25rem;
   }
   .enhanced-goostatus-section.sack:before {
      display: inline-block;
      content: "";
      height: 3.5rem;
      width: 3.5rem;
      background: no-repeat url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8j1vFi-EEWgy8C1rHEO7KL7a_BvdKjHWmSRkb934LhoHXvlxRl05GmE1J_3JkUojTQy/56fx56f?allow_animated=1");
      background-size: contain;
      background-position-y: -0.125rem;
   }
   .enhanced-goostatus-section.goo:before {
      display: inline-block;
      content: "";
      height: 3.5rem;
      width: 3.5rem;
      background: no-repeat url("https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSIYhY_9XEDYOMNRBsMoGuuOgceXob50kaxV_PHjMO1MHaEqgEgp8iguA3lGE31m8SwryYL6ab2O6ZodaLCW2STx-shtuc5THG1xUwl4WzR1J_3JnXcaJie/56fx56f?allow_animated=1");
      background-size: contain;
      background-position-y: 0.25rem;
   }
}

.enhanced-options {
   --btn-bg-clr-purple: linear-gradient( to bottom, #6C2DC7 5%, #2E1A47 95%);
   --btn-bg-clr-hvr-purple: linear-gradient( to bottom, #D891EF 5%, #8467D7 95%);
   --btn-clr-purple: lavender;
   display: flex;
   padding: 0.25rem 1rem;
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
   margin: 1rem 1rem 0;
   padding: 1.125rem;
   display: grid;
   grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
   gap: 2rem 0.5rem;
   background-color: rgba( 0, 0, 0, 0.2 );

   > .wide {
      grid-column: 1 / -1;
   }
}

.enhanced-action {
   width: 5rem;
}

.enhanced-list-container {
   height: 25rem;
}`;
