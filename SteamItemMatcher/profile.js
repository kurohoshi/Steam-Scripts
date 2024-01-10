class Profile {
   static MasterProfileList = [];
   static BadgepageData = {}; // Could be put into its own class
   static appMetaData = {}; // Can be put into its own class
   static itemDescriptions = {}; // Can be put into its own class
   static utils = steamToolsUtils;

   static MAX_ITEM_COUNT = 4000;
   static ITEM_TYPE_MAP = {
      item_class_2: "card",
      item_class_3: "background",
      item_class_4: "emoticon",
      item_class_5: "booster",
      item_class_7: "gem",
      item_class_8: "profile_mod",
      item_class_10: "sale_item",
      item_class_11: "sticker",
      item_class_12: "chat_effect",
      item_class_13: "mini_profile",
      item_class_14: "profile_frame",
      item_class_15: "animated_avatar"
   }
   static ITEM_RARITY_MAP = {
      droprate_0: 0,
      droprate_1: 1,
      droprate_2: 2,
      cardborder_0: 0,
      cardboard_1: 1
   }

   id;
   url;
   name;
   pfp;
   state;
   tradeToken;

   friends = [];

   inventory;
   badgepages = {};

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
      function addToList(props, prop) {
         let foundMaster = Profile.MasterProfileList.find(x => x[prop] === props[prop]);
         if(!foundMaster) {
            let newProf = Profile.addNewProfile(props);
            if(newProf !== undefined) {
               this.friends.push(newProf);
            }
         } else {
            this.friends.push(foundMaster);
         }
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
            addToList(newProps, "id");
         } else if(profileString.startsWith('id')) {
            newProps.url = profileString.replace(/^id\//g, '');
            addToList(newProps, "url");
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
      if(this.friends.some(x => x.id === profile.id || x.url === profile.url)) {
         return true;
      }
      await Profile.findMoreDataForProfile(profile);
      if(this.friends.some(x => x.id === profile.id || x.url === profile.url)) {
         return true;
      }

      return false;
   }

   static addNewProfile(props) {
      try {
         Profile.MasterProfileList.push(new Profile(props));
         return Profile.MasterProfileList[Profile.MasterProfileList.length-1];
      } catch(e) {
         console.error(e);
      } finally {
         return undefined;
      }
   }

   static async findMoreDataForProfile(profile) {
      let urlID = profile.id || profile.url;
      console.log(`findMoreDataForProfile(): Fetching profile page of ${urlID}`);
      let response = await fetch(`https://steamcommunity.com/${profile.id !== undefined ? 'profiles' : 'id'}/${urlID}/`);
      await Profile.utils.sleep(Profile.utils.FETCH_DELAY);

      let parser = new DOMParser();
      let doc = parser.parseFromString(await response.text(), "text/html");

      let profilePage = doc.querySelector('#responsive_page_template_content > script:nth-child(1)');
      if(!profilePage) {
         console.error("findMoreDataForProfile(): invalid URL");
         return undefined;
      }
      
      let profiledata = profilePage.textContent.match(/(?<=g_rgProfileData = ){.+}(?=;\n)/g);
      if(!profiledata) {
         console.error("findMoreDataForProfile(): profile data object not found!");
         return undefined;
      }

      profiledata = JSON.parse( profiledata[0].replace(/,"summary":.+(?=}$)/g, '') );

      profiledata.url = profiledata.url.replace(/https:\/\/steamcommunity\.com\//g, '');
      switch(true) {
         case profiledata.url.startsWith('id'):
            profile.id = profiledata.steamid;
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
   }

   async canTrade(partner) {
      return (await this.isFriend(partner) || partner.tradeToken !== undefined);
   }

   static addTradeURL(url) {
      url = url.trim();
      if(!/(?<=^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?)partner=\d+&token=.{8}$/.test(url)) {
         console.error("addTradeURL(): invalid trade URL, trade token not added");
         return;
      }

      let parsedData = url.match(/partner=\d+|token=.+$/g);
      let id = Profile.utils.getSteamProfileId64(parseddata[0].replace(/partner=/g, ''));
      let token = parsedData[1].replace(/token=/g, '');

      let profile = Profile.MasterProfileList.find(x => x.id === id);
      if(!profile) {
         Profile.addNewProfile({id: id, tradeToken: token});
      } else {
         profile.tradeToken = token;
      }

      console.log(`addTradeURL(): Trade token added to ${id}.`);
   }

   /***********************************************************************/
   /***************************** App Methods *****************************/
   /***********************************************************************/
   updateAppMetaData(appid, key, val) {
      if(!Profile.appMetaData[appid]) {
         Profile.appMetaData[appid] = {};
      }
      Profile.appMetaData[appid][key] = val;
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
   resetInventory() {
      // subset of inventory item type is rarity
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
   async getInventory(count = Number.MAX_SAFE_INTEGER) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if(!(await this.isMe())) {
         console.warn("getInventory(): Inventory fetch is not user, careful of rate limits!");
      }

      this.resetInventory();

      let data = [];
      let counter = 0;
      let resdata = {};

      do {
         console.log(`getinventory(): Fetching inventory of ${this.id}, starting at ${counter}`);
         let response = await fetch("https://steamcommunity.com/inventory/" + this.id + "/753/6?"
            + "l=" + Profile.utils.getSteamLanguage()
            + "&count=" + ( (count-counter < this.MAX_ITEM_COUNT) ? count-counter : this.MAX_ITEM_COUNT )
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

            let itemList = this.inventory.data[this.ITEM_TYPE_MAP[itemType.internal_name]][this.ITEM_RARITY_MAP[rarity.internal_name]];
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
      } while(counter < count && resdata.more_items);

      this.inventory.size = resdata.total_inventory_count;
      this.inventory.last_updated = Date.now();
      this.inventory.tradable_only = false;
   }

   async getTradeInventory(myProf, count = Number.MAX_SAFE_INTEGER) {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }

      if(await this.isMe()) {
         console.warn("getTradeInventory(): Inventory fetch is user, getInventory() is recommended instead");
      } else if(!(myProf instanceof Profile)) {
         console.error("getTradeInventory(): Inventory fetch is not user, but own profile was not provided! Aborting...");
         return;
      }

      this.resetInventory();

      let data = [];
      let counter = 0;
      let resdata = { more_start: 0 };

      let currentPathSearch = window.location.pathname + window.location.search;
      let partnerString = `?partner=${Profile.utils.getSteamProfileId3(this.id)}`;
      let tokenString = (await this.isMe()) ? undefined : myProf.tradeURLs.find(x => x.id === this.id);
      tokenString = !tokenString || (await myProf.isFriend(this.id)) ? '' : `&token=${tokenString.token}`;

      // NOTE: Only shows tradable items, make sure user knows
      do {
         console.log(`getTradeInventory(): Fetching inventory of ${this.id}, starting at ${resdata.more_start}`);
         let response;
         if(await this.isMe()) {
            response = await fetch(`https://steamcommunity.com/profiles/${this.id}/inventory/json/753/6/?l=${this.getLanguage()}&trading=1${resdata.more ? `&start=${resdata.more_start}` : ""}`);
         } else {
            window.history.replaceState(null, '', '/tradeoffer/new/' + partnerString + tokenString);
            response = await fetch(`https://steamcommunity.com/tradeoffer/new/partnerinventory/?l=${this.getLanguage()}&sessionid=${this.getSessionId()}&partner=${this.id}&appid=753&contextid=6${resdata.more ? `&start=${resdata.more_start}` : ""}`);
            window.history.replaceState(null, '', currentPathSearch);
         }
         if(response.status == 429) {
            throw "Steam Inventory Fetch: Too Many Requests!";
         } else if(response.status == 401) {
            throw "Steam Inventory Fetch: Missing Parameters, or Steam is complaining about nothing.";
         }

         await Profile.utils.sleep((await this.isMe()) ? Profile.utils.INV_FETCH_DELAY1 : Profile.utils.INV_FETCH_DELAY2);
         resdata = await response.json();

         for(let asset of Object.values(resdata.rgInventory)) {
            let desc = resdata.rgDescriptions[`${asset.classid}_${asset.instanceid}`];

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

            let itemList = this.inventory.data[this.ITEM_TYPE_MAP[itemType.internal_name]][this.ITEM_RARITY_MAP[rarity.internal_name]];
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
               }]
            }

            this.updateItemDescription(desc.classid, desc);
         }
      } while(counter < count && resdata.more);

      this.inventory.size = null;
      this.inventory.last_updated = Date.now();
      this.inventory.tradable_only = true;
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
   
      this.badgepages[appid] = {};
      this.badgepages[appid].data = [...doc.querySelectorAll(".badge_card_set_card")].map(x => {
         let count = x.children[1].childNodes.length === 5 ? parseInt(x.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
         let seriesNum = parseInt( x.children[2].textContent.trim().replace(/ of \d+, Series 1$/g, '') );
         if( !Profile.BadgepageData[appid] ) {
            Profile.BadgepageData[appid] = {
               img: x.children[0].querySelector(".gamecard").src.replace(/https\:\/\/community\.akamai\.steamstatic\.com\/economy\/image\//g, ''),
               name: x.children[1].childNodes[x.children[1].childNodes.length-3].textContent.trim(),
               seriesNum: seriesNum
            };
         }
         return { seriesNum: seriesNum, count: count};
      });
      this.badgepages[appid].last_updated = Date.now();
   }

   async getBadgepageStockAll(list) {
      for(let appid of list) {
         await this.getBadgepageStock(appid);
      }
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
