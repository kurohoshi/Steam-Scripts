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

const MONTHS_ARRAY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
            resolve(loadedConfig);
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
SteamToolsDbManager.setAppData = async function(appid, appdata) {
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
   let getList = Array.isArray(contextids) ? contextids.map(x => `${profileid}_${appid}_${x}`) : `${profileid}_${appid}_${contextids}`;
   return await this.get("inventories", undefined, getList);
}
SteamToolsDbManager.setProfileInventory = async function(inventoryData, profileid, appid, contextid) {
   // No need to update sublevel data, overwrite all old data
   await this.set("inventories", inventoryData, `${profileid}_${appid}_${contextid}`);
}
SteamToolsDbManager.getMatchResults = async function(profileid1, profileid2List) {
   let getList = Array.isArray(profileid2List) ? profileid2List.map(x => `${profileid1}_${x}`) : `${profileid1}_${profileid2List}`;
   return await this.get("item_matcher_results", undefined, getList);
}
SteamToolsDbManager.setMatchResult = async function(result) {
   // No need to update sublevel data, overwrite all old data
   await this.set("item_matcher_results", result, `${result.inventory1.meta.profileid}_${result.inventory2.meta.profileid}`);
}
SteamToolsDbManager.getItemNameIds = async function(appid, hashnames) {
   let hashList = Array.isArray(hashnames) ? hashnames.map(x => `${appid}/${x}`) : `${appid}/${hashnames}`;
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

   addSvgBlock(document.getElementById('responsive_page_template_content'));
   GM_addStyle(cssGlobal);
   GM_addStyle(cssEnhanced);
   GM_addStyle(cssMatcher);

   let friendFilterHTMLString = '<div class="enhanced-options right userscript-vars">'
   +    '<button id="friend-filter" class="userscript-btn purple wide">Filter Friends</button>'
   +    '<button id="good-swaps" class="userscript-btn purple wide">Display Good Swaps</button>'
   +    '<button id="balance-cards" class="userscript-btn purple wide">Balance Cards</button>'
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
      let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
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

      processedFriends.add(profileUrl);
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
      let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
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

      processedFriends.add(profileUrl);
   }

   document.querySelector('.userscript-throbber').remove();
}

/***********************************************************/
/***************** Badgepage Filtering END *****************/
/***********************************************************/

/*******************************************************/
/**************** Booster Crafter BEGIN ****************/
/*******************************************************/
GLOBALSETTINGSDEFAULTS.boosterCrafter = {
   lists: {
      favorites: {},
      crafting: {}
   },
   stats: {
      crafts: {
         // object of apps, integer values
      },
      drops: {
         // object of apps, object of imgUrls
      }
   }
}
const boosterCrafterShortcuts = {};
const boosterCrafterData = {};

async function setupBoosterCrafter() {
   // resize
   for(let minioption of document.getElementsByClassName('minioption')) {
      minioption.style.width = '150px';
      minioption.style.marginBottom = '40px';
   }
   document.querySelector('.booster_creator_right').style.width = '480px';
   document.querySelector('.booster_creator_left').style.marginBottom = '0';
   document.querySelector('.booster_creator_left').style.marginRight = '60px';

   // set up css styles for this feature
   GM_addStyle(cssGlobal);
   GM_addStyle(cssEnhanced);

   let config = await SteamToolsDbManager.getToolConfig('boosterCrafter');

   globalSettings.boosterCrafter = config.boosterCrafter ?? steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.boosterCrafter);

   addSvgBlock(document.querySelector('.booster_creator_area'));

   // insert new elements (add loading elements?)
   const generateGooStatusSectionHTMLString = (tradableString, itemString) => {
      return `<div class="enhanced-goostatus-section" data-type="${itemString}">`
      +    `<div id="goostatus-${itemString}-${tradableString}" class="enhanced-goostatus-text">0</div>`
      + '</div>';
   };
   const generateGooStatusRowHTMLString = (tradableString) => {
      return `<div class="enhanced-goostatus-row" data-type="${tradableString}">`
      +    generateGooStatusSectionHTMLString(tradableString, 'sack')
      +    `<button id="goostatus-unpack-${tradableString}" class="enhanced-action">>></button>`
      +    generateGooStatusSectionHTMLString(tradableString, 'goo')
      + '</div>';
   };
   document.querySelector('.booster_creator_goostatus').style.display = 'none';
   const gooStatusDialogHTMLString = '<div class="userscript-dialog">'
   +    '<div>'
   +       'Unpack <input type="number" id="goostatus-unpack-text" class="userscript-input" min="0"> sacks'
   +    '</div>'
   +    '<input type="range" name="unpack-amount" id="goostatus-unpack-slider" class="userscript-input" list="goostatus-unpack-datalist" min="0">'
   +    '<div class="userscript-dialog-container">'
   +       '<button id="goostatus-unpack-cancel" class="userscript-btn red wide">Cancel</button>'
   +       '<button id="goostatus-unpack-confirm" class="userscript-btn green wide">Unpack</button>'
   +    '</div>'
   +    '<datalist id="goostatus-unpack-datalist"></datalist>'
   + '</div>';
   let gooStatusHTMLString = '<div class="enhanced-goostatus-container userscript-vars">'
   +    '<div class="enhanced-goostatus overlay">'
   +       generateGooStatusRowHTMLString('tradable')
   +       generateGooStatusRowHTMLString('nontradable')
   +       cssAddOverlay(cssAddThrobber(), gooStatusDialogHTMLString, { initialState: 'loading' })
   +    '</div>'
   + '</div>';
   document.querySelector('.booster_creator_goostatus').insertAdjacentHTML('afterend', gooStatusHTMLString);

   let boosterSelectorHTMLString = '<div class="enhanced-options userscript-vars">'
   +    '<button id="selector-add-favorites" class="userscript-btn purple wide">Add to Favorites</button>'
   +    '<button id="selector-add-craft" class="userscript-btn purple wide">Add to List</button>'
   + '</div>';
   document.querySelector('.booster_game_selector').insertAdjacentHTML('afterend', boosterSelectorHTMLString);

   const favoritesListDialogHTMLString = '<div class="userscript-dialog">'
   +    '<input type="text" name="app-search" id="app-search-text-input" class="userscript-input" placeholder="Search title/appid">'
   +    '<div id="app-search-results" class="userscript-dialog-container full"></div>'
   +    '<div class="userscript-dialog-container">'
   +       '<button id="app-search-close" class="userscript-btn red wide">Close</button>'
   +    '</div>'
   + '</div>';
   const craftListLoaderHTMLString = '<div class="userscript-loader">'
   +    cssAddThrobber()
   +    '<div class="userscript-dialog-container">'
   +       '<span><span id="craft-list-progress">0</span>/<span id="craft-list-progress-total">0</span></span>'
   +    '</div>'
   + '</div>';
   const craftListDialogHTMLString = '<div class="userscript-dialog">'
   +    '<div>Craft the following boosters?</div>'
   +    '<div class="userscript-dialog-table-container userscript-custom-scroll">'
   +       '<table class="userscript-dialog-table">'
   +          '<thead>'
   +             '<tr>'
   +                '<th>Name</th>'
   +                '<th>Cost</th>'
   +             '</tr>'
   +          '</thead>'
   +          '<tbody id="craft-dialog-table-body">'
   +          '</tbody>'
   +       '</table>'
   +    '</div>'
   +    '<div class="userscript-dialog-container">'
   +       '<span>Total Boosters: <span id="craft-total-boosters-text">0</span></span>'
   +    '</div>'
   +    '<div class="userscript-dialog-container">'
   +       '<span>Total Cost: <span id="craft-total-cost-text">0</span></span>'
   +    '</div>'
   +    '<div class="userscript-dialog-container">'
   +       '<button id="craft-dialog-cancel" class="userscript-btn red wide">No</button>'
   +       '<button id="craft-dialog-confirm" class="userscript-btn green wide">Yes</button>'
   +    '</div>'
   + '</div>';
   const openerListLoaderHTMLString = '<div class="userscript-loader">'
   +    cssAddThrobber()
   +    '<div class="userscript-dialog-container">'
   +       '<span><span id="opener-list-progress">0</span>/<span id="opener-list-progress-total">0</span></span>'
   +    '</div>'
   + '</div>';
   const openerListDialogHTMLString = '<div class="userscript-dialog">'
   +    '<div>Open the following boosters?</div>'
   +    '<div class="userscript-dialog-table-container userscript-custom-scroll">'
   +       '<table class="userscript-dialog-table">'
   +          '<thead>'
   +             '<tr>'
   +                '<th>Name</th>'
   +                '<th>⏳</th>'
   +                '<th>✅</th>'
   +             '</tr>'
   +          '</thead>'
   +          '<tbody id="opener-dialog-table-body">'
   +          '</tbody>'
   +       '</table>'
   +    '</div>'
   +    '<div class="userscript-dialog-container">'
   +       '<button id="opener-dialog-cancel" class="userscript-btn red wide">No</button>'
   +       '<button id="opener-dialog-confirm" class="userscript-btn green wide">Yes</button>'
   +    '</div>'
   + '</div>';
   let enhancedBoosterHTMLString = '<div class="enhanced-area userscript-vars">'
   +    '<div class="userscript-config-list enhanced-list-container" data-list-type="favorites">'
   +       '<div class="userscript-config-list-header"><span class="userscript-config-list-title">Favorites</span></div>'
   +       '<div class="conf-list-entry-action modify">'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div class="entry-action">'
   +                '<div class="userscript-bg-filtered delete"></div>'
   +             '</div>'
   +             '<div id="config-import" class="entry-action" title="import config file">'
   +                '<div class="userscript-bg-filtered upload"></div>'
   +             '</div>'
   +             '<div id="config-export" class="entry-action" title="export config file">'
   +                '<div class="userscript-bg-filtered download"></div>'
   +             '</div>'
   +             '<div id="app-search" class="entry-action">'
   +                '<div class="userscript-bg-filtered search"></div>'
   +             '</div>'
   +          '</div>'
   +          '<div class="userscript-overlay"></div>'
   +       '</div>'
   +       '<div class="userscript-config-list-list overlay">'
   +          '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
   +          cssAddOverlay(cssAddThrobber(), favoritesListDialogHTMLString, { initialState: 'loading' })
   +       '</div>'
   +    '</div>'
   +    '<button id="add-craft" class="userscript-btn enhanced-action purple">'
   +       '>><br>Add'
   +    '</button>'
   +    '<div class="userscript-config-list enhanced-list-container" data-list-type="craft">'
   +       '<div class="userscript-config-list-header"><span class="userscript-config-list-title">Craft List</span></div>'
   +       '<div class="conf-list-entry-action modify disabled">'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div class="entry-action">'
   +                '<div class="userscript-bg-filtered delete"></div>'
   +             '</div>'
   +             '<div id="craft-cost" class="conf-list-text gem-amount" data-qty="0"></div>'
   +             '<div id="craft-boosters" class="entry-action">Craft</div>'
   +          '</div>'
   +          '<div class="userscript-overlay"></div>'
   +       '</div>'
   +       '<div class="userscript-config-list-list overlay">'
   +          '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
   +          cssAddOverlay(craftListLoaderHTMLString, craftListDialogHTMLString, { initialState: 'loading' })
   +       '</div>'
   +    '</div>'
   +    '<div class="userscript-config-list enhanced-list-container" data-list-type="inventory">'
   +       '<div class="userscript-config-list-header">'
   +          '<span class="userscript-config-list-title">Available Boosters</span>'
   +       '</div>'
   +       '<div class="conf-list-entry-action modify">'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div id="inventory-reload" class="entry-action">'
   +                '<div class="userscript-bg-filtered reload"></div>'
   +             '</div>'
   +          '</div>'
   +          '<div class="userscript-overlay"></div>'
   +       '</div>'
   +       '<div class="userscript-config-list-list overlay">'
   +          '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
   +          cssAddOverlay(cssAddThrobber(), { initialState: 'loading' })
   +       '</div>'
   +    '</div>'
   +    '<button id="add-opener" class="userscript-btn enhanced-action purple">'
   +       '>><br>Add'
   +    '</button>'
   +    '<div class="userscript-config-list enhanced-list-container" data-list-type="opener">'
   +       '<div class="userscript-config-list-header">'
   +           '<span class="userscript-config-list-title">Boosters to Open</span>'
   +       '</div>'
   +       '<div class="conf-list-entry-action modify">'
   +          '<div class="conf-list-entry-action-modify">'
   +             '<div class="entry-action">'
   +                '<div class="userscript-bg-filtered delete"></div>'
   +             '</div>'
   +             '<div id="open-boosters" class="entry-action">Open</div>'
   +             '<div id="decr-opener" class="entry-action">-</div>'
   +             '<div id="incr-opener" class="entry-action">+</div>'
   +          '</div>'
   +          '<div class="userscript-overlay"></div>'
   +       '</div>'
   +       '<div class="userscript-config-list-list">'
   +          '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
   +          cssAddOverlay(openerListLoaderHTMLString, openerListDialogHTMLString, { initialState: 'loading' })
   +       '</div>'
   +    '</div>'
   +    '<div class="userscript-config-list enhanced-list-container wide" data-list-type="card">'
   +       '<div class="userscript-config-list-header"><span class="userscript-config-list-title">Card Drops</span>'
   +       '</div>'
   +       '<div class="conf-list-entry-action text">'
   +          '<div class="conf-list-texts">'
   +             '<div class="conf-list-text">Normal: <span id="text-normal-cards">0</span></div>'
   +             '<div class="conf-list-text">Foil: <span id="text-foil-cards">0</span></div>'
   +          '</div>'
   +       '</div>'
   +       '<div class="userscript-config-list-list">'
   +          '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
   +       '</div>'
   +    '</div>'
   + '</div>';
   document.querySelector('.booster_creator_area').insertAdjacentHTML('afterend', enhancedBoosterHTMLString);

   // element shortcuts
   boosterCrafterShortcuts.gooStatus = document.querySelector('.enhanced-goostatus');
   boosterCrafterShortcuts.lists = {};
   for(let listContainerElem of document.querySelectorAll('.enhanced-area [data-list-type]')) {
      boosterCrafterShortcuts.lists[listContainerElem.dataset.listType] = {
         main: listContainerElem,
         action: listContainerElem.querySelector('.conf-list-entry-action'),
         list: listContainerElem.querySelector('.userscript-config-list-list'),
      };
   }
   for(let gooItemType of ['sack', 'goo']) {
      for(let tradability of ['tradable', 'nontradable']) {
         let goostatusKey = `goostatus${gooItemType[0].toUpperCase()+gooItemType.slice(1)}${tradability[0].toUpperCase()+tradability.slice(1)}`;
         boosterCrafterShortcuts[goostatusKey] = document.getElementById(`goostatus-${gooItemType}-${tradability}`);
      }
   }
   boosterCrafterShortcuts.craftCost = document.getElementById('craft-cost');
   boosterCrafterShortcuts.unpackTradableGooButton = document.getElementById('goostatus-unpack-tradable');
   boosterCrafterShortcuts.unpackNontradableGooButton = document.getElementById('goostatus-unpack-nontradable');
   boosterCrafterShortcuts.unpackGooText = document.getElementById('goostatus-unpack-text');
   boosterCrafterShortcuts.unpackGooSlider = document.getElementById('goostatus-unpack-slider');
   boosterCrafterShortcuts.SelectorAddFavoritesButton = document.getElementById('selector-add-favorites');
   boosterCrafterShortcuts.SelectorAddCraftButton = document.getElementById('selector-add-craft');
   boosterCrafterShortcuts.addCraftButton = document.getElementById('add-craft');
   boosterCrafterShortcuts.addOpenerButton = document.getElementById('add-opener');
   boosterCrafterShortcuts.normalCardCount = document.getElementById('text-normal-cards');
   boosterCrafterShortcuts.foilCardCount = document.getElementById('text-foil-cards');

   // event listeners
   document.getElementById('goostatus-unpack-tradable').addEventListener('click', boosterCrafterUnpackGooSackListener);
   document.getElementById('goostatus-unpack-nontradable').addEventListener('click', boosterCrafterUnpackGooSackListener);
   document.getElementById('goostatus-unpack-text').addEventListener('input', boosterCrafterGooUpdateTextListener);
   document.getElementById('goostatus-unpack-slider').addEventListener('input', boosterCrafterGooUpdateSliderListener);
   document.getElementById('goostatus-unpack-cancel').addEventListener('click', boosterCrafterGooUnpackCancelListener);
   document.getElementById('goostatus-unpack-confirm').addEventListener('click', boosterCrafterGooUnpackConfirmListener);

   document.getElementById('selector-add-favorites').addEventListener('click', boosterCrafterFavoritesListAddListener);
   document.getElementById('selector-add-craft').addEventListener('click', boosterCrafterCraftListAddListener);

   document.getElementById('config-import').addEventListener('click', boosterCrafterConfigImportListener);
   document.getElementById('config-export').addEventListener('click', boosterCrafterConfigExportListener);
   document.getElementById('app-search').addEventListener('click', boosterCrafterAppSearchListener);
   document.getElementById('app-search-text-input').addEventListener('input', boosterCrafterAppSearchTextInputListener);
   document.getElementById('app-search-results').addEventListener('click', boosterCrafterAppSearchAddFavoritesListener);
   document.getElementById('app-search-close').addEventListener('click', boosterCrafterAppSearchCloseListener);
   document.getElementById('add-craft').addEventListener('click', boosterCrafterCraftListAddFavoritesListener);

   document.getElementById('craft-boosters').addEventListener('click', boosterCrafterCraftListCraftListener);
   document.getElementById('craft-dialog-cancel').addEventListener('click', boosterCrafterCraftListCraftCancelListener);
   document.getElementById('craft-dialog-confirm').addEventListener('click', boosterCrafterCraftListCraftConfirmListener);

   document.getElementById('inventory-reload').addEventListener('click', boosterCrafterInventoryListReloadListener);

   document.getElementById('add-opener').addEventListener('click', boosterCrafterOpenerListAddListener);
   document.getElementById('incr-opener').addEventListener('click', boosterCrafterOpenerListIncrementListener);
   document.getElementById('decr-opener').addEventListener('click', boosterCrafterOpenerListDecrementListener);
   document.getElementById('open-boosters').addEventListener('click', boosterCrafterOpenerListOpenListener);
   document.getElementById('opener-dialog-cancel').addEventListener('click', boosterCrafterOpenerListOpenCancelListener);
   document.getElementById('opener-dialog-confirm').addEventListener('click', boosterCrafterOpenerListOpenConfirmListener);

   for(let listElem of document.querySelectorAll('.userscript-config-list-list')) {
      listElem.addEventListener('click', boosterCrafterSelectEntriesListener);
   }
   for(let removeButtonElem of document.querySelectorAll('.enhanced-list-container .entry-action > .delete')) {
      removeButtonElem.parentElement.addEventListener('click', boosterCrafterListRemoveListener);
   }

   boosterCrafterData.openerList = {};
   boosterCrafterData.lastSelected = {};
   boosterCrafterData.craftCost = { amount: 0, max: 0 };
   boosterCrafterData.currentDropStats = {};

   boosterCrafterData.gems = null; // gems data structure is sloppy
   boosterCrafterData.boosters = null;
   boosterCrafterData.cooldownList = {};
   boosterCrafterData.craftQueue = [];
   boosterCrafterData.appSearch = {
      timeout: null,
      prevInput: '',
      prevResults: {
         appids: [],
         names: []
      }
   };

   // save and modify booster selector list from the page
   boosterCrafterData.boosterDataList = unsafeWindow.CBoosterCreatorPage.sm_rgBoosterData;
   for(let appid in boosterCrafterData.boosterDataList) {
      let appEntry = boosterCrafterData.boosterDataList[appid];
      if(appEntry.unavailable) {
         appEntry.cooldownDate = boosterCrafterParseCooldownDate(appEntry.available_at_time);
      }
   }



   // load crafting lists, set up desync detector, start cooldown timer, and load gem and booster data from inventory
   boosterCrafterLoadConfig();
   boosterCrafterData.lastSyncTime = Date.now();
   setInterval(boosterCrafterCheckDesync, 1500);
   boosterCrafterBoosterCooldownUpdateDisplay();
   setInterval(boosterCrafterBoosterCooldownUpdateTimer, 1000);
   boosterCrafterLoadData();
}

function boosterCrafterCheckDesync() {
   let desyncTimeTrigger = 5000;

   if(Date.now()-boosterCrafterData.lastSyncTime>desyncTimeTrigger) {
      console.log('resetting timers!')
      for(let appid in boosterCrafterData.cooldownList) {
         boosterCrafterBoosterCooldownSetTimer(appid);
      }
   }

   boosterCrafterData.lastSyncTime = Date.now();
   boosterCrafterUpdateBoosterCost();
}
async function boosterCrafterLoadConfig() {
   let favoritesActionElem = boosterCrafterShortcuts.lists.favorites.action;
   let favoritesListElem = boosterCrafterShortcuts.lists.favorites.list;
   let favoritesListEntriesElem = favoritesListElem.querySelector('.userscript-config-list-entries');
   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;
   let craftListEntriesElem = craftListElem.querySelector('.userscript-config-list-entries');

   favoritesActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(favoritesListElem, true, 'loading');
   craftActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(craftListElem, true, 'loading');

   // populate favorites list
   favoritesListEntriesElem.innerHTML = '';
   let favoritesEntriesHTMLString = '';
   for(let appid in globalSettings.boosterCrafter.lists.favorites) {
      let boosterData = boosterCrafterData.boosterDataList[appid];

      if(!boosterData) {
         continue;
      }

      favoritesEntriesHTMLString += boosterCrafterGenerateBoosterListEntry(boosterData);
      boosterCrafterBoosterCooldownAddTimer(appid);
   }
   favoritesListEntriesElem.insertAdjacentHTML('beforeend', favoritesEntriesHTMLString);

   // populate craft list
   craftListEntriesElem.innerHTML = '';
   let craftEntriesHTMLString = '';
   for(let appid in globalSettings.boosterCrafter.lists.crafting) {
      let boosterData = boosterCrafterData.boosterDataList[appid];

      if(!boosterData) {
         continue;
      }

      craftEntriesHTMLString += boosterCrafterGenerateBoosterListEntry(boosterData);
      boosterCrafterBoosterCooldownAddTimer(appid);
   }
   craftListEntriesElem.insertAdjacentHTML('beforeend', craftEntriesHTMLString);
   boosterCrafterUpdateBoosterCost();

   // tally up historical card drops
   let normalCardCount = 0;
   let foilCardCount = 0;
   for(let appid in globalSettings.boosterCrafter.stats.drops) {
      for(let item in globalSettings.boosterCrafter.stats.drops[appid]) {
         let itemData = globalSettings.boosterCrafter.stats.drops[appid][item];
         if(itemData.foil) {
            foilCardCount += itemData.count;
         } else {
            normalCardCount += itemData.count;
         }
      }
   }
   boosterCrafterShortcuts.normalCardCount.innerHTML = normalCardCount;
   boosterCrafterShortcuts.foilCardCount.innerHTML = foilCardCount;

   favoritesActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(favoritesListElem, false);
   craftActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(craftListElem, false);
}
async function boosterCrafterLoadData() {
   const getArraySum = (arr) => {
      let sum = 0;
      for(let i=0; i<arr.length; i++) {
         sum += arr[i].count;
      }
      return sum;
   };

   // enable overlays
   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let inventoryActionElem = boosterCrafterShortcuts.lists.inventory.action;
   let inventoryListElem = boosterCrafterShortcuts.lists.inventory.list;
   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, true, 'loading');
   craftActionElem.classList.add('disabled');
   inventoryActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(inventoryListElem, true, 'loading');
   // disable add button?
   openerActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(openerListElem, false);
   openerListElem.querySelector('.userscript-dialog-container').style.display = 'none';

   let inventoryEntriesElem = inventoryListElem.querySelector('.userscript-config-list-entries');

   await Profile.findProfile(steamToolsUtils.getMySteamId());
   await Profile.me.getInventory('booster');

   // if inventory fails, then alert user of failure here

   boosterCrafterData.gems = steamToolsUtils.deepClone(Profile.me.inventory.data.gem[0]['753']);
   for(let itemClass of boosterCrafterData.gems) {
      if(itemClass.classid === '667924416') { // gems
         boosterCrafterShortcuts.goostatusGooTradable.innerHTML = getArraySum(itemClass.tradables).toLocaleString();
         boosterCrafterShortcuts.goostatusGooNontradable.innerHTML = getArraySum(itemClass.nontradables).toLocaleString();
      } else if(itemClass.classid === '667933237') { // sacks
         let sumTradables = getArraySum(itemClass.tradables);
         let sumNonradables = getArraySum(itemClass.nontradables);
         boosterCrafterShortcuts.goostatusSackTradable.innerHTML = sumTradables.toLocaleString();
         boosterCrafterShortcuts.goostatusSackNontradable.innerHTML = sumNonradables.toLocaleString();
         boosterCrafterShortcuts.unpackTradableGooButton.disabled = !sumTradables ? true : false;
         boosterCrafterShortcuts.unpackNontradableGooButton.disabled = !sumNonradables ? true : false;
      } else {
         console.warn('boosterCrafterLoadData(): Unknown item Class detected in gem itemType!');
      }
      itemClass.tradables.sort((a, b) => a.count-b.count);
      itemClass.nontradables.sort((a, b) => a.count-b.count);
   }

   boosterCrafterData.boosters = {};

   inventoryEntriesElem.innerHTML = '';
   let boosterDataList = Profile.me.inventory.data.booster[0];
   for(let appid in Profile.me.inventory.data.booster[0]) {
      boosterCrafterData.boosters[appid] = steamToolsUtils.deepClone(boosterDataList[appid][0]);

      let boosterEntry = boosterCrafterData.boosters[appid];
      boosterEntry.tradableCount = boosterEntry.tradables.reduce((sum, x) => sum+x.count, 0);
      boosterEntry.nontradableCount = boosterEntry.nontradables.reduce((sum, x) => sum+x.count, 0);

      let entryElem = inventoryEntriesElem.querySelector(`.userscript-config-list-entry[data-appid="${appid}"]`);
      if(entryElem) {
         entryElem.dataset.qtyTradable = boosterEntry.tradableCount;
         entryElem.dataset.qtyNontradable = boosterEntry.nontradableCount;
      } else {
         let appData = await Profile.findAppMetaData(appid);
         // let HTMLString = `<div class="userscript-config-list-entry booster" data-appid="${appid}" data-qty-tradable="${boosterEntry.tradableCount}" data-qty-nontradable="${boosterEntry.nontradableCount}" title="${appData.name}">`
         // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${appid}?l=english&single=1&v=2&size=75x" alt="">`
         // + '</div>';
         inventoryEntriesElem.insertAdjacentHTML('beforeend', boosterCrafterGenerateBoosterListEntry({ appid: appid, tradableCount: boosterEntry.tradableCount, nontradableCount: boosterEntry.nontradableCount, name: appData.name }));
      }
   }

   // disable overlays
   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
   craftActionElem.classList.remove('disabled');
   inventoryActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(inventoryListElem, false);
   // enable add button?
   openerActionElem.classList.remove('disabled');
   openerListElem.querySelector('.userscript-dialog-container').style.display = '';
}
function boosterCrafterUpdateBoosterCost() {
   let allTotal = 0;
   let selectedTotal = 0;
   for(let entryElem of boosterCrafterShortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry')) {
      if(Object.hasOwn(entryElem.dataset, 'cooldownTimer')) {
          continue;
      }

      allTotal += parseInt(entryElem.dataset.cost);
      if(entryElem.matches('.selected')) {
         selectedTotal += parseInt(entryElem.dataset.cost);
      }
   }

   boosterCrafterData.craftCost.max = allTotal;
   boosterCrafterData.craftCost.amount = selectedTotal || allTotal;
   if(boosterCrafterData.craftCost.amount > boosterCrafterData.craftCost.max) {
      throw 'boosterCrafterUpdateBoosterCost(): craft cost amount exceeds max! Investigate!';
   }
   boosterCrafterShortcuts.craftCost.dataset.qty = boosterCrafterData.craftCost.amount.toLocaleString();
}
function boosterCrafterInventoryListReloadListener() {
   boosterCrafterLoadData();
}

function boosterCrafterAppSearchListener() {
   let favoritesActionElem = boosterCrafterShortcuts.lists.favorites.action;
   let favoritesListElem = boosterCrafterShortcuts.lists.favorites.list;

   favoritesActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(favoritesListElem, true, 'dialog');
}
function boosterCrafterAppSearchTextInputListener(event) {
   clearTimeout(boosterCrafterData.appSearch.timeout);
   boosterCrafterData.appSearch.timeout = setTimeout(boosterCrafterAppSearchTextInput, 500, event.target.value);
}
function boosterCrafterAppSearchTextInput(inputStr) {
   const generateSearchResultRowHTMLString = (data) => `<div class="app-list-row" data-appid="${data.appid}">`
   +    `<img class="app-header" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${data.appid}/header.jpg" alt="">`
   +    `<span class="app-name">${data.name}</span>`
   + '</div>';
   let searchResultsElem = document.getElementById('app-search-results');

   let searchResults = { appids: [], names: [] };

   if(!inputStr.length) {
      // empty string
   } else if(boosterCrafterData.appSearch.prevInput.length && inputStr.includes(boosterCrafterData.appSearch.prevInput)) {
      let prevSearchResults = boosterCrafterData.appSearch.prevResults;
      for(let app of prevSearchResults.appids) {
         if(app.appid.toString().includes(inputStr)) {
            searchResults.appids.push(app);
         }
      }
      for(let app of prevSearchResults.names) {
         if(app.name.toLowerCase().includes(inputStr)) {
            searchResults.names.push(app);
         }
      }
   } else {
      let isNumber = /^\d+$/.test(inputStr);
      for(let appid in boosterCrafterData.boosterDataList) {
         let entry = boosterCrafterData.boosterDataList[appid];
         if(isNumber && entry.appid.toString().includes(inputStr)) {
            searchResults.appids.push(boosterCrafterData.boosterDataList[appid]);
         } else if(entry.name.toLowerCase().includes(inputStr)) {
            searchResults.names.push(boosterCrafterData.boosterDataList[appid]);
         }
      }
   }

   // order the results from best to worst good matches (just sort by string length?)

   searchResultsElem.innerHTML = '';
   let appSearchHTMLString = '';
   let listingCounter = 0;
   for(let entry of searchResults.appids) {
      appSearchHTMLString += generateSearchResultRowHTMLString(entry);
      if(++listingCounter === 3) {
         break;
      }
   }
   for(let entry of searchResults.names) {
      appSearchHTMLString += generateSearchResultRowHTMLString(entry);
      if(++listingCounter === 6) {
         break;
      }
   }
   searchResultsElem.insertAdjacentHTML('beforeend', appSearchHTMLString);

   boosterCrafterData.appSearch.prevInput = inputStr;
   boosterCrafterData.appSearch.prevResults = searchResults;
}
function boosterCrafterAppSearchAddFavoritesListener(event) {
   let currentEntryElem = event.target;
   while(!currentEntryElem.matches('.app-list-row')) {
      if(currentEntryElem.matches('#app-search-results')) {
         return;
      }
      currentEntryElem = currentEntryElem.parentElement;
   }

   let appid = currentEntryElem.dataset.appid;
   let boosterData = boosterCrafterData.boosterDataList[appid];
   let favoritesList = globalSettings.boosterCrafter.lists.favorites;
   let favoritesActionElem = boosterCrafterShortcuts.lists.favorites.action;
   let favoritesListElem = boosterCrafterShortcuts.lists.favorites.list;
   let favoritesListEntriesElem = boosterCrafterShortcuts.lists.favorites.list.querySelector('.userscript-config-list-entries');

   if(!Object.hasOwn(favoritesList, appid)) {
      favoritesList[appid] = { appid: boosterData.appid };
      favoritesListEntriesElem.insertAdjacentHTML('beforeend', boosterCrafterGenerateBoosterListEntry(boosterData));
   }

   boosterCrafterConfigSave();

   favoritesActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(favoritesListElem, false);
}
function boosterCrafterAppSearchCloseListener() {
   let favoritesActionElem = boosterCrafterShortcuts.lists.favorites.action;
   let favoritesListElem = boosterCrafterShortcuts.lists.favorites.list;

   favoritesActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(favoritesListElem, false);
}

function boosterCrafterBoosterCooldownSetTimer(appid, craftedNow=false) {
   let cooldownTimer = !craftedNow
      ? Math.ceil((boosterCrafterData.boosterDataList[appid].cooldownDate.valueOf() - Date.now()) / 1000)
      : 24*60*60;
   let timerSeconds = cooldownTimer % 60;
   let timerMinutes = Math.floor(cooldownTimer/60) % 60;
   let timerHours = Math.floor(cooldownTimer/(60*60));
   boosterCrafterData.cooldownList[appid] = [timerHours, timerMinutes, timerSeconds];
}
function boosterCrafterBoosterCooldownAddTimer(appid, craftedNow=false) {
   if((!boosterCrafterData.boosterDataList[appid].unavailable && !craftedNow) || Object.hasOwn(boosterCrafterData.cooldownList, appid)) {
      return;
   }

   boosterCrafterBoosterCooldownSetTimer(appid, craftedNow);
   boosterCrafterBoosterCooldownUpdateDisplay();
}
function boosterCrafterBoosterCooldownUpdateTimer() {
   for(let appid in boosterCrafterData.cooldownList) {
      let timer = boosterCrafterData.cooldownList[appid];
      if(timer[2] === 0) {
         if(timer[1] === 0) {
            if(timer[0] === 0) {
               delete boosterCrafterData.cooldownList[appid];
               continue;
            }
            timer[0]--;
            timer[1] = 59;
         } else {
            timer[1]--;
         }
         timer[2] = 59;
      } else {
         timer[2]--;
      }
   }

   boosterCrafterBoosterCooldownUpdateDisplay();
}
function boosterCrafterBoosterCooldownUpdateDisplay(entryElemArg) {
   const stringifyTimer = (timerArr) => timerArr[0] + ':' + timerArr[1].toString().padStart(2, '0') + ':' + timerArr[2].toString().padStart(2, '0');
   const updateTimer = (elem) => {
      let appid = elem.dataset.appid;
      let timer = boosterCrafterData.cooldownList[appid];
      if(!timer) {
         if(elem.dataset.cooldownTimer) {
            delete elem.dataset.cooldownTimer;
            delete boosterCrafterData.boosterDataList[appid].unavailable;
         }
      } else {
         elem.dataset.cooldownTimer = stringifyTimer(timer);
      }
   };

   if(entryElemArg) {
      updateTimer(entryElemArg);
      return;
   }

   for(let entryElem of boosterCrafterShortcuts.lists.favorites.list.querySelectorAll('.userscript-config-list-entry')) {
      updateTimer(entryElem);
   }
   for(let entryElem of boosterCrafterShortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry')) {
      updateTimer(entryElem);
   }
}

function boosterCrafterUnpackGooSackListener(event) {
   let rowElem = event.target;
   while(!rowElem.matches('.enhanced-goostatus-row')) {
      if(rowElem.matches('.enhanced-goostatus')) {
         throw 'boosterCrafterUnpackGooSackListener(): No row container found! Was the document structured correctly?';
      }
      rowElem = rowElem.parentElement;
   }

   let sacksData = boosterCrafterData.gems.find(x => x.classid === '667933237');
   if(!sacksData) {
      console.error('boosterCrafterUnpackGooSackListener(): No sacks found! Were the buttons properly disabled?');
      return;
   }

   let tradableType = rowElem.dataset.type;
   let dataset;
   if(tradableType === 'tradable') {
      dataset = steamToolsUtils.deepClone(sacksData.tradables);
   } else if(tradableType === 'nontradable') {
      dataset = steamToolsUtils.deepClone(sacksData.nontradables);
   } else {
      throw 'boosterCrafterUnpackGooSackListener(): TradableType is neither tradable nor nontradable???';
   }

   if(!dataset.length) {
      console.error('boosterCrafterUnpackGooSackListener(): Selected dataset has no entries!');
      return;
   }
   boosterCrafterData.unpackList = dataset;

   let gooDatalistElem = document.getElementById('goostatus-unpack-datalist');
   let gooMax = 0;
   let datalistHTMLString = '';
   for(let i=0; i<dataset.length; i++) {
      gooMax += dataset[i].count;
      if(i < dataset.length-1) {
         datalistHTMLString += `<option value="${gooMax}"></option>`
      }
   }

   boosterCrafterShortcuts.unpackGooText.max = gooMax;
   boosterCrafterShortcuts.unpackGooSlider.max = gooMax;
   gooDatalistElem.innerHTML = datalistHTMLString;

   boosterCrafterShortcuts.unpackGooText.value = 0;
   boosterCrafterShortcuts.unpackGooSlider.value = 0;

   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, true, 'dialog');
}
function boosterCrafterGooUpdateTextListener() {
   boosterCrafterShortcuts.unpackGooSlider.value = event.target.value;
}
function boosterCrafterGooUpdateSliderListener(event) {
   boosterCrafterShortcuts.unpackGooText.value = event.target.value;
}
function boosterCrafterGooUnpackCancelListener(event) {
   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
}
async function boosterCrafterGooUnpackConfirmListener(event) {
   let unpackTotalAmount = parseInt(boosterCrafterShortcuts.unpackGooSlider.value); // shouldn't overflow the max amount
   if(unpackTotalAmount === 0) {
      boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
      return;
   }

   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;
   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, true, 'loading');
   boosterCrafterShortcuts.SelectorAddCraftButton.disabled = false;
   boosterCrafterShortcuts.addCraftButton.disabled = false;
   craftActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(craftListElem, false);
   boosterCrafterShortcuts.addOpenerButton.disabled = false;
   openerActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(openerListElem, false);

   let requestBody = new URLSearchParams({
      sessionid: steamToolsUtils.getSessionId(),
      appid: '753',
      goo_denomination_in: '1000',
      goo_denomination_out: '1'
   });
   let urlString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/ajaxexchangegoo/`;
   let refererString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/inventory/`;

   while(unpackTotalAmount>0) {
      let sackItem = boosterCrafterData.unpackList[0];
      let unpackItemAmount = Math.min(sackItem.count, unpackTotalAmount);

      requestBody.set('assetid', sackItem.assetid);
      requestBody.set('goo_amount_in', unpackItemAmount.toString());
      requestBody.set('goo_amount_out_expected', (unpackItemAmount*1000).toString());

      let response = await fetch(urlString, {
         method: 'POST',
         body: requestBody,
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
         },
         referer: refererString
      });

      try {
         // throws error in the event that request is redirected to a steam webpage instead of giving a response
         response = await response.json();
         if(response.success !== 1) {
            throw 'boosterCrafterUnpackConfirmListener(): Unpacking sack failed!';
         }
      } catch(err) {
         console.error(err);
         break;
      }

      unpackTotalAmount -= unpackItemAmount;
      if(unpackItemAmount === sackItem.count) {
         boosterCrafterData.unpackList.shift();
      } else {
         sackItem.count -= unpackItemAmount;
      }
   }

   // update sm goo amount and stuff here
   // rather than executing load data, update gem data here

   craftActionElem.classList.remove('disabled');
   openerActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
   boosterCrafterLoadData();
}

function boosterCrafterGetListContainerElem(elem) {
   let containerElem = elem;
   while(!containerElem.matches('.enhanced-list-container')) {
      if(containerElem.matches('body')) {
         throw 'boosterCrafterListRemoveListener(): container not found!';
      }
      containerElem = containerElem.parentElement;
   }
   return containerElem;
}
function boosterCrafterSelectEntriesListener(event) {
   let currentEntryElem = event.target;
   while(!currentEntryElem.matches('.userscript-config-list-entry')) {
      if(currentEntryElem.matches('.userscript-config-list-list')) {
         return;
      }
      currentEntryElem = currentEntryElem.parentElement;
   }

   let listType = boosterCrafterGetListContainerElem(event.currentTarget).dataset.listType;
   if(listType === 'card') {
      return;
   }

   if(!event.shiftKey && !event.ctrlKey) {
      let selectedList = event.currentTarget.querySelectorAll('.selected');
      for(let selectedEntryElem of selectedList) {
         selectedEntryElem.classList.remove('selected');
      }

      if(selectedList.length !== 1 || currentEntryElem.dataset.appid !== boosterCrafterData.lastSelected[listType]?.dataset?.appid) {
         currentEntryElem.classList.add('selected');
      }
   } else if(event.shiftKey) {
      let prevIndex, currIndex;
      let entries = event.currentTarget.querySelectorAll('.userscript-config-list-entry');
      for(let i=0; i<entries.length; i++) {
         if(entries[i].dataset.appid === boosterCrafterData.lastSelected[listType]?.dataset?.appid) {
            prevIndex = i;
            if(currIndex !== undefined) {
               break;
            }
         }
         if(entries[i].dataset.appid === currentEntryElem.dataset.appid) {
            currIndex = i;
            if(prevIndex !== undefined) {
               break;
            }
         }
      }

      if(prevIndex === currIndex) {
         return;
      }

      let minIndex = prevIndex < currIndex ? prevIndex : currIndex;
      let maxIndex = prevIndex < currIndex ? currIndex : prevIndex;
      for(let i=minIndex+1; i<maxIndex; i++) {
         entries[i].classList.add('selected');
      }
      entries[currIndex].classList.add('selected');
   } else if(event.ctrlKey) {
      currentEntryElem.classList.toggle('selected');
   }
   boosterCrafterData.lastSelected[listType] = currentEntryElem;

   if(listType === 'craft') {
      boosterCrafterUpdateBoosterCost();
   }
}
function boosterCrafterListRemoveListener(event) {
   console.log('removing selected elements...')
   let containerElem = event.target;
   while(!containerElem.matches('.enhanced-list-container')) {
      if(containerElem.matches('body')) {
         throw 'boosterCrafterListRemoveListener(): container not found!';
      }
      containerElem = containerElem.parentElement;
   }
   let listType = containerElem.dataset.listType;

   let lists = globalSettings.boosterCrafter.lists;
   for(let selectedEntryElem of boosterCrafterShortcuts.lists[listType].list.querySelectorAll('.selected')) {
      if(listType === 'favorites') {
         delete lists.favorites[selectedEntryElem.dataset.appid];
      } else if(listType === 'craft') {
         delete lists.crafting[selectedEntryElem.dataset.appid];
      } else if(listType === 'opener') {
         delete boosterCrafterData.openerList[selectedEntryElem.dataset.appid]
      } else {
         throw 'boosterCrafterListRemoveListener(): Container entry deletion not implemented!';
      }

      console.log('removing element...')
      selectedEntryElem.remove();
   }

   boosterCrafterData.lastSelected[listType] = null;
   boosterCrafterConfigSave();
   if(listType === 'craft') {
      boosterCrafterUpdateBoosterCost();
   }
}

function boosterCrafterFavoritesListAddListener() {
   let selectedAppid = document.getElementById('booster_game_selector').value;
   if(isNaN(parseInt(selectedAppid))) {
      console.log('boosterCrafterFavoritesListAddListener(): No app selected, no boosters will be added');
      return;
   }

   let favoritesList = globalSettings.boosterCrafter.lists.favorites;
   let favoritesListElem = boosterCrafterShortcuts.lists.favorites.list.querySelector('.userscript-config-list-entries');

   if(Object.hasOwn(favoritesList, selectedAppid)) {
      return;
   }
   let boosterData = unsafeWindow.CBoosterCreatorPage.sm_rgBoosterData[selectedAppid];
   favoritesList[selectedAppid] = { appid: boosterData.appid }; // add more data here

   // let favoritesEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${boosterData.appid}" data-cost="${boosterData.price}" title="${boosterData.name}">`
   // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${boosterData.appid}?l=english&single=1&v=2&size=75x" alt="">`
   // + '</div>';
   favoritesListElem.insertAdjacentHTML('beforeend', boosterCrafterGenerateBoosterListEntry(boosterData));
   boosterCrafterBoosterCooldownAddTimer(boosterData.appid);

   boosterCrafterConfigSave();
}
function boosterCrafterCraftListAddListener() {
   let selectedAppid = document.getElementById('booster_game_selector').value;
   if(isNaN(parseInt(selectedAppid))) {
      console.log('boosterCrafterCraftListAddListener(): No app selected, no boosters will be added');
      return;
   }
   boosterCrafterCraftListAdd([selectedAppid]);
}
function boosterCrafterCraftListAddFavoritesListener() {
   let containerElem = boosterCrafterShortcuts.lists.favorites.list;
   let appids = [];
   for(let selectedEntryElem of containerElem.querySelectorAll('.selected')) {
      appids.push(selectedEntryElem.dataset.appid);
      selectedEntryElem.classList.remove('selected');
   }

   boosterCrafterCraftListAdd(appids);
}
function boosterCrafterCraftListAdd(appids) {
   let craftList = globalSettings.boosterCrafter.lists.crafting;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list.querySelector('.userscript-config-list-entries');
   for(let i=0; i<appids.length; i++) {
      if(Object.hasOwn(craftList, appids[i])) {
         continue;
      }
      let boosterData = boosterCrafterData.boosterDataList[appids[i]];
      craftList[appids[i]] = { appid: boosterData.appid }; // add more data here

      // let craftEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${boosterData.appid}" data-cost="${boosterData.price}" title="${boosterData.name}">`
      // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${boosterData.appid}?l=english&single=1&v=2&size=75x" alt="">`
      // + '</div>';
      craftListElem.insertAdjacentHTML('beforeend', boosterCrafterGenerateBoosterListEntry(boosterData));
      boosterCrafterBoosterCooldownAddTimer(boosterData.appid);
   }

   boosterCrafterConfigSave();
   boosterCrafterUpdateBoosterCost();
}
function boosterCrafterCraftListCraftListener(event) {
   let selectedCount = 0;
   let selectedTotalCost = 0;
   let selectedEntries = boosterCrafterShortcuts.lists.craft.list.querySelectorAll('.selected');
   if(!selectedEntries.length) {
      selectedEntries = boosterCrafterShortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry');
   }

   let stopFlag = true;
   let tableBodyElem = document.getElementById('craft-dialog-table-body');
   tableBodyElem.innerHTML = '';
   for(let entryElem of selectedEntries) {
      if(Object.hasOwn(entryElem.dataset, 'cooldownTimer')) {
          continue;
      }
      let appid = entryElem.dataset.appid;
      let boosterData = boosterCrafterData.boosterDataList[appid];
      if(!boosterData) {
         console.warn(`boosterCrafterCraftListCraftListener(): booster data for appid ${appid} not found!`);
      }

      let tableRow = tableBodyElem.insertRow();
      tableRow.insertCell(0).innerHTML = boosterData.name;
      tableRow.insertCell(1).innerHTML = boosterData.price;

      selectedCount++;
      selectedTotalCost += parseInt(boosterData.price);

      boosterCrafterData.craftQueue.push(entryElem);
      stopFlag = false;
   }
   if(stopFlag) {
      return;
   }
   document.getElementById('craft-total-boosters-text').innerHTML = selectedCount;
   document.getElementById('craft-total-cost-text').innerHTML = selectedTotalCost.toLocaleString();

   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;

   boosterCrafterShortcuts.SelectorAddCraftButton.disabled = true;
   boosterCrafterShortcuts.addCraftButton.disabled = true;
   craftActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(craftListElem, true, 'dialog');
}
function boosterCrafterCraftListCraftCancelListener() {
   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;

   boosterCrafterShortcuts.SelectorAddCraftButton.disabled = false;
   boosterCrafterShortcuts.addCraftButton.disabled = false;
   craftActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(craftListElem, false);
}
async function boosterCrafterCraftListCraftConfirmListener() {
   let craftLoaderProgressElem = document.getElementById('craft-list-progress');
   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;
   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   craftLoaderProgressElem.innerHTML = '0';
   document.getElementById('craft-list-progress-total').innerHTML = document.getElementById('craft-total-boosters-text').innerHTML;
   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
   boosterCrafterShortcuts.unpackTradableGooButton.disabled = true;
   boosterCrafterShortcuts.unpackNontradableGooButton.disabled = true;
   boosterCrafterSetOverlay(craftListElem, true, 'loading');
   boosterCrafterShortcuts.addOpenerButton.disabled = false;
   openerActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(openerListElem, false);

   let craftCostAmount = boosterCrafterData.craftCost.amount;
   let gems = boosterCrafterData.gems.find(x => x.classid==='667924416');
   if(!gems || gems.count<craftCostAmount) {
      let sacks = boosterCrafterData.gems.find(x => x.classid==='667933237');
      if(!sacks || (sacks.count*1000)+gems.count<craftCostAmount) {
         alert('Not enough gems. Try making less boosters?');
      } else {
         alert('Not enough gems. Try unpacking some sacks of gems or making less boosters?');
      }
   } else {
      let gemsTradableAmount = gems.tradables.reduce((sum, x) => sum+x.count, 0);
      if(gemsTradableAmount < craftCostAmount) {
         let userResponse = prompt('Not enough tradable gems. Some nontradable gems will be used. Proceed? (y/n)');
         if(userResponse.toLowerCase().startsWith('y')) {
            await boosterCrafterCraftBoosters();
         }
      } else {
         await boosterCrafterCraftBoosters();
      }
   }


   if(document.getElementById('goostatus-sack-tradable').textContent !== '0') {
      boosterCrafterShortcuts.unpackTradableGooButton.disabled = false;
   }
   if(document.getElementById('goostatus-sack-nontradable').textContent !== '0') {
      boosterCrafterShortcuts.unpackNontradableGooButton.disabled = false;
   }
   boosterCrafterShortcuts.SelectorAddCraftButton.disabled = false;
   boosterCrafterShortcuts.addCraftButton.disabled = false;
   craftActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(craftListElem, false);
   openerActionElem.classList.remove('disabled');
}
async function boosterCrafterCraftBoosters() {
   let craftLoaderProgressElem = document.getElementById('craft-list-progress');
   let progressCounter = 0;
   let tradableGems = unsafeWindow.CBoosterCreatorPage.sm_flUserTradableGooAmount;
   let nontradableGems = unsafeWindow.CBoosterCreatorPage.sm_flUserUntradableGooAmount;
   let craftStats = globalSettings.boosterCrafter.stats.crafts;
   let tradabilityPreference = 2;

   let requestBody = new URLSearchParams({
      sessionid: steamToolsUtils.getSessionId()
   });
   let urlString = 'https://steamcommunity.com/tradingcards/ajaxcreatebooster/';

   while(boosterCrafterData.craftQueue.length) {
      let entryElem = boosterCrafterData.craftQueue[boosterCrafterData.craftQueue.length-1];
      let appid = entryElem.dataset.appid;
      let boosterData = boosterCrafterData.boosterDataList[appid];
      boosterCrafterData.boosters[appid] ??= { tradables: [], nontradables: [], count: 0, tradableCount: 0, nontradableCount: 0 };
      let boosterListEntry = boosterCrafterData.boosters[appid];
      let openerListEntry = boosterCrafterData.openerList[appid];
      tradabilityPreference = tradableGems >= parseInt(entryElem.dataset.cost) ? 1 : 3;

      requestBody.set('appid', boosterData.appid);
      requestBody.set('series', boosterData.series);
      requestBody.set('tradability_preference', tradabilityPreference);


      let response = await fetch(urlString, {
         method: 'POST',
         body: requestBody,
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
         }
      });

      let responseData = await response.json();

/*
      let responseData = {
         "purchase_result": {
            "communityitemid": "29863953490",
            "appid": 998490,
            "item_type": 28,
            "purchaseid": "57708606",
            "success": 1,
            "rwgrsn": -2
         },
         "goo_amount": "232519",
         "tradable_goo_amount": "232519",
         "untradable_goo_amount": 0
      };
*/
      boosterCrafterBoosterCooldownAddTimer(appid, true);
      entryElem.classList.remove('selected');

      boosterData.unavailable = true;
      boosterData.cooldownDate = new Date();
      boosterData.cooldownDate.setDate(boosterData.cooldownDate.getDate()+1);
      if(boosterData.$Option) {
         unsafeWindow.CBoosterCreatorPage.ToggleActionButton( boosterData.$Option );
      }
      if(boosterData.$MiniOption) {
         unsafeWindow.CBoosterCreatorPage.ToggleActionButton( boosterData.$MiniOption );
      }
      unsafeWindow.CBoosterCreatorPage.RefreshSelectOptions();

      unsafeWindow.CBoosterCreatorPage.UpdateGooDisplay( responseData.goo_amount, responseData.tradable_goo_amount, responseData.untradable_goo_amount );
      boosterCrafterShortcuts.goostatusGooTradable.innerHTML = parseInt(responseData.tradable_goo_amount).toLocaleString();
      boosterCrafterShortcuts.goostatusGooNontradable.innerHTML = parseInt(responseData.untradable_goo_amount).toLocaleString();
      let gems = boosterCrafterData.gems.find(x => x.classid==='667924416');
      let gemsTradableDiff = gems.tradables.reduce((sum, x) => sum+x.count, 0) - parseInt(responseData.tradable_goo_amount);
      while(gemsTradableDiff>0) {
         let lastAsset = gems.tradables[gems.tradables.length-1];
         if(lastAsset.count<gemsTradableDiff) {
            gemsTradableDiff -= lastAsset.count;
            gems.tradables.pop();
         } else {
            lastAsset.count -= gemsTradableDiff;
            gemsTradableDiff = 0;
         }
      }
      let gemsNontradableDiff = gems.nontradables.reduce((sum, x) => sum+x.count, 0) - parseInt(responseData.untradable_goo_amount);
      let boosterTradability = !!gemsNontradableDiff;
      while(gemsNontradableDiff>0) {
         let lastAsset = gems.nontradables[gems.nontradables.length-1];
         if(lastAsset.count<gemsNontradableDiff) {
            gemsNontradableDiff -= lastAsset.count;
            gems.nontradables.pop();
         } else {
            lastAsset.count -= gemsNontradableDiff;
            gemsNontradableDiff = 0;
         }
      }
      gems.count = parseInt(responseData.goo_amount);

      if(boosterTradability) {
         boosterListEntry.nontradables.push({ assetid: responseData.communityitemid, count: 1 });
         boosterListEntry.nontradableCount++;
         if(openerListEntry) {
            openerListEntry.maxNontradable++;
         }
      } else {
         boosterListEntry.tradables.push({ assetid: responseData.communityitemid, count: 1 });
         boosterListEntry.tradableCount++;
         if(openerListEntry) {
            openerListEntry.maxTradable++;
         }
      }
      boosterListEntry.count++;

      let invEntryElem = boosterCrafterShortcuts.lists.inventory.list.querySelector(`[data-appid="${appid}"]`);
      if(invEntryElem) {
         if(boosterTradability) {
            invEntryElem.dataset.qtyNontradable = boosterListEntry.nontradableCount;
         } else {
            invEntryElem.dataset.qtyTradable = boosterListEntry.tradableCount;
         }
      } else {
         let invEntriesElem = boosterCrafterShortcuts.lists.inventory.list.querySelector('.userscript-config-list-entries');
         let HTMLString = boosterCrafterGenerateBoosterListEntry({ appid: appid, tradableCount: boosterListEntry.tradableCount, nontradableCount: boosterListEntry.nontradableCount });
         invEntriesElem.insertAdjacentHTML('beforeend', HTMLString);
      }

      if(!Object.hasOwn(craftStats, appid)) {
         craftStats[appid] = 0;
      }
      craftStats[appid]++;
      await boosterCrafterConfigSave();

      craftLoaderProgressElem.innerHTML = ++progressCounter;
      boosterCrafterData.craftQueue.pop();
   }

   boosterCrafterUpdateBoosterCost();
}

function boosterCrafterOpenerListAddListener() {
   let openerListElem = boosterCrafterShortcuts.lists.opener.list.querySelector('.userscript-config-list-entries');
   for(let selectedElem of boosterCrafterShortcuts.lists.inventory.list.querySelectorAll('.selected')) {
      let appid = selectedElem.dataset.appid;
      if(boosterCrafterData.openerList[appid]) {
         continue;
      }

      let qtyTradable = parseInt(selectedElem.dataset.qtyTradable);
      let qtyNontradable = parseInt(selectedElem.dataset.qtyNontradable);
      let name = selectedElem.title;
      boosterCrafterData.openerList[appid] = {
         qtyTradable: qtyTradable,
         maxTradable: qtyTradable,
         qtyNontradable: qtyNontradable,
         maxNontradable: qtyNontradable,
         name: name
      };

      // let openerEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${appid}" data-qty-tradable="${qtyTradable}" data-qty-nontradable="${qtyNontradable}" title="${name}">`
      // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${appid}?l=english&single=1&v=2&size=75x" alt="">` // TODO: change language dynamically?
      // + '</div>';
      openerListElem.insertAdjacentHTML('beforeend', boosterCrafterGenerateBoosterListEntry({ appid: appid, tradableCount: qtyTradable, nontradableCount: qtyNontradable, name: name }));

      selectedElem.classList.remove('selected');
   }
}
function boosterCrafterOpenerListIncrementListener() {
   boosterCrafterOpenerListChangeValue(1, false);
}
function boosterCrafterOpenerListDecrementListener() {
   boosterCrafterOpenerListChangeValue(1, true);
}
function boosterCrafterOpenerListChangeValue(value, negative) {
   let changeVal = negative ? -value : value;
   for(let selectedElem of boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.selected')) {
      let appid = selectedElem.dataset.appid;
      if(!boosterCrafterData.openerList[appid]) {
         console.warn('boosterCrafterOpenerListIncrementListener(): invalid appid somehow, something is wrong!');
         continue;
      }

      let dataEntry = boosterCrafterData.openerList[appid];

      if(dataEntry.qtyTradable === dataEntry.maxTradable) {
         let newQty = dataEntry.qtyNontradable + changeVal;
         if(newQty > dataEntry.maxNontradable) {
            dataEntry.qtyTradable = Math.min(newQty-dataEntry.maxNontradable, dataEntry.maxTradable);
            dataEntry.qtyNontradable = 0;
         } else if(newQty < 0) {
            dataEntry.qtyTradable = Math.max(dataEntry.maxTradable+newQty, 1);
            dataEntry.qtyNontradable = 0;
         } else {
            dataEntry.qtyNontradable = newQty;
         }
      } else {
         let newQty = dataEntry.qtyTradable+changeVal;
         if(newQty > dataEntry.maxTradable) {
            dataEntry.qtyTradable = dataEntry.maxTradable;
            dataEntry.qtyNontradable = Math.min(newQty-dataEntry.maxTradable, dataEntry.maxNontradable);
         } else if(newQty < 1) {
            dataEntry.qtyTradable = dataEntry.maxTradable;
            dataEntry.qtyNontradable = Math.max(dataEntry.maxNontradable+newQty, 0);
         } else {
            dataEntry.qtyTradable = newQty;
         }
      }

      selectedElem.dataset.qtyTradable = dataEntry.qtyTradable;
      selectedElem.dataset.qtyNontradable = dataEntry.qtyNontradable;
   }
}
function boosterCrafterOpenerListOpenListener() {
   let selectedEntries = boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.selected');
   if(!selectedEntries.length) {
      selectedEntries = boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.userscript-config-list-entry');
   }
   if(!selectedEntries.length) {
      return;
   }
   let tableBodyElem = document.getElementById('opener-dialog-table-body');
   tableBodyElem.innerHTML = '';
   for(let entryElem of selectedEntries) {
      let name = entryElem.title;
      let tradableCount = entryElem.dataset.qtyTradable;
      let nontradableCount = entryElem.dataset.qtyNontradable;


      let tableRow = tableBodyElem.insertRow();
      tableRow.insertCell(0).innerHTML = name;
      tableRow.insertCell(1).innerHTML = nontradableCount;
      tableRow.insertCell(2).innerHTML = tradableCount;
   }

   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   boosterCrafterShortcuts.addOpenerButton.disabled = true;
   openerActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(openerListElem, true, 'dialog');
}
function boosterCrafterOpenerListOpenCancelListener() {
   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   openerActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(openerListElem, false);
}
async function boosterCrafterOpenerListOpenConfirmListener() {
   const tallyOpenerBoosters = () => {
      let total = 0;
      for(let appid in boosterCrafterData.openerList) {
         let entry = boosterCrafterData.openerList[appid];
         total += entry.qtyTradable + entry.qtyNontradable;
      }
      return total;
   };

   let openerLoaderProgressElem = document.getElementById('opener-list-progress');
   let craftActionElem = boosterCrafterShortcuts.lists.craft.action;
   let craftListElem = boosterCrafterShortcuts.lists.craft.list;
   let openerActionElem = boosterCrafterShortcuts.lists.opener.action;
   let openerListElem = boosterCrafterShortcuts.lists.opener.list;

   openerLoaderProgressElem.innerHTML = '0';
   document.getElementById('opener-list-progress-total').innerHTML = tallyOpenerBoosters(); // add a total to this
   boosterCrafterSetOverlay(boosterCrafterShortcuts.gooStatus, false);
   boosterCrafterShortcuts.unpackTradableGooButton.disabled = true;
   boosterCrafterShortcuts.unpackNontradableGooButton.disabled = true;
   boosterCrafterShortcuts.SelectorAddCraftButton.disabled = false;
   boosterCrafterShortcuts.addCraftButton.disabled = false;
   craftActionElem.classList.add('disabled');
   boosterCrafterSetOverlay(craftListElem, false);
   boosterCrafterSetOverlay(openerListElem, true, 'loading');

   console.log(boosterCrafterData);
   await boosterCrafterOpenBoosters();


   if(document.getElementById('goostatus-sack-tradable').textContent !== '0') {
      boosterCrafterShortcuts.unpackTradableGooButton.disabled = false;
   }
   if(document.getElementById('goostatus-sack-nontradable').textContent !== '0') {
      boosterCrafterShortcuts.unpackNontradableGooButton.disabled = false;
   }
   craftActionElem.classList.remove('disabled');
   boosterCrafterShortcuts.addOpenerButton.disabled = false;
   openerActionElem.classList.remove('disabled');
   boosterCrafterSetOverlay(openerListElem, false);
}
async function boosterCrafterOpenBoosters() {
   async function openBooster(appid, assetid) {
      requestBody.set('appid', appid);
      requestBody.set('communityitemid', assetid);


      let response = await fetch(urlString, {
         method: 'POST',
         body: requestBody,
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
         }
      });

      let responseData = await response.json();

/*
      let responseData = {
         "success": 1,
         "rgItems": [
            {
               "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwf-xmMcXBiwb6s-bLFXn2bzKZdiWASVwxTrVcMjnbr2f35uicFjqfR74qRQFQfaEG82Qda8-BaUZrhplRu2L-lUtvGhM6TcxLcQi-lydDaOgnn3ERdJtbzyChcseKgFphbk5vXLHvVruUa4GklykmCEgyG6IEJNXCrmPh-lvL2rlk",
               "name": "zijing card",
               "series": 1,
               "foil": false
            },
            {
               "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwf-xmMcXBiwb6s-bLFXn2bzKZdiWASVwxTrVcMjnbr2f35uicFjqfR74qRQFQfaEG82Qda8-BaUZrhplRu2L-lUtvGhM6TcxLcQi-lydDaOgnn3ERdJtbzyChcseKgFphbk5vXLHvVruUa4GklykmCEgyG6IEJNXCrmPh-lvL2rlk",
               "name": "zijing card",
               "series": 1,
               "foil": false
            },
            {
               "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwb-xiP8PTwQvioKmOHWbzLj7JLibcQVhuGbBZPGjY_TL2t7zCRjucSLklS1hWe6RR82YcaJyBORA13NUJ-zH2h0p6WBQnYMFDYjCyx3UUNOB2mHhHJ5xSyiXwL8Ld1AsxO0NvWb7vU7rLZ4GixiskXB1hHfVIMY-XpmWyr4G3Z_UlCJgxuw",
               "name": "jinghuanya card",
               "series": 1,
               "foil": false
            }
         ]
      };
*/

      if(responseData.success !== 1) {
         throw 'boosterCrafterOpenBoosters(): error opening booster!';
      }

      for(let cardData of responseData.rgItems) {
         let imgUrl = cardData.image.replace(/https:\/\/community\.(akamai|cloudflare)\.steamstatic\.com\/economy\/image\//g, '');
         currentDropStats[appid][imgUrl] ??= { imgUrl: imgUrl, name: cardData.name, foil: cardData.foil, count: 0 };
         currentDropStats[appid][imgUrl].count++;
         dropStats[appid][imgUrl] ??= { imgUrl: imgUrl, name: cardData.name, foil: cardData.foil, count: 0 };
         dropStats[appid][imgUrl].count++;


         let cardElem = boosterCrafterShortcuts.lists.card.list.querySelector(`[data-img-url="${imgUrl}"]`);
         if(cardElem) {
            cardElem.dataset.qty = currentDropStats[appid][imgUrl].count;
         } else {
            let HTMLString = boosterCrafterGenerateCardListEntry({ appid: appid, imgUrl: imgUrl, qty: 1, foil: cardData.foil, name: cardData.name });

            let firstElem = boosterCrafterShortcuts.lists.card.list.querySelector(`[data-appid="${appid}"]`);
            if(firstElem) {
               firstElem.insertAdjacentHTML('beforebegin', HTMLString);
            } else {
               let entriesElem = boosterCrafterShortcuts.lists.card.list.querySelector(`.userscript-config-list-entries`);
               entriesElem.insertAdjacentHTML('beforeend', HTMLString);
            }
         }

         if(cardData.foil) {
            boosterCrafterShortcuts.foilCardCount.innerHTML = parseInt(boosterCrafterShortcuts.foilCardCount.innerHTML)+1;
         } else {
            boosterCrafterShortcuts.normalCardCount.innerHTML = parseInt(boosterCrafterShortcuts.normalCardCount.innerHTML)+1;
         }
      }
   }

   let currentDropStats = boosterCrafterData.currentDropStats;
   let dropStats = globalSettings.boosterCrafter.stats.drops;
   let openerLoaderProgressElem = document.getElementById('opener-list-progress');
   let progressCounter = 0;
   let selectedEntries = boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.selected');
   if(!selectedEntries.length) {
      selectedEntries = boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.userscript-config-list-entry');
   }

   let requestBody = new URLSearchParams({
      sessionid: steamToolsUtils.getSessionId()
   });
   let urlString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/ajaxunpackbooster/`;

   for(let entryElem of selectedEntries) {
      let appid = entryElem.dataset.appid;
      let invElem = boosterCrafterShortcuts.lists.inventory.list.querySelector(`[data-appid="${appid}"]`);
      let boosterListEntry = boosterCrafterData.boosters[appid];
      let openerListEntry = boosterCrafterData.openerList[appid];
      let {qtyTradable, qtyNontradable} = openerListEntry;
      currentDropStats[appid] ??= {};
      dropStats[appid] ??= {};

      for(let i=0; i<qtyTradable; ++i) {
         if(boosterListEntry.tradables.length === 0) {
            throw 'boosterCrafterOpenBoosters(): No boosters left in the list!';
         }

         let asset = boosterListEntry.tradables[boosterListEntry.tradables.length-1];

         await openBooster(appid, asset.assetid);
         openerListEntry.qtyTradable--;
         openerListEntry.maxTradable--;
         entryElem.dataset.qtyTradable = openerListEntry.qtyTradable;
         invElem.dataset.qtyTradable = openerListEntry.maxTradable;
         await boosterCrafterConfigSave();
         openerLoaderProgressElem.innerHTML = ++progressCounter;

         boosterListEntry.count--;
         boosterListEntry.tradableCount--;
         boosterListEntry.tradables.pop();
      }

      for(let i=0; i<qtyNontradable; ++i) {
         if(boosterListEntry.nontradables.length === 0) {
            throw 'boosterCrafterOpenBoosters(): No boosters left in the list!';
         }

         let asset = boosterListEntry.nontradables[boosterListEntry.nontradables.length-1];

         await openBooster(appid, asset.assetid);
         openerListEntry.qtyNontradable--;
         openerListEntry.maxNontradable--;
         entryElem.dataset.qtyNontradable = openerListEntry.qtyNontradable;
         invElem.dataset.qtyNontradable = openerListEntry.maxNontradable;
         await boosterCrafterConfigSave();
         openerLoaderProgressElem.innerHTML = ++progressCounter;

         boosterListEntry.count--;
         boosterListEntry.nontradableCount--;
         boosterListEntry.nontradables.pop();
      }

      if(!openerListEntry.maxTradable && !openerListEntry.maxNontradable) {
         delete boosterCrafterData.openerList[appid];
         entryElem.remove();
         invElem.remove();
      }
   }
}

function boosterCrafterSetOverlay(overlayContainerElem, overlayEnable, overlayState) {
   if(overlayEnable) {
      overlayContainerElem.classList.add('overlay');
   } else {
      overlayContainerElem.classList.remove('overlay');
   }

   if(typeof overlayState === 'string') {
      let overlayElem;
      for(let containerChildElem of overlayContainerElem.children) {
         if(containerChildElem.matches('.userscript-overlay')) {
            if(overlayElem) {
               console.warn('boosterCrafterSetOverlay(): Multiple overlay elements detected on same parent!');
            }
            overlayElem = containerChildElem;
         }
      }

      if(!overlayElem) {
         console.warn('boosterCrafterSetOverlay(): No overlay element found in immediate children!');
         return;
      }

      overlayElem.className = 'userscript-overlay ' + overlayState;
   }
}
// include language params?
function boosterCrafterGenerateBoosterListEntry(params) {
   if(!Object.hasOwn(params, 'appid')) {
      console.error('boosterCrafterGenerateBoosterListEntry(): Appid not provided!');
      return '';
   }
   let HTMLString = `<div class="userscript-config-list-entry booster" data-appid="${params.appid}"`;
   if(Object.hasOwn(params, 'tradableCount') && Object.hasOwn(params, 'nontradableCount')) {
      HTMLString += ` data-qty-tradable="${params.tradableCount}" data-qty-nontradable="${params.nontradableCount}"`;
   } else if(Object.hasOwn(params, 'price')) {
      HTMLString += ` data-cost="${params.price}"`;
      if(Object.hasOwn(params, 'available_at_time')) {
         HTMLString += ` data-cooldown-timer="∞:∞:∞"`;
      }
   }
   if(Object.hasOwn(params, 'name')) {
      HTMLString += ` title="${params.name}"`;
   }
   HTMLString += '>'
   +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${params.appid}?l=english&single=1&v=2&size=75x" alt="">`
   + '</div>';

   return HTMLString;
}
function boosterCrafterGenerateCardListEntry(params) {
   if(!Object.hasOwn(params, 'imgUrl')) {
      console.error('boosterCrafterGenerateCardListEntry(): img url string not provided!');
      return '';
   }

   let HTMLString = `<div class="userscript-config-list-entry card"`;
   if(Object.hasOwn(params, 'appid')) {
      HTMLString += ` data-appid="${params.appid}"`;
   }
   HTMLString += ` data-img-url="${params.imgUrl}"`;
   if(Object.hasOwn(params, 'qty')) {
      HTMLString += ` data-qty="${params.qty}"`;
   }
   if(params.foil) {
      HTMLString += ` data-foil=""`;
   }
   if(Object.hasOwn(params, 'name')) {
      HTMLString += ` title="${params.name}"`;
   }
   HTMLString += '>'
   +    `<img src="https://community.akamai.steamstatic.com/economy/image/${params.imgUrl}/75fx85f?allow_animated=1" alt="">`
   + '</div>';

   return HTMLString;
}

async function boosterCrafterConfigSave() {
   await SteamToolsDbManager.setToolConfig('boosterCrafter');
}
async function boosterCrafterConfigLoad() {
   let config = await SteamToolsDbManager.getToolConfig('boosterCrafter');
   if(config.boosterCrafter) {
      globalSettings.boosterCrafter = config.boosterCrafter;
      boosterCrafterLoadData();
   }
}

async function boosterCrafterConfigImportListener() {
   const isValidConfigObject = (obj) => {
      if(!steamToolsUtils.isSimplyObject(obj.lists)) {
         return false;
      } else if(!steamToolsUtils.isSimplyObject(obj.lists.favorites)) {
         return false;
      } else if(!steamToolsUtils.isSimplyObject(obj.lists.crafting)) {
         return false;
      } else if(!steamToolsUtils.isSimplyObject(obj.stats)) {
         return false;
      } else if(!steamToolsUtils.isSimplyObject(obj.stats.crafts)) {
         return false;
      } else if(!steamToolsUtils.isSimplyObject(obj.stats.drops)) {
         return false;
      }
      return true;
   }

   let importedConfig = await importConfig('boosterCrafter');
   console.log(importedConfig)
   if(!isValidConfigObject(importedConfig)) {
      throw 'boosterCrafterConfigImportListener(): Invalid imported config!';
   }

   globalSettings.boosterCrafter = importedConfig;
   boosterCrafterLoadConfig();
   boosterCrafterConfigSave();
}
async function boosterCrafterConfigExportListener() {
   exportConfig('boosterCrafter', 'SteamBoosterCrafterConfig');
}

function boosterCrafterParseCooldownDate(dateString) {
   let [monthStr, dayStr, , time] = dateString.split(' ');
   let dateNow = new Date();
   let nextYear = dateNow.getMonth() === 11 && monthStr === 'Jan';
   let newTime = time.match(/\d+/g).map(x => parseInt(x));
   if(time.endsWith('am') && time.startsWith('12')) {
      newTime[0] = 0;
   } else if(time.endsWith('pm') && !time.startsWith('12')) {
      newTime[0] += 12;
   }

   return new Date(dateNow.getFullYear()+(nextYear?1:0), MONTHS_ARRAY.indexOf(monthStr), parseInt(dayStr), newTime[0], newTime[1]);
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

   static #OUTDATED_INV_PERIOD = 2;
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
      booster: 2,
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

   getStateString() {
      return this.state === 2
      ? 'in-game' : this.state === 1
      ? 'online' : 'offline';
   }

   async getTradeFriends() { // TODO: stop profile fetching when desired profile is reached, solution to cutting down friend fetching time
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

         if(Profile.utils.isOutdatedDays(profile.last_updated, 7)) {
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
         .match(/g_rgProfileData = {[^}]+}/g)[0]
         .replace(/^g_rgProfileData = /, '');
      if(!profiledata) {
         console.error("findMoreDataForProfile(): profile data object not found!");
         return false;
      }

      profiledata = JSON.parse( profiledata.replace(/,"summary":.+(?=}$)/g, '') );

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
      profile.pfp = profiledata.querySelector('.playerAvatarAutoSizeInner > img').src.replace(/(https:\/\/avatars\.(cloudflare|akamai)\.steamstatic\.com\/)|(_full\.jpg)/g, '');
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
         let myProfile = Profile.me ?? (await Profile.findProfile(Profile.utils.getMySteamId()));

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
            dataset[appid].appid ??= parseInt(appid);
            dataset[appid].name ??= existingData.name;
            if(existingData.badges) {
               dataset[appid].badges ??= { normal: {}, foil: {} };
               for(let rarity in existingData.badges) {
                  for(let level in existingData.badges[rarity]) {
                     dataset[appid].badges[rarity][level] ??= existingData.badges[rarity][level];
                  }
               }
            }
            if(existingData.cards) {
               dataset[appid].cards ??= [];
               for(let i=0; i<existingData.cards.length; i++) {
                  for(let prop in existingData.cards[i]) {
                     dataset[appid].cards[i][prop] ??= existingData.cards[i][prop];
                  }
               }
            }
         }

         Profile.appMetaData[appid] = dataset[appid];
      }
   }

   static async saveAppMetaData(appid) {
      if(!SteamToolsDbManager || !SteamToolsDbManager.isSetup()) {
         return;
      }

      await SteamToolsDbManager.setAppData(appid, Profile.appMetaData[appid]);
   }

   // change to find app meta data
   static async updateAppMetaData(appid, newObj, loadDb=true) {
      if(!Profile.utils.isSimplyObject(newObj)) {
         console.warn('updateAppMetaData(): the data provided is not an object!');
         return;
      }

      if(!Profile.appMetaData[appid] && loadDb) {
         await Profile.findAppMetaData(appid);
      }
      if(!Profile.appMetaData[appid]) {
         Profile.appMetaData[appid] = Profile.utils.deepClone(newObj);
      } else {
         Profile.appMetaData[appid].appid ??= newObj.appid;
         Profile.appMetaData[appid].name ??= newObj.name;
         if(newObj.badges) {
            Profile.appMetaData[appid].badges ??= { normal: {}, foil: {} };
            for(let rarity in newObj.badges) {
               for(let level in newObj.badges[rarity]) {
                  Profile.appMetaData[appid].badges[rarity][level] ??= newObj.badges[rarity][level];
               }
            }
         }
         if(newObj.cards) {
            Profile.appMetaData[appid].cards ??= [];
            for(let i=0; i<newObj.cards.length; i++) {
               for(let prop in newObj.cards[i]) {
                  Profile.appMetaData[appid].cards[i][prop] ??= newObj.cards[i][prop];
               }
            }
         }
      }

      await Profile.saveAppMetaData(appid);
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
      data = data[`${this.id}_${753}_${6}`];
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

   async getProfileInventory(method="trade", refProfile, forceUpdate=false) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      await this.loadInventory();
      if(this.inventory && !Profile.utils.isOutdatedHours(this.inventory.last_updated, Profile.#OUTDATED_INV_PERIOD) && !forceUpdate) {
         return;
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

            await Profile.updateAppMetaData(desc.market_fee_app, { appid: parseInt(desc.market_fee_app), name: appname.localized_tag_name });

            asset.amount = parseInt(asset.amount);
            let assetInsertEntry = { assetid: asset.assetid, count: asset.amount };
            if(itemList[desc.market_fee_app]) { // app subgroup exists
               let classItemGroup = itemList[desc.market_fee_app].find(x => x.classid === asset.classid);
               if(classItemGroup) { // class item subgroup exists
                  if(desc.tradable) {
                     classItemGroup.tradables.push(assetInsertEntry);
                  } else {
                     classItemGroup.nontradables.push(assetInsertEntry);
                  }
                  classItemGroup.count += asset.amount;
               } else { // class item subgroup does not exist
                  itemList[desc.market_fee_app].push({
                     classid: asset.classid,
                     tradables: desc.tradable ? [assetInsertEntry]: [],
                     nontradables: desc.tradable ? [] : [assetInsertEntry],
                     count: asset.amount
                  });
               }
            } else { // app subgroup does not exist
               itemList[desc.market_fee_app] = [{
                  classid: asset.classid,
                  tradables: desc.tradable ? [assetInsertEntry]: [],
                  nontradables: desc.tradable ? [] : [assetInsertEntry],
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

   async getTradeInventory(refProf, last_itemType = undefined, count = Number.MAX_SAFE_INTEGER) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if(await this.isMe()) {
         console.warn("getTradeInventory(): Inventory fetch is user, getInventory() is recommended instead");
      } else if(typeof refProf === "string") {
         if(!(refProf = await Profile.findProfile(refProf))) {
            console.error("getTradeInventory(): Invalid profile string! Aborting...");
            return;
         }
      } else if(!(refProf instanceof Profile)) {
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
      tokenString = !tokenString || (await refProf.isFriend(this.id)) ? '' : `&token=${tokenString}`; // redo this to avoid isFriend

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

         // await Profile.utils.sleep(Profile.utils.INV_FETCH_DELAY1);
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
            await Profile.updateAppMetaData(desc.market_fee_app, { appid: parseInt(desc.market_fee_app), name: appname.localized_tag_name });

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

      // check for private profile here

      if(!doc.querySelector('.badge_gamecard_page')) {
         let meta = { appid: appid, name: null };
         // NOTE: has a different pathname for non-gamecard badges
         // if(doc.querySelector('.badge_icon')) {
         //    let badgeImg = doc.querySelector('.badge_icon').src.replace(/^.*\/public\/images\/badges\/|\.png(\?.+)?/g, '');
         //    meta.badges = { normal: {[`${badgeImg}`]: badgeImg }};
         //    meta.name = doc.querySelector('.badge_title').textContent.trim();
         // }
         await Profile.updateAppMetaData(appid, meta, false);
         return;
      }

      let rarity = foil ? 1 : 0;
      let newData = {};
      let metadata = { appid: appid, name: null, badges: { normal: {}, foil: {} }, cards: [] };
      metadata.name = doc.querySelector("a.whiteLink:nth-child(5)").textContent.trim();
      let level = doc.querySelector('.badge_info_description :nth-child(2)')?.textContent.trim().match(/\d+/g)[0];
      if(level) {
         let badgeImg = doc.querySelector('.badge_icon')
            ?.src.replace(/https:\/\/cdn\.(cloudflare|akamai)\.steamstatic\.com\/steamcommunity\/public\/images\/items\//, '')
            .replace(/^\d+\//, '').replace('.png', '');
         metadata.badges[foil?'foil':'normal'][level] = badgeImg;
      }

      newData.data = [...doc.querySelectorAll(".badge_card_set_card")].map((x, i) => {
         let count = x.children[1].childNodes.length === 5 ? parseInt(x.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
         if(isNaN(count)) {
            console.warn(`getBadgepageStock(): Error getting card count for appid ${appid} at index ${i}`);
         }
         metadata.cards[i] = {};
         metadata.cards[i].name = x.children[1].childNodes[x.children[1].childNodes.length-3].textContent.trim();
         metadata.cards[i][`img_card${rarity}`] = x.children[0].querySelector(".gamecard")
            ?.src.replace(/https:\/\/community\.(cloudflare|akamai)\.steamstatic\.com\/economy\/image\//g, '');
         let img_full = x.querySelector('.with_zoom');
         if(img_full) {
            img_full = img_full.outerHTML.match(/onclick="[^"]+"/g)[0]
               ?.replaceAll('&quot;', '"')
               ?.match(/[^/]+\.jpg/g)[0]
               ?.replace('.jpg', '');
            metadata.cards[i][`img_full${rarity}`] = img_full;
         }
         return { count: parseInt(count) };
      });
      newData.last_updated = Date.now();

      await Profile.updateAppMetaData(appid, metadata, false);
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

   let importedConfig = await importConfig('matcher');
   if(!isValidConfigObject(importedConfig)) {
      throw 'matcherConfigImportListener(): Invalid imported config!';
   }

   globalSettings.matcher = importedConfig;
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
function addSvgBlock(elem) {
   const svgString = '<div class="userscript-svg-assets">'
   +    '<svg class="solid-clr-filters">'
   +       '<filter id="filter-red" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0.8   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-red-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   1   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-green" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0.8   0 0 0 0   0   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-green-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   1   0 0 0 0   0   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   0.8   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-blue-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   1   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-dark-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0.33   0 0 0 0   0.33   0 0 0 0   0.33   0 0 0 1   0" />'
   +       '</filter>'
   +       '<filter id="filter-steam-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0.77   0 0 0 0   0.76   0 0 0 0   0.75   0 0 0 1   0" />'
   +       '</filter>'
   +          '<filter id="filter-steam-sky-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
   +          '<feColorMatrix type="matrix" values="0 0 0 0   0.328   0 0 0 0   0.6445   0 0 0 0   0.828   0 0 0 1   0" />'
   +       '</filter>'
   +    '</svg>'
   +    '<svg class="svg-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 29" fill="none">'
   +       '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z"></path>'
   +       '<path fill="currentColor"'
   +          'd="M17 12.1716 L21.5858 7.58578 L24.4142 10.4142 L15 19.8284 L5.58582 10.4142 L8.41424 7.58578 L13 12.1715 V0 H17 V12.1716 Z">'
   +       '</path>'
   +    '</svg>'
   +    '<svg class="svg-upload" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 29" fill="none">'
   +       '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z"></path>'
   +       '<path fill="currentColor"'
   +          'd="M17 7.6568 L21.5858 12.24262 L24.4142 9.4142 L15 0 L5.58582 9.4142 L8.41424 12.24262 L13 7.6568 V19.8284 H17 V7.6568 Z">'
   +       '</path>'
   +    '</svg>'
   +    '<svg class="svg-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="none">'
   +       '<path fill="currentColor"'
   +          'd="M29.12 4.41 L25.59 0.880005 L15 11.46 L4.41 0.880005 L0.880005 4.41 L11.46 15 L0.880005 25.59 L4.41 29.12 L15 18.54 L25.59 29.12 L29.12 25.59 L18.54 15 L29.12 4.41 Z">'
   +       '</path>'
   +    '</svg>'
   +    '<svg class="svg-reload" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
   +       '<path fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-miterlimit="10"'
   +          'd="M229.809 147.639 A103.5 103.5 0 1 1 211 66.75">'
   +       '</path>'
   +       '<polygon  fill="currentColor" points="147.639,108.361 245.755,10.166 245.834,108.361"></polygon>'
   +    '</svg>'
   +    '<svg class="svg-reload-2" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
   +       '<path fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-miterlimit="10"'
   +          'd="M229.809,147.639 c-9.178,47.863-51.27,84.027-101.809,84.027 c-57.253,0-103.667-46.412-103.667-103.666 S70.747,24.334,128,24.334 c34.107,0,64.368,16.472,83.261,41.895">'
   +       '</path>'
   +       '<polygon  fill="currentColor" points="147.639,108.361 245.755,10.166 245.834,108.361"></polygon>'
   +    '</svg>'
   + '</div>';

   elem.insertAdjacentHTML('afterend', svgString);
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

   if(window.location.pathname.includes('/tradingcards/boostercreator/enhanced')) {
      setupBoosterCrafter();
   }

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
