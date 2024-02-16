// Multiple instances of matcher doesn't make sense, so making it a class isn't needed
let Matcher = {
   UPDATE_PERIOD: 24*60*60, // in seconds
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
   setBadgeList: async function(list) {
      if(!list) {
         let myProf = await Profile.findProfile(this.getMySteamId());
         this.badgeList = await myProf.getApplistFromBadgepage();
      } else {
         if(typeof list !== "object"  || Array.isArray(list) || list === null) {
            console.warn("setBadgeList(): Invalid list provided, list not set!");
            return;
         } else if(!list.normal && !list.foil) {
            console.warn("setBadgeList(): Missing list properties, list not set!");
            return;
         }

         this.badgeList = { normal: [], foil: [] };
         if(list.normal) {
            if(Array.isArray(list.normal)) {
               this.badgeList.normal = this.utils.deepClone(list.normal);
            } else {
               console.warn("setBadgeList(): List normal property is not an array, skipping!");
            }
         }
         if(list.foil) {
            if(Array.isArray(list.foil)) {
               this.badgeList.foil = this.utils.deepClone(list.foil);
            } else {
               console.warn("setBadgeList(): List foil property is not an array, skipping!");
            }
         }
      }
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

      let found = await Profile.findProfile(profile);
      
      if(!found) {
         throw `matcher.getInventory(): Profile ${profile} is invalid!`;
      }

      if(!found.inventory || found.inventory.last_updated<(Date.now()-this.UPDATE_PERIOD)) {
         await found.getProfileInventory("trade", ref);
         if(!found.inventory) {
            throw `matcher.getInventory(): Getting inventory for ${profile} failed!`;
         }
      }

      let inventory = this.utils.deepClone(found.inventory);
      inventory.itemsets = itemSetsIter;
      inventory.meta = { profileid: found.id };
      return inventory;
   },
   getBadgeCards: async function(profile, list) {
      if(!list) {
         throw "getBadgeCards(): List not provided!"
      }

      let found = await Profile.findProfile(profile);
      if(!found) {
         throw `getBadgeCards(): Profile ${profile} is invalid!`;
      } 

      await found.getBadgepageStockAll(list.normal);
      await found.getBadgepageStockAll(list.foil, true);

      return{
         data: this.utils.deepClone(found.badgepages),
         meta: { profileid: found.id }
      } 
   },
   matchInv: async function(profile1, profile2, helper=false) {
      let fillMissingItems = (target, source) => {
         for(let i=0; i<source.length; i++) {
            if(!target.some(x => x.classid === source[i].classid)) {
               target.push({ classid: source[i].classid, tradables: [], count: 0 });
            }
         }
      }

      if(profile1 === undefined) {
         throw "matchInv(): No profiles provided. inventories not set!";
      } else if(profile2 === undefined) {
         profile2 = profile1;
         profile1 = this.utils.getMySteamId();
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
            continue;
         }

         if(!inventory2.data[itemType] || !inventory2.data[itemType][rarity] || !inventory2.data[itemType][rarity][appid]) {
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
            console.log(`matchInv(): Item type ${itemType} from app ${appid} only has 1 item, nothing to compare. skipping...`);
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
            if(!balanceResult.swap.some((x, i) => x)) {
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
      this.validate(inventory1.meta.profileid, inventory2.meta.profileid);
   },
   matchBadge: async function(profile1, profile2, list=this.badgeList, helper=false) {
      if(profile1 === undefined) {
         throw "matchBadge(): No profiles provided. inventories not set!";
      } else if(profile2 === undefined) {
         profile2 = profile1;
         profile1 = this.utils.getMySteamId();
      }

      let list1;
      let list2;
      let results = [ {}, {} ];

      try {
         if(!list) {
            await this.setBadgeList();
            list = this.badgeList;
         }

         list1 = await this.getBadgeCards(profile1, list);
         list2 = await this.getBadgeCards(profile2, list);
      } catch(e) {
         console.error(e);
         return;
      }

      if(this.matchResultsList[list1.meta.profileid]) {
         if(this.matchResultsList[list1.meta.profileid][list2.meta.profileid]) {
            console.warn(`matchBadge(): Item Matcher for ${list1.meta.profileid}-${list2.meta.profileid} already existed!`);
         }
         this.matchResultsList[list1.meta.profileid][list2.meta.profileid] = {};
      } else {
         this.matchResultsList[list1.meta.profileid] = { [list2.meta.profileid]: {} };
      }

      this.matchResultsList[list1.meta.profileid][list2.meta.profileid] = {
         inventory1: { card: list1 },
         inventory2: { card: list2 },
         results: {}
      };

      for(let rarity of list1.data) {
         for(let appid in list1.data[rarity]) {
            let set1 = list1.data[rarity][appid].data.sort((a, b) => a.index - b.index).map(x => x.count);
            
            if(!list2.data[rarity]) {
               break;
            } else if(!list2.data[rarity][appid]) {
               continue;
            }

            let set2 = list2.data[rarity][appid].data.sort((a, b) => a.index - b.index).map(x => x.count);
            if(set1.length !== set2.length) {
               console.warn(`matchBadge(): Sets for appid ${appid} for profiles ${list1.meta.profileid} and ${list2.meta.profileid} are not same length, skipping...`);
               continue;
            } else if(!set1.some(x => x) || !set2.some(x => x)) {
               console.log("matchBadge(): No cards to swap for at least 1 profile, skipping...");
               continue;
            }

            let swap = Array(set1.length).fill(0);
            let history = [];

            set1.sort((a, b) => a.index - b.index);
            set2.sort((a, b) => a.index - b.index);

            for (let i = 0; i<this.MAX_MATCH_ITER; i++) {
               let flip = !!(i%2);
               let swapset1 = set1.map((x, i) => x.count + swap[i]);
               let swapset2 = set2.map((x, i) => x.count - swap[i]);
               let balanceResult = this.balanceVariance((flip ? swapset2 : swapset1), (flip ? swapset1 : swapset2), helper);
               if(!balanceResult.swap.some((x, i) => x)) {
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
               this.matchResultsList[list1.meta.profileid][list2.meta.profileid].results[`card_${rarity}_${appid}`] = { swap, history };
            }
         }
      }

      this.matchResultsList[list1.meta.profileid][list2.meta.profileid].tradable = false;
      this.validate(list1.meta.profileid, list2.meta.profileid);
   },
   // Using Var(x) = E[x^2] + avg(x)^2 or Var(x) = E[(x-avg(x))^2] yields the same comparison formula for swapping, as expected
   // NOTE: this method shouldn't modify the original arrays, otherwise we're in big trouble!
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
         let end = max<=setlen ? max : setlen;
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

            // console.log(`${bin1vardiff} ${bin2vardiff}`);
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
               // console.log(`${i} ${j}  ${bin1vardiff} ${bin2vardiff}   ${bin1[bin2[i][0]]}   ${bin1[bin2[j][0]]}   ${bin2[i][1]}   ${bin2[j][1]}`); // debug output
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
   filter: function(profileid1, profileid2, itemTypeRarity = [], appids = []) {
      if(!this.exists(profile1, profile2, 1)) {
         return;
      }

      let filtered = {};
      for(let [category, set] of Object.entries(this.matchResultsList[profileid1][profileid2].results)) {
         if(itemTypeRarity.some(x => category.startsWith(x)) || appids.some(x => category.endsWith(x))) {
            filtered[category] = this.utils.deepClone(set);
         }
      }

      return filtered;
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
}
