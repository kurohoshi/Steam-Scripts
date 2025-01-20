/* How sorting should be calculated: higher level priority sets a number
 *   each recurring levels of priority shift number with the least number of bit required
 *   to encompass all options for that category then adding the lower level priority
 *   to the shifted number
 *   Max bits available: 32 bits (because of how bitwise operations work in js)
 *   Max bits using x*2^n operation to shift: 52 bits
 *
 * sort methods:
 *   0: if the category exists (1 bit) (unsorted)
 *   1: alphabetical by tag name (depends on number of tagnames)
 *   2: alphabetical by localized name (depends on number of tagnames)
 *   3: custom tag priority (depends on number of custom tags listed)
 *   4: custom classid priority list (should be a small list)
 *
 * priority range:
 *   0: reserved for special cases (just in case)
 *   len+1: reserved for ones that are not able to be set to a priority
 */


const INVENTORY_ITEM_PRIORITY = {
    priorityCatalog: {
        "753": {
            priority: [
                { method: 3, category: 'item_class',  reverse: false },
                { method: 4, category: 'gems',       reverse: false }, // default behaviour doesnt sort
                { method: 2, category: 'Game',       reverse: false }, // default behaviour is 1
                { method: 1, category: 'cardborder', reverse: true  }, // foil cards first
                { method: 1, category: 'droprate',   reverse: false },
            ],
            gems: [
                { classid: '667924416', priority: 1 }, // Gems
                { classid: '667933237', priority: 2 }, // Sack of Gems
            ],
            item_class: {
                item_class_2: 3, item_class_3: 4,
                item_class_4: 5, item_class_5: 2, item_class_7: 1,
            }
        },
        "440": {
            priority: [
                // { method: 4, category: 'currency', reverse: false },
                { method: 3, category: 'Type',   reverse: false },
                { method: 1, category: 'Class',  reverse: false },
                { method: 3, category: 'Rarity', reverse: true }
            ],
            currency: [
                { classid: '101785959', priority: 1 }, // TF2 key
                { classid: '2674',      priority: 2 }, // Refined Metal
                { classid: '5564',      priority: 3 }, // Reclaimed Metal
                { classid: '2675',      priority: 4 }, // Scrap Metal
            ],
            Type: {
                primary: 1, // primary weapons
                secondary: 2, // secondary weapons
                melee: 3, // melee weapons
                misc: 4, // (cosmetics) mainly headwear, but need to test to make sure
                "Craft Item": 5, // metals
                "Supply Crate": 6, // crates
                TF_T: 7 // keys
            },
            Quality: {
                rarity4: 1,        strange: 2, collectors: 3,
                paintkitweapon: 4, vintage: 5, haunted: 6,
                rarity1: 7,        Unique: 8,
                // selfmade???
            }
        },
        "730": {
            priority: [
                { method: 3, category: 'Type',           reverse: false },
                { method: 3, category: 'Weapon',         reverse: false },
                { method: 3, category: 'Quality',        reverse: true },
                { method: 3, category: 'Rarity',         reverse: true },
                { method: 0, category: 'KeychainCapsule', reverse: true },
                { method: 0, category: 'StickerCapsule',  reverse: true },
                { method: 0, category: 'PatchCapsule',   reverse: true },
                { method: 0, category: 'SprayCapsule',   reverse: true },
                { method: 2, category: 'ItemSet',        reverse: false },
                { method: 1, category: 'TournamentTeam', reverse: false },
                { method: 1, category: 'SprayColorCategory', reverse: false },
            ],
            Type: {
                CSGO_Type_Knife: 1,      Type_Hands: 2,
                CSGO_Type_Pistol: 3,     CSGO_Type_SMG: 4,
                CSGO_Type_Rifle: 5,      CSGO_Type_SniperRifle: 6,
                CSGO_Type_Shotgun: 7,    CSGO_Type_Machinegun: 8,
                CSGO_Type_WeaponCase: 9, CSGO_Type_WeaponCase_KeyTag: 10,
                CSGO_Type_Keychain: 11,  CSGO_Tool_Sticker: 12,
                CSGO_Tool_Patch: 13,     CSGO_Type_Spray: 14,
                Type_CustomPlayer: 15,
            },
            Weapon: {
                // pistols
                weapon_cz75a: 1,     weapon_deagle: 2,   weapon_elite: 3,
                weapon_fiveseven: 4, weapon_glock: 5,    weapon_hkp2000: 6,
                weapon_p250: 7,      weapon_revolver: 8, weapon_tec9: 9,
                weapon_usp_silencer: 10,
                // rifles
                weapon_ak47: 1,          weapon_aug: 2,  weapon_famas: 3, weapon_galilar: 4,
                weapon_m4a1_silencer: 5, weapon_m4a1: 6, weapon_sg556: 7,
                // sniper rifles
                weapon_awp: 1, weapon_g3sg1: 2, weapon_scar20: 3, weapon_ssg08: 4,
                // SMGs
                weapon_mac10: 1, weapon_mp5sd: 2, weapon_mp7: 3, weapon_mp9: 4,
                weapon_bizon: 5, weapon_p90: 6, weapon_ump45: 7,
                // shotguns
                weapon_mag7: 1, weapon_nova: 2, weapon_sawedoff: 3, weapon_xm1014: 4,
                // machineguns
                weapon_m249: 1, weapon_negev: 2,
                // knives
                weapon_bayonet: 1,      weapon_knife_survival_bowie: 2, weapon_knife_butterfly: 3,
                weapon_knife_css: 4,    weapon_knife_falchion: 5,       weapon_knife_flip: 6,
                weapon_knife_gut: 7,    weapon_knife_tactical: 8,       weapon_knife_karambit: 9,
                weapon_knife_kukri: 10, weapon_knife_m9_bayonet: 11,    weapon_knife_gypsy_jackknife: 12,
                weapon_knife_outdoor: 13, weapon_knife_cord: 14,        weapon_knife_push: 15,
                weapon_knife_skeleton: 16, weapon_knife_stiletto: 17,   weapon_knife_canis: 18,
                weapon_knife_widowmaker: 19, weapon_knife_ursus: 20,
                // taser
                weapon_taser: 1,
            },
            Rarity: {
                // weapon rarity
                Rarity_Common_Weapon: 1,    Rarity_Uncommon_Weapon: 2,
                Rarity_Rare_Weapon: 3,      Rarity_Mythical_Weapon: 4,
                Rarity_Legendary_Weapon: 5, Rarity_Ancient_Weapon: 6,
                // sticker/patch rarity
                Rarity_Common: 1,   Rarity_Rare: 2,
                Rarity_Mythical: 3, Rarity_Legendary: 4,
                Rarity_Ancient: 5,  Rarity_Contraband: 6,
                // character rarity
                Rarity_Rare_Character: 1,      Rarity_Mythical_Character: 2,
                Rarity_Legendary_Character: 3, Rarity_Ancient_Character: 4,
            },
            Quality: {
                normal: 1, tournament: 2, strange: 3, unusual: 4, unusual_strange: 5,
            }
        },
    },
    toSorted: function(appid, inventory, descriptions) {
        if(!Array.isArray(inventory) && !steamToolsUtils.isSimplyObject(inventory)) {
            console.error('INVENTORY_ITEM_PRIORITY.sort(): inventory is not an array or object, returning unsorted inventory...');
            return inventory;
        }

        if(INVENTORY_ITEM_PRIORITY.priorityCatalog[appid] === undefined) {
            console.warn('INVENTORY_ITEM_PRIORITY.sort(): priority rules not set, returning unsorted inventory as an array...');
            return Array.isArray(inventory) ? inventory : Object.values(inventory);
        }

        let appPriorityData = INVENTORY_ITEM_PRIORITY.priorityCatalog[appid];
        let categoriesNeeded = {}; // will contain tag entries already sorted

        // WARNING: careful of shallow copy here
        // WARNING: Object.entries() is probably not terribly efficient here, so avoid large objects or optimize later
        let priorities = appPriorityData.priority.map((priorityCategory) => {
            if(priorityCategory.method === 0) {
                priorityCategory.priorityMap = null;
            } else if(priorityCategory.method === 1) {
                priorityCategory.priorityMap = new Map();
                priorityCategory.maxPriority = 0;
                categoriesNeeded[priorityCategory.category] ??= [];
            } else if(priorityCategory.method === 2) {
                priorityCategory.priorityMap = new Map();
                priorityCategory.maxPriority = 0;
                categoriesNeeded[priorityCategory.category + '_local'] ??= [];
            } else if(priorityCategory.method === 3) {
                priorityCategory.priorityMap = new Map();
                priorityCategory.maxPriority = 0;
                for(let tagname in appPriorityData[priorityCategory.category]) {
                    let priorityNum = appPriorityData[priorityCategory.category][tagname];
                    if(priorityNum > priorityCategory.maxPriority) {
                        priorityCategory.maxPriority = priorityNum;
                    }
                }
            } else if(priorityCategory.method === 4) {
                priorityCategory.priorityMap = new Map();
                priorityCategory.maxPriority = 0;
                for(let entry of appPriorityData[priorityCategory.category]) {
                    if(entry.priority > priorityCategory.maxPriority) {
                        priorityCategory.maxPriority = entry.priority;
                    }
                }
            }

            return priorityCategory;
        });

        // first pass to get tags
        for(let classInstance in descriptions) {
            if(!descriptions[classInstance].tags) {
                continue;
            }

            for(let tag of descriptions[classInstance].tags) {
                if(categoriesNeeded[tag.category]) {
                    if(INVENTORY_ITEM_PRIORITY.containsSortedObjectArray(categoriesNeeded[tag.category], tag.internal_name, 'internal_name')) {
                        continue;
                    }
                    INVENTORY_ITEM_PRIORITY.insertSortedObjectArray(categoriesNeeded[tag.category], tag, 'internal_name');
                } else if(categoriesNeeded[tag.category + '_local']) {
                    if(INVENTORY_ITEM_PRIORITY.containsSortedObjectArray(categoriesNeeded[tag.category + '_local'], tag.name, 'name')) {
                        continue;
                    }
                    INVENTORY_ITEM_PRIORITY.insertSortedObjectArray(categoriesNeeded[tag.category + '_local'], tag, 'name');
                }
            }
        }

        // pass through priorities again to generate priority values for methods 1 and 2
        for(let priorityCategory of priorities) {
            if(priorityCategory.method === 1) {
                let categoryList = categoriesNeeded[priorityCategory.category];
                for(let i=0, len=categoryList.length; i<len; i++) {
                    priorityCategory.priorityMap.set(categoryList[i].internal_name, (priorityCategory.reverse ? (len-i) : (i+1)) );
                }
                priorityCategory.maxPriority = categoryList.length + 1;
            } else if(priorityCategory.method === 2) {
                let categoryList = categoriesNeeded[priorityCategory.category + '_local'];
                for(let i=0, len=categoryList.length; i<len; i++) {
                    priorityCategory.priorityMap.set(categoryList[i].name, (priorityCategory.reverse ? (len-i) : (i+1)) );
                }
                priorityCategory.maxPriority = categoryList.length + 1;
            } else if(priorityCategory.method === 3) {
                let max = priorityCategory.maxPriority;
                for(let tagname in appPriorityData[priorityCategory.category]) {
                    let priorityNum = appPriorityData[priorityCategory.category][tagname];
                    priorityCategory.priorityMap.set(tagname, (priorityCategory.reverse ? (max-priorityNum) : priorityNum));
                }
            } else if(priorityCategory.method === 4) {
                let max = priorityCategory.maxPriority;
                for(let entry of appPriorityData[priorityCategory.category]) {
                    let priorityNum = entry.priority;
                    priorityCategory.priorityMap.set(entry.classid, (priorityCategory.reverse ? (max-priorityNum) : priorityNum));
                }
            }
        }

        // calculate priority number for each description
        let descriptCalcPriorities = {};
        for(let classInstance in descriptions) {
            let descript = descriptions[classInstance];
            let priorityCalc = 0;
            for(let priorityCategory of priorities) {
                // NOTE: use bit shifting or 2^n multiplication
                let bitLen = priorityCategory.maxPriority ? steamToolsUtils.bitLength(priorityCategory.maxPriority) : 1;
                let LOWEST_PRIORITY = (2**bitLen) - 1;
                priorityCalc *= 2**bitLen;
                if(priorityCategory.method === 0) {
                    priorityCalc += descript.tags.some(x => x.category === priorityCategory.category) === priorityCategory.reverse ? 1 : 0;
                } else if(priorityCategory.method === 1 || priorityCategory.method === 3) {
                    let relaventTags = descript.tags.filter(x => x.category === priorityCategory.category);
                    if(relaventTags.length === 0) {
                        priorityCalc += LOWEST_PRIORITY;
                    } else if(relaventTags.length === 1) {
                        priorityCalc += priorityCategory.priorityMap.get(relaventTags[0].internal_name) ?? LOWEST_PRIORITY;
                    } else if(relaventTags.length > 1) {
                        console.warn('INVENTORY_ITEM_PRIORITY.sort(): [method 1/3] more than 1 tags found! Using highest priority...');
                        priorityCalc += relaventTags.reduce((priority, tag) => {
                            let tagPriority = priorityCategory.priorityMap.get(tag.internal_name);
                            return (!tagPriority || tagPriority>priority) ? priority : tagPriority;
                        }, LOWEST_PRIORITY);
                    }
                } else if(priorityCategory.method === 2) {
                    let relaventTags = descript.tags.filter(x => x.category === priorityCategory.category);
                    if(relaventTags.length === 0) {
                        priorityCalc += LOWEST_PRIORITY;
                    } else if(relaventTags.length === 1) {
                        priorityCalc += priorityCategory.priorityMap.get(relaventTags[0].name) ?? LOWEST_PRIORITY;
                    } else if(relaventTags.length > 1) {
                        console.warn('INVENTORY_ITEM_PRIORITY.sort(): [method 2] more than 1 tags found! Using highest priority...');
                        priorityCalc += relaventTags.reduce((priority, tag) => {
                            let tagPriority = priorityCategory.priorityMap.get(tag.name);
                            return (!tagPriority || tagPriority>priority) ? priority : tagPriority;
                        }, LOWEST_PRIORITY);
                    }
                } else if(priorityCategory.method === 4) {
                    let priorityVal = priorityCategory.priorityMap.get(classInstance) ?? LOWEST_PRIORITY;
                    priorityCalc += priorityCategory.reverse ? LOWEST_PRIORITY-priorityVal : priorityVal;
                }
            }
            descriptCalcPriorities[classInstance] = priorityCalc;
        }

        let sortedInventory = [];
        if(Array.isArray(inventory)) {
            for(let asset of inventory) {
                INVENTORY_ITEM_PRIORITY.insertSortedPriorityArray(sortedInventory, descriptCalcPriorities, asset);
            }
        } else if(steamToolsUtils.isSimplyObject(inventory)) {
            for(let assetid in inventory) {
                INVENTORY_ITEM_PRIORITY.insertSortedPriorityArray(sortedInventory, descriptCalcPriorities, inventory[assetid]);
            }
        }

        return sortedInventory;
    },
    // binary insert, assume prop value is always string, sorted a-z
    insertSortedObjectArray: function(arr, item, prop) {
        let low = 0, high = arr.length;

        while(low !== high) {
            let mid = (low + high) >>> 1;
            let compareVal = (typeof arr[mid][prop] === 'number' && typeof item[prop] === 'number')
                ? arr[mid][prop] - item[prop]
                : arr[mid][prop].localeCompare(item[prop], undefined, { sensitivity: 'base' });
            if(compareVal < 0) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        arr.splice(low, 0, item);
    },
    containsSortedObjectArray: function(arr, str, prop) {
        let low = 0, high = arr.length;

        while(low !== high) {
            let mid = (low + high) >>> 1;
            let strCompareVal = arr[mid][prop].localeCompare(str, undefined, { sensitivity: 'base' });
            if(strCompareVal < 0) {
                low = mid + 1;
            } else if(strCompareVal > 0) {
                high = mid;
            } else {
                return true;
            }
        }

        return false;
    },
    insertSortedPriorityArray: function(arr, priorities, asset) {
        let low = 0, high = arr.length;
        let assetPriority = priorities[`${asset.classid}_${asset.instanceid}`] ?? Number.MAX_SAFE_INTEGER;

        while(low !== high) {
            let mid = (low + high) >>> 1;
            let midPriority = priorities[`${arr[mid].classid}_${arr[mid].instanceid}`] ?? Number.MAX_SAFE_INTEGER;
            if(midPriority <= assetPriority) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        arr.splice(low, 0, asset);
    }
}
