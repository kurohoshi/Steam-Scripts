// TODO: figure out a good item description catalog

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
