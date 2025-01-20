const BoosterCrafter = {
    SETTINGSDEFAULTS: {
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
    },

    shortcuts: {},
    data: {},

    setup: async function() {
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

        globalSettings.boosterCrafter = config.boosterCrafter ?? steamToolsUtils.deepClone(BoosterCrafter.SETTINGSDEFAULTS);

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
        BoosterCrafter.shortcuts.gooStatus = document.querySelector('.enhanced-goostatus');
        BoosterCrafter.shortcuts.lists = {};
        for(let listContainerElem of document.querySelectorAll('.enhanced-area [data-list-type]')) {
            BoosterCrafter.shortcuts.lists[listContainerElem.dataset.listType] = {
                main: listContainerElem,
                action: listContainerElem.querySelector('.conf-list-entry-action'),
                list: listContainerElem.querySelector('.userscript-config-list-list'),
            };
        }
        for(let gooItemType of ['sack', 'goo']) {
            for(let tradability of ['tradable', 'nontradable']) {
                let goostatusKey = `goostatus${gooItemType[0].toUpperCase() + gooItemType.slice(1)}${tradability[0].toUpperCase() + tradability.slice(1)}`;
                BoosterCrafter.shortcuts[goostatusKey] = document.getElementById(`goostatus-${gooItemType}-${tradability}`);
            }
        }
        BoosterCrafter.shortcuts.craftCost = document.getElementById('craft-cost');
        BoosterCrafter.shortcuts.unpackTradableGooButton = document.getElementById('goostatus-unpack-tradable');
        BoosterCrafter.shortcuts.unpackNontradableGooButton = document.getElementById('goostatus-unpack-nontradable');
        BoosterCrafter.shortcuts.unpackGooText = document.getElementById('goostatus-unpack-text');
        BoosterCrafter.shortcuts.unpackGooSlider = document.getElementById('goostatus-unpack-slider');
        BoosterCrafter.shortcuts.SelectorAddFavoritesButton = document.getElementById('selector-add-favorites');
        BoosterCrafter.shortcuts.SelectorAddCraftButton = document.getElementById('selector-add-craft');
        BoosterCrafter.shortcuts.addCraftButton = document.getElementById('add-craft');
        BoosterCrafter.shortcuts.addOpenerButton = document.getElementById('add-opener');
        BoosterCrafter.shortcuts.normalCardCount = document.getElementById('text-normal-cards');
        BoosterCrafter.shortcuts.foilCardCount = document.getElementById('text-foil-cards');

        // event listeners
        document.getElementById('goostatus-unpack-tradable').addEventListener('click', BoosterCrafter.unpackGooSackListener);
        document.getElementById('goostatus-unpack-nontradable').addEventListener('click', BoosterCrafter.unpackGooSackListener);
        document.getElementById('goostatus-unpack-text').addEventListener('input', BoosterCrafter.gooUpdateTextListener);
        document.getElementById('goostatus-unpack-slider').addEventListener('input', BoosterCrafter.gooUpdateSliderListener);
        document.getElementById('goostatus-unpack-cancel').addEventListener('click', BoosterCrafter.gooUnpackCancelListener);
        document.getElementById('goostatus-unpack-confirm').addEventListener('click', BoosterCrafter.gooUnpackConfirmListener);

        document.getElementById('selector-add-favorites').addEventListener('click', BoosterCrafter.favoritesListAddListener);
        document.getElementById('selector-add-craft').addEventListener('click', BoosterCrafter.craftListAddListener);

        document.getElementById('config-import').addEventListener('click', BoosterCrafter.configImportListener);
        document.getElementById('config-export').addEventListener('click', BoosterCrafter.configExportListener);
        document.getElementById('app-search').addEventListener('click', BoosterCrafter.appSearchListener);
        document.getElementById('app-search-text-input').addEventListener('input', BoosterCrafter.appSearchTextInputListener);
        document.getElementById('app-search-results').addEventListener('click', BoosterCrafter.appSearchAddFavoritesListener);
        document.getElementById('app-search-close').addEventListener('click', BoosterCrafter.appSearchCloseListener);
        document.getElementById('add-craft').addEventListener('click', BoosterCrafter.craftListAddFavoritesListener);

        document.getElementById('craft-boosters').addEventListener('click', BoosterCrafter.craftListCraftListener);
        document.getElementById('craft-dialog-cancel').addEventListener('click', BoosterCrafter.craftListCraftCancelListener);
        document.getElementById('craft-dialog-confirm').addEventListener('click', BoosterCrafter.craftListCraftConfirmListener);

        document.getElementById('inventory-reload').addEventListener('click', BoosterCrafter.inventoryListReloadListener);

        document.getElementById('add-opener').addEventListener('click', BoosterCrafter.openerListAddListener);
        document.getElementById('incr-opener').addEventListener('click', BoosterCrafter.openerListIncrementListener);
        document.getElementById('decr-opener').addEventListener('click', BoosterCrafter.openerListDecrementListener);
        document.getElementById('open-boosters').addEventListener('click', BoosterCrafter.openerListOpenListener);
        document.getElementById('opener-dialog-cancel').addEventListener('click', BoosterCrafter.openerListOpenCancelListener);
        document.getElementById('opener-dialog-confirm').addEventListener('click', BoosterCrafter.openerListOpenConfirmListener);

        for(let listElem of document.querySelectorAll('.userscript-config-list-list')) {
            listElem.addEventListener('click', BoosterCrafter.selectEntriesListener);
        }
        for(let removeButtonElem of document.querySelectorAll('.enhanced-list-container .entry-action > .delete')) {
            removeButtonElem.parentElement.addEventListener('click', BoosterCrafter.listRemoveListener);
        }

        BoosterCrafter.data.openerList = {};
        BoosterCrafter.data.lastSelected = {};
        BoosterCrafter.data.craftCost = { amount: 0, max: 0 };
        BoosterCrafter.data.currentDropStats = {};

        BoosterCrafter.data.gems = null; // gems data structure is sloppy
        BoosterCrafter.data.boosters = null;
        BoosterCrafter.data.cooldownList = {};
        BoosterCrafter.data.craftQueue = [];
        BoosterCrafter.data.appSearch = {
            timeout: null,
            prevInput: '',
            prevResults: {
                appids: [],
                names: []
            }
        };

        // save and modify booster selector list from the page
        BoosterCrafter.data.boosterDataList = unsafeWindow.CBoosterCreatorPage.sm_rgBoosterData;
        for(let appid in BoosterCrafter.data.boosterDataList) {
            let appEntry = BoosterCrafter.data.boosterDataList[appid];
            if(appEntry.unavailable) {
                appEntry.cooldownDate = BoosterCrafter.parseCooldownDate(appEntry.available_at_time);
            }
        }



        // load crafting lists, set up desync detector, start cooldown timer, and load gem and booster data from inventory
        BoosterCrafter.loadConfig();
        BoosterCrafter.data.lastSyncTime = Date.now();
        setInterval(BoosterCrafter.checkDesync, 1500);
        BoosterCrafter.boosterCooldownUpdateDisplay();
        setInterval(BoosterCrafter.boosterCooldownUpdateTimer, 1000);
        BoosterCrafter.loadData();
    },
    checkDesync: function() {
        let desyncTimeTrigger = 5000;

        if(Date.now() - BoosterCrafter.data.lastSyncTime > desyncTimeTrigger) {
            console.log('resetting cooldown timers!')
            for(let appid in BoosterCrafter.data.cooldownList) {
                BoosterCrafter.boosterCooldownSetTimer(appid);
            }
        }

        BoosterCrafter.data.lastSyncTime = Date.now();
        BoosterCrafter.updateBoosterCost();
    },
    loadConfig: async function() {
        let favoritesActionElem = BoosterCrafter.shortcuts.lists.favorites.action;
        let favoritesListElem = BoosterCrafter.shortcuts.lists.favorites.list;
        let favoritesListEntriesElem = favoritesListElem.querySelector('.userscript-config-list-entries');
        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;
        let craftListEntriesElem = craftListElem.querySelector('.userscript-config-list-entries');

        favoritesActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(favoritesListElem, true, '');
        craftActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(craftListElem, true, '');

        // populate favorites list
        favoritesListEntriesElem.innerHTML = '';
        let favoritesEntriesHTMLString = '';
        for(let appid in globalSettings.boosterCrafter.lists.favorites) {
            let boosterData = BoosterCrafter.data.boosterDataList[appid];

            if(!boosterData) {
                continue;
            }

            favoritesEntriesHTMLString += BoosterCrafter.generateBoosterListEntry(boosterData);
            BoosterCrafter.boosterCooldownAddTimer(appid);
        }
        favoritesListEntriesElem.insertAdjacentHTML('beforeend', favoritesEntriesHTMLString);

        // populate craft list
        craftListEntriesElem.innerHTML = '';
        let craftEntriesHTMLString = '';
        for(let appid in globalSettings.boosterCrafter.lists.crafting) {
            let boosterData = BoosterCrafter.data.boosterDataList[appid];

            if(!boosterData) {
                continue;
            }

            craftEntriesHTMLString += BoosterCrafter.generateBoosterListEntry(boosterData);
            BoosterCrafter.boosterCooldownAddTimer(appid);
        }
        craftListEntriesElem.insertAdjacentHTML('beforeend', craftEntriesHTMLString);
        BoosterCrafter.updateBoosterCost();

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
        BoosterCrafter.shortcuts.normalCardCount.innerHTML = normalCardCount;
        BoosterCrafter.shortcuts.foilCardCount.innerHTML = foilCardCount;

        favoritesActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(favoritesListElem, false);
        craftActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(craftListElem, false);
    },
    loadData: async function() {
        const getArraySum = (arr) => {
            let sum = 0;
            for(let i=0; i<arr.length; i++) {
                sum += arr[i].count;
            }
            return sum;
        };

        // enable overlays
        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let inventoryActionElem = BoosterCrafter.shortcuts.lists.inventory.action;
        let inventoryListElem = BoosterCrafter.shortcuts.lists.inventory.list;
        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, true, 'loading');
        craftActionElem.classList.add('disabled');
        inventoryActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(inventoryListElem, true, 'loading');
        // disable add button?
        openerActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(openerListElem, true, '');

        let inventoryEntriesElem = inventoryListElem.querySelector('.userscript-config-list-entries');

        await Profile.findProfile(steamToolsUtils.getMySteamId());
        await Profile.me.getInventory('booster');

        // if inventory fails, then alert user of failure here

        BoosterCrafter.data.gems = steamToolsUtils.deepClone(Profile.me.inventory.data.gem?.[0]['753']);
        if(!BoosterCrafter.data.gems) {
            BoosterCrafter.shortcuts.goostatusSackTradable.innerHTML = '0';
            BoosterCrafter.shortcuts.goostatusSackNontradable.innerHTML = '0';
            BoosterCrafter.shortcuts.goostatusGooTradable.innerHTML = '0';
            BoosterCrafter.shortcuts.goostatusGooNontradable.innerHTML = '0';
            BoosterCrafter.shortcuts.unpackTradableGooButton.removeAttribute('disabled');
            BoosterCrafter.shortcuts.unpackNontradableGooButton.removeAttribute('disabled');
        } else {
            let gemsData = BoosterCrafter.data.gems.find(x => x.classid === '667924416');
            let sacksData = BoosterCrafter.data.gems.find(x => x.classid === '667933237');
            let sumTradables, sumNonradables;
            if(gemsData) {
                BoosterCrafter.shortcuts.goostatusGooTradable.innerHTML = getArraySum(gemsData.tradables).toLocaleString();
                BoosterCrafter.shortcuts.goostatusGooNontradable.innerHTML = getArraySum(gemsData.nontradables).toLocaleString();
                gemsData.tradables.sort((a, b) => a.count-b.count);
                gemsData.nontradables.sort((a, b) => a.count-b.count);
            } else {
                BoosterCrafter.shortcuts.goostatusGooTradable.innerHTML = '0';
                BoosterCrafter.shortcuts.goostatusGooNontradable.innerHTML = '0';
            }
            if(sacksData) {
                sumTradables = getArraySum(sacksData.tradables);
                sumNonradables = getArraySum(sacksData.nontradables);
                BoosterCrafter.shortcuts.goostatusSackTradable.innerHTML = sumTradables.toLocaleString();
                BoosterCrafter.shortcuts.goostatusSackNontradable.innerHTML = sumNonradables.toLocaleString();
                sacksData.tradables.sort((a, b) => a.count-b.count);
                sacksData.nontradables.sort((a, b) => a.count-b.count);
            } else {
                BoosterCrafter.shortcuts.goostatusSackTradable.innerHTML = '0';
                BoosterCrafter.shortcuts.goostatusSackNontradable.innerHTML = '0';
            }
            sumTradables
              ? BoosterCrafter.shortcuts.unpackTradableGooButton.removeAttribute('disabled')
              : BoosterCrafter.shortcuts.unpackTradableGooButton.setAttribute('disabled', '');
            sumNonradables
              ? BoosterCrafter.shortcuts.unpackNontradableGooButton.removeAttribute('disabled')
              : BoosterCrafter.shortcuts.unpackNontradableGooButton.setAttribute('disabled', '');
        }

        BoosterCrafter.data.boosters = {};

        inventoryEntriesElem.innerHTML = '';
        let boosterDataList = Profile.me.inventory.data.booster[0];
        for(let appid in Profile.me.inventory.data.booster[0]) {
            BoosterCrafter.data.boosters[appid] = steamToolsUtils.deepClone(boosterDataList[appid][0]);

            let boosterEntry = BoosterCrafter.data.boosters[appid];
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
                inventoryEntriesElem.insertAdjacentHTML('beforeend', BoosterCrafter.generateBoosterListEntry({ appid: appid, tradableCount: boosterEntry.tradableCount, nontradableCount: boosterEntry.nontradableCount, name: appData.name }));
            }
        }

        // disable overlays
        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
        craftActionElem.classList.remove('disabled');
        inventoryActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(inventoryListElem, false);
        // enable add button?
        openerActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(openerListElem, false);
    },
    updateBoosterCost: function() {
        let allTotal = 0;
        let selectedTotal = 0;
        for(let entryElem of BoosterCrafter.shortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry')) {
            if(Object.hasOwn(entryElem.dataset, 'cooldownTimer')) {
                continue;
            }

            allTotal += parseInt(entryElem.dataset.cost);
            if(entryElem.matches('.selected')) {
                selectedTotal += parseInt(entryElem.dataset.cost);
            }
        }

        BoosterCrafter.data.craftCost.max = allTotal;
        BoosterCrafter.data.craftCost.amount = selectedTotal || allTotal;
        if(BoosterCrafter.data.craftCost.amount > BoosterCrafter.data.craftCost.max) {
            throw 'BoosterCrafter.updateBoosterCost(): craft cost amount exceeds max! Investigate!';
        }
        BoosterCrafter.shortcuts.craftCost.dataset.qty = BoosterCrafter.data.craftCost.amount.toLocaleString();
    },
    inventoryListReloadListener: function() {
        BoosterCrafter.loadData();
    },

    appSearchListener: function() {
        let favoritesActionElem = BoosterCrafter.shortcuts.lists.favorites.action;
        let favoritesListElem = BoosterCrafter.shortcuts.lists.favorites.list;

        favoritesActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(favoritesListElem, true, 'dialog');
    },
    appSearchTextInputListener: function(event) {
        clearTimeout(BoosterCrafter.data.appSearch.timeout);
        BoosterCrafter.data.appSearch.timeout = setTimeout(BoosterCrafter.appSearchTextInput, 500, event.target.value);
    },
    appSearchTextInput: function(inputStr) {
        const generateSearchResultRowHTMLString = (data) => `<div class="app-list-row" data-appid="${data.appid}">`
          +    `<img class="app-header" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${data.appid}/header.jpg" alt="">`
          +    `<span class="app-name">${data.name}</span>`
          + '</div>';
        let searchResultsElem = document.getElementById('app-search-results');

        let searchResults = { appids: [], names: [] };

        if(!inputStr.length) {
            // empty string
        } else if(BoosterCrafter.data.appSearch.prevInput.length && inputStr.includes(BoosterCrafter.data.appSearch.prevInput)) {
            let prevSearchResults = BoosterCrafter.data.appSearch.prevResults;
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
            for(let appid in BoosterCrafter.data.boosterDataList) {
                let entry = BoosterCrafter.data.boosterDataList[appid];
                if(isNumber && entry.appid.toString().includes(inputStr)) {
                    searchResults.appids.push(BoosterCrafter.data.boosterDataList[appid]);
                } else if(entry.name.toLowerCase().includes(inputStr)) {
                    searchResults.names.push(BoosterCrafter.data.boosterDataList[appid]);
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

        BoosterCrafter.data.appSearch.prevInput = inputStr;
        BoosterCrafter.data.appSearch.prevResults = searchResults;
    },
    appSearchAddFavoritesListener: function(event) {
        let currentEntryElem = event.target;
        while (!currentEntryElem.matches('.app-list-row')) {
            if(currentEntryElem.matches('#app-search-results')) {
                return;
            }
            currentEntryElem = currentEntryElem.parentElement;
        }

        let appid = currentEntryElem.dataset.appid;
        let boosterData = BoosterCrafter.data.boosterDataList[appid];
        let favoritesList = globalSettings.boosterCrafter.lists.favorites;
        let favoritesActionElem = BoosterCrafter.shortcuts.lists.favorites.action;
        let favoritesListElem = BoosterCrafter.shortcuts.lists.favorites.list;
        let favoritesListEntriesElem = BoosterCrafter.shortcuts.lists.favorites.list.querySelector('.userscript-config-list-entries');

        if(!Object.hasOwn(favoritesList, appid)) {
            favoritesList[appid] = { appid: boosterData.appid };
            favoritesListEntriesElem.insertAdjacentHTML('beforeend', BoosterCrafter.generateBoosterListEntry(boosterData));
        }

        BoosterCrafter.configSave();

        favoritesActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(favoritesListElem, false);
    },
    appSearchCloseListener: function() {
        let favoritesActionElem = BoosterCrafter.shortcuts.lists.favorites.action;
        let favoritesListElem = BoosterCrafter.shortcuts.lists.favorites.list;

        favoritesActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(favoritesListElem, false);
    },

    boosterCooldownSetTimer: function(appid, craftedNow = false) {
        let cooldownTimer = !craftedNow
          ? Math.ceil((BoosterCrafter.data.boosterDataList[appid].cooldownDate.valueOf() - Date.now()) / 1000)
          : 24 * 60 * 60;
        let timerSeconds = cooldownTimer % 60;
        let timerMinutes = Math.floor(cooldownTimer / 60) % 60;
        let timerHours = Math.floor(cooldownTimer / (60 * 60));
        BoosterCrafter.data.cooldownList[appid] = [timerHours, timerMinutes, timerSeconds];
    },
    boosterCooldownAddTimer: function(appid, craftedNow = false) {
        if((!BoosterCrafter.data.boosterDataList[appid].unavailable && !craftedNow) || Object.hasOwn(BoosterCrafter.data.cooldownList, appid)) {
            return;
        }

        BoosterCrafter.boosterCooldownSetTimer(appid, craftedNow);
        BoosterCrafter.boosterCooldownUpdateDisplay();
    },
    boosterCooldownUpdateTimer: function() {
        for(let appid in BoosterCrafter.data.cooldownList) {
            let timer = BoosterCrafter.data.cooldownList[appid];
            if(timer[2] <= 0) {
                if(timer[1] <= 0) {
                    if(timer[0] <= 0) {
                        delete BoosterCrafter.data.cooldownList[appid];
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

        BoosterCrafter.boosterCooldownUpdateDisplay();
    },
    boosterCooldownUpdateDisplay: function(entryElemArg) {
        const stringifyTimer = (timerArr) => timerArr[0] + ':' + timerArr[1].toString().padStart(2, '0') + ':' + timerArr[2].toString().padStart(2, '0');
        const updateTimer = (elem) => {
            let appid = elem.dataset.appid;
            let timer = BoosterCrafter.data.cooldownList[appid];
            if(!timer) {
                if(elem.dataset.cooldownTimer) {
                    delete elem.dataset.cooldownTimer;
                    delete BoosterCrafter.data.boosterDataList[appid].unavailable;
                }
            } else {
                elem.dataset.cooldownTimer = stringifyTimer(timer);
            }
        };

        if(entryElemArg) {
            updateTimer(entryElemArg);
            return;
        }

        for(let entryElem of BoosterCrafter.shortcuts.lists.favorites.list.querySelectorAll('.userscript-config-list-entry')) {
            updateTimer(entryElem);
        }
        for(let entryElem of BoosterCrafter.shortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry')) {
            updateTimer(entryElem);
        }
    },

    unpackGooSackListener: function(event) {
        let rowElem = event.target;
        while (!rowElem.matches('.enhanced-goostatus-row')) {
            if(rowElem.matches('.enhanced-goostatus')) {
                throw 'BoosterCrafter.unpackGooSackListener(): No row container found! Was the document structured correctly?';
            }
            rowElem = rowElem.parentElement;
        }

        let sacksData = BoosterCrafter.data.gems.find(x => x.classid === '667933237');
        if(!sacksData) {
            console.error('BoosterCrafter.unpackGooSackListener(): No sacks found! Were the buttons properly disabled?');
            return;
        }

        let tradableType = rowElem.dataset.type;
        let dataset;
        if(tradableType === 'tradable') {
            dataset = steamToolsUtils.deepClone(sacksData.tradables);
        } else if(tradableType === 'nontradable') {
            dataset = steamToolsUtils.deepClone(sacksData.nontradables);
        } else {
            throw 'BoosterCrafter.unpackGooSackListener(): TradableType is neither tradable nor nontradable???';
        }

        if(!dataset.length) {
            console.error('BoosterCrafter.unpackGooSackListener(): Selected dataset has no entries!');
            return;
        }
        BoosterCrafter.data.unpackList = dataset;

        let gooDatalistElem = document.getElementById('goostatus-unpack-datalist');
        let gooMax = 0;
        let datalistHTMLString = '';
        for(let i=0; i<dataset.length; i++) {
            gooMax += dataset[i].count;
            if(i < dataset.length-1) {
                datalistHTMLString += `<option value="${gooMax}"></option>`
            }
        }

        BoosterCrafter.shortcuts.unpackGooText.max = gooMax;
        BoosterCrafter.shortcuts.unpackGooSlider.max = gooMax;
        gooDatalistElem.innerHTML = datalistHTMLString;

        BoosterCrafter.shortcuts.unpackGooText.value = 0;
        BoosterCrafter.shortcuts.unpackGooSlider.value = 0;

        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, true, 'dialog');
    },
    gooUpdateTextListener: function(event) {
        BoosterCrafter.shortcuts.unpackGooSlider.value = event.target.value;
    },
    gooUpdateSliderListener: function(event) {
        BoosterCrafter.shortcuts.unpackGooText.value = event.target.value;
    },
    gooUnpackCancelListener: function(event) {
        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
    },
    gooUnpackConfirmListener: async function(event) {
        let unpackTotalAmount = parseInt(BoosterCrafter.shortcuts.unpackGooSlider.value); // shouldn't overflow the max amount
        if(unpackTotalAmount === 0) {
            BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
            return;
        }

        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;
        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, true, 'loading');
        BoosterCrafter.shortcuts.SelectorAddCraftButton.disabled = false;
        BoosterCrafter.shortcuts.addCraftButton.disabled = false;
        craftActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(craftListElem, false);
        BoosterCrafter.shortcuts.addOpenerButton.disabled = false;
        openerActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(openerListElem, false);

        let requestBody = new URLSearchParams({
            sessionid: steamToolsUtils.getSessionId(),
            appid: '753',
            goo_denomination_in: '1000',
            goo_denomination_out: '1'
        });
        let urlString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/ajaxexchangegoo/`;
        let refererString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/inventory/`;

        while (unpackTotalAmount > 0) {
            let sackItem = BoosterCrafter.data.unpackList[0];
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
                BoosterCrafter.data.unpackList.shift();
            } else {
                sackItem.count -= unpackItemAmount;
            }
        }

        // update sm goo amount and stuff here
        // rather than executing load data, update gem data here

        craftActionElem.classList.remove('disabled');
        openerActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
        BoosterCrafter.loadData();
    },

    getListContainerElem: function(elem) {
        let containerElem = elem;
        while (!containerElem.matches('.enhanced-list-container')) {
            if(containerElem.matches('body')) {
                throw 'BoosterCrafter.listRemoveListener(): container not found!';
            }
            containerElem = containerElem.parentElement;
        }
        return containerElem;
    },
    selectEntriesListener: function(event) {
        let currentEntryElem = event.target;
        while (!currentEntryElem.matches('.userscript-config-list-entry')) {
            if(currentEntryElem.matches('.userscript-config-list-list')) {
                return;
            }
            currentEntryElem = currentEntryElem.parentElement;
        }

        let listType = BoosterCrafter.getListContainerElem(event.currentTarget).dataset.listType;
        if(listType === 'card') {
            return;
        }

        if(!event.shiftKey && !event.ctrlKey) {
            let selectedList = event.currentTarget.querySelectorAll('.selected');
            for(let selectedEntryElem of selectedList) {
                selectedEntryElem.classList.remove('selected');
            }

            if(selectedList.length !== 1 || currentEntryElem.dataset.appid !== BoosterCrafter.data.lastSelected[listType]?.dataset?.appid) {
                currentEntryElem.classList.add('selected');
            }
        } else if(event.shiftKey) {
            let prevIndex, currIndex;
            let entries = event.currentTarget.querySelectorAll('.userscript-config-list-entry');
            for(let i=0; i<entries.length; i++) {
                if(entries[i].dataset.appid === BoosterCrafter.data.lastSelected[listType]?.dataset?.appid) {
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
            prevIndex ??= 0;

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
        BoosterCrafter.data.lastSelected[listType] = currentEntryElem;

        if(listType === 'craft') {
            BoosterCrafter.updateBoosterCost();
        }
    },
    listRemoveListener: function(event) {
        console.log('removing selected elements...');
        let containerElem = event.target;
        while (!containerElem.matches('.enhanced-list-container')) {
            if(containerElem.matches('body')) {
                throw 'BoosterCrafter.listRemoveListener(): container not found!';
            }
            containerElem = containerElem.parentElement;
        }
        let listType = containerElem.dataset.listType;

        let lists = globalSettings.boosterCrafter.lists;
        for(let selectedEntryElem of BoosterCrafter.shortcuts.lists[listType].list.querySelectorAll('.selected')) {
            if(listType === 'favorites') {
                delete lists.favorites[selectedEntryElem.dataset.appid];
            } else if(listType === 'craft') {
                delete lists.crafting[selectedEntryElem.dataset.appid];
            } else if(listType === 'opener') {
                delete BoosterCrafter.data.openerList[selectedEntryElem.dataset.appid]
            } else {
                throw 'BoosterCrafter.listRemoveListener(): Container entry deletion not implemented!';
            }

            console.log('removing element...')
            selectedEntryElem.remove();
        }

        BoosterCrafter.data.lastSelected[listType] = null;
        BoosterCrafter.configSave();
        if(listType === 'craft') {
            BoosterCrafter.updateBoosterCost();
        }
    },

    favoritesListAddListener: function() {
        let selectedAppid = document.getElementById('booster_game_selector').value;
        if(isNaN(parseInt(selectedAppid))) {
            console.log('BoosterCrafter.favoritesListAddListener(): No app selected, no boosters will be added');
            return;
        }

        let favoritesList = globalSettings.boosterCrafter.lists.favorites;
        let favoritesListElem = BoosterCrafter.shortcuts.lists.favorites.list.querySelector('.userscript-config-list-entries');

        if(Object.hasOwn(favoritesList, selectedAppid)) {
            return;
        }
        let boosterData = unsafeWindow.CBoosterCreatorPage.sm_rgBoosterData[selectedAppid];
        favoritesList[selectedAppid] = { appid: boosterData.appid }; // add more data here

        // let favoritesEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${boosterData.appid}" data-cost="${boosterData.price}" title="${boosterData.name}">`
        // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${boosterData.appid}?l=english&single=1&v=2&size=75x" alt="">`
        // + '</div>';
        favoritesListElem.insertAdjacentHTML('beforeend', BoosterCrafter.generateBoosterListEntry(boosterData));
        BoosterCrafter.boosterCooldownAddTimer(boosterData.appid);

        BoosterCrafter.configSave();
    },
    craftListAddListener: function() {
        let selectedAppid = document.getElementById('booster_game_selector').value;
        if(isNaN(parseInt(selectedAppid))) {
            console.log('BoosterCrafter.craftListAddListener(): No app selected, no boosters will be added');
            return;
        }
        BoosterCrafter.craftListAdd([selectedAppid]);
    },
    craftListAddFavoritesListener: function() {
        let containerElem = BoosterCrafter.shortcuts.lists.favorites.list;
        let appids = [];
        for(let selectedEntryElem of containerElem.querySelectorAll('.selected')) {
            appids.push(selectedEntryElem.dataset.appid);
            selectedEntryElem.classList.remove('selected');
        }

        BoosterCrafter.craftListAdd(appids);
    },
    craftListAdd: function(appids) {
        let craftList = globalSettings.boosterCrafter.lists.crafting;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list.querySelector('.userscript-config-list-entries');
        for(let i=0; i<appids.length; i++) {
            if(Object.hasOwn(craftList, appids[i])) {
                continue;
            }
            let boosterData = BoosterCrafter.data.boosterDataList[appids[i]];
            craftList[appids[i]] = { appid: boosterData.appid }; // add more data here

            // let craftEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${boosterData.appid}" data-cost="${boosterData.price}" title="${boosterData.name}">`
            // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${boosterData.appid}?l=english&single=1&v=2&size=75x" alt="">`
            // + '</div>';
            craftListElem.insertAdjacentHTML('beforeend', BoosterCrafter.generateBoosterListEntry(boosterData));
            BoosterCrafter.boosterCooldownAddTimer(boosterData.appid);
        }

        BoosterCrafter.configSave();
        BoosterCrafter.updateBoosterCost();
    },
    craftListCraftListener: function(event) {
        let selectedCount = 0;
        let selectedTotalCost = 0;
        let selectedEntries = BoosterCrafter.shortcuts.lists.craft.list.querySelectorAll('.selected');
        if(!selectedEntries.length) {
            selectedEntries = BoosterCrafter.shortcuts.lists.craft.list.querySelectorAll('.userscript-config-list-entry');
        }

        let stopFlag = true;
        let tableBodyElem = document.getElementById('craft-dialog-table-body');
        tableBodyElem.innerHTML = '';
        BoosterCrafter.data.craftQueue = [];

        for(let entryElem of selectedEntries) {
            if(Object.hasOwn(entryElem.dataset, 'cooldownTimer')) {
                continue;
            }
            let appid = entryElem.dataset.appid;
            let boosterData = BoosterCrafter.data.boosterDataList[appid];
            if(!boosterData) {
                console.warn(`BoosterCrafter.craftListCraftListener(): booster data for appid ${appid} not found!`);
            }

            let tableRow = tableBodyElem.insertRow();
            tableRow.insertCell(0).innerHTML = boosterData.name;
            tableRow.insertCell(1).innerHTML = boosterData.price;

            selectedCount++;
            selectedTotalCost += parseInt(boosterData.price);

            BoosterCrafter.data.craftQueue.push(entryElem);
            stopFlag = false;
        }
        if(stopFlag) {
            return;
        }
        document.getElementById('craft-total-boosters-text').innerHTML = selectedCount;
        document.getElementById('craft-total-cost-text').innerHTML = selectedTotalCost.toLocaleString();

        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;

        BoosterCrafter.shortcuts.SelectorAddCraftButton.disabled = true;
        BoosterCrafter.shortcuts.addCraftButton.disabled = true;
        craftActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(craftListElem, true, 'dialog');
    },
    craftListCraftCancelListener: function() {
        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;

        BoosterCrafter.shortcuts.SelectorAddCraftButton.disabled = false;
        BoosterCrafter.shortcuts.addCraftButton.disabled = false;
        craftActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(craftListElem, false);
    },
    craftListCraftConfirmListener: async function() {
        let craftLoaderProgressElem = document.getElementById('craft-list-progress');
        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;
        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        craftLoaderProgressElem.innerHTML = '0';
        document.getElementById('craft-list-progress-total').innerHTML = document.getElementById('craft-total-boosters-text').innerHTML;
        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
        BoosterCrafter.shortcuts.unpackTradableGooButton.disabled = true;
        BoosterCrafter.shortcuts.unpackNontradableGooButton.disabled = true;
        BoosterCrafter.setOverlay(craftListElem, true, 'loading');
        BoosterCrafter.shortcuts.addOpenerButton.disabled = false;
        openerActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(openerListElem, false);

        let craftCostAmount = BoosterCrafter.data.craftCost.amount;
        let gems = BoosterCrafter.data.gems.find(x => x.classid === '667924416');
        if(!gems || gems.count<craftCostAmount) {
            let sacks = BoosterCrafter.data.gems.find(x => x.classid === '667933237');
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
                    await BoosterCrafter.craftBoosters();
                }
            } else {
                await BoosterCrafter.craftBoosters();
            }
        }


        if(document.getElementById('goostatus-sack-tradable').textContent !== '0') {
            BoosterCrafter.shortcuts.unpackTradableGooButton.disabled = false;
        }
        if(document.getElementById('goostatus-sack-nontradable').textContent !== '0') {
            BoosterCrafter.shortcuts.unpackNontradableGooButton.disabled = false;
        }
        BoosterCrafter.shortcuts.SelectorAddCraftButton.disabled = false;
        BoosterCrafter.shortcuts.addCraftButton.disabled = false;
        craftActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(craftListElem, false);
        openerActionElem.classList.remove('disabled');
    },
    craftBoosters: async function() {
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

        while(BoosterCrafter.data.craftQueue.length) {
            let entryElem = BoosterCrafter.data.craftQueue[BoosterCrafter.data.craftQueue.length - 1];
            let appid = entryElem.dataset.appid;
            let boosterData = BoosterCrafter.data.boosterDataList[appid];
            BoosterCrafter.data.boosters[appid] ??= { tradables: [], nontradables: [], count: 0, tradableCount: 0, nontradableCount: 0 };
            let boosterListEntry = BoosterCrafter.data.boosters[appid];
            let openerListEntry = BoosterCrafter.data.openerList[appid];
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
            //         "communityitemid": "00000000000",
            //         "appid": 000000,
            //         "item_type": 00,
            //         "purchaseid": "00000000",
            //         "success": 1,
            //         "rwgrsn": -2
            //     },
            //     "goo_amount": "000000",
            //     "tradable_goo_amount": "000000",
            //     "untradable_goo_amount": "0000"
            // };

            BoosterCrafter.boosterCooldownAddTimer(appid, true);
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
            BoosterCrafter.shortcuts.goostatusGooTradable.innerHTML = parseInt(responseData.tradable_goo_amount).toLocaleString();
            BoosterCrafter.shortcuts.goostatusGooNontradable.innerHTML = parseInt(responseData.untradable_goo_amount).toLocaleString();
            let gems = BoosterCrafter.data.gems.find(x => x.classid === '667924416');

            // NOTE: Change gemsDiff if a predictable behaviour can be concluded
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
                boosterListEntry.nontradables.push({ assetid: responseData.purchase_result.communityitemid, count: 1 });
                boosterListEntry.nontradableCount++;
                if(openerListEntry) {
                    openerListEntry.maxNontradable++;
                }
            } else {
                boosterListEntry.tradables.push({ assetid: responseData.purchase_result.communityitemid, count: 1 });
                boosterListEntry.tradableCount++;
                if(openerListEntry) {
                    openerListEntry.maxTradable++;
                }
            }
            boosterListEntry.count++;

            let invEntryElem = BoosterCrafter.shortcuts.lists.inventory.list.querySelector(`[data-appid="${appid}"]`);
            if(invEntryElem) {
                if(boosterTradability) {
                    invEntryElem.dataset.qtyNontradable = boosterListEntry.nontradableCount;
                } else {
                    invEntryElem.dataset.qtyTradable = boosterListEntry.tradableCount;
                }
            } else {
                let invEntriesElem = BoosterCrafter.shortcuts.lists.inventory.list.querySelector('.userscript-config-list-entries');
                let HTMLString = BoosterCrafter.generateBoosterListEntry({ appid: appid, name: boosterData.name, tradableCount: boosterListEntry.tradableCount, nontradableCount: boosterListEntry.nontradableCount });
                invEntriesElem.insertAdjacentHTML('beforeend', HTMLString);
            }

            if(!Object.hasOwn(craftStats, appid)) {
                craftStats[appid] = 0;
            }
            craftStats[appid]++;
            await BoosterCrafter.configSave();

            craftLoaderProgressElem.innerHTML = ++progressCounter;
            BoosterCrafter.data.craftQueue.pop();
        }

        BoosterCrafter.updateBoosterCost();
    },

    openerListAddListener: function() {
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list.querySelector('.userscript-config-list-entries');
        for(let selectedElem of BoosterCrafter.shortcuts.lists.inventory.list.querySelectorAll('.selected')) {
            let appid = selectedElem.dataset.appid;
            if(BoosterCrafter.data.openerList[appid]) {
                continue;
            }

            let qtyTradable = parseInt(selectedElem.dataset.qtyTradable);
            let qtyNontradable = parseInt(selectedElem.dataset.qtyNontradable);
            let name = selectedElem.title;
            BoosterCrafter.data.openerList[appid] = {
                qtyTradable: qtyTradable,
                maxTradable: qtyTradable,
                qtyNontradable: qtyNontradable,
                maxNontradable: qtyNontradable,
                name: name
            };

            // let openerEntryHTMLString = `<div class="userscript-config-list-entry booster" data-appid="${appid}" data-qty-tradable="${qtyTradable}" data-qty-nontradable="${qtyNontradable}" title="${name}">`
            // +    `<img src="https://community.cloudflare.steamstatic.com/economy/boosterpack/${appid}?l=english&single=1&v=2&size=75x" alt="">` // TODO: change language dynamically?
            // + '</div>';
            openerListElem.insertAdjacentHTML('beforeend', BoosterCrafter.generateBoosterListEntry({ appid: appid, tradableCount: qtyTradable, nontradableCount: qtyNontradable, name: name }));

            selectedElem.classList.remove('selected');
        }
    },
    openerListIncrementListener: function() {
        BoosterCrafter.openerListChangeValue(1);
    },
    openerListDecrementListener: function() {
        BoosterCrafter.openerListChangeValue(-1);
    },
    openerListChangeValue: function(value) {
        if(typeof value !== 'number') {
            return;
        }

        for(let selectedElem of BoosterCrafter.shortcuts.lists.opener.list.querySelectorAll('.selected')) {
            let appid = selectedElem.dataset.appid;
            if(!BoosterCrafter.data.openerList[appid]) {
                console.warn('BoosterCrafter.openerListIncrementListener(): invalid appid somehow, something is wrong!');
                continue;
            }

            let dataEntry = BoosterCrafter.data.openerList[appid];

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
    },
    openerListOpenListener: function() {
        let selectedEntries = BoosterCrafter.shortcuts.lists.opener.list.querySelectorAll('.selected');
        if(!selectedEntries.length) {
            selectedEntries = BoosterCrafter.shortcuts.lists.opener.list.querySelectorAll('.userscript-config-list-entry');
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

        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        BoosterCrafter.shortcuts.addOpenerButton.disabled = true;
        openerActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(openerListElem, true, 'dialog');
    },
    openerListOpenCancelListener: function() {
        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        BoosterCrafter.shortcuts.addOpenerButton.disabled = false;
        openerActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(openerListElem, false);
    },
    openerListOpenConfirmListener: async function() {
        const tallyOpenerBoosters = () => {
            let total = 0;
            for(let appid in BoosterCrafter.data.openerList) {
                let entry = BoosterCrafter.data.openerList[appid];
                total += entry.qtyTradable + entry.qtyNontradable;
            }
            return total;
        };

        let openerLoaderProgressElem = document.getElementById('opener-list-progress');
        let craftActionElem = BoosterCrafter.shortcuts.lists.craft.action;
        let craftListElem = BoosterCrafter.shortcuts.lists.craft.list;
        let openerActionElem = BoosterCrafter.shortcuts.lists.opener.action;
        let openerListElem = BoosterCrafter.shortcuts.lists.opener.list;

        openerLoaderProgressElem.innerHTML = '0';
        document.getElementById('opener-list-progress-total').innerHTML = tallyOpenerBoosters();
        BoosterCrafter.setOverlay(BoosterCrafter.shortcuts.gooStatus, false);
        BoosterCrafter.shortcuts.unpackTradableGooButton.disabled = true;
        BoosterCrafter.shortcuts.unpackNontradableGooButton.disabled = true;
        BoosterCrafter.shortcuts.SelectorAddCraftButton.disabled = false;
        BoosterCrafter.shortcuts.addCraftButton.disabled = false;
        craftActionElem.classList.add('disabled');
        BoosterCrafter.setOverlay(craftListElem, false);
        BoosterCrafter.setOverlay(openerListElem, true, 'loading');

        console.log(BoosterCrafter.data);
        await BoosterCrafter.openBoosters();


        if(document.getElementById('goostatus-sack-tradable').textContent !== '0') {
            BoosterCrafter.shortcuts.unpackTradableGooButton.disabled = false;
        }
        if(document.getElementById('goostatus-sack-nontradable').textContent !== '0') {
            BoosterCrafter.shortcuts.unpackNontradableGooButton.disabled = false;
        }
        craftActionElem.classList.remove('disabled');
        BoosterCrafter.shortcuts.addOpenerButton.disabled = false;
        openerActionElem.classList.remove('disabled');
        BoosterCrafter.setOverlay(openerListElem, false);
    },
    openBoosters: async function() {
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
            //         {
            //             "image": "url-addr-str",
            //             "name": "string",
            //             "series": 1,
            //             "foil": boolean
            //         },
            //         {
            //             "image": "url-addr-str",
            //             "name": "string",
            //             "series": 1,
            //             "foil": boolean
            //         },
            //         {
            //             "image": "url-addr-str",
            //             "name": "string",
            //             "series": 1,
            //             "foil": boolean
            //         }
            //     ]
            // };

            if(responseData.success !== 1) {
                throw 'BoosterCrafter.openBoosters(): error opening booster!';
            }

            for(let cardData of responseData.rgItems) {
                let imgUrl = cardData.image.replace(/https:\/\/community\.[^.]+\.steamstatic\.com\/economy\/image\//g, '');
                currentDropStats[appid][imgUrl] ??= { imgUrl: imgUrl, name: cardData.name, foil: cardData.foil, count: 0 };
                currentDropStats[appid][imgUrl].count++;
                dropStats[appid][imgUrl] ??= { imgUrl: imgUrl, name: cardData.name, foil: cardData.foil, count: 0 };
                dropStats[appid][imgUrl].count++;


                let cardElem = BoosterCrafter.shortcuts.lists.card.list.querySelector(`[data-img-url="${imgUrl}"]`);
                if(cardElem) {
                    cardElem.dataset.qty = currentDropStats[appid][imgUrl].count;
                } else {
                    let HTMLString = BoosterCrafter.generateCardListEntry({ appid: appid, imgUrl: imgUrl, qty: 1, foil: cardData.foil, name: cardData.name });

                    let firstElem = BoosterCrafter.shortcuts.lists.card.list.querySelector(`[data-appid="${appid}"]`);
                    if(firstElem) {
                        firstElem.insertAdjacentHTML('beforebegin', HTMLString);
                    } else {
                        let entriesElem = BoosterCrafter.shortcuts.lists.card.list.querySelector(`.userscript-config-list-entries`);
                        entriesElem.insertAdjacentHTML('beforeend', HTMLString);
                    }
                }

                if(cardData.foil) {
                    BoosterCrafter.shortcuts.foilCardCount.innerHTML = parseInt(BoosterCrafter.shortcuts.foilCardCount.innerHTML) + 1;
                } else {
                    BoosterCrafter.shortcuts.normalCardCount.innerHTML = parseInt(BoosterCrafter.shortcuts.normalCardCount.innerHTML) + 1;
                }
            }
        }

        let currentDropStats = BoosterCrafter.data.currentDropStats;
        let dropStats = globalSettings.boosterCrafter.stats.drops;
        let openerLoaderProgressElem = document.getElementById('opener-list-progress');
        let progressCounter = 0;
        let selectedEntries = BoosterCrafter.shortcuts.lists.opener.list.querySelectorAll('.selected');
        if(!selectedEntries.length) {
            selectedEntries = BoosterCrafter.shortcuts.lists.opener.list.querySelectorAll('.userscript-config-list-entry');
        }

        let requestBody = new URLSearchParams({
            sessionid: steamToolsUtils.getSessionId()
        });
        let urlString = `https://steamcommunity.com/profiles/${steamToolsUtils.getMySteamId()}/ajaxunpackbooster/`;

        for(let entryElem of selectedEntries) {
            let appid = entryElem.dataset.appid;
            let invElem = BoosterCrafter.shortcuts.lists.inventory.list.querySelector(`[data-appid="${appid}"]`);
            let boosterListEntry = BoosterCrafter.data.boosters[appid];
            let openerListEntry = BoosterCrafter.data.openerList[appid];
            let { qtyTradable, qtyNontradable } = openerListEntry;
            currentDropStats[appid] ??= {};
            dropStats[appid] ??= {};

            for(let i=0; i<qtyTradable; ++i) {
                if(boosterListEntry.tradables.length === 0) {
                    throw 'BoosterCrafter.openBoosters(): No boosters left in the list!';
                }

                let asset = boosterListEntry.tradables[boosterListEntry.tradables.length - 1];

                await openBooster(appid, asset.assetid);
                openerListEntry.qtyTradable--;
                openerListEntry.maxTradable--;
                entryElem.dataset.qtyTradable = openerListEntry.qtyTradable;
                invElem.dataset.qtyTradable = openerListEntry.maxTradable;
                await BoosterCrafter.configSave();
                openerLoaderProgressElem.innerHTML = ++progressCounter;

                boosterListEntry.count--;
                boosterListEntry.tradableCount--;
                boosterListEntry.tradables.pop();
            }

            for(let i=0; i<qtyNontradable; ++i) {
                if(boosterListEntry.nontradables.length === 0) {
                    throw 'BoosterCrafter.openBoosters(): No boosters left in the list!';
                }

                let asset = boosterListEntry.nontradables[boosterListEntry.nontradables.length - 1];

                await openBooster(appid, asset.assetid);
                openerListEntry.qtyNontradable--;
                openerListEntry.maxNontradable--;
                entryElem.dataset.qtyNontradable = openerListEntry.qtyNontradable;
                invElem.dataset.qtyNontradable = openerListEntry.maxNontradable;
                await BoosterCrafter.configSave();
                openerLoaderProgressElem.innerHTML = ++progressCounter;

                boosterListEntry.count--;
                boosterListEntry.nontradableCount--;
                boosterListEntry.nontradables.pop();
            }

            if(!openerListEntry.maxTradable && !openerListEntry.maxNontradable) {
                delete BoosterCrafter.data.openerList[appid];
                entryElem.remove();
                invElem.remove();
            }
        }
    },

    setOverlay: function(overlayContainerElem, overlayEnable, overlayState) {
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
                        console.warn('BoosterCrafter.setOverlay(): Multiple overlay elements detected on same parent!');
                    }
                    overlayElem = containerChildElem;
                }
            }

            if(!overlayElem) {
                console.warn('BoosterCrafter.setOverlay(): No overlay element found in immediate children!');
                return;
            }

            overlayElem.className = 'userscript-overlay ' + overlayState;
        }
    },
    // include language params?
    generateBoosterListEntry: function(params) {
        if(!Object.hasOwn(params, 'appid')) {
            console.error('BoosterCrafter.generateBoosterListEntry(): Appid not provided!');
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
    },
    generateCardListEntry: function(params) {
        if(!Object.hasOwn(params, 'imgUrl')) {
            console.error('BoosterCrafter.generateCardListEntry(): img url string not provided!');
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
    },

    configSave: async function() {
        await SteamToolsDbManager.setToolConfig('boosterCrafter');
    },
    configLoad: async function() {
        let config = await SteamToolsDbManager.getToolConfig('boosterCrafter');
        if(config.boosterCrafter) {
            globalSettings.boosterCrafter = config.boosterCrafter;
            BoosterCrafter.loadConfig();
        }
    },

    configImportListener: async function() {
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
            throw 'BoosterCrafter.configImportListener(): Invalid imported config!';
        }

        globalSettings.boosterCrafter = importedConfig;
        BoosterCrafter.loadConfig();
        BoosterCrafter.configSave();
    },
    configExportListener: async function() {
        exportConfig('boosterCrafter', 'SteamBoosterCrafterConfig');
    },

    parseCooldownDate: function(dateString) {
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
};
