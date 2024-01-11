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

   calcStats() {
      function fillMissingItems(target, source) {
         for(let i=0; i<source.length; i++) {
            if(!target.some(x => x.classid === source[i].classid)) {
               target.push({ classid: source[i].classid, tradables: [], count: 0 });
            }
         }
      }

      let dataset1 = this.profileData1.data;
      let dataset2 = this.profileData2.data;
      for(let itemType in dataset1) {
         for(let rarity=0; rarity<dataset1[itemType].length; rarity++) {
            for(let appid in dataset2[itemType][rarity]) {
               if(!dataset1[itemType][rarity][appid]) {
                  delete dataset2[itemType][rarity][appid];
               }
            }
            for(let appid in dataset1[itemType][rarity]) {
               let set1 = dataset1[itemType][rarity][appid];
               let set2 = dataset2[itemType][rarity][appid];

               if(!set2) {
                  delete set1;
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
                  console.log("calcStats(): Set only has 1 item, nothing to compare. skipping...");
                  delete set1;
                  delete set2;
                  continue;
               }

               set1.sort((a, b) => a.classid.localeCompare(b.classid));
               set2.sort((a, b) => a.classid.localeCompare(b.classid));

               // restructure data a little bit to accomodate app-level data
               set1 = dataset1[itemType][rarity][appid] = { stock: set1 };
               set2 = dataset2[itemType][rarity][appid] = { stock: set2 };

               set1.avg = set1.stock.reduce((a, b) => a+b.count, 0.0) / set1.stock.length;
               set2.avg = set2.stock.reduce((a, b) => a+b.count, 0.0) / set2.stock.length;

               set1.avgdiff = set1.stock.map(x => x.count-set1.avg);
               set2.avgdiff = set2.stock.map(x => x.count-set2.avg);

               set1.matchbin = [...set1.avgdiff];
               set2.matchbin = [...set2.avgdiff];
               
               this.balanceVariance(set1.matchbin , set2.matchbin);

               set1.swap = set1.matchbin.map((x, i) => Math.round(x-set1.avgdiff[i]));
               set2.swap = set2.matchbin.map((x, i) => Math.round(x-set2.avgdiff[i]));
               if(set1.swap.some((x, i) => x+set2.swap[i])) {
                  console.log(set1);
                  console.log(set2);
                  throw "calcStats(): One of the sets somehow became inconsistent!";
               }
            }
         }
      }
   }
}
