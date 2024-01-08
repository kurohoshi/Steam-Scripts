class Profile {
   static MasterProfileList = [];
   static utils = steamToolsUtils;

   MAX_ITEM_COUNT = 4000;

   id;
   url;
   name;
   pfp;
   state;
   tradeToken;

   friends = [];

   INV_SIZE;
   inventory;
   hasAssetList = false;
   inv_last_updated;

   constructor(props) {
      if( !(Object.hasOwn(props, "id") || Object.hasOwn(props, "url")) ) {
         throw "new Profile(): id and url are both not provided! Profile not created.";
      }

      this.id         = props.id;
      this.url        = props.url;
      this.name       = props.name;
      this.pfp        = props.pfp;
      this.state      = props.state;
      this.tradeToken = props.tradeToken;
   }

   getTradeFriends() {
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

   isMe() {
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

   async getInventorySize() {
      if(!this.id) {
         await Profile.findMoreDataForProfile(this);
      }
      console.log(`getinventorysize(): Fetching inventory of ${this.id}`);
      let response = await fetch(`https://steamcommunity.com/inventory/${this.id}/753/6?l=english&count=1`);
      await Profile.utils.sleep(this.isMe() ? Profile.utils.INV_FETCH_DELAY1 : Profile.utils.INV_FETCH_DELAY2);
      let resdata = await response.json();
   
      this.INV_SIZE = resdata.total_inventory_count;
   }

   // should be reserved for own inv or low count inv
   async getInventory(count = Number.MAX_SAFE_INTEGER) {
      let data = [];
      let counter = 0;
      let resdata = {};

      do {

      } while(counter < count && resdata.more_items);
   }

   async getTradeInventory(count = Number.MAX_SAFE_INTEGER) {
      let data = [];
      let counter = 0;
      let resdata = {};

      // NOTE: Only shows tradable items, make sure user knows
      do {

      } while(counter < count && resdata.more);
   }

   getBadgepageStock(appid) {

   }

   getBadgepageStockAll(list) {
      
   }
}
