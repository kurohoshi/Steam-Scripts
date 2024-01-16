// Multiple instances of matcher doesn't make sense, so making it a class isn't needed
let Matcher = {
   UPDATE_PERIOD: 24*60*60, // in seconds
   MAX_MATCH_ITER: 4,
   matchResultsList: {},
   utils: steamToolsUtils,
   setInventories: async function(profile1, profile2) {
      function* iterateItemSets() {
         for(let type in this.data) {
            for (let rarity=0; rarity<this.data[type].length; rarity++) {
               for(let appid in this.data[type][rarity]) {
                  yield [this.data[type][rarity][appid], appid, rarity, type];
               }
            }
         }
      }

      async function fetchInventory(profile) {
         if(typeof profile === 'string') {
            let found;
            if(/76561\d{12}/.test(profile)) {
               if(!(found = Profile.MasterProfileList.find(x => x.id === profile))) {
                  console.log(`matcher.fetchInventory(): No profile found for ${profile}. Creating new profile...`);
                  found = Profile.addNewProfile({id: profile});
               }
            }
            if(!found) {
               if(!(found = Profile.MasterProfileList.find(x => x.url === profile))) {
                  console.log(`matcher.fetchInventory(): No profile found for ${profile}. Creating new profile...`);
                  found = Profile.addNewProfile({url: profile});
               }
            }
            if(!found) {
               throw "matcher.fetchInventory(): Unable to create a new Profile instance!";
            }
            profile = found;
         }
         
         if(!(profile instanceof Profile)) {
            throw "matcher.fetchInventory(): Incorrect profile datatype!";
         }

         if(!profile.inventory || profile.inventory.last_updated<(Date.now()-this.UPDATE_PERIOD)) {
            await profile.getProfileInventory();
         }

         let inventory = this.utils.deepClone(profile.inventory);
         inventory.itemsets = iterateItemSets;
         inventory.meta = {profileid: profile.id};
         return inventory;
      }

      if(profile1 === undefined) {
         throw "matcher.setInventories(): No profiles provided. inventories not set!";
      } else if(profile2 === undefined) {
         profile2 = profile1;
         profile1 = this.utils.getMySteamId();
      }

      this.inventory1 = await fetchInventory(profile1);
      this.inventory2 = await fetchInventory(profile2);

      if(this.matchResultsList[this.inventory1.meta.id]) {
         if(this.matchResultsList[this.inventory1.meta.id][this.inventory2.meta.id]) {
            console.warn(`matcher.setInventories(): Item Matcher for ${this.inventory1.meta.id}-${this.inventory2.meta.id} already exists!`);
         }
         this.matchResultsList[this.inventory1.meta.id][this.inventory2.meta.id] = {};
      } else {
         this.matchResultsList[this.inventory1.meta.id] = { [this.inventory2.meta.id]: {} };
      }
   },
   match: function() {
      function fillMissingItems(target, source) {
         for(let i=0; i<source.length; i++) {
            if(!target.some(x => x.classid === source[i].classid)) {
               target.push({ classid: source[i].classid, tradables: [], count: 0 });
            }
         }
      }

      this.matchResultsList[this.inventory1.meta.id][this.inventory2.meta.id] = {
         inventory1: this.inventory1,
         inventory2: this.inventory2,
         results: {}
      };

      for (let [set1, appid, rarity, itemType] of this.inventory1.itemsets()) {
         let set2 = this.profileData2.data[itemType][rarity][appid];               

         if(!set2) {
            continue;
         }

         fillMissingItems(set1, set2);
         fillMissingItems(set2, set1);

         if(set1.length !== set2.length) {
            console.error(`match(): Item type ${itemType} from app ${appid} does not have equal length of items, cannot be compared!`);
            console.log(set1);
            console.log(set2);
            delete set1;
            delete set2;
            continue;
         } else if(set1.length === 1) {
            console.log(`match(): Item type ${itemType} from app ${appid} only has 1 item, nothing to compare. skipping...`);
            delete set1;
            delete set2;
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
            let balanceResult = this.balanceVariance((flip ? swapset2 : swapset1), (flip ? swapset1 : swapset2));
            if(!balanceResult.some((x, i) => x)) {
               break;
            }

            for(let x=0; x<swap.length; x++) {
               swap[x] += (flip ? -balanceResult[x] : balanceResult[x]);
            }
            for(let y=0; y<balanceResult.history.length; y++) {
               history.push([balanceResult.history[y][flip], balanceResult.history[y][1-flip]]);
            }
         }

         // validate results here

         this.matchResultsList[this.inventory1.meta.id][this.inventory2.meta.id].results[`${itemType}_${rarity}_${appid}`] = { swap, history };
      }
   },
   // Using Var(x) = E[x^2] + avg(x)^2 or Var(x) = E[(x-avg(x))^2] yields the same comparison formula for swapping, as expected
   // NOTE: this method shouldn't modify the original arrays, otherwise we're in big trouble!
   balanceVariance: function(set1, set2, matchPriority=0, helper=false) {
      if(!Array.isArray(set1) || !Array.isArray(set2) || set1.some(x => typeof x !== "number") || set2.some(x => typeof x !== "number") || set1.length !== set2.length) {
         console.error("balanceVariance(): Invalid sets! Sets must be an array of numbers with the same length!");
         return;
      }

      let bin1 = set1.map((x, i) => [i, matchPriority ? -x : x]).sort((a, b) => a[1]-b[1]);
      let bin2 = set2.map(x => matchPriority ? -x : x);
      let setlen = set1.length;
      let history = [];

      for(let i=0; i<setlen; i++) {
         for(let j=0; j<setlen; ) {
            if(i===j) { // don't match same item
               j++;
               continue;
            }

            // compare variance change before and after swap for both parties
            // [<0] good swap (variance will decrease)
            // [=0] neutral swap (variance stays the same)
            // [>0] bad swap (variance will increase)

            // simplified from (x1+1)**2+(x2-1)**2 ?? x1**2 + x2**2  -->  x1-x2+1 ?? 0
            let bin1vardiff =        bin1[i][1]       -bin1[j][1] +1;
            // simplified from (x1-1)**2+(x2+1)**2 ?? x1**2 + x2**2  --> -x1+x2+1 ?? 0
            let bin2vardiff = -bin2[bin1[i][0]] +bin2[bin1[j][0]] +1;

            // console.log(`${bin1vardiff} ${bin2vardiff}`);
            // accept the swap if variances for either parties is lowered, but not if both variances doesn't change, otherwise continue to next card to be compared
            if (((helper || bin1vardiff <= 0) && bin2vardiff <= 0) && !(bin1vardiff === 0 && bin2vardiff === 0)) {
               bin1[i][1]++;
               bin1[j][1]--;
               bin2[bin1[i][0]]--;
               bin2[bin1[j][0]]++;
               history.push([bin1[j][0], bin1[i][0]]);
               // console.log(`${i} ${j}  ${bin1vardiff} ${bin2vardiff}   ${bin1[bin2[i][0]]}   ${bin1[bin2[j][0]]}   ${bin2[i][1]}   ${bin2[j][1]}`); // debug output

               // swap if current card's quantity is lower/higher or equal than next/prev card's quantity
               if(i<setlen-1 && bin1[i][1]>=bin1[i+1][1]) {
                  let tmp   = bin1[i];
                  bin1[i]   = bin1[i+1];
                  bin1[i+1] = tmp;
               }
               if(j>0 && bin1[j][1]<=bin1[j-1][1]) {
                  let tmp   = bin1[j];
                  bin1[j]   = bin1[j-1];
                  bin1[j-1] = tmp;
               }
            } else {
               j++;
            }
         }
      }

      return {
         swap: bin1.map((x, i) => (matchPriority ? -x : x) - set1[i]),
         history
      };
   }
}
