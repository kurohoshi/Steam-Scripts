class SteamVarMatcher {
   FOIL_MATCH     = false;
   MAX_ITEM_COUNT = 4000;    // # of items to request in a single inventory http request
   SLEEP_TIME     = 5*1000;  // delay time between http requests
   DELAY_INV_TIME = 30*1000; // delay time for inv requests

   profileid1; // Primary profile, mainly your account here
   profileid2; // Secondary profile, usually your trade partner's profileid

   friends = { ids: [], urls: [] }; // list of friends that is populated by getTradeFriends()
   profileidCache = []; // cache profileid-customURL pair from findDataFromProfileURL()

   tradeURLs = []; // populated by addTradeURL() or a list provided by user

   appidList = []; // list of apps to match, appname shouldnt interfere with remaining code, so it can be abbreviated to be shorter

   profileid1stock;
   profileid2stock;
   profileid1HasAssetList = false;
   profileid2HasAssetList = false;
   aggregate = {};
   result;

   tradeOfferParams;
   tradeOfferContents = {
      me: [],
      them: []
   };

   saveConfig() {
      // return a stringified object of configurations
   }

   loadConfig(config) {
      this.FOIL_MATCH     = config.FOIL_MATCH     || this.FOIL_MATCH;
      this.MAX_ITEM_COUNT = config.MAX_ITEM_COUNT || this.MAX_ITEM_COUNT;
      this.SLEEP_TIME     = config.SLEEP_TIME     || this.SLEEP_TIME;
      this.DELAY_INV_TIME = config.DELAY_INV_TIME || this.DELAY_INV_TIME;

      this.profileid1 = config.profileid1 || this.profileid1;
      this.profileid2 = config.profileid2 || this.profileid2;

      this.friends = config.friends || this.friends; // can get outdated quickly, safe to keep?

      if(config.tradeURLs) {
         if(!Array.isArray(config.tradeURLs)) {
            console.warn("loadConfig(): provided tradeURLs is not an array, tradeURLs not updated!");
         } else {
            for(let profile of config.tradeURLs) {
               let existingProfile = this.tradeURLs.find(x => x.id == profile.id);
               if(!existingProfile) {
                  this.tradeURLs.push(profile);
               } else {
                  existingProfile.token = profile.token;
               }
            }
         }
      }
      
      if(config.profileidCache) {
         if(!Array.isArray(config.profileidCache)) {
            console.warn("loadConfig(): provided profileidCache is not an array, profileidCache not updated!");
         } else {
            for(let profile of config.profileidCache) {
               let existingProfile = this.profileidCache.find(x => x.id == profile.id);
               if(!existingProfile) {
                  this.profileidCache.push(profile);
               } else {
                  existingProfile.url = profile.url;
               }
            }
         }
      }

      if(this.appidList) {
         this.setFilterList(config.appidList);
      }
   }

   resetData() {
      this.profileid1stock = undefined;
      this.profileid2stock = undefined;
      this.profileid1HasAssetList = false;
      this.profileid2HasAssetList = false;
      this.aggregate = undefined;
      this.result = undefined;
      this.tradeOfferParams = undefined;
      this.tradeOfferContents = { me: [], them: [] };
   }

   isSteamCommunitySite() {
      if(window.location.hostname !== "steamcommunity.com") {
         throw "Current site is not steamcommunity.com!";
      }
      return true;
   }

   getLanguage() {
      return window.g_strLanguage || 'english';
   }

   getSessionId() {
      this.isSteamCommunitySite();
      return window.g_sessionID;
   }

   getMySteamId() {
      this.isSteamCommunitySite();
      // return window.g_steamID || '76561'+(197960265728+window.g_AccountID);
      return window.g_steamID;
   }

   getSteamId64(steam3id) {
      return '76561'+(parseInt(steam3id)+197960265728);
   }

   getSteamId3(steam64id) {
      return String(parseInt(steam64id.substring(5))-197960265728);
   }

   async getTradeFriends() {
      this.isSteamCommunitySite();
      console.log("Updating friends list...");

      let url = 'https://steamcommunity.com/actions/PlayerList/?type=friends';
      console.log("getTradeFriends(): Fetching friends list");
      let response = await fetch(url);
      await this.sleep();

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      for(let profile of [...doc.querySelectorAll('.FriendBlock > .friendBlockLinkOverlay')]) {
         let profileString = profile.href.replace(/https:\/\/steamcommunity\.com\//g, '');
         if(profileString.startsWith('profiles')) {
            this.friends.ids.push( profileString.replace(/^profiles\//g, '') );
         } else if(profileString.startsWith('id')) {
            this.friends.urls.push( profileString.replace(/^id\//g, '') );
         } else {
            console.warn(`getTradeFriends(): ${profileString} is neither id or custom URL, investigate!`);
         }
      }

      console.log("Friends list updated!");
   }

   isMe() {
      return this.profileid1 === this.getMySteamId();
   }

   async isFriend(id) {
      if(this.friends.ids.some(x => x == id)) {
         return true;
      }

      let profiledata = await this.findDataFromProfileURL(id, true);
      if(this.friends.urls.some(x => x == profiledata.url)) {
         this.friends.ids.push(id); // add id to list for faster searching in the future
         return true;
      }

      return false;
   }

   addTradeURL(url) {
      url = url.trim();
      if(!/(?<=^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?)partner=\d+&token=.{8}$/.test(url)) {
         console.error("addTradeURL(): invalid trade URL, trade token not added");
         return;
      }

      let parseddata = url.match(/partner=\d+|token=.+$/g);
      let id = this.getSteamId64(parseddata[0].replace(/partner=/g, ''));
      // console.log(parseddata);
      this.tradeURLs.push({
         id: id,
         token: parseddata[1].replace(/token=/g, '')
      });
      console.log(`addTradeURL(): ${id} added to tradeURL list`);
   }

   async canTrade() {
      return this.isMe() && (await this.isFriend(this.profileid2) || this.tradeURLs.some(x => x.id == this.profileid2));
   }

   async findDataFromProfileURL(urlID, isId=false) {
      this.isSteamCommunitySite();

      let cachedProfile = isId ? this.profileidCache.find(x => x.id == urlID) : this.profileidCache.find(x => x.url == urlID);
      if(cachedProfile) {
         return cachedProfile;
      }

      let url = `https://steamcommunity.com/${isId ? 'profiles' : 'id'}/${urlID}/`;
      console.log(`findDataFromProfileURL(): Fetching profile page of ${urlID}`);
      let response = await fetch(url);
      await this.sleep();
      
      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      let profilePage = doc.querySelector('#responsive_page_template_content > script:nth-child(1)');
      if(!profilePage) {
         console.error("findDataFromProfileURL(): invalid custom URL");
         return undefined;
      }
      
      let profiledata = profilePage.textContent.match(/(?<=g_rgProfileData = ){.+}(?=;\n)/g);
      if(!profiledata) {
         console.error("findDataFromProfileURL(): profileid not found!");
         return undefined;
      }

      profiledata = JSON.parse( profiledata[0].replace(/,"summary":.+(?=}$)/g, '') );

      profiledata.url = profiledata.url.replace(/https:\/\/steamcommunity\.com\//g, '');
      if(profiledata.url.startsWith('profiles')) {
         this.profileidCache.push({ id: profiledata.steamid });
         return { id: profiledata.steamid };
      } else if(profiledata.url.startsWith('id')) {
         this.profileidCache.push({ id: profiledata.steamid, url: profiledata.url.replace(/(^id\/)|(\/$)/g, '') });
         return { id: profiledata.steamid, url: profiledata.url.replace(/(^id\/)|(\/$)/g, '') };
      } else {
         console.warn(`findDataFromProfileURL(): ${JSON.stringify(profiledata)} is neither id or custom URL, investigate!`);
      }
   }

   async setMeAndPartner(id) {
      this.isSteamCommunitySite();
      console.log("Setting profileids for trade...");

      if(/^76561\d{12}$/.test(id)) {
         if(id == this.getMySteamId()) {
            throw "setMeAndPartner(): provided id is my own id, invalid trade partner. Please use an alternative method to set profileid2 as own id.";
         }
         this.profileid2 = id;
      } else {
         let profileid = (await this.findDataFromProfileURL(id, false));
         if(!profileid) {
            throw "setMeAndPartner(): provided id is invalid!";
         } else if(profileid.id == this.getMySteamId()) {
            throw "setMeAndPartner(): provided id is my own id, invalid trade partner. Please use an alternative method to set profileid2 as own id.";
         }
         this.profileid2 = profileid.id;
      }
      this.profileid2HasAssetList = false;

      this.profileid1 = this.getMySteamId();
      this.profileid1HasAssetList = false;

      console.log("Profileids for trade set!");
   }

   setFilterList(list) {
      console.log("Setting new filter list...");

      if(!Array.isArray(list)) {
         console.warn("setFilterList(): List is not an array, filter not updated!");
         return;
      }
      for(let app of list) {
         if( !(typeof(app) === 'object' && app !== null && !Array.isArray(app)) ) {
            console.warn("setFilterList(): List element(s) are not objects, filter not updated!");
            return;
         }
         if(!app.appid || typeof(app.appid) !== 'number') {
            console.warn("setFilterList(): List element(s) missing or incorrect appid, filter not updated!");
            return;
         }
      }

      this.appidList = list;

      console.log("Filter list set!");
   }

   sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms || this.SLEEP_TIME));
   }

   async getinventorysize(id) {
      this.isSteamCommunitySite();

      let url = `https://steamcommunity.com/inventory/${id}/753/6?l=english&count=1`;
      console.log(`getinventorysize(): Fetching inventory of ${id}`);
      let response = await fetch(url);
      await this.sleep();
      let resdata = await response.json();
   
      return resdata.total_inventory_count;
   }

   // should be reserved for low count (<8000) inv and own inv
   async getinventory(id, count = Number.MAX_SAFE_INTEGER, filterList) {
      this.isSteamCommunitySite();

      if(typeof(count) != "number") {
         filterList = count;
         count = Number.MAX_SAFE_INTEGER;
      }
   
      let data = [];
      let counter = 0;
      let resdata = {};
   
      do {
         let descriptor = [];
   
         let url = `https://steamcommunity.com/inventory/${id}/753/6?l=english&count=${(count-counter < this.MAX_ITEM_COUNT) ? count-counter : this.MAX_ITEM_COUNT}${resdata.last_assetid ? `&start_assetid=${resdata.last_assetid}` : ""}`;
         console.log(`getinventory(): Fetching inventory of ${id}, starting at ${counter}`);
         let response = await fetch(url);
         if(response.status == 429) {
            throw "Steam Inventory Fetch: Too Many Requests!";
         } else if(response.status == 401) {
            throw "Steam Inventory Fetch: Missing Parameters, or Steam is complaining about nothing.";
         }
         await this.sleep(this.DELAY_INV_TIME);
         resdata = await response.json();
   
         counter += resdata.assets.length;
         
         // group up assets
         for(let asset of resdata.assets) {
            let desc = resdata.descriptions.find(x => x.classid == asset.classid && x.instanceid == asset.instanceid);
            asset.amount = parseInt(asset.amount); // change string value to integer
            if(desc) {
               if(!desc.assets) {
                  desc.assets = [asset];
                  desc.count = asset.amount;
               } else {
                  desc.assets.push(asset);
                  desc.count += asset.amount;
               }
            }
         }
   
         // append descriptions to overall descriptions list
         for(let descript of resdata.descriptions) {
            // filter out with item properties
            let itemType = descript.tags.find(x => x.category == "item_class");
            let borderType = descript.tags.find(x => x.category == "cardborder");
            if(itemType.internal_name != "item_class_2" || borderType.internal_name != `cardborder_${this.FOIL_MATCH ? "1" : "0"}`) {
               continue; 
            }

            // filter out with filterList
            if(filterList && filterList.length !== 0 && !filterList.some(x => x.appid == descript.market_fee_app)) {
               continue;
            }

            // add/update filtered data to main list
            let datadesc = data.find(x => descript.classid == x.classid);
            if(datadesc) {
               if(descript.tradable) {
                  datadesc.tradables.push(...descript.assets);
               }
               datadesc.count += descript.count;
            } else {
               data.push({
                  appid: descript.market_fee_app,
                  appname: descript.tags.find(x => x.category == "Game").localized_tag_name,
                  classid: descript.classid,
                  classname: descript.name,
                  tradables: descript.tradable ? descript.assets : [],
                  count: descript.count
               });
            }
         }
      } while(counter < count && resdata.more_items);
   
      // organize data into a list of games with name, id, and list of stock
      // console.log(data);
      return data.reduce((appList, classitem) => {
         let existingapp = appList.find(x => x.appid == classitem.appid);
         // NOTE: figure out a godd way to deal with foreign languages outside of english
         // let cardName = classitem.classname.replace(/ \((Foil )?Trading (Card)\)$/g, '');
         if(existingapp) {
            existingapp.stock.push({
               id: classitem.classid,
               name: classitem.classname,
               tradables: classitem.tradables,
               count: classitem.count
            });
         } else {
            appList.push({
               appid: classitem.appid,
               appname: classitem.appname,
               stock: [{
                  id: classitem.classid,
                  name: classitem.classname,
                  tradables: classitem.tradables,
                  count: classitem.count
               }]
            });
         }
         return appList;
      }, []);
   }

   // NOTE: Nontradables are not counted!
   // loads in 2000 item chunks
   async getTradeInventory(id, count = Number.MAX_SAFE_INTEGER, filterList = this.appidList) {
      this.isSteamCommunitySite();

      if(typeof(count) != "number") {
         filterList = count;
         count = Number.MAX_SAFE_INTEGER;
      }
   
      let data = [];
      let counter = 0;
      let resdata = {};

      // NOTE: Only shows tradable items, make sure user knows
      do {
         let descriptor = [];

         let partnerString = `?partner=${this.getSteamId3(id)}`;
         let tokenString = (await this.isFriend(id)) || !this.tradeURLs.some(x => x.id == id) ? '' : `&token=${this.tradeURLs.find(x => x.id == id).token}`;
         let currentPathSearch = window.location.pathname + window.location.search;
         window.history.replaceState(null, '', '/tradeoffer/new/' + partnerString + tokenString);

         let url = `https://steamcommunity.com/tradeoffer/new/partnerinventory/?l=${this.getLanguage()}&sessionid=${this.getSessionId()}&partner=${id}&appid=753&contextid=6${resdata.more ? `&start=${resdata.more_start}` : ""}`;
         console.log(`getTradeInventory(): Fetching inventory of ${id}, starting at ${resdata.more ? `${resdata.more_start}` : "0"}`);
         let response = await fetch(url);
         if(response.status == 429) {
            throw "Steam Inventory Fetch: Too Many Requests!";
         } else if(response.status == 401) {
            throw "Steam Inventory Fetch: Missing Parameters, or Steam is complaining about nothing.";
         }

         window.history.replaceState(null, '', currentPathSearch);
         
         await this.sleep(this.DELAY_INV_TIME);
         resdata = await response.json();

         counter += Object.keys(resdata.rgInventory).length;

         // group up assets
         for(let asset of Object.values(resdata.rgInventory)) {
            let desc = resdata.rgDescriptions[`${asset.classid}_${asset.instanceid}`];
            asset.appid = 753;
            asset.contextid = "6";
            asset.assetid = asset.id;
            asset.amount = parseInt(asset.amount); // change string value to integer
            if(desc) {
               if(!desc.assets) {
                  desc.assets = [asset];
                  desc.count = asset.amount;
               } else {
                  desc.assets.push(asset);
                  desc.count += asset.amount;
               }
            }
         }

         // append descriptions to overall descriptions list
         for(let descript of Object.values(resdata.rgDescriptions)) {
            if(descript.tags === undefined) {
               continue;
            }
            // filter out with item properties
            let itemType = descript.tags.find(x => x.category == "item_class");
            let borderType = descript.tags.find(x => x.category == "cardborder");
            if(itemType.internal_name != "item_class_2" || borderType.internal_name != `cardborder_${this.FOIL_MATCH ? "1" : "0"}`) {
               continue; 
            }

            // filter out with filterList
            if(filterList && filterList.length !== 0 && !filterList.some(x => x.appid == descript.market_fee_app)) {
               continue;
            }

            let datadesc = data.find(x => descript.classid == x.classid);
            if(datadesc) {
               if(descript.tradable) {
                  datadesc.tradables.push(...descript.assets);
               }
               datadesc.count += descript.count;
            } else {
               data.push({
                  appid: parseInt(descript.market_fee_app),
                  appname: descript.tags.find(x => x.category == "Game").name,
                  classid: descript.classid,
                  classname: descript.name,
                  tradables: descript.tradable ? descript.assets : [],
                  count: descript.count
               });
            }
         }
      } while(counter < count && resdata.more);
      
      // organize data into a list of games with name, id, and list of stock
      return data.reduce((appList, classitem) => {
         let existingapp = appList.find(x => x.appid == classitem.appid);
         // NOTE: figure out a godd way to deal with foreign languages outside of english
         // let cardName = classitem.classname.replace(/ \((Foil )?Trading (Card)\)$/g, '');
         if(existingapp) {
            existingapp.stock.push({
               id: classitem.classid,
               name: classitem.classname,
               tradables: classitem.tradables,
               count: classitem.count
            });
         } else {
            appList.push({
               appid: classitem.appid,
               appname: classitem.appname,
               stock: [{
                  id: classitem.classid,
                  name: classitem.classname,
                  tradables: classitem.tradables,
                  count: classitem.count
               }]
            });
         }
         return appList;
      }, []);
   }

   async getProfile1Stock(method="badge") {
      if(!this.profileid1) {
         console.error("getProfile1Stock(): profileid1 not set!");
         return;
      }
      if(!this.appidList) {
         console.warn("getProfile1Stock(): appidList not set!");
         if(method == "badge") {
            console.error("getProfile1Stock(): unable to grab badgepages with empty appidList!");
            return;
         }
      }

      if(method == "badge") {
         this.profileid1stock = await this.getAllStock(this.profileid1, this.appidList);
         this.profileid1HasAssetList = false;
      } else if(method == "trade") {
         this.profileid1stock = await this.getTradeInventory(this.profileid1, this.appidList);
         this.profileid1HasAssetList = true;
      } else if(method == "inventory") {
         if(this.profileid1 != this.getMySteamId() && (await this.getinventorysize()) > this.MAX_ITEM_COUNT*2) {
            console.warn(`getProfile1Stock(): profile has more than ${this.MAX_ITEM_COUNT*2} items, rate limit might be hit`);
         }

         this.profileid1stock = await this.getinventory(this.profileid1, this.appidList);
         this.profileid1HasAssetList = true;
      } else {
         console.error("getProfile1Stock(): invalid method of obtaining stock!");
      }
   }

   async getProfile2Stock(method="badge") {
      if(!this.profileid2) {
         console.error("getProfile2Stock(): profileid2 not set!");
         return;
      }
      if(!this.appidList) {
         console.warn("getProfile2Stock(): appidList not set!");
         if(method == "badge") {
            console.error("getProfile1Stock(): unable to grab badgepages with empty appidList!");
            return;
         }
      }

      if(method == "badge") {
         this.profileid2stock = await this.getAllStock(this.profileid2, this.appidList);
         this.profileid2HasAssetList = false;
      } else if(method == "trade") {
         this.profileid2stock = await this.getTradeInventory(this.profileid2, this.appidList);
         this.profileid2HasAssetList = true;
      } else if(method == "inventory") {
         if(this.profileid2 != this.getMySteamId() && (await this.getinventorysize()) > this.MAX_ITEM_COUNT*2) {
            console.warn(`getProfile2Stock(): profile has more than ${this.MAX_ITEM_COUNT*2} items, rate limit might be hit`);
         }

         this.profileid2stock = await this.getinventory(this.profileid2, this.appidList);
         this.profileid2HasAssetList = true;
      } else {
         console.error("getProfile2Stock(): invalid method of obtaining stock!");
      }
   }

   async getstock(id, appid) {
      let url = `https://steamcommunity.com/profiles/${id}/gamecards/${appid}/${this.FOIL_MATCH ? "?border=1" : ""}`;
      console.log(`getstock(): getting badgepage of app ${appid} from profile ${id}`);
      let response = await fetch(url);
      await this.sleep();
   
      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");
   
      return [...doc.querySelectorAll('.badge_card_set_card > :nth-child(2)')].map(x => {
         let namenum = x.textContent.trim();
         let tmp = x.querySelector('.badge_card_set_text_qty');
         if(tmp) {
            namenum = namenum.replace(/\(\d+\)\n\t+/g, '');
            tmp = Number(tmp.textContent.replace(/[()]/g, ''));
         }
         else {
            tmp = 0;
         }
         return { name: namenum, count: tmp };
      });
   }
   
   // should return a list of games of stock
   async getAllStock(id, list) {
      let stockList = [];
      for(let game of list) {
         let stock = await this.getstock(id, game.appid);
         if(!stock.some(x => x.count)) {
            continue;
         }
         stockList.push({
            appid: game.appid,
            appname: game.appname,
            stock: stock
         });
      }
      return stockList;
   }

   // Partner1 cards should be ordered lowest to highest.
   //    - (matchPriority 0) Having lowest matching first prioritizes set completion.
   //    - (matchPriority 1) Having highest matching first prioritizes getting rid of most dupes.
   //    - (goodSamaritan false) Benefit both parties.
   //    - (goodSamaritan true) Benefit the opposite party.
   varbalance(partner1, partner2, matchPriority = 0, goodSamaritan = false) {
      if(partner1.length != partner2.length) {
         console.error("varbalance(): Mismatch numcards!");
         return;
      }

      let bin1 = partner1.map((x, i) => [i, matchPriority ? -x : x]).sort((a, b) => a[1]-b[1]);
      let bin2 = partner2.map((x, i) => [i, matchPriomatchPriority ? -x : x]).sort((a, b) => b[1]-a[1]);
      let numcards = partner1.length;
      // console.log(bin1);
      // console.log(bin2);

      for(let i=0; i<numcards; i++) {
         for(let j=0; j<numcards;) {
            if(i==j) {
               j++;
               continue;
            }

            let bin2_i = bin2.findIndex(x => x[0]==bin1[i][0]);
            let bin2_j = bin2.findIndex(x => x[0]==bin1[j][0]);

            // compare variance change before and after swap for both parties
            // [<0] good swap (variance will decrease)
            // [=0] neutral swap (variance stays the same)
            // [>0] bad swap (variance will increase)

            // simplified from (x1+1)**2+(x2-1)**2 ?? x1**2 + x2**2  -->  x1-x2+1 ?? 0
            let bin1vardiff = Math.sign(      bin1[i][1]      -bin1[j][1]+1);
            // simplified from (x1-1)**2+(x2+1)**2 ?? x1**2 + x2**2  --> -x1+x2+1 ?? 0
            let bin2vardiff = Math.sign(-bin2[bin2_i][1] +bin2[bin2_j][1]+1);

            // accept the swap if variances for either parties is lowered, but not if both variances doesn't change, otherwise continue to next card to be compared
            if( ((goodSamaritan || bin1vardiff<=0) && bin2vardiff<=0) && !(bin1vardiff==0 && bin2vardiff==0) ) {
               bin1[i][1]++;
               bin1[j][1]--;
               bin2[bin2_i][1]--;
               bin2[bin2_j][1]++;
               // console.log(`${i} ${j} ${bin1[i]}   ${bin1[j]}   ${bin2[i][1]}   ${bin2[j][1]}`); // debug output

               // reorder if current card's quantity is lower/higher than next card's quantity
               if(i<numcards-1) {
                  if(bin1[i][1]>bin1[i+1][1]) {
                     let tmp = bin1[i];
                     bin1[i] = bin1[i+1];
                     bin1[i+1] = tmp;
                  }
                  if(bin2[i][1]<bin2[i+1][1]) {
                     let tmp = bin2[i];
                     bin2[i] = bin2[i+1];
                     bin2[i+1] = tmp;
                  }
               }
            } else {
               j++;
            }
         }
      }

      // console.log(bin1);
      // console.log(bin2);
      bin1.sort((a, b) => a[0]-b[0]);
      bin2.sort((a, b) => a[0]-b[0]);
      for(let i=0; i<numcards; i++) {
         partner1[i] = matchPriority ? -bin1[i][1] : bin1[i][1];
         partner2[i] = matchPriority ? -bin2[i][1] : bin2[i][1];
      }
   }

   async matchWithBadgepage() {
      this.isSteamCommunitySite();
      console.log("Getting and matching invetories or badgepages...");

      if(!this.profileid1 || !this.profileid2) {
         throw "matchWithBadgepage(): profileid(s) not set!";
      }

      if(!this.appidList) {
         console.warn("matchWithBadgepage(): No filterList, will match every game");
      }
      
      this.resetData();

      await this.getProfile1Stock(this.isMe() ? "inventory" : "badge");
      if(!this.profileid1stock) {
         console.error("matchWithBadgepage(): profile1 stock not found!");
         return;
      }
   
      // use partner2 badgepages to get correct ordering of cards in the set
      await this.getProfile2Stock("badge");
      if(!this.profileid2stock) {
         console.error("matchWithBadgepage(): profile2 stock not found!");
         return;
      }
   
      // sort the order of cards for partner1 and add in 0 stock for missing cards, balance cards
      for(let game of this.profileid1stock) {
         let partner2game = this.profileid2stock.find(x => x.appid == game.appid);
         if(!partner2game) {
            continue;
         }

         // NOTE: Need to iron out some bugs, such as same name string...
         game.stock = partner2game.stock.map(x => {
            let card = game.stock.find(y => !x.name.localeCompare(y.name));
            if(!card) {
               console.log(`Non-matching or missing card: ${x.name}`);
            }
            
            return card || {name: x.name, count: 0};
         });
         // console.log(game.stock);
   
         let numcards = partner2game.stock.length;
   
         game.avg = game.stock.reduce((a, b) => a+b.count, 0.0) / numcards;
         partner2game.avg = partner2game.stock.reduce((a, b) => a+b.count, 0.0) / numcards;
   
         game.avgdiff = game.stock.map(x => x.count-game.avg); 
         partner2game.avgdiff = partner2game.stock.map(x => x.count-partner2game.avg);
   
         // create copies to avoid modifying original avgdiff
         game.bin = [...game.avgdiff];
         partner2game.bin = [...partner2game.avgdiff];
         this.varbalance(game.bin, partner2game.bin);
   
         // reverse order to give priority to partner2 to complete sets
         this.varbalance(partner2game.bin, game.bin);
   
         // reverse again to give priority back to partner1 and rebalance 1 last time to even out top dupes
         this.varbalance(game.bin, partner2game.bin, 1);
         game.balance = game.bin.map((x, i) => Math.round(x-game.avgdiff[i]));
         // console.log(game);
      }
   
      this.result = this.profileid1stock
         .sort((a, b) => a.appname.localeCompare(b.appname))
         .filter(x => x.balance && x.balance.some(y => y))
         .map(x => ({appid: x.appid, name: x.appname, swap: x.balance}));

      console.log("Finished balancing!");
      // return this.result; // in case we want to return the result
   }

   async matchWithInventoryOnly() {
      this.isSteamCommunitySite();
      console.log("Getting and matching invetories...");

      if(!this.profileid1 || !this.profileid2) {
         throw "matchWithInventoryOnly(): profileid(s) not set!";
      }

      if(!this.appidList || this.appidList.length === 0) {
         console.warn("matchWithInventoryOnly(): No filterList, will match every game");
      }

      this.resetData();

      await this.getProfile1Stock(this.isMe() ? "inventory" : "trade");
      if(!this.profileid1stock) {
         console.error("matchWithInventoryOnly(): profile1 stock not found!");
         return;
      }

      await this.getProfile2Stock("trade");
      if(!this.profileid2stock) {
         console.error("matchWithInventoryOnly(): profile2 stock not found!");
         return;
      }
      
      for(let game of this.profileid1stock) {
         let partner2game = this.profileid2stock.find(x => x.appid == game.appid);
         if(!partner2game) {
            continue;
         }

         // populate each other's missing cards
         for(let i=0; i<game.stock.length || i<partner2game.stock.length; i++) {
            if(i<game.stock.length && !partner2game.stock.find(x => x.id == game.stock[i].id)) {
               partner2game.stock.push({ id: game.stock[i].id, name: game.stock[i].name, tradables: [], count: 0 });
            }
            if(i<partner2game.stock.length && !game.stock.find(x => x.id == partner2game.stock[i].id)) {
               game.stock.push({ id: partner2game.stock[i].id, name: partner2game.stock[i].name, tradables: [], count: 0 });
            }
         }

         if(game.stock.length != partner2game.stock.length) {
            console.error("matchWithInventoryOnly(): Mismatch number of distinct cards between profiles. Skipping!");
            continue;
         }

         game.stock.sort((a, b) => a.name.localeCompare(b.name));
         partner2game.stock.sort((a, b) => a.name.localeCompare(b.name));
         
         let numcards = game.stock.length;

         game.avg = game.stock.reduce((a, b) => a+b.count, 0.0) / numcards;
         partner2game.avg = partner2game.stock.reduce((a, b) => a+b.count, 0.0) / numcards;

         game.avgdiff = game.stock.map(x => x.count-game.avg); 
         partner2game.avgdiff = partner2game.stock.map(x => x.count-partner2game.avg);

         game.bin = [...game.avgdiff];
         partner2game.bin = [...partner2game.avgdiff];
         this.varbalance(game.bin, partner2game.bin);
   
         game.balance = game.bin.map((x, i) => ({ id: game.stock[i].id, name: game.stock[i].name, count: Math.round(x-game.avgdiff[i])}));
         // console.log(game);
      }

      this.result = this.profileid1stock
         .sort((a, b) => a.appname.localeCompare(b.appname))
         .filter(x => x.balance && x.balance.some(y => y.count))
         .map(x => ({ appid: x.appid, name: x.appname, swap: x.balance }));

      console.log("Finished balancing!");
      // return this.result; // in case we want to return the result
   }

   async startMatch(id, customMessage) {
      this.isSteamCommunitySite();
      this.resetData();

      if(!id && (this.profileid1 !== this.getMySteamId() || !this.profileid2)) {
         console.error("startMatch(): id not provided and profileids are not set correctly! Exiting...");
         return;
      }

      if(id) {
         await this.setMeAndPartner(id);
      }
      
      if(!this.friends.ids.length && !this.friends.urls.length) {
         await this.getTradeFriends();
      }

      await this.matchWithInventoryOnly();
      await this.setupTradeOffer(customMessage || "This offer was generated by script for 1:1 balancing, please verify the contents and counter/decline if needed. Thanks!");
   }

   // NOTE: maybe split up result to show more clearly what profileid1 and profileid2 need to trade
   printResult() {
      if(!this.profileid1stock || !this.profileid2stock || !this.result) {
         console.error("printResult(): Missing inventory information! Maybe run startMatch() again?");
         return;
      }
      console.log(`Profileid1: ${this.profileid1}`);
      console.log(this.profileid1stock);
      console.log(`Profileid2: ${this.profileid2}`);
      console.log(this.profileid2stock);
      console.log(this.result.map(game => `${String(game.appid).padEnd(7)} - ${game.name.padEnd(20)}\n` + (typeof(game.swap[0]) == 'number'
         ? `   ${game.swap.map(num => String(num).padStart(4)).join(',')}`
         : game.swap.filter(x => x.count).map(card => `  ${String(card.count).padStart(3)} : ${card.name}`).join('\n')
      )).join('\n')); // prints out result somewhat formatted
   }

   // Should use 1/n*Sum(x^2) - Avg^2 for faster calculation
   // But since JS doesnt have true integers, this doesnt matter... probably...
   calcVariance() {
      console.log("Calculating variance for results...");

      if(!this.result) {
         console.error("calcVariance(): Missing results to calculate variance from!");
      }
      this.result.forEach(game => {
         let stock1 = this.profileid1stock.find(x => x.appid == game.appid);
         let stock2 = this.profileid2stock.find(x => x.appid == game.appid);

         if(!stock1 || !stock2) {
            throw "calcVariance(): Game cannot be found in original stock!";
         }

         game.variance = [
            [
               stock1.avgdiff.reduce((sum, x) => sum + x**2, 0.0) / stock1.avgdiff.length,
               stock1.avgdiff.reduce((sum, x, i) => sum + (x+(typeof(game.swap[i]) == 'number' ? game.swap[i] : game.swap[i].count))**2, 0.0) / stock1.avgdiff.length,
            ],
            [
               stock2.avgdiff.reduce((sum, x) => sum + x**2, 0.0) / stock2.avgdiff.length,
               stock2.avgdiff.reduce((sum, x, i) => sum + (x-(typeof(game.swap[i]) == 'number' ? game.swap[i] : game.swap[i].count))**2, 0.0) / stock2.avgdiff.length,
            ]
         ];
      });

      console.log("Variance calculated!");
   }

   checkVariance() {
      for(let game of this.result) {
         if(!game.variance) {
            console.warn(`verifyVariance(): Missing variance for ${game.name}`);
         }
         if(game.variance[0][0]>game.variance[0][1]) {
            console.warn(`verifyVariance(): [${this.profileid1}] increased variance (${game.variance[0][0]}->${game.variance[0][1]}) for ${game.name}`);
         }
         if(game.variance[1][0]>game.variance[1][1]) {
            console.warn(`verifyVariance(): [${this.profileid2}] increased variance (${game.variance[1][0]}->${game.variance[1][1]}) for ${game.name}`);
         }
      }
   }

   aggregateCardNames() {
      if(!this.profileid1stock || !this.profileid2stock) {
         console.error("aggregateNames(): Missing inventory information! Maybe run startMatch() again?");
         return;
      }

      this.aggregate = {};

      // aggregate card names for name-based matching
      for(let game of this.profileid1stock) {
         if(!this.aggregate[String(game.appid)]) {
            this.aggregate[String(game.appid)] = new Set();
         }
         for(let stock of game.stock) {
            this.aggregate[String(game.appid)].add(stock.name);
         }
      }
      for(let game of this.profileid2stock) {
         if(!this.aggregate[String(game.appid)]) {
            this.aggregate[String(game.appid)] = new Set();
         }
         for(let stock of game.stock) {
            this.aggregate[String(game.appid)].add(stock.name);
         }
      }
   }

   async setupTradeOffer(message='', reverse=true) {
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

      console.log("Setting up Trade Offer...");

      let generateTradeOfferContents = (reverse=true) => {
         this.tradeOfferContents = { me: [], them: [] };

         let assetList = this.result.reduce((assetList, game) => {
            let list = game.swap.reduce((list, diff, diffIndex) => {
               if(diff.count < 0) { // get tradable assets from me
                  let profileid1game = this.profileid1stock.find(x => x.appid == game.appid);
                  for(let i=diff.count; i<0; i++) { // assume each asset is of amount 1, otherwise a separate variable would need to be used to track amount added to offer
                     let assetIndex = reverse ? profileid1game.stock[diffIndex].tradables.length+i : i-diff.count;
                     if(assetIndex < 0) {
                        throw "generateTradeOfferContents(): Not enough tradable assets to select!";
                     } else if(assetIndex >= profileid1game.stock[diffIndex].tradables.length) {
                        console.log(profileid1game);
                        throw "generateTradeOfferContents(): Tradable assets out of range! Needs to be investigated!";
                     }
                     list.me.push(profileid1game.stock[diffIndex].tradables[assetIndex]);
                     let tradeContent = this.tradeOfferContents.me.find(x => x.appid == game.appid && x.classid == diff.id);
                     if(tradeContent) {
                        tradeContent.assets.push(profileid1game.stock[diffIndex].tradables[assetIndex].assetid);
                     } else {
                        this.tradeOfferContents.me.push({ appid: game.appid, appname: game.name, classid: diff.id, cardname: diff.name, assets: [profileid1game.stock[diffIndex].tradables[assetIndex].assetid] });
                     }
                  }
               } else if(diff.count > 0) { // get tradable assets from partner
                  let profileid2game = this.profileid2stock.find(x => x.appid == game.appid);
                  for(let i=0; i<diff.count; i++) { // assume each asset is of amount 1, otherwise a separate variable would need to be used to track amount added to offer
                     let assetIndex = reverse ? (profileid2game.stock[diffIndex].tradables.length-diff.count)+i : i;
                     if(assetIndex < 0) {
                        throw "generateTradeOfferContents(): Not enough tradable assets to select!";
                     } else if(assetIndex >= profileid2game.stock[diffIndex].tradables.length) {
                        console.log(profileid2game);
                        throw "generateTradeOfferContents(): Tradable assets out of range! Needs to be investigated!";
                     }
                     list.them.push(profileid2game.stock[diffIndex].tradables[assetIndex]);
                     let tradeContent = this.tradeOfferContents.them.find(x => x.appname == game.name && x.classid == diff.id);
                     if(tradeContent) {
                        tradeContent.assets.push(profileid2game.stock[diffIndex].tradables[assetIndex].assetid);
                     } else {
                        this.tradeOfferContents.them.push({ appid: game.appid, appname: game.name, classid: diff.id, cardname: diff.name, assets: [profileid2game.stock[diffIndex].tradables[assetIndex].assetid] });
                     }
                  }
               }
               return list;
            }, { me: [], them: [] });

            assetList.me.push(...list.me);
            assetList.them.push(...list.them);
            return assetList;
         }, { me: [], them: [] });

         assetList.me = assetList.me.map(x => ({ appid: x.appid, contextid: x.contextid, amount: x.amount, assetid: x.assetid}));
         assetList.them = assetList.them.map(x => ({ appid: x.appid, contextid: x.contextid, amount: x.amount, assetid: x.assetid}));
         this.tradeOfferContents.me.sort((a, b) => a.appname.localeCompare(b.appname) || a.cardname.localeCompare(b.cardname) || a.assets.length-b.assets.length);
         this.tradeOfferContents.them.sort((a, b) => a.appname.localeCompare(b.appname) || a.cardname.localeCompare(b.cardname) || a.assets.length-b.assets.length);

         return {
            newversion: true,
            version: assetList.me.length + assetList.them.length + 1,
            me: {
               assets: assetList.me,
               currecy: [],
               ready: false
            },
            them: {
               assets: assetList.them,
               currecy: [],
               ready: false
            }
         }
      }

      let generateTradeOfferCreateParams = async () => {
         // preliminary checks means profile2 is either friend or has trade token
         return (await this.isFriend(this.profileid2))
            ? {}
            : { trade_offer_access_token: this.tradeURLs.find(x => x.id == this.profileid2).token };
      }

      if(!this.profileid1HasAssetList || !this.profileid2HasAssetList) {
         console.error("setupTradeOffer(): At least one profile does not have asset list, trade offer will not be constructed. Aborting!");
         return;
      }
      if(!(await this.canTrade())) {
         console.error("setupTradeOffer(): profile1 is not me, or profile2 is not friend, or token for profile2 cannot be found. Aborting!");
         return;
      }
      if(this.result.length == 0) {
         console.error("setupTradeOffer(): no match results, cannot make empty trade offer. Exitiing...");
         return;
      }
      if(!this.profileid1stock.some(x => x.balance)) {
         console.error("setupTradeOffer(): balancing has not been done. Aborting!");
         return;
      }

      this.tradeOfferParams = {
         sessionid: this.getSessionId(),
         serverid: 1,
         partner: this.profileid2,
         tradeoffermessage: String(message),
         json_tradeoffer: generateTradeOfferContents(reverse),
         captcha: "",
         trade_offer_create_params: (await generateTradeOfferCreateParams())
      }

      this.validateTradeOffer();

      console.log("Trade Offer setup finished!");
   }

   tallyTradeOfferCardCount() {
      this.tradeOfferContents.totals = [];

      this.tradeOfferContents.me.reduce((tallies, item) => {
         let gameTally = tallies.find(x => x.appid == item.appid);
         if(gameTally) {
            gameTally.me += item.assets.length;
         } else {
            tallies.push({ appid: item.appid, name: item.appname, me: item.assets.length });
         }
         return tallies;
      }, this.tradeOfferContents.totals);
      this.tradeOfferContents.them.reduce((tallies, item) => {
         let gameTally = tallies.find(x => x.appid == item.appid);
         if(gameTally) {
            gameTally.them = (gameTally.them === undefined) ? item.assets.length : gameTally.them+item.assets.length;
         } else {
            tallies.push({ appid: item.appid, name: item.appname, them: item.assets.length });
         }
         return tallies;
      }, this.tradeOfferContents.totals)

      this.tradeOfferContents.totals.sort((a, b) => a.name.localeCompare(b.name));
   }

   validateTradeOffer() {
      console.log("Validating Trade Offer contents...");

      this.tallyTradeOfferCardCount();
      this.calcVariance();

      for(let game of this.tradeOfferContents.totals) {
         if(game.me === undefined || game.them === undefined) {
            throw "validateTradeOffer(): One or more games not present on both sides!";
         } else if(game.me !== game.them) {
            throw `validateTradeOffer(): Card count from ${game.name} are different!`;
         }

         let swapResult = this.result.find(x => x.appid == game.appid);
         if(!swapResult) {
            throw `validateTradeOffer(): ${game.name} result not found, something is very wrong!`;
         } else if(!swapResult.variance) {
            throw `validateTradeOffer(): ${game.name} variance values not found!`;
         }

         let varDiff1 = (swapResult.variance[0][1]-swapResult.variance[0][0]).toPrecision(5);
         let varDiff2 = (swapResult.variance[1][1]-swapResult.variance[1][0]).toPrecision(5);
         console.log(`${game.name} Variance Change:\n`
            + `   Profile ${this.profileid1}: %c${varDiff1}%c`
            + `   Profile ${this.profileid2}: %c${varDiff2}%c`,
            `color: ${varDiff1<=0 ? "green": "red"}`, "color: white",
            `color: ${varDiff2<=0 ? "green": "red"}`, "color: white"
         );
         if(varDiff1 > 0) {
            console.warn(`validateTradeOffer(): Profileid1's variance for ${game.name} increased!`);
         }
         if(varDiff2 > 0) {
            console.warn(`validateTradeOffer(): Profileid2's variance for ${game.name} increased!`);
         }
      }

      console.log("Trade Offer contents validated, no serious problems found");
   }

   printTradeOfferCardCount() {
      if(!this.tradeOfferContents.totals) {
         console.error("printTradeOfferCardCount(): totals for trade offer contents not found, try running tallyTradeOfferCardCount()?");
      }
      console.table(this.tradeOfferContents.totals);
   }

   // https://www.trustedsec.com/blog/setting-the-referer-header-using-javascript
   async sendTradeOffer(params=this.tradeOfferParams) {
      if(!params) {
         console.error("sendTradeOffer(): trade offer params not provided, trade offer will not be sent!");
         return;
      }

      console.log("The following assets will be used in trade offer:");
      console.log(params.json_tradeoffer);
      let input = window.prompt(`Please review trade offer contents in console.\nSend trade offer to ${this.profileid2}? (y/n)`);
      if(input === null || input.toLowerCase() != 'y') {
         console.log("sendTradeOffer(): Trade offer will not be sent, exiting...");
      }

      console.log("Sending trade offer...");

      let partnerString = `?partner=${this.getSteamId3(this.profileid2)}`;
      let tokenString = (await this.isFriend(this.profileid2)) ? '' : `&token=${this.tradeURLs.find(x => x.id == this.profileid2).token}`;
      let body = new URLSearchParams();
      for(let [key, val] of Object.entries(params)) {
         body.append(key, typeof(val)==='object' ? JSON.stringify(val) : val);
      }

      let currentPathSearch = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', '/tradeoffer/new/' + partnerString + tokenString);

      let response = await fetch('https://steamcommunity.com/tradeoffer/new/send', {
         method: "POST",
         body: body,
         headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
         },
         referer: `https://steamcommunity.com/tradeoffer/new/${partnerString + tokenString}`,
      });

      window.history.replaceState(null, '', currentPathSearch);

      if(response.status !== 200) {
         console.error("sendTradeOffer(): Something went wrong, please investigate request!");
      } else {
         console.log("sendTradeOffer(): Offer sent! Don't forget to confirm offer to send.")
      }
   }

   async sendTradeOfferSingle() {
      if(!this.tradeOfferParams) {
         console.error("sendTradeOffer(): trade offer params not set, trade offer will not be sent!");
         return;
      }

      let input = Number(window.prompt("Which game to send swap offer?\n" + this.tradeOfferContents.totals.map((x, i) => `${i+1}. ${x.name}`).join('\n')));
      if(!Number.isInteger(input)) {
         console.error("sendTradeOfferSingle(): input is not an integer, trade offer will not be sent!");
         return;
      }
      if(input <= 0 || input > this.tradeOfferContents.totals.length) {
         console.error("sendTradeOfferSingle(): input is not a valid option, trade offer will not be sent!");
         return;
      }
      let selectedAppidContentsMe = this.tradeOfferContents.me.filter(x => x.appid === this.tradeOfferContents.totals[input-1].appid);
      let selectedAppidContentsThem = this.tradeOfferContents.them.filter(x => x.appid === this.tradeOfferContents.totals[input-1].appid);

      let newTradeParams = JSON.parse(JSON.stringify(this.tradeOfferParams));
      newTradeParams.json_tradeoffer.me.assets = newTradeParams.json_tradeoffer.me.assets.filter(asset => selectedAppidContentsMe.some(card => card.assets.includes(asset.assetid)));
      newTradeParams.json_tradeoffer.them.assets = newTradeParams.json_tradeoffer.them.assets.filter(asset => selectedAppidContentsThem.some(card => card.assets.includes(asset.assetid)));
      newTradeParams.json_tradeoffer.version = newTradeParams.json_tradeoffer.me.assets.length + newTradeParams.json_tradeoffer.them.assets.length + 1;

      await this.sendTradeOffer(newTradeParams);
   }
}
