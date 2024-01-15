class ItemMatcher {
   static matchResultsList = {};
   static datasetcache = {};
   static utils = steamToolsUtils;
   
   profileData1;
   profileData2;

   constructor(profile1, profile2) {
      if(!(profile1 instanceof Profile) || !(profile2 instanceof Profile)) {
         throw "new ItemMatcher(): One or both profiles are not of class Profile. ItemMatcher instance not created";
      }
      this.profileData1 = Profile.utils.deepClone(profile1.inventory);
      this.profileData2 = Profile.utils.deepClone(profile2.inventory);
      this.profileData1.meta = { profileid: profile1.id } 
      this.profileData1.meta = { profileid: profile1.id }
   }

   private createInventoryIterators() {
      function* iterateItemSets() {
         for(let type in this.data) {
            for (let rarity=0; rarity<this.data[type].length; rarity++) {
               for(let appid in this.data[type][rarity]) {
                  yield [this.data[type][rarity][appid], appid, rarity, type];
               }
            }
         }
      }

      this.profileData1.itemsets = iterateItemSets;
      this.profileData2.itemsets = iterateItemSets;
   }

   match() {
      function fillMissingItems(target, source) {
         for(let i=0; i<source.length; i++) {
            if(!target.some(x => x.classid === source[i].classid)) {
               target.push({ classid: source[i].classid, tradables: [], count: 0 });
            }
         }
      }

      ItemMatcher.matchResultsList[profile1.id][profile2.id] = {};

      for (let [set1, appid, rarity, itemType] of this.profileData1.itemsets()) {
         let set2 = this.profileData2.data[itemType][rarity][appid];               

         if(!set2) {
            continue;
         }

         fillMissingItems(set1, set2);
         fillMissingItems(set2, set1);

         if(set1.length !== set2.length) {
            console.error(`calcStats(): Item type ${itemType} from app ${appid} does not have equal length of items, cannot be compared!`);
            console.log(set1);
            console.log(set2);
            delete set1;
            delete set2;
            continue;
         } else if(set1.length === 1) {
            console.log(`calcStats(): Item type ${itemType} from app ${appid} only has 1 item, nothing to compare. skipping...`);
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
            let balanceResult = ItemMatcher.balanceVariance((flip ? swapset2 : swapset1), (flip ? swapset1 : swapset2));
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

         ItemMatcher.matchResultsList[profile1.id][profile2.id][`${itemType}_${rarity}_${appid}`] = { swap, history };
      }
   }





               }
            }
         }
      }

      return {
         swap: bin1.map((x, i) => (matchPriority ? -x : x) - set1[i]),
         history
      };
   }
}
