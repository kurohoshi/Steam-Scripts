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
      +       '<div class="userscript-config-list-header">'
      +          '<span class="userscript-config-list-title">Craft List</span>'
      +       '</div>'
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
      +          '<span class="userscript-config-list-title">Boosters to Open</span>'
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
      +       '<div class="userscript-config-list-entries tile userscript-custom-scroll"></div>'
      +       cssAddOverlay(openerListLoaderHTMLString, openerListDialogHTMLString, { initialState: 'loading' })
      +       '</div>'
      +    '</div>'
      +    '<div class="userscript-config-list enhanced-list-container wide" data-list-type="card">'
      +       '<div class="userscript-config-list-header">'
      +          '<span class="userscript-config-list-title">Card Drops</span>'
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
            let goostatusKey = `goostatus${gooItemType[0].toUpperCase() + gooItemType.slice(1)}${tradability[0].toUpperCase() + tradability.slice(1)}`;
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

    if(Date.now() - boosterCrafterData.lastSyncTime > desyncTimeTrigger) {
        console.log('resetting cooldown timers!')
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
    boosterCrafterSetOverlay(favoritesListElem, true, '');
    craftActionElem.classList.add('disabled');
    boosterCrafterSetOverlay(craftListElem, true, '');

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
    boosterCrafterSetOverlay(openerListElem, true, '');

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
        itemClass.tradables.sort((a, b) => a.count - b.count);
        itemClass.nontradables.sort((a, b) => a.count - b.count);
    }

    boosterCrafterData.boosters = {};

    inventoryEntriesElem.innerHTML = '';
    let boosterDataList = Profile.me.inventory.data.booster[0];
    for(let appid in Profile.me.inventory.data.booster[0]) {
        boosterCrafterData.boosters[appid] = steamToolsUtils.deepClone(boosterDataList[appid][0]);

        let boosterEntry = boosterCrafterData.boosters[appid];
        boosterEntry.tradableCount = boosterEntry.tradables.reduce((sum, x) => sum + x.count, 0);
        boosterEntry.nontradableCount = boosterEntry.nontradables.reduce((sum, x) => sum + x.count, 0);

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
    boosterCrafterSetOverlay(openerListElem, false);
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
    while (!currentEntryElem.matches('.app-list-row')) {
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

function boosterCrafterBoosterCooldownSetTimer(appid, craftedNow = false) {
    let cooldownTimer = !craftedNow
      ? Math.ceil((boosterCrafterData.boosterDataList[appid].cooldownDate.valueOf() - Date.now()) / 1000)
      : 24 * 60 * 60;
    let timerSeconds = cooldownTimer % 60;
    let timerMinutes = Math.floor(cooldownTimer / 60) % 60;
    let timerHours = Math.floor(cooldownTimer / (60 * 60));
    boosterCrafterData.cooldownList[appid] = [timerHours, timerMinutes, timerSeconds];
}
function boosterCrafterBoosterCooldownAddTimer(appid, craftedNow = false) {
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
    while (!rowElem.matches('.enhanced-goostatus-row')) {
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
function boosterCrafterGooUpdateTextListener(event) {
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

    while (unpackTotalAmount > 0) {
        let sackItem = boosterCrafterData.unpackList[0];
        let unpackItemAmount = Math.min(sackItem.count, unpackTotalAmount);

        requestBody.set('assetid', sackItem.assetid);
        requestBody.set('goo_amount_in', unpackItemAmount.toString());
        requestBody.set('goo_amount_out_expected', (unpackItemAmount * 1000).toString());

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
        } catch (err) {
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
    while (!containerElem.matches('.enhanced-list-container')) {
        if(containerElem.matches('body')) {
            throw 'boosterCrafterListRemoveListener(): container not found!';
        }
        containerElem = containerElem.parentElement;
    }
    return containerElem;
}
function boosterCrafterSelectEntriesListener(event) {
    let currentEntryElem = event.target;
    while (!currentEntryElem.matches('.userscript-config-list-entry')) {
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

        let minIndex = prevIndex<currIndex ? prevIndex : currIndex;
        let maxIndex = prevIndex<currIndex ? currIndex : prevIndex;
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
    console.log('removing selected elements...');
    let containerElem = event.target;
    while (!containerElem.matches('.enhanced-list-container')) {
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
    boosterCrafterData.craftQueue = [];

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
    let gems = boosterCrafterData.gems.find(x => x.classid === '667924416');
    if(!gems || gems.count<craftCostAmount) {
        let sacks = boosterCrafterData.gems.find(x => x.classid === '667933237');
        if(!sacks || (sacks.count*1000)+gems.count<craftCostAmount) {
            alert('Not enough gems. Try making less boosters?');
        } else {
            alert('Not enough gems. Try unpacking some sacks of gems or making less boosters?');
        }
    } else {
        let gemsTradableAmount = gems.tradables.reduce((sum, x) => sum + x.count, 0);
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

    while (boosterCrafterData.craftQueue.length) {
        let entryElem = boosterCrafterData.craftQueue[boosterCrafterData.craftQueue.length - 1];
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

        // let responseData = {
        //     "purchase_result": {
        //     "communityitemid": "29863953490",
        //     "appid": 998490,
        //     "item_type": 28,
        //     "purchaseid": "57708606",
        //     "success": 1,
        //     "rwgrsn": -2
        //     },
        //     "goo_amount": "232519",
        //     "tradable_goo_amount": "232519",
        //     "untradable_goo_amount": 0
        // };

        boosterCrafterBoosterCooldownAddTimer(appid, true);
        entryElem.classList.remove('selected');

        boosterData.unavailable = true;
        boosterData.cooldownDate = new Date();
        boosterData.cooldownDate.setDate(boosterData.cooldownDate.getDate() + 1);
        if(boosterData.$Option) {
            unsafeWindow.CBoosterCreatorPage.ToggleActionButton(boosterData.$Option);
        }
        if(boosterData.$MiniOption) {
            unsafeWindow.CBoosterCreatorPage.ToggleActionButton(boosterData.$MiniOption);
        }
        unsafeWindow.CBoosterCreatorPage.RefreshSelectOptions();

        unsafeWindow.CBoosterCreatorPage.UpdateGooDisplay(responseData.goo_amount, responseData.tradable_goo_amount, responseData.untradable_goo_amount);
        boosterCrafterShortcuts.goostatusGooTradable.innerHTML = parseInt(responseData.tradable_goo_amount).toLocaleString();
        boosterCrafterShortcuts.goostatusGooNontradable.innerHTML = parseInt(responseData.untradable_goo_amount).toLocaleString();
        let gems = boosterCrafterData.gems.find(x => x.classid === '667924416');
        let gemsTradableDiff = gems.tradables.reduce((sum, x) => sum + x.count, 0) - parseInt(responseData.tradable_goo_amount);
        while (gemsTradableDiff > 0) {
            let lastAsset = gems.tradables[gems.tradables.length - 1];
            if(lastAsset.count < gemsTradableDiff) {
                gemsTradableDiff -= lastAsset.count;
                gems.tradables.pop();
            } else {
                lastAsset.count -= gemsTradableDiff;
                gemsTradableDiff = 0;
            }
        }
        let gemsNontradableDiff = gems.nontradables.reduce((sum, x) => sum + x.count, 0) - parseInt(responseData.untradable_goo_amount);
        let boosterTradability = !!gemsNontradableDiff;
        while (gemsNontradableDiff > 0) {
            let lastAsset = gems.nontradables[gems.nontradables.length - 1];
            if(lastAsset.count < gemsNontradableDiff) {
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
    boosterCrafterOpenerListChangeValue(1);
}
function boosterCrafterOpenerListDecrementListener() {
    boosterCrafterOpenerListChangeValue(-1);
}
function boosterCrafterOpenerListChangeValue(value) {
    if(typeof value !== 'number') {
        return;
    }

    for(let selectedElem of boosterCrafterShortcuts.lists.opener.list.querySelectorAll('.selected')) {
        let appid = selectedElem.dataset.appid;
        if(!boosterCrafterData.openerList[appid]) {
            console.warn('boosterCrafterOpenerListIncrementListener(): invalid appid somehow, something is wrong!');
            continue;
        }

        let dataEntry = boosterCrafterData.openerList[appid];

        if(dataEntry.qtyTradable === dataEntry.maxTradable) {
            let newQty = dataEntry.qtyNontradable + value;
            if(newQty > dataEntry.maxNontradable) {
                dataEntry.qtyTradable = Math.min(newQty - dataEntry.maxNontradable, dataEntry.maxTradable);
                dataEntry.qtyNontradable = 0;
            } else if(newQty < 0) {
                dataEntry.qtyTradable = Math.max(dataEntry.maxTradable + newQty, 1);
                dataEntry.qtyNontradable = 0;
            } else {
                dataEntry.qtyNontradable = newQty;
            }
        } else {
            let newQty = dataEntry.qtyTradable + value;
            if(newQty > dataEntry.maxTradable) {
                dataEntry.qtyTradable = dataEntry.maxTradable;
                dataEntry.qtyNontradable = Math.min(newQty - dataEntry.maxTradable, dataEntry.maxNontradable);
            } else if(newQty < 1) {
                dataEntry.qtyTradable = dataEntry.maxTradable;
                dataEntry.qtyNontradable = Math.max(dataEntry.maxNontradable + newQty, 0);
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

    boosterCrafterShortcuts.addOpenerButton.disabled = false;
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
    document.getElementById('opener-list-progress-total').innerHTML = tallyOpenerBoosters();
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

        // let responseData = {
        //     "success": 1,
        //     "rgItems": [
        //     {
        //         "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwf-xmMcXBiwb6s-bLFXn2bzKZdiWASVwxTrVcMjnbr2f35uicFjqfR74qRQFQfaEG82Qda8-BaUZrhplRu2L-lUtvGhM6TcxLcQi-lydDaOgnn3ERdJtbzyChcseKgFphbk5vXLHvVruUa4GklykmCEgyG6IEJNXCrmPh-lvL2rlk",
        //         "name": "zijing card",
        //         "series": 1,
        //         "foil": false
        //     },
        //     {
        //         "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwf-xmMcXBiwb6s-bLFXn2bzKZdiWASVwxTrVcMjnbr2f35uicFjqfR74qRQFQfaEG82Qda8-BaUZrhplRu2L-lUtvGhM6TcxLcQi-lydDaOgnn3ERdJtbzyChcseKgFphbk5vXLHvVruUa4GklykmCEgyG6IEJNXCrmPh-lvL2rlk",
        //         "name": "zijing card",
        //         "series": 1,
        //         "foil": false
        //     },
        //     {
        //         "image": "https://community.akamai.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgOx3sMkD4QPivs0XEwb-xiP8PTwQvioKmOHWbzLj7JLibcQVhuGbBZPGjY_TL2t7zCRjucSLklS1hWe6RR82YcaJyBORA13NUJ-zH2h0p6WBQnYMFDYjCyx3UUNOB2mHhHJ5xSyiXwL8Ld1AsxO0NvWb7vU7rLZ4GixiskXB1hHfVIMY-XpmWyr4G3Z_UlCJgxuw",
        //         "name": "jinghuanya card",
        //         "series": 1,
        //         "foil": false
        //     }
        //     ]
        // };

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
                boosterCrafterShortcuts.foilCardCount.innerHTML = parseInt(boosterCrafterShortcuts.foilCardCount.innerHTML) + 1;
            } else {
                boosterCrafterShortcuts.normalCardCount.innerHTML = parseInt(boosterCrafterShortcuts.normalCardCount.innerHTML) + 1;
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
        let { qtyTradable, qtyNontradable } = openerListEntry;
        currentDropStats[appid] ??= {};
        dropStats[appid] ??= {};

        for(let i=0; i<qtyTradable; ++i) {
            if(boosterListEntry.tradables.length === 0) {
                throw 'boosterCrafterOpenBoosters(): No boosters left in the list!';
            }

            let asset = boosterListEntry.tradables[boosterListEntry.tradables.length - 1];

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

            let asset = boosterListEntry.nontradables[boosterListEntry.nontradables.length - 1];

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
        boosterCrafterLoadConfig();
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

    return new Date(dateNow.getFullYear() + (nextYear ? 1 : 0), MONTHS_ARRAY.indexOf(monthStr), parseInt(dayStr), newTime[0], newTime[1]);
}
